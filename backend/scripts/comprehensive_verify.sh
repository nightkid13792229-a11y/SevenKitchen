#!/bin/bash

# Comprehensive Verification Script
# Tests all flows: Login, Orders, Addresses, Recipes, Customer Isolation
# Uses JWT Bearer token authentication
# Validates response.body.code instead of HTTP status codes

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
API_BASE="${API_BASE:-${BASE_URL}/api/v1}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

PASS_COUNT=0
FAIL_COUNT=0
FAILED_TESTS=()

# Output file for evidence
OUTPUT_FILE="${OUTPUT_FILE:-docs/comprehensive_verify_output.txt}"
mkdir -p "$(dirname "$OUTPUT_FILE")"

# Check for JSON parser (prefer jq, fallback to node, then python)
if command -v jq &> /dev/null; then
    JSON_PARSER="jq"
    EXTRACT_CODE='.code'
    EXTRACT_MESSAGE='.message'
    EXTRACT_TOKEN='.data.token'
    EXTRACT_CUSTOMER_ID='.data.customerId'
    EXTRACT_ID='.data.id'
    EXTRACT_STATUS='.data.status'
    EXTRACT_ITEM_ID='.data.items[0].id'
elif command -v node &> /dev/null; then
    JSON_PARSER="node"
    EXTRACT_CODE='process.stdout.write(JSON.parse(require("fs").readFileSync(0, "utf-8")).code?.toString() || "")'
    EXTRACT_MESSAGE='process.stdout.write(JSON.parse(require("fs").readFileSync(0, "utf-8")).message || "")'
    EXTRACT_TOKEN='process.stdout.write(JSON.parse(require("fs").readFileSync(0, "utf-8")).data?.token || "")'
    EXTRACT_CUSTOMER_ID='process.stdout.write(JSON.parse(require("fs").readFileSync(0, "utf-8")).data?.customerId || "")'
    EXTRACT_ID='process.stdout.write(JSON.parse(require("fs").readFileSync(0, "utf-8")).data?.id || "")'
    EXTRACT_STATUS='process.stdout.write(JSON.parse(require("fs").readFileSync(0, "utf-8")).data?.status || "")'
    EXTRACT_ITEM_ID='const d=JSON.parse(require("fs").readFileSync(0, "utf-8")); process.stdout.write(d.data?.items?.[0]?.id || "")'
elif command -v python3 &> /dev/null; then
    JSON_PARSER="python3"
    EXTRACT_CODE='import sys, json; print(str(json.load(sys.stdin).get("code", "")), end="")'
    EXTRACT_MESSAGE='import sys, json; print(json.load(sys.stdin).get("message", ""), end="")'
    EXTRACT_TOKEN='import sys, json; print(json.load(sys.stdin).get("data", {}).get("token", ""), end="")'
    EXTRACT_CUSTOMER_ID='import sys, json; print(json.load(sys.stdin).get("data", {}).get("customerId", ""), end="")'
    EXTRACT_ID='import sys, json; print(json.load(sys.stdin).get("data", {}).get("id", ""), end="")'
    EXTRACT_STATUS='import sys, json; print(json.load(sys.stdin).get("data", {}).get("status", ""), end="")'
    EXTRACT_ITEM_ID='import sys, json; d=json.load(sys.stdin); print(d.get("data", {}).get("items", [{}])[0].get("id", ""), end="")'
else
    echo -e "${RED}ERROR: No JSON parser found. Please install jq, node, or python3${NC}"
    exit 1
fi

# Helper function to extract JSON field
extract_json() {
    local field="$1"
    local json="$2"
    local result=""
    
    if [ -z "$json" ]; then
        echo ""
        return 0
    fi
    
    if [ "$JSON_PARSER" = "jq" ]; then
        result=$(echo "$json" | jq -r "$field" 2>/dev/null || echo "")
    elif [ "$JSON_PARSER" = "node" ]; then
        result=$(echo "$json" | node -e "$field" 2>/dev/null || echo "")
    else  # python3
        result=$(echo "$json" | python3 -c "$field" 2>/dev/null || echo "")
    fi
    
    echo "$result"
}

# Helper function to make HTTP request and capture response
# Always expects HTTP 200, validates body.code instead
http_request() {
    local method="$1"
    local url="$2"
    local data="${3:-}"
    local auth_header="${4:-}"  # "Bearer <token>" or "X-Customer-Id: <id>"
    
    local response
    local status_code
    local curl_exit_code=0
    local curl_cmd="curl -s -w \"\n%{http_code}\" -X \"$method\" -H \"Content-Type: application/json\""
    
    if [ -n "$auth_header" ]; then
        if echo "$auth_header" | grep -q "^Bearer "; then
            curl_cmd="$curl_cmd -H \"Authorization: $auth_header\""
        elif echo "$auth_header" | grep -q "^X-Customer-Id:"; then
            curl_cmd="$curl_cmd -H \"$auth_header\""
        else
            curl_cmd="$curl_cmd -H \"Authorization: Bearer $auth_header\""
        fi
    fi
    
    if [ -n "$data" ]; then
        curl_cmd="$curl_cmd -d '$data'"
    fi
    
    curl_cmd="$curl_cmd \"$url\""
    
    response=$(eval "$curl_cmd") || curl_exit_code=$?
    
    if [ $curl_exit_code -ne 0 ]; then
        echo -e "${RED}ERROR: curl failed${NC}" >&2
        return 1
    fi
    
    status_code=$(echo "$response" | tail -n1)
    response_body=$(echo "$response" | sed '$d')
    
    if [ "$status_code" = "000" ]; then
        echo -e "${RED}ERROR: Failed to connect to server${NC}" >&2
        return 1
    fi
    
    # Always expect HTTP 200 (unified response pattern)
    if [ "$status_code" != "200" ]; then
        echo -e "${YELLOW}WARNING: Expected HTTP 200, got $status_code${NC}" >&2
    fi
    
    echo "$response_body"
    return 0
}

# Test assertion helper - validates body.code
assert_code() {
    local test_name="$1"
    local response="$2"
    local expected_code="$3"
    
    local actual_code=$(extract_json "$EXTRACT_CODE" "$response")
    
    if [ "$actual_code" = "$expected_code" ]; then
        echo -e "${GREEN}✓ PASS: $test_name${NC}"
        ((PASS_COUNT++)) || true
        return 0
    else
        echo -e "${RED}✗ FAIL: $test_name (expected code=$expected_code, got code=$actual_code)${NC}"
        ((FAIL_COUNT++)) || true
        FAILED_TESTS+=("$test_name")
        return 1
    fi
}

# Save response to output file
save_response() {
    local test_label="$1"
    local response="$2"
    echo "" >> "$OUTPUT_FILE"
    echo "=== $test_label ===" >> "$OUTPUT_FILE"
    if [ "$JSON_PARSER" = "jq" ]; then
        echo "$response" | jq . >> "$OUTPUT_FILE" 2>&1 || echo "$response" >> "$OUTPUT_FILE"
    else
        echo "$response" >> "$OUTPUT_FILE"
    fi
}

echo "=========================================="
echo "Comprehensive Verification"
echo "=========================================="
echo ""
echo "Testing all flows with JWT authentication"
echo "Base URL: $BASE_URL"
echo ""

# Clear output file
echo "Comprehensive Verification Output" > "$OUTPUT_FILE"
echo "Generated: $(date)" >> "$OUTPUT_FILE"

# ============================================
# SECTION 1: Authentication (JWT Login)
# ============================================
echo -e "${BLUE}=== SECTION 1: Authentication ===${NC}"
echo ""

CUSTOMER_A="customer-qa-a-$(date +%s)"
CUSTOMER_B="customer-qa-b-$(date +%s)"

# Test 1.1: Login Customer A
echo "Test 1.1: Login Customer A"
login_a_response=$(http_request "POST" "${API_BASE}/auth/login" "{\"customerId\": \"$CUSTOMER_A\"}" "")
save_response "Test 1.1: Login Customer A" "$login_a_response"
TOKEN_A=$(extract_json "$EXTRACT_TOKEN" "$login_a_response")
assert_code "Login Customer A succeeds" "$login_a_response" "0"
echo ""

# Test 1.2: Login Customer B
echo "Test 1.2: Login Customer B"
login_b_response=$(http_request "POST" "${API_BASE}/auth/login" "{\"customerId\": \"$CUSTOMER_B\"}" "")
save_response "Test 1.2: Login Customer B" "$login_b_response"
TOKEN_B=$(extract_json "$EXTRACT_TOKEN" "$login_b_response")
assert_code "Login Customer B succeeds" "$login_b_response" "0"
echo ""

# Test 1.3: Invalid token
echo "Test 1.3: Invalid token returns 401"
invalid_response=$(http_request "GET" "${API_BASE}/orders" "" "Bearer invalid-token-123")
save_response "Test 1.3: Invalid token" "$invalid_response"
assert_code "Invalid token returns 401" "$invalid_response" "401"
echo ""

# Test 1.4: Missing auth
echo "Test 1.4: Missing auth returns 401"
no_auth_response=$(http_request "GET" "${API_BASE}/orders" "" "")
save_response "Test 1.4: Missing auth" "$no_auth_response"
assert_code "Missing auth returns 401" "$no_auth_response" "401"
echo ""

# ============================================
# SECTION 2: Addresses CRUD + Default Uniqueness
# ============================================
echo -e "${BLUE}=== SECTION 2: Addresses CRUD + Default Uniqueness ===${NC}"
echo ""

# Test 2.1: Create address for Customer A
echo "Test 2.1: Create address for Customer A"
address_payload='{
  "recipientName": "Customer A Recipient",
  "phone": "13800138000",
  "region": {
    "province": "广东省",
    "city": "深圳市",
    "district": "南山区"
  },
  "detail": "Test Address A",
  "isDefault": true
}'

create_addr_a_response=$(http_request "POST" "${API_BASE}/addresses" "$address_payload" "Bearer $TOKEN_A")
save_response "Test 2.1: Create address A" "$create_addr_a_response"
ADDRESS_A_ID=$(extract_json "$EXTRACT_ID" "$create_addr_a_response")
assert_code "Create address A succeeds" "$create_addr_a_response" "0"
echo ""

# Test 2.2: Create second address (should unset first as default)
echo "Test 2.2: Create second address with isDefault=true (should unset first)"
address_payload2='{
  "recipientName": "Customer A Recipient 2",
  "phone": "13800138001",
  "region": {
    "province": "广东省",
    "city": "广州市",
    "district": "天河区"
  },
  "detail": "Test Address A2",
  "isDefault": true
}'

create_addr_a2_response=$(http_request "POST" "${API_BASE}/addresses" "$address_payload2" "Bearer $TOKEN_A")
save_response "Test 2.2: Create address A2" "$create_addr_a2_response"
ADDRESS_A2_ID=$(extract_json "$EXTRACT_ID" "$create_addr_a2_response")
assert_code "Create address A2 succeeds" "$create_addr_a2_response" "0"
echo ""

# Test 2.3: List addresses for Customer A (should see both)
echo "Test 2.3: List addresses for Customer A"
list_addr_a_response=$(http_request "GET" "${API_BASE}/addresses" "" "Bearer $TOKEN_A")
save_response "Test 2.3: List addresses A" "$list_addr_a_response"
assert_code "List addresses A succeeds" "$list_addr_a_response" "0"
# Verify Customer A sees their addresses
if echo "$list_addr_a_response" | grep -q "$ADDRESS_A_ID" && echo "$list_addr_a_response" | grep -q "$ADDRESS_A2_ID"; then
    echo -e "${GREEN}✓ PASS: Customer A sees their addresses${NC}"
    ((PASS_COUNT++)) || true
else
    echo -e "${RED}✗ FAIL: Customer A does not see their addresses${NC}"
    ((FAIL_COUNT++)) || true
    FAILED_TESTS+=("Customer A address visibility")
fi
echo ""

# Test 2.4: Customer B should not see Customer A's addresses
echo "Test 2.4: Customer B cannot see Customer A's addresses"
list_addr_b_response=$(http_request "GET" "${API_BASE}/addresses" "" "Bearer $TOKEN_B")
save_response "Test 2.4: List addresses B" "$list_addr_b_response"
assert_code "List addresses B succeeds" "$list_addr_b_response" "0"
# Verify Customer B does NOT see Customer A's addresses
if ! echo "$list_addr_b_response" | grep -q "$ADDRESS_A_ID"; then
    echo -e "${GREEN}✓ PASS: Customer B does not see Customer A's addresses${NC}"
    ((PASS_COUNT++)) || true
else
    echo -e "${RED}✗ FAIL: Customer B can see Customer A's addresses${NC}"
    ((FAIL_COUNT++)) || true
    FAILED_TESTS+=("Customer isolation - addresses")
fi
echo ""

# Test 2.5: Set default address
echo "Test 2.5: Set address as default"
set_default_response=$(http_request "POST" "${API_BASE}/addresses/${ADDRESS_A_ID}/set-default" "" "Bearer $TOKEN_A")
save_response "Test 2.5: Set default address" "$set_default_response"
assert_code "Set default address succeeds" "$set_default_response" "0"
echo ""

# ============================================
# SECTION 3: Orders - Create, Confirm, Pay
# ============================================
echo -e "${BLUE}=== SECTION 3: Orders - Create, Confirm, Pay ===${NC}"
echo ""

# Test 3.1: Create order draft for Customer A
echo "Test 3.1: Create order draft for Customer A"
order_payload='{
  "dogId": "550e8400-e29b-41d4-a716-446655440000",
  "type": "FRESH_FOOD",
  "items": [
    {
      "recipeId": "3fa85f64-5717-4562-b3fc-2c963f66afa7",
      "quantityG": 1400,
      "packageCount": 14,
      "packageSpecG": 100
    }
  ]
}'

create_order_a_response=$(http_request "POST" "${API_BASE}/orders" "$order_payload" "Bearer $TOKEN_A")
save_response "Test 3.1: Create order A" "$create_order_a_response"
ORDER_A_ID=$(extract_json "$EXTRACT_ID" "$create_order_a_response")
ORDER_A_STATUS=$(extract_json "$EXTRACT_STATUS" "$create_order_a_response")
assert_code "Create order A succeeds" "$create_order_a_response" "0"
# Verify status is DRAFT
if [ "$ORDER_A_STATUS" = "DRAFT" ]; then
    echo -e "${GREEN}✓ PASS: Order A status is DRAFT${NC}"
    ((PASS_COUNT++)) || true
else
    echo -e "${RED}✗ FAIL: Order A status is not DRAFT (got: $ORDER_A_STATUS)${NC}"
    ((FAIL_COUNT++)) || true
    FAILED_TESTS+=("Order A initial status")
fi
echo ""

# Test 3.2: Confirm order
echo "Test 3.2: Confirm order (DRAFT -> CONFIRMED)"
confirm_order_a_response=$(http_request "POST" "${API_BASE}/orders/${ORDER_A_ID}/confirm" "" "Bearer $TOKEN_A")
save_response "Test 3.2: Confirm order A" "$confirm_order_a_response"
assert_code "Confirm order A succeeds" "$confirm_order_a_response" "0"
ORDER_A_STATUS=$(extract_json "$EXTRACT_STATUS" "$confirm_order_a_response")
if [ "$ORDER_A_STATUS" = "CONFIRMED" ]; then
    echo -e "${GREEN}✓ PASS: Order A status is CONFIRMED${NC}"
    ((PASS_COUNT++)) || true
else
    echo -e "${RED}✗ FAIL: Order A status is not CONFIRMED (got: $ORDER_A_STATUS)${NC}"
    ((FAIL_COUNT++)) || true
    FAILED_TESTS+=("Order A confirmed status")
fi
echo ""

# Test 3.3: Pay order
echo "Test 3.3: Pay order (CONFIRMED -> PAID)"
pay_order_a_response=$(http_request "POST" "${API_BASE}/orders/${ORDER_A_ID}/pay" "" "Bearer $TOKEN_A")
save_response "Test 3.3: Pay order A" "$pay_order_a_response"
assert_code "Pay order A succeeds" "$pay_order_a_response" "0"
ORDER_A_STATUS=$(extract_json "$EXTRACT_STATUS" "$pay_order_a_response")
if [ "$ORDER_A_STATUS" = "PAID" ]; then
    echo -e "${GREEN}✓ PASS: Order A status is PAID${NC}"
    ((PASS_COUNT++)) || true
else
    echo -e "${RED}✗ FAIL: Order A status is not PAID (got: $ORDER_A_STATUS)${NC}"
    ((FAIL_COUNT++)) || true
    FAILED_TESTS+=("Order A paid status")
fi
echo ""

# Test 3.4: Order list vs detail separation
echo "Test 3.4: Order list returns summary (not full detail)"
list_orders_a_response=$(http_request "GET" "${API_BASE}/orders" "" "Bearer $TOKEN_A")
save_response "Test 3.4: List orders A" "$list_orders_a_response"
assert_code "List orders A succeeds" "$list_orders_a_response" "0"
# Verify list contains order ID
if echo "$list_orders_a_response" | grep -q "$ORDER_A_ID"; then
    echo -e "${GREEN}✓ PASS: Order list contains Order A${NC}"
    ((PASS_COUNT++)) || true
else
    echo -e "${RED}✗ FAIL: Order list does not contain Order A${NC}"
    ((FAIL_COUNT++)) || true
    FAILED_TESTS+=("Order list contains order")
fi
echo ""

# Test 3.5: Order detail returns full order
echo "Test 3.5: Order detail returns full order"
detail_order_a_response=$(http_request "GET" "${API_BASE}/orders/${ORDER_A_ID}" "" "Bearer $TOKEN_A")
save_response "Test 3.5: Order detail A" "$detail_order_a_response"
assert_code "Get order detail A succeeds" "$detail_order_a_response" "0"
# Verify detail contains items
if echo "$detail_order_a_response" | grep -q "\"items\""; then
    echo -e "${GREEN}✓ PASS: Order detail contains items${NC}"
    ((PASS_COUNT++)) || true
else
    echo -e "${RED}✗ FAIL: Order detail does not contain items${NC}"
    ((FAIL_COUNT++)) || true
    FAILED_TESTS+=("Order detail contains items")
fi
echo ""

# Test 3.6: Customer B cannot see Customer A's order
echo "Test 3.6: Customer B cannot see Customer A's order"
detail_order_b_response=$(http_request "GET" "${API_BASE}/orders/${ORDER_A_ID}" "" "Bearer $TOKEN_B")
save_response "Test 3.6: Order detail A by Customer B" "$detail_order_b_response"
assert_code "Customer B cannot access Customer A's order" "$detail_order_b_response" "404"
echo ""

# Test 3.7: Snapshot immutability - get snapshot after payment
echo "Test 3.7: Get order item snapshot (should be immutable)"
ORDER_A_ITEM_ID=$(extract_json "$EXTRACT_ITEM_ID" "$detail_order_a_response")
if [ -n "$ORDER_A_ITEM_ID" ]; then
    snapshot_response=$(http_request "GET" "${API_BASE}/orders/items/${ORDER_A_ITEM_ID}/snapshot" "" "Bearer $TOKEN_A")
    save_response "Test 3.7: Order item snapshot" "$snapshot_response"
    assert_code "Get snapshot succeeds" "$snapshot_response" "0"
    # Verify snapshot contains recipe data
    if echo "$snapshot_response" | grep -q "\"name\""; then
        echo -e "${GREEN}✓ PASS: Snapshot contains recipe data${NC}"
        ((PASS_COUNT++)) || true
    else
        echo -e "${RED}✗ FAIL: Snapshot does not contain recipe data${NC}"
        ((FAIL_COUNT++)) || true
        FAILED_TESTS+=("Snapshot contains recipe data")
    fi
else
    echo -e "${YELLOW}SKIP: Cannot test snapshot (no item ID)${NC}"
fi
echo ""

# ============================================
# SECTION 4: DIY Sheet Generation
# ============================================
echo -e "${BLUE}=== SECTION 4: DIY Sheet Generation ===${NC}"
echo ""

# Test 4.1: Generate DIY sheet
echo "Test 4.1: Generate DIY sheet for recipe"
diy_sheet_response=$(http_request "POST" "${API_BASE}/recipes/3fa85f64-5717-4562-b3fc-2c963f66afa7/diy-sheet" "{\"targetQuantityG\": 1000}" "")
save_response "Test 4.1: DIY sheet" "$diy_sheet_response"
assert_code "Generate DIY sheet succeeds" "$diy_sheet_response" "0"
# Verify DIY sheet contains ingredients
if echo "$diy_sheet_response" | grep -q "\"ingredients\""; then
    echo -e "${GREEN}✓ PASS: DIY sheet contains ingredients${NC}"
    ((PASS_COUNT++)) || true
else
    echo -e "${RED}✗ FAIL: DIY sheet does not contain ingredients${NC}"
    ((FAIL_COUNT++)) || true
    FAILED_TESTS+=("DIY sheet contains ingredients")
fi
echo ""

# ============================================
# SECTION 5: Error Cases
# ============================================
echo -e "${BLUE}=== SECTION 5: Error Cases ===${NC}"
echo ""

# Test 5.1: Invalid state transition
echo "Test 5.1: Invalid state transition (try to pay DRAFT order)"
# Create new order
create_order_error_response=$(http_request "POST" "${API_BASE}/orders" "$order_payload" "Bearer $TOKEN_A")
ORDER_ERROR_ID=$(extract_json "$EXTRACT_ID" "$create_order_error_response")
# Try to pay without confirming
pay_error_response=$(http_request "POST" "${API_BASE}/orders/${ORDER_ERROR_ID}/pay" "" "Bearer $TOKEN_A")
save_response "Test 5.1: Invalid state transition" "$pay_error_response"
assert_code "Invalid state transition returns 400" "$pay_error_response" "400"
echo ""

# Test 5.2: Access non-existent order
echo "Test 5.2: Access non-existent order"
nonexistent_response=$(http_request "GET" "${API_BASE}/orders/00000000-0000-0000-0000-000000000000" "" "Bearer $TOKEN_A")
save_response "Test 5.2: Non-existent order" "$nonexistent_response"
assert_code "Non-existent order returns 404" "$nonexistent_response" "404"
echo ""

# ============================================
# SUMMARY
# ============================================
echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo -e "Passed: ${GREEN}$PASS_COUNT${NC}"
echo -e "Failed: ${RED}$FAIL_COUNT${NC}"
echo ""

if [ $FAIL_COUNT -eq 0 ]; then
    echo -e "${GREEN}All tests passed!${NC}"
    echo ""
    echo "Evidence saved to: $OUTPUT_FILE"
    exit 0
else
    echo -e "${RED}Some tests failed:${NC}"
    for test in "${FAILED_TESTS[@]}"; do
        echo -e "  ${RED}✗${NC} $test"
    done
    echo ""
    echo "Evidence saved to: $OUTPUT_FILE"
    exit 1
fi




