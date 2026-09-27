"""The switch's own records (SQLite). It keeps its own books, separate from any participant."""

import sqlite3
import threading
from contextlib import contextmanager
from pathlib import Path

from app.config import get_settings

_lock = threading.Lock()

SCHEMA = """
CREATE TABLE IF NOT EXISTS transfers (
    session_id      TEXT PRIMARY KEY,
    reference       TEXT NOT NULL UNIQUE,
    direction       TEXT NOT NULL,             -- outbound (from the platform) | inbound (to the platform)
    from_bank       TEXT NOT NULL,
    from_account    TEXT NOT NULL,
    from_name       TEXT NOT NULL,
    to_bank         TEXT NOT NULL,
    to_account      TEXT NOT NULL,
    to_name         TEXT NOT NULL,
    amount_minor    INTEGER NOT NULL,
    narration       TEXT,
    status          TEXT NOT NULL,             -- pending | successful | failed | reversed
    final_status    TEXT,                      -- what a pending transfer will become
    resolve_at      REAL,                      -- when a pending transfer resolves (epoch s)
    reverse_at      REAL,                      -- when a successful transfer is reversed (epoch s)
    notify_pending  INTEGER NOT NULL DEFAULT 0,-- 1 = a status webhook still needs delivering
    created_at      REAL NOT NULL,
    updated_at      REAL NOT NULL
);
"""


def _connect() -> sqlite3.Connection:
    path = Path(get_settings().database_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


_conn = _connect()
_conn.executescript(SCHEMA)


@contextmanager
def tx():
    """Serialised read-modify-write on the switch's records."""
    with _lock:
        try:
            yield _conn
            _conn.commit()
        except Exception:
            _conn.rollback()
            raise


def reset() -> None:
    with tx() as db:
        db.execute("DELETE FROM transfers")
