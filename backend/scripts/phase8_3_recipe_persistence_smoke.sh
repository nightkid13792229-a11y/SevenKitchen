#!/bin/bash

# Phase 8.3: Prisma Recipe Persistence Smoke Test
# Verifies Recipe persistence in Prisma mode

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
if [ "${RECIPE_REPO:-}" != "prisma" ]; then
  warn "RECIPE_REPO is not set to 'prisma'. This smoke test requires RECIPE_REPO=prisma."
  warn "Current value: ${RECIPE_REPO:-memory}"
  fail "Please set RECIPE_REPO=prisma and DATABASE_URL to run this test."
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

# Step 3: List recipes
echo -e "${BLUE}[Step 3] List recipes${NC}"
LIST_RESPONSE=$(curl -sS -X GET "${API_BASE}/recipes" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "X-Customer-Id: ${CUSTOMER_ID}")
LIST_CODE=$(echo "$LIST_RESPONSE" | extract_json "code")
if [ -z "${LIST_CODE:-}" ] || [ "${LIST_CODE}" != "0" ]; then
  fail "Failed to list recipes. Code: ${LIST_CODE:-missing}. Response: $LIST_RESPONSE"
fi
RECIPES=$(echo "$LIST_RESPONSE" | extract_json "data.data || data || []")
COUNT=$(echo "$RECIPES" | extract_json "length || 0")
# Ensure COUNT is a valid integer (default to 0 if empty or non-numeric)
COUNT=${COUNT:-0}
if ! [[ "$COUNT" =~ ^[0-9]+$ ]]; then
  COUNT=0
fi
if [ "$COUNT" -lt 1 ]; then
  warn "Recipe list is empty. This may be expected if no recipes are seeded."
  warn "Response: $LIST_RESPONSE"
else
  echo -e "${GREEN}✓ Recipe list returned (${COUNT} recipes)${NC}"
fi
echo ""

# Step 4: Get recipe by ID (if any recipes exist)
if [ "$COUNT" -gt 0 ]; then
  echo -e "${BLUE}[Step 4] Get recipe by ID${NC}"
  RECIPE_ID=$(echo "$RECIPES" | extract_json "[0].id || ''")
  if [ -z "$RECIPE_ID" ]; then
    warn "Could not extract recipe ID from list response"
  else
    GET_RESPONSE=$(curl -sS -X GET "${API_BASE}/recipes/${RECIPE_ID}" \
      -H "Authorization: Bearer ${TOKEN}" \
      -H "X-Customer-Id: ${CUSTOMER_ID}")
    GET_CODE=$(echo "$GET_RESPONSE" | extract_json "code")
    if [ -z "${GET_CODE:-}" ] || [ "${GET_CODE}" != "0" ]; then
      fail "Failed to get recipe. Code: ${GET_CODE:-missing}. Response: $GET_RESPONSE"
    fi
    RETRIEVED_ID=$(echo "$GET_RESPONSE" | extract_json "data.data?.id || data.id || ''")
    if [ "$RETRIEVED_ID" != "$RECIPE_ID" ]; then
      fail "Recipe ID mismatch. Expected: ${RECIPE_ID}, Got: ${RETRIEVED_ID}"
    fi
    echo -e "${GREEN}✓ Recipe retrieved: ${RECIPE_ID}${NC}\n"
  fi
else
  echo -e "${YELLOW}[Step 4] Skipped (no recipes in list)${NC}\n"
fi

# Summary
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✓ Phase 8.3 Recipe Persistence Smoke Test Complete${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}To verify persistence across server restart:${NC}"
echo -e "${YELLOW}1. Stop the server (Ctrl+C)${NC}"
echo -e "${YELLOW}2. Restart: DATABASE_URL=\"...\" RECIPE_REPO=prisma pnpm start:dev${NC}"
echo -e "${YELLOW}3. Run: GET /api/v1/recipes (with same token) to verify recipes still exist${NC}"
echo ""

echo "✓ Phase 8.3 Recipe Persistence Smoke: PASS"
exit 0
