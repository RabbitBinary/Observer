from fastapi import APIRouter
from fastapi.responses import JSONResponse
import httpx
from app.core.config import settings

router = APIRouter()

GOLEMIO_VEHICLES_URL = "https://api.golemio.cz/v2/vehiclepositions"

# Cache pre reálne polohy (aktualizuje sa každých 30s)
vehicle_cache: list[dict] = []
last_fetch = 0.0

ROUTE_TYPE_MAP = {
    "metro": 1,
    "tram": 0,
    "bus": 3,
    "trolleybus": 11,
    "ferry": 4,
    "suburban_railway": 2,
    "train": 2,
    "cablecar": 5,
    "pedestrian": 7,
}


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
        async with httpx.AsyncClient(timeout=15) as client:
            # Golemio API v2 vracia max 200 vozidiel na request
            res = await client.get(f"{GOLEMIO_VEHICLES_URL}?limit=200", headers=headers)
            if res.status_code != 200:
                return JSONResponse({"error": f"Golemio API error: {res.status_code}"}, status_code=502)

            data = res.json()
            features = data.get("features", [])
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

                trip = props.get("trip", {})
                gtfs = trip.get("gtfs", {})
                last_pos = props.get("last_position", {})

                route_type_str = gtfs.get("route_type", trip.get("route_type", "bus"))
                route_type = ROUTE_TYPE_MAP.get(str(route_type_str), 3) if isinstance(route_type_str, str) else int(route_type_str)

                # Unikátne ID: kombinácia reg. čísla + linky + smeru
                reg = trip.get("vehicle_registration_number")
                vehicle_id = str(reg) if reg else f"{gtfs.get('route_short_name', '?')}_{gtfs.get('trip_headsign', '?')}_{len(vehicles)}"

                vehicles.append({
                    "id": vehicle_id,
                    "route": gtfs.get("route_short_name", ""),
                    "route_type": route_type,
                    "headsign": gtfs.get("trip_headsign", ""),
                    "lat": lat,
                    "lon": lon,
                    "heading": last_pos.get("bearing", 0),
                    "speed": last_pos.get("speed", 0) if last_pos.get("speed") else 0,
                })

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