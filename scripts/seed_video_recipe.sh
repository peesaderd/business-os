#!/bin/bash
# === Seed video_recipe schema + recipes into Schema Engine ===
# ใช้ POST /api/v1/template/video_recipe/install เพื่อติดตั้ง template
# จากนั้น seed recipe records โดยอัตโนมัติ (installTemplate จะ seed data ให้)

BASE_URL="${1:-http://localhost:8100}"

echo "=== 1. Install video_recipe template ==="
curl -s -X POST "$BASE_URL/api/v1/template/video_recipe/install" \
  -H 'Content-Type: application/json' \
  -d '{}' | python3 -m json.tool 2>/dev/null || echo "FAILED: $?"

echo ""
echo "=== 2. Verify schema ==="
curl -s "$BASE_URL/api/v1/schema/video_recipe" | python3 -m json.tool 2>/dev/null

echo ""
echo "=== 3. Verify seeded recipes ==="
curl -s "$BASE_URL/api/v1/data/video_recipe" | python3 -m json.tool 2>/dev/null

echo ""
echo "=== 4. Test query: tus_novoice_15s ==="
curl -s "$BASE_URL/api/v1/data/video_recipe?search=tus_novoice_15s" \
  | python3 -m json.tool 2>/dev/null

echo ""
echo "=== 5. Test query: tus_15s ==="
curl -s "$BASE_URL/api/v1/data/video_recipe?search=tus_15s" \
  | python3 -m json.tool 2>/dev/null
