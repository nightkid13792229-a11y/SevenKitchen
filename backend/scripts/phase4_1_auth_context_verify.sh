#!/bin/bash

# Phase 4.1 Acceptance Verification Script
# Tests Auth Context: X-Customer-Id header authentication

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

# Output file for evidence
OUTPUT_FILE="${OUTPUT_FILE:-docs/phase4_1_auth_context_verify_output.txt}"
mkdir -p "$(dirname "$OUTPUT_FILE")"

# Check for JSON parser (prefer jq, fallback to node, then python)
if command -v jq &> /dev/null; then
    JSON_PARSER="jq"
    EXTRACT_CODE='.code'
    EXTRACT_MESSAGE='.message'
    EXTRACT_ID='.data.id'
elif command -v node &> /dev/null; then
    JSON_PARSER="node"
    EXTRACT_CODE='process.stdout.write(JSON.parse(require("fs").readFileSync(0, "utf-8")).code?.toString() || "")'
    EXTRACT_MESSAGE='process.stdout.write(JSON.parse(require("fs").readFileSync(0, "utf-8")).message || "")'
    EXTRACT_ID='process.stdout.write(JSON.parse(require("fs").readFileSync(0, "utf-8")).data?.id || "")'
elif command -v python3 &> /dev/null; then
    JSON_PARSER="python3"
    EXTRACT_CODE='import sys, json; print(str(json.load(sys.stdin).get("code", "")), end="")'
    EXTRACT_MESSAGE='import sys, json; print(json.load(sys.stdin).get("message", ""), end="")'
    EXTRACT_ID='import sys, json; print(json.load(sys.stdin).get("data", {}).get("id", ""), end="")'
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
    local header_name="${4:-}"
    local header_value="${5:-}"
    local expected_status="${6:-200}"
    
    local response
    local status_code
    local curl_exit_code=0
    local curl_cmd="curl -s -w \"\n%{http_code}\" -X \"$method\" -H \"Content-Type: application/json\""
    
    if [ -n "$header_name" ] && [ -n "$header_value" ]; then
        curl_cmd="$curl_cmd -H \"$header_name: $header_value\""
    fi
    
    if [ -n "$data" ]; then
        curl_cmd="$curl_cmd -d '$data'"
    fi
    
    curl_cmd="$curl_cmd \"$url\""
    
    response=$(eval "$curl_cmd") || curl_exit_code=$?
    
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
    
    if [ "$status_code" != "$expected_status" ]; then
        echo -e "${YELLOW}WARNING: Expected HTTP $expected_status, got $status_code${NC}" >&2
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

# Save response to output file
save_response() {
    local test_label="$1"
    local response="$2"
    echo "" >> "$OUTPUT_FILE"
    echo "=== $test_label ===" >> "$OUTPUT_FILE"
    echo "$response" | $JSON_PARSER . >> "$OUTPUT_FILE" 2>&1 || echo "$response" >> "$OUTPUT_FILE"
}

echo "=========================================="
echo "Phase 4.1: Auth Context Verification"
echo "=========================================="
echo ""
echo "Testing authentication via X-Customer-Id header"
echo "Base URL: $BASE_URL"
echo ""

# Clear output file
echo "Phase 4.1 Auth Context Verification Output" > "$OUTPUT_FILE"
echo "Generated: $(date)" >> "$OUTPUT_FILE"

# Test 1: Missing header should return 401
echo "Test 1: Missing X-Customer-Id header returns 401"
test1_response=$(http_request "GET" "${API_BASE}/orders" "" "" "" 200)
save_response "Test 1: GET /orders without header" "$test1_response"
test1_code=$(extract_json "$EXTRACT_CODE" "$test1_response")
test1_message=$(extract_json "$EXTRACT_MESSAGE" "$test1_response")

assert_test "Missing header returns code=401" "[ \"$test1_code\" = \"401\" ]"
assert_test "Error message mentions X-Customer-Id" "[ -n \"$test1_message\" ] && echo \"$test1_message\" | grep -qi 'X-Customer-Id'"
echo ""

# Test 2: Create address with Customer A and verify it appears for A
echo "Test 2: Create address with X-Customer-Id=A and list for A"
CUSTOMER_A="customer-phase4-1-a"
CUSTOMER_B="customer-phase4-1-b"

address_payload='{
  "recipientName": "Customer A Recipient",
  "phone": "13800138000",
  "region": {
    "province": "广东省",
    "city": "深圳市",
    "district": "南山区"
  },
  "detail": "Test Address A",
  "isDefault": false
}'

test2_response=$(http_request "POST" "${API_BASE}/addresses" "$address_payload" "X-Customer-Id" "$CUSTOMER_A" 201)
save_response "Test 2: Create address for Customer A" "$test2_response"
test2_code=$(extract_json "$EXTRACT_CODE" "$test2_response")
address_id_a=$(extract_json "$EXTRACT_ID" "$test2_response")

assert_test "Address creation succeeds (code=0)" "[ \"$test2_code\" = \"0\" ]"
assert_test "Address ID is returned" "[ -n \"$address_id_a\" ]"

# List addresses for Customer A
test2_list_response=$(http_request "GET" "${API_BASE}/addresses" "" "X-Customer-Id" "$CUSTOMER_A" 200)
save_response "Test 2: List addresses for Customer A" "$test2_list_response"
test2_list_code=$(extract_json "$EXTRACT_CODE" "$test2_list_response")

assert_test "List request succeeds (code=0)" "[ \"$test2_list_code\" = \"0\" ]"
assert_test "Customer A sees their address" "echo \"$test2_list_response\" | grep -q \"$address_id_a\""
echo ""

# Test 3: Customer B should not see Customer A's address
echo "Test 3: Customer B cannot see Customer A's data"
test3_response=$(http_request "GET" "${API_BASE}/addresses" "" "X-Customer-Id" "$CUSTOMER_B" 200)
save_response "Test 3: List addresses for Customer B" "$test3_response"
test3_code=$(extract_json "$EXTRACT_CODE" "$test3_response")

assert_test "List request succeeds (code=0)" "[ \"$test3_code\" = \"0\" ]"
assert_test "Customer B does not see Customer A's address" "! echo \"$test3_response\" | grep -q \"$address_id_a\""
echo ""

# Test 4: Create order with Customer A and verify isolation
echo "Test 4: Create order with X-Customer-Id=A and verify isolation"
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

test4_response=$(http_request "POST" "${API_BASE}/orders" "$order_payload" "X-Customer-Id" "$CUSTOMER_A" 201)
save_response "Test 4: Create order for Customer A" "$test4_response"
test4_code=$(extract_json "$EXTRACT_CODE" "$test4_response")
order_id_a=$(extract_json "$EXTRACT_ID" "$test4_response")

assert_test "Order creation succeeds (code=0)" "[ \"$test4_code\" = \"0\" ]"
assert_test "Order ID is returned" "[ -n \"$order_id_a\" ]"

# Verify order appears in list for Customer A
test4_list_a_response=$(http_request "GET" "${API_BASE}/orders" "" "X-Customer-Id" "$CUSTOMER_A" 200)
save_response "Test 4: List orders for Customer A" "$test4_list_a_response"
test4_list_a_code=$(extract_json "$EXTRACT_CODE" "$test4_list_a_response")

assert_test "List request succeeds (code=0)" "[ \"$test4_list_a_code\" = \"0\" ]"
assert_test "Customer A sees their order" "echo \"$test4_list_a_response\" | grep -q \"$order_id_a\""

# Verify order does NOT appear for Customer B
test4_list_b_response=$(http_request "GET" "${API_BASE}/orders" "" "X-Customer-Id" "$CUSTOMER_B" 200)
save_response "Test 4: List orders for Customer B" "$test4_list_b_response"
test4_list_b_code=$(extract_json "$EXTRACT_CODE" "$test4_list_b_response")

assert_test "List request succeeds (code=0)" "[ \"$test4_list_b_code\" = \"0\" ]"
assert_test "Customer B does not see Customer A's order" "! echo \"$test4_list_b_response\" | grep -q \"$order_id_a\""
echo ""

# Test 5: Missing header on POST should return 401
echo "Test 5: Missing X-Customer-Id header on POST returns 401"
test5_response=$(http_request "POST" "${API_BASE}/orders" "$order_payload" "" "" 200)
save_response "Test 5: POST /orders without header" "$test5_response"
test5_code=$(extract_json "$EXTRACT_CODE" "$test5_response")

assert_test "Missing header returns code=401" "[ \"$test5_code\" = \"401\" ]"
echo ""

# Summary
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



