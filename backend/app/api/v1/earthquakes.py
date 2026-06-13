from fastapi import APIRouter
from fastapi.responses import JSONResponse
import httpx

router = APIRouter()

# Predpripravené CDN-cachované USGS feedy: {magnitude}_{period}.geojson
# magnitude: significant | 4.5 | 2.5 | 1.0 | all
# period:    hour | day | week | month
USGS_BASE = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary"
DEFAULT_FEED = "2.5_week"

# jednoduchý in-memory cache
cache: dict[str, list[dict]] = {}
last_fetch: dict[str, float] = {}
CACHE_SECONDS = 300  # 5 min (USGS aktualizuje po minútach)

VALID_MAG = {"significant", "4.5", "2.5", "1.0", "all"}
VALID_PERIOD = {"hour", "day", "week", "month"}


def _validate_feed(feed: str) -> str:
    """Povolí len platné kombinácie, inak fallback na default."""
    parts = feed.split("_")
    if len(parts) != 2:
        return DEFAULT_FEED
    mag, period = parts
    if mag not in VALID_MAG or period not in VALID_PERIOD:
        return DEFAULT_FEED
    return feed


@router.get("/")
async def get_earthquakes(feed: str = DEFAULT_FEED):
    """
    Vráti zoznam zemetrasení z USGS GeoJSON feedu.
    Voliteľný parameter ?feed=2.5_week (magnitude_period).
    """
    import time

    feed = _validate_feed(feed)
    now = time.time()

    # cache hit
    if feed in cache and (now - last_fetch.get(feed, 0)) < CACHE_SECONDS:
        return JSONResponse(cache[feed])

    url = f"{USGS_BASE}/{feed}.geojson"
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            res = await client.get(url)
            if res.status_code != 200:
                # ak máme staršiu cache, vráť ju
                if feed in cache:
                    return JSONResponse(cache[feed])
                return JSONResponse(
                    {"error": f"USGS API error: {res.status_code}"}, status_code=502
                )

            data = res.json()
            features = data.get("features", [])
            quakes = []

            for f in features:
                props = f.get("properties", {}) or {}
                geom = f.get("geometry", {}) or {}
                coords = geom.get("coordinates", []) or []
                if len(coords) < 2 or coords[0] is None or coords[1] is None:
                    continue

                lon = coords[0]
                lat = coords[1]
                depth = coords[2] if len(coords) >= 3 else None

                quakes.append(
                    {
                        "id": f.get("id"),
                        "mag": props.get("mag"),
                        "place": props.get("place", ""),
                        "lat": lat,
                        "lon": lon,
                        "depth": depth,
                        "time": props.get("time"),       # ms epoch
                        "url": props.get("url", ""),
                        "alert": props.get("alert"),      # green/yellow/orange/red/None
                        "tsunami": props.get("tsunami", 0),
                        "magType": props.get("magType", ""),
                    }
                )

            cache[feed] = quakes
            last_fetch[feed] = now
            print(f"USGS earthquakes ({feed}): {len(quakes)}")
            return JSONResponse(quakes)

    except Exception as e:
        print(f"Earthquake fetch error: {e}")
        if feed in cache:
            return JSONResponse(cache[feed])
        return JSONResponse({"error": str(e)}, status_code=500)