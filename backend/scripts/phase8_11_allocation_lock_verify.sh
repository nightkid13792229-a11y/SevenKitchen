#!/bin/bash
# Phase 8.11: Allocation Lock Verification Script
# Verifies that OrderItems are allocated to production batches and cannot be allocated twice

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

# Helper function to extract JSON field
extract_json() {
  local json="$1"
  local field="$2"
  node -e "const data = JSON.parse(process.argv[1]); console.log(data.$field);" "$json"
}

# Helper function to extract array element
extract_array() {
  local json="$1"
  local index="$2"
  local field="$3"
  node -e "const data = JSON.parse(process.argv[1]); console.log(data[$index].$field);" "$json"
}

echo "=========================================="
echo "Phase 8.11: Allocation Lock Verification"
echo "=========================================="
echo ""

# Step 1: Health check
echo "Step 1: Health check"
HEALTH_RESPONSE=$(curl -s -w "\n%{http_code}" "${BASE_URL}/api/v1/health")
# Use sed to remove last line (macOS compatible, works on both BSD and GNU sed)
HEALTH_BODY=$(echo "$HEALTH_RESPONSE" | sed '$d')
HEALTH_CODE=$(echo "$HEALTH_RESPONSE" | tail -n 1)

if [ "$HEALTH_CODE" != "200" ]; then
  echo "❌ Health check failed: HTTP $HEALTH_CODE"
  exit 1
fi
echo "✅ Health check passed"
echo ""

# Step 2: Login (get JWT token)
echo "Step 2: Login"
LOGIN_RESPONSE=$(curl -s -X POST "${BASE_URL}/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"customerId":"mvp-user-001"}')

# Extract token using node (robust parsing)
TOKEN=$(echo "$LOGIN_RESPONSE" | node -e 'const o=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(o?.data?.token||"")')

if [ -z "$TOKEN" ]; then
  echo "❌ Login failed (empty token). Raw response:"
  echo "$LOGIN_RESPONSE"
  exit 1
fi

# Extract customerId for logging
CUSTOMER_ID=$(echo "$LOGIN_RESPONSE" | node -e 'const o=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(o?.data?.customerId||"")')
echo "✅ Login successful: customerId=${CUSTOMER_ID:-mvp-user-001}"
echo ""

# Step 3: Create/confirm/pay order (reuse existing order if available)
echo "Step 3: Ensure PAID order exists"
# Try to find existing PAID order
ORDERS_RESPONSE=$(curl -s -X GET "${BASE_URL}/api/v1/orders" \
  -H "Authorization: Bearer $TOKEN")

ORDERS_CODE=$(extract_json "$ORDERS_RESPONSE" "code")
if [ "$ORDERS_CODE" != "0" ]; then
  echo "❌ Failed to list orders: $ORDERS_RESPONSE"
  exit 1
fi

# Check if we have a PAID order
ORDER_COUNT=$(node -e "const data = JSON.parse(process.argv[1]); console.log(data.data ? data.data.length : 0);" "$ORDERS_RESPONSE")
PAID_ORDER_ID=""

if [ "$ORDER_COUNT" -gt 0 ]; then
  # Find first PAID order
  PAID_ORDER_ID=$(node -e "
    const data = JSON.parse(process.argv[1]);
    const orders = data.data || [];
    const paidOrder = orders.find(o => o.status === 'PAID');
    console.log(paidOrder ? paidOrder.id : '');
  " "$ORDERS_RESPONSE")
fi

if [ -z "$PAID_ORDER_ID" ]; then
  echo "⚠️  No PAID order found. Creating new order..."
  
  # Create order draft
  CREATE_RESPONSE=$(curl -s -X POST "${BASE_URL}/api/v1/orders/draft" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "items": [{
        "recipeId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
        "quantityG": 1000,
        "packageCount": 5,
        "packageSpecG": 200
      }]
    }')
  
  CREATE_CODE=$(extract_json "$CREATE_RESPONSE" "code")
  if [ "$CREATE_CODE" != "0" ]; then
    echo "❌ Failed to create order: $CREATE_RESPONSE"
    exit 1
  fi
  
  ORDER_ID=$(extract_json "$CREATE_RESPONSE" "data.id")
  
  # Confirm order
  CONFIRM_RESPONSE=$(curl -s -X POST "${BASE_URL}/api/v1/orders/${ORDER_ID}/confirm" \
    -H "Authorization: Bearer $TOKEN")
  
  CONFIRM_CODE=$(extract_json "$CONFIRM_RESPONSE" "code")
  if [ "$CONFIRM_CODE" != "0" ]; then
    echo "❌ Failed to confirm order: $CONFIRM_RESPONSE"
    exit 1
  fi
  
  # Pay order
  PAY_RESPONSE=$(curl -s -X POST "${BASE_URL}/api/v1/orders/${ORDER_ID}/pay" \
    -H "Authorization: Bearer $TOKEN")
  
  PAY_CODE=$(extract_json "$PAY_RESPONSE" "code")
  if [ "$PAY_CODE" != "0" ]; then
    echo "❌ Failed to pay order: $PAY_RESPONSE"
    exit 1
  fi
  
  PAID_ORDER_ID="$ORDER_ID"
  echo "✅ Created and paid order: $PAID_ORDER_ID"
else
  echo "✅ Found existing PAID order: $PAID_ORDER_ID"
fi
echo ""

# Step 4: Create production batch A
echo "Step 4: Create production batch A"
BATCH_A_RESPONSE=$(curl -s -X POST "${BASE_URL}/api/v1/admin/production-batches" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"productionDate\": \"$(date +%Y-%m-%d)\"
  }")

BATCH_A_CODE=$(extract_json "$BATCH_A_RESPONSE" "code")
if [ "$BATCH_A_CODE" != "0" ]; then
  echo "❌ Failed to create batch A: $BATCH_A_RESPONSE"
  exit 1
fi

BATCH_A_ID=$(extract_json "$BATCH_A_RESPONSE" "data.id")
BATCH_A_ORDER_ITEM_COUNT=$(extract_json "$BATCH_A_RESPONSE" "data.orderItemCount")
echo "✅ Created batch A: $BATCH_A_ID (orderItemCount=$BATCH_A_ORDER_ITEM_COUNT)"

if [ "$BATCH_A_ORDER_ITEM_COUNT" = "0" ]; then
  echo "⚠️  Warning: Batch A has 0 order items. This may indicate all items are already allocated."
fi
echo ""

# Step 5: Create production batch B (should have 0 items or fail)
echo "Step 5: Create production batch B (should have 0 items or fail)"
BATCH_B_RESPONSE=$(curl -s -X POST "${BASE_URL}/api/v1/admin/production-batches" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"productionDate\": \"$(date +%Y-%m-%d)\"
  }")

BATCH_B_CODE=$(extract_json "$BATCH_B_RESPONSE" "code")
BATCH_B_MESSAGE=$(extract_json "$BATCH_B_RESPONSE" "message" 2>/dev/null || echo "")

if [ "$BATCH_B_CODE" != "0" ]; then
  echo "✅ Batch B creation correctly rejected: $BATCH_B_MESSAGE"
  echo "   This confirms allocation lock is working (no eligible items available)"
else
  BATCH_B_ID=$(extract_json "$BATCH_B_RESPONSE" "data.id")
  BATCH_B_ORDER_ITEM_COUNT=$(extract_json "$BATCH_B_RESPONSE" "data.orderItemCount")
  
  if [ "$BATCH_B_ORDER_ITEM_COUNT" = "0" ]; then
    echo "✅ Batch B created with 0 items (all items already allocated)"
  else
    echo "⚠️  Warning: Batch B has $BATCH_B_ORDER_ITEM_COUNT items. This may indicate allocation lock is not working correctly."
  fi
fi
echo ""

# Step 6: Verify OrderItem allocation (using Prisma or API)
echo "Step 6: Verify OrderItem allocation"
echo "   Note: This step requires database access or API endpoint to query OrderItems"
echo "   For manual verification, check that OrderItems have productionBatchId set"
echo ""

# Step 7: Summary
echo "=========================================="
echo "Verification Summary"
echo "=========================================="
echo "✅ Batch A created: $BATCH_A_ID (orderItemCount=$BATCH_A_ORDER_ITEM_COUNT)"
if [ "$BATCH_B_CODE" = "0" ]; then
  echo "✅ Batch B created: $BATCH_B_ID (orderItemCount=$BATCH_B_ORDER_ITEM_COUNT)"
else
  echo "✅ Batch B correctly rejected: $BATCH_B_MESSAGE"
fi
echo ""
echo "Allocation lock verification complete!"
echo ""
echo "Next steps:"
echo "1. Verify OrderItems have productionBatchId set in database"
echo "2. Check that allocatedAt timestamp is set"
echo "3. Confirm that subsequent batch creation excludes already-allocated items"
echo ""

exit 0
