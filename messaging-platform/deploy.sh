#!/usr/bin/env bash
set -euo pipefail

# Deploy messaging-platform to the target server
# Usage: ./deploy.sh [target_dir]
# Default target: /home/openhands/messaging-platform

TARGET="${1:-/home/openhands/messaging-platform}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "==> Deploying messaging-platform to $TARGET"

# Create target directory
mkdir -p "$TARGET"

# Copy files
cp -r "$SCRIPT_DIR/core" "$TARGET/"
cp -r "$SCRIPT_DIR/adapters" "$TARGET/"
cp -r "$SCRIPT_DIR/data" "$TARGET/"
cp "$SCRIPT_DIR/ecosystem.config.cjs" "$TARGET/"
cp "$SCRIPT_DIR/requirements.txt" "$TARGET/"

echo "==> Installing dependencies"
cd "$TARGET"
pip3 install -r requirements.txt --quiet

echo "==> Starting services with PM2"
pm2 start ecosystem.config.cjs
pm2 save

echo "==> Done!"
echo ""
echo "Verify:"
echo "  pm2 status"
echo "  curl http://localhost:8300/health"
echo "  curl http://localhost:8310/health"
echo ""
echo "nginx routes needed:"
echo "  location /line/pos/ { rewrite ^/line/pos(/.*)$ /line\$1 break; proxy_pass http://127.0.0.1:8310; }"
echo "  location /tg/      { rewrite ^/tg(/.*)$ /tg\$1 break;     proxy_pass http://127.0.0.1:8320; }"
echo "  location /wa/      { rewrite ^/wa(/.*)$ /wa\$1 break;     proxy_pass http://127.0.0.1:8330; }"
