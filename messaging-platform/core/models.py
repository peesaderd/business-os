"""Pydantic models for the messaging platform."""
from __future__ import annotations
from pydantic import BaseModel, Field
from typing import Optional
from enum import Enum


class Channel(str, Enum):
    LINE = "line"
    TELEGRAM = "telegram"
    WHATSAPP = "whatsapp"


class MessageType(str, Enum):
    TEXT = "text"
    IMAGE = "image"
    STICKER = "sticker"
    LOCATION = "location"


class IncomingMessage(BaseModel):
    """Normalized message from adapter → core."""
    channel: Channel
    channel_user_id: str
    message_type: MessageType = MessageType.TEXT
    text: Optional[str] = None
    reply_token: Optional[str] = None
    raw: Optional[dict] = None


class OutgoingMessage(BaseModel):
    """Message to send back via adapter."""
    type: str = "text"  # text, image, flex, etc.
    text: Optional[str] = None
    alt_text: Optional[str] = None
    extra: Optional[dict] = None  # channel-specific payload


class CoreResponse(BaseModel):
    """Response from core to adapter."""
    messages: list[OutgoingMessage] = Field(default_factory=list)
    end_session: bool = False


class SessionState(BaseModel):
    """Current user session state."""
    channel: Channel
    channel_user_id: str
    current_intent: Optional[str] = None  # main_menu, browsing, ordering, confirm, payment
    cart: list[dict] = Field(default_factory=list)
    context: dict = Field(default_factory=dict)
    last_message: Optional[str] = None
    created_at: Optional[str] = None
