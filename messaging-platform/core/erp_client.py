"""Async ERP Core MCP client using stdio JSON-RPC protocol."""
import asyncio
import json
import logging
from typing import Any

logger = logging.getLogger(__name__)

MCP_PATH = "/home/openhands/erp-core/build/index.js"
TENANT_ID = "demo"


class ErpClient:
    """Manages a child ERP MCP server process over stdio JSON-RPC."""

    def __init__(self, mcp_path: str = MCP_PATH, tenant_id: str = TENANT_ID):
        self._mcp_path = mcp_path
        self._tenant_id = tenant_id
        self._proc: asyncio.subprocess.Process | None = None
        self._request_id = 0
        self._lock = asyncio.Lock()
        self._initialized = False

    async def start(self):
        """Spawn the Node.js MCP process and initialize."""
        logger.info("Starting ERP MCP process: %s", self._mcp_path)
        self._proc = await asyncio.create_subprocess_exec(
            "node", self._mcp_path,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        # Initialize handshake
        await self._send_rpc("initialize", {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {"name": "messaging-core", "version": "1.0.0"},
        })
        # Send initialized notification
        await self._send_rpc("notifications/initialized", {})
        self._initialized = True
        logger.info("ERP MCP initialized successfully")

    async def _send_rpc(self, method: str, params: dict) -> dict[str, Any]:
        """Send a JSON-RPC request and wait for the response."""
        self._request_id += 1
        req = {
            "jsonrpc": "2.0",
            "id": self._request_id,
            "method": method,
            "params": params,
        }
        if not self._proc or not self._proc.stdin:
            raise RuntimeError("ERP MCP process not running")

        request_line = json.dumps(req, ensure_ascii=False) + "\n"
        self._proc.stdin.write(request_line.encode("utf-8"))
        await self._proc.stdin.drain()

        # Read response lines until we find matching id
        while True:
            line = await self._proc.stdout.readline()
            if not line:
                raise RuntimeError("ERP MCP process closed stdout")
            try:
                resp = json.loads(line.decode("utf-8").strip())
            except json.JSONDecodeError:
                continue
            if resp.get("id") == self._request_id:
                if "error" in resp:
                    raise RuntimeError(f"ERP RPC error: {resp['error']}")
                return resp.get("result", {})

    async def call_tool(self, name: str, arguments: dict | None = None) -> Any:
        """Call an MCP tool."""
        if not self._initialized:
            await self.start()
        if arguments is None:
            arguments = {}
        if "tenantId" not in arguments:
            arguments["tenantId"] = self._tenant_id
        result = await self._send_rpc("tools/call", {
            "name": name,
            "arguments": arguments,
        })
        # MCP tool results are in result.content
        content = result.get("content", [])
        for item in content:
            if item.get("type") == "text":
                return json.loads(item["text"])
        return content

    # ── Convenience methods ──

    async def list_products(self, category: str | None = None) -> list[dict]:
        params = {"tenantId": self._tenant_id}
        if category:
            params["category"] = category
        return await self.call_tool("list_products", params)

    async def get_product(self, product_id: str) -> dict:
        return await self.call_tool("get_product", {"productId": product_id})

    async def list_categories(self) -> list[str]:
        """Derive categories from products (ERP has no direct category endpoint)."""
        products = await self.list_products()
        cats = set()
        for p in products:
            cat = p.get("category") or p.get("category_name", "")
            if cat:
                cats.add(cat)
        return sorted(cats)

    async def create_order(self, items: list[dict], customer_name: str = "", note: str = "") -> dict:
        return await self.call_tool("create_order", {
            "items": items,
            "customerName": customer_name,
            "note": note,
            "tenantId": self._tenant_id,
        })

    async def list_orders(self, status: str | None = None) -> list[dict]:
        params = {"tenantId": self._tenant_id}
        if status:
            params["status"] = status
        return await self.call_tool("list_orders", params)

    async def get_order(self, order_id: str) -> dict:
        return await self.call_tool("get_order", {"orderId": order_id})

    async def stop(self):
        """Terminate the MCP process."""
        if self._proc:
            self._proc.terminate()
            try:
                await asyncio.wait_for(self._proc.wait(), timeout=5)
            except asyncio.TimeoutError:
                self._proc.kill()
            self._proc = None
            self._initialized = False
