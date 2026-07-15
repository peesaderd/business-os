---
name: "use-aider-with-opencode"
description: "Use Aider with OpenCode API. 13 Go models. Never use DeepSeek API directly."
---

# Use Aider with OpenCode API

**Key rule:** Every Aider code change MUST use OpenCode API via the `opencode-aider` wrapper. Never invoke DeepSeek API directly.

## Why
- DeepSeek API credits keep running out
- OpenCode Go subscription has its own credit pool
- `opencode-aider` wrapper routes through the OpenCode Proxy

## Available OpenCode Go Models
| Model ID | Reasoning | Use Case |
|----------|-----------|----------|
| `opencode-go/deepseek-v4-flash` | No | Fast, default for most tasks |
| `opencode-go/deepseek-v4-pro` | Yes | Heavy reasoning, complex code |
| `opencode-go/glm-5.1` | No | General purpose |
| `opencode-go/glm-5.2` | No | Improved GLM |
| `opencode-go/kimi-k2.6` | No | General purpose |
| `opencode-go/kimi-k2.7-code` | No | Code-focused |
| `opencode-go/mimo-v2.5` | No | Fast, lightweight |
| `opencode-go/mimo-v2.5-pro` | No | Better Mimo |
| `opencode-go/minimax-m2.7` | No | General |
| `opencode-go/minimax-m3` | No | Latest MiniMax |
| `opencode-go/qwen3.6-plus` | No | Strong all-rounder |
| `opencode-go/qwen3.7-max` | Yes | Best reasoning (slow) |
| `opencode-go/qwen3.7-plus` | No | Fast strong model |

Set model via: `export OPENCODE_AIDER_MODEL="opencode-go/qwen3.7-plus"`

## Prerequisites
```bash
# Check OpenCode proxy is running
curl -s --connect-timeout 3 http://localhost:8777/health
```
If proxy is down, restart it:
```bash
fuser -k 8777/tcp 2>/dev/null; sleep 1
cd /home/openhands/erp-stack && nohup python3 opencode_proxy.py > /tmp/opencode-proxy.log 2>&1 &
sleep 4
```

## Model Selection
`opencode-aider` respects these env vars:
- `OPENCODE_AIDER_MODEL` — model name (default: `opencode-go/deepseek-v4-flash`)
- `OPENCODE_AIDER_MAX_TOKENS` — max tokens (default: 4096)
- `OPENCODE_AIDER_TEMP` — temperature (default: 0.3)
- `OPENCODE_AIDER_TIMEOUT` — timeout seconds (default: 120)

Example:
```bash
export OPENCODE_AIDER_MODEL="opencode-go/qwen3.7-plus"
export OPENCODE_AIDER_TEMP="0.1"
opencode-aider --message "refactor this function"
```

## Workflow

### 1. Always use `opencode-aider` for code changes
```bash
# Basic usage
echo "<prompt>" | opencode-aider --file <path>

# Multi-file edit
echo "<prompt>" | opencode-aider --file <file1> --file <file2>

# Specific model
OPENCODE_AIDER_MODEL="opencode-go/deepseek-v4-pro" opencode-aider --file <path> --message "analyze this code deeply"
```

### 2. If opencode-aider is not installed
Fall back to `aider-wrapper` with Mistral key:
```bash
echo "<prompt>" | aider-wrapper --file <path>
```

### 3. Never use these directly
- ❌ `aider --model deepseek*` — uses DeepSeek API directly (old credits)
- ❌ `opencode run` — CLI use only for simple queries, not code editing
- ❌ Any curl/requests to DeepSeek API (`api.deepseek.com`)

### 4. Verify model being used
After Aider completes, check the output log for model name. It should say `opencode-go/*`. If it says `deepseek-chat` or `deepseek-coder`, it's using DeepSeek API directly — that's wrong.

## wrappers reference
- `~/.local/bin/opencode-aider` — OpenCode API (preferred)
- `~/.local/bin/aider-wrapper` — Mistral API (fallback)
- OpenCode proxy: `http://localhost:8777/v1`
- OpenCode config: `~/.config/opencode/opencode.json`

## OpenCode config
```json
{
  "$schema": "https://opencode.ai/config.json",
  "model": "opencode-go/deepseek-v4-flash",
  "provider": {
    "opencode-go": {
      "options": {
        "apiKey": "sk-LTP2Z9x...ngi0"
      }
    }
  }
}
```
