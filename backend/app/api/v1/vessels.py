import json
import asyncio
from fastapi import APIRouter
from fastapi.responses import JSONResponse
import websockets
from app.core.config import settings

router = APIRouter()
AIS_URL = "wss://stream.aisstream.io/v0/stream"

vessel_cache: dict = {}

async def ais_background():
    while True:
        try:
            async with websockets.connect(
                AIS_URL,
                max_size=10 * 1024 * 1024,
            ) as ais_ws:
                print("AIS pripojený!")
                await ais_ws.send(json.dumps({
                    "APIKey": settings.AIS_API_KEY,
                    "BoundingBoxes": [[[-90, -180], [90, 180]]],
                    "FilterMessageTypes": ["PositionReport", "ShipStaticData"],
                }))
                async for message in ais_ws:
                    try:
                        text = message.decode() if isinstance(message, bytes) else message
                        msg = json.loads(text)

                        if msg.get("MessageType") == "ShipStaticData":
                            static = msg.get("Message", {}).get("ShipStaticData", {})
                            meta = msg.get("MetaData", {})
                            mmsi = str(meta.get("MMSI", ""))
                            ship_type = static.get("Type", 0)
                            if mmsi and mmsi in vessel_cache:
                                vessel_cache[mmsi]["ship_type"] = str(ship_type)
                            continue

                        if msg.get("MessageType") != "PositionReport":
                            continue

                        pos = msg.get("Message", {}).get("PositionReport", {})
                        meta = msg.get("MetaData", {})
                        mmsi = str(meta.get("MMSI", ""))
                        lat = pos.get("Latitude")
                        lon = pos.get("Longitude")
                        if not mmsi or lat is None or lon is None:
                            continue
                        vessel_cache[mmsi] = {
                            "mmsi": mmsi,
                            "name": meta.get("ShipName", "").strip() or mmsi,
                            "lat": lat,
                            "lon": lon,
                            "speed": pos.get("Sog", 0),
                            "heading": pos.get("TrueHeading", 0),
                            "ship_type": vessel_cache.get(mmsi, {}).get("ship_type", "0"),
                        }
                    except Exception:
                        pass
        except asyncio.CancelledError:
            break
        except Exception as e:
            print(f"AIS error: {e} — reconnecting in 5s")
        await asyncio.sleep(5)

@router.get("/positions")
def get_positions():
    return JSONResponse(list(vessel_cache.values()))

@router.get("/search")
def search_vessels(q: str):
    query = q.strip().upper()
    if not query or len(query) < 2:
        return JSONResponse([])

    results = []
    for v in vessel_cache.values():
        name = (v.get("name") or "").upper()
        mmsi = str(v.get("mmsi") or "")
        if query in name or query in mmsi:
            results.append({
                "mmsi": v.get("mmsi"),
                "name": v.get("name"),
                "lat": v.get("lat"),
                "lon": v.get("lon"),
                "speed": v.get("speed", 0),
                "ship_type": v.get("ship_type", "0"),
            })
        if len(results) >= 20:
            break

    return JSONResponse(results)