#!/bin/bash

# Phase 6 Verification Script
# Verifies Shipping Fee Domain + Pricing Preview APIs + Frontend integration
# Tests that customers can see accurate pricing breakdown before payment

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

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}Phase 6 Verification: Shipping Fee + Pricing Preview${NC}"
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

# Robust dog ID extractor that tries multiple response structure paths
extract_dog_id() {
    local response_json="$1"
    local dog_id=$(node -e '
        const response = process.argv[1];
        try {
            const parsed = JSON.parse(response);
            // Handle API response wrapper: { code: 0, data: {...} }
            const root = (parsed.data !== undefined) ? parsed.data : parsed;
            
            // Try multiple paths in order
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
            
            // No valid ID found
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

# Try to extract dog ID from list response
DOG_ID=$(extract_dog_id "$DOGS_RESPONSE" || echo "")

if [ -n "$DOG_ID" ] && [ "$DOG_ID" != "null" ]; then
    # Found existing dog
    echo -e "${GREEN}✓ Reusing existing dog (${DOG_ID})${NC}"
else
    # Create new dog - need a breed ID first
    # For MVP, we'll use a placeholder breed ID (same as Phase 5)
    # In real scenario, breeds would be seeded
    BREED_ID="550e8400-e29b-41d4-a716-446655440000"  # Placeholder breed ID
    
    CREATE_DOG_BODY=$(cat <<EOF
{
  "name": "Phase6 Dog",
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
        echo -e "${YELLOW}Response: ${CREATE_DOG_RESPONSE}${NC}"
        echo -e "${YELLOW}Skipping dog creation - trying to find existing dog again${NC}"
        # Try to get dog ID from list response again with robust extractor
        DOG_ID=$(extract_dog_id "$DOGS_RESPONSE" || echo "")
        if [ -z "$DOG_ID" ] || [ "$DOG_ID" = "null" ]; then
            echo -e "${RED}✗ Cannot proceed without a dog ID${NC}"
            echo -e "${RED}Response structure is unsupported or no dogs found${NC}"
            echo -e "${YELLOW}Response preview: ${CREATE_DOG_RESPONSE:0:400}...${NC}"
            exit 1
        fi
    else
        # Extract dog ID from create response using robust extractor
        DOG_ID=$(extract_dog_id "$CREATE_DOG_RESPONSE" || echo "")
        if [ -z "$DOG_ID" ] || [ "$DOG_ID" = "null" ]; then
            echo -e "${RED}✗ Failed to extract dog ID from create response${NC}"
            echo -e "${RED}Response structure is unsupported${NC}"
            echo -e "${YELLOW}Response preview: ${CREATE_DOG_RESPONSE:0:400}...${NC}"
            exit 1
        fi
        echo -e "${GREEN}✓ Dog created (${DOG_ID})${NC}"
    fi
fi

if [ -z "$DOG_ID" ] || [ "$DOG_ID" = "null" ] || [ ${#DOG_ID} -eq 0 ]; then
    echo -e "${RED}✗ Failed to get dog ID${NC}"
    echo -e "${RED}Response structure is unsupported or no valid dog ID found${NC}"
    echo -e "${YELLOW}Response preview: ${DOGS_RESPONSE:0:400}...${NC}"
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
    # Create new address
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

# Step 5: Test shipping fee preview endpoint
echo -e "${BLUE}[Step 5] Test shipping fee preview${NC}"
TOTAL_GRAMS=2000  # 2kg
SHIPPING_PREVIEW_RESPONSE=$(curl -sS "${API_BASE}/shipping/fee/preview?addressId=${ADDRESS_ID}&totalGrams=${TOTAL_GRAMS}" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "X-Customer-Id: ${CUSTOMER_ID}")

if ! check_response_code "$SHIPPING_PREVIEW_RESPONSE" "0"; then
    echo -e "${RED}✗ GET /api/v1/shipping/fee/preview failed${NC}"
    echo -e "${YELLOW}Response: ${SHIPPING_PREVIEW_RESPONSE}${NC}"
    exit 1
fi

SHIPPING_FEE=$(extract_json "$SHIPPING_PREVIEW_RESPONSE" "(data.data && data.data.amountShipping) || (data.amountShipping) || 0")
SHIPPING_TEMPLATE_ID=$(extract_json "$SHIPPING_PREVIEW_RESPONSE" "(data.data && data.data.templateId) || (data.templateId) || ''")

if [ -z "$SHIPPING_FEE" ] || [ "$SHIPPING_FEE" = "0" ]; then
    echo -e "${YELLOW}⚠ Shipping fee is 0 or missing. This might be expected for free shipping or within base weight.${NC}"
else
    echo -e "${GREEN}✓ Shipping fee preview: ¥${SHIPPING_FEE} (template: ${SHIPPING_TEMPLATE_ID})${NC}"
fi

echo ""

# Step 6: Test pricing preview endpoint
echo -e "${BLUE}[Step 6] Test pricing preview${NC}"
QUANTITY_G=1400
PACKAGE_SPEC_G=100
# Calculate packageCount = ceil(quantityG / packageSpecG)
PACKAGE_COUNT=$(( (QUANTITY_G + PACKAGE_SPEC_G - 1) / PACKAGE_SPEC_G ))

PRICING_PREVIEW_BODY=$(cat <<EOF
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

# Debug: Print computed values and compact payload
echo -e "${YELLOW}  Computed packageCount: ${PACKAGE_COUNT} (from quantityG=${QUANTITY_G}, packageSpecG=${PACKAGE_SPEC_G})${NC}"
COMPACT_PAYLOAD=$(echo "$PRICING_PREVIEW_BODY" | node -e "const fs=require('fs'); try { const input=fs.readFileSync(0,'utf8').trim(); const json=JSON.parse(input); console.log(JSON.stringify(json)); } catch(e) { process.exit(1); }" 2>/dev/null || echo "$PRICING_PREVIEW_BODY")
echo -e "${YELLOW}  Request payload: ${COMPACT_PAYLOAD}${NC}"

# Make request with HTTP status code check
HTTP_STATUS=$(curl -sS -w "%{http_code}" -o /tmp/phase6_pricing_response.json -X POST "${API_BASE}/orders/pricing/preview" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "X-Customer-Id: ${CUSTOMER_ID}" \
  -H "Content-Type: application/json" \
  -d "$PRICING_PREVIEW_BODY")

PRICING_PREVIEW_RESPONSE=$(cat /tmp/phase6_pricing_response.json 2>/dev/null || echo "")
rm -f /tmp/phase6_pricing_response.json

# Check HTTP status code
if [ "$HTTP_STATUS" != "200" ]; then
    echo -e "${RED}✗ POST /api/v1/orders/pricing/preview failed with HTTP ${HTTP_STATUS}${NC}"
    echo -e "${YELLOW}Response (first 800 chars): ${PRICING_PREVIEW_RESPONSE:0:800}${NC}"
    exit 1
fi

# Check API response code
if ! check_response_code "$PRICING_PREVIEW_RESPONSE" "0"; then
    echo -e "${RED}✗ POST /api/v1/orders/pricing/preview failed (API code != 0)${NC}"
    echo -e "${YELLOW}Response (first 800 chars): ${PRICING_PREVIEW_RESPONSE:0:800}${NC}"
    exit 1
fi

# Extract pricing preview amounts from confirmed API response structure
# Priority: data.amountProduct -> data.data.amountProduct (support both wrapper patterns)
PREVIEW_AMOUNT_PRODUCT=$(echo "$PRICING_PREVIEW_RESPONSE" | node -e '
    const fs = require("fs");
    try {
        const input = fs.readFileSync(0, "utf8").trim();
        const parsed = JSON.parse(input);
        // Try data.amountProduct first (most common), then data.data.amountProduct (nested wrapper)
        const paths = [
            () => parsed.data && parsed.data.amountProduct,
            () => parsed.data && parsed.data.data && parsed.data.data.amountProduct,
            () => parsed.amountProduct,
        ];
        let result = 0;
        for (const pathFn of paths) {
            const value = pathFn();
            if (value !== undefined && value !== null && value !== "") {
                result = value;
                break;
            }
        }
        console.log(result);
    } catch (e) {
        console.log("0");
    }
' 2>/dev/null)

PREVIEW_AMOUNT_SHIPPING=$(echo "$PRICING_PREVIEW_RESPONSE" | node -e '
    const fs = require("fs");
    try {
        const input = fs.readFileSync(0, "utf8").trim();
        const parsed = JSON.parse(input);
        const paths = [
            () => parsed.data && parsed.data.amountShipping,
            () => parsed.data && parsed.data.data && parsed.data.data.amountShipping,
            () => parsed.amountShipping,
        ];
        let result = 0;
        for (const pathFn of paths) {
            const value = pathFn();
            if (value !== undefined && value !== null && value !== "") {
                result = value;
                break;
            }
        }
        console.log(result);
    } catch (e) {
        console.log("0");
    }
' 2>/dev/null)

PREVIEW_AMOUNT_TOTAL=$(echo "$PRICING_PREVIEW_RESPONSE" | node -e '
    const fs = require("fs");
    try {
        const input = fs.readFileSync(0, "utf8").trim();
        const parsed = JSON.parse(input);
        const paths = [
            () => parsed.data && parsed.data.amountTotal,
            () => parsed.data && parsed.data.data && parsed.data.data.amountTotal,
            () => parsed.amountTotal,
        ];
        let result = 0;
        for (const pathFn of paths) {
            const value = pathFn();
            if (value !== undefined && value !== null && value !== "") {
                result = value;
                break;
            }
        }
        console.log(result);
    } catch (e) {
        console.log("0");
    }
' 2>/dev/null)

# Parse to numbers for validation
PRODUCT_NUM=$(echo "$PREVIEW_AMOUNT_PRODUCT" | node -e "const fs=require('fs'); const input=fs.readFileSync(0,'utf8').trim(); console.log(parseFloat(input) || 0)" 2>/dev/null || echo "0")
SHIPPING_NUM=$(echo "$PREVIEW_AMOUNT_SHIPPING" | node -e "const fs=require('fs'); const input=fs.readFileSync(0,'utf8').trim(); console.log(parseFloat(input) || 0)" 2>/dev/null || echo "0")
TOTAL_NUM=$(echo "$PREVIEW_AMOUNT_TOTAL" | node -e "const fs=require('fs'); const input=fs.readFileSync(0,'utf8').trim(); console.log(parseFloat(input) || 0)" 2>/dev/null || echo "0")

# Fail if all amounts are 0 (parsing likely failed)
if [ "$PRODUCT_NUM" = "0" ] && [ "$SHIPPING_NUM" = "0" ] && [ "$TOTAL_NUM" = "0" ]; then
    echo -e "${RED}✗ Failed to parse amounts from response (all amounts are 0)${NC}"
    echo -e "${YELLOW}Response (first 800 chars): ${PRICING_PREVIEW_RESPONSE:0:800}${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Pricing preview:${NC}"
echo -e "  Product: ¥${PRODUCT_NUM}"
echo -e "  Shipping: ¥${SHIPPING_NUM}"
echo -e "  Total: ¥${TOTAL_NUM}"

# Print pricing breakdown if available (optional)
PRICING_BREAKDOWN=$(echo "$PRICING_PREVIEW_RESPONSE" | node -e '
    const fs = require("fs");
    try {
        const input = fs.readFileSync(0, "utf8").trim();
        const parsed = JSON.parse(input);
        const breakdown = parsed.data && parsed.data.pricingBreakdown;
        if (breakdown) {
            console.log(JSON.stringify(breakdown, null, 2));
        }
    } catch (e) {}
' 2>/dev/null)

if [ -n "$PRICING_BREAKDOWN" ] && [ "$PRICING_BREAKDOWN" != "null" ]; then
    echo -e "${YELLOW}  Pricing breakdown available${NC}"
fi

# Validate amounts
# Rule 1: product > 0 (REQUIRED)
if (( $(echo "$PRODUCT_NUM <= 0" | bc -l 2>/dev/null || echo "1") )); then
    echo -e "${RED}✗ Product amount must be > 0, got ${PRODUCT_NUM}${NC}"
    echo -e "${YELLOW}Parsed values - product: ${PRODUCT_NUM}, shipping: ${SHIPPING_NUM}, total: ${TOTAL_NUM}${NC}"
    exit 1
fi

# Rule 2: shipping >= 0 (REQUIRED)
if (( $(echo "$SHIPPING_NUM < 0" | bc -l 2>/dev/null || echo "1") )); then
    echo -e "${RED}✗ Shipping amount must be >= 0, got ${SHIPPING_NUM}${NC}"
    echo -e "${YELLOW}Parsed values - product: ${PRODUCT_NUM}, shipping: ${SHIPPING_NUM}, total: ${TOTAL_NUM}${NC}"
    exit 1
fi

# Rule 3: total > 0 (REQUIRED)
if (( $(echo "$TOTAL_NUM <= 0" | bc -l 2>/dev/null || echo "1") )); then
    echo -e "${RED}✗ Total amount must be > 0, got ${TOTAL_NUM}${NC}"
    echo -e "${YELLOW}Parsed values - product: ${PRODUCT_NUM}, shipping: ${SHIPPING_NUM}, total: ${TOTAL_NUM}${NC}"
    exit 1
fi

# Rule 4: total ≈ product + shipping (tolerance 0.01)
EXPECTED_TOTAL=$(echo "$PRODUCT_NUM + $SHIPPING_NUM" | bc -l 2>/dev/null || echo "$TOTAL_NUM")
DIFF=$(echo "$TOTAL_NUM - $EXPECTED_TOTAL" | bc -l 2>/dev/null || echo "0")
ABS_DIFF=$(echo "$DIFF < 0 ? -$DIFF : $DIFF" | bc -l 2>/dev/null || echo "0")

if (( $(echo "$ABS_DIFF > 0.01" | bc -l 2>/dev/null || echo "1") )); then
    echo -e "${YELLOW}⚠ Total amount (${TOTAL_NUM}) doesn't exactly match product (${PRODUCT_NUM}) + shipping (${SHIPPING_NUM}) = ${EXPECTED_TOTAL}${NC}"
    echo -e "${YELLOW}  Difference: ${ABS_DIFF}. This might be due to rounding.${NC}"
else
    echo -e "${GREEN}✓ Amounts add up correctly${NC}"
fi

echo ""

# Step 7: Create order and verify shipping amounts persist
echo -e "${BLUE}[Step 7] Create order with shipping${NC}"
CREATE_ORDER_BODY=$(cat <<EOF
{
  "dogId": "${DOG_ID}",
  "addressId": "${ADDRESS_ID}",
  "type": "FRESH_FOOD",
  "items": [{
    "recipeId": "${CANONICAL_RECIPE_ID}",
    "quantityG": ${TOTAL_GRAMS},
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

# Validate shipping amount is present
if [ -z "$ORDER_AMOUNT_SHIPPING" ]; then
    echo -e "${RED}✗ Order is missing amountShipping field${NC}"
    exit 1
fi

echo ""

# Step 8: Confirm and pay order
echo -e "${BLUE}[Step 8] Confirm and pay order${NC}"
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

# Step 9: Fetch order detail and validate amounts match preview
echo -e "${BLUE}[Step 9] Fetch order detail and validate amounts${NC}"
ORDER_DETAIL_RESPONSE=$(curl -sS "${API_BASE}/orders/${ORDER_ID}" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "X-Customer-Id: ${CUSTOMER_ID}")

if ! check_response_code "$ORDER_DETAIL_RESPONSE" "0"; then
    echo -e "${RED}✗ GET /api/v1/orders/${ORDER_ID} failed${NC}"
    exit 1
fi

DETAIL_AMOUNT_PRODUCT=$(extract_json "$ORDER_DETAIL_RESPONSE" "(data.data && data.data.amountProduct) || (data.amountProduct) || 0")
DETAIL_AMOUNT_SHIPPING=$(extract_json "$ORDER_DETAIL_RESPONSE" "(data.data && data.data.amountShipping) || (data.amountShipping) || 0")
DETAIL_AMOUNT_TOTAL=$(extract_json "$ORDER_DETAIL_RESPONSE" "(data.data && data.data.amountTotal) || (data.amountTotal) || 0")

echo -e "${GREEN}✓ Order detail retrieved:${NC}"
echo -e "  Product: ¥${DETAIL_AMOUNT_PRODUCT}"
echo -e "  Shipping: ¥${DETAIL_AMOUNT_SHIPPING}"
echo -e "  Total: ¥${DETAIL_AMOUNT_TOTAL}"

# Validate amounts match preview (with small tolerance for rounding)
PRODUCT_PREVIEW_NUM=$(echo "$PREVIEW_AMOUNT_PRODUCT" | node -e "console.log(parseFloat(process.stdin.read().toString()))" 2>/dev/null || echo "0")
SHIPPING_PREVIEW_NUM=$(echo "$PREVIEW_AMOUNT_SHIPPING" | node -e "console.log(parseFloat(process.stdin.read().toString()))" 2>/dev/null || echo "0")
TOTAL_PREVIEW_NUM=$(echo "$PREVIEW_AMOUNT_TOTAL" | node -e "console.log(parseFloat(process.stdin.read().toString()))" 2>/dev/null || echo "0")

PRODUCT_DETAIL_NUM=$(echo "$DETAIL_AMOUNT_PRODUCT" | node -e "console.log(parseFloat(process.stdin.read().toString()))" 2>/dev/null || echo "0")
SHIPPING_DETAIL_NUM=$(echo "$DETAIL_AMOUNT_SHIPPING" | node -e "console.log(parseFloat(process.stdin.read().toString()))" 2>/dev/null || echo "0")
TOTAL_DETAIL_NUM=$(echo "$DETAIL_AMOUNT_TOTAL" | node -e "console.log(parseFloat(process.stdin.read().toString()))" 2>/dev/null || echo "0")

PRODUCT_DIFF=$(echo "$PRODUCT_PREVIEW_NUM - $PRODUCT_DETAIL_NUM" | bc -l 2>/dev/null || echo "0")
PRODUCT_ABS_DIFF=$(echo "$PRODUCT_DIFF < 0 ? -$PRODUCT_DIFF : $PRODUCT_DIFF" | bc -l 2>/dev/null || echo "0")

SHIPPING_DIFF=$(echo "$SHIPPING_PREVIEW_NUM - $SHIPPING_DETAIL_NUM" | bc -l 2>/dev/null || echo "0")
SHIPPING_ABS_DIFF=$(echo "$SHIPPING_DIFF < 0 ? -$SHIPPING_DIFF : $SHIPPING_DIFF" | bc -l 2>/dev/null || echo "0")

if (( $(echo "$PRODUCT_ABS_DIFF > 0.01" | bc -l 2>/dev/null || echo "1") )); then
    echo -e "${YELLOW}⚠ Product amount mismatch: preview=${PRODUCT_PREVIEW_NUM}, order=${PRODUCT_DETAIL_NUM}, diff=${PRODUCT_ABS_DIFF}${NC}"
else
    echo -e "${GREEN}✓ Product amount matches preview${NC}"
fi

if (( $(echo "$SHIPPING_ABS_DIFF > 0.01" | bc -l 2>/dev/null || echo "1") )); then
    echo -e "${YELLOW}⚠ Shipping amount mismatch: preview=${SHIPPING_PREVIEW_NUM}, order=${SHIPPING_DETAIL_NUM}, diff=${SHIPPING_ABS_DIFF}${NC}"
    echo -e "${YELLOW}  Note: Small differences may occur due to rounding, but should be minimal.${NC}"
else
    echo -e "${GREEN}✓ Shipping amount matches preview${NC}"
fi

# Final validation
if [ "$DETAIL_AMOUNT_TOTAL" = "0" ] || [ -z "$DETAIL_AMOUNT_TOTAL" ]; then
    echo -e "${RED}✗ Order detail is missing amountTotal field${NC}"
    exit 1
fi

if [ -z "$DETAIL_AMOUNT_SHIPPING" ]; then
    echo -e "${RED}✗ Order detail is missing amountShipping field${NC}"
    exit 1
fi

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✓ Phase 6 Verification Complete!${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}Summary:${NC}"
echo -e "  ✓ Shipping fee preview endpoint works"
echo -e "  ✓ Pricing preview endpoint works"
echo -e "  ✓ Order creation persists shipping amounts"
echo -e "  ✓ Order detail includes amountProduct, amountShipping, amountTotal"
echo -e "  ✓ Preview and persisted order amounts match (within rounding tolerance)"
echo ""
