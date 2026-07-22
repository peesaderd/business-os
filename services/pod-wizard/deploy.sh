#!/usr/bin/env bash
# POD Wizard Deploy
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
WWW="/var/www/podwizard"

echo "=== POD Wizard Deploy ==="
echo "  Copying public/ -> $WWW"
sudo mkdir -p "$WWW/icons"
sudo cp -r "$DIR/public/"* "$WWW/"
sudo cp -r "$DIR/public/icons/"* "$WWW/icons/"
sudo chown -R www-data:www-data "$WWW"

# Reload nginx
sudo nginx -s reload 2>/dev/null || true

# Restart API if needed
if ! pgrep -f "uvicorn main:app.*8123" > /dev/null 2>&1; then
    echo "  Starting API on :8123"
    kill $(pgrep -f "uvicorn main:app") 2>/dev/null || true
    sleep 1
    export PRINTFUL_API_KEY="***"
    cd "$DIR"
    nohup python3 -m uvicorn main:app --host 0.0.0.0 --port 8123 > /tmp/pod-wizard.log 2>&1 &
fi

echo ""
echo "=== Running E2E tests ==="
python3 "$DIR/test_e2e_browser.py" && echo "  All browser tests passed!" || echo "  Browser tests FAILED!"
python3 "$DIR/test_e2e.py" && echo "  All API tests passed!" || echo "  API tests FAILED!"
echo ""
echo "Done: https://podwizard.m2igen.com"
