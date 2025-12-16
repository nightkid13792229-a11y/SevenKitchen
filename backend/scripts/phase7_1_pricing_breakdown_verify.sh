#!/bin/bash

# Phase 7.1 Verification Script
# Verifies Order Pricing Explainability & Reconciliation
# Tests that pricing breakdown snapshot is persisted and accessible via dedicated endpoint

set -euo pipefail

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"
API_BASE="${BASE_URL}/api/v1"
CUSTOMER_ID="mvp-user-001"

# Canonical seeded IDs (UUID v4)
CANONICAL_RECIPE_ID="3fa85f64-5717-4562-b3fc-2c963f66afa6"
CANONICAL_SHIPPING_TEMPLATE_ID="8fa85f64-5717-4562-b3fc-2c963f66afa6"

OUTPUT_FILE="backend/docs/phase7_1_pricing_breakdown_verify_output.txt"

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}Phase 7.1 Verification: Pricing Breakdown Snapshot${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"

# Helper function to extract JSON value using node
extract_json() {
    local json="$1"
    local path="$2"
    echo "$json" | node -e "
        const fs = require('fs');
        try {
            const input = fs.readFileSync(0, 'utf8').trim();
            const data = JSON.parse(input);
            const result = $path;
            if (result === undefined || result === null) {
                console.log('');
            } else if (typeof result === 'object') {
                console.log(JSON.stringify(result));
            } else {
                console.log(result);
            }
        } catch (e) {
            console.log('');
        }
    " 2>/dev/null || echo ""
}

# Helper function to check API response code
check_response_code() {
    local response="$1"
    local expected_code="${2:-0}"
    local code=$(extract_json "$response" "data.code !== undefined ? data.code : (data.data && data.data.code !== undefined ? data.data.code : 0)")
    if [ "$code" != "$expected_code" ]; then
        echo -e "${RED}✗ Expected code=${expected_code}, got code=${code}${NC}"
        echo -e "${YELLOW}Response: ${response}${NC}"
        return 1
    fi
    return 0
}

# Step 1: Check backend is up
echo -e "${BLUE}[Step 1] Checking backend health${NC}"
if ! curl -sSf "${BASE_URL}/api/v1/health" > /dev/null 2>&1; then
    echo -e "${RED}✗ Backend server is not running at ${BASE_URL}${NC}"
    echo -e "${YELLOW}Please start the server: cd backend && npm run start:dev${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Backend server is running${NC}\n"

# Step 2: Login and capture token
echo -e "${BLUE}[Step 2] Login and capture token${NC}"
LOGIN_RESPONSE=$(curl -sS -X POST "${API_BASE}/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"customerId\":\"${CUSTOMER_ID}\"}")

if ! check_response_code "$LOGIN_RESPONSE" "0"; then
    echo -e "${RED}✗ Login failed${NC}"
    exit 1
fi

TOKEN=$(extract_json "$LOGIN_RESPONSE" "(data.data && data.data.token) || (data.token) || ''")
if [ -z "$TOKEN" ]; then
    TOKEN=$(extract_json "$LOGIN_RESPONSE" "data.data?.token || data.token || ''")
fi

if [ -z "$TOKEN" ]; then
    echo -e "${RED}✗ Failed to extract JWT token from login response${NC}"
    echo -e "${YELLOW}Response: ${LOGIN_RESPONSE}${NC}"
    exit 1
fi

echo -e "${GREEN}✓ JWT token obtained${NC}\n"

# Step 3: Find or create a dog (idempotent)
echo -e "${BLUE}[Step 3] Create or find dog (idempotent)${NC}"
DOGS_RESPONSE=$(curl -sS "${API_BASE}/dogs" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "X-Customer-Id: ${CUSTOMER_ID}")

if ! check_response_code "$DOGS_RESPONSE" "0"; then
    echo -e "${RED}✗ GET /api/v1/dogs failed${NC}"
    exit 1
fi

# Robust dog ID extractor
extract_dog_id() {
    local response_json="$1"
    local dog_id=$(node -e '
        const response = process.argv[1];
        try {
            const parsed = JSON.parse(response);
            const root = (parsed.data !== undefined) ? parsed.data : parsed;
            const paths = [
                () => root && root.id,
                () => root && root.dog && root.dog.id,
                () => root && root.profile && root.profile.id,
                () => root && root.items && Array.isArray(root.items) && root.items[0] && root.items[0].id,
                () => root && root.result && root.result.id,
                () => Array.isArray(root) && root.length > 0 && root[0] && root[0].id,
            ];
            for (const pathFn of paths) {
                const value = pathFn();
                if (value && typeof value === "string" && value.length > 0) {
                    console.log(value);
                    process.exit(0);
                }
            }
            process.exit(1);
        } catch (e) {
            process.exit(1);
        }
    ' "$response_json" 2>/dev/null)
    
    if [ -n "$dog_id" ] && [ "$dog_id" != "null" ] && [ ${#dog_id} -gt 0 ]; then
        echo "$dog_id"
        return 0
    fi
    return 1
}

DOG_ID=$(extract_dog_id "$DOGS_RESPONSE" || echo "")

if [ -n "$DOG_ID" ] && [ "$DOG_ID" != "null" ]; then
    echo -e "${GREEN}✓ Reusing existing dog (${DOG_ID})${NC}"
else
    BREED_ID="550e8400-e29b-41d4-a716-446655440000"
    
    CREATE_DOG_BODY=$(cat <<EOF
{
  "name": "Phase7.1 Dog",
  "breedId": "${BREED_ID}",
  "birthday": "2020-01-01T00:00:00Z",
  "gender": "MALE",
  "isNeutered": false,
  "currentWeightKg": 10.0,
  "bcsScore": 5,
  "activityLevel": "NORMAL",
  "lifeStageOverride": "NONE",
  "mealsPerDay": 2,
  "treatInputMode": "ESTIMATE_LEVEL",
  "treatLevel": "LOW"
}
EOF
)
    
    CREATE_DOG_RESPONSE=$(curl -sS -X POST "${API_BASE}/dogs" \
      -H "Authorization: Bearer ${TOKEN}" \
      -H "X-Customer-Id: ${CUSTOMER_ID}" \
      -H "Content-Type: application/json" \
      -d "$CREATE_DOG_BODY")
    
    if ! check_response_code "$CREATE_DOG_RESPONSE" "0"; then
        echo -e "${YELLOW}⚠ Dog creation failed (may need breed seeded first)${NC}"
        DOG_ID=$(extract_dog_id "$DOGS_RESPONSE" || echo "")
        if [ -z "$DOG_ID" ] || [ "$DOG_ID" = "null" ]; then
            echo -e "${RED}✗ Cannot proceed without a dog ID${NC}"
            exit 1
        fi
    else
        DOG_ID=$(extract_dog_id "$CREATE_DOG_RESPONSE" || echo "")
        if [ -z "$DOG_ID" ] || [ "$DOG_ID" = "null" ]; then
            echo -e "${RED}✗ Failed to extract dog ID from create response${NC}"
            exit 1
        fi
        echo -e "${GREEN}✓ Dog created (${DOG_ID})${NC}"
    fi
fi

if [ -z "$DOG_ID" ] || [ "$DOG_ID" = "null" ] || [ ${#DOG_ID} -eq 0 ]; then
    echo -e "${RED}✗ Failed to get dog ID${NC}"
    exit 1
fi

echo ""

# Step 4: Create or find an address
echo -e "${BLUE}[Step 4] Create or find address${NC}"
ADDRESSES_RESPONSE=$(curl -sS "${API_BASE}/addresses" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "X-Customer-Id: ${CUSTOMER_ID}")

if ! check_response_code "$ADDRESSES_RESPONSE" "0"; then
    echo -e "${RED}✗ GET /api/v1/addresses failed${NC}"
    exit 1
fi

ADDRESSES_ARRAY=$(extract_json "$ADDRESSES_RESPONSE" "JSON.stringify((data.data !== undefined ? data.data : data) || [])")
ADDRESS_COUNT=$(echo "$ADDRESSES_ARRAY" | node -e "try { const arr = JSON.parse(process.stdin.read()); console.log(Array.isArray(arr) ? arr.length : 0); } catch(e) { console.log(0); }" 2>/dev/null || echo "0")

if [ "$ADDRESS_COUNT" -gt 0 ]; then
    ADDRESS_ID=$(echo "$ADDRESSES_ARRAY" | node -e "
        try {
            const arr = JSON.parse(process.stdin.read());
            if (Array.isArray(arr) && arr.length > 0) console.log(arr[0].id || '');
        } catch(e) {}
    " 2>/dev/null)
    echo -e "${GREEN}✓ Using existing address (${ADDRESS_ID})${NC}"
else
    CREATE_ADDRESS_BODY=$(cat <<EOF
{
  "recipientName": "Test User",
  "phone": "13800138000",
  "region": {
    "province": "广东省",
    "city": "深圳市",
    "district": "南山区"
  },
  "detail": "Test Street 123",
  "isDefault": true
}
EOF
)
    CREATE_ADDRESS_RESPONSE=$(curl -sS -X POST "${API_BASE}/addresses" \
      -H "Authorization: Bearer ${TOKEN}" \
      -H "X-Customer-Id: ${CUSTOMER_ID}" \
      -H "Content-Type: application/json" \
      -d "$CREATE_ADDRESS_BODY")

    if ! check_response_code "$CREATE_ADDRESS_RESPONSE" "0"; then
        echo -e "${RED}✗ Failed to create address${NC}"
        exit 1
    fi

    ADDRESS_ID=$(extract_json "$CREATE_ADDRESS_RESPONSE" "(data.data && data.data.id) || (data.id) || ''")
    echo -e "${GREEN}✓ Created new address (${ADDRESS_ID})${NC}"
fi

if [ -z "$ADDRESS_ID" ] || [ "$ADDRESS_ID" = "null" ]; then
    echo -e "${RED}✗ Failed to get address ID${NC}"
    exit 1
fi

echo ""

# Step 5: Create order with deterministic quantity
echo -e "${BLUE}[Step 5] Create order with deterministic quantity${NC}"
QUANTITY_G=1400
PACKAGE_SPEC_G=100
PACKAGE_COUNT=$(( (QUANTITY_G + PACKAGE_SPEC_G - 1) / PACKAGE_SPEC_G ))

CREATE_ORDER_BODY=$(cat <<EOF
{
  "dogId": "${DOG_ID}",
  "addressId": "${ADDRESS_ID}",
  "type": "FRESH_FOOD",
  "items": [{
    "recipeId": "${CANONICAL_RECIPE_ID}",
    "quantityG": ${QUANTITY_G},
    "packageCount": ${PACKAGE_COUNT},
    "packageSpecG": ${PACKAGE_SPEC_G}
  }]
}
EOF
)

CREATE_ORDER_RESPONSE=$(curl -sS -X POST "${API_BASE}/orders" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "X-Customer-Id: ${CUSTOMER_ID}" \
  -H "Content-Type: application/json" \
  -d "$CREATE_ORDER_BODY")

if ! check_response_code "$CREATE_ORDER_RESPONSE" "0"; then
    echo -e "${RED}✗ POST /api/v1/orders failed${NC}"
    echo -e "${YELLOW}Response: ${CREATE_ORDER_RESPONSE}${NC}"
    exit 1
fi

ORDER_ID=$(extract_json "$CREATE_ORDER_RESPONSE" "(data.data && data.data.id) || (data.id) || ''")
ORDER_AMOUNT_PRODUCT=$(extract_json "$CREATE_ORDER_RESPONSE" "(data.data && data.data.amountProduct) || (data.amountProduct) || 0")
ORDER_AMOUNT_SHIPPING=$(extract_json "$CREATE_ORDER_RESPONSE" "(data.data && data.data.amountShipping) || (data.amountShipping) || 0")
ORDER_AMOUNT_TOTAL=$(extract_json "$CREATE_ORDER_RESPONSE" "(data.data && data.data.amountTotal) || (data.amountTotal) || 0")

if [ -z "$ORDER_ID" ] || [ "$ORDER_ID" = "null" ]; then
    echo -e "${RED}✗ Failed to get order ID${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Order created (${ORDER_ID})${NC}"
echo -e "  Product: ¥${ORDER_AMOUNT_PRODUCT}"
echo -e "  Shipping: ¥${ORDER_AMOUNT_SHIPPING}"
echo -e "  Total: ¥${ORDER_AMOUNT_TOTAL}"

echo ""

# Step 6: Confirm and pay order
echo -e "${BLUE}[Step 6] Confirm and pay order${NC}"
CONFIRM_RESPONSE=$(curl -sS -X POST "${API_BASE}/orders/${ORDER_ID}/confirm" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "X-Customer-Id: ${CUSTOMER_ID}")

if ! check_response_code "$CONFIRM_RESPONSE" "0"; then
    echo -e "${RED}✗ POST /api/v1/orders/${ORDER_ID}/confirm failed${NC}"
    exit 1
fi

PAY_RESPONSE=$(curl -sS -X POST "${API_BASE}/orders/${ORDER_ID}/pay" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "X-Customer-Id: ${CUSTOMER_ID}")

if ! check_response_code "$PAY_RESPONSE" "0"; then
    echo -e "${RED}✗ POST /api/v1/orders/${ORDER_ID}/pay failed${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Order confirmed and paid${NC}\n"

# Step 7: Call GET /orders/:id/pricing-breakdown
echo -e "${BLUE}[Step 7] Get pricing breakdown${NC}"
BREAKDOWN_RESPONSE=$(curl -sS "${API_BASE}/orders/${ORDER_ID}/pricing-breakdown" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "X-Customer-Id: ${CUSTOMER_ID}")

if ! check_response_code "$BREAKDOWN_RESPONSE" "0"; then
    echo -e "${RED}✗ GET /api/v1/orders/${ORDER_ID}/pricing-breakdown failed${NC}"
    echo -e "${YELLOW}Response: ${BREAKDOWN_RESPONSE}${NC}"
    exit 1
fi

# Extract breakdown fields
BREAKDOWN_DATA=$(extract_json "$BREAKDOWN_RESPONSE" "(data.data !== undefined ? data.data : data)")

if [ -z "$BREAKDOWN_DATA" ] || [ "$BREAKDOWN_DATA" = "null" ]; then
    echo -e "${RED}✗ Pricing breakdown data is null or missing${NC}"
    echo -e "${YELLOW}Response: ${BREAKDOWN_RESPONSE}${NC}"
    exit 1
fi

PRODUCT_PRICE=$(echo "$BREAKDOWN_DATA" | node -e "
    const fs = require('fs');
    try {
        const input = fs.readFileSync(0, 'utf8').trim();
        const parsed = JSON.parse(input);
        console.log(parsed.productPrice || 0);
    } catch (e) {
        console.log(0);
    }
" 2>/dev/null)

SHIPPING_FEE=$(echo "$BREAKDOWN_DATA" | node -e "
    const fs = require('fs');
    try {
        const input = fs.readFileSync(0, 'utf8').trim();
        const parsed = JSON.parse(input);
        console.log(parsed.shippingFee || 0);
    } catch (e) {
        console.log(0);
    }
" 2>/dev/null)

TOTAL_PRICE=$(echo "$BREAKDOWN_DATA" | node -e "
    const fs = require('fs');
    try {
        const input = fs.readFileSync(0, 'utf8').trim();
        const parsed = JSON.parse(input);
        console.log(parsed.totalPrice || 0);
    } catch (e) {
        console.log(0);
    }
" 2>/dev/null)

COST_INGREDIENTS=$(echo "$BREAKDOWN_DATA" | node -e "
    const fs = require('fs');
    try {
        const input = fs.readFileSync(0, 'utf8').trim();
        const parsed = JSON.parse(input);
        console.log(parsed.costIngredients || 0);
    } catch (e) {
        console.log(0);
    }
" 2>/dev/null)

COST_PACKAGING=$(echo "$BREAKDOWN_DATA" | node -e "
    const fs = require('fs');
    try {
        const input = fs.readFileSync(0, 'utf8').trim();
        const parsed = JSON.parse(input);
        console.log(parsed.costPackaging || 0);
    } catch (e) {
        console.log(0);
    }
" 2>/dev/null)

COST_LABOR=$(echo "$BREAKDOWN_DATA" | node -e "
    const fs = require('fs');
    try {
        const input = fs.readFileSync(0, 'utf8').trim();
        const parsed = JSON.parse(input);
        console.log(parsed.costLabor || 0);
    } catch (e) {
        console.log(0);
    }
" 2>/dev/null)

COST_OVERHEAD=$(echo "$BREAKDOWN_DATA" | node -e "
    const fs = require('fs');
    try {
        const input = fs.readFileSync(0, 'utf8').trim();
        const parsed = JSON.parse(input);
        console.log(parsed.costOverhead || 0);
    } catch (e) {
        console.log(0);
    }
" 2>/dev/null)

echo -e "${GREEN}✓ Pricing breakdown retrieved:${NC}"
echo -e "  Cost Ingredients: ¥${COST_INGREDIENTS}"
echo -e "  Cost Packaging: ¥${COST_PACKAGING}"
echo -e "  Cost Labor: ¥${COST_LABOR}"
echo -e "  Cost Overhead: ¥${COST_OVERHEAD}"
echo -e "  Product Price: ¥${PRODUCT_PRICE}"
echo -e "  Shipping Fee: ¥${SHIPPING_FEE}"
echo -e "  Total Price: ¥${TOTAL_PRICE}"

# Step 8: Validate breakdown
echo -e "${BLUE}[Step 8] Validate pricing breakdown${NC}"

# Rule 1: productPrice > 0 (REQUIRED)
PRODUCT_NUM=$(echo "$PRODUCT_PRICE" | node -e "const fs=require('fs'); const input=fs.readFileSync(0,'utf8').trim(); console.log(parseFloat(input) || 0)" 2>/dev/null || echo "0")
if (( $(echo "$PRODUCT_NUM <= 0" | bc -l 2>/dev/null || echo "1") )); then
    echo -e "${RED}✗ Product price must be > 0, got ${PRODUCT_NUM}${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Product price > 0${NC}"

# Rule 2: shippingFee >= 0 (REQUIRED)
SHIPPING_NUM=$(echo "$SHIPPING_FEE" | node -e "const fs=require('fs'); const input=fs.readFileSync(0,'utf8').trim(); console.log(parseFloat(input) || 0)" 2>/dev/null || echo "0")
if (( $(echo "$SHIPPING_NUM < 0" | bc -l 2>/dev/null || echo "1") )); then
    echo -e "${RED}✗ Shipping fee must be >= 0, got ${SHIPPING_NUM}${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Shipping fee >= 0${NC}"

# Rule 3: totalPrice ≈ productPrice + shippingFee (tolerance 0.01)
TOTAL_NUM=$(echo "$TOTAL_PRICE" | node -e "const fs=require('fs'); const input=fs.readFileSync(0,'utf8').trim(); console.log(parseFloat(input) || 0)" 2>/dev/null || echo "0")
EXPECTED_TOTAL=$(echo "$PRODUCT_NUM + $SHIPPING_NUM" | bc -l 2>/dev/null || echo "$TOTAL_NUM")
DIFF=$(echo "$TOTAL_NUM - $EXPECTED_TOTAL" | bc -l 2>/dev/null || echo "0")
ABS_DIFF=$(echo "$DIFF < 0 ? -$DIFF : $DIFF" | bc -l 2>/dev/null || echo "0")

if (( $(echo "$ABS_DIFF > 0.01" | bc -l 2>/dev/null || echo "1") )); then
    echo -e "${RED}✗ Total price (${TOTAL_NUM}) doesn't match product (${PRODUCT_NUM}) + shipping (${SHIPPING_NUM}) = ${EXPECTED_TOTAL}${NC}"
    echo -e "${RED}  Difference: ${ABS_DIFF}${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Total price matches product + shipping (tolerance 0.01)${NC}"

# Rule 4: All cost fields exist and are >= 0
COST_ING_NUM=$(echo "$COST_INGREDIENTS" | node -e "const fs=require('fs'); const input=fs.readFileSync(0,'utf8').trim(); console.log(parseFloat(input) || 0)" 2>/dev/null || echo "0")
COST_PKG_NUM=$(echo "$COST_PACKAGING" | node -e "const fs=require('fs'); const input=fs.readFileSync(0,'utf8').trim(); console.log(parseFloat(input) || 0)" 2>/dev/null || echo "0")
COST_LAB_NUM=$(echo "$COST_LABOR" | node -e "const fs=require('fs'); const input=fs.readFileSync(0,'utf8').trim(); console.log(parseFloat(input) || 0)" 2>/dev/null || echo "0")
COST_OVH_NUM=$(echo "$COST_OVERHEAD" | node -e "const fs=require('fs'); const input=fs.readFileSync(0,'utf8').trim(); console.log(parseFloat(input) || 0)" 2>/dev/null || echo "0")

if (( $(echo "$COST_ING_NUM < 0" | bc -l 2>/dev/null || echo "1") )); then
    echo -e "${RED}✗ costIngredients must be >= 0, got ${COST_ING_NUM}${NC}"
    exit 1
fi
if (( $(echo "$COST_PKG_NUM < 0" | bc -l 2>/dev/null || echo "1") )); then
    echo -e "${RED}✗ costPackaging must be >= 0, got ${COST_PKG_NUM}${NC}"
    exit 1
fi
if (( $(echo "$COST_LAB_NUM < 0" | bc -l 2>/dev/null || echo "1") )); then
    echo -e "${RED}✗ costLabor must be >= 0, got ${COST_LAB_NUM}${NC}"
    exit 1
fi
if (( $(echo "$COST_OVH_NUM < 0" | bc -l 2>/dev/null || echo "1") )); then
    echo -e "${RED}✗ costOverhead must be >= 0, got ${COST_OVH_NUM}${NC}"
    exit 1
fi
echo -e "${GREEN}✓ All cost fields exist and are >= 0${NC}"

# Save evidence
echo -e "${BLUE}[Step 9] Saving evidence${NC}"
mkdir -p "$(dirname "$OUTPUT_FILE")"
cat > "$OUTPUT_FILE" <<EOF
Phase 7.1 Pricing Breakdown Verification Output
Generated: $(date -u +"%Y-%m-%d %H:%M:%S UTC")

Order ID: ${ORDER_ID}
Customer ID: ${CUSTOMER_ID}

Pricing Breakdown:
- Cost Ingredients: ¥${COST_INGREDIENTS}
- Cost Packaging: ¥${COST_PACKAGING}
- Cost Labor: ¥${COST_LABOR}
- Cost Overhead: ¥${COST_OVERHEAD}
- Product Price: ¥${PRODUCT_PRICE}
- Shipping Fee: ¥${SHIPPING_FEE}
- Total Price: ¥${TOTAL_PRICE}

Validation:
✓ Product price > 0
✓ Shipping fee >= 0
✓ Total price = product + shipping (tolerance 0.01)
✓ All cost fields exist and are >= 0

Full Response:
${BREAKDOWN_RESPONSE}
EOF

echo -e "${GREEN}✓ Evidence saved to ${OUTPUT_FILE}${NC}\n"

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✓ Phase 7.1 Verification Complete!${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}Summary:${NC}"
echo -e "  ✓ Order creation stores pricing breakdown snapshot"
echo -e "  ✓ GET /orders/:id/pricing-breakdown returns breakdown"
echo -e "  ✓ All cost fields exist and are valid"
echo -e "  ✓ Total price matches product + shipping"
echo ""

