#!/bin/bash
# Phase 8.12 + 8.13: Kitchen Task & Inventory Deduction E2E Verification
# Verifies complete flow: order -> batch -> kitchen task -> inventory deduction

set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"
API_BASE="${BASE_URL}/api/v1"
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

# Helper: Extract JSON field (wrapper for backward compatibility)
extract_json() {
  local json="$1"
  local expr="$2"
  echo "$json" | extract_json_stdin "$expr"
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
echo "Phase 8.12 + 8.13: Kitchen & Inventory E2E"
echo "=========================================="
echo ""

# Initialize summary variables
SUMMARY_BATCH_ID=""
SUMMARY_TASK_ID=""
SUMMARY_DEDUCTION_COMPLETED="NO"
SUMMARY_LEDGER_ENTRIES=0
SUMMARY_IDEMPOTENCY_PASSED="NO"

# Step 1: Health check
echo "Step 1: Health check"
HEALTH_FULL=$(curl_with_code "${API_BASE}/health")
HEALTH_BODY=$(get_body "$HEALTH_FULL")
HEALTH_CODE=$(get_http_code "$HEALTH_FULL")
CURL_CMD="curl -s -w \"\\n%{http_code}\" \"${API_BASE}/health\""

if [ -z "$HEALTH_CODE" ]; then
  fail "Health check failed: HTTP code not found" "$HEALTH_FULL" "$CURL_CMD"
fi

if [ "$HEALTH_CODE" != "200" ]; then
  fail "Health check failed: HTTP $HEALTH_CODE" "$HEALTH_BODY" "$CURL_CMD"
fi

echo "HTTP_CODE:$HEALTH_CODE"
success "Health check passed"
echo ""

# Step 2: Login
echo "Step 2: Login"
LOGIN_FULL=$(curl_with_code "${API_BASE}/auth/login" \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"customerId":"mvp-user-001"}')
LOGIN_BODY=$(get_body "$LOGIN_FULL")
LOGIN_CODE=$(get_http_code "$LOGIN_FULL")
LOGIN_CURL_CMD="curl -s -w \"\\n%{http_code}\" -X POST \"${API_BASE}/auth/login\" -H \"Content-Type: application/json\" -d '{\"customerId\":\"mvp-user-001\"}'"

if [ -z "$LOGIN_CODE" ]; then
  fail "Login failed: HTTP code not found" "$LOGIN_FULL" "$LOGIN_CURL_CMD"
fi

if [ "$LOGIN_CODE" != "200" ]; then
  fail "Login failed: HTTP $LOGIN_CODE" "$LOGIN_BODY" "$LOGIN_CURL_CMD"
fi

TOKEN=$(echo "$LOGIN_BODY" | extract_json_stdin "root?.data?.token || ''")

if [ -z "$TOKEN" ]; then
  fail "Login failed (empty token)" "$LOGIN_BODY" "$LOGIN_CURL_CMD"
fi

CUSTOMER_ID=$(echo "$LOGIN_BODY" | extract_json_stdin "root?.data?.customerId || 'mvp-user-001'")
echo "HTTP_CODE:$LOGIN_CODE"
success "Login successful: customerId=$CUSTOMER_ID"
echo ""

# Step 3: Ensure PAID order exists
echo "Step 3: Ensure PAID order exists"
ORDERS_FULL=$(curl_with_code "${API_BASE}/orders" \
  -X GET \
  -H "Authorization: Bearer $TOKEN")
ORDERS_BODY=$(get_body "$ORDERS_FULL")
ORDERS_CODE=$(get_http_code "$ORDERS_FULL")

if [ "$ORDERS_CODE" != "200" ]; then
  fail "Failed to list orders: HTTP $ORDERS_CODE" "$ORDERS_BODY"
fi

ORDERS_CODE_VALUE=$(echo "$ORDERS_BODY" | extract_json_stdin "root?.code")
if [ "$ORDERS_CODE_VALUE" != "0" ]; then
  fail "Failed to list orders: code=$ORDERS_CODE_VALUE" "$ORDERS_BODY"
fi

ORDER_COUNT=$(echo "$ORDERS_BODY" | extract_json_stdin "(root?.data || []).length")
PAID_ORDER_ID=""

if [ "$ORDER_COUNT" -gt 0 ]; then
  PAID_ORDER_ID=$(echo "$ORDERS_BODY" | extract_json_stdin "(root?.data || []).find(o => o.status === 'PAID')?.id || ''")
fi

if [ -z "$PAID_ORDER_ID" ]; then
  info "No PAID order found, creating new order..."

  DOGS_FULL=$(curl_with_code "${API_BASE}/dogs" \
    -X GET \
    -H "Authorization: Bearer $TOKEN")
  DOGS_BODY=$(get_body "$DOGS_FULL")
  DOG_ID=$(echo "$DOGS_BODY" | extract_json_stdin "(root?.data || [])[0]?.id || ''")

  if [ -z "$DOG_ID" ]; then
    fail "No dog found. Please create a dog first." "$DOGS_BODY"
  fi

  RECIPES_FULL=$(curl_with_code "${API_BASE}/recipes" -X GET)
  RECIPES_BODY=$(get_body "$RECIPES_FULL")
  RECIPE_ID=$(echo "$RECIPES_BODY" | extract_json_stdin "(root?.data || [])[0]?.id || ''")

  if [ -z "$RECIPE_ID" ]; then
    fail "No recipe found. Please create a recipe first." "$RECIPES_BODY"
  fi

  ADDRESSES_FULL=$(curl_with_code "${API_BASE}/addresses" \
    -X GET \
    -H "Authorization: Bearer $TOKEN")
  ADDRESSES_BODY=$(get_body "$ADDRESSES_FULL")
  ADDRESS_ID=$(echo "$ADDRESSES_BODY" | extract_json_stdin "(root?.data || []).find(a => a.isDefault)?.id || (root?.data || [])[0]?.id || ''")

  if [ -z "$ADDRESS_ID" ]; then
    fail "No address found. Please create an address first." "$ADDRESSES_BODY"
  fi

  DRAFT_FULL=$(curl_with_code "${API_BASE}/orders/draft" \
    -X POST \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"dogId\":\"$DOG_ID\",\"recipeId\":\"$RECIPE_ID\",\"cycleDays\":7,\"addressId\":\"$ADDRESS_ID\"}")
  DRAFT_BODY=$(get_body "$DRAFT_FULL")
  DRAFT_CODE=$(get_http_code "$DRAFT_FULL")

  if [ "$DRAFT_CODE" != "200" ] && [ "$DRAFT_CODE" != "201" ]; then
    fail "Failed to create order draft: HTTP $DRAFT_CODE" "$DRAFT_BODY"
  fi

  DRAFT_ORDER_ID=$(echo "$DRAFT_BODY" | extract_json_stdin "root?.data?.id || ''")
  if [ -z "$DRAFT_ORDER_ID" ]; then
    fail "Failed to create order draft: no order ID in response" "$DRAFT_BODY"
  fi

  SUBMIT_FULL=$(curl_with_code "${API_BASE}/orders/${DRAFT_ORDER_ID}/submit" \
    -X POST \
    -H "Authorization: Bearer $TOKEN")
  SUBMIT_BODY=$(get_body "$SUBMIT_FULL")
  SUBMIT_CODE=$(get_http_code "$SUBMIT_FULL")

  if [ "$SUBMIT_CODE" != "200" ]; then
    fail "Failed to submit order: HTTP $SUBMIT_CODE" "$SUBMIT_BODY"
  fi

  PAY_FULL=$(curl_with_code "${API_BASE}/orders/${DRAFT_ORDER_ID}/pay" \
    -X POST \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"paymentMethod":"WECHAT","transactionId":"test-txn-001"}')
  PAY_BODY=$(get_body "$PAY_FULL")
  PAY_CODE=$(get_http_code "$PAY_FULL")

  if [ "$PAY_CODE" != "200" ]; then
    fail "Failed to pay order: HTTP $PAY_CODE" "$PAY_BODY"
  fi

  PAY_CODE_VALUE=$(echo "$PAY_BODY" | extract_json_stdin "root?.code")
  if [ "$PAY_CODE_VALUE" != "0" ]; then
    fail "Failed to pay order: code=$PAY_CODE_VALUE" "$PAY_BODY"
  fi

  PAID_ORDER_ID="$DRAFT_ORDER_ID"
  success "Created and paid order: $PAID_ORDER_ID"
else
  success "Found existing PAID order: $PAID_ORDER_ID"
fi
echo ""

# Step 4: Create production batch
echo "Step 4: Create production batch"
BATCH_FULL=$(curl_with_code "${API_BASE}/admin/production-batches" \
  -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"productionDate":"2025-12-17"}')
BATCH_BODY=$(get_body "$BATCH_FULL")
BATCH_CODE=$(get_http_code "$BATCH_FULL")

if [ "$BATCH_CODE" != "200" ] && [ "$BATCH_CODE" != "201" ]; then
  fail "Failed to create production batch: HTTP $BATCH_CODE" "$BATCH_BODY"
fi

BATCH_CODE_VALUE=$(echo "$BATCH_BODY" | extract_json_stdin "root?.code")
if [ "$BATCH_CODE_VALUE" != "0" ]; then
  local error_msg=$(echo "$BATCH_BODY" | extract_json_stdin "root?.message || 'Unknown error'")
  if echo "$error_msg" | grep -q "No eligible OrderItems found"; then
    warn "No eligible OrderItems found. This may be due to existing allocation locks."
    echo ""
    echo "To clean up allocation locks and production data, run the following SQL:"
    echo "----------------------------------------"
    echo "-- Clean allocation locks and production data"
    echo "UPDATE order_item SET production_batch_id = NULL, allocated_at = NULL WHERE production_batch_id IS NOT NULL;"
    echo "DELETE FROM packaging_unit;"
    echo "DELETE FROM production_batch;"
    echo "----------------------------------------"
    echo ""
    fail "Cannot proceed without eligible OrderItems. Please clean up and retry." "$BATCH_BODY"
  else
    fail "Failed to create production batch: code=$BATCH_CODE_VALUE" "$BATCH_BODY"
  fi
fi

BATCH_ID=$(echo "$BATCH_BODY" | extract_json_stdin "root?.data?.id || ''")
if [ -z "$BATCH_ID" ]; then
  fail "Batch ID not found in response" "$BATCH_BODY"
fi

# Calculate taskCount from packagingUnits array length
PACKAGING_UNITS=$(echo "$BATCH_BODY" | extract_json_stdin "JSON.stringify(root?.data?.packagingUnits || [])")
TASK_COUNT=$(echo "$PACKAGING_UNITS" | node -e "const fs=require('fs');const input=fs.readFileSync(0,'utf8').trim();const arr=JSON.parse(input||'[]');console.log(arr.length);")

# Fallback: try to get from taskCount field if packagingUnits not available
if [ -z "$TASK_COUNT" ] || [ "$TASK_COUNT" = "0" ]; then
  TASK_COUNT=$(echo "$BATCH_BODY" | extract_json_stdin "root?.data?.taskCount || 0")
fi

# Also try from kitchen batches API if still not found
if [ -z "$TASK_COUNT" ] || [ "$TASK_COUNT" = "0" ]; then
  KITCHEN_CHECK_FULL=$(curl_with_code "${API_BASE}/staff/kitchen/batches?status=PENDING" \
    -X GET \
    -H "Authorization: Bearer $TOKEN")
  KITCHEN_CHECK_BODY=$(get_body "$KITCHEN_CHECK_FULL")
  KITCHEN_CHECK_BATCH=$(echo "$KITCHEN_CHECK_BODY" | extract_json_stdin "(root?.data || []).find(b => b.id === '$BATCH_ID')")
  if [ -n "$KITCHEN_CHECK_BATCH" ] && [ "$KITCHEN_CHECK_BATCH" != "null" ]; then
    TASK_COUNT=$(echo "$KITCHEN_CHECK_BATCH" | extract_json_stdin "root?.taskCount || (root?.tasks || []).length")
  fi
fi

if [ -z "$TASK_COUNT" ] || [ "$TASK_COUNT" = "0" ]; then
  fail "Batch created but has no tasks (taskCount=$TASK_COUNT)" "$BATCH_BODY"
fi

SUMMARY_BATCH_ID="$BATCH_ID"
success "Production batch created: $BATCH_ID (taskCount=$TASK_COUNT)"
echo ""

# Step 5: List kitchen batches with status filter
echo "Step 5: List kitchen batches (status=PENDING)"
KITCHEN_LIST_FULL=$(curl_with_code "${API_BASE}/staff/kitchen/batches?status=PENDING" \
  -X GET \
  -H "Authorization: Bearer $TOKEN")
KITCHEN_LIST_BODY=$(get_body "$KITCHEN_LIST_FULL")
KITCHEN_LIST_CODE=$(get_http_code "$KITCHEN_LIST_FULL")

if [ "$KITCHEN_LIST_CODE" != "200" ]; then
  fail "Failed to list kitchen batches: HTTP $KITCHEN_LIST_CODE" "$KITCHEN_LIST_BODY"
fi

KITCHEN_LIST_CODE_VALUE=$(echo "$KITCHEN_LIST_BODY" | extract_json_stdin "root?.code")
if [ "$KITCHEN_LIST_CODE_VALUE" != "0" ]; then
  fail "Failed to list kitchen batches: code=$KITCHEN_LIST_CODE_VALUE" "$KITCHEN_LIST_BODY"
fi

KITCHEN_BATCH_COUNT=$(echo "$KITCHEN_LIST_BODY" | extract_json_stdin "(root?.data || []).length")
if [ "$KITCHEN_BATCH_COUNT" = "0" ]; then
  fail "No batches found with status=PENDING" "$KITCHEN_LIST_BODY"
fi

FOUND_BATCH=$(echo "$KITCHEN_LIST_BODY" | extract_json_stdin "JSON.stringify((root?.data || []).find(b => b.id === '$BATCH_ID') || null)")
if [ -z "$FOUND_BATCH" ] || [ "$FOUND_BATCH" = "null" ]; then
  fail "Created batch $BATCH_ID not found in kitchen list" "$KITCHEN_LIST_BODY"
fi

TASK_ID=$(echo "$FOUND_BATCH" | node -e "const fs=require('fs');const input=fs.readFileSync(0,'utf8').trim();const batch=JSON.parse(input||'null');console.log((batch?.tasks || [])[0]?.id || '');")
if [ -z "$TASK_ID" ]; then
  fail "No task found in batch $BATCH_ID" "$FOUND_BATCH"
fi

SUMMARY_TASK_ID="$TASK_ID"
success "Kitchen batches listed: found batch $BATCH_ID with task $TASK_ID"
echo ""

# Step 6: Get batch detail to extract recipe snapshot
echo "Step 6: Get batch detail"
BATCH_DETAIL_FULL=$(curl_with_code "${API_BASE}/staff/kitchen/batches/${BATCH_ID}" \
  -X GET \
  -H "Authorization: Bearer $TOKEN")
BATCH_DETAIL_BODY=$(get_body "$BATCH_DETAIL_FULL")
BATCH_DETAIL_CODE=$(get_http_code "$BATCH_DETAIL_FULL")

if [ "$BATCH_DETAIL_CODE" != "200" ]; then
  fail "Failed to get batch detail: HTTP $BATCH_DETAIL_CODE" "$BATCH_DETAIL_BODY"
fi

BATCH_DETAIL_CODE_VALUE=$(echo "$BATCH_DETAIL_BODY" | extract_json_stdin "root?.code")
if [ "$BATCH_DETAIL_CODE_VALUE" != "0" ]; then
  fail "Failed to get batch detail: code=$BATCH_DETAIL_CODE_VALUE" "$BATCH_DETAIL_BODY"
fi

RECIPE_ITEMS=$(echo "$BATCH_DETAIL_BODY" | extract_json_stdin "JSON.stringify((root?.data?.tasks || []).find(t => t.id === '$TASK_ID')?.recipeSnapshot?.items || [])")
if [ -z "$RECIPE_ITEMS" ] || [ "$RECIPE_ITEMS" = "[]" ]; then
  fail "No recipe items found in task snapshot" "$BATCH_DETAIL_BODY"
fi

FIRST_INGREDIENT_ID=$(echo "$RECIPE_ITEMS" | node -e "const fs=require('fs');const input=fs.readFileSync(0,'utf8').trim();const items=JSON.parse(input||'[]');console.log(items[0]?.ingredient_id || '');")
if [ -z "$FIRST_INGREDIENT_ID" ]; then
  fail "No ingredient_id found in recipe items" "$RECIPE_ITEMS"
fi

success "Batch detail retrieved: found ingredient $FIRST_INGREDIENT_ID"
echo ""

# Step 7: Update task with actual usage and mark COMPLETED
echo "Step 7: Update task (actual usage + COMPLETED)"
TOTAL_PRODUCTION_G=$(echo "$BATCH_DETAIL_BODY" | extract_json_stdin "(root?.data?.tasks || []).find(t => t.id === '$TASK_ID')?.totalProductionG || 0")
if [ "$TOTAL_PRODUCTION_G" = "0" ]; then
  fail "totalProductionG is 0 or not found" "$BATCH_DETAIL_BODY"
fi

ACTUAL_G=$(node -e "console.log(Math.floor($TOTAL_PRODUCTION_G * 0.7 * 1.1));")

UPDATE_TASK_FULL=$(curl_with_code "${API_BASE}/staff/kitchen/tasks/${TASK_ID}" \
  -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"ingredientsActual\":[{\"ingredientId\":\"$FIRST_INGREDIENT_ID\",\"actual_g\":$ACTUAL_G}],\"photosRaw\":[\"https://example.com/raw1.jpg\"],\"status\":\"COMPLETED\"}")
UPDATE_TASK_BODY=$(get_body "$UPDATE_TASK_FULL")
UPDATE_TASK_CODE=$(get_http_code "$UPDATE_TASK_FULL")

if [ "$UPDATE_TASK_CODE" != "200" ]; then
  fail "Failed to update task: HTTP $UPDATE_TASK_CODE" "$UPDATE_TASK_BODY"
fi

UPDATE_TASK_CODE_VALUE=$(echo "$UPDATE_TASK_BODY" | extract_json_stdin "root?.code")
if [ "$UPDATE_TASK_CODE_VALUE" != "0" ]; then
  fail "Failed to update task: code=$UPDATE_TASK_CODE_VALUE" "$UPDATE_TASK_BODY"
fi

UPDATED_STATUS=$(echo "$UPDATE_TASK_BODY" | extract_json_stdin "root?.data?.status || ''")
if [ "$UPDATED_STATUS" != "COMPLETED" ]; then
  fail "Task status not updated to COMPLETED (got: $UPDATED_STATUS)" "$UPDATE_TASK_BODY"
fi

success "Task updated to COMPLETED with actual usage"
echo ""

# Step 8: Verify inventory deduction
echo "Step 8: Verify inventory deduction"
RETRY_FULL=$(curl_with_code "${API_BASE}/admin/inventory/deductions/retry/${TASK_ID}" \
  -X POST \
  -H "Authorization: Bearer $TOKEN")
RETRY_BODY=$(get_body "$RETRY_FULL")
RETRY_CODE=$(get_http_code "$RETRY_FULL")

if [ "$RETRY_CODE" != "200" ]; then
  fail "Failed to retry inventory deduction: HTTP $RETRY_CODE" "$RETRY_BODY"
fi

RETRY_CODE_VALUE=$(echo "$RETRY_BODY" | extract_json_stdin "root?.code")
if [ "$RETRY_CODE_VALUE" != "0" ]; then
  fail "Failed to retry inventory deduction: code=$RETRY_CODE_VALUE" "$RETRY_BODY"
fi

ENTRIES_CREATED=$(echo "$RETRY_BODY" | extract_json_stdin "root?.data?.entriesCreated || 0")
TOTAL_ENTRIES=$(echo "$RETRY_BODY" | extract_json_stdin "root?.data?.totalEntries || 0")

if [ -z "$ENTRIES_CREATED" ] || [ "$ENTRIES_CREATED" = "0" ]; then
  warn "No new entries created (may already be deducted - idempotent)"
  SUMMARY_DEDUCTION_COMPLETED="YES (already deducted)"
else
  success "Inventory deduction verified: $ENTRIES_CREATED entries created (total: $TOTAL_ENTRIES)"
  SUMMARY_DEDUCTION_COMPLETED="YES"
  SUMMARY_LEDGER_ENTRIES=$ENTRIES_CREATED
fi
echo ""

# Step 9: Verify idempotency (retry again)
echo "Step 9: Verify idempotency (retry again)"
RETRY2_FULL=$(curl_with_code "${API_BASE}/admin/inventory/deductions/retry/${TASK_ID}" \
  -X POST \
  -H "Authorization: Bearer $TOKEN")
RETRY2_BODY=$(get_body "$RETRY2_FULL")
RETRY2_CODE=$(get_http_code "$RETRY2_FULL")

if [ "$RETRY2_CODE" != "200" ]; then
  fail "Failed to retry inventory deduction (second time): HTTP $RETRY2_CODE" "$RETRY2_BODY"
fi

RETRY2_CODE_VALUE=$(echo "$RETRY2_BODY" | extract_json_stdin "root?.code")
if [ "$RETRY2_CODE_VALUE" != "0" ]; then
  fail "Failed to retry inventory deduction (second time): code=$RETRY2_CODE_VALUE" "$RETRY2_BODY"
fi

ENTRIES_CREATED2=$(echo "$RETRY2_BODY" | extract_json_stdin "root?.data?.entriesCreated || 0")
if [ "$ENTRIES_CREATED2" != "0" ]; then
  fail "Idempotency violated: second retry created $ENTRIES_CREATED2 entries (expected 0)" "$RETRY2_BODY"
fi

SUMMARY_IDEMPOTENCY_PASSED="YES"
success "Idempotency verified: second retry created 0 entries"
echo ""

# Step 10: Test invalid status filter
echo "Step 10: Test invalid status filter"
INVALID_STATUS_FULL=$(curl_with_code "${API_BASE}/staff/kitchen/batches?status=INVALID" \
  -X GET \
  -H "Authorization: Bearer $TOKEN")
INVALID_STATUS_BODY=$(get_body "$INVALID_STATUS_FULL")
INVALID_STATUS_CODE=$(get_http_code "$INVALID_STATUS_FULL")

INVALID_STATUS_CODE_VALUE=$(echo "$INVALID_STATUS_BODY" | extract_json_stdin "root?.code")
if [ "$INVALID_STATUS_CODE_VALUE" = "0" ]; then
  fail "Invalid status should return error, but got success" "$INVALID_STATUS_BODY"
fi

success "Invalid status correctly rejected"
echo ""

# Summary
echo "=========================================="
echo "Summary"
echo "=========================================="
success "All steps passed!"
echo ""
echo "Verified:"
echo "  - Order creation and payment"
echo "  - Production batch creation"
echo "  - Kitchen batch listing with status filter"
echo "  - Batch detail retrieval"
echo "  - Task update with actual usage"
echo "  - Inventory deduction (idempotent)"
echo "  - Invalid status rejection"
echo ""
echo "E2E Summary:"
echo "  - Batch ID: $SUMMARY_BATCH_ID"
echo "  - Task ID: $SUMMARY_TASK_ID"
echo "  - Deduction Completed: $SUMMARY_DEDUCTION_COMPLETED"
echo "  - Ledger Entries Created: $SUMMARY_LEDGER_ENTRIES"
echo "  - Idempotency Test: $SUMMARY_IDEMPOTENCY_PASSED"
echo ""
echo "Phase 8.12 + 8.13 E2E verification: PASS"
echo ""
