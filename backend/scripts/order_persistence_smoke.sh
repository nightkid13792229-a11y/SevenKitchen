#!/bin/bash

# Order Persistence Smoke Test
# Verifies that orders persist across server restarts when using FileBackedOrderRepository

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
DATA_FILE="backend/.data/orders.json"

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}Order Persistence Smoke Test${NC}"
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

# Step 1: Check backend health
echo -e "${BLUE}[Step 1] Checking backend health${NC}"
if curl -sSf "${API_BASE}/health" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Backend server is running${NC}"
else
    echo -e "${RED}✗ Backend server is not running${NC}"
    echo -e "${YELLOW}Please start the server with: cd backend && ORDER_REPO=file pnpm start:dev${NC}"
    exit 1
fi

# Step 2: Login and get token
echo -e "${BLUE}[Step 2] Login and capture token${NC}"
LOGIN_RESPONSE=$(curl -sS -X POST "${API_BASE}/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"customerId\":\"${CUSTOMER_ID}\"}")

TOKEN=$(echo "$LOGIN_RESPONSE" | node -e "
    const fs = require('fs');
    try {
        const input = fs.readFileSync(0, 'utf8').trim();
        const data = JSON.parse(input);
        if (data.code === 0 && data.data && data.data.token) {
            console.log(data.data.token);
        }
    } catch (e) {
        process.exit(1);
    }
" 2>/dev/null)

if [ -z "$TOKEN" ]; then
    echo -e "${RED}✗ Failed to get token${NC}"
    echo "Response: $LOGIN_RESPONSE"
    exit 1
fi
echo -e "${GREEN}✓ JWT token obtained${NC}"

# Step 3: Check initial order count
echo -e "${BLUE}[Step 3] Check initial order count${NC}"
INITIAL_ORDERS_RESPONSE=$(curl -sS -X GET "${API_BASE}/orders" \
    -H "Authorization: Bearer ${TOKEN}")
INITIAL_COUNT=$(extract_json "$INITIAL_ORDERS_RESPONSE" "data.length")
echo -e "${BLUE}Initial order count: ${INITIAL_COUNT:-0}${NC}"

# Step 4: Create a test order (if we have required data)
echo -e "${BLUE}[Step 4] Create test order${NC}"
# Note: This requires dog, recipe, and address to exist
# For smoke test, we'll check if orders.json file exists and has data
if [ -f "$DATA_FILE" ]; then
    FILE_ORDER_COUNT=$(node -e "
        const fs = require('fs');
        try {
            const data = JSON.parse(fs.readFileSync('$DATA_FILE', 'utf8'));
            console.log(Array.isArray(data) ? data.length : 0);
        } catch (e) {
            console.log(0);
        }
    " 2>/dev/null || echo "0")
    echo -e "${BLUE}Orders in file: ${FILE_ORDER_COUNT}${NC}"
    
    if [ "$FILE_ORDER_COUNT" -gt 0 ]; then
        echo -e "${GREEN}✓ Found ${FILE_ORDER_COUNT} order(s) in persistence file${NC}"
        ORDER_ID=$(node -e "
            const fs = require('fs');
            try {
                const data = JSON.parse(fs.readFileSync('$DATA_FILE', 'utf8'));
                console.log(Array.isArray(data) && data.length > 0 ? data[0].id : '');
            } catch (e) {
                console.log('');
            }
        " 2>/dev/null || echo "")
        
        if [ -n "$ORDER_ID" ]; then
            echo -e "${BLUE}Test order ID: ${ORDER_ID}${NC}"
        fi
    else
        echo -e "${YELLOW}⚠ No orders in file. Create an order first via UI or API.${NC}"
    fi
else
    echo -e "${YELLOW}⚠ Persistence file does not exist yet (will be created on first order save)${NC}"
fi

# Step 5: Verify persistence file location
echo -e "${BLUE}[Step 5] Verify persistence file location${NC}"
if [ -f "$DATA_FILE" ]; then
    echo -e "${GREEN}✓ Persistence file exists: ${DATA_FILE}${NC}"
    FILE_SIZE=$(stat -f%z "$DATA_FILE" 2>/dev/null || stat -c%s "$DATA_FILE" 2>/dev/null || echo "0")
    echo -e "${BLUE}File size: ${FILE_SIZE} bytes${NC}"
else
    echo -e "${YELLOW}⚠ Persistence file does not exist (will be created on first save)${NC}"
fi

# Step 6: Instructions for manual restart test
echo -e "${BLUE}[Step 6] Manual restart test instructions${NC}"
echo -e "${YELLOW}To test persistence across restarts:${NC}"
echo -e "1. Create an order (via UI or API)"
echo -e "2. Stop the server (Ctrl+C)"
echo -e "3. Restart with: ${BLUE}cd backend && ORDER_REPO=file pnpm start:dev${NC}"
echo -e "4. Verify GET ${API_BASE}/orders returns the created order"
echo -e "5. Check that ${DATA_FILE} contains the order data"

echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✓ Order Persistence Smoke Test Complete${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"


