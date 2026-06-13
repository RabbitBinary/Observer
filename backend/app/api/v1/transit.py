import io
import csv
import zipfile
import requests
from datetime import datetime
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.core.database import get_db
from app.models.transit import (
    Stop,
    Route,
    Trip,
    StopTime,
    Shape,
    Calendar,
    CalendarDate,
)

router = APIRouter()

GTFS_URL = "https://www.arcgis.com/sharing/rest/content/items/aba12fd2cbac4843bc7406151bc66106/data"

WEEKDAY_COLUMNS = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
]


def parse_time(time_str: str) -> int:
    """HH:MM:SS -> sekundy od polnoci (zvláda aj časy > 24h)."""
    parts = time_str.strip().split(":")
    return int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])


def current_seconds() -> int:
    now = datetime.now()
    return now.hour * 3600 + now.minute * 60 + now.second


def _int(val, default=0) -> int:
    try:
        return int(str(val).strip())
    except (ValueError, TypeError, AttributeError):
        return default


def get_active_service_ids(db: Session, day: datetime | None = None) -> set[str]:
    """
    Vráti množinu service_id, ktoré dnes (alebo v zadaný deň) reálne premávajú.
    Kombinuje calendar.txt (deň v týždni + rozsah) s calendar_dates.txt (výnimky).
    Ak calendar dáta chýbajú, vráti prázdnu množinu -> volajúci to ošetrí fallbackom.

    Tolerancia dátumu: ak na presný dnešný dátum nesadne ŽIADNA služba
    (napr. nahraný balík platí až od budúceho termínu), spravíme druhý
    pokus, kde ignorujeme dátumový rozsah a berieme len deň v týždni.
    Tým appka funguje aj s budúcim/mierne neaktuálnym GTFS balíkom.
    """
    if day is None:
        day = datetime.now()

    date_str = day.strftime("%Y%m%d")
    weekday_col = WEEKDAY_COLUMNS[day.weekday()]  # Monday=0 .. Sunday=6

    cal_rows = db.query(Calendar).all()

    def collect(respect_date_range: bool) -> set[str]:
        result: set[str] = set()
        for c in cal_rows:
            runs_today = getattr(c, weekday_col, 0) == 1
            if not runs_today:
                continue
            if respect_date_range:
                if c.start_date and date_str < c.start_date:
                    continue
                if c.end_date and date_str > c.end_date:
                    continue
            result.add(c.service_id)
        return result

    # 1) Najprv skús presné porovnanie s dátumovým rozsahom
    active = collect(respect_date_range=True)

    # 1b) Fallback: ak nič nesadlo, ignoruj rozsah, ber len deň v týždni
    used_fallback = False
    if not active:
        active = collect(respect_date_range=False)
        used_fallback = True

    # 2) Výnimky z calendar_dates.txt pre dnešný dátum
    #    (pri fallbacku ich neaplikujeme — dátumy by aj tak nesadli)
    if not used_fallback:
        exc_rows = (
            db.query(CalendarDate).filter(CalendarDate.date == date_str).all()
        )
        for e in exc_rows:
            if e.exception_type == 1:      # mimoriadne PRIDANÁ
                active.add(e.service_id)
            elif e.exception_type == 2:    # mimoriadne ODOBRANÁ
                active.discard(e.service_id)

    return active


@router.post("/import")
def import_gtfs(db: Session = Depends(get_db)):
    """Stiahne a importuje GTFS dáta do DB."""
    try:
        print("Sťahujem GTFS...")
        res = requests.get(GTFS_URL, timeout=60)
        zf = zipfile.ZipFile(io.BytesIO(res.content))
        names = zf.namelist()

        # Zmaž staré dáta (vrátane nových tabuliek)
        db.execute(text("DELETE FROM stop_times"))
        db.execute(text("DELETE FROM shapes"))
        db.execute(text("DELETE FROM calendar_dates"))
        db.execute(text("DELETE FROM calendar"))
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
                        route_type=_int(row.get("route_type", 3), 3),
                    )
                )
        db.commit()

        # Calendar (pravidelné služby) — nemusí existovať
        if "calendar.txt" in names:
            print("Importujem calendar...")
            with zf.open("calendar.txt") as f:
                reader = csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig"))
                for row in reader:
                    db.add(
                        Calendar(
                            service_id=row["service_id"],
                            monday=_int(row.get("monday")),
                            tuesday=_int(row.get("tuesday")),
                            wednesday=_int(row.get("wednesday")),
                            thursday=_int(row.get("thursday")),
                            friday=_int(row.get("friday")),
                            saturday=_int(row.get("saturday")),
                            sunday=_int(row.get("sunday")),
                            start_date=row.get("start_date", ""),
                            end_date=row.get("end_date", ""),
                        )
                    )
            db.commit()
        else:
            print("calendar.txt chýba — preskakujem")

        # Calendar dates (výnimky) — nemusí existovať
        if "calendar_dates.txt" in names:
            print("Importujem calendar_dates...")
            batch = []
            with zf.open("calendar_dates.txt") as f:
                reader = csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig"))
                for i, row in enumerate(reader):
                    batch.append(
                        CalendarDate(
                            service_id=row["service_id"],
                            date=row.get("date", ""),
                            exception_type=_int(row.get("exception_type")),
                        )
                    )
                    if i % 10000 == 0:
                        db.bulk_save_objects(batch)
                        db.commit()
                        batch = []
            if batch:
                db.bulk_save_objects(batch)
                db.commit()
        else:
            print("calendar_dates.txt chýba — preskakujem")

        # Trips (teraz aj so service_id)
        print("Importujem trips...")
        with zf.open("trips.txt") as f:
            reader = csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig"))
            for row in reader:
                db.add(
                    Trip(
                        trip_id=row["trip_id"],
                        route_id=row["route_id"],
                        service_id=row.get("service_id"),
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
        if "shapes.txt" in names:
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
    """Vráti zoznam liniek ktoré zastavujú na danej zastávke."""
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

    # Zisti, ktoré služby dnes reálne premávajú
    active_services = get_active_service_ids(db)

    # Základ dotazu — filtruje podľa aktuálneho času (úsek medzi dvomi zastávkami)
    base_sql = """
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

    params = {"now_str": now_str}

    # Ak máme calendar dáta, obmedz na dnes platné služby.
    # (Bez tohto filtra by sa zobrazili všetky dňové varianty naraz.)
    if active_services:
        # SQLite/SQLAlchemy: rozbalíme množinu na pomenované parametre
        placeholders = []
        for i, sid in enumerate(active_services):
            key = f"svc_{i}"
            placeholders.append(f":{key}")
            params[key] = sid
        base_sql += f" AND t.service_id IN ({', '.join(placeholders)})"

    rows = db.execute(text(base_sql), params).fetchall()
    vehicles = []

    for row in rows:
        try:
            dep = parse_time(row.dep_time)
            arr = parse_time(row.arr_time)
            if arr <= dep:
                continue
            progress = (now - dep) / (arr - dep)
            # Lineárna interpolácia medzi dvomi zastávkami
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
def get_vehicles_debug(db: Session = Depends(get_db)):
    now = current_seconds()
    active = get_active_service_ids(db)
    return {
        "current_seconds": now,
        "current_time": f"{now//3600}:{(now%3600)//60:02d}",
        "today": datetime.now().strftime("%Y%m%d"),
        "active_service_count": len(active),
        "active_service_ids": sorted(active)[:50],  # ukážka
    }