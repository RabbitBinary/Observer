from sqlalchemy import Column, String, Float, Integer, Text
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