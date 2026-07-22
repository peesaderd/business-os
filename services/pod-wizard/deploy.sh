#!/usr/bin/env bash
# POD Wizard Deploy — sync public/ to /var/www/podwizard + restart API
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PUBLIC="${SCRIPT_DIR}/public"
WWW="/var/www/podwizard"

echo "📦 POD Wizard Deploy"

# 1. Copy static files
echo "   Copying public/ → ${WWW}"
sudo mkdir -p "${WWW}/icons"
sudo cp -r "${PUBLIC}/"* "${WWW}/"
sudo chown -R www-data:www-data "${WWW}"

# 2. Restart API if running
if pgrep -f "uvicorn main:app.*8123" > /dev/null 2>&1; then
    echo "   API already running on :8123"
else
    echo "   Starting API..."
    kill $(pgrep -f "uvicorn main:app") 2>/dev/null || true
    sleep 1
    export PRINTFUL_API_KEY="0T3HwM…jIbs"
    cd "${SCRIPT_DIR}"
    nohup python3 -m uvicorn main:app --host 0.0.0.0 --port 8123 > /tmp/pod-wizard.log 2>&1 &
    echo "   PID: $!"
fi

# 3. Reload nginx
sudo nginx -s reload 2>/dev/null || true

# 4. Run E2E
echo ""
python3 "${SCRIPT_DIR}/test_e2e.py"
echo ""
echo "✅ Deploy complete — https://podwizard.m2igen.com"
