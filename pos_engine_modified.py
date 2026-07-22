"""POS Engine - Mock POS data and business logic for Restaurant POS.

Provides menu items, tables, orders, and payment processing.
All data is in-memory (mock) until Google Sheets integration is active.
"""

import json
import logging
import os
import sqlite3
import time
from datetime import datetime, date
from typing import Any

import httpx

logger = logging.getLogger(__name__)

# ERP Core integration
from erp_client import get_erp_client, MCPError
from field_mapping import pos_to_erp_order, erp_to_pos_order, pos_items_to_erp, erp_items_to_pos, extract_pos_order_id_from_notes
from schema_engine_client import get_schema_engine

# Built from ERP Core categories; fallback if ERP Core unavailable
CATEGORY_MAP = {
    "cat_app": "Appetizer",
    "cat_main": "Main Course",
    "cat_des": "Dessert",
    "cat_bev": "Beverage",
    "cat_side": "Side Dish",
}

def _build_category_map(categories: list[dict]) -> dict[str, str]:
    """Convert ERP Core categories list to id->name mapping."""
    return {c.get("id", c.get("category_id", "")): c.get("name", "") for c in categories if c.get("id") or c.get("category_id")}

# ── Mock Data ─────────────────────────────────────────────────────────────

MENU_CATEGORIES = [
    "Appetizer", "Main Course", "Dessert", "Beverage", "Side Dish"
]

MENU_ITEMS = [
    {"id": "APP001", "name": "Spring Rolls", "category": "Appetizer", "price": 59, "cost": 20, "available": True, "image": "/images/menu/APP001.png"},
    {"id": "APP002", "name": "Tom Yum Soup", "category": "Appetizer", "price": 89, "cost": 35, "available": True, "image": "/images/menu/APP002.png"},
    {"id": "APP003", "name": "Som Tum Thai", "category": "Appetizer", "price": 69, "cost": 25, "available": True, "image": "/images/menu/APP003.png"},
    {"id": "APP004", "name": "Satay Chicken (4 pcs)", "category": "Appetizer", "price": 79, "cost": 30, "available": True, "image": "/images/menu/APP004.png"},
    {"id": "APP005", "name": "Fish Cakes (6 pcs)", "category": "Appetizer", "price": 89, "cost": 35, "available": True, "image": "/images/menu/APP005.png"},
    {"id": "APP006", "name": "Tod Mun Goong", "category": "Appetizer", "price": 99, "cost": 40, "available": True, "image": "/images/menu/APP006.png"},
    {"id": "APP007", "name": "Larb Gai", "category": "Appetizer", "price": 79, "cost": 30, "available": True, "image": "/images/menu/APP007.png"},
    {"id": "APP008", "name": "Miang Kham", "category": "Appetizer", "price": 69, "cost": 25, "available": True, "image": "/images/menu/APP008.png"},
    {"id": "MAIN001", "name": "Pad Thai Goong", "category": "Main Course", "price": 89, "cost": 35, "available": True, "image": "/images/menu/MAIN001.png"},
    {"id": "MAIN002", "name": "Green Curry Chicken", "category": "Main Course", "price": 99, "cost": 40, "available": True, "image": "/images/menu/MAIN002.png"},
    {"id": "MAIN003", "name": "Massaman Curry", "category": "Main Course", "price": 109, "cost": 45, "available": True, "image": "/images/menu/MAIN003.png"},
    {"id": "MAIN004", "name": "Pad Kra Pao Moo", "category": "Main Course", "price": 79, "cost": 30, "available": True, "image": "/images/menu/MAIN004.png"},
    {"id": "MAIN005", "name": "Tom Kha Gai", "category": "Main Course", "price": 99, "cost": 40, "available": True, "image": "/images/menu/MAIN005.png"},
    {"id": "MAIN006", "name": "Pad See Ew", "category": "Main Course", "price": 79, "cost": 30, "available": True, "image": "/images/menu/MAIN006.png"},
    {"id": "MAIN007", "name": "Khao Soi", "category": "Main Course", "price": 89, "cost": 35, "available": True, "image": "/images/menu/MAIN007.png"},
    {"id": "MAIN008", "name": "Panang Curry", "category": "Main Course", "price": 99, "cost": 40, "available": True, "image": "/images/menu/MAIN008.png"},
    {"id": "MAIN009", "name": "Fried Rice Seafood", "category": "Main Course", "price": 109, "cost": 45, "available": True, "image": "/images/menu/MAIN009.png"},
    {"id": "MAIN010", "name": "Stir-fried Basil Seafood", "category": "Main Course", "price": 129, "cost": 55, "available": True, "image": "/images/menu/MAIN010.png"},
    {"id": "MAIN011", "name": "Grilled Pork Neck", "category": "Main Course", "price": 139, "cost": 60, "available": True, "image": "/images/menu/MAIN011.png"},
    {"id": "MAIN012", "name": "Steamed Fish with Lime", "category": "Main Course", "price": 259, "cost": 120, "available": True, "image": "/images/menu/MAIN012.png"},
    {"id": "DES001", "name": "Mango Sticky Rice", "category": "Dessert", "price": 69, "cost": 25, "available": True, "image": "/images/menu/DES001.png"},
    {"id": "DES002", "name": "Thai Roti", "category": "Dessert", "price": 49, "cost": 15, "available": True, "image": "/images/menu/DES002.png"},
    {"id": "DES003", "name": "Ice Cream (Coconut)", "category": "Dessert", "price": 59, "cost": 20, "available": True, "image": "/images/menu/DES003.png"},
    {"id": "DES004", "name": "Khao Tom Mud", "category": "Dessert", "price": 39, "cost": 12, "available": True, "image": "/images/menu/DES004.png"},
    {"id": "DES005", "name": "Lod Chong", "category": "Dessert", "price": 45, "cost": 15, "available": True, "image": "/images/menu/DES005.png"},
    {"id": "DES006", "name": "Bua Loy", "category": "Dessert", "price": 49, "cost": 15, "available": True, "image": "/images/menu/DES006.png"},
    {"id": "BEV001", "name": "Thai Iced Tea", "category": "Beverage", "price": 39, "cost": 10, "available": True, "image": "/images/menu/BEV001.png"},
    {"id": "BEV002", "name": "Thai Iced Coffee", "category": "Beverage", "price": 45, "cost": 12, "available": True, "image": "/images/menu/BEV002.png"},
    {"id": "BEV003", "name": "Coconut Water", "category": "Beverage", "price": 49, "cost": 15, "available": True, "image": "/images/menu/BEV003.png"},
    {"id": "BEV004", "name": "Lemonade", "category": "Beverage", "price": 39, "cost": 10, "available": True, "image": "/images/menu/BEV004.png"},
    {"id": "BEV005", "name": "Soda", "category": "Beverage", "price": 25, "cost": 8, "available": True, "image": "/images/menu/BEV005.png"},
    {"id": "BEV006", "name": "Water", "category": "Beverage", "price": 15, "cost": 5, "available": True, "image": "/images/menu/BEV006.png"},
    {"id": "BEV007", "name": "Singha Beer", "category": "Beverage", "price": 69, "cost": 35, "available": True, "image": "/images/menu/BEV007.png"},
    {"id": "BEV008", "name": "Chang Beer", "category": "Beverage", "price": 59, "cost": 30, "available": True, "image": "/images/menu/BEV008.png"},
    {"id": "BEV009", "name": "Smoothie (Fruit)", "category": "Beverage", "price": 69, "cost": 25, "available": True, "image": "/images/menu/BEV009.png"},
    {"id": "SID001", "name": "Steamed Rice", "category": "Side Dish", "price": 15, "cost": 5, "available": True, "image": "/images/menu/SID001.png"},
    {"id": "SID002", "name": "Sticky Rice", "category": "Side Dish", "price": 15, "cost": 5, "available": True, "image": "/images/menu/SID002.png"},
    {"id": "SID003", "name": "Fried Egg", "category": "Side Dish", "price": 15, "cost": 5, "available": True, "image": "/images/menu/SID003.png"},
    {"id": "SID004", "name": "Extra Veggies", "category": "Side Dish", "price": 25, "cost": 10, "available": True, "image": "/images/menu/SID004.png"},
]

TABLES = [
    {"id": "T01", "name": "Table 1", "capacity": 2, "zone": "Indoor"},
    {"id": "T02", "name": "Table 2", "capacity": 2, "zone": "Indoor"},
    {"id": "T03", "name": "Table 3", "capacity": 4, "zone": "Indoor"},
    {"id": "T04", "name": "Table 4", "capacity": 4, "zone": "Indoor"},
    {"id": "T05", "name": "Table 5", "capacity": 6, "zone": "Indoor"},
    {"id": "T06", "name": "Table 6", "capacity": 6, "zone": "Indoor"},
    {"id": "T07", "name": "Table 7", "capacity": 8, "zone": "Indoor"},
    {"id": "T08", "name": "Table 8", "capacity": 4, "zone": "Garden"},
    {"id": "T09", "name": "Table 9", "capacity": 4, "zone": "Garden"},
    {"id": "T10", "name": "Table 10", "capacity": 6, "zone": "Garden"},
    {"id": "T11", "name": "Table 11", "capacity": 2, "zone": "Garden"},
    {"id": "T12", "name": "Table 12", "capacity": 2, "zone": "Garden"},
    {"id": "T13", "name": "VIP Room A", "capacity": 10, "zone": "VIP"},
    {"id": "T14", "name": "VIP Room B", "capacity": 8, "zone": "VIP"},
    {"id": "T15", "name": "Bar Seat 1", "capacity": 1, "zone": "Bar"},
    {"id": "T16", "name": "Bar Seat 2", "capacity": 1, "zone": "Bar"},
    {"id": "T17", "name": "Bar Seat 3", "capacity": 1, "zone": "Bar"},
    {"id": "T18", "name": "Bar Seat 4", "capacity": 1, "zone": "Bar"},
    {"id": "T19", "name": "Outdoor Table 1", "capacity": 4, "zone": "Outdoor"},
    {"id": "T20", "name": "Outdoor Table 2", "capacity": 4, "zone": "Outdoor"},
]

STAFF = [
    {"id": "ST001", "name": "สมชาย รักดี", "role": "Chef", "shift": "Morning"},
    {"id": "ST002", "name": "สมหญิง ใจดี", "role": "Chef", "shift": "Evening"},
    {"id": "ST003", "name": "มานะ ขยันดี", "role": "Server", "shift": "Morning"},
    {"id": "ST004", "name": "ดวงใจ สวยงาม", "role": "Server", "shift": "Morning"},
    {"id": "ST005", "name": "วิชัย เร็วไว", "role": "Server", "shift": "Evening"},
    {"id": "ST006", "name": "กัญญา มั่งมี", "role": "Cashier", "shift": "Morning"},
    {"id": "ST007", "name": "ประเสริฐ ดีเลิศ", "role": "Cashier", "shift": "Evening"},
    {"id": "ST008", "name": "สมศักดิ์ ยิ่งใหญ่", "role": "Manager", "shift": "Morning"},
    {"id": "ST009", "name": "นงลักษณ์ เก่งการ", "role": "Manager", "shift": "Evening"},
    {"id": "ST010", "name": "อนุชา แข็งแรง", "role": "Cleaner", "shift": "Morning"},
]

PAYMENT_METHODS = ["Cash", "Card", "PromptPay"]

# ── Shop Settings ────────────────────────────────────────────────────────
SHOP_SETTINGS = {
    "name": "ร้านอาหารไทย",
    "address": "123 ถนนสุขุมวิท กรุงเทพฯ",
    "phone": "02-123-4567",
    "tax_id": "1234567890123",
    "promptpay_id": "0993946144",  # เบอร์โทร หรือ เลขประจำตัวผู้เสียภาษี สำหรับ PromptPay QR
    "service_charge_pct": 10,
    "vat_pct": 7,
    "default_note": "ขอบคุณที่มาใช้บริการ",
    "auto_print": False,
}

INVENTORY = [
    {"id": "INV001", "name": "ข้าวหอมมะลิ", "category": "วัตถุดิบ", "unit": "กก.", "stock": 50, "min_stock": 10, "cost": 35},
    {"id": "INV002", "name": "เนื้อหมู", "category": "วัตถุดิบ", "unit": "กก.", "stock": 20, "min_stock": 5, "cost": 120},
    {"id": "INV003", "name": "เนื้อไก่", "category": "วัตถุดิบ", "unit": "กก.", "stock": 15, "min_stock": 5, "cost": 90},
    {"id": "INV004", "name": "กุ้ง", "category": "วัตถุดิบ", "unit": "กก.", "stock": 8, "min_stock": 3, "cost": 250},
    {"id": "INV005", "name": "น้ำปลา", "category": "เครื่องปรุง", "unit": "ขวด", "stock": 12, "min_stock": 3, "cost": 25},
    {"id": "INV006", "name": "พริก", "category": "เครื่องปรุง", "unit": "กก.", "stock": 5, "min_stock": 2, "cost": 80},
    {"id": "INV007", "name": "มะนาว", "category": "เครื่องปรุง", "unit": "กก.", "stock": 10, "min_stock": 3, "cost": 40},
    {"id": "INV008", "name": "น้ำมันพืช", "category": "เครื่องปรุง", "unit": "ลิตร", "stock": 8, "min_stock": 2, "cost": 55},
    {"id": "INV009", "name": "น้ำอัดลม", "category": "เครื่องดื่ม", "unit": "ขวด", "stock": 48, "min_stock": 12, "cost": 12},
    {"id": "INV010", "name": "น้ำดื่ม", "category": "เครื่องดื่ม", "unit": "ขวด", "stock": 72, "min_stock": 24, "cost": 8},
]

MEMBERS = [
    {"id": "MB001", "name": "คุณลูกค้า A", "phone": "081-111-1111", "email": "a@example.com", "tier": "gold", "points": 2500},
    {"id": "MB002", "name": "คุณลูกค้า B", "phone": "082-222-2222", "email": "b@example.com", "tier": "regular", "points": 350},
    {"id": "MB003", "name": "คุณลูกค้า C", "phone": "083-333-3333", "email": "c@example.com", "tier": "silver", "points": 1200},
]

REWARDS = [
    {"id": "RW001", "name": "ส่วนลด 50 บาท", "points_required": 500, "discount_type": "fixed", "discount_value": 50, "description": "ลด 50 บาท เมื่อสั่งอาหารครบ 300 บาท"},
    {"id": "RW002", "name": "ส่วนลด 10%", "points_required": 800, "discount_type": "percent", "discount_value": 10, "description": "ลด 10% สำหรับค่าอาหาร"},
    {"id": "RW003", "name": "ของหวานฟรี", "points_required": 300, "discount_type": "fixed", "discount_value": 69, "description": "ของหวานฟรี 1 รายการ (สูงสุด 69 บาท)"},
]


class POSEngine:
    """POS engine with SQLite persistence. Manages orders, tables, and payments."""

    def __init__(self):
        self._data_dir = os.path.join(os.path.dirname(__file__), "..", "data")
        self._orders_file = os.path.join(self._data_dir, "orders.json")
        self._counter_file = os.path.join(self._data_dir, "counter.json")
        self._db_path = os.path.join(self._data_dir, "pos.db")
        self._orders: dict[str, dict[str, Any]] = {}
        self._order_counter = 0
        self._table_status: dict[str, str] = {t["id"]: "available" for t in TABLES}
        self._erp_order_id_map: dict[str, str] = {}
        self._init_db()
        self._load_orders()

    def _ensure_data_dir(self):
        os.makedirs(self._data_dir, exist_ok=True)

    def _get_db(self) -> sqlite3.Connection:
        self._ensure_data_dir()
        conn = sqlite3.connect(self._db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        return conn

    def _init_db(self):
        conn = self._get_db()
        conn.execute("""
            CREATE TABLE IF NOT EXISTS pos_orders (
                order_id TEXT PRIMARY KEY,
                table_id TEXT,
                table_name TEXT,
                status TEXT DEFAULT 'pending',
                items TEXT DEFAULT '[]',
                subtotal REAL DEFAULT 0,
                service_charge REAL DEFAULT 0,
                vat REAL DEFAULT 0,
                grand_total REAL DEFAULT 0,
                payment_method TEXT,
                amount_received REAL,
                change_amount REAL,
                notes TEXT DEFAULT '',
                created_at TEXT,
                updated_at TEXT,
                paid_at TEXT
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS pos_config (
                key TEXT PRIMARY KEY,
                value TEXT
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS pos_categories (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                sort_order INTEGER DEFAULT 0,
                is_active INTEGER DEFAULT 1
            )
        """)
        # Seed default categories if table is empty
        existing = conn.execute("SELECT COUNT(*) FROM pos_categories").fetchone()[0]
        if existing == 0:
            defaults = [
                ("cat_app", "Appetizer", 1),
                ("cat_main", "Main Course", 2),
                ("cat_des", "Dessert", 3),
                ("cat_bev", "Beverage", 4),
                ("cat_side", "Side Dish", 5),
            ]
            conn.executemany(
                "INSERT INTO pos_categories (id, name, sort_order) VALUES (?, ?, ?)",
                defaults
            )
        conn.commit()
        conn.close()

    def _save_orders(self):
        """Save orders to both SQLite and JSON (backward compat)."""
        self._ensure_data_dir()
        conn = self._get_db()
        now = datetime.now().isoformat()
        for oid, order in self._orders.items():
            try:
                conn.execute("""
                    INSERT OR REPLACE INTO pos_orders
                    (order_id, table_id, table_name, status, items, subtotal,
                     service_charge, vat, grand_total, payment_method,
                     amount_received, change_amount, notes, created_at, updated_at, paid_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    oid,
                    order.get("table_id", ""),
                    order.get("table_name", ""),
                    order.get("status", "pending"),
                    json.dumps(order.get("items", []), default=str),
                    order.get("subtotal", 0),
                    order.get("service_charge", 0),
                    order.get("vat", 0),
                    order.get("grand_total", 0),
                    order.get("payment_method"),
                    order.get("amount_received"),
                    order.get("change"),
                    order.get("notes", ""),
                    order.get("created_at", now),
                    order.get("updated_at", now),
                    order.get("paid_at"),
                ))
            except Exception as e:
                logger.warning("SQLite save failed for %s: %s", oid, e)
        # Save counter
        conn.execute("INSERT OR REPLACE INTO pos_config (key, value) VALUES (?, ?)",
                     ("order_counter", str(self._order_counter)))
        conn.commit()
        conn.close()
        # Also write JSON (backward compat / hand-editable backup)
        try:
            with open(self._orders_file, "w") as f:
                json.dump(self._orders, f, default=str, indent=2)
            with open(self._counter_file, "w") as f:
                json.dump({"counter": self._order_counter}, f)
        except Exception as e:
            logger.warning("JSON save failed: %s", e)

    def _load_orders(self):
        """Load orders from SQLite first, fallback to JSON."""
        self._ensure_data_dir()
        loaded = False
        try:
            conn = self._get_db()
            rows = conn.execute("SELECT * FROM pos_orders ORDER BY rowid").fetchall()
            if rows:
                for row in rows:
                    d = dict(row)
                    d["items"] = json.loads(d.get("items", "[]") or "[]")
                    if d.get("amount_received"):
                        d["amount_received"] = d["amount_received"]
                    if d.get("change_amount"):
                        d["change"] = d["change_amount"]
                    self._orders[d["order_id"]] = d
                # Load counter
                c = conn.execute("SELECT value FROM pos_config WHERE key=?", ("order_counter",)).fetchone()
                if c:
                    self._order_counter = int(c["value"])
                loaded = True
            conn.close()
        except Exception as e:
            logger.warning("SQLite load failed: %s", e)
        if not loaded:
            try:
                if os.path.exists(self._orders_file):
                    with open(self._orders_file) as f:
                        self._orders = json.load(f)
                if os.path.exists(self._counter_file):
                    with open(self._counter_file) as f:
                        data = json.load(f)
                        self._order_counter = data.get("counter", 0)
            except Exception as e:
                logger.warning("JSON fallback load failed: %s", e)
    def _erp_order_to_pos(self, erp_order: dict, table_id: str, table_name: str, original_items: list) -> dict:
        """Convert ERP Core order format to POS engine format."""
        pos = erp_to_pos_order(erp_order, table_id=table_id, table_name=table_name)
        # Preserve original items' served status
        if "items" in pos and original_items:
            orig_by_id = {it.get("item_id", it.get("id", "")): it for it in original_items}
            for item in pos["items"]:
                orig = orig_by_id.get(item["item_id"])
                if orig:
                    item["item_served"] = orig.get("item_served", False)
        return pos

    def _erp_order_to_pos_simple(self, erp_order: dict) -> dict:
        """Convert ERP Core order to simplified POS format for display."""
        return erp_to_pos_order(erp_order)


    # ── Categories (local SQLite) ────────────────────────

    def list_categories(self) -> list[dict]:
        """Get all categories from local SQLite."""
        try:
            conn = self._get_db()
            rows = conn.execute(
                "SELECT id, name, sort_order, is_active FROM pos_categories ORDER BY sort_order, name"
            ).fetchall()
            conn.close()
            return [dict(r) for r in rows]
        except Exception as e:
            logger.warning("Failed to load categories: %s", e)
            return [{"id": "cat_app", "name": n, "sort_order": i, "is_active": 1}
                    for i, n in enumerate(MENU_CATEGORIES)]

    def create_category(self, cat_id: str, name: str, sort_order: int = 0) -> dict:
        """Create a new category."""
        conn = self._get_db()
        try:
            conn.execute(
                "INSERT INTO pos_categories (id, name, sort_order) VALUES (?, ?, ?)",
                (cat_id, name, sort_order)
            )
            conn.commit()
            return {"id": cat_id, "name": name, "sort_order": sort_order, "is_active": 1}
        except sqlite3.IntegrityError:
            raise ValueError(f"Category id '{cat_id}' already exists")
        finally:
            conn.close()

    def update_category(self, cat_id: str, name: str = None, sort_order: int = None, is_active: int = None) -> dict | None:
        """Update a category."""
        conn = self._get_db()
        fields = []
        params = []
        if name is not None:
            fields.append("name = ?")
            params.append(name)
        if sort_order is not None:
            fields.append("sort_order = ?")
            params.append(sort_order)
        if is_active is not None:
            fields.append("is_active = ?")
            params.append(is_active)
        if not fields:
            conn.close()
            return None
        params.append(cat_id)
        conn.execute(f"UPDATE pos_categories SET {', '.join(fields)} WHERE id = ?", params)
        conn.commit()
        row = conn.execute("SELECT id, name, sort_order, is_active FROM pos_categories WHERE id = ?", (cat_id,)).fetchone()
        conn.close()
        return dict(row) if row else None

    def delete_category(self, cat_id: str) -> bool:
        """Delete a category."""
        conn = self._get_db()
        conn.execute("DELETE FROM pos_categories WHERE id = ?", (cat_id,))
        conn.commit()
        deleted = conn.execute("SELECT changes()").fetchone()[0] > 0
        conn.close()
        return deleted

    def get_categories(self) -> list[str]:
        """Get category names (legacy interface)."""
        cats = self.list_categories()
        return [c["name"] for c in cats if c.get("is_active", 1)]

    def get_menu(self, category: str | None = None) -> list[dict[str, Any]]:
        try:
            client = get_erp_client()
            products = client.list_products()
            try:
                categories = self.list_categories()
                cat_map = {c["id"]: c["name"] for c in categories} if categories else CATEGORY_MAP
            except:
                cat_map = CATEGORY_MAP
            items = []
            for p in products:
                items.append({
                    "id": p.get("id", ""),
                    "name": p.get("name", ""),
                    "description": p.get("description", "") or "",
                    "category": cat_map.get(p.get("category_id"), p.get("category_name", p.get("category", "Uncategorized"))),
                    "price": p.get("price", 0),
                    "cost": p.get("cost_price", 0),
                    "available": p.get("status") == "active",
                    "image": p.get("image", p.get("image_url", "")),
                })
            if category:
                items = [i for i in items if i["category"] == category]
            return items
        except (MCPError, httpx.HTTPError):
            logger.warning("ERP Core unavailable, using mock menu data")
            items = MENU_ITEMS
            if category:
                items = [i for i in items if i["category"] == category]
            return items

    def get_menu_item(self, item_id: str) -> dict[str, Any] | None:
        try:
            client = get_erp_client()
            p = client.get_product(item_id)
            if p:
                return {
                    "id": p.get("id", ""),
                    "name": p.get("name", ""),
                    "category": CATEGORY_MAP.get(p.get("category_id"), p.get("category_name", p.get("category", "Uncategorized"))),
                    "price": p.get("price", 0),
                    "cost": p.get("cost_price", 0),
                    "available": p.get("status") == "active",
                }
        except (MCPError, httpx.HTTPError):
            pass
        for item in MENU_ITEMS:
            if item["id"] == item_id:
                return item
        return None

    def get_product_by_barcode(self, barcode: str) -> dict[str, Any] | None:
        try:
            client = get_erp_client()
            p = client.get_product_by_barcode(barcode)
            if p:
                return {
                    "id": p.get("id", ""),
                    "name": p.get("name", ""),
                    "description": p.get("description", "") or "",
                    "category": CATEGORY_MAP.get(p.get("category_id"), p.get("category_name", p.get("category", "Uncategorized"))),
                    "price": p.get("price", 0),
                    "cost": p.get("cost_price", 0),
                    "barcode": p.get("barcode", ""),
                    "available": p.get("status") == "active",
                }
        except (MCPError, httpx.HTTPError):
            pass
        return None

    def get_tables(self) -> list[dict[str, Any]]:
        result = []
        for t in TABLES:
            result.append({**t, "status": self._table_status.get(t["id"], "available")})
        return result

    def get_table(self, table_id: str) -> dict[str, Any] | None:
        for t in TABLES:
            if t["id"] == table_id:
                return {**t, "status": self._table_status.get(t["id"], "available")}
        return None

    def create_order(self, table_id: str, items: list[dict[str, Any]]) -> dict[str, Any]:
        is_takeaway = table_id == "takeaway"

        if is_takeaway:
            table_name = "Take-away"
        else:
            table = self.get_table(table_id)
            if not table:
                raise ValueError(f"Table {table_id} not found")
            table_name = table["name"]

        self._order_counter += 1
        order_id = f"ORD-{datetime.now().strftime('%Y%m%d')}-{self._order_counter:04d}"

        order_items = []
        subtotal = 0
        for idx, entry in enumerate(items):
            menu_item = self.get_menu_item(entry["item_id"])
            if not menu_item:
                raise ValueError(f"Menu item {entry['item_id']} not found")
            qty = entry.get("quantity", 1)
            line_total = menu_item["price"] * qty
            subtotal += line_total
            order_items.append({
                "line": idx + 1,
                "item_id": menu_item["id"],
                "name": menu_item["name"],
                "price": menu_item["price"],
                "quantity": qty,
                "notes": entry.get("notes", ""),
                "line_total": line_total,
                "is_new_item": False,
                "item_served": False,
            })

        service_charge = round(subtotal * 0.10, 2)
        vat = round((subtotal + service_charge) * 0.07, 2)
        grand_total = round(subtotal + service_charge + vat, 2)

        order = {
            "order_id": order_id,
            "table_id": table_id,
            "table_name": table_name,
            "items": order_items,
            "subtotal": subtotal,
            "service_charge": service_charge,
            "vat": vat,
            "grand_total": grand_total,
            "status": "pending",
            "payment_method": None,
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat(),
            "paid_at": None,
        }

        self._orders[order_id] = order
        if not is_takeaway:
            self._table_status[table_id] = "occupied"
        self._save_orders()
        logger.info("POS Order created: %s (Table %s, Total: %.2f)", order_id, table_name, grand_total)

        # Sync order to ERP Core
        try:
            client = get_erp_client()
            erp_data = pos_to_erp_order(order)
            client.create_order(
                customer_name=erp_data.get("customerName", f"POS-{table_name}"),
                items=erp_data.get("items", []),
                notes=erp_data.get("notes", f"POS Order {order_id}"),
            )
            logger.info("POS Order %s synced to ERP Core", order_id)
        except (MCPError, httpx.HTTPError):
            logger.warning("Could not sync order %s to ERP Core", order_id)

        return order

    def get_order(self, order_id: str) -> dict[str, Any] | None:
        return self._orders.get(order_id)

    def get_orders(self, status: str | None = None) -> list[dict[str, Any]]:
        orders = list(self._orders.values())
        if status:
            orders = [o for o in orders if o["status"] == status]
        return sorted(orders, key=lambda o: o["created_at"], reverse=True)

    def get_active_orders(self) -> list[dict[str, Any]]:
        return [o for o in self._orders.values() if o["status"] in ("pending", "preparing", "served")]

    # ── Pole Display State ────────────────────────────────────────────────
    _pole_display_state: dict[str, Any] = {"type": None, "data": None, "updated_at": None}

    def set_pole_display_state(self, state: dict[str, Any]) -> dict[str, Any]:
        self._pole_display_state = {
            "type": state.get("type"),
            "data": state.get("data"),
            "updated_at": datetime.now().isoformat(),
        }
        logger.info("Pole display state updated: type=%s", state.get("type"))
        return dict(self._pole_display_state)

    def get_pole_display_state(self) -> dict[str, Any]:
        return dict(self._pole_display_state)

    def clear_pole_display_state(self) -> dict[str, Any]:
        self._pole_display_state = {"type": None, "data": None, "updated_at": None}
        logger.info("Pole display state cleared")
        return dict(self._pole_display_state)

    def get_kitchen_orders(self) -> list[dict[str, Any]]:
        try:
            client = get_erp_client()
            result = client.list_orders()
            if result:
                kitchen = [o for o in result if o.get("status") in ("pending", "preparing")]
                return [self._erp_order_to_pos_simple(o) for o in kitchen]
        except (MCPError, httpx.HTTPError):
            logger.warning("ERP Core list_orders failed, using local")
        return [o for o in self._orders.values() if o["status"] in ("pending", "preparing")]

    def update_order_items(self, order_id: str, items: list[dict[str, Any]]) -> dict[str, Any]:
        try:
            client = get_erp_client()
            erp_items = [{"productId": i.get("product_id", i.get("id", "")), "quantity": i.get("quantity", 1), "unitPrice": i.get("unit_price", i.get("price", 0))} for i in items]
            result = client.update_order_items(order_id, erp_items)
            if result:
                logger.info("Order %s items updated via ERP Core", order_id)
                return self._erp_order_to_pos_simple(result)
        except (MCPError, httpx.HTTPError) as e:
            logger.warning("ERP Core update_order_items failed: %s", e)

        if order_id not in self._orders:
            raise ValueError(f"Order {order_id} not found")
        order = self._orders[order_id]
        if order["status"] in ("paid", "cancelled"):
            raise ValueError(f"Cannot modify {order['status']} order")
        order_items = []
        subtotal = 0
        for idx, entry in enumerate(items):
            menu_item = self.get_menu_item(entry["item_id"])
            if not menu_item:
                raise ValueError(f"Menu item {entry['item_id']} not found")
            qty = entry.get("quantity", 1)
            line_total = menu_item["price"] * qty
            subtotal += line_total
            order_items.append({
                "line": idx + 1,
                "item_id": menu_item["id"],
                "name": menu_item["name"],
                "price": menu_item["price"],
                "quantity": qty,
                "notes": entry.get("notes", ""),
                "line_total": line_total,
                "is_new_item": False,
                "item_served": False,
            })
        order["items"] = order_items
        order["subtotal"] = subtotal
        order["service_charge"] = round(subtotal * 0.10, 2)
        order["vat"] = round((subtotal + order["service_charge"]) * 0.07, 2)
        order["grand_total"] = round(subtotal + order["service_charge"] + order["vat"], 2)
        order["updated_at"] = datetime.now().isoformat()
        self._save_orders()
        logger.info("POS Order %s items updated", order_id)
        return order

    def append_order_items(self, order_id: str, items: list[dict[str, Any]]) -> dict[str, Any]:
        try:
            client = get_erp_client()
            erp_items = [{"productId": i.get("product_id", i.get("id", "")), "quantity": i.get("quantity", 1), "unitPrice": i.get("unit_price", i.get("price", 0))} for i in items]
            result = client.append_order_items(order_id, erp_items)
            if result:
                logger.info("Order %s items appended via ERP Core", order_id)
                return self._erp_order_to_pos_simple(result)
        except (MCPError, httpx.HTTPError) as e:
            logger.warning("ERP Core append_order_items failed: %s", e)

        if order_id not in self._orders:
            raise ValueError(f"Order {order_id} not found")
        order = self._orders[order_id]
        if order["status"] in ("paid", "cancelled"):
            raise ValueError(f"Cannot modify {order['status']} order")
        for idx, entry in enumerate(items):
            menu_item = self.get_menu_item(entry["item_id"])
            if not menu_item:
                raise ValueError(f"Menu item {entry['item_id']} not found")
            qty = entry.get("quantity", 1)
            line_total = menu_item["price"] * qty
            next_line = max((it["line"] for it in order["items"]), default=0) + 1
            order["items"].append({
                "line": next_line,
                "item_id": menu_item["id"],
                "name": menu_item["name"],
                "price": menu_item["price"],
                "quantity": qty,
                "notes": entry.get("notes", ""),
                "line_total": line_total,
                "is_new_item": False,
                "item_served": False,
            })
        order["subtotal"] = sum(it["line_total"] for it in order["items"])
        order["service_charge"] = round(order["subtotal"] * 0.10, 2)
        order["vat"] = round((order["subtotal"] + order["service_charge"]) * 0.07, 2)
        order["grand_total"] = round(order["subtotal"] + order["service_charge"] + order["vat"], 2)
        order["updated_at"] = datetime.now().isoformat()
        self._save_orders()
        logger.info("POS Order %s items appended", order_id)
        return order

    def update_order_status(self, order_id: str, status: str) -> dict[str, Any]:
        try:
            client = get_erp_client()
            # Try ERP Core order ID first, then POS order_id
            erp_order_id = self._erp_order_id_map.get(order_id, order_id)
            result = client.update_order_status(erp_order_id, status)
            if result:
                logger.info("Order %s status updated via ERP Core: %s", order_id, status)
                if status in ("paid", "cancelled"):
                    for o in self._orders.values():
                        if o.get("order_id") == order_id or o.get("id") == order_id:
                            self._table_status[o.get("table_id", "")] = "available"
                            break
                return self._erp_order_to_pos_simple(result)
        except (MCPError, httpx.HTTPError) as e:
            logger.warning("ERP Core update_order_status failed: %s", e)

        if order_id not in self._orders:
            raise ValueError(f"Order {order_id} not found")
        if status not in ("pending", "preparing", "served", "paid", "cancelled"):
            raise ValueError(f"Invalid status: {status}")
        order = self._orders[order_id]
        old_status = order["status"]
        order["status"] = status
        order["updated_at"] = datetime.now().isoformat()
        if status == "paid":
            order["paid_at"] = datetime.now().isoformat()
            self._table_status[order["table_id"]] = "available"
        elif status == "cancelled":
            self._table_status[order["table_id"]] = "available"
        self._save_orders()
        logger.info("POS Order %s: %s -> %s", order_id, old_status, status)
        return order

    def mark_item_served(self, order_id: str, line: int) -> dict[str, Any]:
        try:
            client = get_erp_client()
            order_data = client.get_order(order_id)
            if order_data:
                items = order_data.get("items", [])
                if line <= len(items):
                    item_id = items[line - 1].get("id", "")
                    if item_id:
                        result = client.mark_item_served(order_id, item_id)
                        if result:
                            logger.info("Item line %d served in order %s via ERP Core", line, order_id)
                            return self._erp_order_to_pos_simple(result)
        except (MCPError, httpx.HTTPError) as e:
            logger.warning("ERP Core mark_item_served failed: %s", e)

        if order_id not in self._orders:
            raise ValueError(f"Order {order_id} not found")
        order = self._orders[order_id]
        if order["status"] in ("paid", "cancelled"):
            raise ValueError(f"Cannot modify {order['status']} order")
        for item in order["items"]:
            if item["line"] == line:
                if item["item_served"]:
                    raise ValueError(f"Item line {line} is already served")
                item["item_served"] = True
                break
        else:
            raise ValueError(f"Item line {line} not found")
        order["updated_at"] = datetime.now().isoformat()
        if all(item["item_served"] for item in order["items"]):
            if order["status"] != "served":
                old_status = order["status"]
                order["status"] = "served"
                logger.info("POS Order %s: %s -> served (all items served)", order_id, old_status)
        self._save_orders()
        return order

    def process_payment(self, order_id: str, method: str, amount_received: float | None = None, member_id: str | None = None) -> dict[str, Any]:
        try:
            client = get_erp_client()
            notes_data = {"paymentMethod": method, "amountReceived": amount_received}
            if member_id:
                notes_data["memberId"] = member_id
            notes = json.dumps(notes_data)
            result = client.update_order_status(order_id, "paid", notes=notes)
            if result:
                try:
                    client.create_transaction(
                        order_id=order_id,
                        amount=result.get("total", 0),
                        method=method,
                        description=f"POS Payment {order_id}",
                        type="income",
                        category="pos_sales"
                    )
                except (MCPError, httpx.HTTPError):
                    logger.warning("Could not sync transaction %s to ERP Core", order_id)
                logger.info("POS Payment via ERP Core: %s (%s)", order_id, method)
                for o in self._orders.values():
                    if o.get("order_id") == order_id or o.get("id") == order_id:
                        self._table_status[o.get("table_id", "")] = "available"
                        break
                return self._erp_order_to_pos_simple(result)
        except (MCPError, httpx.HTTPError) as e:
            logger.warning("ERP Core payment failed, falling back: %s", e)

        if order_id not in self._orders:
            raise ValueError(f"Order {order_id} not found")
        if method not in PAYMENT_METHODS:
            raise ValueError(f"Invalid payment method: {method}")
        order = self._orders[order_id]
        if order["status"] == "paid":
            raise ValueError(f"Order {order_id} is already paid")
        change = 0
        if amount_received is not None:
            change = round(amount_received - order["grand_total"], 2)
            if change < 0:
                raise ValueError(f"Insufficient amount: received {amount_received}, need {order['grand_total']}")
        order["payment_method"] = method
        order["status"] = "paid"
        order["paid_at"] = datetime.now().isoformat()
        order["updated_at"] = datetime.now().isoformat()
        order["amount_received"] = amount_received
        order["change"] = change
        self._table_status[order["table_id"]] = "available"
        self._save_orders()
        
        # Auto-earn points for member
        if member_id:
            try:
                se = get_schema_engine()
                points_earned = max(1, int(order["grand_total"] / 10))
                current_balance = se.get_member_balance(member_id)
                new_balance = current_balance + points_earned
                se.add_reward_entry({
                    "member_id": member_id,
                    "type": "earn",
                    "points": points_earned,
                    "balance_after": new_balance,
                    "reference_type": "pos_order",
                    "reference_id": order_id,
                    "description": f"Earned {points_earned}pts from {order_id} (฿{order['grand_total']:.0f})"
                })
                se.update_member(member_id, {"points": new_balance})
                logger.info("Member %s earned %d pts from %s", member_id, points_earned, order_id)
            except Exception as e:
                logger.warning("Failed to earn points for member %s: %s", member_id, e)
        
        logger.info("POS Payment: %s (%s) Total: %.2f", order_id, method, order["grand_total"])
        return order

    def get_dashboard_stats(self) -> dict[str, Any]:
        try:
            client = get_erp_client()
            erp_dash = client.get_dashboard_summary()
            orders = client.list_orders()
            if orders and erp_dash:
                today_str = date.today().isoformat()
                today_orders = []
                for o in orders:
                    created = o.get("created_at", 0)
                    if isinstance(created, (int, float)):
                        try:
                            od = datetime.fromtimestamp(created / 1000).date().isoformat()
                            if od == today_str:
                                today_orders.append(o)
                        except (ValueError, OSError):
                            pass
                    elif isinstance(created, str) and created[:10] == today_str:
                        today_orders.append(o)
                paid_orders = [o for o in today_orders if o.get("status") == "paid"]
                total_revenue = sum(o.get("total", 0) for o in paid_orders)
                active_orders = len([o for o in orders if o.get("status") in ("pending", "preparing", "served")])
                occupied = len([o for o in orders if o.get("status") not in ("paid", "cancelled") and o.get("channel") == "pos"])
                return {
                    "today_revenue": total_revenue,
                    "today_orders": len(today_orders),
                    "active_orders": active_orders,
                    "total_tables": len(TABLES),
                    "occupied_tables": min(occupied, len(TABLES)),
                    "available_tables": max(0, len(TABLES) - occupied),
                    "popular_items": [],
                    "recent_orders": [self._erp_order_to_pos_simple(o) for o in today_orders[:5]] if today_orders else [],
                    "erp_dashboard": erp_dash,
                }
        except (MCPError, httpx.HTTPError):
            pass

        today = date.today().isoformat()
        all_orders = list(self._orders.values())
        today_orders = [o for o in all_orders if o["created_at"][:10] == today]
        paid_orders = [o for o in today_orders if o["status"] == "paid"]
        total_revenue = sum(o["grand_total"] for o in paid_orders)
        total_orders = len(today_orders)
        active_orders = len([o for o in all_orders if o["status"] in ("pending", "preparing", "served")])
        total_tables = len(TABLES)
        occupied_tables = len([t for t, s in self._table_status.items() if s == "occupied"])
        item_count: dict[str, dict] = {}
        for o in all_orders:
            for item in o["items"]:
                name = item["name"]
                if name not in item_count:
                    item_count[name] = {"name": name, "quantity": 0, "revenue": 0}
                item_count[name]["quantity"] += item["quantity"]
                item_count[name]["revenue"] += item["line_total"]
        popular = sorted(item_count.values(), key=lambda x: x["quantity"], reverse=True)[:10]
        return {
            "today_revenue": total_revenue,
            "today_orders": total_orders,
            "active_orders": active_orders,
            "total_tables": total_tables,
            "occupied_tables": occupied_tables,
            "available_tables": total_tables - occupied_tables,
            "popular_items": popular,
            "recent_orders": today_orders[:5] if today_orders else [],
            "erp_dashboard": None,
        }

    def get_staff(self, role: str | None = None) -> list[dict[str, Any]]:
        try:
            client = get_erp_client()
            employees = client.list_employees()
            if employees is None:
                raise MCPError("Not available")
            result = []
            for e in employees:
                result.append({
                    "id": e.get("id", ""),
                    "name": e.get("name", ""),
                    "role": e.get("role", ""),
                    "shift": e.get("shift", ""),
                })
            if role:
                result = [s for s in result if s["role"] == role]
            return result
        except (MCPError, httpx.HTTPError):
            logger.warning("ERP Core unavailable, using mock staff data")
            if role:
                return [s for s in STAFF if s["role"] == role]
            return STAFF

    def create_staff(self, staff: dict[str, Any]) -> dict[str, Any]:
        try:
            client = get_erp_client()
            name = staff.get("name", "")
            result = client.create_employee(
                name=name,
                role=staff.get("role", ""),
                email=staff.get("email", ""),
                phone=staff.get("phone", ""),
                employee_code=staff.get("employee_code", f"ST{len(STAFF)+1:03d}"),
                first_name=staff.get("first_name", name),
                last_name=staff.get("last_name", name),
            )
            if result:
                logger.info("Staff created via ERP: %s", name)
                return {"id": result.get("id", ""), **staff}
        except (MCPError, httpx.HTTPError):
            pass
        new_id = f"ST{len(STAFF)+1:03d}"
        entry = {"id": new_id, **staff}
        STAFF.append(entry)
        logger.info("Staff created (mock): %s (%s)", entry["name"], entry["role"])
        return entry

    def get_settings(self) -> dict[str, Any]:
        try:
            client = get_erp_client()
            result = client.get_settings()
            if result:
                SHOP_SETTINGS.update(result)
        except (MCPError, httpx.HTTPError) as e:
            logger.warning("ERP Core get_settings failed: %s", e)
        return dict(SHOP_SETTINGS)

    def update_settings(self, data: dict[str, Any]) -> dict[str, Any]:
        SHOP_SETTINGS.update(data)
        try:
            client = get_erp_client()
            client.update_settings(SHOP_SETTINGS)
            logger.info("Shop settings updated and synced to ERP Core")
        except (MCPError, httpx.HTTPError) as e:
            logger.warning("ERP Core update_settings failed: %s", e)
        return dict(SHOP_SETTINGS)

    def get_inventory(self) -> list[dict[str, Any]]:
        try:
            client = get_erp_client()
            inv = client.get_inventory()
            if inv and "products" in inv:
                result = []
                for p in inv["products"]:
                    result.append({
                        "id": p.get("id", ""),
                        "name": p.get("name", ""),
                        "category": "วัตถุดิบ",
                        "unit": "ชิ้น",
                        "stock": p.get("quantity", 0),
                        "min_stock": p.get("low_stock_threshold", 5),
                        "cost": p.get("cost_price", 0),
                    })
                return result
        except (MCPError, httpx.HTTPError):
            pass
        return list(INVENTORY)

    def update_inventory(self, item: dict[str, Any]) -> dict[str, Any]:
        # Sync to ERP Core
        try:
            client = get_erp_client()
            client.update_product(
                product_id=item.get("id", ""),
                name=item.get("name", ""),
                price=item.get("price", 0),
                quantity=item.get("quantity", 0),
                low_stock_threshold=item.get("low_stock_threshold", 5),
                status=item.get("status", "active"),
            )
            logger.info("Inventory updated via ERP: %s", item.get("name"))
        except (MCPError, httpx.HTTPError):
            logger.warning("Could not sync inventory update to ERP Core")

        for i, existing in enumerate(INVENTORY):
            if existing["id"] == item.get("id"):
                INVENTORY[i] = item
                logger.info("Inventory updated (local): %s", item["name"])
                return item
        INVENTORY.append(item)
        logger.info("Inventory created (local): %s", item["name"])
        return item

    def get_members(self) -> list[dict[str, Any]]:
        # Try Schema Engine first (primary member store)
        try:
            se = get_schema_engine()
            records = se.list_members()
            if records and len(records) > 0:
                result = []
                for r in records:
                    result.append({
                        "id": "SE-" + r.get("id", "")[:8],
                        "name": r.get("full_name", ""),
                        "phone": r.get("phone", ""),
                        "email": r.get("email", ""),
                        "tier": r.get("tier", "regular"),
                        "points": r.get("points", 0),
                        "_schema_id": r.get("id", ""),
                    })
                return result
        except Exception:
            pass

        # Fallback: ERP Core MCP
        try:
            client = get_erp_client()
            customers = client.list_customers()
            if customers:
                result = []
                for c in customers:
                    result.append({
                        "id": c.get("id", ""),
                        "name": c.get("name", ""),
                        "phone": c.get("phone", ""),
                        "email": c.get("email", ""),
                        "tier": c.get("tier", "regular"),
                        "points": c.get("points", 0),
                    })
                return result
        except (MCPError, httpx.HTTPError):
            pass
        return list(MEMBERS)

    def update_member(self, member: dict[str, Any]) -> dict[str, Any]:
        # Sync to Schema Engine (primary store)
        schema_id = member.get("_schema_id", "")
        try:
            se = get_schema_engine()
            se_data = {
                "full_name": member.get("name", ""),
                "phone": member.get("phone", ""),
                "email": member.get("email", ""),
                "tier": member.get("tier", "regular"),
                "points": member.get("points", 0),
                "is_active": True,
            }
            if schema_id:
                result = se.update_member(schema_id, se_data)
                if result:
                    logger.info("Member synced to Schema Engine: %s", member.get("name"))
            else:
                result = se.create_member(se_data)
                if result:
                    member["_schema_id"] = result.get("id", "")
                    logger.info("Member created in Schema Engine: %s", member.get("name"))
        except Exception:
            logger.warning("Could not sync member to Schema Engine")

        # Sync to ERP Core (fallback)
        try:
            client = get_erp_client()
            client.update_customer(
                customer_id=member.get("id", ""),
                name=member.get("name", ""),
                phone=member.get("phone", ""),
                email=member.get("email", ""),
                tier=member.get("tier", "regular"),
                points=member.get("points", 0),
            )
            logger.info("Member updated via ERP: %s", member.get("name"))
        except (MCPError, httpx.HTTPError):
            logger.warning("Could not sync member update to ERP Core")

        for i, existing in enumerate(MEMBERS):
            if existing.get("id") == member.get("id"):
                MEMBERS[i] = member
                logger.info("Member updated (local): %s", member["name"])
                return member
        if "id" not in member or not member["id"]:
            member["id"] = f"MB{int(time.time())}"
        MEMBERS.append(member)
        logger.info("Member created (local): %s", member["name"])
        return member

    def get_rewards(self) -> list[dict[str, Any]]:
        try:
            client = get_erp_client()
            discounts = client.list_discounts()
            if discounts:
                result = []
                for d in discounts:
                    result.append({
                        "id": d.get("id", ""),
                        "name": d.get("name", ""),
                        "points_required": d.get("points_required", 0),
                        "discount_type": d.get("type", "fixed"),
                        "discount_value": d.get("value", 0),
                        "description": d.get("description", ""),
                    })
                return result
        except (MCPError, httpx.HTTPError):
            pass
        return list(REWARDS)

    def update_reward(self, reward: dict[str, Any]) -> dict[str, Any]:
        # Sync to ERP Core
        try:
            client = get_erp_client()
            client.update_discount(
                discount_id=reward.get("id", ""),
                name=reward.get("name", ""),
                type=reward.get("discount_type", "fixed"),
                value=reward.get("discount_value", 0),
                description=reward.get("description", ""),
                points_required=reward.get("points_required", 0),
            )
            logger.info("Reward updated via ERP: %s", reward.get("name"))
        except (MCPError, httpx.HTTPError):
            logger.warning("Could not sync reward update to ERP Core")

        for i, existing in enumerate(REWARDS):
            if existing.get("id") == reward.get("id"):
                REWARDS[i] = reward
                logger.info("Reward updated (local): %s", reward["name"])
                return reward
        if "id" not in reward or not reward["id"]:
            reward["id"] = f"RW{int(time.time())}"
        REWARDS.append(reward)
        logger.info("Reward created (local): %s", reward["name"])
        return reward


    def delete_inventory(self, item_id: str) -> dict[str, Any]:
        # Sync to ERP Core
        try:
            client = get_erp_client()
            client.delete_product(product_id=item_id)
            logger.info("Inventory deleted via ERP: %s", item_id)
        except (MCPError, httpx.HTTPError):
            logger.warning("Could not sync inventory delete to ERP Core")

        for i, existing in enumerate(INVENTORY):
            if existing.get("id") == item_id:
                removed = INVENTORY.pop(i)
                logger.info("Inventory deleted (local): %s", removed["name"])
                return removed
        logger.info("Inventory %s deleted via ERP (not in local cache)", item_id)
        return {"id": item_id, "status": "deleted"}

    def delete_member(self, member_id: str) -> dict[str, Any]:
        # Sync to ERP Core
        try:
            client = get_erp_client()
            client.delete_customer(customer_id=member_id)
            logger.info("Member deleted via ERP: %s", member_id)
        except (MCPError, httpx.HTTPError):
            logger.warning("Could not sync member delete to ERP Core")

        for i, existing in enumerate(MEMBERS):
            if existing.get("id") == member_id:
                removed = MEMBERS.pop(i)
                logger.info("Member deleted (local): %s", removed["name"])
                return removed
        logger.info("Member %s deleted via ERP (not in local cache)", member_id)
        return {"id": member_id, "status": "deleted"}

    def delete_staff(self, staff_id: str) -> dict[str, Any]:
        # Sync to ERP Core
        try:
            client = get_erp_client()
            client.delete_employee(employee_id=staff_id)
            logger.info("Staff deleted via ERP: %s", staff_id)
        except (MCPError, httpx.HTTPError):
            logger.warning("Could not sync staff delete to ERP Core")

        for i, existing in enumerate(STAFF):
            if existing.get("id") == staff_id:
                removed = STAFF.pop(i)
                logger.info("Staff deleted (local): %s", removed["name"])
                return removed
        logger.info("Staff %s deleted via ERP (not in local cache)", staff_id)
        return {"id": staff_id, "status": "deleted"}

    def delete_reward(self, reward_id: str) -> dict[str, Any]:
        # Sync to ERP Core
        try:
            client = get_erp_client()
            client.delete_discount(discount_id=reward_id)
            logger.info("Reward deleted via ERP: %s", reward_id)
        except (MCPError, httpx.HTTPError):
            logger.warning("Could not sync reward delete to ERP Core")

        for i, existing in enumerate(REWARDS):
            if existing.get("id") == reward_id:
                removed = REWARDS.pop(i)
                logger.info("Reward deleted (local): %s", removed["name"])
                return removed
        logger.info("Reward %s deleted via ERP (not in local cache)", reward_id)
        return {"id": reward_id, "status": "deleted"}

    # ── Member / Reward Integration ─────────────────────────────────────

    def find_member(self, query: str) -> list[dict[str, Any]]:
        """Search members by phone or name."""
        try:
            se = get_schema_engine()
            results = se.list_members(search=query, limit=20)
            phone_result = se.find_member_by_phone(query)
            if phone_result and phone_result not in results:
                results.insert(0, phone_result)
            mapped = []
            for r in results:
                mapped.append({
                    "id": r.get("id", ""),
                    "name": r.get("full_name", r.get("name", "")),
                    "phone": r.get("phone", ""),
                    "tier": r.get("tier", "regular"),
                    "points": r.get("points", 0),
                })
            return mapped
        except Exception:
            pass
        # Fallback: search local MEMBERS
        q = query.lower()
        return [m for m in MEMBERS if q in m.get("phone", "").lower() or q in m.get("name", "").lower()]

    def get_member_rewards_balance(self, member_id: str) -> int:
        """Get current points balance for a member."""
        try:
            se = get_schema_engine()
            return se.get_member_balance(member_id)
        except Exception:
            return 0

    def redeem_member_reward(self, member_id: str, reward_id: str, order_id: str | None = None) -> dict[str, Any]:
        """Redeem a reward for a member by deducting points."""
        try:
            se = get_schema_engine()
            reward = None
            for r in self.get_rewards():
                if r["id"] == reward_id:
                    reward = r
                    break
            if not reward:
                raise ValueError(f"Reward {reward_id} not found")
            
            current_balance = se.get_member_balance(member_id)
            points_needed = reward["points_required"]
            
            if current_balance < points_needed:
                raise ValueError(
                    f"Not enough points. Have {current_balance}, need {points_needed}"
                )
            
            new_balance = current_balance - points_needed
            
            se.add_reward_entry({
                "member_id": member_id,
                "type": "redeem",
                "points": -points_needed,
                "balance_after": new_balance,
                "reference_type": "reward",
                "reference_id": reward_id,
                "description": f"Redeemed '{reward['name']}' ({points_needed}pts)"
            })
            se.update_member(member_id, {"points": new_balance})
            
            logger.info("Member %s redeemed '%s' (%d pts)", member_id, reward["name"], points_needed)
            return {
                "success": True,
                "reward": reward,
                "points_deducted": points_needed,
                "balance_after": new_balance,
            }
        except ValueError:
            raise
        except Exception as e:
            logger.warning("Reward redemption failed: %s", e)
            raise ValueError(f"System error: {e}")

    def get_member_ledger(self, member_id: str, limit: int = 50) -> list[dict[str, Any]]:
        """Get reward ledger history for a member."""
        try:
            se = get_schema_engine()
            entries = se.list_rewards(member_id=member_id, limit=limit)
            for e in entries:
                if "created_at" not in e:
                    e["created_at"] = ""
            return entries
        except Exception:
            return []


_engine: POSEngine | None = None


def get_pos_engine() -> POSEngine:
    global _engine
    if _engine is None:
        _engine = POSEngine()
    return _engine
