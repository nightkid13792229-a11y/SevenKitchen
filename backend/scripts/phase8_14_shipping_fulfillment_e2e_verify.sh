#!/bin/bash
# Phase 8.14: Shipping Fulfillment E2E Verification
# Verifies complete flow: order -> production -> kitchen completion -> shipping
# Phase 8.18: Requires Prisma mode for order persistence and history logging

set -euo pipefail

# Phase 8.18: Ensure Prisma mode is enabled for orders and history
export ORDER_REPO="${ORDER_REPO:-prisma}"

BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"
API_BASE="${BASE_URL}/api/v1"
HEALTH_PATH="${HEALTH_PATH:-}"
STAFF_LOGIN_PATH="${STAFF_LOGIN_PATH:-}"
STAFF_CUSTOMER_ID="${STAFF_CUSTOMER_ID:-staff-user-001}"
CUSTOMER_CUSTOMER_ID="${CUSTOMER_CUSTOMER_ID:-customer-user-001}"
DOG_ID="${DOG_ID:-}"
DOG_CREATE_PATH="${DOG_CREATE_PATH:-}"
DOG_CREATE_BODY="${DOG_CREATE_BODY:-}"
DOG_ID_TO_USE="${DOG_ID_TO_USE:-}"
RECIPE_ID="${RECIPE_ID:-}"
RECIPE_LIST_PATH="${RECIPE_LIST_PATH:-}"
RECIPE_PICK_EXPR="${RECIPE_PICK_EXPR:-root.data[0].id || root.data.items[0].id || ''}"
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

# Step 2.5: Create dog (or reuse)
info "Step 2.5: Create dog (or reuse)"
if [ -n "$DOG_ID" ]; then
  DOG_ID_TO_USE="$DOG_ID"
  success "Using DOG_ID=${DOG_ID_TO_USE}"
else
  # Need customer token first for creating dog
  CUSTOMER_LOGIN_RESPONSE_TEMP=$(curl_with_code "${API_BASE}/auth/login" -X POST \
    -H "Content-Type: application/json" \
    -d "{\"customerId\":\"${CUSTOMER_CUSTOMER_ID}\"}")
  CUSTOMER_LOGIN_CODE_TEMP=$(get_http_code "$CUSTOMER_LOGIN_RESPONSE_TEMP")
  CUSTOMER_LOGIN_BODY_TEMP=$(get_body "$CUSTOMER_LOGIN_RESPONSE_TEMP")

  if [ -z "$CUSTOMER_LOGIN_CODE_TEMP" ] || [ "$CUSTOMER_LOGIN_CODE_TEMP" != "200" ]; then
    CUSTOMER_LOGIN_CURL_CMD="curl -X POST -H \"Content-Type: application/json\" -d '{\"customerId\":\"${CUSTOMER_CUSTOMER_ID}\"}' \"${API_BASE}/auth/login\""
    truncated_body=$(echo "$CUSTOMER_LOGIN_BODY_TEMP" | head -c 300)
    fail "Customer login failed (for dog creation): HTTP ${CUSTOMER_LOGIN_CODE_TEMP}" "$truncated_body" "$CUSTOMER_LOGIN_CURL_CMD"
  fi

  CUSTOMER_LOGIN_CODE_VALUE_TEMP=$(echo "$CUSTOMER_LOGIN_BODY_TEMP" | extract_json_stdin "root.code")
  if [ "$CUSTOMER_LOGIN_CODE_VALUE_TEMP" != "0" ]; then
    truncated_body=$(echo "$CUSTOMER_LOGIN_BODY_TEMP" | head -c 300)
    fail "Customer login failed (for dog creation): code ${CUSTOMER_LOGIN_CODE_VALUE_TEMP}" "$truncated_body"
  fi

  CUSTOMER_TOKEN_TEMP=$(echo "$CUSTOMER_LOGIN_BODY_TEMP" | extract_json_stdin "root.data.token")
  if [ -z "$CUSTOMER_TOKEN_TEMP" ]; then
    truncated_body=$(echo "$CUSTOMER_LOGIN_BODY_TEMP" | head -c 300)
    fail "Customer login failed (for dog creation): token not found" "$truncated_body"
  fi

  # Determine create dog endpoint and body
  if [ -n "$DOG_CREATE_PATH" ]; then
    DOG_CREATE_URL="${BASE_URL}${DOG_CREATE_PATH}"
  else
    DOG_CREATE_URL="${API_BASE}/dogs"
  fi

  if [ -n "$DOG_CREATE_BODY" ]; then
    DOG_CREATE_BODY_JSON="$DOG_CREATE_BODY"
  else
    DOG_CREATE_BODY_JSON='{
      "name": "E2E Test Dog",
      "breedId": "550e8400-e29b-41d4-a716-446655440000",
      "birthday": "2020-01-01T00:00:00Z",
      "gender": "MALE",
      "isNeutered": false,
      "currentWeightKg": 10.5,
      "bcsScore": 5,
      "activityLevel": "NORMAL",
      "lifeStageOverride": "NONE",
      "mealsPerDay": 2,
      "treatInputMode": "ESTIMATE_LEVEL",
      "treatLevel": "LOW"
    }'
  fi

  CREATE_DOG_RESPONSE=$(curl_with_code "$DOG_CREATE_URL" -X POST \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${CUSTOMER_TOKEN_TEMP}" \
    -d "$DOG_CREATE_BODY_JSON")
  CREATE_DOG_CODE=$(get_http_code "$CREATE_DOG_RESPONSE")
  CREATE_DOG_BODY=$(get_body "$CREATE_DOG_RESPONSE")

  # Backend may return 200 or 201 here; accept both
  if [ "$CREATE_DOG_CODE" != "200" ] && [ "$CREATE_DOG_CODE" != "201" ]; then
    CREATE_DOG_CURL_CMD="curl -X POST -H \"Content-Type: application/json\" -H \"Authorization: Bearer ${CUSTOMER_TOKEN_TEMP}\" -d '${DOG_CREATE_BODY_JSON}' \"${DOG_CREATE_URL}\""
    truncated_body=$(echo "$CREATE_DOG_BODY" | head -c 300)
    fail "Create dog failed: HTTP code ${CREATE_DOG_CODE}" "$truncated_body" "$CREATE_DOG_CURL_CMD"
  fi

  CREATE_DOG_CODE_VALUE=$(echo "$CREATE_DOG_BODY" | extract_json_stdin "root.code")
  if [ "$CREATE_DOG_CODE_VALUE" != "0" ]; then
    CREATE_DOG_CURL_CMD="curl -X POST -H \"Content-Type: application/json\" -H \"Authorization: Bearer ${CUSTOMER_TOKEN_TEMP}\" -d '${DOG_CREATE_BODY_JSON}' \"${DOG_CREATE_URL}\""
    truncated_body=$(echo "$CREATE_DOG_BODY" | head -c 300)
    fail "Create dog failed: code ${CREATE_DOG_CODE_VALUE}" "$truncated_body" "$CREATE_DOG_CURL_CMD"
  fi

  # Extract dogId from response (try both data.profile.id and data.id)
  DOG_ID_CREATED=$(echo "$CREATE_DOG_BODY" | extract_json_stdin "root.data.profile.id || root.data.id || ''")
  if [ -z "$DOG_ID_CREATED" ]; then
    truncated_body=$(echo "$CREATE_DOG_BODY" | head -c 300)
    fail "Create dog failed: dog ID not found in response" "$truncated_body"
  fi

  DOG_ID_TO_USE="$DOG_ID_CREATED"
  success "Dog created: ${DOG_ID_TO_USE}"
fi

# Ensure DOG_ID_TO_USE is set before proceeding
if [ -z "$DOG_ID_TO_USE" ]; then
  echo "✗ Error: DOG_ID_TO_USE is empty after Step 2.5" >&2
  echo "  Hint: provide DOG_ID=<uuid> to reuse an existing dog." >&2
  exit 1
fi
echo ""

# Step 3: Create order and pay (using customer login)
info "Step 3: Create order and pay"
if [ -z "$DOG_ID_TO_USE" ]; then
  echo "✗ Error: DOG_ID_TO_USE is empty at Step 3 start" >&2
  echo "  Current DOG_ID=${DOG_ID:-<empty>}" >&2
  exit 1
fi
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

# Resolve RECIPE_ID_TO_USE
RECIPE_ID_TO_USE=""
if [ -n "$RECIPE_ID" ]; then
  RECIPE_ID_TO_USE="$RECIPE_ID"
  success "Using RECIPE_ID=${RECIPE_ID_TO_USE}"
else
  # Try to fetch recipe from API
  info "Resolving recipeId from API..."
  RECIPE_LIST_URLS=()
  
  if [ -n "$RECIPE_LIST_PATH" ]; then
    RECIPE_LIST_URLS+=("${BASE_URL}${RECIPE_LIST_PATH}")
  else
    RECIPE_LIST_URLS+=("${API_BASE}/recipes")
    RECIPE_LIST_URLS+=("${API_BASE}/recipes/list")
    RECIPE_LIST_URLS+=("${API_BASE}/customer/recipes")
  fi
  
  RECIPE_ID_TO_USE=""
  TRIED_URLS=()
  
  for LIST_URL in "${RECIPE_LIST_URLS[@]}"; do
    TRIED_URLS+=("$LIST_URL")
    LIST_RESPONSE=$(curl_with_code "$LIST_URL" \
      -H "Authorization: Bearer ${CUSTOMER_TOKEN}")
    LIST_CODE=$(get_http_code "$LIST_RESPONSE")
    LIST_BODY=$(get_body "$LIST_RESPONSE")
    
    if [ "$LIST_CODE" != "200" ]; then
      continue
    fi
    
    LIST_CODE_VALUE=$(echo "$LIST_BODY" | extract_json_stdin "root.code")
    if [ "$LIST_CODE_VALUE" != "0" ]; then
      continue
    fi
    
    # Try to extract recipe ID using the expression
    RECIPE_ID_FOUND=$(echo "$LIST_BODY" | extract_json_stdin "${RECIPE_PICK_EXPR}")
    if [ -n "$RECIPE_ID_FOUND" ]; then
      RECIPE_ID_TO_USE="$RECIPE_ID_FOUND"
      success "Recipe ID resolved from ${LIST_URL}: ${RECIPE_ID_TO_USE}"
      break
    fi
  done
  
  if [ -z "$RECIPE_ID_TO_USE" ]; then
    echo "✗ Error: No recipeId found. Provide RECIPE_ID=<uuid> or configure RECIPE_LIST_PATH." >&2
    echo "  Tried URLs:" >&2
    for url in "${TRIED_URLS[@]}"; do
      echo "    - ${url}" >&2
    done
    exit 1
  fi
fi

# Create order (use DOG_ID_TO_USE from Step 2.5)
CREATE_ORDER_RESPONSE=$(curl_with_code "${API_BASE}/orders" -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${CUSTOMER_TOKEN}" \
  -d "{
    \"dogId\": \"${DOG_ID_TO_USE}\",
    \"type\": \"FRESH_FOOD\",
    \"items\": [{
      \"recipeId\": \"${RECIPE_ID_TO_USE}\",
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

# Step 3.5: Verify payment tracking fields (Phase 8.17)
info "Step 3.5: Verify payment tracking fields"
PAYMENT_RESPONSE=$(curl_with_code "${API_BASE}/orders/${ORDER_ID}/payment" -X GET \
  -H "Authorization: Bearer ${CUSTOMER_TOKEN}")
PAYMENT_CODE=$(get_http_code "$PAYMENT_RESPONSE")
PAYMENT_BODY=$(get_body "$PAYMENT_RESPONSE")

if [ "$PAYMENT_CODE" != "200" ]; then
  fail "Get payment details failed: HTTP ${PAYMENT_CODE}" "$PAYMENT_BODY"
fi

PAYMENT_STATUS=$(echo "$PAYMENT_BODY" | extract_json_stdin "root.data.paymentStatus")
PAYMENT_METHOD=$(echo "$PAYMENT_BODY" | extract_json_stdin "root.data.paymentMethod")
TRANSACTION_ID=$(echo "$PAYMENT_BODY" | extract_json_stdin "root.data.transactionId")
PAID_AT=$(echo "$PAYMENT_BODY" | extract_json_stdin "root.data.paidAt")

if [ "$PAYMENT_STATUS" != "SUCCESS" ]; then
  fail "Payment status should be SUCCESS, got: ${PAYMENT_STATUS}" "$PAYMENT_BODY"
fi

if [ "$PAYMENT_METHOD" != "WECHAT" ]; then
  fail "Payment method should be WECHAT, got: ${PAYMENT_METHOD}" "$PAYMENT_BODY"
fi

if [ -z "$TRANSACTION_ID" ] || [[ ! "$TRANSACTION_ID" =~ ^MOCK_ ]]; then
  fail "Transaction ID should start with MOCK_, got: ${TRANSACTION_ID}" "$PAYMENT_BODY"
fi

if [ -z "$PAID_AT" ]; then
  fail "paidAt should be set" "$PAYMENT_BODY"
fi

success "Payment tracking verified: status=${PAYMENT_STATUS}, method=${PAYMENT_METHOD}, transactionId=${TRANSACTION_ID}, paidAt=${PAID_AT}"
echo ""

# Step 4: Create production batch
info "Step 4: Create production batch"
BATCH_RESPONSE=$(curl_with_code "${API_BASE}/admin/production-batches" -X POST \
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

# Get tasks count
TASK_COUNT=$(echo "$BATCH_DETAIL_BODY" | extract_json_stdin "root.data.tasks.length || 0")
if [ -z "$TASK_COUNT" ] || [ "$TASK_COUNT" = "0" ]; then
  fail "Get batch detail failed: no tasks found" "$BATCH_DETAIL_BODY"
fi
success "Found ${TASK_COUNT} task(s) in batch"
echo ""

# Step 6: Complete all kitchen tasks (two-stage: IN_PROGRESS -> COMPLETED)
info "Step 6: Complete all tasks in batch"
TASK_INDEX=0
COMPLETED_TASK_COUNT=0

while [ $TASK_INDEX -lt $TASK_COUNT ]; do
  # Extract task ID and ingredient ID for current task
  TASK_ID=$(echo "$BATCH_DETAIL_BODY" | extract_json_stdin "root.data.tasks[${TASK_INDEX}].id")
  INGREDIENT_ID=$(echo "$BATCH_DETAIL_BODY" | extract_json_stdin "root.data.tasks[${TASK_INDEX}].recipeSnapshot.items[0].ingredient_id")
  
  if [ -z "$TASK_ID" ]; then
    fail "Task ID not found at index ${TASK_INDEX}" "$BATCH_DETAIL_BODY"
  fi
  
  if [ -z "$INGREDIENT_ID" ]; then
    fail "Ingredient ID not found for task ${TASK_ID} at index ${TASK_INDEX}" "$BATCH_DETAIL_BODY"
  fi
  
  info "Processing task ${TASK_INDEX} of ${TASK_COUNT}: ${TASK_ID}"
  
  # Step 6a: Update task to IN_PROGRESS
  UPDATE_IN_PROGRESS_RESPONSE=$(curl_with_code "${API_BASE}/staff/kitchen/tasks/${TASK_ID}" -X POST \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${TOKEN}" \
    -d '{"status":"IN_PROGRESS"}')
  UPDATE_IN_PROGRESS_CODE=$(get_http_code "$UPDATE_IN_PROGRESS_RESPONSE")
  UPDATE_IN_PROGRESS_BODY=$(get_body "$UPDATE_IN_PROGRESS_RESPONSE")
  
  if [ "$UPDATE_IN_PROGRESS_CODE" != "200" ]; then
    UPDATE_IN_PROGRESS_CURL_CMD="curl -X POST -H \"Content-Type: application/json\" -H \"Authorization: Bearer ${TOKEN}\" -d '{\"status\":\"IN_PROGRESS\"}' \"${API_BASE}/staff/kitchen/tasks/${TASK_ID}\""
    truncated_body=$(echo "$UPDATE_IN_PROGRESS_BODY" | head -c 300)
    fail "Update task ${TASK_ID} to IN_PROGRESS failed: HTTP ${UPDATE_IN_PROGRESS_CODE}" "$truncated_body" "$UPDATE_IN_PROGRESS_CURL_CMD"
  fi
  
  UPDATE_CODE=$(echo "$UPDATE_IN_PROGRESS_BODY" | extract_json_stdin "root.code")
  if [ "$UPDATE_CODE" != "0" ]; then
    UPDATE_IN_PROGRESS_CURL_CMD="curl -X POST -H \"Content-Type: application/json\" -H \"Authorization: Bearer ${TOKEN}\" -d '{\"status\":\"IN_PROGRESS\"}' \"${API_BASE}/staff/kitchen/tasks/${TASK_ID}\""
    truncated_body=$(echo "$UPDATE_IN_PROGRESS_BODY" | head -c 300)
    fail "Update task ${TASK_ID} to IN_PROGRESS failed: code ${UPDATE_CODE}" "$truncated_body" "$UPDATE_IN_PROGRESS_CURL_CMD"
  fi
  
  # Step 6b: Update task to COMPLETED with actual usage
  UPDATE_COMPLETED_RESPONSE=$(curl_with_code "${API_BASE}/staff/kitchen/tasks/${TASK_ID}" -X POST \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${TOKEN}" \
    -d "{\"status\":\"COMPLETED\",\"ingredientsActual\":[{\"ingredientId\":\"${INGREDIENT_ID}\",\"actual_g\":1000}]}")
  UPDATE_COMPLETED_CODE=$(get_http_code "$UPDATE_COMPLETED_RESPONSE")
  UPDATE_COMPLETED_BODY=$(get_body "$UPDATE_COMPLETED_RESPONSE")
  
  if [ "$UPDATE_COMPLETED_CODE" != "200" ]; then
    UPDATE_COMPLETED_CURL_CMD="curl -X POST -H \"Content-Type: application/json\" -H \"Authorization: Bearer ${TOKEN}\" -d '{\"status\":\"COMPLETED\",\"ingredientsActual\":[{\"ingredientId\":\"${INGREDIENT_ID}\",\"actual_g\":1000}]}' \"${API_BASE}/staff/kitchen/tasks/${TASK_ID}\""
    truncated_body=$(echo "$UPDATE_COMPLETED_BODY" | head -c 300)
    fail "Update task ${TASK_ID} to COMPLETED failed: HTTP ${UPDATE_COMPLETED_CODE}" "$truncated_body" "$UPDATE_COMPLETED_CURL_CMD"
  fi
  
  UPDATE_CODE=$(echo "$UPDATE_COMPLETED_BODY" | extract_json_stdin "root.code")
  if [ "$UPDATE_CODE" != "0" ]; then
    UPDATE_COMPLETED_CURL_CMD="curl -X POST -H \"Content-Type: application/json\" -H \"Authorization: Bearer ${TOKEN}\" -d '{\"status\":\"COMPLETED\",\"ingredientsActual\":[{\"ingredientId\":\"${INGREDIENT_ID}\",\"actual_g\":1000}]}' \"${API_BASE}/staff/kitchen/tasks/${TASK_ID}\""
    truncated_body=$(echo "$UPDATE_COMPLETED_BODY" | head -c 300)
    fail "Update task ${TASK_ID} to COMPLETED failed: code ${UPDATE_CODE}" "$truncated_body" "$UPDATE_COMPLETED_CURL_CMD"
  fi
  
  COMPLETED_TASK_COUNT=$((COMPLETED_TASK_COUNT + 1))
  success "Task ${TASK_ID} completed (${COMPLETED_TASK_COUNT}/${TASK_COUNT})"
  
  TASK_INDEX=$((TASK_INDEX + 1))
done

SUMMARY_TASK_ID="multiple"
success "All ${COMPLETED_TASK_COUNT} task(s) completed"
echo ""

# Step 7: Verify order is READY_FOR_SHIPMENT
info "Step 7: Verify order is READY_FOR_SHIPMENT"
# Poll for READY_FOR_SHIPMENT status (with bounded retry)
# After all tasks are completed, batch completion should be triggered automatically
MAX_RETRIES=10
RETRY_DELAY=1
ORDER_STATUS=""
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  ORDER_DETAIL_RESPONSE=$(curl_with_code "${API_BASE}/orders/${ORDER_ID}" \
    -H "Authorization: Bearer ${CUSTOMER_TOKEN}")
  ORDER_DETAIL_CODE=$(get_http_code "$ORDER_DETAIL_RESPONSE")
  ORDER_DETAIL_BODY=$(get_body "$ORDER_DETAIL_RESPONSE")

  if [ "$ORDER_DETAIL_CODE" != "200" ]; then
    fail "Get order detail failed: HTTP ${ORDER_DETAIL_CODE}" "$ORDER_DETAIL_BODY"
  fi

  ORDER_STATUS=$(echo "$ORDER_DETAIL_BODY" | extract_json_stdin "root.data.status")
  if [ "$ORDER_STATUS" = "READY_FOR_SHIPMENT" ]; then
    success "Order is READY_FOR_SHIPMENT"
    break
  fi

  RETRY_COUNT=$((RETRY_COUNT + 1))
  if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
    # Check batch status for diagnostic info
    BATCH_CHECK_RESPONSE=$(curl_with_code "${API_BASE}/staff/kitchen/batches/${BATCH_ID}" \
      -H "Authorization: Bearer ${TOKEN}")
    BATCH_CHECK_CODE=$(get_http_code "$BATCH_CHECK_RESPONSE")
    if [ "$BATCH_CHECK_CODE" = "200" ]; then
      BATCH_CHECK_BODY=$(get_body "$BATCH_CHECK_RESPONSE")
      BATCH_STATUS=$(echo "$BATCH_CHECK_BODY" | extract_json_stdin "root.data.status")
      info "Order status: ${ORDER_STATUS}, Batch status: ${BATCH_STATUS}, retrying in ${RETRY_DELAY}s (attempt ${RETRY_COUNT}/${MAX_RETRIES})..."
    else
      info "Order status: ${ORDER_STATUS}, retrying in ${RETRY_DELAY}s (attempt ${RETRY_COUNT}/${MAX_RETRIES})..."
    fi
    sleep $RETRY_DELAY
  fi
done

if [ "$ORDER_STATUS" != "READY_FOR_SHIPMENT" ]; then
  fail "Order status is ${ORDER_STATUS}, expected READY_FOR_SHIPMENT after ${MAX_RETRIES} attempts. Batch completion may have failed."
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
SHIP_URL="${API_BASE}/staff/shipping/orders/${ORDER_ID}/ship"
SHIP_PAYLOAD="{\"trackingNumber\":\"${TRACKING_NUMBER}\",\"carrierCode\":\"SF\"}"
SHIP_RESPONSE=$(curl_with_code "$SHIP_URL" -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d "$SHIP_PAYLOAD")
SHIP_CODE=$(get_http_code "$SHIP_RESPONSE")
SHIP_BODY=$(get_body "$SHIP_RESPONSE")

if [ "$SHIP_CODE" != "200" ]; then
  echo "✗ Diagnostic: Ship order failed" >&2
  echo "  URL: ${SHIP_URL}" >&2
  echo "  Payload: ${SHIP_PAYLOAD}" >&2
  echo "  HTTP Code: ${SHIP_CODE}" >&2
  truncated_body=$(echo "$SHIP_BODY" | head -c 500)
  echo "  Response (truncated): ${truncated_body}" >&2
  fail "Ship order failed: HTTP ${SHIP_CODE}" "$SHIP_BODY"
fi

SHIP_CODE_RESULT=$(echo "$SHIP_BODY" | extract_json_stdin "root.code")
if [ "$SHIP_CODE_RESULT" != "0" ]; then
  echo "✗ Diagnostic: Ship order failed" >&2
  echo "  URL: ${SHIP_URL}" >&2
  echo "  Payload: ${SHIP_PAYLOAD}" >&2
  echo "  Response Code: ${SHIP_CODE_RESULT}" >&2
  truncated_body=$(echo "$SHIP_BODY" | head -c 500)
  echo "  Response (truncated): ${truncated_body}" >&2
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

# Step 11: Complete order (admin endpoint)
info "Step 11: Complete order (admin endpoint)"
COMPLETE_RESPONSE=$(curl_with_code "${API_BASE}/admin/orders/${ORDER_ID}/complete" -X POST \
  -H "Authorization: Bearer ${TOKEN}")
COMPLETE_CODE=$(get_http_code "$COMPLETE_RESPONSE")
COMPLETE_BODY=$(get_body "$COMPLETE_RESPONSE")

if [ "$COMPLETE_CODE" != "200" ]; then
  COMPLETE_CURL_CMD="curl -X POST -H \"Authorization: Bearer ${TOKEN}\" \"${API_BASE}/admin/orders/${ORDER_ID}/complete\""
  truncated_body=$(echo "$COMPLETE_BODY" | head -c 500)
  fail "Complete order failed: HTTP ${COMPLETE_CODE}" "$truncated_body" "$COMPLETE_CURL_CMD"
fi

COMPLETE_CODE_VALUE=$(echo "$COMPLETE_BODY" | extract_json_stdin "root.code")
if [ "$COMPLETE_CODE_VALUE" != "0" ]; then
  COMPLETE_CURL_CMD="curl -X POST -H \"Authorization: Bearer ${TOKEN}\" \"${API_BASE}/admin/orders/${ORDER_ID}/complete\""
  truncated_body=$(echo "$COMPLETE_BODY" | head -c 500)
  fail "Complete order failed: code ${COMPLETE_CODE_VALUE}" "$truncated_body" "$COMPLETE_CURL_CMD"
fi

COMPLETED_STATUS=$(echo "$COMPLETE_BODY" | extract_json_stdin "root.data.status")
COMPLETED_AT=$(echo "$COMPLETE_BODY" | extract_json_stdin "root.data.completedAt")

if [ "$COMPLETED_STATUS" != "COMPLETED" ]; then
  fail "Order status is ${COMPLETED_STATUS}, expected COMPLETED" "$COMPLETE_BODY"
fi

if [ -z "$COMPLETED_AT" ]; then
  fail "completedAt timestamp not set" "$COMPLETE_BODY"
fi

success "Order completed: status=${COMPLETED_STATUS}, completedAt=${COMPLETED_AT}"
echo ""

# Step 12: Verify order status is COMPLETED and completedAt is not null
info "Step 12: Verify order status is COMPLETED and completedAt is not null"
FINAL_COMPLETE_RESPONSE=$(curl_with_code "${API_BASE}/orders/${ORDER_ID}" \
  -H "Authorization: Bearer ${CUSTOMER_TOKEN}")
FINAL_COMPLETE_CODE=$(get_http_code "$FINAL_COMPLETE_RESPONSE")
FINAL_COMPLETE_BODY=$(get_body "$FINAL_COMPLETE_RESPONSE")

if [ "$FINAL_COMPLETE_CODE" != "200" ]; then
  fail "Get final order detail failed: HTTP ${FINAL_COMPLETE_CODE}" "$FINAL_COMPLETE_BODY"
fi

FINAL_COMPLETE_STATUS=$(echo "$FINAL_COMPLETE_BODY" | extract_json_stdin "root.data.status")
FINAL_COMPLETE_COMPLETED_AT=$(echo "$FINAL_COMPLETE_BODY" | extract_json_stdin "root.data.completedAt")
FINAL_COMPLETE_TRACKING=$(echo "$FINAL_COMPLETE_BODY" | extract_json_stdin "root.data.trackingNumber")

if [ "$FINAL_COMPLETE_STATUS" != "COMPLETED" ]; then
  fail "Final order status is ${FINAL_COMPLETE_STATUS}, expected COMPLETED" "$FINAL_COMPLETE_BODY"
fi

if [ -z "$FINAL_COMPLETE_COMPLETED_AT" ]; then
  fail "completedAt timestamp not persisted" "$FINAL_COMPLETE_BODY"
fi

if [ "$FINAL_COMPLETE_TRACKING" != "$TRACKING_NUMBER" ]; then
  fail "Tracking number changed: expected ${TRACKING_NUMBER}, got ${FINAL_COMPLETE_TRACKING}" "$FINAL_COMPLETE_BODY"
fi

success "Order verified as COMPLETED with completedAt: ${FINAL_COMPLETE_COMPLETED_AT}, tracking unchanged: ${FINAL_COMPLETE_TRACKING}"
echo ""

# ==========================================
# Phase 8.16: Order Cancellation Tests
# ==========================================

# Step 13: Create a new order in INIT and cancel it by customer
info "Step 13: Create new order in INIT and cancel by customer"
# Create a new order (reuse dog and recipe from earlier steps)
# Use RECIPE_ID_TO_USE if available, otherwise fall back to RECIPE_ID
RECIPE_ID_FOR_CANCEL="${RECIPE_ID_TO_USE:-${RECIPE_ID}}"
if [ -z "$RECIPE_ID_FOR_CANCEL" ]; then
  fail "Recipe ID not available for cancellation test. Please ensure RECIPE_ID or RECIPE_ID_TO_USE is set."
fi

CREATE_CANCEL_ORDER_RESPONSE=$(curl_with_code "${API_BASE}/orders" -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${CUSTOMER_TOKEN}" \
  -d "{
    \"dogId\": \"${DOG_ID_TO_USE}\",
    \"type\": \"FRESH_FOOD\",
    \"items\": [{
      \"recipeId\": \"${RECIPE_ID_FOR_CANCEL}\",
      \"quantityG\": 1000,
      \"packageSpecG\": 100
    }]
  }")
CREATE_CANCEL_ORDER_CODE=$(get_http_code "$CREATE_CANCEL_ORDER_RESPONSE")
CREATE_CANCEL_ORDER_BODY=$(get_body "$CREATE_CANCEL_ORDER_RESPONSE")

if [ "$CREATE_CANCEL_ORDER_CODE" != "201" ]; then
  fail "Create order for cancellation test failed: HTTP ${CREATE_CANCEL_ORDER_CODE}" "$CREATE_CANCEL_ORDER_BODY"
fi

CANCEL_ORDER_ID=$(echo "$CREATE_CANCEL_ORDER_BODY" | extract_json_stdin "root.data.id")
if [ -z "$CANCEL_ORDER_ID" ]; then
  fail "Order ID not found in create response" "$CREATE_CANCEL_ORDER_BODY"
fi

CANCEL_ORDER_STATUS=$(echo "$CREATE_CANCEL_ORDER_BODY" | extract_json_stdin "root.data.status")
if [ "$CANCEL_ORDER_STATUS" != "INIT" ]; then
  fail "New order status is ${CANCEL_ORDER_STATUS}, expected INIT" "$CREATE_CANCEL_ORDER_BODY"
fi

success "Created order ${CANCEL_ORDER_ID} in INIT status"

# Cancel the order
CANCEL_RESPONSE=$(curl_with_code "${API_BASE}/orders/${CANCEL_ORDER_ID}/cancel" -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${CUSTOMER_TOKEN}" \
  -d '{"reason": "Customer requested cancellation"}')
CANCEL_CODE=$(get_http_code "$CANCEL_RESPONSE")
CANCEL_BODY=$(get_body "$CANCEL_RESPONSE")

if [ "$CANCEL_CODE" != "200" ]; then
  CANCEL_CURL_CMD="curl -X POST -H \"Content-Type: application/json\" -H \"Authorization: Bearer ${CUSTOMER_TOKEN}\" -d '{\"reason\":\"Customer requested cancellation\"}' \"${API_BASE}/orders/${CANCEL_ORDER_ID}/cancel\""
  truncated_body=$(echo "$CANCEL_BODY" | head -c 500)
  fail "Cancel order failed: HTTP ${CANCEL_CODE}" "$truncated_body" "$CANCEL_CURL_CMD"
fi

CANCEL_CODE_VALUE=$(echo "$CANCEL_BODY" | extract_json_stdin "root.code")
if [ "$CANCEL_CODE_VALUE" != "0" ]; then
  CANCEL_CURL_CMD="curl -X POST -H \"Content-Type: application/json\" -H \"Authorization: Bearer ${CUSTOMER_TOKEN}\" -d '{\"reason\":\"Customer requested cancellation\"}' \"${API_BASE}/orders/${CANCEL_ORDER_ID}/cancel\""
  truncated_body=$(echo "$CANCEL_BODY" | head -c 500)
  fail "Cancel order failed: code ${CANCEL_CODE_VALUE}" "$truncated_body" "$CANCEL_CURL_CMD"
fi

CANCELLED_STATUS=$(echo "$CANCEL_BODY" | extract_json_stdin "root.data.status")
if [ "$CANCELLED_STATUS" != "CANCELLED" ]; then
  fail "Order status after cancellation is ${CANCELLED_STATUS}, expected CANCELLED" "$CANCEL_BODY"
fi

success "Order ${CANCEL_ORDER_ID} cancelled successfully: status=${CANCELLED_STATUS}"
echo ""

# Step 14: Verify cancellation fields are persisted
info "Step 14: Verify cancellation fields are persisted"
VERIFY_CANCEL_RESPONSE=$(curl_with_code "${API_BASE}/orders/${CANCEL_ORDER_ID}" \
  -H "Authorization: Bearer ${CUSTOMER_TOKEN}")
VERIFY_CANCEL_CODE=$(get_http_code "$VERIFY_CANCEL_RESPONSE")
VERIFY_CANCEL_BODY=$(get_body "$VERIFY_CANCEL_RESPONSE")

if [ "$VERIFY_CANCEL_CODE" != "200" ]; then
  fail "Get cancelled order detail failed: HTTP ${VERIFY_CANCEL_CODE}" "$VERIFY_CANCEL_BODY"
fi

VERIFY_CANCEL_STATUS=$(echo "$VERIFY_CANCEL_BODY" | extract_json_stdin "root.data.status")
VERIFY_CANCELLED_AT=$(echo "$VERIFY_CANCEL_BODY" | extract_json_stdin "root.data.cancelledAt")
VERIFY_CANCELLATION_REASON=$(echo "$VERIFY_CANCEL_BODY" | extract_json_stdin "root.data.cancellationReason")
VERIFY_CANCELLED_BY=$(echo "$VERIFY_CANCEL_BODY" | extract_json_stdin "root.data.cancelledBy")

if [ "$VERIFY_CANCEL_STATUS" != "CANCELLED" ]; then
  fail "Verified order status is ${VERIFY_CANCEL_STATUS}, expected CANCELLED" "$VERIFY_CANCEL_BODY"
fi

if [ -z "$VERIFY_CANCELLED_AT" ]; then
  fail "cancelledAt timestamp not persisted" "$VERIFY_CANCEL_BODY"
fi

if [ "$VERIFY_CANCELLATION_REASON" != "Customer requested cancellation" ]; then
  fail "cancellationReason not persisted correctly: expected 'Customer requested cancellation', got '${VERIFY_CANCELLATION_REASON}'" "$VERIFY_CANCEL_BODY"
fi

if [ "$VERIFY_CANCELLED_BY" != "customer" ]; then
  fail "cancelledBy not persisted correctly: expected 'customer', got '${VERIFY_CANCELLED_BY}'" "$VERIFY_CANCEL_BODY"
fi

success "Cancellation fields verified: cancelledAt=${VERIFY_CANCELLED_AT}, reason='${VERIFY_CANCELLATION_REASON}', cancelledBy=${VERIFY_CANCELLED_BY}"
echo ""

# Step 15: Attempt to cancel COMPLETED order → expect failure
info "Step 15: Attempt to cancel COMPLETED order → expect failure"
CANCEL_COMPLETED_RESPONSE=$(curl_with_code "${API_BASE}/orders/${ORDER_ID}/cancel" -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${CUSTOMER_TOKEN}" \
  -d '{"reason": "Should fail"}')
CANCEL_COMPLETED_CODE=$(get_http_code "$CANCEL_COMPLETED_RESPONSE")
CANCEL_COMPLETED_BODY=$(get_body "$CANCEL_COMPLETED_RESPONSE")

# API returns 200 with error code in JSON body (not HTTP 400)
CANCEL_COMPLETED_CODE_VALUE=$(echo "$CANCEL_COMPLETED_BODY" | extract_json_stdin "root.code")
# API should return error code (non-zero, typically 400)
if [ "$CANCEL_COMPLETED_CODE_VALUE" = "0" ]; then
  fail "Expected error code when cancelling COMPLETED order, got code=0" "$CANCEL_COMPLETED_BODY"
fi

# Verify error message indicates the correct reason
CANCEL_COMPLETED_MESSAGE=$(echo "$CANCEL_COMPLETED_BODY" | extract_json_stdin "root.message")
if [[ ! "$CANCEL_COMPLETED_MESSAGE" =~ "COMPLETED" ]] && [[ ! "$CANCEL_COMPLETED_MESSAGE" =~ "cannot cancel" ]]; then
  fail "Expected error message about COMPLETED order cancellation, got: ${CANCEL_COMPLETED_MESSAGE}" "$CANCEL_COMPLETED_BODY"
fi

success "Correctly rejected cancellation of COMPLETED order: code=${CANCEL_COMPLETED_CODE_VALUE}, message=${CANCEL_COMPLETED_MESSAGE}"
echo ""

# Step 16: Verify order status history after completion (Phase 8.18)
info "Step 16: Verify order status history after completion"
HISTORY_RESPONSE=$(curl_with_code "${API_BASE}/orders/${ORDER_ID}/history" -X GET \
  -H "Authorization: Bearer ${CUSTOMER_TOKEN}")
HISTORY_CODE=$(get_http_code "$HISTORY_RESPONSE")
HISTORY_BODY=$(get_body "$HISTORY_RESPONSE")

if [ "$HISTORY_CODE" != "200" ]; then
  fail "Get order history failed: HTTP ${HISTORY_CODE}" "$HISTORY_BODY"
fi

HISTORY_COUNT=$(echo "$HISTORY_BODY" | extract_json_stdin "root.data | length")
if [ "$HISTORY_COUNT" = "0" ] || [ -z "$HISTORY_COUNT" ]; then
  fail "Order history should contain at least one entry, got: ${HISTORY_COUNT}" "$HISTORY_BODY"
fi

# Verify key transitions exist
HAS_PAID=$(echo "$HISTORY_BODY" | jq -r '.data[] | select(.toStatus == "PAID") | .toStatus' | head -1)
HAS_SHIPPED=$(echo "$HISTORY_BODY" | jq -r '.data[] | select(.toStatus == "SHIPPED") | .toStatus' | head -1)
HAS_COMPLETED=$(echo "$HISTORY_BODY" | jq -r '.data[] | select(.toStatus == "COMPLETED") | .toStatus' | head -1)

if [ "$HAS_PAID" != "PAID" ]; then
  fail "History should contain PAID transition" "$HISTORY_BODY"
fi

if [ "$HAS_SHIPPED" != "SHIPPED" ]; then
  fail "History should contain SHIPPED transition" "$HISTORY_BODY"
fi

if [ "$HAS_COMPLETED" != "COMPLETED" ]; then
  fail "History should contain COMPLETED transition" "$HISTORY_BODY"
fi

success "Order status history verified: ${HISTORY_COUNT} entries, key transitions (PAID, SHIPPED, COMPLETED) present"
echo ""

# Step 17: Verify cancellation history (Phase 8.18)
info "Step 17: Verify cancellation history"
CANCEL_HISTORY_RESPONSE=$(curl_with_code "${API_BASE}/orders/${CANCEL_ORDER_ID}/history" -X GET \
  -H "Authorization: Bearer ${CUSTOMER_TOKEN}")
CANCEL_HISTORY_CODE=$(get_http_code "$CANCEL_HISTORY_RESPONSE")
CANCEL_HISTORY_BODY=$(get_body "$CANCEL_HISTORY_RESPONSE")

if [ "$CANCEL_HISTORY_CODE" != "200" ]; then
  fail "Get cancellation order history failed: HTTP ${CANCEL_HISTORY_CODE}" "$CANCEL_HISTORY_BODY"
fi

HAS_CANCELLED=$(echo "$CANCEL_HISTORY_BODY" | jq -r '.data[] | select(.toStatus == "CANCELLED") | .toStatus' | head -1)
CANCELLED_ACTOR=$(echo "$CANCEL_HISTORY_BODY" | jq -r '.data[] | select(.toStatus == "CANCELLED") | .actor' | head -1)

if [ "$HAS_CANCELLED" != "CANCELLED" ]; then
  fail "Cancellation history should contain CANCELLED transition" "$CANCEL_HISTORY_BODY"
fi

if [ "$CANCELLED_ACTOR" != "customer" ]; then
  fail "Cancellation actor should be 'customer', got: ${CANCELLED_ACTOR}" "$CANCEL_HISTORY_BODY"
fi

success "Cancellation history verified: CANCELLED transition present, actor=customer"
echo ""

# Summary
echo "=========================================="
echo "Phase 8.14 + 8.15 + 8.16 + 8.17 + 8.18 E2E Verification Summary"
echo "=========================================="
echo "Order ID: ${SUMMARY_ORDER_ID}"
echo "Batch ID: ${SUMMARY_BATCH_ID}"
echo "Task ID: ${SUMMARY_TASK_ID}"
echo "Shipped: ${SUMMARY_SHIPPED}"
echo "Tracking Number: ${SUMMARY_TRACKING_NUMBER}"
echo "Completed: YES"
echo "Completed At: ${FINAL_COMPLETE_COMPLETED_AT}"
echo "Cancelled Order ID: ${CANCEL_ORDER_ID}"
echo "Cancellation Test: PASSED"
echo ""
success "All steps completed successfully!"
exit 0

