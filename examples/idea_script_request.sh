#!/usr/bin/env bash
set -euo pipefail

API_BASE="${API_BASE:-http://127.0.0.1:8083}"
TOKEN="${TOKEN:-<your_bearer_token>}"

curl -sS "${API_BASE}/api/agent/idea_script" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "X-Tenant-Id: demo-tenant" \
  -d '{
    "product": "通勤地铁使用的降噪蓝牙耳机（预算300-500元）"
  }'
