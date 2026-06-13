from sqlalchemy import Column, String, Float, Integer
from app.core.database import Base


class Stop(Base):
    __tablename__ = "stops"
    stop_id = Column(String, primary_key=True)
    stop_name = Column(String)
    stop_lat = Column(Float)
    stop_lon = Column(Float)


class Route(Base):
    __tablename__ = "routes"
    route_id = Column(String, primary_key=True)
    route_short_name = Column(String)
    route_long_name = Column(String)
    route_type = Column(Integer)


class Trip(Base):
    __tablename__ = "trips"
    trip_id = Column(String, primary_key=True)
    route_id = Column(String)
    service_id = Column(String, index=True, nullable=True)
    shape_id = Column(String, nullable=True)
    trip_headsign = Column(String, nullable=True)
    direction_id = Column(Integer, nullable=True)


class StopTime(Base):
    __tablename__ = "stop_times"
    id = Column(Integer, primary_key=True, autoincrement=True)
    trip_id = Column(String, index=True)
    stop_id = Column(String, index=True)
    arrival_time = Column(String)
    departure_time = Column(String)
    stop_sequence = Column(Integer)


class Shape(Base):
    __tablename__ = "shapes"
    id = Column(Integer, primary_key=True, autoincrement=True)
    shape_id = Column(String, index=True)
    shape_pt_lat = Column(Float)
    shape_pt_lon = Column(Float)
    shape_pt_sequence = Column(Integer)


class Calendar(Base):
    __tablename__ = "calendar"
    service_id = Column(String, primary_key=True)
    monday = Column(Integer, default=0)
    tuesday = Column(Integer, default=0)
    wednesday = Column(Integer, default=0)
    thursday = Column(Integer, default=0)
    friday = Column(Integer, default=0)
    saturday = Column(Integer, default=0)
    sunday = Column(Integer, default=0)
    start_date = Column(String)
    end_date = Column(String)


class CalendarDate(Base):
    __tablename__ = "calendar_dates"
    id = Column(Integer, primary_key=True, autoincrement=True)
    service_id = Column(String, index=True)
    date = Column(String, index=True)
    exception_type = Column(Integer)


# NOVÉ: pražské zastávky (z Golemio API, statické dáta v lokálnej DB).
# Oddelená tabuľka, aby sa nemiešali s bratislavskými stops a ich väzbami.
class PragueStop(Base):
    __tablename__ = "prague_stops"
    stop_id = Column(String, primary_key=True)
    stop_name = Column(String)
    stop_lat = Column(Float)
    stop_lon = Column(Float)