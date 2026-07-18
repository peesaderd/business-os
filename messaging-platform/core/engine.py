"""Message processing engine — routes intents and manages flow."""
import logging
from .session import SessionManager
from .erp_client import ErpClient
from .handlers import handle_order_intent
from .models import IncomingMessage, OutgoingMessage, CoreResponse, Channel

logger = logging.getLogger(__name__)


class MessagingEngine:
    """Core business logic: receive a message, process it, return replies."""

    def __init__(self):
        self.session = SessionManager()
        self.erp = ErpClient()
        self._started = False

    async def start(self):
        if not self._started:
            await self.erp.start()
            self._started = True

    async def stop(self):
        await self.erp.stop()
        self._started = False

    async def process(self, msg: IncomingMessage) -> CoreResponse:
        """Main entry: process an incoming message and return responses."""
        user_id = msg.channel_user_id
        channel = msg.channel.value
        text = (msg.text or "").strip()

        # Track user
        self.session.track_user(channel, user_id)

        # Get current session state
        session_data = self.session.get_session(channel, user_id)
        current_intent = session_data.get("intent", "")

        # ── System commands ──
        if text.lower() in ("help", "ช่วยเหลือ", "?"):
            return CoreResponse(messages=[
                OutgoingMessage(text=(
                    "🤖 ยินดีต้อนรับสู่ PeteAI POS!\n\n"
                    "คำสั่งที่ใช้ได้:\n"
                    "  • 'เมนู' หรือ 'menu' — ดูรายการอาหาร\n"
                    "  • '#ชื่อหมวด' — ค้นหาตามหมวด เช่น '#เครื่องดื่ม'\n"
                    "  • 'พิมพ์ชื่อเมนู' — เพิ่มสินค้าเข้าตะกร้า\n"
                    "  • 'ยืนยัน' — สั่งสินค้าในตะกร้า\n"
                    "  • 'ยกเลิก' — ยกเลิกการสั่ง\n"
                    "  • 'สถานะ' — เช็คออเดอร์ล่าสุด\n"
                    "  • 'ตะกร้า' — ดูรายการในตะกร้า\n"
                    "  • 'เริ่มใหม่' — รีเซ็ต会话"
                ))
            ])

        if text.lower() in ("start", "เริ่ม", "begin", "สวัสดี", "hello", "hi"):
            return CoreResponse(messages=[
                OutgoingMessage(text=(
                    "สวัสดีครับ! 👋\n"
                    "ยินดีต้อนรับสู่ร้าน!\n\n"
                    "พิมพ์ 'เมนู' เพื่อดูรายการอาหาร\n"
                    "หรือพิมพ์ 'help' เพื่อดูคำสั่งทั้งหมด"
                ))
            ])

        if text.lower() in ("เริ่มใหม่", "reset", "clear"):
            self.session.save_session(channel, user_id, {"intent": None, "cart": [], "context": {}})
            return CoreResponse(messages=[
                OutgoingMessage(text="✅ รีเซ็ตเรียบร้อย เริ่มใหม่อีกครั้ง!")
            ])

        # ── Route to intent handler ──
        handler_result = await handle_order_intent(text, session_data, self.erp)

        # Build response
        reply_messages = [OutgoingMessage(text=t) for t in handler_result.get("messages", []) if t]
        if not reply_messages:
            reply_messages = [OutgoingMessage(text="⚠️ ไม่เข้าใจ ลองพิมพ์ 'help' ดูครับ")]

        # Persist session updates
        new_intent = handler_result.get("new_intent")
        new_cart = handler_result.get("cart")
        if new_intent is not None or new_cart is not None:
            session_data["intent"] = new_intent or current_intent
            if new_cart is not None:
                session_data["cart"] = new_cart
            self.session.save_session(channel, user_id, session_data)

        return CoreResponse(messages=reply_messages)
