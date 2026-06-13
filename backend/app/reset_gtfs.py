"""
Reset GTFS tabuliek pred re-importom.

Prečo: pridali sme stĺpec `service_id` do tabuľky `trips` a nové tabuľky
`calendar` a `calendar_dates`. SQLAlchemy `create_all` vytvára len CHÝBAJÚCE
tabuľky — nepridáva stĺpce do existujúcich. Preto staré GTFS tabuľky zmažeme,
nech sa pri štarte appky (alebo tu) vytvoria nanovo so správnou schémou.

Spustenie z priečinka backend/:
    python -m app.reset_gtfs
"""
from app.core.database import Base, engine
# import modelov, nech sú zaregistrované v Base.metadata
from app.models import transit as _transit  # noqa: F401
from app.models.transit import (
    Stop,
    Route,
    Trip,
    StopTime,
    Shape,
    Calendar,
    CalendarDate,
)

GTFS_TABLES = [
    StopTime.__table__,
    Shape.__table__,
    CalendarDate.__table__,
    Calendar.__table__,
    Trip.__table__,
    Route.__table__,
    Stop.__table__,
]


def main():
    print("Mažem staré GTFS tabuľky...")
    # drop v poradí závislostí (deti pred rodičmi)
    Base.metadata.drop_all(bind=engine, tables=GTFS_TABLES)
    print("Vytváram tabuľky nanovo...")
    Base.metadata.create_all(bind=engine, tables=GTFS_TABLES)
    print("Hotovo. Teraz spusti re-import: POST /api/v1/transit/import")


if __name__ == "__main__":
    main()