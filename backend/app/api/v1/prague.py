from fastapi import APIRouter
from fastapi.responses import JSONResponse
import httpx
from app.core.config import settings

router = APIRouter()

GOLEMIO_VEHICLES_URL = "https://api.golemio.cz/v2/vehiclepositions"

# Cache pre reálne polohy
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
    niekedy textový názov. Zjednotíme na int.
    Fallback -1 ("Ostatné"), NIE 3 ("Autobus").
    """
    if raw is None or isinstance(raw, bool):
        return -1
    if isinstance(raw, (int, float)):
        return int(raw)
    s = str(raw).strip()
    if s == "":
        return -1
    if s.lstrip("-").isdigit():
        return int(s)
    return ROUTE_TYPE_MAP.get(s.lower(), -1)


def _first(*vals):
    """Vráti prvú ne-prázdnu hodnotu."""
    for v in vals:
        if v is not None and v != "":
            return v
    return None


def build_vehicle_id(trip: dict, gtfs: dict) -> str | None:
    """
    Stabilné ID nezávislé od poradia vo feede.
    Priorita: registračné číslo vozidla -> trip_id -> (linka + smer).
    NIKDY nepoužívame index v poli (to spôsobovalo mutáciu ID a blikanie).
    """
    reg = _first(
        trip.get("vehicle_registration_number"),
        trip.get("vehicle_id"),
        gtfs.get("vehicle_id"),
    )
    if reg is not None:
        return f"reg_{reg}"

    trip_id = _first(trip.get("id"), gtfs.get("trip_id"), trip.get("trip_id"))
    if trip_id is not None:
        return f"trip_{trip_id}"

    route = gtfs.get("route_short_name")
    headsign = gtfs.get("trip_headsign")
    if route or headsign:
        return f"rt_{route or '?'}_{headsign or '?'}"

    return None


async def _fetch_all_features(client: httpx.AsyncClient, headers: dict) -> list:
    """
    Golemio vracia max ~200 vozidiel na request. Stránkujeme cez offset,
    aby sme dostali celý feed (inak vozidlá blikajú).
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
            if offset == 0:
                raise RuntimeError(f"Golemio API error: {res.status_code}")
            break
        feats = res.json().get("features", [])
        if not feats:
            break
        all_features.extend(feats)
        offset += page_size
        if offset > 8000:  # poistka
            break
    return all_features


@router.get("/vehicles")
async def get_vehicles():
    """Vráti reálne GPS polohy MHD vozidiel v Prahe z Golemio API v2"""
    import time
    global vehicle_cache, last_fetch

    now = time.time()
    # cache 15s — chráni Golemio limit, no drží dáta čerstvé
    if now - last_fetch < 15 and vehicle_cache:
        return JSONResponse(vehicle_cache)

    headers = {
        "X-Access-Token": settings.GOLEMIO_API_KEY,
        "Accept": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            features = await _fetch_all_features(client, headers)

            vehicles = []
            seen_ids: set[str] = set()

            for feature in features:
                props = feature.get("properties", {})
                geometry = feature.get("geometry", {})
                if not geometry or not props:
                    continue

                coords = geometry.get("coordinates", [])
                if len(coords) < 2:
                    continue
                lon, lat = coords[0], coords[1]
                if lon is None or lat is None:
                    continue

                trip = props.get("trip", {}) or {}
                gtfs = trip.get("gtfs", {}) or {}
                last_pos = props.get("last_position", {}) or {}

                vehicle_id = build_vehicle_id(trip, gtfs)
                if vehicle_id is None:
                    continue
                # ak by sa ID predsa zopakovalo, sprav ho unikátnym
                if vehicle_id in seen_ids:
                    vehicle_id = f"{vehicle_id}_{len(vehicles)}"
                seen_ids.add(vehicle_id)

                route_type = normalize_route_type(
                    _first(gtfs.get("route_type"), trip.get("route_type"))
                )

                speed_raw = last_pos.get("speed")
                # timestamp poslednej polohy (kvôli interpolácii na FE)
                ts = _first(
                    last_pos.get("origin_timestamp"),
                    last_pos.get("last_stop", {}).get("departure_timestamp")
                    if isinstance(last_pos.get("last_stop"), dict)
                    else None,
                    props.get("last_position", {}).get("tracking_at"),
                )

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
                        "timestamp": ts,  # ISO string alebo None
                    }
                )

            vehicle_cache = vehicles
            last_fetch = now
            print(f"Prague vehicles updated: {len(vehicles)}")
            return JSONResponse(vehicles)

    except Exception as e:
        print(f"Prague error: {e}")
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
            return {"status": "error", "code": res.status_code}
    except Exception as e:
        return {"status": "error", "message": str(e)}