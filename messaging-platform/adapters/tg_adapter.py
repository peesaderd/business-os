"""Telegram Adapter (stub) — webhook receiver + core forwarder."""
import logging
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI, Request
from fastapi.responses import PlainTextResponse
import httpx

from core.config import TG_ADAPTER_PORT, TG_BOT_TOKEN, CORE_HOST, CORE_PORT

logging.basicConfig(level=logging.INFO, format="%(asctime)s [tg-adapter] %(message)s")
logger = logging.getLogger("tg-adapter")

CORE_URL = f"http://{CORE_HOST}:{CORE_PORT}"

app = FastAPI(title="Telegram Adapter", version="1.0.0")


@app.post("/tg/webhook")
async def webhook(request: Request):
    """Telegram webhook receiver."""
    body = await request.json()
    logger.info("Received TG update: %s", body)
    return PlainTextResponse("OK")


@app.get("/tg/webhook")
async def verify():
    return PlainTextResponse("OK")


@app.get("/health")
async def health():
    return {"status": "ok"}


def run():
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=TG_ADAPTER_PORT)


if __name__ == "__main__":
    run()
