from fastapi import APIRouter
from fastapi.responses import JSONResponse
import time
import httpx
from app.core.config import settings

router = APIRouter()

OPENSKY_STATES_URL = "https://opensky-network.org/api/states/all"
OPENSKY_TOKEN_URL = (
    "https://auth.opensky-network.org/auth/realms/opensky-network/"
    "protocol/openid-connect/token"
)

# Bounding boxy
BBOX_EUROPE = {"lamin": 34.0, "lomin": -12.0, "lamax": 72.0, "lomax": 40.0}
# globálne = bez bbox parametrov

# --- OAuth2 token cache ---
_token: str | None = None
_token_expiry: float = 0.0

# --- dáta cache (oddelene pre world a europe) ---
cache: dict[str, list[dict]] = {}
last_fetch: dict[str, float] = {}
CACHE_SECONDS = 12  # nech FE môže ťahať 20s/30s a vždy dostane čerstvé


async def _get_token(client: httpx.AsyncClient) -> str | None:
    """
    Získa (a cachuje) OAuth2 access token cez client credentials flow.
    Token platí 30 min; obnovíme ho ~1 min pred vypršaním.
    Ak nie sú nastavené credentials, vráti None -> ide sa anonymne.
    """
    global _token, _token_expiry

    cid = getattr(settings, "OPENSKY_CLIENT_ID", None)
    csecret = getattr(settings, "OPENSKY_CLIENT_SECRET", None)
    if not cid or not csecret:
        return None  # anonymný režim

    now = time.time()
    if _token and now < _token_expiry - 60:
        return _token

    try:
        res = await client.post(
            OPENSKY_TOKEN_URL,
            data={
                "grant_type": "client_credentials",
                "client_id": cid,
                "client_secret": csecret,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        if res.status_code != 200:
            print(f"OpenSky token error: {res.status_code}")
            return None
        data = res.json()
        _token = data.get("access_token")
        expires_in = data.get("expires_in", 1800)
        _token_expiry = now + float(expires_in)
        return _token
    except Exception as e:
        print(f"OpenSky token exception: {e}")
        return None


def _parse_states(raw_states: list) -> list[dict]:
    """
    OpenSky vracia state vektory ako polia (nie objekty), kvôli šírke pásma.
    Indexy (podľa dokumentácie):
      0 icao24, 1 callsign, 2 origin_country, 3 time_position,
      4 last_contact, 5 longitude, 6 latitude, 7 baro_altitude,
      8 on_ground, 9 velocity, 10 true_track (heading), 11 vertical_rate,
      13 geo_altitude
    """
    out = []
    for s in raw_states or []:
        try:
            icao = s[0]
            lon = s[5]
            lat = s[6]
            if lon is None or lat is None:
                continue
            on_ground = bool(s[8])
            alt = s[13] if len(s) > 13 and s[13] is not None else s[7]
            out.append(
                {
                    "id": icao,
                    "callsign": (s[1] or "").strip(),
                    "country": s[2] or "",
                    "lon": lon,
                    "lat": lat,
                    "altitude": alt,                       # m
                    "velocity": s[9],                      # m/s
                    "heading": s[10] if s[10] is not None else 0,
                    "vertical_rate": s[11] if len(s) > 11 else None,
                    "on_ground": on_ground,
                }
            )
        except (IndexError, TypeError):
            continue
    return out


@router.get("/")
async def get_aircraft(region: str = "world"):
    """
    Vráti lietadlá z OpenSky. ?region=world (default) alebo ?region=europe.
    """
    region = "europe" if region == "europe" else "world"
    now = time.time()

    if region in cache and (now - last_fetch.get(region, 0)) < CACHE_SECONDS:
        return JSONResponse(cache[region])

    params = {}
    if region == "europe":
        params = dict(BBOX_EUROPE)

    try:
        async with httpx.AsyncClient(timeout=25) as client:
            token = await _get_token(client)
            headers = {"Authorization": f"Bearer {token}"} if token else {}

            res = await client.get(OPENSKY_STATES_URL, params=params, headers=headers)

            if res.status_code == 429:
                # rate limit - vráť staršiu cache ak je
                print("OpenSky 429 (rate limit)")
                if region in cache:
                    return JSONResponse(cache[region])
                return JSONResponse({"error": "rate_limited"}, status_code=429)

            if res.status_code != 200:
                if region in cache:
                    return JSONResponse(cache[region])
                return JSONResponse(
                    {"error": f"OpenSky error: {res.status_code}"}, status_code=502
                )

            data = res.json()
            aircraft = _parse_states(data.get("states", []))

            cache[region] = aircraft
            last_fetch[region] = now

            # info o zostávajúcich kreditoch (ak header príde)
            remaining = res.headers.get("X-Rate-Limit-Remaining")
            print(f"OpenSky aircraft ({region}): {len(aircraft)}"
                  + (f", credits left: {remaining}" if remaining else ""))

            return JSONResponse(aircraft)

    except Exception as e:
        print(f"Aircraft fetch error: {e}")
        if region in cache:
            return JSONResponse(cache[region])
        return JSONResponse({"error": str(e)}, status_code=500)