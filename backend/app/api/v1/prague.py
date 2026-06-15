"""
MHD Praha – polohy vozidiel z Golemio API v2.

ZMENA OPROTI PÔVODNÉMU:
Pôvodne /vehicles pri prázdnej cache SYNCHRÓNNE stránkoval Golemio
(po 200 záznamoch až do 8000), takže prvý užívateľský request čakal
niekoľko sekúnd. Teraz to plní background task `prague_vehicles_background()`
spustený v lifespan (rovnaký vzor ako ais_background pre lode).

Endpoint /vehicles už NIKDY nečaká na Golemio – vráti hotovú cache okamžite.
Statické zastávky ostávajú v DB (PragueStop) tak ako boli.
"""
import asyncio
import time
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
import httpx
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.database import get_db
from app.models.transit import PragueStop

router = APIRouter()

GOLEMIO_VEHICLES_URL = "https://api.golemio.cz/v2/vehiclepositions"
GOLEMIO_STOPS_URL = "https://api.golemio.cz/v2/gtfs/stops"

REFRESH_INTERVAL = 15  # sekúnd medzi obnovami na pozadí

# Cache plnená VÝHRADNE background taskom
vehicle_cache: list[dict] = []
last_fetch = 0.0

ROUTE_TYPE_MAP = {
    "tram": 0, "metro": 1, "subway": 1, "rail": 2, "train": 2,
    "suburban_railway": 2, "bus": 3, "ferry": 4, "cablecar": 5,
    "cable_car": 5, "gondola": 6, "funicular": 7, "pedestrian": 7,
    "trolleybus": 11, "monorail": 12,
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


def _parse_features(features: list) -> list[dict]:
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

        vehicles.append({
            "id": vehicle_id,
            "route": gtfs.get("route_short_name", ""),
            "route_type": route_type,
            "headsign": gtfs.get("trip_headsign", ""),
            "lat": lat,
            "lon": lon,
            "heading": last_pos.get("bearing", 0) or 0,
            "speed": speed_raw if speed_raw else 0,
        })
    return vehicles


async def prague_vehicles_background():
    """
    Beží na pozadí (spúšťa sa v lifespan). Každých REFRESH_INTERVAL sekúnd
    natiahne polohy z Golemia do vehicle_cache. Užívateľské requesty
    nikdy nečakajú na toto sťahovanie.
    """
    global vehicle_cache, last_fetch
    headers = {
        "X-Access-Token": settings.GOLEMIO_API_KEY,
        "Accept": "application/json",
    }
    while True:
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                features = await _fetch_all_features(client, headers)
                vehicle_cache = _parse_features(features)
                last_fetch = time.time()
                print(f"[bg] Prague vehicles updated: {len(vehicle_cache)}")
        except asyncio.CancelledError:
            break
        except Exception as e:
            print(f"[bg] Prague error: {e}")
        await asyncio.sleep(REFRESH_INTERVAL)


@router.get("/vehicles")
async def get_vehicles():
    """Vráti polohy MHD Praha z cache – okamžite, bez čakania na upstream."""
    return JSONResponse(vehicle_cache)


@router.get("/stops")
def get_stops(db: Session = Depends(get_db)):
    stops = db.query(PragueStop).all()
    return JSONResponse([
        {"id": s.stop_id, "name": s.stop_name, "lat": s.stop_lat, "lon": s.stop_lon}
        for s in stops
    ])


@router.get("/health")
async def health():
    return {
        "status": "ok" if vehicle_cache else "warming_up",
        "vehicles": len(vehicle_cache),
        "last_fetch_age_s": round(time.time() - last_fetch, 1) if last_fetch else None,
    }


@router.get("/stops/count")
def stops_count(db: Session = Depends(get_db)):
    return {"count": db.query(PragueStop).count()}