from sqlalchemy import Column, String, Integer, DateTime, Text
from sqlalchemy.sql import func
from app.core.database import Base


class SyncState(Base):
    """
    Register synchronizácie pre každý externý zdroj dát.

    Princíp "drž v DB, občas porovnaj s online":
    background tasky pred plným stiahnutím porovnajú etag / content_hash
    proti tomu, čo je tu uložené. Ak sa nič nezmenilo, neťahá sa nič.

    source_name príklady:
      - "tle_starlink", "tle_stations", ...   (satelity, po skupinách)
      - "prague_vehicles"                      (živé MHD Praha)
      - "bratislava_vehicles"                  (živé MHD BA)
      - "prague_stops", "bratislava_stops"     (statické zastávky)
    """
    __tablename__ = "sync_state"

    source_name = Column(String, primary_key=True)
    last_synced = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    # HTTP ETag z upstreamu (ak ho zdroj poskytuje) – pre If-None-Match
    etag = Column(String, nullable=True)
    # Last-Modified hlavička z upstreamu – pre If-Modified-Since
    last_modified = Column(String, nullable=True)
    # SHA-256 obsahu – fallback keď zdroj nepodporuje podmienené requesty
    content_hash = Column(String, nullable=True)
    # Počet záznamov pri poslednom úspešnom syncu (na rýchlu sanity kontrolu)
    record_count = Column(Integer, nullable=True)
    # Posledný stav: "ok" | "skipped_not_modified" | "error: ..."
    last_status = Column(Text, nullable=True)
