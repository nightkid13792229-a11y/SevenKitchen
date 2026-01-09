#!/bin/bash
# Assert PUBLIC Recipe Exists
# Verifies that at least one PUBLIC recipe exists via HTTP API
# Used in CI to ensure application seeding is working correctly

set -euo pipefail

# Environment overrides
BASE="${BASE:-http://127.0.0.1:3000}"
CUSTOMER_ID="${CUSTOMER_ID:-ci-test-user}"
SERVER_LOG_PATH="${SERVER_LOG_PATH:-}"
API_BASE="${BASE}/api/v1"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Helper functions
fail() {
  echo -e "${RED}ERROR: ${1}${NC}" >&2
  if [ -n "${2:-}" ]; then
    echo -e "${RED}${2}${NC}" >&2
  fi
  exit 1
}

info() {
  echo -e "${BLUE}INFO: ${1}${NC}"
}

success() {
  echo -e "${GREEN}${1}${NC}"
}

# Check prerequisites
if ! command -v curl &> /dev/null; then
  fail "curl is required but not installed"
fi

if ! command -v jq &> /dev/null; then
  fail "jq is required but not installed. Please install jq: brew install jq (macOS) or apt-get install jq (Linux)"
fi

echo "=========================================="
echo "Assert PUBLIC Recipe Exists"
echo "=========================================="
echo "BASE: ${BASE}"
echo "CUSTOMER_ID: ${CUSTOMER_ID}"
echo ""

# Step 1: Check health endpoint
info "Step 1: Checking API health"
HEALTH_RESPONSE=$(curl -s -X GET "${API_BASE}/health" || echo "")
HEALTH_STATUS=$(echo "$HEALTH_RESPONSE" | jq -r '.status // .code // "error"' 2>/dev/null || echo "error")

if [ "$HEALTH_STATUS" != "ok" ] && [ "$HEALTH_STATUS" != "0" ]; then
  echo ""
  echo "=== Health Check Response ==="
  echo "$HEALTH_RESPONSE" | jq . 2>/dev/null || echo "$HEALTH_RESPONSE"
  echo ""
  fail "Health check failed: status=${HEALTH_STATUS}. Server may not be running at ${BASE}"
fi
info "Health check passed"

# Step 2: Login to get token
info "Step 2: Logging in to get authentication token"
LOGIN_RESPONSE=$(curl -s -X POST "${API_BASE}/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"customerId\":\"${CUSTOMER_ID}\"}")

LOGIN_CODE=$(echo "$LOGIN_RESPONSE" | jq -r '.code // "1"' 2>/dev/null || echo "1")
if [ "$LOGIN_CODE" != "0" ]; then
  echo ""
  echo "=== Login Response (Full) ==="
  echo "$LOGIN_RESPONSE" | jq . 2>/dev/null || echo "$LOGIN_RESPONSE"
  echo ""
  fail "Login failed with code=${LOGIN_CODE}"
fi

TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.data.token // ""' 2>/dev/null || echo "")
if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo ""
  echo "=== Login Response (Full) ==="
  echo "$LOGIN_RESPONSE" | jq . 2>/dev/null || echo "$LOGIN_RESPONSE"
  echo ""
  fail "Token is empty or null"
fi
info "Login successful"

# Step 3: Get recipes list
info "Step 3: Checking for PUBLIC recipes"
RECIPES_RESPONSE=$(curl -s -X GET "${API_BASE}/recipes" \
  -H "Authorization: Bearer ${TOKEN}")

RECIPES_CODE=$(echo "$RECIPES_RESPONSE" | jq -r '.code // "1"' 2>/dev/null || echo "1")
if [ "$RECIPES_CODE" != "0" ]; then
  echo ""
  echo "=== Recipes Response (Full) ==="
  echo "$RECIPES_RESPONSE" | jq . 2>/dev/null || echo "$RECIPES_RESPONSE"
  echo ""
  if [ -n "$SERVER_LOG_PATH" ] && [ -f "$SERVER_LOG_PATH" ]; then
    echo "=== Server Log (Last 50 lines) ==="
    tail -50 "$SERVER_LOG_PATH"
    echo ""
  fi
  fail "Get recipes failed with code=${RECIPES_CODE}"
fi

# Step 4: Count PUBLIC recipes
PUBLIC_COUNT=$(echo "$RECIPES_RESPONSE" | jq -r '[.data[] | select(.status == "PUBLIC")] | length' 2>/dev/null || echo "0")

if [ "$PUBLIC_COUNT" -eq 0 ]; then
  echo ""
  echo "=== Login Response (Full) ==="
  echo "$LOGIN_RESPONSE" | jq . 2>/dev/null || echo "$LOGIN_RESPONSE"
  echo ""
  echo "=== Recipes Response (Full) ==="
  echo "$RECIPES_RESPONSE" | jq . 2>/dev/null || echo "$RECIPES_RESPONSE"
  echo ""
  echo "=== Health Check Response ==="
  echo "$HEALTH_RESPONSE" | jq . 2>/dev/null || echo "$HEALTH_RESPONSE"
  echo ""
  if [ -n "$SERVER_LOG_PATH" ] && [ -f "$SERVER_LOG_PATH" ]; then
    echo "=== Server Log (Last 50 lines) ==="
    tail -50 "$SERVER_LOG_PATH"
    echo ""
  fi
  fail "No PUBLIC recipe found. The application must seed at least one PUBLIC recipe on startup. Please ensure the application seeding logic creates at least one PUBLIC recipe."
fi

success "Found ${PUBLIC_COUNT} PUBLIC recipe(s)"
echo ""
exit 0

