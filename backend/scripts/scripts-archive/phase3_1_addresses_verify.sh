#!/bin/bash

# Phase 3.1 Acceptance Verification Script
# Tests Address APIs happy path and negative cases

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
OUTPUT_FILE="${OUTPUT_FILE:-docs/phase3_1_addresses_verify_output.txt}"
mkdir -p "$(dirname "$OUTPUT_FILE")"

# Check for JSON parser (prefer jq, fallback to node, then python)
if command -v jq &> /dev/null; then
    JSON_PARSER="jq"
    EXTRACT_ID='.data.id'
    EXTRACT_CODE='.code'
    EXTRACT_MESSAGE='.message'
    EXTRACT_IS_DEFAULT='.data.isDefault'
    EXTRACT_RECIPIENT_NAME='.data.recipientName'
    EXTRACT_DETAIL='.data.detail'
elif command -v node &> /dev/null; then
    JSON_PARSER="node"
    EXTRACT_ID='process.stdout.write(JSON.parse(require("fs").readFileSync(0, "utf-8")).data.id || "")'
    EXTRACT_CODE='process.stdout.write(JSON.parse(require("fs").readFileSync(0, "utf-8")).code?.toString() || "")'
    EXTRACT_MESSAGE='process.stdout.write(JSON.parse(require("fs").readFileSync(0, "utf-8")).message || "")'
    EXTRACT_IS_DEFAULT='const d=JSON.parse(require("fs").readFileSync(0, "utf-8")); process.stdout.write(d.data?.isDefault?.toString() || "")'
    EXTRACT_RECIPIENT_NAME='const d=JSON.parse(require("fs").readFileSync(0, "utf-8")); process.stdout.write(d.data?.recipientName || "")'
    EXTRACT_DETAIL='const d=JSON.parse(require("fs").readFileSync(0, "utf-8")); process.stdout.write(d.data?.detail || "")'
elif command -v python3 &> /dev/null; then
    JSON_PARSER="python3"
    EXTRACT_ID='import sys, json; print(json.load(sys.stdin).get("data", {}).get("id", ""), end="")'
    EXTRACT_CODE='import sys, json; print(str(json.load(sys.stdin).get("code", "")), end="")'
    EXTRACT_MESSAGE='import sys, json; print(json.load(sys.stdin).get("message", ""), end="")'
    EXTRACT_IS_DEFAULT='import sys, json; d=json.load(sys.stdin); print(str(d.get("data", {}).get("isDefault", False)), end="")'
    EXTRACT_RECIPIENT_NAME='import sys, json; d=json.load(sys.stdin); print(d.get("data", {}).get("recipientName", ""), end="")'
    EXTRACT_DETAIL='import sys, json; d=json.load(sys.stdin); print(d.get("data", {}).get("detail", ""), end="")'
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
echo "Phase 3.1 Address APIs Acceptance Verification"
echo "=========================================="
echo "Base URL: $API_BASE"
echo "JSON Parser: $JSON_PARSER"
echo "Output File: $OUTPUT_FILE"
echo ""

# Initialize output file
{
    echo "Phase 3.1 Address APIs Verification Output"
    echo "Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    echo "Base URL: $API_BASE"
    echo "JSON Parser: $JSON_PARSER"
    echo ""
} > "$OUTPUT_FILE"

# ==========================================
# Test A) Create Address
# ==========================================
echo "Test A) POST /api/v1/addresses - Create address with isDefault=true"

CREATE_ADDRESS_A_BODY='{
  "recipientName": "张三",
  "phone": "13800138000",
  "region": {
    "province": "广东省",
    "city": "深圳市",
    "district": "南山区"
  },
  "detail": "科技园南区123号",
  "isDefault": true
}'

response=$(http_request "POST" "${API_BASE}/addresses" "$CREATE_ADDRESS_A_BODY" "201") || {
    echo -e "${RED}✗ FAIL: Test A) Create address - http_request failed${NC}"
    ((FAIL_COUNT++)) || true
    FAILED_TESTS+=("Test A: Create address - http_request failed")
    exit 1
}

save_response "A) Create Address A" "$response"

address_id_a=$(extract_json "$EXTRACT_ID" "$response") || address_id_a=""
code=$(extract_json "$EXTRACT_CODE" "$response") || code=""
is_default=$(extract_json "$EXTRACT_IS_DEFAULT" "$response") || is_default=""

assert_test "Response code is 0" "[ \"$code\" = \"0\" ]"
assert_test "Response contains addressId" "[ -n \"$address_id_a\" ]"
assert_test "Address is set as default" "[ \"$is_default\" = \"true\" ]"

echo "  Captured addressIdA: $address_id_a"
echo ""

# ==========================================
# Test B) List Addresses
# ==========================================
echo "Test B) GET /api/v1/addresses - List addresses"

response=$(http_request "GET" "${API_BASE}/addresses" "" "200") || {
    echo -e "${RED}✗ FAIL: Test B) List addresses - http_request failed${NC}"
    ((FAIL_COUNT++)) || true
    FAILED_TESTS+=("Test B: List addresses - http_request failed")
    exit 1
}

save_response "B) List Addresses" "$response"

code=$(extract_json "$EXTRACT_CODE" "$response") || code=""

# Check if addressIdA is in the list
if [ "$JSON_PARSER" = "jq" ]; then
    address_list=$(echo "$response" | jq -r '.data[]?.id' 2>/dev/null || echo "")
    address_found=$(echo "$address_list" | grep -q "^${address_id_a}$" && echo "$address_id_a" || echo "")
elif [ "$JSON_PARSER" = "node" ]; then
    address_found=$(echo "$response" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf-8')); const arr=d.data||[]; const found=arr.find(a=>a.id==='$address_id_a'); process.stdout.write(found?.id||'')" 2>/dev/null || echo "")
else
    # Python fallback
    address_found=$(echo "$response" | python3 -c "import sys, json; d=json.load(sys.stdin); arr=d.get('data', []); addr=next((a for a in arr if a.get('id') == '$address_id_a'), None); print(addr.get('id', '') if addr else '', end='')" 2>/dev/null || echo "")
fi

assert_test "Response code is 0" "[ \"$code\" = \"0\" ]"
assert_test "List contains addressIdA" "[ -n \"$address_found\" ]"

echo "  Address list retrieved successfully"
echo ""

# ==========================================
# Test C) Default Uniqueness Sequence
# ==========================================
echo "Test C) Default uniqueness sequence"

# C1) Create Address B with isDefault=true
echo "  C1) Create Address B with isDefault=true"

CREATE_ADDRESS_B_BODY='{
  "recipientName": "李四",
  "phone": "13900139000",
  "region": {
    "province": "广东省",
    "city": "广州市",
    "district": "天河区"
  },
  "detail": "天河路456号",
  "isDefault": true
}'

response=$(http_request "POST" "${API_BASE}/addresses" "$CREATE_ADDRESS_B_BODY" "201") || {
    echo -e "${RED}✗ FAIL: Test C1) Create address B - http_request failed${NC}"
    ((FAIL_COUNT++)) || true
    FAILED_TESTS+=("Test C1: Create address B - http_request failed")
    exit 1
}

save_response "C1) Create Address B" "$response"

address_id_b=$(extract_json "$EXTRACT_ID" "$response") || address_id_b=""
code=$(extract_json "$EXTRACT_CODE" "$response") || code=""

assert_test "Address B created successfully" "[ \"$code\" = \"0\" ]"
assert_test "Address B ID extracted" "[ -n \"$address_id_b\" ]"

echo "    Captured addressIdB: $address_id_b"

# C2) List addresses and assert exactly one isDefault=true
echo "  C2) List addresses and verify exactly one default"

response=$(http_request "GET" "${API_BASE}/addresses" "" "200") || {
    echo -e "${RED}✗ FAIL: Test C2) List addresses - http_request failed${NC}"
    ((FAIL_COUNT++)) || true
    FAILED_TESTS+=("Test C2: List addresses - http_request failed")
    exit 1
}

save_response "C2) List Addresses After Creating B" "$response"

# Count defaults
if [ "$JSON_PARSER" = "jq" ]; then
    default_count=$(echo "$response" | jq -r '[.data[]? | select(.isDefault == true)] | length' 2>/dev/null || echo "0")
    address_a_default=$(echo "$response" | jq -r --arg id "$address_id_a" '.data[]? | select(.id == $id) | .isDefault' 2>/dev/null || echo "false")
    address_b_default=$(echo "$response" | jq -r --arg id "$address_id_b" '.data[]? | select(.id == $id) | .isDefault' 2>/dev/null || echo "false")
elif [ "$JSON_PARSER" = "node" ]; then
    # Node-based extraction for array responses
    default_count=$(echo "$response" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf-8')); const arr=d.data||[]; const count=arr.filter(a=>a.isDefault===true).length; process.stdout.write(count.toString())" 2>/dev/null || echo "0")
    address_a_default=$(echo "$response" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf-8')); const arr=d.data||[]; const addr=arr.find(a=>a.id==='$address_id_a'); process.stdout.write(addr?.isDefault?.toString()||'false')" 2>/dev/null || echo "false")
    address_b_default=$(echo "$response" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf-8')); const arr=d.data||[]; const addr=arr.find(a=>a.id==='$address_id_b'); process.stdout.write(addr?.isDefault?.toString()||'false')" 2>/dev/null || echo "false")
else
    # Python fallback
    default_count=$(echo "$response" | python3 -c "import sys, json; d=json.load(sys.stdin); arr=d.get('data', []); print(len([a for a in arr if a.get('isDefault') == True]), end='')" 2>/dev/null || echo "0")
    address_a_default=$(echo "$response" | python3 -c "import sys, json; d=json.load(sys.stdin); arr=d.get('data', []); addr=next((a for a in arr if a.get('id') == '$address_id_a'), None); print(str(addr.get('isDefault', False)).lower() if addr else 'false', end='')" 2>/dev/null || echo "false")
    address_b_default=$(echo "$response" | python3 -c "import sys, json; d=json.load(sys.stdin); arr=d.get('data', []); addr=next((a for a in arr if a.get('id') == '$address_id_b'), None); print(str(addr.get('isDefault', False)).lower() if addr else 'false', end='')" 2>/dev/null || echo "false")
fi

assert_test "Exactly one default address exists" "[ \"$default_count\" = \"1\" ]"
assert_test "Address B is default" "[ \"$address_b_default\" = \"true\" ]"
assert_test "Address A is not default" "[ \"$address_a_default\" = \"false\" ]"

echo "    Default count: $default_count"
echo "    Address A isDefault: $address_a_default"
echo "    Address B isDefault: $address_b_default"

# C3) Set Address A as default
echo "  C3) POST /api/v1/addresses/{addressIdA}/set-default"

response=$(http_request "POST" "${API_BASE}/addresses/${address_id_a}/set-default" "" "200") || {
    echo -e "${RED}✗ FAIL: Test C3) Set default - http_request failed${NC}"
    ((FAIL_COUNT++)) || true
    FAILED_TESTS+=("Test C3: Set default - http_request failed")
    exit 1
}

save_response "C3) Set Address A as Default" "$response"

code=$(extract_json "$EXTRACT_CODE" "$response") || code=""
is_default=$(extract_json "$EXTRACT_IS_DEFAULT" "$response") || is_default=""

assert_test "Set default response code is 0" "[ \"$code\" = \"0\" ]"
assert_test "Address A is now default" "[ \"$is_default\" = \"true\" ]"

# C4) List addresses and verify default uniqueness
echo "  C4) List addresses and verify default uniqueness after set-default"

response=$(http_request "GET" "${API_BASE}/addresses" "" "200") || {
    echo -e "${RED}✗ FAIL: Test C4) List addresses - http_request failed${NC}"
    ((FAIL_COUNT++)) || true
    FAILED_TESTS+=("Test C4: List addresses - http_request failed")
    exit 1
}

save_response "C4) List Addresses After Set-Default" "$response"

# Count defaults again
if [ "$JSON_PARSER" = "jq" ]; then
    default_count=$(echo "$response" | jq -r '[.data[]? | select(.isDefault == true)] | length' 2>/dev/null || echo "0")
    address_a_default=$(echo "$response" | jq -r --arg id "$address_id_a" '.data[]? | select(.id == $id) | .isDefault' 2>/dev/null || echo "false")
    address_b_default=$(echo "$response" | jq -r --arg id "$address_id_b" '.data[]? | select(.id == $id) | .isDefault' 2>/dev/null || echo "false")
elif [ "$JSON_PARSER" = "node" ]; then
    # Node-based extraction for array responses
    default_count=$(echo "$response" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf-8')); const arr=d.data||[]; const count=arr.filter(a=>a.isDefault===true).length; process.stdout.write(count.toString())" 2>/dev/null || echo "0")
    address_a_default=$(echo "$response" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf-8')); const arr=d.data||[]; const addr=arr.find(a=>a.id==='$address_id_a'); process.stdout.write(addr?.isDefault?.toString()||'false')" 2>/dev/null || echo "false")
    address_b_default=$(echo "$response" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf-8')); const arr=d.data||[]; const addr=arr.find(a=>a.id==='$address_id_b'); process.stdout.write(addr?.isDefault?.toString()||'false')" 2>/dev/null || echo "false")
else
    # Python fallback
    default_count=$(echo "$response" | python3 -c "import sys, json; d=json.load(sys.stdin); arr=d.get('data', []); print(len([a for a in arr if a.get('isDefault') == True]), end='')" 2>/dev/null || echo "0")
    address_a_default=$(echo "$response" | python3 -c "import sys, json; d=json.load(sys.stdin); arr=d.get('data', []); addr=next((a for a in arr if a.get('id') == '$address_id_a'), None); print(str(addr.get('isDefault', False)).lower() if addr else 'false', end='')" 2>/dev/null || echo "false")
    address_b_default=$(echo "$response" | python3 -c "import sys, json; d=json.load(sys.stdin); arr=d.get('data', []); addr=next((a for a in arr if a.get('id') == '$address_id_b'), None); print(str(addr.get('isDefault', False)).lower() if addr else 'false', end='')" 2>/dev/null || echo "false")
fi

assert_test "Exactly one default address exists" "[ \"$default_count\" = \"1\" ]"
assert_test "Address A is default" "[ \"$address_a_default\" = \"true\" ]"
assert_test "Address B is not default" "[ \"$address_b_default\" = \"false\" ]"

echo "    Default count: $default_count"
echo "    Address A isDefault: $address_a_default"
echo "    Address B isDefault: $address_b_default"
echo ""

# ==========================================
# Test D) Update Address
# ==========================================
echo "Test D) PUT /api/v1/addresses/:id - Update address"

UPDATE_ADDRESS_BODY='{
  "recipientName": "张三（更新）",
  "detail": "科技园南区456号（更新）"
}'

response=$(http_request "PUT" "${API_BASE}/addresses/${address_id_a}" "$UPDATE_ADDRESS_BODY" "200") || {
    echo -e "${RED}✗ FAIL: Test D) Update address - http_request failed${NC}"
    ((FAIL_COUNT++)) || true
    FAILED_TESTS+=("Test D: Update address - http_request failed")
    exit 1
}

save_response "D) Update Address A" "$response"

code=$(extract_json "$EXTRACT_CODE" "$response") || code=""
recipient_name=$(extract_json "$EXTRACT_RECIPIENT_NAME" "$response") || recipient_name=""
detail=$(extract_json "$EXTRACT_DETAIL" "$response") || detail=""

assert_test "Update response code is 0" "[ \"$code\" = \"0\" ]"
assert_test "Recipient name updated" "[ \"$recipient_name\" = \"张三（更新）\" ]"
assert_test "Detail updated" "[ \"$detail\" = \"科技园南区456号（更新）\" ]"

# Verify via list
echo "  Verifying update via list endpoint"

response=$(http_request "GET" "${API_BASE}/addresses" "" "200") || {
    echo -e "${RED}✗ FAIL: Test D) Verify update - http_request failed${NC}"
    ((FAIL_COUNT++)) || true
    FAILED_TESTS+=("Test D: Verify update - http_request failed")
    exit 1
}

if [ "$JSON_PARSER" = "jq" ]; then
    updated_recipient=$(echo "$response" | jq -r --arg id "$address_id_a" '.data[]? | select(.id == $id) | .recipientName' 2>/dev/null || echo "")
    updated_detail=$(echo "$response" | jq -r --arg id "$address_id_a" '.data[]? | select(.id == $id) | .detail' 2>/dev/null || echo "")
elif [ "$JSON_PARSER" = "node" ]; then
    updated_recipient=$(echo "$response" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf-8')); const arr=d.data||[]; const addr=arr.find(a=>a.id==='$address_id_a'); process.stdout.write(addr?.recipientName||'')" 2>/dev/null || echo "")
    updated_detail=$(echo "$response" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf-8')); const arr=d.data||[]; const addr=arr.find(a=>a.id==='$address_id_a'); process.stdout.write(addr?.detail||'')" 2>/dev/null || echo "")
else
    # Python fallback
    updated_recipient=$(echo "$response" | python3 -c "import sys, json; d=json.load(sys.stdin); arr=d.get('data', []); addr=next((a for a in arr if a.get('id') == '$address_id_a'), None); print(addr.get('recipientName', '') if addr else '', end='')" 2>/dev/null || echo "")
    updated_detail=$(echo "$response" | python3 -c "import sys, json; d=json.load(sys.stdin); arr=d.get('data', []); addr=next((a for a in arr if a.get('id') == '$address_id_a'), None); print(addr.get('detail', '') if addr else '', end='')" 2>/dev/null || echo "")
fi

assert_test "List shows updated recipient name" "[ \"$updated_recipient\" = \"张三（更新）\" ]"
assert_test "List shows updated detail" "[ \"$updated_detail\" = \"科技园南区456号（更新）\" ]"

echo "  Updated recipientName: $updated_recipient"
echo "  Updated detail: $updated_detail"
echo ""

# ==========================================
# Test E) NotFound Handling
# ==========================================
echo "Test E) NotFound handling for non-existent address"

fake_id="00000000-0000-0000-0000-000000000000"

# E1) PUT /addresses/{fakeId}
echo "  E1) PUT /api/v1/addresses/{fakeId}"

UPDATE_FAKE_BODY='{
  "recipientName": "测试"
}'

response=$(curl -s -w "\n%{http_code}" -X "PUT" \
    -H "Content-Type: application/json" \
    -d "$UPDATE_FAKE_BODY" \
    "${API_BASE}/addresses/${fake_id}") || {
    echo -e "${RED}✗ FAIL: Test E1) Update fake address - curl failed${NC}"
    ((FAIL_COUNT++)) || true
    FAILED_TESTS+=("Test E1: Update fake address - curl failed")
    exit 1
}

status_code=$(echo "$response" | tail -n1)
response_body=$(echo "$response" | sed '$d')

if [ "$status_code" = "000" ]; then
    echo -e "${RED}✗ FAIL: Test E1) Update fake address - connection failed${NC}"
    ((FAIL_COUNT++)) || true
    FAILED_TESTS+=("Test E1: Update fake address - connection failed")
    exit 1
fi

save_response "E1) Update Non-existent Address" "$response_body"

code=$(extract_json "$EXTRACT_CODE" "$response_body") || code=""
message=$(extract_json "$EXTRACT_MESSAGE" "$response_body") || message=""

assert_test "Update fake address returns error (code != 0)" "[ \"$code\" != \"0\" ]"
assert_test "Error code indicates not found (404)" "[ \"$code\" = \"404\" ]"

# E2) POST /addresses/{fakeId}/set-default
echo "  E2) POST /api/v1/addresses/{fakeId}/set-default"

response=$(curl -s -w "\n%{http_code}" -X "POST" \
    "${API_BASE}/addresses/${fake_id}/set-default") || {
    echo -e "${RED}✗ FAIL: Test E2) Set default fake address - curl failed${NC}"
    ((FAIL_COUNT++)) || true
    FAILED_TESTS+=("Test E2: Set default fake address - curl failed")
    exit 1
}

status_code=$(echo "$response" | tail -n1)
response_body=$(echo "$response" | sed '$d')

if [ "$status_code" = "000" ]; then
    echo -e "${RED}✗ FAIL: Test E2) Set default fake address - connection failed${NC}"
    ((FAIL_COUNT++)) || true
    FAILED_TESTS+=("Test E2: Set default fake address - connection failed")
    exit 1
fi

save_response "E2) Set-Default Non-existent Address" "$response_body"

code=$(extract_json "$EXTRACT_CODE" "$response_body") || code=""
message=$(extract_json "$EXTRACT_MESSAGE" "$response_body") || message=""

assert_test "Set default fake address returns error (code != 0)" "[ \"$code\" != \"0\" ]"
assert_test "Error code indicates not found (404)" "[ \"$code\" = \"404\" ]"

echo "  Fake ID used: $fake_id"
echo ""

# ==========================================
# Test F) DTO Validation (400)
# ==========================================
echo "Test F) DTO validation - Invalid request body"

# F1) Missing required fields
echo "  F1) POST /api/v1/addresses with missing required fields"

INVALID_ADDRESS_BODY='{
  "recipientName": "",
  "phone": ""
}'

response=$(curl -s -w "\n%{http_code}" -X "POST" \
    -H "Content-Type: application/json" \
    -d "$INVALID_ADDRESS_BODY" \
    "${API_BASE}/addresses") || {
    echo -e "${RED}✗ FAIL: Test F1) Invalid address - curl failed${NC}"
    ((FAIL_COUNT++)) || true
    FAILED_TESTS+=("Test F1: Invalid address - curl failed")
    exit 1
}

status_code=$(echo "$response" | tail -n1)
response_body=$(echo "$response" | sed '$d')

if [ "$status_code" = "000" ]; then
    echo -e "${RED}✗ FAIL: Test F1) Invalid address - connection failed${NC}"
    ((FAIL_COUNT++)) || true
    FAILED_TESTS+=("Test F1: Invalid address - connection failed")
    exit 1
fi

save_response "F1) Invalid Address (Missing Fields)" "$response_body"

# Validation errors typically return HTTP 400
# But our API might return 200 with code=400 in body
if [ "$status_code" = "400" ]; then
    assert_test "Invalid address returns HTTP 400" "true"
elif [ "$status_code" = "200" ]; then
    code=$(extract_json "$EXTRACT_CODE" "$response_body") || code=""
    assert_test "Invalid address returns error code 400" "[ \"$code\" = \"400\" ]"
else
    echo -e "${YELLOW}  Warning: Expected HTTP 400 or 200 with code=400, got $status_code${NC}"
    assert_test "Invalid address returns validation error" "false"
fi

# Ensure no 500 error
if [ "$status_code" = "500" ]; then
    echo -e "${RED}✗ FAIL: Test F1) Invalid address - got HTTP 500 (should not happen)${NC}"
    ((FAIL_COUNT++)) || true
    FAILED_TESTS+=("Test F1: Invalid address - HTTP 500 error")
fi

echo "  HTTP Status: $status_code"
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
    echo "  addressIdA: $address_id_a"
    echo "  addressIdB: $address_id_b"
    echo ""
} >> "$OUTPUT_FILE"

if [ $FAIL_COUNT -eq 0 ]; then
    echo -e "${GREEN}✓ All tests PASSED${NC}"
    echo ""
    echo "Captured IDs for manual verification:"
    echo "  addressIdA: $address_id_a"
    echo "  addressIdB: $address_id_b"
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




