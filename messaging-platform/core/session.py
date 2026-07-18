"""Session persistence with SQLite."""
import sqlite3
import json
import os
from datetime import datetime, timezone
from typing import Optional

DB_PATH = "data/messaging.db"


class SessionManager:
    """Tracks user sessions and conversation state."""

    def __init__(self, db_path: str = DB_PATH):
        self._db_path = db_path
        os.makedirs(os.path.dirname(db_path) if os.path.dirname(db_path) else ".", exist_ok=True)
        self._init_db()

    def _init_db(self):
        conn = sqlite3.connect(self._db_path)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                channel TEXT NOT NULL,
                channel_user_id TEXT NOT NULL,
                session_data TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (channel, channel_user_id)
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                channel TEXT NOT NULL,
                channel_user_id TEXT NOT NULL,
                display_name TEXT DEFAULT '',
                phone TEXT DEFAULT '',
                first_seen TEXT NOT NULL,
                last_seen TEXT NOT NULL,
                PRIMARY KEY (channel, channel_user_id)
            )
        """)
        conn.commit()
        conn.close()

    def _conn(self):
        return sqlite3.connect(self._db_path)

    def get_session(self, channel: str, user_id: str) -> dict:
        conn = self._conn()
        row = conn.execute(
            "SELECT session_data FROM sessions WHERE channel=? AND channel_user_id=?",
            (channel, user_id)
        ).fetchone()
        conn.close()
        if row:
            return json.loads(row[0])
        return {"intent": None, "cart": [], "context": {}}

    def save_session(self, channel: str, user_id: str, data: dict):
        now = datetime.now(timezone.utc).isoformat()
        conn = self._conn()
        conn.execute("""
            INSERT INTO sessions (channel, channel_user_id, session_data, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(channel, channel_user_id) DO UPDATE SET
                session_data=excluded.session_data,
                updated_at=excluded.updated_at
        """, (channel, user_id, json.dumps(data, ensure_ascii=False), now, now))
        conn.commit()
        conn.close()

    def set_intent(self, channel: str, user_id: str, intent: str | None):
        data = self.get_session(channel, user_id)
        data["intent"] = intent
        self.save_session(channel, user_id, data)

    def get_intent(self, channel: str, user_id: str) -> str | None:
        return self.get_session(channel, user_id).get("intent")

    def get_cart(self, channel: str, user_id: str) -> list[dict]:
        return self.get_session(channel, user_id).get("cart", [])

    def add_to_cart(self, channel: str, user_id: str, item: dict):
        data = self.get_session(channel, user_id)
        cart = data.get("cart", [])
        cart.append(item)
        data["cart"] = cart
        self.save_session(channel, user_id, data)

    def clear_cart(self, channel: str, user_id: str):
        data = self.get_session(channel, user_id)
        data["cart"] = []
        self.save_session(channel, user_id, data)

    def track_user(self, channel: str, user_id: str, display_name: str = ""):
        now = datetime.now(timezone.utc).isoformat()
        conn = self._conn()
        conn.execute("""
            INSERT INTO users (channel, channel_user_id, display_name, first_seen, last_seen)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(channel, channel_user_id) DO UPDATE SET
                display_name=CASE WHEN ?!='' THEN ? ELSE display_name END,
                last_seen=excluded.last_seen
        """, (channel, user_id, display_name, now, now, display_name, display_name))
        conn.commit()
        conn.close()
