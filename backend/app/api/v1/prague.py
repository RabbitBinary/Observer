from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
import httpx
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.core.config import settings
from app.core.database import get_db
from app.models.transit import PragueStop

router = APIRouter()

GOLEMIO_VEHICLES_URL = "https://api.golemio.cz/v2/vehiclepositions"
GOLEMIO_STOPS_URL = "https://api.golemio.cz/v2/gtfs/stops"

# Cache pre reálne polohy
vehicle_cache: list[dict] = []
last_fetch = 0.0

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
    for v in vals:
        if v is not None and v != "":
            return v
    return None


def build_vehicle_id(trip: dict, gtfs: dict) -> str | None:
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
        if offset > 8000:
            break
    return all_features


@router.get("/vehicles")
async def get_vehicles():
    """Vráti reálne GPS polohy MHD vozidiel v Prahe z Golemio API v2"""
    import time
    global vehicle_cache, last_fetch

    now = time.time()
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
                if vehicle_id in seen_ids:
                    vehicle_id = f"{vehicle_id}_{len(vehicles)}"
                seen_ids.add(vehicle_id)

                route_type = normalize_route_type(
                    _first(gtfs.get("route_type"), trip.get("route_type"))
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
            print(f"Prague vehicles updated: {len(vehicles)}")
            return JSONResponse(vehicles)

    except Exception as e:
        print(f"Prague error: {e}")
        if vehicle_cache:
            return JSONResponse(vehicle_cache)
        return JSONResponse({"error": str(e)}, status_code=500)


@router.post("/stops/import")
async def import_stops(db: Session = Depends(get_db)):
    """
    Jednorazový import pražských zastávok z Golemio /v2/gtfs/stops do DB.
    Zastávky sú statické dáta, takže ich stačí importovať raz (a občas obnoviť).
    """
    headers = {
        "X-Access-Token": settings.GOLEMIO_API_KEY,
        "Accept": "application/json",
    }
    try:
        # Zmaž staré
        db.execute(text("DELETE FROM prague_stops"))
        db.commit()

        total = 0
        offset = 0
        page_size = 10000  # Golemio dovoľuje až 10000 na request
        seen: set[str] = set()

        async with httpx.AsyncClient(timeout=60) as client:
            while True:
                res = await client.get(
                    f"{GOLEMIO_STOPS_URL}?limit={page_size}&offset={offset}",
                    headers=headers,
                )
                if res.status_code != 200:
                    if offset == 0:
                        return JSONResponse(
                            {"error": f"Golemio API error: {res.status_code}"},
                            status_code=502,
                        )
                    break

                data = res.json()
                features = data.get("features", [])
                if not features:
                    break

                batch = []
                for f in features:
                    props = f.get("properties", {}) or {}
                    geom = f.get("geometry", {}) or {}
                    coords = geom.get("coordinates", []) or []

                    stop_id = _first(props.get("stop_id"), props.get("id"))
                    if stop_id is None or stop_id in seen:
                        continue

                    # Súradnice: najprv z geometry (lon, lat), inak z properties
                    if len(coords) >= 2 and coords[0] is not None:
                        lon, lat = coords[0], coords[1]
                    else:
                        lat = props.get("stop_lat")
                        lon = props.get("stop_lon")
                    if lat is None or lon is None:
                        continue

                    seen.add(stop_id)
                    batch.append(
                        PragueStop(
                            stop_id=str(stop_id),
                            stop_name=props.get("stop_name", ""),
                            stop_lat=float(lat),
                            stop_lon=float(lon),
                        )
                    )

                if batch:
                    db.bulk_save_objects(batch)
                    db.commit()
                    total += len(batch)

                # ak prišlo menej než page_size, je koniec
                if len(features) < page_size:
                    break
                offset += page_size

        print(f"Prague stops imported: {total}")
        return {"status": "ok", "imported": total}

    except Exception as e:
        print(f"Prague stops import error: {e}")
        return JSONResponse({"error": str(e)}, status_code=500)


@router.get("/stops")
def get_stops(db: Session = Depends(get_db)):
    """Vráti pražské zastávky z DB."""
    stops = db.query(PragueStop).all()
    return JSONResponse(
        [
            {
                "id": s.stop_id,
                "name": s.stop_name,
                "lat": s.stop_lat,
                "lon": s.stop_lon,
            }
            for s in stops
        ]
    )


@router.get("/health")
async def health():
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


@router.get("/stops/count")
def stops_count(db: Session = Depends(get_db)):
    """Pomocný endpoint na overenie, koľko zastávok je v DB."""
    return {"count": db.query(PragueStop).count()}