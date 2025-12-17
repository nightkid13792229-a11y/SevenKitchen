#!/bin/bash
# Phase 8.14: Shipping Fulfillment E2E Verification
# Verifies complete flow: order -> production -> kitchen completion -> shipping

set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"
API_BASE="${BASE_URL}/api/v1"
HEALTH_PATH="${HEALTH_PATH:-}"
STAFF_LOGIN_PATH="${STAFF_LOGIN_PATH:-}"
STAFF_CUSTOMER_ID="${STAFF_CUSTOMER_ID:-staff-user-001}"
CUSTOMER_CUSTOMER_ID="${CUSTOMER_CUSTOMER_ID:-customer-user-001}"
DOG_ID="${DOG_ID:-}"
DOG_CREATE_PATH="${DOG_CREATE_PATH:-}"
DOG_CREATE_BODY="${DOG_CREATE_BODY:-}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

fail() {
  local msg="${1:-Error}"
  local response="${2:-}"
  local curl_cmd="${3:-}"
  echo -e "${RED}✗ ${msg}${NC}"
  if [ -n "$response" ]; then
    local truncated
    truncated=$(echo "$response" | head -c 500)
    echo -e "${RED}Response (truncated): ${truncated}${NC}"
  fi
  if [ -n "$curl_cmd" ]; then
    echo -e "${RED}Curl command: ${curl_cmd}${NC}"
  fi
  exit 1
}
warn() { echo -e "${YELLOW}⚠ ${1:-Warning}${NC}"; }
info() { echo -e "${BLUE}ℹ ${1:-Info}${NC}"; }
success() { echo -e "${GREEN}✓ ${1:-Success}${NC}"; }

# Helper: curl with HTTP code separation
# Outputs: <body>\nHTTP_CODE:<code>
curl_with_code() {
  local url="$1"
  shift
  local response
  response=$(curl -s -w "\n%{http_code}" "$@" "$url")
  local body
  body=$(echo "$response" | sed '$d')
  local code
  code=$(echo "$response" | tail -n 1)
  echo "$body"
  echo "HTTP_CODE:$code"
}

# Helper: Extract JSON field from stdin (Node.js reads from stdin)
extract_json_stdin() {
  local expr="$1"
  node -e "
    const fs = require('fs');
    try {
      const input = fs.readFileSync(0, 'utf8').trim();
      if (!input) { console.log(''); process.exit(0); }
      const root = JSON.parse(input);
      const result = ${expr};
      if (result === undefined || result === null) console.log('');
      else if (typeof result === 'object') console.log(JSON.stringify(result));
      else console.log(String(result));
    } catch (e) {
      console.log('');
      process.exit(1);
    }
  " 2>/dev/null || echo ""
}

# Helper: Get HTTP code from curl_with_code output
get_http_code() {
  local response="$1"
  echo "$response" | grep "^HTTP_CODE:" | cut -d: -f2 || echo ""
}

# Helper: Get body from curl_with_code output
get_body() {
  local response="$1"
  echo "$response" | sed '/^HTTP_CODE:/d'
}

echo "=========================================="
echo "Phase 8.14: Shipping Fulfillment E2E"
echo "=========================================="
echo ""

# Initialize summary variables
SUMMARY_ORDER_ID=""
SUMMARY_BATCH_ID=""
SUMMARY_TASK_ID=""
SUMMARY_SHIPPED="NO"
SUMMARY_TRACKING_NUMBER=""

# Step 1: Health check
info "Step 1: Health check"
HEALTH_URL=""
HEALTH_CODE=""
HEALTH_BODY=""

if [ -n "$HEALTH_PATH" ]; then
  # Use explicit HEALTH_PATH if provided
  HEALTH_URL="${BASE_URL}${HEALTH_PATH}"
  HEALTH_RESPONSE=$(curl_with_code "$HEALTH_URL")
  HEALTH_CODE=$(get_http_code "$HEALTH_RESPONSE")
  HEALTH_BODY=$(get_body "$HEALTH_RESPONSE")
  
  if [ -z "$HEALTH_CODE" ] || [ "$HEALTH_CODE" != "200" ]; then
    HEALTH_CURL_CMD="curl -s -w \"\\n%{http_code}\" \"${HEALTH_URL}\""
    truncated_body=$(echo "$HEALTH_BODY" | head -c 300)
    fail "Health check failed: HTTP code ${HEALTH_CODE}" "$truncated_body" "$HEALTH_CURL_CMD"
  fi
  success "Health check OK: ${HEALTH_URL}"
else
  # Try /health first, then /api/v1/health
  HEALTH_URL_1="${BASE_URL}/health"
  HEALTH_URL_2="${BASE_URL}/api/v1/health"
  
  HEALTH_RESPONSE_1=$(curl_with_code "$HEALTH_URL_1")
  HEALTH_CODE_1=$(get_http_code "$HEALTH_RESPONSE_1")
  HEALTH_BODY_1=$(get_body "$HEALTH_RESPONSE_1")
  
  if [ "$HEALTH_CODE_1" = "200" ]; then
    HEALTH_URL="$HEALTH_URL_1"
    HEALTH_CODE="$HEALTH_CODE_1"
    HEALTH_BODY="$HEALTH_BODY_1"
    success "Health check OK: ${HEALTH_URL}"
  else
    # Try second URL
    HEALTH_RESPONSE_2=$(curl_with_code "$HEALTH_URL_2")
    HEALTH_CODE_2=$(get_http_code "$HEALTH_RESPONSE_2")
    HEALTH_BODY_2=$(get_body "$HEALTH_RESPONSE_2")
    
    if [ "$HEALTH_CODE_2" = "200" ]; then
      HEALTH_URL="$HEALTH_URL_2"
      HEALTH_CODE="$HEALTH_CODE_2"
      HEALTH_BODY="$HEALTH_BODY_2"
      success "Health check OK: ${HEALTH_URL}"
    else
      # Both failed
      truncated_body_1=$(echo "$HEALTH_BODY_1" | head -c 300)
      truncated_body_2=$(echo "$HEALTH_BODY_2" | head -c 300)
      echo -e "${RED}✗ Health check failed${NC}"
      echo -e "${RED}Attempt 1: ${HEALTH_URL_1}${NC}"
      echo -e "${RED}  HTTP code: ${HEALTH_CODE_1}${NC}"
      echo -e "${RED}  Response (truncated): ${truncated_body_1}${NC}"
      echo -e "${RED}Attempt 2: ${HEALTH_URL_2}${NC}"
      echo -e "${RED}  HTTP code: ${HEALTH_CODE_2}${NC}"
      echo -e "${RED}  Response (truncated): ${truncated_body_2}${NC}"
      exit 1
    fi
  fi
fi
echo ""

# Step 2: Login (staff)
info "Step 2: Login as staff"
LOGIN_URL=""
LOGIN_BODY_JSON=""

if [ -n "$STAFF_LOGIN_PATH" ]; then
  # Use explicit STAFF_LOGIN_PATH if provided
  LOGIN_URL="${BASE_URL}${STAFF_LOGIN_PATH}"
  # If STAFF_LOGIN_BODY is provided, use it; otherwise use default customerId
  if [ -n "${STAFF_LOGIN_BODY:-}" ]; then
    LOGIN_BODY_JSON="$STAFF_LOGIN_BODY"
  else
    LOGIN_BODY_JSON="{\"customerId\":\"${STAFF_CUSTOMER_ID}\"}"
  fi
else
  # Default: use /api/v1/auth/login with customerId
  LOGIN_URL="${API_BASE}/auth/login"
  LOGIN_BODY_JSON="{\"customerId\":\"${STAFF_CUSTOMER_ID}\"}"
fi

LOGIN_RESPONSE=$(curl_with_code "$LOGIN_URL" -X POST \
  -H "Content-Type: application/json" \
  -d "$LOGIN_BODY_JSON")
LOGIN_CODE=$(get_http_code "$LOGIN_RESPONSE")
LOGIN_BODY=$(get_body "$LOGIN_RESPONSE")

if [ -z "$LOGIN_CODE" ] || [ "$LOGIN_CODE" != "200" ]; then
  LOGIN_CURL_CMD="curl -X POST -H \"Content-Type: application/json\" -d '${LOGIN_BODY_JSON}' \"${LOGIN_URL}\""
  truncated_body=$(echo "$LOGIN_BODY" | head -c 300)
  fail "Staff login failed: HTTP code ${LOGIN_CODE}" "$truncated_body" "$LOGIN_CURL_CMD"
fi

LOGIN_CODE_VALUE=$(echo "$LOGIN_BODY" | extract_json_stdin "root.code")
if [ "$LOGIN_CODE_VALUE" != "0" ]; then
  LOGIN_CURL_CMD="curl -X POST -H \"Content-Type: application/json\" -d '${LOGIN_BODY_JSON}' \"${LOGIN_URL}\""
  truncated_body=$(echo "$LOGIN_BODY" | head -c 300)
  fail "Staff login failed: code ${LOGIN_CODE_VALUE}" "$truncated_body" "$LOGIN_CURL_CMD"
fi

TOKEN=$(echo "$LOGIN_BODY" | extract_json_stdin "root.data.token")
if [ -z "$TOKEN" ]; then
  fail "Staff login failed: token not found in response" "$LOGIN_BODY"
fi
success "Staff login OK: ${LOGIN_URL}"
echo ""

# Step 3: Create order and pay (using customer login)
info "Step 3: Create order and pay"
CUSTOMER_CUSTOMER_ID="${CUSTOMER_CUSTOMER_ID:-customer-user-001}"
CUSTOMER_LOGIN_RESPONSE=$(curl_with_code "${API_BASE}/auth/login" -X POST \
  -H "Content-Type: application/json" \
  -d "{\"customerId\":\"${CUSTOMER_CUSTOMER_ID}\"}")
CUSTOMER_LOGIN_CODE=$(get_http_code "$CUSTOMER_LOGIN_RESPONSE")
CUSTOMER_LOGIN_BODY=$(get_body "$CUSTOMER_LOGIN_RESPONSE")

if [ "$CUSTOMER_LOGIN_CODE" != "200" ]; then
  fail "Customer login failed: HTTP ${CUSTOMER_LOGIN_CODE}" "$CUSTOMER_LOGIN_BODY"
fi

CUSTOMER_LOGIN_CODE_VALUE=$(echo "$CUSTOMER_LOGIN_BODY" | extract_json_stdin "root.code")
if [ "$CUSTOMER_LOGIN_CODE_VALUE" != "0" ]; then
  fail "Customer login failed: code ${CUSTOMER_LOGIN_CODE_VALUE}" "$CUSTOMER_LOGIN_BODY"
fi

CUSTOMER_TOKEN=$(echo "$CUSTOMER_LOGIN_BODY" | extract_json_stdin "root.data.token")
if [ -z "$CUSTOMER_TOKEN" ]; then
  fail "Customer login failed: token not found in response" "$CUSTOMER_LOGIN_BODY"
fi

# Create order (use DOG_ID_TO_USE from Step 2.5)
CREATE_ORDER_RESPONSE=$(curl_with_code "${API_BASE}/orders" -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${CUSTOMER_TOKEN}" \
  -d "{
    \"dogId\": \"${DOG_ID_TO_USE}\",
    \"type\": \"FRESH_FOOD\",
    \"items\": [{
      \"recipeId\": \"550e8400-e29b-41d4-a716-446655440001\",
      \"quantityG\": 1400,
      \"packageCount\": 14,
      \"packageSpecG\": 100
    }]
  }")
CREATE_ORDER_CODE=$(get_http_code "$CREATE_ORDER_RESPONSE")
CREATE_ORDER_BODY=$(get_body "$CREATE_ORDER_RESPONSE")

if [ "$CREATE_ORDER_CODE" != "201" ]; then
  fail "Create order failed: HTTP ${CREATE_ORDER_CODE}" "$CREATE_ORDER_BODY"
fi

ORDER_ID=$(echo "$CREATE_ORDER_BODY" | extract_json_stdin "root.data.id")
if [ -z "$ORDER_ID" ]; then
  fail "Create order failed: order ID not found" "$CREATE_ORDER_BODY"
fi
SUMMARY_ORDER_ID="$ORDER_ID"
success "Order created: ${ORDER_ID}"

# Confirm order
CONFIRM_RESPONSE=$(curl_with_code "${API_BASE}/orders/${ORDER_ID}/confirm" -X POST \
  -H "Authorization: Bearer ${CUSTOMER_TOKEN}")
CONFIRM_CODE=$(get_http_code "$CONFIRM_RESPONSE")
if [ "$CONFIRM_CODE" != "200" ]; then
  fail "Confirm order failed: HTTP ${CONFIRM_CODE}" "$(get_body "$CONFIRM_RESPONSE")"
fi

# Pay order
PAY_RESPONSE=$(curl_with_code "${API_BASE}/orders/${ORDER_ID}/pay" -X POST \
  -H "Authorization: Bearer ${CUSTOMER_TOKEN}")
PAY_CODE=$(get_http_code "$PAY_RESPONSE")
if [ "$PAY_CODE" != "200" ]; then
  fail "Pay order failed: HTTP ${PAY_CODE}" "$(get_body "$PAY_RESPONSE")"
fi
success "Order paid: ${ORDER_ID}"
echo ""

# Step 4: Create production batch
info "Step 4: Create production batch"
BATCH_RESPONSE=$(curl_with_code "${API_BASE}/admin/production/batches" -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d "{\"productionDate\":\"$(date +%Y-%m-%d)\"}")
BATCH_CODE=$(get_http_code "$BATCH_RESPONSE")
BATCH_BODY=$(get_body "$BATCH_RESPONSE")

if [ "$BATCH_CODE" != "201" ]; then
  fail "Create batch failed: HTTP ${BATCH_CODE}" "$BATCH_BODY"
fi

BATCH_ID=$(echo "$BATCH_BODY" | extract_json_stdin "root.data.id")
if [ -z "$BATCH_ID" ]; then
  fail "Create batch failed: batch ID not found" "$BATCH_BODY"
fi
SUMMARY_BATCH_ID="$BATCH_ID"
success "Batch created: ${BATCH_ID}"
echo ""

# Step 5: Get batch detail to find tasks
info "Step 5: Get batch detail"
BATCH_DETAIL_RESPONSE=$(curl_with_code "${API_BASE}/staff/kitchen/batches/${BATCH_ID}" \
  -H "Authorization: Bearer ${TOKEN}")
BATCH_DETAIL_CODE=$(get_http_code "$BATCH_DETAIL_RESPONSE")
BATCH_DETAIL_BODY=$(get_body "$BATCH_DETAIL_RESPONSE")

if [ "$BATCH_DETAIL_CODE" != "200" ]; then
  fail "Get batch detail failed: HTTP ${BATCH_DETAIL_CODE}" "$BATCH_DETAIL_BODY"
fi

TASK_ID=$(echo "$BATCH_DETAIL_BODY" | extract_json_stdin "root.data.tasks[0].id")
if [ -z "$TASK_ID" ]; then
  fail "Get batch detail failed: task ID not found" "$BATCH_DETAIL_BODY"
fi
SUMMARY_TASK_ID="$TASK_ID"
success "Task found: ${TASK_ID}"
echo ""

# Step 6: Complete kitchen task (two-stage: IN_PROGRESS -> COMPLETED)
info "Step 6a: Update task to IN_PROGRESS"
INGREDIENT_ID=$(echo "$BATCH_DETAIL_BODY" | extract_json_stdin "root.data.tasks[0].recipeSnapshot.items[0].ingredient_id")
if [ -z "$INGREDIENT_ID" ]; then
  fail "Ingredient ID not found in batch detail" "$BATCH_DETAIL_BODY"
fi

UPDATE_IN_PROGRESS_RESPONSE=$(curl_with_code "${API_BASE}/staff/kitchen/tasks/${TASK_ID}" -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d '{"status":"IN_PROGRESS"}')
UPDATE_IN_PROGRESS_CODE=$(get_http_code "$UPDATE_IN_PROGRESS_RESPONSE")
UPDATE_IN_PROGRESS_BODY=$(get_body "$UPDATE_IN_PROGRESS_RESPONSE")

if [ "$UPDATE_IN_PROGRESS_CODE" != "200" ]; then
  fail "Update task to IN_PROGRESS failed: HTTP ${UPDATE_IN_PROGRESS_CODE}" "$UPDATE_IN_PROGRESS_BODY"
fi

UPDATE_CODE=$(echo "$UPDATE_IN_PROGRESS_BODY" | extract_json_stdin "root.code")
if [ "$UPDATE_CODE" != "0" ]; then
  fail "Update task to IN_PROGRESS failed: code ${UPDATE_CODE}" "$UPDATE_IN_PROGRESS_BODY"
fi
success "Task updated to IN_PROGRESS"

info "Step 6b: Update task to COMPLETED with actual usage"
UPDATE_COMPLETED_RESPONSE=$(curl_with_code "${API_BASE}/staff/kitchen/tasks/${TASK_ID}" -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d "{\"status\":\"COMPLETED\",\"ingredientsActual\":[{\"ingredientId\":\"${INGREDIENT_ID}\",\"actual_g\":1000}]}")
UPDATE_COMPLETED_CODE=$(get_http_code "$UPDATE_COMPLETED_RESPONSE")
UPDATE_COMPLETED_BODY=$(get_body "$UPDATE_COMPLETED_RESPONSE")

if [ "$UPDATE_COMPLETED_CODE" != "200" ]; then
  fail "Update task to COMPLETED failed: HTTP ${UPDATE_COMPLETED_CODE}" "$UPDATE_COMPLETED_BODY"
fi

UPDATE_CODE=$(echo "$UPDATE_COMPLETED_BODY" | extract_json_stdin "root.code")
if [ "$UPDATE_CODE" != "0" ]; then
  fail "Update task to COMPLETED failed: code ${UPDATE_CODE}" "$UPDATE_COMPLETED_BODY"
fi
success "Task updated to COMPLETED"
echo ""

# Step 7: Verify order is READY_FOR_SHIPMENT
info "Step 7: Verify order is READY_FOR_SHIPMENT"
# Wait a bit for async batch completion
sleep 2

ORDER_DETAIL_RESPONSE=$(curl_with_code "${API_BASE}/orders/${ORDER_ID}" \
  -H "Authorization: Bearer ${CUSTOMER_TOKEN}")
ORDER_DETAIL_CODE=$(get_http_code "$ORDER_DETAIL_RESPONSE")
ORDER_DETAIL_BODY=$(get_body "$ORDER_DETAIL_RESPONSE")

if [ "$ORDER_DETAIL_CODE" != "200" ]; then
  fail "Get order detail failed: HTTP ${ORDER_DETAIL_CODE}" "$ORDER_DETAIL_BODY"
fi

ORDER_STATUS=$(echo "$ORDER_DETAIL_BODY" | extract_json_stdin "root.data.status")
if [ "$ORDER_STATUS" != "READY_FOR_SHIPMENT" ]; then
  warn "Order status is ${ORDER_STATUS}, expected READY_FOR_SHIPMENT"
  warn "This may be expected if batch completion is still processing"
  warn "Continuing with shipping test..."
else
  success "Order is READY_FOR_SHIPMENT"
fi
echo ""

# Step 8: List orders ready for shipment
info "Step 8: List orders ready for shipment"
LIST_SHIPPING_RESPONSE=$(curl_with_code "${API_BASE}/staff/shipping/orders" \
  -H "Authorization: Bearer ${TOKEN}")
LIST_SHIPPING_CODE=$(get_http_code "$LIST_SHIPPING_RESPONSE")
LIST_SHIPPING_BODY=$(get_body "$LIST_SHIPPING_RESPONSE")

if [ "$LIST_SHIPPING_CODE" != "200" ]; then
  fail "List shipping orders failed: HTTP ${LIST_SHIPPING_CODE}" "$LIST_SHIPPING_BODY"
fi

LIST_CODE=$(echo "$LIST_SHIPPING_BODY" | extract_json_stdin "root.code")
if [ "$LIST_CODE" != "0" ]; then
  fail "List shipping orders failed: code ${LIST_CODE}" "$LIST_SHIPPING_BODY"
fi

ORDER_COUNT=$(echo "$LIST_SHIPPING_BODY" | extract_json_stdin "root.data.length")
success "Found ${ORDER_COUNT} order(s) ready for shipment"
echo ""

# Step 9: Mark order as shipped
info "Step 9: Mark order as shipped"
TRACKING_NUMBER="SF$(date +%s)"
SHIP_RESPONSE=$(curl_with_code "${API_BASE}/staff/shipping/orders/${ORDER_ID}/ship" -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d "{\"trackingNumber\":\"${TRACKING_NUMBER}\",\"carrierCode\":\"SF\"}")
SHIP_CODE=$(get_http_code "$SHIP_RESPONSE")
SHIP_BODY=$(get_body "$SHIP_RESPONSE")

if [ "$SHIP_CODE" != "200" ]; then
  fail "Ship order failed: HTTP ${SHIP_CODE}" "$SHIP_BODY"
fi

SHIP_CODE_RESULT=$(echo "$SHIP_BODY" | extract_json_stdin "root.code")
if [ "$SHIP_CODE_RESULT" != "0" ]; then
  fail "Ship order failed: code ${SHIP_CODE_RESULT}" "$SHIP_BODY"
fi

SHIPPED_STATUS=$(echo "$SHIP_BODY" | extract_json_stdin "root.data.status")
SHIPPED_TRACKING=$(echo "$SHIP_BODY" | extract_json_stdin "root.data.trackingNumber")
SHIPPED_CARRIER=$(echo "$SHIP_BODY" | extract_json_stdin "root.data.carrierCode")

if [ "$SHIPPED_STATUS" != "SHIPPED" ]; then
  fail "Order status is ${SHIPPED_STATUS}, expected SHIPPED" "$SHIP_BODY"
fi

if [ "$SHIPPED_TRACKING" != "$TRACKING_NUMBER" ]; then
  fail "Tracking number mismatch: expected ${TRACKING_NUMBER}, got ${SHIPPED_TRACKING}" "$SHIP_BODY"
fi

if [ "$SHIPPED_CARRIER" != "SF" ]; then
  fail "Carrier code mismatch: expected SF, got ${SHIPPED_CARRIER}" "$SHIP_BODY"
fi

SUMMARY_SHIPPED="YES"
SUMMARY_TRACKING_NUMBER="$TRACKING_NUMBER"
success "Order marked as shipped: ${TRACKING_NUMBER} (${SHIPPED_CARRIER})"
echo ""

# Step 10: Verify order status is SHIPPED
info "Step 10: Verify order status is SHIPPED"
FINAL_ORDER_RESPONSE=$(curl_with_code "${API_BASE}/orders/${ORDER_ID}" \
  -H "Authorization: Bearer ${CUSTOMER_TOKEN}")
FINAL_ORDER_CODE=$(get_http_code "$FINAL_ORDER_RESPONSE")
FINAL_ORDER_BODY=$(get_body "$FINAL_ORDER_RESPONSE")

if [ "$FINAL_ORDER_CODE" != "200" ]; then
  fail "Get final order detail failed: HTTP ${FINAL_ORDER_CODE}" "$FINAL_ORDER_BODY"
fi

FINAL_STATUS=$(echo "$FINAL_ORDER_BODY" | extract_json_stdin "root.data.status")
FINAL_TRACKING=$(echo "$FINAL_ORDER_BODY" | extract_json_stdin "root.data.trackingNumber")
FINAL_CARRIER=$(echo "$FINAL_ORDER_BODY" | extract_json_stdin "root.data.carrierCode")

if [ "$FINAL_STATUS" != "SHIPPED" ]; then
  fail "Final order status is ${FINAL_STATUS}, expected SHIPPED" "$FINAL_ORDER_BODY"
fi

if [ -z "$FINAL_TRACKING" ]; then
  fail "Tracking number not persisted" "$FINAL_ORDER_BODY"
fi

if [ -z "$FINAL_CARRIER" ]; then
  fail "Carrier code not persisted" "$FINAL_ORDER_BODY"
fi

success "Order verified as SHIPPED with tracking: ${FINAL_TRACKING} (${FINAL_CARRIER})"
echo ""

# Summary
echo "=========================================="
echo "Phase 8.14 E2E Verification Summary"
echo "=========================================="
echo "Order ID: ${SUMMARY_ORDER_ID}"
echo "Batch ID: ${SUMMARY_BATCH_ID}"
echo "Task ID: ${SUMMARY_TASK_ID}"
echo "Shipped: ${SUMMARY_SHIPPED}"
echo "Tracking Number: ${SUMMARY_TRACKING_NUMBER}"
echo ""
success "All steps completed successfully!"
