import io
import csv
import zipfile
import requests
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.core.database import get_db, SessionLocal
from app.models.transit import Stop, Route, Trip, StopTime, Shape

router = APIRouter()

GTFS_URL = "https://www.arcgis.com/sharing/rest/content/items/aba12fd2cbac4843bc7406151bc66106/data"


def parse_time(time_str: str) -> int:
    """Converts HH:MM:SS to seconds from midnight — handles times > 24h"""
    parts = time_str.strip().split(":")
    return int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])


def current_seconds() -> int:
    now = datetime.now()
    return now.hour * 3600 + now.minute * 60 + now.second


@router.post("/import")
def import_gtfs(db: Session = Depends(get_db)):
    """Stiahne a importuje GTFS dáta do DB"""
    try:
        print("Sťahujem GTFS...")
        res = requests.get(GTFS_URL, timeout=60)
        zf = zipfile.ZipFile(io.BytesIO(res.content))

        # Zmaž staré dáta
        db.execute(text("DELETE FROM stop_times"))
        db.execute(text("DELETE FROM shapes"))
        db.execute(text("DELETE FROM trips"))
        db.execute(text("DELETE FROM routes"))
        db.execute(text("DELETE FROM stops"))
        db.commit()

        # Stops
        print("Importujem stops...")
        with zf.open("stops.txt") as f:
            reader = csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig"))
            for row in reader:
                db.add(
                    Stop(
                        stop_id=row["stop_id"],
                        stop_name=row["stop_name"],
                        stop_lat=float(row["stop_lat"]),
                        stop_lon=float(row["stop_lon"]),
                    )
                )
        db.commit()

        # Routes
        print("Importujem routes...")
        with zf.open("routes.txt") as f:
            reader = csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig"))
            for row in reader:
                db.add(
                    Route(
                        route_id=row["route_id"],
                        route_short_name=row.get("route_short_name", ""),
                        route_long_name=row.get("route_long_name", ""),
                        route_type=int(row.get("route_type", 3)),
                    )
                )
        db.commit()

        # Trips
        print("Importujem trips...")
        with zf.open("trips.txt") as f:
            reader = csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig"))
            for row in reader:
                db.add(
                    Trip(
                        trip_id=row["trip_id"],
                        route_id=row["route_id"],
                        shape_id=row.get("shape_id", None),
                        trip_headsign=row.get("trip_headsign", None),
                        direction_id=(
                            int(row["direction_id"])
                            if row.get("direction_id")
                            else None
                        ),
                    )
                )
        db.commit()

        # Stop times
        print("Importujem stop_times...")
        batch = []
        with zf.open("stop_times.txt") as f:
            reader = csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig"))
            for i, row in enumerate(reader):
                batch.append(
                    StopTime(
                        trip_id=row["trip_id"],
                        stop_id=row["stop_id"],
                        arrival_time=row["arrival_time"],
                        departure_time=row["departure_time"],
                        stop_sequence=int(row["stop_sequence"]),
                    )
                )
                if i % 10000 == 0:
                    db.bulk_save_objects(batch)
                    db.commit()
                    batch = []
                    print(f"  {i} riadkov...")
            if batch:
                db.bulk_save_objects(batch)
                db.commit()

        # Shapes
        if "shapes.txt" in zf.namelist():
            print("Importujem shapes...")
            batch = []
            with zf.open("shapes.txt") as f:
                reader = csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig"))
                for i, row in enumerate(reader):
                    batch.append(
                        Shape(
                            shape_id=row["shape_id"],
                            shape_pt_lat=float(row["shape_pt_lat"]),
                            shape_pt_lon=float(row["shape_pt_lon"]),
                            shape_pt_sequence=int(row["shape_pt_sequence"]),
                        )
                    )
                    if i % 10000 == 0:
                        db.bulk_save_objects(batch)
                        db.commit()
                        batch = []
            if batch:
                db.bulk_save_objects(batch)
                db.commit()

        print("Import hotový!")
        return {"status": "ok"}
    except Exception as e:
        print(f"Chyba: {e}")
        return JSONResponse({"error": str(e)}, status_code=500)


@router.get("/stops/{stop_id}/routes")
def get_stop_routes(stop_id: str, db: Session = Depends(get_db)):
    """Vráti zoznam liniek ktoré zastavujú na danej zastávke"""
    query = text("""
        SELECT DISTINCT r.route_short_name, r.route_type, r.route_long_name
        FROM stop_times st
        JOIN trips t ON st.trip_id = t.trip_id
        JOIN routes r ON t.route_id = r.route_id
        WHERE st.stop_id = :stop_id
        ORDER BY r.route_short_name
    """)
    rows = db.execute(query, {"stop_id": stop_id}).fetchall()
    return JSONResponse([
        {
            "route": row.route_short_name,
            "type": row.route_type,
            "long_name": row.route_long_name,
        }
        for row in rows
    ])


@router.get("/stops")
def get_stops(db: Session = Depends(get_db)):
    stops = db.query(Stop).all()
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


@router.get("/routes")
def get_routes(db: Session = Depends(get_db)):
    routes = db.query(Route).all()
    return JSONResponse(
        [
            {
                "id": r.route_id,
                "name": r.route_short_name,
                "long_name": r.route_long_name,
                "type": r.route_type,
            }
            for r in routes
        ]
    )


@router.get("/vehicles")
def get_vehicles(db: Session = Depends(get_db)):
    now = current_seconds()
    now_str = f"{now//3600:02d}:{(now%3600)//60:02d}:{now%60:02d}"

    query = text(
        """
        SELECT 
            st1.trip_id,
            st1.stop_sequence as seq,
            st1.departure_time as dep_time,
            st2.arrival_time as arr_time,
            s1.stop_lat as from_lat,
            s1.stop_lon as from_lon,
            s2.stop_lat as to_lat,
            s2.stop_lon as to_lon,
            r.route_short_name,
            r.route_type,
            t.trip_headsign,
            t.shape_id
        FROM stop_times st1
        JOIN stop_times st2 ON st1.trip_id = st2.trip_id AND st2.stop_sequence = st1.stop_sequence + 1
        JOIN stops s1 ON st1.stop_id = s1.stop_id
        JOIN stops s2 ON st2.stop_id = s2.stop_id
        JOIN trips t ON st1.trip_id = t.trip_id
        JOIN routes r ON t.route_id = r.route_id
        WHERE st1.departure_time <= :now_str
        AND st2.arrival_time >= :now_str
    """
    )

    rows = db.execute(query, {"now_str": now_str}).fetchall()
    vehicles = []

    for row in rows:
        try:
            dep = parse_time(row.dep_time)
            arr = parse_time(row.arr_time)
            if arr <= dep:
                continue
            progress = (now - dep) / (arr - dep)
            # Jednoduchá lineárna interpolácia medzi dvomi zastávkami
            lat = row.from_lat + (row.to_lat - row.from_lat) * progress
            lon = row.from_lon + (row.to_lon - row.from_lon) * progress
            vehicles.append(
                {
                    "id": f"{row.trip_id}_{row.seq}",
                    "trip_id": row.trip_id,
                    "route": row.route_short_name,
                    "route_type": row.route_type,
                    "headsign": row.trip_headsign or "",
                    "lat": lat,
                    "lon": lon,
                }
            )
        except Exception:
            pass

    return JSONResponse(vehicles)


@router.get("/shapes/{shape_id}")
def get_shape(shape_id: str, db: Session = Depends(get_db)):
    shapes = (
        db.query(Shape)
        .filter(Shape.shape_id == shape_id)
        .order_by(Shape.shape_pt_sequence)
        .all()
    )
    return JSONResponse(
        [
            {
                "lat": s.shape_pt_lat,
                "lon": s.shape_pt_lon,
            }
            for s in shapes
        ]
    )


@router.get("/vehicles/debug")
def get_vehicles_debug():
    now = current_seconds()
    return {"current_seconds": now, "current_time": f"{now//3600}:{(now%3600)//60:02d}"}