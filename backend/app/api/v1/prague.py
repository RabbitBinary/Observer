from fastapi import APIRouter
from fastapi.responses import JSONResponse
import httpx
from app.core.config import settings

router = APIRouter()

GOLEMIO_VEHICLES_URL = "https://api.golemio.cz/v2/vehiclepositions"

# Cache pre reálne polohy (aktualizuje sa každých 30s)
vehicle_cache: list[dict] = []
last_fetch = 0.0

# Mapovanie textových názvov -> GTFS route_type kódy
ROUTE_TYPE_MAP = {
    "tram": 0,
    "metro": 1,
    "subway": 1,
    "rail": 2,
    "train": 2,
    "suburban_railway": 2,
    "bus": 3,
    "ferry": 4,
    "cablecar": 5,
    "cable_car": 5,
    "gondola": 6,
    "funicular": 7,
    "pedestrian": 7,
    "trolleybus": 11,
    "monorail": 12,
}


def normalize_route_type(raw) -> int:
    """
    Golemio v gtfs.route_type vracia väčšinou číslo (GTFS kód),
    ale niekedy textový názov. Táto funkcia oboje zjednotí na int.
    Fallback je -1 ("Ostatné"), NIE 3 ("Autobus") — aby neznáme
    typy netiekli nesprávne do autobusov.
    """
    if raw is None:
        return -1
    if isinstance(raw, bool):
        return -1
    if isinstance(raw, (int, float)):
        return int(raw)
    s = str(raw).strip()
    if s == "":
        return -1
    if s.lstrip("-").isdigit():
        return int(s)
    return ROUTE_TYPE_MAP.get(s.lower(), -1)


async def _fetch_all_features(client: httpx.AsyncClient, headers: dict) -> list:
    """
    Golemio vracia max 200 vozidiel na request. Postupne stránkujeme
    cez offset, aby sme dostali celý feed (inak entity blikajú,
    lebo pri každom refreshi prídu iné vozidlá).
    """
    all_features: list = []
    offset = 0
    page_size = 200
    while True:
        res = await client.get(
            f"{GOLEMIO_VEHICLES_URL}?limit={page_size}&offset={offset}",
            headers=headers,
        )
        if res.status_code != 200:
            # Ak prvá stránka zlyhá, vyhodíme chybu; inak vrátime čo máme
            if offset == 0:
                raise RuntimeError(f"Golemio API error: {res.status_code}")
            break

        feats = res.json().get("features", [])
        if not feats:
            break

        all_features.extend(feats)
        offset += page_size

        # Poistka proti nekonečnému cyklu
        if offset > 8000:
            break

    return all_features


@router.get("/vehicles")
async def get_vehicles():
    """Vráti reálne GPS polohy MHD vozidiel v Prahe z Golemio API v2"""
    import time
    global vehicle_cache, last_fetch

    now = time.time()
    if now - last_fetch < 30 and vehicle_cache:
        return JSONResponse(vehicle_cache)

    headers = {
        "X-Access-Token": settings.GOLEMIO_API_KEY,
        "Accept": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            features = await _fetch_all_features(client, headers)

            vehicles = []
            for feature in features:
                props = feature.get("properties", {})
                geometry = feature.get("geometry", {})

                if not geometry or not props:
                    continue

                coords = geometry.get("coordinates", [])
                if len(coords) < 2:
                    continue
                lon, lat = coords[0], coords[1]

                # Preskoč nevalidné súradnice
                if lon is None or lat is None:
                    continue

                trip = props.get("trip", {})
                gtfs = trip.get("gtfs", {})
                last_pos = props.get("last_position", {})

                raw_route_type = gtfs.get("route_type", trip.get("route_type"))
                route_type = normalize_route_type(raw_route_type)

                # Unikátne ID: reg. číslo vozidla, alebo fallback z linky+smeru
                reg = trip.get("vehicle_registration_number")
                if reg:
                    vehicle_id = str(reg)
                else:
                    vehicle_id = (
                        f"{gtfs.get('route_short_name', '?')}_"
                        f"{gtfs.get('trip_headsign', '?')}_{len(vehicles)}"
                    )

                speed_raw = last_pos.get("speed")
                vehicles.append(
                    {
                        "id": vehicle_id,
                        "route": gtfs.get("route_short_name", ""),
                        "route_type": route_type,
                        "headsign": gtfs.get("trip_headsign", ""),
                        "lat": lat,
                        "lon": lon,
                        "heading": last_pos.get("bearing", 0) or 0,
                        "speed": speed_raw if speed_raw else 0,
                    }
                )

            vehicle_cache = vehicles
            last_fetch = now
            print(f"Prague vehicles updated: {len(vehicles)}")  # debug log
            return JSONResponse(vehicles)

    except Exception as e:
        print(f"Prague error: {e}")  # debug log
        # Ak máme cache, vráť ju aj keď je stará (lepšie ako nič)
        if vehicle_cache:
            return JSONResponse(vehicle_cache)
        return JSONResponse({"error": str(e)}, status_code=500)


@router.get("/health")
async def health():
    """Otestuje spojenie s Golemio API"""
    headers = {
        "X-Access-Token": settings.GOLEMIO_API_KEY,
        "Accept": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            res = await client.get(f"{GOLEMIO_VEHICLES_URL}?limit=1", headers=headers)
            if res.status_code == 200:
                data = res.json()
                count = len(data.get("features", []))
                return {"status": "ok", "vehicles": count}
            else:
                return {"status": "error", "code": res.status_code}
    except Exception as e:
        return {"status": "error", "message": str(e)}