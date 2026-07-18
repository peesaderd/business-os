"""WhatsApp Adapter (stub) — webhook receiver + core forwarder."""
import logging
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI, Request
from fastapi.responses import PlainTextResponse
import httpx

from core.config import WA_ADAPTER_PORT, WA_API_TOKEN, WA_PHONE_NUMBER_ID, CORE_HOST, CORE_PORT

logging.basicConfig(level=logging.INFO, format="%(asctime)s [wa-adapter] %(message)s")
logger = logging.getLogger("wa-adapter")

CORE_URL = f"http://{CORE_HOST}:{CORE_PORT}"

app = FastAPI(title="WhatsApp Adapter", version="1.0.0")


@app.post("/wa/webhook")
async def webhook(request: Request):
    """WhatsApp Cloud API webhook."""
    body = await request.json()
    logger.info("Received WA update: %s", body)
    return PlainTextResponse("OK")


@app.get("/wa/webhook")
async def verify(request: Request):
    # Meta webhook verification
    mode = request.query_params.get("hub.mode")
    token = request.query_params.get("hub.verify_token")
    challenge = request.query_params.get("hub.challenge")
    if mode == "subscribe" and token == WA_API_TOKEN[:8]:
        return PlainTextResponse(challenge or "OK")
    return PlainTextResponse("Forbidden", status_code=403)


@app.get("/health")
async def health():
    return {"status": "ok"}


def run():
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=WA_ADAPTER_PORT)


if __name__ == "__main__":
    run()
