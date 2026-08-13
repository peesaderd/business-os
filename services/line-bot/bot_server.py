#!/usr/bin/env python3
"""
LINE Bot Server — รับข้อความ/รูปจากลูกค้า → เช็คสลิป → แจ้ง Admin
"""

import os
import sys
import json
import tempfile
import requests
from pathlib import Path
from datetime import datetime

from flask import Flask, request, abort, jsonify

from linebot import LineBotApi, WebhookHandler
from linebot.exceptions import InvalidSignatureError
from linebot.models import (
    MessageEvent, TextMessage, ImageMessage, FlexSendMessage,
    TextSendMessage, QuickReply, QuickReplyButton, URIAction
)

# Add parent dir for slip_checker import
sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from slip_checker import check_slip

app = Flask(__name__)

# LINE Config
LINE_CHANNEL_ACCESS_TOKEN = os.environ.get("LINE_CHANNEL_ACCESS_TOKEN", "")
LINE_CHANNEL_SECRET = os.environ.get("LINE_CHANNEL_SECRET", "")
ADMIN_USER_ID = os.environ.get("LINE_ADMIN_USER_ID", "")  # Admin's LINE userId

line_bot_api = LineBotApi(LINE_CHANNEL_ACCESS_TOKEN)
handler = WebhookHandler(LINE_CHANNEL_SECRET)


# ── Store admin user ID from first message ──────────────────────
STATE_FILE = Path(__file__).parent / "state.json"

def load_state():
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text())
    return {"admin_user_id": ADMIN_USER_ID, "registered_users": []}

def save_state(state):
    STATE_FILE.write_text(json.dumps(state, ensure_ascii=False, indent=2))


# ── Notify admin via Push Message ──────────────────────────────
def notify_admin(text, image_path=None):
    """Push message to admin."""
    state = load_state()
    admin_id = state.get("admin_user_id")

    if not admin_id:
        print("[WARN] No admin_user_id set. Skipping notification.")
        return False

    try:
        # Send text
        line_bot_api.push_message(admin_id, TextSendMessage(text=text))

        # Send image if provided
        if image_path and Path(image_path).exists():
            with open(image_path, "rb") as f:
                import io
                img_data = io.BytesIO(f.read())
                line_bot_api.push_message(
                    admin_id,
                    ImageMessage(
                        original_content_url=f"data:image/jpeg;base64,{__import__('base64').b64encode(img_data.getvalue()).decode()}",
                        preview_image_url=f"data:image/jpeg;base64,{__import__('base64').b64encode(img_data.getvalue()).decode()}"
                    )
                )
        return True
    except Exception as e:
        print(f"[ERROR] Notify admin failed: {e}")
        return False


def notify_admin_with_slip(slip_result, user_id):
    """Notify admin with slip analysis result."""
    summary = slip_result.get("summary", {})
    now = datetime.now().strftime("%Y-%m-%d %H:%M")

    # Build notification text
    lines = [
        f"🔔 สลิปโอนเงินใหม่!",
        f"━━━━━━━━━━━━━━━━",
    ]

    if summary.get("amount"):
        lines.append(f"💰 จำนวนเงิน: ฿{summary['amount']:,.2f}")

    if summary.get("sender_bank"):
        lines.append(f"🏦 ธนาคารต้นทาง: {summary['sender_bank']}")

    if summary.get("sender_name"):
        lines.append(f"👤 ผู้โอน: {summary['sender_name']}")

    if summary.get("receiver_name"):
        lines.append(f"👤 ผู้รับ: {summary['receiver_name']}")

    if summary.get("date"):
        lines.append(f"📅 วันที่: {summary['date']}")

    if summary.get("time"):
        lines.append(f"⏰ เวลา: {summary['time']}")

    # QR info
    qr = slip_result.get("qr", {})
    if qr and qr.get("parsed"):
        qr_amount = qr["parsed"].get("amount")
        if qr_amount:
            lines.append(f"📱 QR Amount: ฿{qr_amount:,.2f}")

    lines.extend([
        f"━━━━━━━━━━━━━━━━",
        f"👤 User ID: {user_id[:8]}...",
        f"🕐 แจ้งเตือนเมื่อ: {now}",
    ])

    text = "\n".join(lines)
    notify_admin(text)

    # Also send slip image to admin
    slip_image = slip_result.get("image")
    if slip_image:
        try:
            # Upload and send image
            with open(slip_image, "rb") as f:
                img_data = f.read()
            import base64
            b64 = base64.b64encode(img_data).decode()
            line_bot_api.push_message(
                load_state().get("admin_user_id"),
                ImageMessage(
                    original_content_url=f"data:image/jpeg;base64,{b64}",
                    preview_image_url=f"data:image/jpeg;base64,{b64}"
                )
            )
        except Exception as e:
            print(f"[WARN] Failed to send slip image: {e}")


# ── Webhook handler ─────────────────────────────────────────────
@app.route("/callback", methods=["POST"])
def callback():
    signature = request.headers.get("X-Line-Signature", "")
    body = request.get_data(as_text=True)

    try:
        handler.handle(body, signature)
    except InvalidSignatureError:
        abort(400)

    return "OK"


@handler.add(MessageEvent, message=TextMessage)
def handle_text(event):
    """Handle text messages."""
    user_id = event.source.user_id
    text = event.message.text.strip()
    state = load_state()

    # Register admin
    if text == "/admin" or text == "admin":
        state["admin_user_id"] = user_id
        save_state(state)
        line_bot_api.reply_message(
            event.reply_token,
            TextSendMessage(text=f"✅ ลงทะเบียน Admin สำเร็จ!\nUser ID: {user_id[:8]}...")
        )
        print(f"[INFO] Admin registered: {user_id}")
        return

    # Help
    if text in ["/help", "help", "ช่วยเหลือ"]:
        help_text = (
            "🤖 LINE Bot — Slip Checker\n\n"
            "📷 ส่งรูปสลิป → ระบบจะเช็คให้อัตโนมัติ\n\n"
            "คำสั่ง:\n"
            "• /admin — ลงทะเบียนเป็น Admin\n"
            "• /status — ดูสถานะ\n"
            "• /help — ดูคำสั่ง"
        )
        line_bot_api.reply_message(
            event.reply_token,
            TextSendMessage(text=help_text)
        )
        return

    # Status
    if text in ["/status", "status", "สถานะ"]:
        admin_id = state.get("admin_user_id", "Not set")
        admin_display = f"{admin_id[:8]}..." if admin_id else "Not set"
        status_text = (
            f"📊 สถานะ Bot:\n\n"
            f"👤 Admin: {admin_display}\n"
            f"📝 Registered users: {len(state.get('registered_users', []))}"
        )
        line_bot_api.reply_message(
            event.reply_token,
            TextSendMessage(text=status_text)
        )
        return

    # Default response
    line_bot_api.reply_message(
        event.reply_token,
        TextSendMessage(
            text="📷 ส่งรูปสลิปมาได้เลยครับ!\nระบบจะเช็คและแจ้ง Admin ให้",
            quick_reply=QuickReply(items=[
                QuickReplyButton(action=URIAction(label="📱 วิธีใช้งาน", uri="https://example.com/help")),
            ])
        )
    )


@handler.add(MessageEvent, message=ImageMessage)
def handle_image(event):
    """Handle image messages — analyze slip."""
    user_id = event.source.user_id
    state = load_state()

    # Register user if not exists
    if user_id not in state.get("registered_users", []):
        state.setdefault("registered_users", []).append(user_id)
        save_state(state)

    # Acknowledge receipt
    line_bot_api.reply_message(
        event.reply_token,
        TextSendMessage(text="⏳ กำลังเช็คสลิป...")
    )

    try:
        # Download image
        message_content = line_bot_api.get_message_content(event.message_id)
        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
            tmp.write(message_content.content)
            tmp_path = tmp.name

        # Run slip checker
        result = check_slip(tmp_path)
        summary = result.get("summary", {})

        # Build response
        lines = ["✅ เช็คสลิปสำเร็จ!\n"]

        if summary.get("amount"):
            lines.append(f"💰 จำนวนเงิน: ฿{summary['amount']:,.2f}")

        if summary.get("sender_bank"):
            lines.append(f"🏦 ธนาคาร: {summary['sender_bank']}")

        if summary.get("sender_name"):
            lines.append(f"👤 ผู้โอน: {summary['sender_name']}")

        if summary.get("receiver_name"):
            lines.append(f"👤 ผู้รับ: {summary['receiver_name']}")

        if summary.get("account_last4"):
            accs = summary["account_last4"]
            if accs:
                lines.append(f"🔢 เลขบัญชี: ...{accs[-1]}")

        # QR info
        qr = result.get("qr", {})
        if qr and qr.get("parsed"):
            qr_amount = qr["parsed"].get("amount")
            if qr_amount:
                lines.append(f"📱 QR Amount: ฿{qr_amount:,.2f}")

        response_text = "\n".join(lines)

        # Reply to user
        line_bot_api.reply_message(
            event.reply_token,
            TextSendMessage(text=response_text)
        )

        # Notify admin
        notify_admin_with_slip(result, user_id)

        # Cleanup
        os.unlink(tmp_path)

    except Exception as e:
        print(f"[ERROR] Slip check failed: {e}")
        line_bot_api.reply_message(
            event.reply_token,
            TextSendMessage(text="❌ เช็คสลิปไม่สำเร็จ กรุณาส่งรูปใหม่")
        )


# ── Health check ────────────────────────────────────────────────
@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "line-bot-slip-checker"})


@app.route("/", methods=["GET"])
def index():
    return jsonify({
        "service": "LINE Bot - Slip Checker",
        "version": "1.0.0",
        "endpoints": {
            "webhook": "/callback",
            "health": "/health"
        }
    })


if __name__ == "__main__":
    port = int(os.environ.get("LINE_BOT_PORT", 8110))
    print(f"🤖 Starting LINE Bot on port {port}")
    app.run(host="0.0.0.0", port=port, debug=True)
