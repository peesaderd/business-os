"""ERP Core client via HTTP (like the existing erp_client.py from super-appsheet)."""
import json
import logging
import os
from typing import Any

import httpx

logger = logging.getLogger(__name__)

ERP_CORE_URL = os.environ.get("ERP_CORE_URL", "http://localhost:3000")
TENANT_ID = os.environ.get("ERP_TENANT_ID", "demo")


class ErpClient:
    """Async ERP Core client — calls MCP tools via HTTP POST."""

    def __init__(self, base_url: str | None = None, tenant_id: str | None = None):
        self._base_url = (base_url or ERP_CORE_URL).rstrip("/")
        self._mcp_url = f"{self._base_url}/mcp"
        self._tenant_id = tenant_id or TENANT_ID
        self._client = httpx.AsyncClient(timeout=10.0)
        self._healthy = False

    async def start(self):
        """Check if ERP Core is reachable."""
        try:
            resp = await self._client.get(f"{self._base_url}/health", timeout=3.0)
            self._healthy = resp.status_code == 200
        except Exception:
            self._healthy = False
        if self._healthy:
            logger.info("ERP Core connected: %s", self._base_url)
        else:
            logger.warning("ERP Core unavailable at %s (will use fallbacks)", self._base_url)

    async def stop(self):
        await self._client.aclose()

    async def _call(self, tool: str, args: dict | None = None) -> Any:
        """Call an MCP tool."""
        if args is None:
            args = {}
        payload = {
            "tool": tool,
            "args": {"tenantId": self._tenant_id, **args},
        }
        try:
            resp = await self._client.post(self._mcp_url, json=payload)
            if resp.status_code == 400:
                logger.warning("ERP 400 for %s: %s", tool, resp.text[:100])
                return None
            resp.raise_for_status()
            data = resp.json()
        except Exception as e:
            logger.warning("ERP call %s failed: %s", tool, e)
            return None
        if "error" in data:
            logger.warning("ERP error for %s: %s", tool, data["error"])
            return None
        content = data.get("content", [])
        if content and content[0].get("type") == "text":
            text = content[0]["text"]
            if text:
                try:
                    return json.loads(text)
                except json.JSONDecodeError:
                    return text
        return None

    async def list_products(self, category: str | None = None) -> list[dict]:
        if not self._healthy:
            return self._fallback_products()
        result = await self._call("list_products")
        if result:
            return result
        return self._fallback_products()

    async def get_product(self, product_id: str) -> dict | None:
        return await self._call("get_product", {"productId": product_id})

    async def list_categories(self) -> list[dict]:
        if not self._healthy:
            return self._fallback_categories()
        result = await self._call("list_categories")
        if result:
            return result
        return self._fallback_categories()

    async def create_order(self, items: list[dict], customer_name: str = "", note: str = "") -> dict | None:
        if not self._healthy:
            return {"id": f"local_{hash(str(items))}", "status": "pending"}
        args = {"items": items}
        if customer_name:
            args["customerName"] = customer_name
        if note:
            args["note"] = note
        return await self._call("create_order", args)

    async def list_orders(self, status: str | None = None) -> list[dict]:
        if not self._healthy:
            return []
        args = {}
        if status:
            args["status"] = status
        result = await self._call("list_orders", args)
        return result or []

    async def get_order(self, order_id: str) -> dict | None:
        return await self._call("get_order", {"orderId": order_id})

    # ── Fallback data (hardcoded sample) ──

    def _fallback_categories(self) -> list[dict]:
        return [
            {"id": "cat_app", "name": "🍤 ของทานเล่น"},
            {"id": "cat_main", "name": "🍚 อาหารตามสั่ง"},
            {"id": "cat_fry", "name": "🍳 ของทอด"},
            {"id": "cat_soup", "name": "🍜 ต้ม / น้ำตก"},
            {"id": "cat_des", "name": "🍰 ของหวาน"},
            {"id": "cat_bev", "name": "🥤 เครื่องดื่ม"},
        ]

    def _fallback_products(self) -> list[dict]:
        return [
            {"id": "1", "name": "ข้าวผัดกระเพราหมูกรอบ", "price": 70, "category": "อาหารตามสั่ง"},
            {"id": "2", "name": "ข้าวผัดกระเพราไก่", "price": 60, "category": "อาหารตามสั่ง"},
            {"id": "3", "name": "ข้าวผัดกระเพราหมูสับ", "price": 60, "category": "อาหารตามสั่ง"},
            {"id": "4", "name": "ข้าวผัดกระเพราทะเล", "price": 80, "category": "อาหารตามสั่ง"},
            {"id": "5", "name": "ข้าวผัดกระเพราไข่ดาว", "price": 65, "category": "อาหารตามสั่ง"},
            {"id": "6", "name": "ก๋วยเตี๋ยวคั่วไก่", "price": 55, "category": "อาหารตามสั่ง"},
            {"id": "7", "name": "ผัดซีอิ๊วหมู", "price": 55, "category": "อาหารตามสั่ง"},
            {"id": "8", "name": "ผัดซีอิ๊วทะเล", "price": 70, "category": "อาหารตามสั่ง"},
            {"id": "9", "name": "ข้าวขาหมู", "price": 65, "category": "อาหารตามสั่ง"},
            {"id": "10", "name": "ปีกไก่ทอด", "price": 50, "category": "ของทอด"},
            {"id": "11", "name": "หมูกรอบทอด", "price": 55, "category": "ของทอด"},
            {"id": "12", "name": "ปลาหมึกทอด", "price": 60, "category": "ของทอด"},
            {"id": "13", "name": "ต้มยำกุ้ง", "price": 80, "category": "ต้ม / น้ำตก"},
            {"id": "14", "name": "ต้มข่าไก่", "price": 70, "category": "ต้ม / น้ำตก"},
            {"id": "15", "name": "น้ำตกหมู", "price": 65, "category": "ต้ม / น้ำตก"},
            {"id": "16", "name": "ทอดมันปลา", "price": 40, "category": "ของทานเล่น"},
            {"id": "17", "name": "ขนมจีบ", "price": 35, "category": "ของทานเล่น"},
            {"id": "18", "name": "ข้าวเหนียวมะม่วง", "price": 50, "category": "ของหวาน"},
            {"id": "19", "name": "ลอดช่องน้ำกะทิ", "price": 35, "category": "ของหวาน"},
            {"id": "20", "name": "น้ำเปล่า", "price": 10, "category": "เครื่องดื่ม"},
            {"id": "21", "name": "โค้ก", "price": 20, "category": "เครื่องดื่ม"},
            {"id": "22", "name": "น้ำส้ม", "price": 25, "category": "เครื่องดื่ม"},
            {"id": "23", "name": "น้ำชาเขียว", "price": 30, "category": "เครื่องดื่ม"},
        ]
