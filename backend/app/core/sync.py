"""
Zdieľaná logika pre "drž v DB, občas porovnaj s online".

conditional_get() spraví HTTP GET s If-None-Match / If-Modified-Since
podľa toho, čo máme uložené v sync_state. Ak upstream vráti 304 Not Modified,
vrátime None a nič sa neprepisuje. Inak vrátime telo + nové hlavičky.

Funguje so synchrónnou Session (SessionLocal) aj v rámci async tasku –
samotný HTTP request je async (httpx), DB zápis je krátky a synchrónny.
"""
import hashlib
import httpx
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.models.sync_state import SyncState


def _hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def get_state(db: Session, source: str) -> SyncState | None:
    return db.query(SyncState).filter(SyncState.source_name == source).first()


async def conditional_get(
    client: httpx.AsyncClient,
    url: str,
    db: Session,
    source: str,
    extra_headers: dict | None = None,
) -> tuple[str | None, dict]:
    """
    Vráti (telo_alebo_None, info).

    telo == None znamená "nezmenilo sa, použi to, čo už máš v DB".
    info obsahuje etag/last_modified/status pre prípadný zápis stavu.
    """
    state = get_state(db, source)
    headers = dict(extra_headers or {})
    if state:
        if state.etag:
            headers["If-None-Match"] = state.etag
        if state.last_modified:
            headers["If-Modified-Since"] = state.last_modified

    res = await client.get(url, headers=headers, timeout=30)

    if res.status_code == 304:
        return None, {"status": "skipped_not_modified"}

    res.raise_for_status()
    body = res.text

    # Fallback na hash, keď zdroj nedáva validátory
    new_hash = _hash(body)
    if state and state.content_hash == new_hash:
        # Telo je rovnaké aj keď upstream nevrátil 304 – nepíš zbytočne
        return None, {"status": "skipped_same_hash"}

    return body, {
        "status": "ok",
        "etag": res.headers.get("ETag"),
        "last_modified": res.headers.get("Last-Modified"),
        "content_hash": new_hash,
    }


def write_state(
    db: Session,
    source: str,
    info: dict,
    record_count: int | None = None,
) -> None:
    state = get_state(db, source)
    if not state:
        state = SyncState(source_name=source)
        db.add(state)
    state.etag = info.get("etag")
    state.last_modified = info.get("last_modified")
    if info.get("content_hash"):
        state.content_hash = info["content_hash"]
    state.last_status = info.get("status", "ok")
    state.last_synced = datetime.now(timezone.utc)
    if record_count is not None:
        state.record_count = record_count
    db.commit()
