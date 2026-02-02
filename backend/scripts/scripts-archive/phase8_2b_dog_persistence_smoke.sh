#!/bin/bash

# Phase 8.2 Part B: Prisma Dog Persistence Smoke Test
# Verifies Dog persistence in Prisma mode

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
if [ "${DOG_REPO:-}" != "prisma" ]; then
  warn "DOG_REPO is not set to 'prisma'. This smoke test requires DOG_REPO=prisma."
  warn "Current value: ${DOG_REPO:-memory}"
  fail "Please set DOG_REPO=prisma and DATABASE_URL to run this test."
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

# Step 3: Create dog
echo -e "${BLUE}[Step 3] Create dog profile${NC}"
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
if [ -z "$DOG_ID" ]; then fail "Failed to create dog. Response: $DOG_RESPONSE"; fi
echo -e "${GREEN}✓ Dog created: ${DOG_ID}${NC}\n"

# Step 4: List dogs and verify presence
echo -e "${BLUE}[Step 4] List dogs${NC}"
LIST_RESPONSE=$(curl -sS -X GET "${API_BASE}/dogs" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "X-Customer-Id: ${CUSTOMER_ID}")
COUNT=$(echo "$LIST_RESPONSE" | extract_json "data.data?.length || data.length || 0")
if [ "$COUNT" -lt 1 ]; then fail "Dog not returned by list. Response: $LIST_RESPONSE"; fi
echo -e "${GREEN}✓ Dog list returned (${COUNT})${NC}\n"

# Step 5: Get dog by ID
echo -e "${BLUE}[Step 5] Get dog by ID${NC}"
GET_RESPONSE=$(curl -sS -X GET "${API_BASE}/dogs/${DOG_ID}" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "X-Customer-Id: ${CUSTOMER_ID}")
RETRIEVED_ID=$(echo "$GET_RESPONSE" | extract_json "data.data?.profile?.id || data.profile?.id || ''")
if [ "$RETRIEVED_ID" != "$DOG_ID" ]; then fail "Dog ID mismatch. Expected: ${DOG_ID}, Got: ${RETRIEVED_ID}"; fi
echo -e "${GREEN}✓ Dog retrieved: ${DOG_ID}${NC}\n"

# Step 6: Update dog
echo -e "${BLUE}[Step 6] Update dog profile${NC}"
UPDATE_PAYLOAD='{
  "name": "Updated Smoke Test Dog",
  "currentWeightKg": 26.0
}'
UPDATE_RESPONSE=$(curl -sS -X PUT "${API_BASE}/dogs/${DOG_ID}" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "X-Customer-Id: ${CUSTOMER_ID}" \
  -d "$UPDATE_PAYLOAD")
UPDATED_NAME=$(echo "$UPDATE_RESPONSE" | extract_json "data.data?.profile?.name || data.profile?.name || ''")
if [ "$UPDATED_NAME" != "Updated Smoke Test Dog" ]; then fail "Dog update failed. Response: $UPDATE_RESPONSE"; fi
echo -e "${GREEN}✓ Dog updated successfully${NC}\n"

# Summary
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━2B Dog Persistence Smoke Test${NC}"
echo -e "${GREEN}✓ All steps passed${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ PostgreSQL database.${NC}"
echo -e "${YELLOW}Created Dog ID: ${DOG_ID}${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ persistence across server restart:${NC}"
echo -e "${YELLOW}1. Stop the server (Ctrl+C)${NC}"
echo -e "${YELLOW}2. Restart: DATABASE_URL=\"...\" DOG_REPO=prisma pnpm start:dev${NC}"
echo -e "${YELLOW}3. Run: GET /api/v1/dogs (with same token) to verify dog still exists${NC}"

echo "✓ Phase 8.2B Dog Persistence Smoke: PASS"
exit 0


