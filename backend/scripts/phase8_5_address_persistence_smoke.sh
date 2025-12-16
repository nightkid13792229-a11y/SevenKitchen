#!/bin/bash

# Phase 8.5: Prisma Address Persistence Smoke Test
# Verifies Address persistence in Prisma mode, including default address behavior

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
if [ "${ADDRESS_REPO:-}" != "prisma" ]; then
  warn "ADDRESS_REPO is not set to 'prisma'. This smoke test requires ADDRESS_REPO=prisma."
  warn "Current value: ${ADDRESS_REPO:-memory}"
  fail "Please set ADDRESS_REPO=prisma and DATABASE_URL to run this test."
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
      // Handle arrays directly
      if (Array.isArray(root)) {
        const result = ${expr};
        if (result === undefined || result === null) console.log('');
        else if (typeof result === 'object') console.log(JSON.stringify(result));
        else console.log(String(result));
      } else {
        // Handle objects with {code, data, message}
        const {code, data, message, ...rest} = root;
        const result = ${expr};
        if (result === undefined || result === null) console.log('');
        else if (typeof result === 'object') console.log(JSON.stringify(result));
        else console.log(String(result));
      }
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

# Step 3: List addresses (expect ok, count can be 0)
echo -e "${BLUE}[Step 3] List addresses${NC}"
LIST_RESPONSE=$(curl -sS -X GET "${API_BASE}/addresses" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "X-Customer-Id: ${CUSTOMER_ID}")
LIST_CODE=$(echo "$LIST_RESPONSE" | extract_json "code")
if [ -z "${LIST_CODE:-}" ] || [ "${LIST_CODE}" != "0" ]; then
  fail "Failed to list addresses. Code: ${LIST_CODE:-missing}. Response: $LIST_RESPONSE"
fi
ADDRESSES=$(echo "$LIST_RESPONSE" | extract_json "data || data.data || []")
COUNT=$(echo "$ADDRESSES" | extract_json "length || 0")
# Ensure COUNT is a valid integer
COUNT=${COUNT:-0}
if ! [[ "$COUNT" =~ ^[0-9]+$ ]]; then
  COUNT=0
fi
echo -e "${GREEN}✓ Address list returned (${COUNT} addresses)${NC}\n"

# Step 4: Create address
echo -e "${BLUE}[Step 4] Create address${NC}"
ADDRESS_PAYLOAD='{
  "recipientName": "Smoke Test User",
  "phone": "13800138000",
  "region": {
    "province": "广东省",
    "city": "深圳市",
    "district": "南山区"
  },
  "detail": "科技园南区123号",
  "isDefault": false
}'
CREATE_RESPONSE=$(curl -sS -X POST "${API_BASE}/addresses" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "X-Customer-Id: ${CUSTOMER_ID}" \
  -d "$ADDRESS_PAYLOAD")
CREATE_CODE=$(echo "$CREATE_RESPONSE" | extract_json "code")
if [ -z "${CREATE_CODE:-}" ] || [ "${CREATE_CODE}" != "0" ]; then
  fail "Failed to create address. Code: ${CREATE_CODE:-missing}. Response: $CREATE_RESPONSE"
fi
ADDRESS_ID=$(echo "$CREATE_RESPONSE" | extract_json "data.id || data.data?.id || ''")
if [ -z "$ADDRESS_ID" ]; then
  fail "Failed to extract address ID. Response: $CREATE_RESPONSE"
fi
echo -e "${GREEN}✓ Address created: ${ADDRESS_ID}${NC}\n"

# Step 5: Set default
echo -e "${BLUE}[Step 5] Set address as default${NC}"
SET_DEFAULT_RESPONSE=$(curl -sS -X POST "${API_BASE}/addresses/${ADDRESS_ID}/set-default" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "X-Customer-Id: ${CUSTOMER_ID}")
SET_DEFAULT_CODE=$(echo "$SET_DEFAULT_RESPONSE" | extract_json "code")
if [ -z "${SET_DEFAULT_CODE:-}" ] || [ "${SET_DEFAULT_CODE}" != "0" ]; then
  fail "Failed to set default address. Code: ${SET_DEFAULT_CODE:-missing}. Response: $SET_DEFAULT_RESPONSE"
fi
echo -e "${GREEN}✓ Address set as default${NC}\n"

# Step 6: List addresses again and verify default
echo -e "${BLUE}[Step 6] List addresses and verify default${NC}"
echo "Verifying ADDRESS_ID=${ADDRESS_ID}"
if [ -z "${ADDRESS_ID:-}" ]; then
  fail "ADDRESS_ID is empty before Step 6 verification"
fi
LIST_RESPONSE2=$(curl -sS -X GET "${API_BASE}/addresses" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "X-Customer-Id: ${CUSTOMER_ID}")
LIST_CODE2=$(echo "$LIST_RESPONSE2" | extract_json "code")
if [ -z "${LIST_CODE2:-}" ] || [ "${LIST_CODE2}" != "0" ]; then
  fail "Failed to list addresses. Code: ${LIST_CODE2:-missing}. Response: $LIST_RESPONSE2"
fi
ADDRESSES2=$(echo "$LIST_RESPONSE2" | extract_json "data || data.data || []")
if [ -z "${ADDRESSES2:-}" ] || [ "$ADDRESSES2" = "null" ] || [ "$ADDRESSES2" = "[]" ]; then
  fail "Address list is empty or invalid. Response: $LIST_RESPONSE2"
fi
COUNT2=$(echo "$ADDRESSES2" | extract_json "length || 0")
COUNT2=${COUNT2:-0}
if ! [[ "$COUNT2" =~ ^[0-9]+$ ]]; then
  COUNT2=0
fi
if [ "$COUNT2" -lt 1 ]; then
  fail "Address not found in list after creation. Count: ${COUNT2}, ADDRESS_ID: ${ADDRESS_ID}, Response: $LIST_RESPONSE2"
fi
# Verify the specific address ID exists in the list
ADDRESS_FOUND=$(echo "$ADDRESSES2" | extract_json "find(a => a && a.id === '${ADDRESS_ID}') ? 'found' : 'not-found'")
if [ "$ADDRESS_FOUND" != "found" ]; then
  fail "Created address ID ${ADDRESS_ID} not found in list. Response: $LIST_RESPONSE2"
fi
# Verify exactly one is default and it's the selected one
DEFAULT_COUNT=$(echo "$ADDRESSES2" | extract_json "filter(a => a && a.isDefault === true).length || 0")
DEFAULT_COUNT=${DEFAULT_COUNT:-0}
if ! [[ "$DEFAULT_COUNT" =~ ^[0-9]+$ ]]; then
  DEFAULT_COUNT=0
fi
if [ "$DEFAULT_COUNT" -ne 1 ]; then
  fail "Expected exactly 1 default address, found: ${DEFAULT_COUNT}"
fi
SELECTED_IS_DEFAULT=$(echo "$ADDRESSES2" | extract_json "find(a => a && a.id === '${ADDRESS_ID}')?.isDefault || false")
if [ "$SELECTED_IS_DEFAULT" != "true" ]; then
  fail "Selected address (${ADDRESS_ID}) is not marked as default"
fi
echo -e "${GREEN}✓ Default address verified: exactly one default, and it is the selected address${NC}\n"

# Step 7: Update address
echo -e "${BLUE}[Step 7] Update address${NC}"
UPDATE_PAYLOAD='{
  "recipientName": "Updated Smoke Test User",
  "phone": "13900139000"
}'
UPDATE_RESPONSE=$(curl -sS -X PUT "${API_BASE}/addresses/${ADDRESS_ID}" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "X-Customer-Id: ${CUSTOMER_ID}" \
  -d "$UPDATE_PAYLOAD")
UPDATE_CODE=$(echo "$UPDATE_RESPONSE" | extract_json "code")
if [ -z "${UPDATE_CODE:-}" ] || [ "${UPDATE_CODE}" != "0" ]; then
  fail "Failed to update address. Code: ${UPDATE_CODE:-missing}. Response: $UPDATE_RESPONSE"
fi
UPDATED_NAME=$(echo "$UPDATE_RESPONSE" | extract_json "data.data?.recipientName || data.recipientName || ''")
if [ "$UPDATED_NAME" != "Updated Smoke Test User" ]; then
  fail "Address update failed. Expected name: Updated Smoke Test User, Got: ${UPDATED_NAME}"
fi
# Verify update via GET
GET_RESPONSE=$(curl -sS -X GET "${API_BASE}/addresses" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "X-Customer-Id: ${CUSTOMER_ID}")
GET_ADDRESSES=$(echo "$GET_RESPONSE" | extract_json "data || data.data || []")
VERIFIED_NAME=$(echo "$GET_ADDRESSES" | extract_json "find(a => a.id === '${ADDRESS_ID}')?.recipientName || ''")
if [ "$VERIFIED_NAME" != "Updated Smoke Test User" ]; then
  fail "Address update not reflected in list. Expected: Updated Smoke Test User, Got: ${VERIFIED_NAME}"
fi
echo -e "${GREEN}✓ Address updated and verified${NC}\n"

# Step 8: Create second address and set as default
echo -e "${BLUE}[Step 8] Create second address and set as default${NC}"
ADDRESS_PAYLOAD2='{
  "recipientName": "Second Address User",
  "phone": "13700137000",
  "region": {
    "province": "北京市",
    "city": "北京市",
    "district": "朝阳区"
  },
  "detail": "建国路88号",
  "isDefault": false
}'
CREATE_RESPONSE2=$(curl -sS -X POST "${API_BASE}/addresses" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "X-Customer-Id: ${CUSTOMER_ID}" \
  -d "$ADDRESS_PAYLOAD2")
CREATE_CODE2=$(echo "$CREATE_RESPONSE2" | extract_json "code")
if [ -z "${CREATE_CODE2:-}" ] || [ "${CREATE_CODE2}" != "0" ]; then
  fail "Failed to create second address. Code: ${CREATE_CODE2:-missing}. Response: $CREATE_RESPONSE2"
fi
ADDRESS_ID2=$(echo "$CREATE_RESPONSE2" | extract_json "data.id || data.data?.id || ''")
if [ -z "$ADDRESS_ID2" ]; then
  fail "Failed to extract second address ID. Response: $CREATE_RESPONSE2"
fi
# Set second as default
SET_DEFAULT_RESPONSE2=$(curl -sS -X POST "${API_BASE}/addresses/${ADDRESS_ID2}/set-default" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "X-Customer-Id: ${CUSTOMER_ID}")
SET_DEFAULT_CODE2=$(echo "$SET_DEFAULT_RESPONSE2" | extract_json "code")
if [ -z "${SET_DEFAULT_CODE2:-}" ] || [ "${SET_DEFAULT_CODE2}" != "0" ]; then
  fail "Failed to set second address as default. Code: ${SET_DEFAULT_CODE2:-missing}. Response: $SET_DEFAULT_RESPONSE2"
fi
# Verify: second is default, first is not
LIST_RESPONSE3=$(curl -sS -X GET "${API_BASE}/addresses" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "X-Customer-Id: ${CUSTOMER_ID}")
ADDRESSES3=$(echo "$LIST_RESPONSE3" | extract_json "data || data.data || []")
DEFAULT_COUNT2=$(echo "$ADDRESSES3" | extract_json "filter(a => a.isDefault === true).length || 0")
DEFAULT_COUNT2=${DEFAULT_COUNT2:-0}
if ! [[ "$DEFAULT_COUNT2" =~ ^[0-9]+$ ]]; then
  DEFAULT_COUNT2=0
fi
if [ "$DEFAULT_COUNT2" -ne 1 ]; then
  fail "Expected exactly 1 default address after setting second, found: ${DEFAULT_COUNT2}"
fi
SECOND_IS_DEFAULT=$(echo "$ADDRESSES3" | extract_json "find(a => a.id === '${ADDRESS_ID2}')?.isDefault || false")
FIRST_IS_DEFAULT=$(echo "$ADDRESSES3" | extract_json "find(a => a.id === '${ADDRESS_ID}')?.isDefault || false")
if [ "$SECOND_IS_DEFAULT" != "true" ]; then
  fail "Second address (${ADDRESS_ID2}) is not marked as default"
fi
if [ "$FIRST_IS_DEFAULT" != "false" ]; then
  fail "First address (${ADDRESS_ID}) should not be default, but isDefault=${FIRST_IS_DEFAULT}"
fi
echo -e "${GREEN}✓ Second address created and set as default; first address unset${NC}\n"

# Step 9: Delete non-default address
echo -e "${BLUE}[Step 9] Delete non-default address${NC}"
DELETE_RESPONSE=$(curl -sS -X DELETE "${API_BASE}/addresses/${ADDRESS_ID}" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "X-Customer-Id: ${CUSTOMER_ID}")
DELETE_CODE=$(echo "$DELETE_RESPONSE" | extract_json "code")
if [ -z "${DELETE_CODE:-}" ] || [ "${DELETE_CODE}" != "0" ]; then
  fail "Failed to delete address. Code: ${DELETE_CODE:-missing}. Response: $DELETE_RESPONSE"
fi
# Verify list count decreased and default remains valid
LIST_RESPONSE4=$(curl -sS -X GET "${API_BASE}/addresses" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "X-Customer-Id: ${CUSTOMER_ID}")
ADDRESSES4=$(echo "$LIST_RESPONSE4" | extract_json "data || data.data || []")
COUNT4=$(echo "$ADDRESSES4" | extract_json "length || 0")
COUNT4=${COUNT4:-0}
if ! [[ "$COUNT4" =~ ^[0-9]+$ ]]; then
  COUNT4=0
fi
if [ "$COUNT4" -ne 1 ]; then
  fail "Expected 1 address after deletion, found: ${COUNT4}"
fi
DEFAULT_COUNT3=$(echo "$ADDRESSES4" | extract_json "filter(a => a.isDefault === true).length || 0")
DEFAULT_COUNT3=${DEFAULT_COUNT3:-0}
if ! [[ "$DEFAULT_COUNT3" =~ ^[0-9]+$ ]]; then
  DEFAULT_COUNT3=0
fi
if [ "$DEFAULT_COUNT3" -ne 1 ]; then
  fail "Expected exactly 1 default address after deletion, found: ${DEFAULT_COUNT3}"
fi
REMAINING_IS_DEFAULT=$(echo "$ADDRESSES4" | extract_json "[0]?.isDefault || false")
if [ "$REMAINING_IS_DEFAULT" != "true" ]; then
  fail "Remaining address should be default, but isDefault=${REMAINING_IS_DEFAULT}"
fi
echo -e "${GREEN}✓ Non-default address deleted; default address remains valid${NC}\n"

# Summary
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✓ Phase 8.5 Address Persistence Smoke Test Complete${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}To verify persistence across server restart:${NC}"
echo -e "${YELLOW}1. Stop the server (Ctrl+C)${NC}"
echo -e "${YELLOW}2. Restart: DATABASE_URL=\"...\" ADDRESS_REPO=prisma pnpm start:dev${NC}"
echo -e "${YELLOW}3. Run: GET /api/v1/addresses (with same token) to verify addresses still exist${NC}"
echo -e "${YELLOW}4. Verify default address behavior persists${NC}"
echo ""

echo "✓ Phase 8.5 Address Persistence Smoke: PASS"
exit 0
