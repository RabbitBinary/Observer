from sqlalchemy import Column, String, Float, DateTime
from sqlalchemy.sql import func
from app.core.database import Base

class Vessel(Base):
    __tablename__ = "vessels"

    mmsi = Column(String, primary_key=True)
    name = Column(String)
    lat = Column(Float)
    lon = Column(Float)
    speed = Column(Float)
    heading = Column(Float)
    ship_type = Column(String)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())