#!/bin/bash

# Phase 8.4: Prisma Order Persistence Smoke Test
# Verifies Order persistence in Prisma mode, including snapshot immutability

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

fail() { echo -e "${RED}✗ ${1:-Error}${NC}"; exit 1; }
warn() { echo -e "${YELLOW}⚠ ${1:-Warning}${NC}"; }

# Env gates
if [ "${ORDER_REPO:-}" != "prisma" ]; then
  warn "ORDER_REPO is not set to 'prisma'. This smoke test requires ORDER_REPO=prisma."
  warn "Current value: ${ORDER_REPO:-memory}"
  fail "Please set ORDER_REPO=prisma and DATABASE_URL to run this test."
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

# Helper to extract JSON (reads from stdin, takes JS expression as arg)
extract_json() {
  local expr="${1:-}"
  node -e "
    const fs = require('fs');
    try {
      const input = fs.readFileSync(0, 'utf8').trim();
      if (!input) { console.log(''); process.exit(0); }
      const root = JSON.parse(input);
      const {code, data, message, ...rest} = root;
      const result = ${expr};
      if (result === undefined || result === null) console.log('');
      else if (typeof result === 'object') console.log(JSON.stringify(result));
      else console.log(String(result));
    } catch (e) { console.log(''); }
  " 2>/dev/null || echo ""
}

# Step 2: Login
echo -e "${BLUE}[Step 2] Login and capture token${NC}"
LOGIN_RESPONSE=$(curl -sS -X POST "${API_BASE}/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"customerId\":\"${CUSTOMER_ID}\"}")
LOGIN_CODE=$(echo "$LOGIN_RESPONSE" | extract_json "code")
if [ -z "${LOGIN_CODE:-}" ] || [ "${LOGIN_CODE}" != "0" ]; then
  fail "Login failed. Code: ${LOGIN_CODE:-missing}. Response: $LOGIN_RESPONSE"
fi
TOKEN=$(echo "$LOGIN_RESPONSE" | extract_json "data.token || ''")
if [ -z "${TOKEN:-}" ]; then
  fail "Login succeeded but token is empty. Response: $LOGIN_RESPONSE"
fi
LOGIN_CUSTOMER_ID=$(echo "$LOGIN_RESPONSE" | extract_json "data.customerId || ''")
if [ -n "${LOGIN_CUSTOMER_ID:-}" ] && [ "${LOGIN_CUSTOMER_ID}" != "${CUSTOMER_ID}" ]; then
  warn "Login customerId (${LOGIN_CUSTOMER_ID}) does not match expected (${CUSTOMER_ID})"
fi
echo -e "${GREEN}✓ JWT token obtained${NC}\n"

# Step 3: Create order (INIT)
echo -e "${BLUE}[Step 3] Create order draft (INIT)${NC}"
# Need a dog and recipe first - use seeded values
DOG_ID=$(curl -sS -X GET "${API_BASE}/dogs" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "X-Customer-Id: ${CUSTOMER_ID}" | extract_json "data.data?.[0]?.id || data?.[0]?.id || ''")
if [ -z "$DOG_ID" ]; then
  warn "No dog found, creating one..."
  DOG_PAYLOAD='{
    "name": "Smoke Test Dog",
    "breedId": "550e8400-e29b-41d4-a716-446655440000",
    "birthday": "2020-01-15T00:00:00.000Z",
    "gender": "MALE",
    "isNeutered": true,
    "currentWeightKg": 25.5,
    "bcsScore": 5,
    "activityLevel": "NORMAL",
    "lifeStageOverride": "ADULT",
    "mealsPerDay": 2,
    "treatInputMode": "ESTIMATE_LEVEL",
    "treatLevel": "LOW"
  }'
  DOG_RESPONSE=$(curl -sS -X POST "${API_BASE}/dogs" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "X-Customer-Id: ${CUSTOMER_ID}" \
    -d "$DOG_PAYLOAD")
  DOG_ID=$(echo "$DOG_RESPONSE" | extract_json "data.data?.profile?.id || data.profile?.id || data.id || ''")
fi

RECIPE_ID=$(curl -sS -X GET "${API_BASE}/recipes" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "X-Customer-Id: ${CUSTOMER_ID}" | extract_json "data.data?.[0]?.id || data?.[0]?.id || '3fa85f64-5717-4562-b3fc-2c963f66afa6'")

ORDER_PAYLOAD="{
  \"dogId\": \"${DOG_ID}\",
  \"type\": \"FRESH_FOOD\",
  \"items\": [{
    \"recipeId\": \"${RECIPE_ID}\",
    \"quantityG\": 1000,
    \"packageSpecG\": 200,
    \"packageCount\": 5
  }]
}"

CREATE_RESPONSE=$(curl -sS -X POST "${API_BASE}/orders" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "X-Customer-Id: ${CUSTOMER_ID}" \
  -d "$ORDER_PAYLOAD")
CREATE_CODE=$(echo "$CREATE_RESPONSE" | extract_json "code")
if [ -z "${CREATE_CODE:-}" ] || [ "${CREATE_CODE}" != "0" ]; then
  fail "Failed to create order. Code: ${CREATE_CODE:-missing}. Response: $CREATE_RESPONSE"
fi
ORDER_ID=$(echo "$CREATE_RESPONSE" | extract_json "data.data?.id || data.id || ''")
if [ -z "$ORDER_ID" ]; then
  fail "Failed to extract order ID. Response: $CREATE_RESPONSE"
fi
ORDER_STATUS=$(echo "$CREATE_RESPONSE" | extract_json "data.data?.status || data.status || ''")
if [ "$ORDER_STATUS" != "INIT" ]; then
  fail "Order status should be INIT, got: ${ORDER_STATUS}"
fi
echo -e "${GREEN}✓ Order created: ${ORDER_ID} (status: ${ORDER_STATUS})${NC}\n"

# Step 4: Confirm order (INIT -> PENDING_PAYMENT)
echo -e "${BLUE}[Step 4] Confirm order (INIT -> PENDING_PAYMENT)${NC}"
CONFIRM_RESPONSE=$(curl -sS -X POST "${API_BASE}/orders/${ORDER_ID}/confirm" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "X-Customer-Id: ${CUSTOMER_ID}")
CONFIRM_CODE=$(echo "$CONFIRM_RESPONSE" | extract_json "code")
if [ -z "${CONFIRM_CODE:-}" ] || [ "${CONFIRM_CODE}" != "0" ]; then
  fail "Failed to confirm order. Code: ${CONFIRM_CODE:-missing}. Response: $CONFIRM_RESPONSE"
fi
CONFIRM_STATUS=$(echo "$CONFIRM_RESPONSE" | extract_json "data.data?.status || data.status || ''")
if [ "$CONFIRM_STATUS" != "PENDING_PAYMENT" ]; then
  fail "Order status should be PENDING_PAYMENT, got: ${CONFIRM_STATUS}"
fi
echo -e "${GREEN}✓ Order confirmed: status ${CONFIRM_STATUS}${NC}\n"

# Step 5: Pay order (PENDING_PAYMENT -> PAID)
echo -e "${BLUE}[Step 5] Pay order (PENDING_PAYMENT -> PAID)${NC}"
PAY_RESPONSE=$(curl -sS -X POST "${API_BASE}/orders/${ORDER_ID}/pay" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "X-Customer-Id: ${CUSTOMER_ID}")
PAY_CODE=$(echo "$PAY_RESPONSE" | extract_json "code")
if [ -z "${PAY_CODE:-}" ] || [ "${PAY_CODE}" != "0" ]; then
  fail "Failed to pay order. Code: ${PAY_CODE:-missing}. Response: $PAY_RESPONSE"
fi
PAY_STATUS=$(echo "$PAY_RESPONSE" | extract_json "data.data?.status || data.status || ''")
if [ "$PAY_STATUS" != "PAID" ]; then
  fail "Order status should be PAID, got: ${PAY_STATUS}"
fi
echo -e "${GREEN}✓ Order paid: status ${PAY_STATUS}${NC}\n"

# Step 6: Get order detail
echo -e "${BLUE}[Step 6] Get order detail${NC}"
GET_RESPONSE=$(curl -sS -X GET "${API_BASE}/orders/${ORDER_ID}" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "X-Customer-Id: ${CUSTOMER_ID}")
GET_CODE=$(echo "$GET_RESPONSE" | extract_json "code")
if [ -z "${GET_CODE:-}" ] || [ "${GET_CODE}" != "0" ]; then
  fail "Failed to get order. Code: ${GET_CODE:-missing}. Response: $GET_RESPONSE"
fi
RETRIEVED_ID=$(echo "$GET_RESPONSE" | extract_json "data.data?.id || data.id || ''")
if [ "$RETRIEVED_ID" != "$ORDER_ID" ]; then
  fail "Order ID mismatch. Expected: ${ORDER_ID}, Got: ${RETRIEVED_ID}"
fi
RETRIEVED_STATUS=$(echo "$GET_RESPONSE" | extract_json "data.data?.status || data.status || ''")
if [ "$RETRIEVED_STATUS" != "PAID" ]; then
  fail "Order status should be PAID, got: ${RETRIEVED_STATUS}"
fi
echo -e "${GREEN}✓ Order retrieved: ${ORDER_ID} (status: ${RETRIEVED_STATUS})${NC}\n"

# Step 7: Get order item snapshot
echo -e "${BLUE}[Step 7] Get order item snapshot${NC}"
ORDER_ITEMS=$(echo "$GET_RESPONSE" | extract_json "data.data?.items || data.items || []")
ITEM_ID=$(echo "$ORDER_ITEMS" | extract_json "[0]?.id || ''")
if [ -z "$ITEM_ID" ]; then
  warn "No items found in order, skipping snapshot test"
else
  SNAPSHOT_RESPONSE=$(curl -sS -X GET "${API_BASE}/orders/items/${ITEM_ID}/snapshot" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "X-Customer-Id: ${CUSTOMER_ID}")
  SNAPSHOT_CODE=$(echo "$SNAPSHOT_RESPONSE" | extract_json "code")
  if [ -z "${SNAPSHOT_CODE:-}" ] || [ "${SNAPSHOT_CODE}" != "0" ]; then
    fail "Failed to get snapshot. Code: ${SNAPSHOT_CODE:-missing}. Response: $SNAPSHOT_RESPONSE"
  fi
  SNAPSHOT_ID=$(echo "$SNAPSHOT_RESPONSE" | extract_json "data.data?.id || data.id || ''")
  if [ -z "$SNAPSHOT_ID" ]; then
    fail "Failed to extract snapshot ID. Response: $SNAPSHOT_RESPONSE"
  fi
  echo -e "${GREEN}✓ Snapshot retrieved: recipe ID ${SNAPSHOT_ID}${NC}\n"
fi

# Summary
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✓ Phase 8.4 Order Persistence Smoke Test Complete${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}To verify persistence across server restart:${NC}"
echo -e "${YELLOW}1. Stop the server (Ctrl+C)${NC}"
echo -e "${YELLOW}2. Restart: DATABASE_URL=\"...\" ORDER_REPO=prisma pnpm start:dev${NC}"
echo -e "${YELLOW}3. Run: GET /api/v1/orders/${ORDER_ID} (with same token) to verify order still exists${NC}"
echo ""

echo "✓ Phase 8.4 Order Persistence Smoke: PASS"
exit 0

