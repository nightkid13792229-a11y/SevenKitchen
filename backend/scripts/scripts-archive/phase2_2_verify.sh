#!/bin/bash

# Phase 2.2 Acceptance Verification Script
# Tests Orders API happy path and negative cases

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
API_BASE="${API_BASE:-${BASE_URL}/api/v1}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PASS_COUNT=0
FAIL_COUNT=0
FAILED_TESTS=()

# Check for JSON parser (prefer jq, fallback to node, then python)
if command -v jq &> /dev/null; then
    JSON_PARSER="jq"
    EXTRACT_ID='.data.id'
    EXTRACT_ITEM_ID='.data.items[0].id'
    EXTRACT_STATUS='.data.status'
    EXTRACT_CODE='.code'
    EXTRACT_MESSAGE='.message'
elif command -v node &> /dev/null; then
    JSON_PARSER="node"
    EXTRACT_ID='process.stdout.write(JSON.parse(require("fs").readFileSync(0, "utf-8")).data.id || "")'
    EXTRACT_ITEM_ID='const d=JSON.parse(require("fs").readFileSync(0, "utf-8")); process.stdout.write(d.data.items[0].id || "")'
    EXTRACT_STATUS='process.stdout.write(JSON.parse(require("fs").readFileSync(0, "utf-8")).data.status || "")'
    EXTRACT_CODE='process.stdout.write(JSON.parse(require("fs").readFileSync(0, "utf-8")).code?.toString() || "")'
    EXTRACT_MESSAGE='process.stdout.write(JSON.parse(require("fs").readFileSync(0, "utf-8")).message || "")'
elif command -v python3 &> /dev/null; then
    JSON_PARSER="python3"
    EXTRACT_ID='import sys, json; print(json.load(sys.stdin).get("data", {}).get("id", ""), end="")'
    EXTRACT_ITEM_ID='import sys, json; d=json.load(sys.stdin); print(d.get("data", {}).get("items", [{}])[0].get("id", ""), end="")'
    EXTRACT_STATUS='import sys, json; print(json.load(sys.stdin).get("data", {}).get("status", ""), end="")'
    EXTRACT_CODE='import sys, json; print(str(json.load(sys.stdin).get("code", "")), end="")'
    EXTRACT_MESSAGE='import sys, json; print(json.load(sys.stdin).get("message", ""), end="")'
else
    echo -e "${RED}ERROR: No JSON parser found. Please install jq, node, or python3${NC}"
    echo "  macOS: brew install jq"
    echo "  Linux: apt-get install jq or yum install jq"
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
http_request() {
    local method="$1"
    local url="$2"
    local data="${3:-}"
    local expected_status="${4:-}"
    
    local response
    local status_code
    local curl_exit_code=0
    
    if [ -n "$data" ]; then
        response=$(curl -s -w "\n%{http_code}" -X "$method" \
            -H "Content-Type: application/json" \
            -d "$data" \
            "$url") || curl_exit_code=$?
    else
        response=$(curl -s -w "\n%{http_code}" -X "$method" "$url") || curl_exit_code=$?
    fi
    
    # Handle curl failures
    if [ $curl_exit_code -ne 0 ]; then
        echo -e "${RED}ERROR: curl failed with exit code $curl_exit_code${NC}" >&2
        echo "  URL: $url" >&2
        echo "  This usually means the server is not running." >&2
        return 1
    fi
    
    status_code=$(echo "$response" | tail -n1)
    response_body=$(echo "$response" | sed '$d')
    
    # Handle connection failures (status code 000)
    if [ "$status_code" = "000" ]; then
        echo -e "${RED}ERROR: Failed to connect to server${NC}" >&2
        echo "  URL: $url" >&2
        echo "  Make sure the backend server is running on $BASE_URL" >&2
        return 1
    fi
    
    if [ -n "$expected_status" ] && [ "$status_code" != "$expected_status" ]; then
        echo -e "${RED}ERROR: Expected HTTP $expected_status, got $status_code${NC}" >&2
        echo "Response: $response_body" >&2
        return 1
    fi
    
    echo "$response_body"
    return 0
}

# Test assertion helper
assert_test() {
    local test_name="$1"
    local condition="$2"
    
    if eval "$condition"; then
        echo -e "${GREEN}✓ PASS: $test_name${NC}"
        ((PASS_COUNT++)) || true
        return 0
    else
        echo -e "${RED}✗ FAIL: $test_name${NC}"
        ((FAIL_COUNT++)) || true
        FAILED_TESTS+=("$test_name")
        return 1
    fi
}

echo "=========================================="
echo "Phase 2.2 Orders API Acceptance Verification"
echo "=========================================="
echo "Base URL: $API_BASE"
echo "JSON Parser: $JSON_PARSER"
echo ""

# ==========================================
# Test a) Create Order Draft
# ==========================================
echo "Test a) POST /api/v1/orders - Create order draft"

CREATE_ORDER_BODY='{
  "dogId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
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

response=$(http_request "POST" "${API_BASE}/orders" "$CREATE_ORDER_BODY" "201") || {
    echo -e "${RED}✗ FAIL: Test a) Create order - http_request failed${NC}"
    ((FAIL_COUNT++)) || true
    FAILED_TESTS+=("Test a: Create order - http_request failed")
    exit 1
}

order_id=$(extract_json "$EXTRACT_ID" "$response") || order_id=""
item_id=$(extract_json "$EXTRACT_ITEM_ID" "$response") || item_id=""
status=$(extract_json "$EXTRACT_STATUS" "$response") || status=""

# Note: HTTP 201 status is already verified by http_request
assert_test "Response contains orderId" "[ -n \"$order_id\" ]"
assert_test "Response contains itemId" "[ -n \"$item_id\" ]"
assert_test "Order status is INIT" "[ \"$status\" = \"INIT\" ]"

echo "  Captured orderId: $order_id"
echo "  Captured itemId: $item_id"
echo ""

# ==========================================
# Test b) Confirm Order
# ==========================================
echo "Test b) POST /api/v1/orders/{orderId}/confirm - Confirm order"

response=$(http_request "POST" "${API_BASE}/orders/${order_id}/confirm" "" "200") || {
    echo -e "${RED}✗ FAIL: Test b) Confirm order - http_request failed${NC}"
    ((FAIL_COUNT++)) || true
    FAILED_TESTS+=("Test b: Confirm order - http_request failed")
    exit 1
}

status=$(extract_json "$EXTRACT_STATUS" "$response") || status=""
code=$(extract_json "$EXTRACT_CODE" "$response") || code=""

# Note: HTTP 200 status is already verified by http_request
assert_test "Response code is 0" "[ \"$code\" = \"0\" ]"
assert_test "Status becomes PENDING_PAYMENT" "[ \"$status\" = \"PENDING_PAYMENT\" ]"

echo "  Status after confirm: $status"
echo ""

# ==========================================
# Test c) Pay Order
# ==========================================
echo "Test c) POST /api/v1/orders/{orderId}/pay - Process payment"

response=$(http_request "POST" "${API_BASE}/orders/${order_id}/pay" "" "200") || {
    echo -e "${RED}✗ FAIL: Test c) Pay order - http_request failed${NC}"
    ((FAIL_COUNT++)) || true
    FAILED_TESTS+=("Test c: Pay order - http_request failed")
    exit 1
}

status=$(extract_json "$EXTRACT_STATUS" "$response") || status=""
code=$(extract_json "$EXTRACT_CODE" "$response") || code=""

# Note: HTTP 200 status is already verified by http_request
assert_test "Response code is 0" "[ \"$code\" = \"0\" ]"
assert_test "Status becomes PAID" "[ \"$status\" = \"PAID\" ]"

echo "  Status after pay: $status"
echo ""

# ==========================================
# Test d) Get Order Detail
# ==========================================
echo "Test d) GET /api/v1/orders/{orderId} - Get order detail"

response=$(http_request "GET" "${API_BASE}/orders/${order_id}" "" "200") || {
    echo -e "${RED}✗ FAIL: Test d) Get order - http_request failed${NC}"
    ((FAIL_COUNT++)) || true
    FAILED_TESTS+=("Test d: Get order - http_request failed")
    exit 1
}

status=$(extract_json "$EXTRACT_STATUS" "$response") || status=""
code=$(extract_json "$EXTRACT_CODE" "$response") || code=""

# Verify itemId is in items array
if [ "$JSON_PARSER" = "jq" ]; then
    items_json=$(echo "$response" | jq -r '.data.items' 2>/dev/null || echo "[]")
    item_found=$(echo "$items_json" | jq -r --arg itemId "$item_id" '.[] | select(.id == $itemId) | .id' 2>/dev/null || echo "")
else
    # Fallback: check if item_id appears in response
    item_found=$(echo "$response" | grep -q "$item_id" && echo "$item_id" || echo "")
fi

# Note: HTTP 200 status is already verified by http_request
assert_test "Response code is 0" "[ \"$code\" = \"0\" ]"
assert_test "Order status is PAID" "[ \"$status\" = \"PAID\" ]"
assert_test "Items array contains itemId" "[ -n \"$item_found\" ]"

echo "  Order status: $status"
echo ""

# ==========================================
# Test e) Snapshot Immutability
# ==========================================
echo "Test e) GET /api/v1/orders/items/{itemId}/snapshot - Verify snapshot immutability"

snapshot1=$(http_request "GET" "${API_BASE}/orders/items/${item_id}/snapshot" "" "200") || {
    echo -e "${RED}✗ FAIL: Test e) Snapshot immutability - first fetch failed${NC}"
    ((FAIL_COUNT++)) || true
    FAILED_TESTS+=("Test e: Snapshot immutability - first fetch failed")
    exit 1
}
code1=$(extract_json "$EXTRACT_CODE" "$snapshot1") || code1=""

# Wait a moment and fetch again
sleep 0.5
snapshot2=$(http_request "GET" "${API_BASE}/orders/items/${item_id}/snapshot" "" "200") || {
    echo -e "${RED}✗ FAIL: Test e) Snapshot immutability - second fetch failed${NC}"
    ((FAIL_COUNT++)) || true
    FAILED_TESTS+=("Test e: Snapshot immutability - second fetch failed")
    exit 1
}
code2=$(extract_json "$EXTRACT_CODE" "$snapshot2") || code2=""

# Note: HTTP 200 status is already verified by http_request for both fetches
assert_test "Both responses have code 0" "[ \"$code1\" = \"0\" ] && [ \"$code2\" = \"0\" ]"

# Compare snapshots (exact match)
if [ "$snapshot1" = "$snapshot2" ]; then
    assert_test "Snapshots are identical (immutable)" "true"
    echo "  Snapshots match ✓"
else
    assert_test "Snapshots are identical (immutable)" "false"
    echo -e "${RED}  Snapshots differ!${NC}"
    echo "  Snapshot 1: ${snapshot1:0:100}..."
    echo "  Snapshot 2: ${snapshot2:0:100}..."
fi
echo ""

# ==========================================
# Test f) Negative: Pay without Confirm (Illegal Transition)
# ==========================================
echo "Test f) Negative: POST /api/v1/orders/{orderId2}/pay without confirm - Illegal transition"

# Create a new order
response2=$(http_request "POST" "${API_BASE}/orders" "$CREATE_ORDER_BODY" "201") || {
    echo -e "${RED}✗ FAIL: Test f) Illegal transition - failed to create order2${NC}"
    ((FAIL_COUNT++)) || true
    FAILED_TESTS+=("Test f: Illegal transition - failed to create order2")
    exit 1
}

order_id2=$(extract_json "$EXTRACT_ID" "$response2") || order_id2=""
if [ -z "$order_id2" ]; then
    echo -e "${RED}✗ FAIL: Test f) Illegal transition - failed to extract orderId2${NC}"
    echo "Response was: $response2"
    ((FAIL_COUNT++)) || true
    FAILED_TESTS+=("Test f: Illegal transition - failed to extract orderId2")
    exit 1
fi

# Verify the order is in INIT status
status_check=$(http_request "GET" "${API_BASE}/orders/${order_id2}" "" "200") || {
    echo -e "${RED}✗ FAIL: Test f) Illegal transition - failed to check order status${NC}"
    ((FAIL_COUNT++)) || true
    FAILED_TESTS+=("Test f: Illegal transition - failed to check order status")
    exit 1
}
init_status=$(extract_json "$EXTRACT_STATUS" "$status_check") || init_status=""
echo "  Created orderId2: $order_id2 (status: $init_status)"

# Try to pay directly without confirming
response=$(curl -s -w "\n%{http_code}" -X "POST" "${API_BASE}/orders/${order_id2}/pay")
status_code=$(echo "$response" | tail -n1)
response_body=$(echo "$response" | sed '$d')
code=$(extract_json "$EXTRACT_CODE" "$response_body")
message=$(extract_json "$EXTRACT_MESSAGE" "$response_body")

# Print debug info before assertions
echo "  Pay request HTTP Status: $status_code"
echo "  Response code field: $code"
echo "  Response message: $message"

# Note: API returns HTTP 200 with error code in response body
# Check response body code field for error (non-zero = error, 400 = bad request)
assert_test "Pay without confirm returns error (code != 0)" "[ \"$code\" != \"0\" ]"
assert_test "Error code indicates bad request (400)" "[ \"$code\" = \"400\" ]"
echo ""

# ==========================================
# Test g) Negative: Create Order with Non-existent Recipe
# ==========================================
echo "Test g) Negative: POST /api/v1/orders with non-existent recipeId - Should return 404"

INVALID_ORDER_BODY='{
  "dogId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "type": "FRESH_FOOD",
  "items": [
    {
      "recipeId": "00000000-0000-0000-0000-000000000000",
      "quantityG": 1400,
      "packageCount": 14,
      "packageSpecG": 100
    }
  ]
}'

response=$(curl -s -w "\n%{http_code}" -X "POST" \
    -H "Content-Type: application/json" \
    -d "$INVALID_ORDER_BODY" \
    "${API_BASE}/orders") || {
    echo -e "${RED}✗ FAIL: Test g) Non-existent recipe - curl failed${NC}"
    ((FAIL_COUNT++)) || true
    FAILED_TESTS+=("Test g: Non-existent recipe - curl failed")
    exit 1
}

status_code=$(echo "$response" | tail -n1)
response_body=$(echo "$response" | sed '$d')

# Handle connection failures
if [ "$status_code" = "000" ]; then
    echo -e "${RED}✗ FAIL: Test g) Non-existent recipe - failed to connect to server${NC}"
    ((FAIL_COUNT++)) || true
    FAILED_TESTS+=("Test g: Non-existent recipe - connection failed")
    exit 1
fi

code=$(extract_json "$EXTRACT_CODE" "$response_body") || code=""
message=$(extract_json "$EXTRACT_MESSAGE" "$response_body") || message=""

# Note: API returns HTTP 200 with error code in response body
assert_test "Invalid recipe returns error (code != 0)" "[ \"$code\" != \"0\" ]"
assert_test "Error code indicates not found (404)" "[ \"$code\" = \"404\" ]"

# Check if message contains "Recipe not found"
if echo "$message" | grep -qi "recipe not found"; then
    assert_test "Error message contains 'Recipe not found'" "true"
else
    assert_test "Error message contains 'Recipe not found'" "false"
    echo -e "${YELLOW}  Warning: Expected message to contain 'Recipe not found', got: $message${NC}"
fi

echo "  HTTP Status: $status_code"
echo "  Error code: $code"
echo "  Error message: $message"
echo ""

# ==========================================
# Summary
# ==========================================
echo "=========================================="
echo "Verification Summary"
echo "=========================================="
echo -e "${GREEN}Passed: $PASS_COUNT${NC}"
echo -e "${RED}Failed: $FAIL_COUNT${NC}"
echo ""

if [ $FAIL_COUNT -eq 0 ]; then
    echo -e "${GREEN}✓ All tests PASSED${NC}"
    echo ""
    echo "Captured IDs for manual verification:"
    echo "  orderId: $order_id"
    echo "  itemId: $item_id"
    exit 0
else
    echo -e "${RED}✗ Some tests FAILED${NC}"
    echo "Failed tests:"
    for test in "${FAILED_TESTS[@]}"; do
        echo -e "  ${RED}✗ $test${NC}"
    done
    exit 1
fi




