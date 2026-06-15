import httpx
import time
from fastapi import APIRouter, Depends
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.tle import TleCache
from fastapi.responses import PlainTextResponse, JSONResponse

router = APIRouter()

GROUPS = {
    "stations": "https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=tle",
    "starlink": "https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=tle",
    "military": "https://celestrak.org/NORAD/elements/gp.php?GROUP=military&FORMAT=tle",
    "science": "https://celestrak.org/NORAD/elements/gp.php?GROUP=science&FORMAT=tle",
    "weather": "https://celestrak.org/NORAD/elements/gp.php?GROUP=weather&FORMAT=tle",
    "geo": "https://celestrak.org/NORAD/elements/gp.php?GROUP=geo&FORMAT=tle",
    "gps-ops": "https://celestrak.org/NORAD/elements/gp.php?GROUP=gps-ops&FORMAT=tle",
    "glo-ops": "https://celestrak.org/NORAD/elements/gp.php?GROUP=glo-ops&FORMAT=tle",
    "galileo": "https://celestrak.org/NORAD/elements/gp.php?GROUP=galileo&FORMAT=tle",
    "beidou": "https://celestrak.org/NORAD/elements/gp.php?GROUP=beidou&FORMAT=tle",
    "amateur": "https://celestrak.org/NORAD/elements/gp.php?GROUP=amateur&FORMAT=tle",
    "iridium": "https://celestrak.org/NORAD/elements/gp.php?GROUP=iridium&FORMAT=tle",
    "intelsat": "https://celestrak.org/NORAD/elements/gp.php?GROUP=intelsat&FORMAT=tle",
    "ses": "https://celestrak.org/NORAD/elements/gp.php?GROUP=ses&FORMAT=tle",
    "telesat": "https://celestrak.org/NORAD/elements/gp.php?GROUP=telesat&FORMAT=tle",
    "oneweb": "https://celestrak.org/NORAD/elements/gp.php?GROUP=oneweb&FORMAT=tle",
    "debris": "https://celestrak.org/NORAD/elements/gp.php?GROUP=debris&FORMAT=tle",
}

CACHE_TTL = 7200  # 2 hodiny

@router.get("/tle/{group}")
async def get_tle(group: str, db: Session = Depends(get_db)):
    url = GROUPS.get(group)
    if not url:
        return PlainTextResponse("", status_code=404)

    # Skontroluj DB cache
    cached = db.query(TleCache).filter(TleCache.group_name == group).first()
    now = time.time()

    if cached:
        age = (cached.updated_at.timestamp() if cached.updated_at else 0)
        if now - age < CACHE_TTL:
            return PlainTextResponse(cached.data)

    # Stiahni nové dáta
    try:
        async with httpx.AsyncClient() as client:
            res = await client.get(url, timeout=30)
            if res.status_code == 200:
                if cached:
                    cached.data = res.text
                    cached.updated_at = None
                else:
                    cached = TleCache(group_name=group, data=res.text)
                    db.add(cached)
                db.commit()
                return PlainTextResponse(res.text)
            elif cached:
                return PlainTextResponse(cached.data)
    except Exception as e:
        if cached:
            return PlainTextResponse(cached.data)

    return PlainTextResponse("", status_code=503)

@router.get("/search")
def search_satellites(q: str, db: Session = Depends(get_db)):
    query = q.strip().upper()
    if not query or len(query) < 2:
        return JSONResponse([])

    results = []
    cached_groups = db.query(TleCache).all()
    for cached in cached_groups:
        lines = [l.strip() for l in cached.data.strip().split("\n")]
        for i in range(0, len(lines) - 2, 3):
            name = lines[i]
            line1 = lines[i + 1]
            line2 = lines[i + 2]
            if not line1.startswith("1") or not line2.startswith("2"):
                continue
            if query in name.upper():
                results.append({
                    "name": name,
                    "group": cached.group_name,
                    "line1": line1,
                    "line2": line2,
                })
            if len(results) >= 20:
                break
        if len(results) >= 20:
            break

    return JSONResponse(results)

@router.post("/preload")
async def preload_satellites(db: Session = Depends(get_db)):
    now = time.time()
    loaded = 0
    async with httpx.AsyncClient() as client:
        for group, url in GROUPS.items():
            cached = db.query(TleCache).filter(TleCache.group_name == group).first()
            if cached:
                age = cached.updated_at.timestamp() if cached.updated_at else 0
                if now - age < CACHE_TTL:
                    continue
            try:
                res = await client.get(url, timeout=30)
                if res.status_code == 200:
                    if cached:
                        cached.data = res.text
                        cached.updated_at = None
                    else:
                        cached = TleCache(group_name=group, data=res.text)
                        db.add(cached)
                    db.commit()
                    loaded += 1
            except Exception as e:
                print(f"preload {group} error: {e}")
    return {"status": "ok", "loaded": loaded}