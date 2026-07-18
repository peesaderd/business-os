"""Shared configuration for messaging-platform."""
import os
from dotenv import load_dotenv

load_dotenv()

# Core
CORE_HOST = os.getenv("CORE_HOST", "127.0.0.1")
CORE_PORT = int(os.getenv("CORE_PORT", "8300"))

# Adapter ports
LINE_ADAPTER_PORT = int(os.getenv("LINE_ADAPTER_PORT", "8310"))
TG_ADAPTER_PORT = int(os.getenv("TG_ADAPTER_PORT", "8320"))
WA_ADAPTER_PORT = int(os.getenv("WA_ADAPTER_PORT", "8330"))

# ERP MCP
ERP_MCP_PATH = os.getenv("ERP_MCP_PATH", "/home/openhands/erp-core/build/index.js")
ERP_TENANT_ID = os.getenv("ERP_TENANT_ID", "demo")

# LINE
LINE_CHANNEL_ACCESS_TOKEN = os.getenv("LINE_CHANNEL_ACCESS_TOKEN", "")
LINE_CHANNEL_SECRET = os.getenv("LINE_CHANNEL_SECRET", "")

# Telegram
TG_BOT_TOKEN = os.getenv("TG_BOT_TOKEN", "")

# WhatsApp
WA_API_TOKEN = os.getenv("WA_API_TOKEN", "")
WA_PHONE_NUMBER_ID = os.getenv("WA_PHONE_NUMBER_ID", "")

# Database
DB_PATH = os.getenv("DB_PATH", "data/messaging.db")
