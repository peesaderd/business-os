#!/usr/bin/env python3
"""
Order Database — SQLite for order management
"""

import sqlite3
import json
from datetime import datetime
from pathlib import Path

DB_PATH = Path(__file__).parent / "orders.db"


def get_db():
    """Get database connection."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Initialize database tables."""
    conn = get_db()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id TEXT UNIQUE NOT NULL,
            customer_id TEXT,
            customer_name TEXT,
            amount REAL NOT NULL,
            status TEXT DEFAULT 'pending',
            slip_data TEXT,
            verified_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS slip_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id TEXT,
            user_id TEXT,
            slip_image TEXT,
            qr_data TEXT,
            ocr_data TEXT,
            verification_score REAL,
            verification_status TEXT,
            action TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (order_id) REFERENCES orders(order_id)
        )
    """)
    conn.commit()
    conn.close()


def create_order(order_id: str, customer_id: str, amount: float, customer_name: str = None) -> dict:
    """Create a new order."""
    conn = get_db()
    try:
        conn.execute(
            "INSERT INTO orders (order_id, customer_id, customer_name, amount) VALUES (?, ?, ?, ?)",
            (order_id, customer_id, customer_name, amount)
        )
        conn.commit()
        return {"status": "created", "order_id": order_id}
    except sqlite3.IntegrityError:
        return {"status": "exists", "order_id": order_id}
    finally:
        conn.close()


def get_order(order_id: str) -> dict:
    """Get order by ID."""
    conn = get_db()
    row = conn.execute("SELECT * FROM orders WHERE order_id = ?", (order_id,)).fetchone()
    conn.close()
    if row:
        return dict(row)
    return None


def update_order_status(order_id: str, status: str, slip_data: dict = None) -> bool:
    """Update order status."""
    conn = get_db()
    try:
        slip_json = json.dumps(slip_data, ensure_ascii=False) if slip_data else None
        conn.execute(
            "UPDATE orders SET status = ?, slip_data = ?, verified_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE order_id = ?",
            (status, slip_json, order_id)
        )
        conn.commit()
        return conn.total_changes > 0
    finally:
        conn.close()


def log_slip(order_id: str, user_id: str, slip_image: str, qr_data: dict, ocr_data: dict, 
             verification_score: float, verification_status: str, action: str) -> None:
    """Log slip verification attempt."""
    conn = get_db()
    try:
        conn.execute(
            """INSERT INTO slip_logs 
               (order_id, user_id, slip_image, qr_data, ocr_data, verification_score, verification_status, action) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (order_id, user_id, slip_image, 
             json.dumps(qr_data, ensure_ascii=False) if qr_data else None,
             json.dumps(ocr_data, ensure_ascii=False) if ocr_data else None,
             verification_score, verification_status, action)
        )
        conn.commit()
    finally:
        conn.close()


def get_pending_orders() -> list:
    """Get all pending orders."""
    conn = get_db()
    rows = conn.execute("SELECT * FROM orders WHERE status = 'pending' ORDER BY created_at DESC").fetchall()
    conn.close()
    return [dict(row) for row in rows]


def get_order_stats() -> dict:
    """Get order statistics."""
    conn = get_db()
    stats = {}
    stats["total"] = conn.execute("SELECT COUNT(*) FROM orders").fetchone()[0]
    stats["pending"] = conn.execute("SELECT COUNT(*) FROM orders WHERE status = 'pending'").fetchone()[0]
    stats["paid"] = conn.execute("SELECT COUNT(*) FROM orders WHERE status = 'paid'").fetchone()[0]
    stats["verified"] = conn.execute("SELECT COUNT(*) FROM orders WHERE status = 'verified'").fetchone()[0]
    stats["flagged"] = conn.execute("SELECT COUNT(*) FROM orders WHERE status = 'flagged'").fetchone()[0]
    conn.close()
    return stats


# Initialize on import
init_db()
