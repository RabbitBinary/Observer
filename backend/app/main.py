from contextlib import asynccontextmanager
import asyncio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.database import Base, engine
from app.api.v1 import auth, satellites, vessels, transit, prague, earthquakes, aircraft
from app.api.v1.vessels import ais_background
from app.api.v1.prague import prague_vehicles_background
# import modelov, nech sú zaregistrované v Base.metadata pred create_all
from app.models import user, tle, vessel, sync_state  # noqa: F401
from app.models import transit as transit_model  # noqa: F401

Base.metadata.create_all(bind=engine)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Background tasky – plnia cache nezávisle od užívateľských requestov
    tasks = [
        asyncio.create_task(ais_background()),
        asyncio.create_task(prague_vehicles_background()),
    ]
    yield
    for t in tasks:
        t.cancel()


app = FastAPI(title="Observer API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(satellites.router, prefix="/api/v1/satellites", tags=["satellites"])
app.include_router(vessels.router, prefix="/api/v1/vessels", tags=["vessels"])
app.include_router(transit.router, prefix="/api/v1/transit", tags=["transit"])
app.include_router(prague.router, prefix="/api/v1/prague", tags=["prague"])
app.include_router(earthquakes.router, prefix="/api/v1/earthquakes", tags=["earthquakes"])
app.include_router(aircraft.router, prefix="/api/v1/aircraft", tags=["aircraft"])

@app.get("/")
def root():
    return {"status": "ok"}