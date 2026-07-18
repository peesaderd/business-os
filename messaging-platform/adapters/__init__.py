"""Adapter for sending messages between core and LINE."""
import json
import logging
from typing import Optional

import requests

logger = logging.getLogger(__name__)

BASE_URL = "https://api.line.me/v2/bot"


class LineBotClient:
    """Thin wrapper around LINE Messaging API."""

    def __init__(self, channel_access_token: str, channel_secret: str):
        self._token = channel_access_token
        self._secret = channel_secret
        self._headers = {
            "Authorization": f"Bearer {self._token}",
            "Content-Type": "application/json",
        }

    def reply(self, reply_token: str, messages: list[dict]) -> bool:
        """Send reply messages via LINE reply API."""
        payload = {"replyToken": reply_token, "messages": messages}
        resp = requests.post(
            f"{BASE_URL}/message/reply",
            headers=self._headers,
            json=payload,
            timeout=10,
        )
        if not resp.ok:
            logger.error("LINE reply failed: %s — %s", resp.status_code, resp.text[:200])
        return resp.ok

    def reply_text(self, reply_token: str, text: str) -> bool:
        return self.reply(reply_token, [{"type": "text", "text": text}])

    def push_text(self, user_id: str, text: str) -> bool:
        """Send push message to a user."""
        resp = requests.post(
            f"{BASE_URL}/message/push",
            headers=self._headers,
            json={"to": user_id, "messages": [{"type": "text", "text": text}]},
            timeout=10,
        )
        if not resp.ok:
            logger.error("LINE push failed: %s — %s", resp.status_code, resp.text[:200])
        return resp.ok

    def get_profile(self, user_id: str) -> Optional[dict]:
        resp = requests.get(
            f"{BASE_URL}/profile/{user_id}",
            headers=self._headers,
            timeout=10,
        )
        if resp.ok:
            return resp.json()
        logger.warning("LINE profile fetch failed: %s", resp.status_code)
        return None

    def build_text_message(self, text: str) -> list[dict]:
        """Convert plain text into LINE message segments (handles >5000 chars)."""
        messages = []
        # LINE limit: 5000 chars per message
        while len(text) > 5000:
            idx = text.rfind("\n", 0, 5000)
            if idx < 0:
                idx = 5000
            messages.append({"type": "text", "text": text[:idx]})
            text = text[idx:].lstrip("\n")
        if text:
            messages.append({"type": "text", "text": text})
        return messages

    def verify_signature(self, body: bytes, signature: str) -> bool:
        """Validate x-line-signature."""
        import hashlib
        import hmac
        expected = hmac.new(
            self._secret.encode("utf-8"),
            body,
            hashlib.sha256,
        ).hexdigest()
        return hmac.compare_digest(expected, signature)
