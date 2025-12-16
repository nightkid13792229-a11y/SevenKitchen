#!/bin/bash

# Phase 3.2 Acceptance Verification Script
# Tests GET /api/v1/orders (List Orders) endpoint

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
OUTPUT_FILE="${OUTPUT_FILE:-docs/phase3_2_orders_list_verify_output.txt}"
mkdir -p "$(dirname "$OUTPUT_FILE")"

# Check for JSON parser (prefer jq, fallback to node, then python)
if command -v jq &> /dev/null; then
    JSON_PARSER="jq"
    EXTRACT_ID='.data.id'
    EXTRACT_CODE='.code'
    EXTRACT_MESSAGE='.message'
    EXTRACT_STATUS='.data.status'
    EXTRACT_TYPE='.data.type'
    EXTRACT_TOTAL_AMOUNT='.data.totalAmount'
    EXTRACT_ITEM_COUNT='.data.itemCount'
elif command -v node &> /dev/null; then
    JSON_PARSER="node"
    EXTRACT_ID='process.stdout.write(JSON.parse(require("fs").readFileSync(0, "utf-8")).data.id || "")'
    EXTRACT_CODE='process.stdout.write(JSON.parse(require("fs").readFileSync(0, "utf-8")).code?.toString() || "")'
    EXTRACT_MESSAGE='process.stdout.write(JSON.parse(require("fs").readFileSync(0, "utf-8")).message || "")'
    EXTRACT_STATUS='process.stdout.write(JSON.parse(require("fs").readFileSync(0, "utf-8")).data.status || "")'
    EXTRACT_TYPE='process.stdout.write(JSON.parse(require("fs").readFileSync(0, "utf-8")).data.type || "")'
    EXTRACT_TOTAL_AMOUNT='const d=JSON.parse(require("fs").readFileSync(0, "utf-8")); process.stdout.write(d.data?.totalAmount?.toString() || "")'
    EXTRACT_ITEM_COUNT='const d=JSON.parse(require("fs").readFileSync(0, "utf-8")); process.stdout.write(d.data?.itemCount?.toString() || "")'
elif command -v python3 &> /dev/null; then
    JSON_PARSER="python3"
    EXTRACT_ID='import sys, json; print(json.load(sys.stdin).get("data", {}).get("id", ""), end="")'
    EXTRACT_CODE='import sys, json; print(str(json.load(sys.stdin).get("code", "")), end="")'
    EXTRACT_MESSAGE='import sys, json; print(json.load(sys.stdin).get("message", ""), end="")'
    EXTRACT_STATUS='import sys, json; print(json.load(sys.stdin).get("data", {}).get("status", ""), end="")'
    EXTRACT_TYPE='import sys, json; print(json.load(sys.stdin).get("data", {}).get("type", ""), end="")'
    EXTRACT_TOTAL_AMOUNT='import sys, json; d=json.load(sys.stdin); print(str(d.get("data", {}).get("totalAmount", "")), end="")'
    EXTRACT_ITEM_COUNT='import sys, json; d=json.load(sys.stdin); print(str(d.get("data", {}).get("itemCount", "")), end="")'
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

# Save response to output file
save_response() {
    local test_label="$1"
    local response="$2"
    {
        echo "=========================================="
        echo "Test: $test_label"
        echo "Timestamp: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
        echo "=========================================="
        echo "$response" | jq . 2>/dev/null || echo "$response"
        echo ""
    } >> "$OUTPUT_FILE"
}

echo "=========================================="
echo "Phase 3.2 Orders List API Acceptance Verification"
echo "=========================================="
echo "Base URL: $API_BASE"
echo "JSON Parser: $JSON_PARSER"
echo "Output File: $OUTPUT_FILE"
echo ""

# Initialize output file
{
    echo "Phase 3.2 Orders List API Verification Output"
    echo "Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    echo "Base URL: $API_BASE"
    echo "JSON Parser: $JSON_PARSER"
    echo ""
} > "$OUTPUT_FILE"

# Recipe ID seeded in AppModule.onModuleInit
SEEDED_RECIPE_ID="3fa85f64-5717-4562-b3fc-2c963f66afa7"

# ==========================================
# Test a) GET /orders initially (empty or existing)
# ==========================================
echo "Test a) GET /api/v1/orders - Initial list (may be empty)"

response=$(http_request "GET" "${API_BASE}/orders" "" "200") || {
    echo -e "${RED}✗ FAIL: Test a) List orders - http_request failed${NC}"
    ((FAIL_COUNT++)) || true
    FAILED_TESTS+=("Test a: List orders - http_request failed")
    exit 1
}

save_response "a) Initial GET /orders" "$response"

code=$(extract_json "$EXTRACT_CODE" "$response") || code=""

# Check if data is an array
if [ "$JSON_PARSER" = "jq" ]; then
    is_array=$(echo "$response" | jq -r 'if type == "object" and .data != null then (.data | type == "array") else false end' 2>/dev/null || echo "false")
    array_length=$(echo "$response" | jq -r '.data | length' 2>/dev/null || echo "0")
elif [ "$JSON_PARSER" = "node" ]; then
    is_array=$(echo "$response" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf-8')); process.stdout.write(Array.isArray(d.data) ? 'true' : 'false')" 2>/dev/null || echo "false")
    array_length=$(echo "$response" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf-8')); process.stdout.write((d.data||[]).length.toString())" 2>/dev/null || echo "0")
else
    is_array=$(echo "$response" | python3 -c "import sys, json; d=json.load(sys.stdin); print('true' if isinstance(d.get('data'), list) else 'false', end='')" 2>/dev/null || echo "false")
    array_length=$(echo "$response" | python3 -c "import sys, json; d=json.load(sys.stdin); print(len(d.get('data', [])), end='')" 2>/dev/null || echo "0")
fi

assert_test "Response code is 0" "[ \"$code\" = \"0\" ]"
assert_test "Response data is an array" "[ \"$is_array\" = \"true\" ]"

echo "  Response code: $code"
echo "  Array length: $array_length"
echo ""

# ==========================================
# Test b) Create Order 1
# ==========================================
echo "Test b) POST /api/v1/orders - Create order 1"

CREATE_ORDER_1_BODY="{
  \"dogId\": \"3fa85f64-5717-4562-b3fc-2c963f66afa6\",
  \"type\": \"FRESH_FOOD\",
  \"items\": [
    {
      \"recipeId\": \"${SEEDED_RECIPE_ID}\",
      \"quantityG\": 1400,
      \"packageCount\": 14,
      \"packageSpecG\": 100
    }
  ]
}"

response=$(http_request "POST" "${API_BASE}/orders" "$CREATE_ORDER_1_BODY" "201") || {
    echo -e "${RED}✗ FAIL: Test b) Create order 1 - http_request failed${NC}"
    ((FAIL_COUNT++)) || true
    FAILED_TESTS+=("Test b: Create order 1 - http_request failed")
    exit 1
}

save_response "b) Create Order 1" "$response"

order_id_1=$(extract_json "$EXTRACT_ID" "$response") || order_id_1=""
code=$(extract_json "$EXTRACT_CODE" "$response") || code=""

assert_test "Order 1 created successfully" "[ \"$code\" = \"0\" ]"
assert_test "Order 1 ID extracted" "[ -n \"$order_id_1\" ]"

echo "  Captured orderId1: $order_id_1"
echo ""

# ==========================================
# Test c) Create Order 2
# ==========================================
echo "Test c) POST /api/v1/orders - Create order 2"

CREATE_ORDER_2_BODY="{
  \"dogId\": \"3fa85f64-5717-4562-b3fc-2c963f66afa6\",
  \"type\": \"FRESH_FOOD\",
  \"items\": [
    {
      \"recipeId\": \"${SEEDED_RECIPE_ID}\",
      \"quantityG\": 2000,
      \"packageCount\": 20,
      \"packageSpecG\": 100
    }
  ]
}"

response=$(http_request "POST" "${API_BASE}/orders" "$CREATE_ORDER_2_BODY" "201") || {
    echo -e "${RED}✗ FAIL: Test c) Create order 2 - http_request failed${NC}"
    ((FAIL_COUNT++)) || true
    FAILED_TESTS+=("Test c: Create order 2 - http_request failed")
    exit 1
}

save_response "c) Create Order 2" "$response"

order_id_2=$(extract_json "$EXTRACT_ID" "$response") || order_id_2=""
code=$(extract_json "$EXTRACT_CODE" "$response") || code=""

assert_test "Order 2 created successfully" "[ \"$code\" = \"0\" ]"
assert_test "Order 2 ID extracted" "[ -n \"$order_id_2\" ]"

echo "  Captured orderId2: $order_id_2"
echo ""

# ==========================================
# Test d) GET /orders returns both orders
# ==========================================
echo "Test d) GET /api/v1/orders - Verify both orders in list"

response=$(http_request "GET" "${API_BASE}/orders" "" "200") || {
    echo -e "${RED}✗ FAIL: Test d) List orders - http_request failed${NC}"
    ((FAIL_COUNT++)) || true
    FAILED_TESTS+=("Test d: List orders - http_request failed")
    exit 1
}

save_response "d) GET /orders After Creating 2 Orders" "$response"

code=$(extract_json "$EXTRACT_CODE" "$response") || code=""

# Check if both order IDs are in the list
if [ "$JSON_PARSER" = "jq" ]; then
    order_list=$(echo "$response" | jq -r '.data[]?.id' 2>/dev/null || echo "")
    order_1_found=$(echo "$order_list" | grep -q "^${order_id_1}$" && echo "$order_id_1" || echo "")
    order_2_found=$(echo "$order_list" | grep -q "^${order_id_2}$" && echo "$order_id_2" || echo "")
    array_length=$(echo "$response" | jq -r '.data | length' 2>/dev/null || echo "0")
elif [ "$JSON_PARSER" = "node" ]; then
    order_1_found=$(echo "$response" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf-8')); const arr=d.data||[]; const found=arr.find(a=>a.id==='$order_id_1'); process.stdout.write(found?.id||'')" 2>/dev/null || echo "")
    order_2_found=$(echo "$response" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf-8')); const arr=d.data||[]; const found=arr.find(a=>a.id==='$order_id_2'); process.stdout.write(found?.id||'')" 2>/dev/null || echo "")
    array_length=$(echo "$response" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf-8')); process.stdout.write((d.data||[]).length.toString())" 2>/dev/null || echo "0")
else
    order_1_found=$(echo "$response" | python3 -c "import sys, json; d=json.load(sys.stdin); arr=d.get('data', []); addr=next((a for a in arr if a.get('id') == '$order_id_1'), None); print(addr.get('id', '') if addr else '', end='')" 2>/dev/null || echo "")
    order_2_found=$(echo "$response" | python3 -c "import sys, json; d=json.load(sys.stdin); arr=d.get('data', []); addr=next((a for a in arr if a.get('id') == '$order_id_2'), None); print(addr.get('id', '') if addr else '', end='')" 2>/dev/null || echo "")
    array_length=$(echo "$response" | python3 -c "import sys, json; d=json.load(sys.stdin); print(len(d.get('data', [])), end='')" 2>/dev/null || echo "0")
fi

assert_test "Response code is 0" "[ \"$code\" = \"0\" ]"
assert_test "List contains orderId1" "[ -n \"$order_1_found\" ]"
assert_test "List contains orderId2" "[ -n \"$order_2_found\" ]"
assert_test "List has at least 2 items" "[ \"$array_length\" -ge 2 ]"

echo "  Response code: $code"
echo "  List length: $array_length"
echo "  Order 1 found: $([ -n "$order_1_found" ] && echo "yes" || echo "no")"
echo "  Order 2 found: $([ -n "$order_2_found" ] && echo "yes" || echo "no")"
echo ""

# ==========================================
# Test e) Verify summary structure (no items array)
# ==========================================
echo "Test e) Verify order summary structure (no full items array)"

# Extract first order from list to verify summary structure
if [ "$JSON_PARSER" = "jq" ]; then
    first_order=$(echo "$response" | jq -r --arg id "$order_id_1" '.data[]? | select(.id == $id)' 2>/dev/null || echo "{}")
    has_items=$(echo "$first_order" | jq -r 'has("items")' 2>/dev/null || echo "false")
    has_id=$(echo "$first_order" | jq -r 'has("id")' 2>/dev/null || echo "false")
    has_status=$(echo "$first_order" | jq -r 'has("status")' 2>/dev/null || echo "false")
    has_type=$(echo "$first_order" | jq -r 'has("type")' 2>/dev/null || echo "false")
    has_total_amount=$(echo "$first_order" | jq -r 'has("totalAmount")' 2>/dev/null || echo "false")
    has_item_count=$(echo "$first_order" | jq -r 'has("itemCount")' 2>/dev/null || echo "false")
elif [ "$JSON_PARSER" = "node" ]; then
    first_order=$(echo "$response" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf-8')); const arr=d.data||[]; const found=arr.find(a=>a.id==='$order_id_1'); process.stdout.write(JSON.stringify(found||{}))" 2>/dev/null || echo "{}")
    has_items=$(echo "$first_order" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf-8')); process.stdout.write(d.hasOwnProperty('items') ? 'true' : 'false')" 2>/dev/null || echo "false")
    has_id=$(echo "$first_order" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf-8')); process.stdout.write(d.hasOwnProperty('id') ? 'true' : 'false')" 2>/dev/null || echo "false")
    has_status=$(echo "$first_order" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf-8')); process.stdout.write(d.hasOwnProperty('status') ? 'true' : 'false')" 2>/dev/null || echo "false")
    has_type=$(echo "$first_order" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf-8')); process.stdout.write(d.hasOwnProperty('type') ? 'true' : 'false')" 2>/dev/null || echo "false")
    has_total_amount=$(echo "$first_order" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf-8')); process.stdout.write(d.hasOwnProperty('totalAmount') ? 'true' : 'false')" 2>/dev/null || echo "false")
    has_item_count=$(echo "$first_order" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf-8')); process.stdout.write(d.hasOwnProperty('itemCount') ? 'true' : 'false')" 2>/dev/null || echo "false")
else
    first_order=$(echo "$response" | python3 -c "import sys, json; d=json.load(sys.stdin); arr=d.get('data', []); addr=next((a for a in arr if a.get('id') == '$order_id_1'), {}); print(json.dumps(addr), end='')" 2>/dev/null || echo "{}")
    has_items=$(echo "$first_order" | python3 -c "import sys, json; d=json.load(sys.stdin); print('true' if 'items' in d else 'false', end='')" 2>/dev/null || echo "false")
    has_id=$(echo "$first_order" | python3 -c "import sys, json; d=json.load(sys.stdin); print('true' if 'id' in d else 'false', end='')" 2>/dev/null || echo "false")
    has_status=$(echo "$first_order" | python3 -c "import sys, json; d=json.load(sys.stdin); print('true' if 'status' in d else 'false', end='')" 2>/dev/null || echo "false")
    has_type=$(echo "$first_order" | python3 -c "import sys, json; d=json.load(sys.stdin); print('true' if 'type' in d else 'false', end='')" 2>/dev/null || echo "false")
    has_total_amount=$(echo "$first_order" | python3 -c "import sys, json; d=json.load(sys.stdin); print('true' if 'totalAmount' in d else 'false', end='')" 2>/dev/null || echo "false")
    has_item_count=$(echo "$first_order" | python3 -c "import sys, json; d=json.load(sys.stdin); print('true' if 'itemCount' in d else 'false', end='')" 2>/dev/null || echo "false")
fi

assert_test "Summary has id field" "[ \"$has_id\" = \"true\" ]"
assert_test "Summary has status field" "[ \"$has_status\" = \"true\" ]"
assert_test "Summary has type field" "[ \"$has_type\" = \"true\" ]"
assert_test "Summary has totalAmount field" "[ \"$has_total_amount\" = \"true\" ]"
assert_test "Summary has itemCount field" "[ \"$has_item_count\" = \"true\" ]"
assert_test "Summary does NOT have items array" "[ \"$has_items\" = \"false\" ]"

if [ "$has_items" = "true" ]; then
    echo -e "${RED}  ERROR: Summary should not include full items array${NC}"
    echo "  First order JSON: $first_order"
fi

echo "  Summary fields verified:"
echo "    - id: $has_id"
echo "    - status: $has_status"
echo "    - type: $has_type"
echo "    - totalAmount: $has_total_amount"
echo "    - itemCount: $has_item_count"
echo "    - items (should be false): $has_items"
echo ""

# ==========================================
# Test f) Route matching: GET /orders/:id returns detail
# ==========================================
echo "Test f) GET /api/v1/orders/:id - Verify detail endpoint still works"

response=$(http_request "GET" "${API_BASE}/orders/${order_id_1}" "" "200") || {
    echo -e "${RED}✗ FAIL: Test f) Get order detail - http_request failed${NC}"
    ((FAIL_COUNT++)) || true
    FAILED_TESTS+=("Test f: Get order detail - http_request failed")
    exit 1
}

save_response "f) GET /orders/:id Detail" "$response"

code=$(extract_json "$EXTRACT_CODE" "$response") || code=""

# Check if detail response has items array
if [ "$JSON_PARSER" = "jq" ]; then
    has_items=$(echo "$response" | jq -r 'has("data") and (.data | has("items"))' 2>/dev/null || echo "false")
    items_length=$(echo "$response" | jq -r '.data.items | length' 2>/dev/null || echo "0")
elif [ "$JSON_PARSER" = "node" ]; then
    has_items=$(echo "$response" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf-8')); process.stdout.write(d.data && d.data.items ? 'true' : 'false')" 2>/dev/null || echo "false")
    items_length=$(echo "$response" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf-8')); process.stdout.write((d.data?.items||[]).length.toString())" 2>/dev/null || echo "0")
else
    has_items=$(echo "$response" | python3 -c "import sys, json; d=json.load(sys.stdin); print('true' if d.get('data') and 'items' in d.get('data', {}) else 'false', end='')" 2>/dev/null || echo "false")
    items_length=$(echo "$response" | python3 -c "import sys, json; d=json.load(sys.stdin); print(len(d.get('data', {}).get('items', [])), end='')" 2>/dev/null || echo "0")
fi

assert_test "Detail response code is 0" "[ \"$code\" = \"0\" ]"
assert_test "Detail response has items array" "[ \"$has_items\" = \"true\" ]"
assert_test "Detail response has at least 1 item" "[ \"$items_length\" -ge 1 ]"

echo "  Detail endpoint verified:"
echo "    - Response code: $code"
echo "    - Has items array: $has_items"
echo "    - Items count: $items_length"
echo "  Route matching confirmed: GET /orders and GET /orders/:id both work"
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

# Save summary to output file
{
    echo "=========================================="
    echo "Verification Summary"
    echo "=========================================="
    echo "Passed: $PASS_COUNT"
    echo "Failed: $FAIL_COUNT"
    echo ""
    echo "Captured IDs:"
    echo "  orderId1: $order_id_1"
    echo "  orderId2: $order_id_2"
    echo ""
    echo "Note: Customer isolation is verified by unit tests only."
    echo "      Controller uses hardcoded 'temp-customer-id' for now."
    echo ""
} >> "$OUTPUT_FILE"

if [ $FAIL_COUNT -eq 0 ]; then
    echo -e "${GREEN}✓ All tests PASSED${NC}"
    echo ""
    echo "Captured IDs for manual verification:"
    echo "  orderId1: $order_id_1"
    echo "  orderId2: $order_id_2"
    echo ""
    echo "Evidence saved to: $OUTPUT_FILE"
    exit 0
else
    echo -e "${RED}✗ Some tests FAILED${NC}"
    echo "Failed tests:"
    for test in "${FAILED_TESTS[@]}"; do
        echo -e "  ${RED}✗ $test${NC}"
    done
    echo ""
    echo "Evidence saved to: $OUTPUT_FILE"
    exit 1
fi



