"""LINE Adapter — receives webhooks from LINE, calls Core, sends reply."""
import logging
import json
import os
import sys
import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import PlainTextResponse
import httpx

# Add parent dir so imports work
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from adapters import LineBotClient
from core.config import (
    LINE_ADAPTER_PORT, LINE_CHANNEL_ACCESS_TOKEN, LINE_CHANNEL_SECRET,
    CORE_HOST, CORE_PORT,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] line-adapter: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("line-adapter")

CORE_URL = f"http://{CORE_HOST}:{CORE_PORT}"

bot: LineBotClient | None = None
if LINE_CHANNEL_ACCESS_TOKEN and LINE_CHANNEL_SECRET:
    bot = LineBotClient(LINE_CHANNEL_ACCESS_TOKEN, LINE_CHANNEL_SECRET)
else:
    logger.warning("LINE credentials not set — adapter will reject all requests")

app = FastAPI(title="LINE Adapter", version="1.0.0")


@app.get("/line/webhook")
async def verify():
    """LINE webhook verification."""
    return PlainTextResponse("OK")


@app.post("/line/webhook")
async def webhook(request: Request):
    """Receive LINE webhook events."""
    body = await request.body()
    signature = request.headers.get("x-line-signature", "")

    if not bot:
        logger.warning("Bot not configured")
        return PlainTextResponse("Unauthorized", status_code=401)

    if not bot.verify_signature(body, signature):
        logger.warning("Invalid signature")
        return PlainTextResponse("Invalid signature", status_code=401)

    payload = json.loads(body)
    events = payload.get("events", [])

    for event in events:
        event_type = event.get("type", "")
        reply_token = event.get("replyToken", "")
        source = event.get("source", {})
        user_id = source.get("userId", "")

        if event_type == "message":
            msg = event.get("message", {})
            if msg.get("type") == "text":
                text = msg.get("text", "")
                logger.info("FROM %s: %s", user_id[:12], text[:60])
                asyncio.create_task(_process_and_reply(reply_token, user_id, text))

        elif event_type == "follow":
            logger.info("User followed: %s", user_id[:12])
            asyncio.create_task(_process_and_reply(reply_token, user_id, "เริ่ม"))

    return PlainTextResponse("OK")


async def _process_and_reply(reply_token: str, user_id: str, text: str):
    """Send message to Core engine, then reply via LINE."""
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(f"{CORE_URL}/message", json={
                "channel": "line",
                "channel_user_id": user_id,
                "message_type": "text",
                "text": text,
                "reply_token": reply_token,
            })

            if resp.status_code != 200:
                logger.error("Core error: %s — %s", resp.status_code, resp.text[:200])
                _try_reply(reply_token, user_id, "⚠️ ระบบมีปัญหา กรุณาลองใหม่")
                return

            data = resp.json()
            messages = data.get("messages", [])
            if not messages:
                return

            for msg in messages:
                msg_text = msg.get("text", "")
                if msg_text:
                    _try_reply(reply_token, user_id, msg_text)
    except Exception as e:
        logger.error("Process error: %s", e)
        _try_reply(reply_token, user_id, "⚠️ ระบบมีปัญหา กรุณาลองใหม่")


def _try_reply(reply_token: str, user_id: str, text: str):
    """Try reply first, fallback to push message."""
    if not bot:
        return
    try:
        # LINE limits text to 5000 chars per message — split if needed
        while len(text) > 5000:
            idx = text.rfind("\n", 0, 5000)
            if idx < 0:
                idx = 5000
            bot.reply_text(reply_token, text[:idx])
            text = text[idx:].lstrip("\n")
        if text:
            bot.reply_text(reply_token, text)
    except Exception as e:
        logger.error("Reply failed: %s", e)
        try:
            bot.push_text(user_id, text)
        except Exception as e2:
            logger.error("Push fallback also failed: %s", e2)


@app.get("/health")
async def health():
    return {"status": "ok", "bot_configured": bot is not None}


def run():
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=LINE_ADAPTER_PORT)


if __name__ == "__main__":
    run()
