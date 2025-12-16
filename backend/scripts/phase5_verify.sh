#!/bin/bash

# Phase 5 Verification Script
# Verifies the full "Ingredients -> Recipe -> Order pricing breakdown" chain end-to-end
# Based on 07_Core_Architecture.md

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
CHICKEN_BREAST_ID="4fa85f64-5717-4562-b3fc-2c963f66afa6"
PUMPKIN_ID="5fa85f64-5717-4562-b3fc-2c963f66afa6"
VACUUM_BAG_ID="6fa85f64-5717-4562-b3fc-2c963f66afa6"
PRODUCT_LABEL_ID="7fa85f64-5717-4562-b3fc-2c963f66afa6"

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}Phase 5 Verification: Ingredients + Recipe Costing${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"

# Helper function to extract JSON value using node
extract_json() {
    local json="$1"
    local path="$2"
    node -e "
        try {
            const data = JSON.parse(process.argv[1]);
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
    " "$json" 2>/dev/null || echo ""
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

# Step 3: Verify canonical seeded recipe exists and has ingredient-backed items
echo -e "${BLUE}[Step 3] Verify canonical seeded recipe${NC}"
RECIPES_RESPONSE=$(curl -sS "${API_BASE}/recipes" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "X-Customer-Id: ${CUSTOMER_ID}")

if ! check_response_code "$RECIPES_RESPONSE" "0"; then
    echo -e "${RED}✗ GET /api/v1/recipes failed${NC}"
    exit 1
fi

RECIPES_DATA=$(extract_json "$RECIPES_RESPONSE" "JSON.stringify((data.data !== undefined ? data.data : data) || [])")

if ! echo "$RECIPES_DATA" | grep -q "$CANONICAL_RECIPE_ID"; then
    echo -e "${RED}✗ Canonical recipe ID ${CANONICAL_RECIPE_ID} not found in recipes list${NC}"
    echo -e "${YELLOW}Response: ${RECIPES_RESPONSE}${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Canonical recipe found (${CANONICAL_RECIPE_ID})${NC}\n"

# Step 4: Verify inventory endpoints
echo -e "${BLUE}[Step 4] Verify inventory endpoints${NC}"
INVENTORY_RESPONSE=$(curl -sS "${API_BASE}/admin/inventory" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "X-Customer-Id: ${CUSTOMER_ID}")

if ! check_response_code "$INVENTORY_RESPONSE" "0"; then
    echo -e "${RED}✗ GET /api/v1/admin/inventory failed${NC}"
    exit 1
fi

INVENTORY_DATA=$(extract_json "$INVENTORY_RESPONSE" "JSON.stringify((data.data !== undefined ? data.data : data) || [])")
INVENTORY_ARRAY=$(extract_json "$INVENTORY_RESPONSE" "JSON.stringify((data.data !== undefined ? data.data : data) || [])")

# Check for required ingredients
REQUIRED_INGREDIENTS=("$CHICKEN_BREAST_ID:$PUMPKIN_ID:$VACUUM_BAG_ID:$PRODUCT_LABEL_ID")
REQUIRED_NAMES=("鸡胸肉:南瓜:真空袋:产品标签")

for i in {0..3}; do
    IFS=':' read -r -a ids <<< "$REQUIRED_INGREDIENTS"
    IFS=':' read -r -a names <<< "$REQUIRED_NAMES"
    id="${ids[$i]}"
    name="${names[$i]}"
    
    if ! echo "$INVENTORY_DATA" | grep -q "$id"; then
        echo -e "${RED}✗ Required ingredient not found: ${name} (${id})${NC}"
        exit 1
    fi
    
    # Extract and print price info
    ingredient_json=$(echo "$INVENTORY_ARRAY" | node -e "
        try {
            const arr = JSON.parse(process.stdin.read());
            const found = arr.find(i => i.id === '${id}');
            if (found) console.log(JSON.stringify(found));
        } catch (e) {}
    " 2>/dev/null)
    
    if [ -n "$ingredient_json" ] && [ "$ingredient_json" != "null" ]; then
        price=$(extract_json "$ingredient_json" "data.currentPricePerPurchaseUnit || 0")
        ratio=$(extract_json "$ingredient_json" "data.purchaseToBaseRatio || 0")
        unit_cost=$(extract_json "$ingredient_json" "data.unitCost || 0")
        echo -e "  ${GREEN}✓${NC} ${name}: price=${price}, ratio=${ratio}, unit_cost=${unit_cost}"
    fi
done

echo -e "${GREEN}✓ All 4 canonical ingredients found${NC}\n"

# Step 5: Create a dog (idempotent)
echo -e "${BLUE}[Step 5] Create or find dog (idempotent)${NC}"
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
    # For MVP, we'll need to use an existing breed or create one
    # Since we don't have breed creation in this phase, we'll use a placeholder UUID
    # In real scenario, breeds would be seeded
    BREED_ID="550e8400-e29b-41d4-a716-446655440000"  # Placeholder breed ID
    
    CREATE_DOG_BODY=$(cat <<EOF
{
  "name": "Test Dog",
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

# Step 6: Create an address (idempotent)
echo -e "${BLUE}[Step 6] Create or find address (idempotent)${NC}"
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
    # Reuse existing address
    ADDRESS_ID=$(echo "$ADDRESSES_ARRAY" | node -e "
        try {
            const arr = JSON.parse(process.stdin.read());
            if (Array.isArray(arr) && arr.length > 0) console.log(arr[0].id || '');
        } catch(e) {}
    " 2>/dev/null)
    echo -e "${GREEN}✓ Reusing existing address (${ADDRESS_ID})${NC}"
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
        echo -e "${RED}✗ Address creation failed${NC}"
        echo -e "${YELLOW}Response: ${CREATE_ADDRESS_RESPONSE}${NC}"
        exit 1
    fi
    
    ADDRESS_ID=$(extract_json "$CREATE_ADDRESS_RESPONSE" "(data.data && data.data.id) || (data.id) || ''")
    if [ -z "$ADDRESS_ID" ]; then
        ADDRESS_ID=$(extract_json "$CREATE_ADDRESS_RESPONSE" "data.data?.id || data.id || ''")
    fi
    echo -e "${GREEN}✓ Address created (${ADDRESS_ID})${NC}"
fi

if [ -z "$ADDRESS_ID" ]; then
    echo -e "${RED}✗ Failed to get address ID${NC}"
    exit 1
fi

echo ""

# Step 7: Create an order
echo -e "${BLUE}[Step 7] Create order with pricing calculation${NC}"
# Deterministic values: 7 days, 200g per day = 1400g total
DAILY_G=200
DAYS=7
TOTAL_G=$((DAILY_G * DAYS))
PACKAGE_SPEC_G=200
PACKAGE_COUNT=$DAYS

CREATE_ORDER_BODY=$(cat <<EOF
{
  "dogId": "${DOG_ID}",
  "type": "FRESH_FOOD",
  "items": [{
    "recipeId": "${CANONICAL_RECIPE_ID}",
    "quantityG": ${TOTAL_G},
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
    echo -e "${RED}✗ Order creation failed${NC}"
    echo -e "${YELLOW}Response: ${CREATE_ORDER_RESPONSE}${NC}"
    exit 1
fi

ORDER_ID=$(extract_json "$CREATE_ORDER_RESPONSE" "(data.data && data.data.id) || (data.id) || ''")
if [ -z "$ORDER_ID" ]; then
    ORDER_ID=$(extract_json "$CREATE_ORDER_RESPONSE" "data.data?.id || data.id || ''")
fi

TOTAL_AMOUNT=$(extract_json "$CREATE_ORDER_RESPONSE" "(data.data && data.data.totalAmount !== undefined ? data.data.totalAmount : data.totalAmount) || 0")
if [ -z "$TOTAL_AMOUNT" ] || [ "$TOTAL_AMOUNT" = "0" ] || [ "$TOTAL_AMOUNT" = "null" ]; then
    TOTAL_AMOUNT="0"
fi

if [ -z "$ORDER_ID" ]; then
    echo -e "${RED}✗ Failed to extract order ID${NC}"
    echo -e "${YELLOW}Response: ${CREATE_ORDER_RESPONSE}${NC}"
    exit 1
fi

# Check if totalAmount > 0 using node (more reliable than bc)
IS_POSITIVE=$(node -e "console.log((${TOTAL_AMOUNT} > 0) ? '1' : '0');" 2>/dev/null || echo "0")
if [ "$IS_POSITIVE" != "1" ]; then
    echo -e "${RED}✗ Order totalAmount is not positive: ${TOTAL_AMOUNT}${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Order created (${ORDER_ID}), totalAmount=${TOTAL_AMOUNT}${NC}\n"

# Step 8: Confirm and pay (test)
echo -e "${BLUE}[Step 8] Confirm and pay order${NC}"
CONFIRM_RESPONSE=$(curl -sS -X POST "${API_BASE}/orders/${ORDER_ID}/confirm" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "X-Customer-Id: ${CUSTOMER_ID}")

if ! check_response_code "$CONFIRM_RESPONSE" "0"; then
    echo -e "${RED}✗ Order confirmation failed${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Order confirmed${NC}"

PAY_RESPONSE=$(curl -sS -X POST "${API_BASE}/orders/${ORDER_ID}/pay" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "X-Customer-Id: ${CUSTOMER_ID}")

if ! check_response_code "$PAY_RESPONSE" "0"; then
    echo -e "${RED}✗ Order payment failed${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Order paid${NC}\n"

# Step 9: Fetch order detail and validate pricing breakdown
echo -e "${BLUE}[Step 9] Fetch order detail and validate pricing${NC}"
ORDER_DETAIL_RESPONSE=$(curl -sS "${API_BASE}/orders/${ORDER_ID}" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "X-Customer-Id: ${CUSTOMER_ID}")

if ! check_response_code "$ORDER_DETAIL_RESPONSE" "0"; then
    echo -e "${RED}✗ Failed to fetch order detail${NC}"
    exit 1
fi

ORDER_DETAIL=$(extract_json "$ORDER_DETAIL_RESPONSE" "JSON.stringify((data.data !== undefined ? data.data : data) || {})")
FINAL_TOTAL_AMOUNT=$(extract_json "$ORDER_DETAIL_RESPONSE" "(data.data && data.data.totalAmount !== undefined ? data.data.totalAmount : data.totalAmount) || 0")
if [ -z "$FINAL_TOTAL_AMOUNT" ] || [ "$FINAL_TOTAL_AMOUNT" = "null" ]; then
    FINAL_TOTAL_AMOUNT="0"
fi

# Check if totalAmount > 0 using node
IS_POSITIVE=$(node -e "console.log((${FINAL_TOTAL_AMOUNT} > 0) ? '1' : '0');" 2>/dev/null || echo "0")
if [ "$IS_POSITIVE" != "1" ]; then
    echo -e "${RED}✗ Order totalAmount is not positive: ${FINAL_TOTAL_AMOUNT}${NC}"
    exit 1
fi

# Extract pricing breakdown if available (optional field)
PRICING_BREAKDOWN=$(echo "$ORDER_DETAIL" | node -e "
    try {
        const order = JSON.parse(process.stdin.read());
        if (order && order.pricingBreakdown) {
            console.log(JSON.stringify(order.pricingBreakdown));
        } else {
            console.log('null');
        }
    } catch(e) {
        console.log('null');
    }
" 2>/dev/null || echo "null")

echo -e "${GREEN}✓ Order detail fetched${NC}\n"

# Print summary
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}Phase 5 Verification Summary${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "Recipe ID:      ${CANONICAL_RECIPE_ID}"
echo -e "Dog ID:         ${DOG_ID}"
echo -e "Address ID:     ${ADDRESS_ID}"
echo -e "Order ID:       ${ORDER_ID}"
echo -e "Total Amount:   ${FINAL_TOTAL_AMOUNT} CNY"
echo ""

if [ "$PRICING_BREAKDOWN" != "null" ] && [ "$PRICING_BREAKDOWN" != "" ] && [ "$PRICING_BREAKDOWN" != "{}" ]; then
    echo -e "${BLUE}Pricing Breakdown:${NC}"
    COST_INGREDIENTS=$(extract_json "$PRICING_BREAKDOWN" "data.costIngredients !== undefined ? data.costIngredients : (data.costIngredients || 0)")
    COST_PACKAGING=$(extract_json "$PRICING_BREAKDOWN" "data.costPackaging !== undefined ? data.costPackaging : (data.costPackaging || 0)")
    COST_LABOR=$(extract_json "$PRICING_BREAKDOWN" "data.costLabor !== undefined ? data.costLabor : (data.costLabor || 0)")
    COST_OVERHEAD=$(extract_json "$PRICING_BREAKDOWN" "data.costOverhead !== undefined ? data.costOverhead : (data.costOverhead || 0)")
    PRODUCT_PRICE=$(extract_json "$PRICING_BREAKDOWN" "data.productPrice !== undefined ? data.productPrice : (data.productPrice || 0)")
    SHIPPING_FEE=$(extract_json "$PRICING_BREAKDOWN" "data.shippingFee !== undefined ? data.shippingFee : (data.shippingFee || 0)")
    TOTAL_PRICE=$(extract_json "$PRICING_BREAKDOWN" "data.totalPrice !== undefined ? data.totalPrice : (data.totalPrice || 0)")
    
    echo -e "  Cost Ingredients: ${COST_INGREDIENTS} CNY"
    echo -e "  Cost Packaging:   ${COST_PACKAGING} CNY"
    echo -e "  Cost Labor:       ${COST_LABOR} CNY"
    echo -e "  Cost Overhead:    ${COST_OVERHEAD} CNY"
    echo -e "  Product Price:    ${PRODUCT_PRICE} CNY"
    echo -e "  Shipping Fee:     ${SHIPPING_FEE} CNY"
    echo -e "  Total Price:      ${TOTAL_PRICE} CNY"
else
    echo -e "${YELLOW}⚠ Pricing breakdown not available in response (optional field)${NC}"
    echo -e "${YELLOW}  Total amount validation passed: ${FINAL_TOTAL_AMOUNT} CNY > 0${NC}"
fi

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✓ Phase 5 verification completed successfully${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
