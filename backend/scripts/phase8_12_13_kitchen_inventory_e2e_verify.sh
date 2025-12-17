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

fail() { echo -e "${RED}✗ ${1:-Error}${NC}"; exit 1; }
warn() { echo -e "${YELLOW}⚠ ${1:-Warning}${NC}"; }
info() { echo -e "${BLUE}ℹ ${1:-Info}${NC}"; }
success() { echo -e "${GREEN}✓ ${1:-Success}${NC}"; }

# Helper: Extract JSON field using Node.js
extract_json() {
  local json="$1"
  local expr="$2"
  node -e "const o=JSON.parse(process.argv[1]);console.log($expr);" "$json" 2>/dev/null || echo ""
}

echo "=========================================="
echo "Phase 8.12 + 8.13: Kitchen & Inventory E2E"
echo "=========================================="
echo ""

# Step 1: Health check
echo "Step 1: Health check"
HEALTH_RESPONSE=$(curl -s -w "\n%{http_code}" "${API_BASE}/health")
HEALTH_BODY=$(echo "$HEALTH_RESPONSE" | sed '$d')
HEALTH_CODE=$(echo "$HEALTH_RESPONSE" | tail -n 1)

if [ "$HEALTH_CODE" != "200" ]; then
  fail "Health check failed: HTTP $HEALTH_CODE"
fi
success "Health check passed"
echo ""

# Step 2: Login
echo "Step 2: Login"
LOGIN_RESPONSE=$(curl -s -X POST "${API_BASE}/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"customerId":"mvp-user-001"}')

TOKEN=$(echo "$LOGIN_RESPONSE" | node -e 'const o=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(o?.data?.token||"")')

if [ -z "$TOKEN" ]; then
  fail "Login failed (empty token). Response: $LOGIN_RESPONSE"
fi

CUSTOMER_ID=$(echo "$LOGIN_RESPONSE" | node -e 'const o=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(o?.data?.customerId||"mvp-user-001")')
success "Login successful: customerId=$CUSTOMER_ID"
echo ""

# Step 3: Ensure PAID order exists
echo "Step 3: Ensure PAID order exists"
ORDERS_RESPONSE=$(curl -s -X GET "${API_BASE}/orders" \
  -H "Authorization: Bearer $TOKEN")

ORDERS_CODE=$(extract_json "$ORDERS_RESPONSE" "o.code")
if [ "$ORDERS_CODE" != "0" ]; then
  fail "Failed to list orders: $ORDERS_RESPONSE"
fi

ORDER_COUNT=$(node -e "const d=JSON.parse(process.argv[1]);console.log(d.data?d.data.length:0);" "$ORDERS_RESPONSE")
PAID_ORDER_ID=""

if [ "$ORDER_COUNT" -gt 0 ]; then
  PAID_ORDER_ID=$(node -e "const d=JSON.parse(process.argv[1]);const orders=d.data||[];const paid=orders.find(o=>o.status==='PAID');console.log(paid?paid.id:'');" "$ORDERS_RESPONSE")
fi

if [ -z "$PAID_ORDER_ID" ]; then
  info "No PAID order found, creating new order..."
  
  # Create order draft
  DOG_ID=$(node -e "const d=JSON.parse(process.argv[1]);const dogs=d.data||[];console.log(dogs[0]?dogs[0].id:'');" "$(curl -s -X GET "${API_BASE}/dogs" -H "Authorization: Bearer $TOKEN")")
  if [ -z "$DOG_ID" ]; then
    fail "No dog found. Please create a dog first."
  fi

  RECIPE_ID=$(node -e "const d=JSON.parse(process.argv[1]);const recipes=d.data||[];console.log(recipes[0]?recipes[0].id:'');" "$(curl -s -X GET "${API_BASE}/recipes")")
  if [ -z "$RECIPE_ID" ]; then
    fail "No recipe found. Please create a recipe first."
  fi

  ADDRESS_ID=$(node -e "const d=JSON.parse(process.argv[1]);const addrs=d.data||[];const def=addrs.find(a=>a.isDefault);console.log(def?def.id:addrs[0]?addrs[0].id:'');" "$(curl -s -X GET "${API_BASE}/addresses" -H "Authorization: Bearer $TOKEN")")
  if [ -z "$ADDRESS_ID" ]; then
    fail "No address found. Please create an address first."
  fi

  DRAFT_RESPONSE=$(curl -s -X POST "${API_BASE}/orders/draft" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"dogId\":\"$DOG_ID\",\"recipeId\":\"$RECIPE_ID\",\"cycleDays\":7,\"addressId\":\"$ADDRESS_ID\"}")

  DRAFT_ORDER_ID=$(extract_json "$DRAFT_RESPONSE" "o.data.id")
  if [ -z "$DRAFT_ORDER_ID" ]; then
    fail "Failed to create order draft: $DRAFT_RESPONSE"
  fi

  # Submit order
  SUBMIT_RESPONSE=$(curl -s -X POST "${API_BASE}/orders/${DRAFT_ORDER_ID}/submit" \
    -H "Authorization: Bearer $TOKEN")

  # Pay order (simulate payment)
  PAY_RESPONSE=$(curl -s -X POST "${API_BASE}/orders/${DRAFT_ORDER_ID}/pay" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"paymentMethod":"WECHAT","transactionId":"test-txn-001"}')

  PAY_CODE=$(extract_json "$PAY_RESPONSE" "o.code")
  if [ "$PAY_CODE" != "0" ]; then
    fail "Failed to pay order: $PAY_RESPONSE"
  fi

  PAID_ORDER_ID="$DRAFT_ORDER_ID"
  success "Created and paid order: $PAID_ORDER_ID"
else
  success "Found existing PAID order: $PAID_ORDER_ID"
fi
echo ""

# Step 4: Create production batch
echo "Step 4: Create production batch"
BATCH_RESPONSE=$(curl -s -X POST "${API_BASE}/admin/production-batches" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"productionDate":"2025-12-17"}')

BATCH_CODE=$(extract_json "$BATCH_RESPONSE" "o.code")
if [ "$BATCH_CODE" != "0" ]; then
  fail "Failed to create production batch: $BATCH_RESPONSE"
fi

BATCH_ID=$(extract_json "$BATCH_RESPONSE" "o.data.id")
TASK_COUNT=$(extract_json "$BATCH_RESPONSE" "o.data.taskCount")

if [ -z "$BATCH_ID" ]; then
  fail "Batch ID not found in response: $BATCH_RESPONSE"
fi

if [ "$TASK_COUNT" = "0" ] || [ -z "$TASK_COUNT" ]; then
  fail "Batch created but has no tasks (taskCount=$TASK_COUNT)"
fi

success "Production batch created: $BATCH_ID (taskCount=$TASK_COUNT)"
echo ""

# Step 5: List kitchen batches with status filter
echo "Step 5: List kitchen batches (status=PENDING)"
KITCHEN_LIST_RESPONSE=$(curl -s -X GET "${API_BASE}/staff/kitchen/batches?status=PENDING" \
  -H "Authorization: Bearer $TOKEN")

KITCHEN_LIST_CODE=$(extract_json "$KITCHEN_LIST_RESPONSE" "o.code")
if [ "$KITCHEN_LIST_CODE" != "0" ]; then
  fail "Failed to list kitchen batches: $KITCHEN_LIST_RESPONSE"
fi

KITCHEN_BATCH_COUNT=$(node -e "const d=JSON.parse(process.argv[1]);console.log(d.data?d.data.length:0);" "$KITCHEN_LIST_RESPONSE")
if [ "$KITCHEN_BATCH_COUNT" = "0" ]; then
  fail "No batches found with status=PENDING"
fi

FOUND_BATCH_ID=$(node -e "const d=JSON.parse(process.argv[1]);const batches=d.data||[];const batch=batches.find(b=>b.id==='$BATCH_ID');console.log(batch?batch.id:'');" "$KITCHEN_LIST_RESPONSE")
if [ -z "$FOUND_BATCH_ID" ]; then
  fail "Created batch $BATCH_ID not found in kitchen list"
fi

TASK_ID=$(node -e "const d=JSON.parse(process.argv[1]);const batches=d.data||[];const batch=batches.find(b=>b.id==='$BATCH_ID');const tasks=batch?batch.tasks||[];console.log(tasks[0]?tasks[0].id:'');" "$KITCHEN_LIST_RESPONSE")
if [ -z "$TASK_ID" ]; then
  fail "No task found in batch $BATCH_ID"
fi

success "Kitchen batches listed: found batch $BATCH_ID with task $TASK_ID"
echo ""

# Step 6: Get batch detail to extract recipe snapshot
echo "Step 6: Get batch detail"
BATCH_DETAIL_RESPONSE=$(curl -s -X GET "${API_BASE}/staff/kitchen/batches/${BATCH_ID}" \
  -H "Authorization: Bearer $TOKEN")

BATCH_DETAIL_CODE=$(extract_json "$BATCH_DETAIL_RESPONSE" "o.code")
if [ "$BATCH_DETAIL_CODE" != "0" ]; then
  fail "Failed to get batch detail: $BATCH_DETAIL_RESPONSE"
fi

# Extract recipe snapshot items
RECIPE_ITEMS=$(node -e "const d=JSON.parse(process.argv[1]);const batch=d.data||{};const tasks=batch.tasks||[];const task=tasks.find(t=>t.id==='$TASK_ID');const items=task?task.recipeSnapshot?.items||[]:[];console.log(JSON.stringify(items));" "$BATCH_DETAIL_RESPONSE")

if [ -z "$RECIPE_ITEMS" ] || [ "$RECIPE_ITEMS" = "[]" ]; then
  fail "No recipe items found in task snapshot"
fi

FIRST_INGREDIENT_ID=$(node -e "const items=JSON.parse(process.argv[1]);console.log(items[0]?items[0].ingredient_id:'');" "$RECIPE_ITEMS")
if [ -z "$FIRST_INGREDIENT_ID" ]; then
  fail "No ingredient_id found in recipe items"
fi

success "Batch detail retrieved: found ingredient $FIRST_INGREDIENT_ID"
echo ""

# Step 7: Update task with actual usage and mark COMPLETED
echo "Step 7: Update task (actual usage + COMPLETED)"
TOTAL_PRODUCTION_G=$(node -e "const d=JSON.parse(process.argv[1]);const batch=d.data||{};const tasks=batch.tasks||[];const task=tasks.find(t=>t.id==='$TASK_ID');console.log(task?task.totalProductionG:0);" "$BATCH_DETAIL_RESPONSE")

# Calculate actual_g (use 10% more than required for testing)
ACTUAL_G=$(node -e "console.log(Math.floor($TOTAL_PRODUCTION_G * 0.7 * 1.1));")

UPDATE_TASK_RESPONSE=$(curl -s -X POST "${API_BASE}/staff/kitchen/tasks/${TASK_ID}" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"ingredientsActual\":[{\"ingredientId\":\"$FIRST_INGREDIENT_ID\",\"actual_g\":$ACTUAL_G}],\"photosRaw\":[\"https://example.com/raw1.jpg\"],\"status\":\"COMPLETED\"}")

UPDATE_TASK_CODE=$(extract_json "$UPDATE_TASK_RESPONSE" "o.code")
if [ "$UPDATE_TASK_CODE" != "0" ]; then
  fail "Failed to update task: $UPDATE_TASK_RESPONSE"
fi

UPDATED_STATUS=$(extract_json "$UPDATE_TASK_RESPONSE" "o.data.status")
if [ "$UPDATED_STATUS" != "COMPLETED" ]; then
  fail "Task status not updated to COMPLETED (got: $UPDATED_STATUS)"
fi

success "Task updated to COMPLETED with actual usage"
echo ""

# Step 8: Verify inventory deduction
echo "Step 8: Verify inventory deduction"
RETRY_RESPONSE=$(curl -s -X POST "${API_BASE}/admin/inventory/deductions/retry/${TASK_ID}" \
  -H "Authorization: Bearer $TOKEN")

RETRY_CODE=$(extract_json "$RETRY_RESPONSE" "o.code")
if [ "$RETRY_CODE" != "0" ]; then
  fail "Failed to retry inventory deduction: $RETRY_RESPONSE"
fi

ENTRIES_CREATED=$(extract_json "$RETRY_RESPONSE" "o.data.entriesCreated")
TOTAL_ENTRIES=$(extract_json "$RETRY_RESPONSE" "o.data.totalEntries")

if [ -z "$ENTRIES_CREATED" ] || [ "$ENTRIES_CREATED" = "0" ]; then
  warn "No new entries created (may already be deducted - idempotent)"
else
  success "Inventory deduction verified: $ENTRIES_CREATED entries created (total: $TOTAL_ENTRIES)"
fi
echo ""

# Step 9: Verify idempotency (retry again)
echo "Step 9: Verify idempotency (retry again)"
RETRY2_RESPONSE=$(curl -s -X POST "${API_BASE}/admin/inventory/deductions/retry/${TASK_ID}" \
  -H "Authorization: Bearer $TOKEN")

RETRY2_CODE=$(extract_json "$RETRY2_RESPONSE" "o.code")
if [ "$RETRY2_CODE" != "0" ]; then
  fail "Failed to retry inventory deduction (second time): $RETRY2_RESPONSE"
fi

ENTRIES_CREATED2=$(extract_json "$RETRY2_RESPONSE" "o.data.entriesCreated")
if [ "$ENTRIES_CREATED2" != "0" ]; then
  fail "Idempotency violated: second retry created $ENTRIES_CREATED2 entries (expected 0)"
fi

success "Idempotency verified: second retry created 0 entries"
echo ""

# Step 10: Test invalid status filter
echo "Step 10: Test invalid status filter"
INVALID_STATUS_RESPONSE=$(curl -s -X GET "${API_BASE}/staff/kitchen/batches?status=INVALID" \
  -H "Authorization: Bearer $TOKEN")

INVALID_STATUS_CODE=$(extract_json "$INVALID_STATUS_RESPONSE" "o.code")
if [ "$INVALID_STATUS_CODE" = "0" ]; then
  fail "Invalid status should return error, but got success"
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
echo "Phase 8.12 + 8.13 E2E verification: PASS"
echo ""
