from contextlib import asynccontextmanager
import asyncio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.v1 import auth, satellites, vessels
from app.api.v1.vessels import ais_background
from app.core.database import Base, engine
from app.models import user, tle, vessel
from app.api.v1 import auth, satellites, vessels, transit, prague
from app.models import user, tle, vessel, transit as transit_model

Base.metadata.create_all(bind=engine)

@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(ais_background())
    yield
    task.cancel()

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

@app.get("/")
def root():
    return {"status": "ok"}