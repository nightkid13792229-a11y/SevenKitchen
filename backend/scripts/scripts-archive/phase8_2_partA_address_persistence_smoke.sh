#!/bin/bash

# Phase 8.2 Part A: Prisma Address Persistence Smoke Test
# Verifies Address persistence in Prisma mode; order may be prisma or memory

set -euo pipefail

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"
API_BASE="${BASE_URL}/api/v1"
CUSTOMER_ID="mvp-user-001"
CANONICAL_RECIPE_ID="3fa85f64-5717-4562-b3fc-2c963f66afa6"

fail() { echo -e "${RED}✗ $1${NC}"; exit 1; }

# Env gates
if [ "${ADDRESS_REPO:-}" != "prisma" ]; then
  fail "ADDRESS_REPO must be set to 'prisma' for this smoke test."
fi
if [ -z "${DATABASE_URL:-}" ]; then
  fail "DATABASE_URL must be set for Prisma mode."
fi

# Step 1: Health check
echo -e "${BLUE}[Step 1] Checking backend health${NC}"
if ! curl -sSf "${API_BASE}/health" >/dev/null 2>&1; then
  fail "Backend server not reachable at ${BASE_URL}"
fi
echo -e "${GREEN}✓ Backend server is running${NC}\n"

# Helper to extract JSON
extract_json() {
  local json="$1" path="$2"
  echo "$json" | node -e "
    const fs = require('fs');
    try {
      const input = fs.readFileSync(0, 'utf8').trim();
      const data = JSON.parse(input);
      const result = ${path};
      if (result === undefined || result === null) console.log('');
      else if (typeof result === 'object') console.log(JSON.stringify(result));
      else console.log(result);
    } catch (e) { console.log(''); }
  " 2>/dev/null || echo ""
}

# Step 2: Login
echo -e "${BLUE}[Step 2] Login and capture token${NC}"
LOGIN_RESPONSE=$(curl -sS -X POST "${API_BASE}/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"customerId\":\"${CUSTOMER_ID}\"}")
TOKEN=$(echo "$LOGIN_RESPONSE" | extract_json "data.data?.token || data.token || ''")
if [ -z "$TOKEN" ]; then fail "Login failed. Response: $LOGIN_RESPONSE"; fi
echo -e "${GREEN}✓ JWT token obtained${NC}\n"

# Step 3: Create address
echo -e "${BLUE}[Step 3] Create address${NC}"
ADDRESS_PAYLOAD='{
  "recipientName": "Smoke Tester",
  "phone": "13800138000",
  "region": { "province": "广东省", "city": "深圳市", "district": "南山区" },
  "detail": "科技园南区123号",
  "isDefault": true
}'
ADDRESS_RESPONSE=$(curl -sS -X POST "${API_BASE}/addresses" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "X-Customer-Id: ${CUSTOMER_ID}" \
  -d "$ADDRESS_PAYLOAD")
ADDRESS_ID=$(echo "$ADDRESS_RESPONSE" | extract_json "data.data?.id || data.id || ''")
if [ -z "$ADDRESS_ID" ]; then fail "Failed to create address. Response: $ADDRESS_RESPONSE"; fi
echo -e "${GREEN}✓ Address created: ${ADDRESS_ID}${NC}\n"

# Step 4: List addresses and verify presence
echo -e "${BLUE}[Step 4] List addresses${NC}"
LIST_RESPONSE=$(curl -sS -X GET "${API_BASE}/addresses" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "X-Customer-Id: ${CUSTOMER_ID}")
COUNT=$(echo "$LIST_RESPONSE" | extract_json "data.data?.length || data.length || 0")
if [ "$COUNT" -lt 1 ]; then fail "Address not returned by list. Response: $LIST_RESPONSE"; fi
echo -e "${GREEN}✓ Address list returned (${COUNT})${NC}\n"

# Step 5: (Optional) Create order using this address
# This confirms addressId works with current order flow in Prisma order mode (if enabled)
if [ "${ORDER_REPO:-memory}" = "prisma" ]; then
  echo -e "${BLUE}[Step 5] Create order using address (ORDER_REPO=prisma)${NC}"
  ORDER_PAYLOAD='{
    "dogId": "'"$(uuidgen)'"",
    "addressId": "'"${ADDRESS_ID}'"",
    "type": "FRESH_FOOD",
    "items": [{
      "recipeId": "'"${CANONICAL_RECIPE_ID}'"",
      "quantityG": 1200,
      "packageCount": 12,
      "packageSpecG": 100
    }]
  }'
  ORDER_RESPONSE=$(curl -sS -X POST "${API_BASE}/orders" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "X-Customer-Id: ${CUSTOMER_ID}" \
    -d "$ORDER_PAYLOAD")
  ORDER_ID=$(echo "$ORDER_RESPONSE" | extract_json "data.data?.id || data.id || ''")
  if [ -z "$ORDER_ID" ]; then fail "Failed to create order with address. Response: $ORDER_RESPONSE"; fi
  echo -e "${GREEN}✓ Order created with address: ${ORDER_ID}${NC}\n"
fi

echo -e "${GREEN}✓ Smoke test PASSED (Address Prisma persistence)${NC}"
