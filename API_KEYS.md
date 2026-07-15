# API Keys — Reference for Agents & Tools

> อัปเดตล่าสุด: 2026-07-06

## Active Keys ✅

| Provider | Key | ใช้กับอะไรได้ | ช่องทาง |
|----------|-----|-------------|--------|
| **OpenCode Go** | `sk-LTP…ngi0` | OpenCode CLI + OpenCode Proxy (OpenAI-compatible) | `opencode run`, `localhost:8777/v1` |
| **Mistral** | `6sifzr…VScg` | OpenAI-compatible API (Aider, curl, python) | `MISTRAL_API_KEY` env |
| **Gemini** | `AQ.Ab8RN6K2…FoYg` | Google AI Studio (Aider, curl) | `GEMINI_API_KEY` env |

## Services Running

| Service | Port | Purpose |
|---------|------|---------|
| **OpenCode Proxy** | `8777` | OpenAI-compatible → OpenCode API |
| **LiteLLM Proxy** | `9010` | Route OpenCode via OpenAI format (optional) |
| **Prodia Image** | `8110` | Image generation |

## Running Aider

### ตัวเลือก 1: Mistral (ใช้ได้ 100%)
```bash
export MISTRAL_API_KEY="6sifzr…VScg"
aider --model mistral/codestral-latest
```

### ตัวเลือก 2: Gemini
```bash
export GEMINI_API_KEY="***"
aider --model gemini/gemini-2.5-flash
```

### ตัวเลือก 3: OpenCode Proxy (OpenAI-compatible)
```bash
curl http://localhost:8777/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"opencode-go/deepseek-v4-flash","messages":[{"role":"user","content":"hi"}]}'
```

### ตัวเลือก 4: OpenCode CLI (native)
```bash
opencode run --model opencode-go/deepseek-v4-flash "your task"
```

## OpenCode Proxy Details

- **API Base**: `http://localhost:8777/v1`
- **API Key**: `sk-opencode-proxy` (ไม่ต้องเช็คก็ได้)
- **Endpoints**: `/v1/models`, `/v1/chat/completions`, `/health`
- **Status**: ✅ ทำงานแล้ว!
- **Manage**: `/home/openhands/erp-stack/opencode_proxy.py`

## For Sub-Agents / Spawns

เวลาสร้าง sub-agent ที่ต้องการ Aider, ส่ง key ไปด้วย:
```
- MISTRAL_API_KEY environment variable
- GEMINI_API_KEY environment variable
- OpenCode Proxy at localhost:8777 (already running)
```

## Dead Keys ❌

| Provider | Key | Issue |
|----------|-----|-------|
| Gemini (old) | `AIzaSy…Im5w` | Invalid |
