"""Core FastAPI server — receives normalized messages, returns replies."""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from pydantic import BaseModel

from .models import IncomingMessage, CoreResponse, Channel
from .engine import MessagingEngine
from .config import CORE_HOST, CORE_PORT

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("core")

# ── Global engine instance ──
engine: MessagingEngine | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global engine
    engine = MessagingEngine()
    await engine.start()
    logger.info("Core engine started on %s:%s", CORE_HOST, CORE_PORT)
    yield
    await engine.stop()
    logger.info("Core engine stopped")


app = FastAPI(title="Messaging Core", version="1.0.0", lifespan=lifespan)


@app.get("/health")
async def health():
    return {"status": "ok", "engine": engine is not None and engine._started}


@app.post("/message", response_model=CoreResponse)
async def handle_message(msg: IncomingMessage):
    """Receive a normalized message from an adapter → process → return replies."""
    logger.info("MSG [%s|%s]: %s", msg.channel.value, msg.channel_user_id[:12], (msg.text or "")[:60])
    return await engine.process(msg)


def run():
    import uvicorn
    uvicorn.run(app, host=CORE_HOST, port=CORE_PORT)


if __name__ == "__main__":
    run()
