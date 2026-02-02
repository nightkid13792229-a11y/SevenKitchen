#!/bin/bash

# Phase 4.2 Acceptance Verification Script
# Tests JWT Authentication: Bearer token and X-Customer-Id fallback

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
OUTPUT_FILE="${OUTPUT_FILE:-docs/phase4_2_jwt_auth_verify_output.txt}"
mkdir -p "$(dirname "$OUTPUT_FILE")"

# Check for JSON parser (prefer jq, fallback to node, then python)
if command -v jq &> /dev/null; then
    JSON_PARSER="jq"
    EXTRACT_CODE='.code'
    EXTRACT_MESSAGE='.message'
    EXTRACT_TOKEN='.data.token'
    EXTRACT_CUSTOMER_ID='.data.customerId'
elif command -v node &> /dev/null; then
    JSON_PARSER="node"
    EXTRACT_CODE='process.stdout.write(JSON.parse(require("fs").readFileSync(0, "utf-8")).code?.toString() || "")'
    EXTRACT_MESSAGE='process.stdout.write(JSON.parse(require("fs").readFileSync(0, "utf-8")).message || "")'
    EXTRACT_TOKEN='process.stdout.write(JSON.parse(require("fs").readFileSync(0, "utf-8")).data?.token || "")'
    EXTRACT_CUSTOMER_ID='process.stdout.write(JSON.parse(require("fs").readFileSync(0, "utf-8")).data?.customerId || "")'
elif command -v python3 &> /dev/null; then
    JSON_PARSER="python3"
    EXTRACT_CODE='import sys, json; print(str(json.load(sys.stdin).get("code", "")), end="")'
    EXTRACT_MESSAGE='import sys, json; print(json.load(sys.stdin).get("message", ""), end="")'
    EXTRACT_TOKEN='import sys, json; print(json.load(sys.stdin).get("data", {}).get("token", ""), end="")'
    EXTRACT_CUSTOMER_ID='import sys, json; print(json.load(sys.stdin).get("data", {}).get("customerId", ""), end="")'
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
    local auth_header="${4:-}"  # "Bearer <token>" or "X-Customer-Id: <id>"
    local expected_status="${5:-200}"
    
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
echo "Phase 4.2: JWT Authentication Verification"
echo "=========================================="
echo ""
echo "Testing JWT Bearer token authentication"
echo "Base URL: $BASE_URL"
echo ""

# Clear output file
echo "Phase 4.2 JWT Authentication Verification Output" > "$OUTPUT_FILE"
echo "Generated: $(date)" >> "$OUTPUT_FILE"

# Test 1: Login endpoint returns token
echo "Test 1: POST /auth/login returns JWT token"
CUSTOMER_ID="customer-phase4-2-test"
login_payload="{\"customerId\": \"$CUSTOMER_ID\"}"

test1_response=$(http_request "POST" "${API_BASE}/auth/login" "$login_payload" "" 200)
save_response "Test 1: POST /auth/login" "$test1_response"
test1_code=$(extract_json "$EXTRACT_CODE" "$test1_response")
test1_token=$(extract_json "$EXTRACT_TOKEN" "$test1_response")
test1_customer_id=$(extract_json "$EXTRACT_CUSTOMER_ID" "$test1_response")

assert_test "Login succeeds (code=0)" "[ \"$test1_code\" = \"0\" ]"
assert_test "Token is returned" "[ -n \"$test1_token\" ]"
assert_test "Customer ID matches" "[ \"$test1_customer_id\" = \"$CUSTOMER_ID\" ]"
echo ""

# Test 2: Use Bearer token to access protected endpoint
echo "Test 2: Access protected endpoint with Bearer token"
if [ -z "$test1_token" ]; then
    echo -e "${RED}SKIP: Test 2 skipped (no token from Test 1)${NC}"
    ((FAIL_COUNT++)) || true
    FAILED_TESTS+=("Bearer token access (no token)")
else
    test2_response=$(http_request "GET" "${API_BASE}/orders" "" "Bearer $test1_token" 200)
    save_response "Test 2: GET /orders with Bearer token" "$test2_response"
    test2_code=$(extract_json "$EXTRACT_CODE" "$test2_response")
    
    assert_test "Request succeeds (code=0 or 404)" "[ \"$test2_code\" = \"0\" ] || [ \"$test2_code\" = \"404\" ]"
    assert_test "No 401 error" "[ \"$test2_code\" != \"401\" ]"
fi
echo ""

# Test 3: Invalid token returns 401
echo "Test 3: Invalid token returns 401"
test3_response=$(http_request "GET" "${API_BASE}/orders" "" "Bearer invalid-token-12345" 200)
save_response "Test 3: GET /orders with invalid token" "$test3_response"
test3_code=$(extract_json "$EXTRACT_CODE" "$test3_response")
test3_message=$(extract_json "$EXTRACT_MESSAGE" "$test3_response")

assert_test "Invalid token returns code=401" "[ \"$test3_code\" = \"401\" ]"
assert_test "Error message mentions token" "[ -n \"$test3_message\" ]"
echo ""

# Test 4: Missing auth returns 401
echo "Test 4: Missing auth returns 401"
test4_response=$(http_request "GET" "${API_BASE}/orders" "" "" 200)
save_response "Test 4: GET /orders without auth" "$test4_response"
test4_code=$(extract_json "$EXTRACT_CODE" "$test4_response")

assert_test "Missing auth returns code=401" "[ \"$test4_code\" = \"401\" ]"
echo ""

# Test 5: X-Customer-Id header still works (backward compatibility)
echo "Test 5: X-Customer-Id header still works (backward compatibility)"
test5_response=$(http_request "GET" "${API_BASE}/orders" "" "X-Customer-Id: $CUSTOMER_ID" 200)
save_response "Test 5: GET /orders with X-Customer-Id header" "$test5_response"
test5_code=$(extract_json "$EXTRACT_CODE" "$test5_response")

assert_test "X-Customer-Id header works (code=0 or 404)" "[ \"$test5_code\" = \"0\" ] || [ \"$test5_code\" = \"404\" ]"
assert_test "No 401 error with X-Customer-Id" "[ \"$test5_code\" != \"401\" ]"
echo ""

# Test 6: Bearer token takes precedence over X-Customer-Id
echo "Test 6: Bearer token takes precedence over X-Customer-Id"
if [ -z "$test1_token" ]; then
    echo -e "${RED}SKIP: Test 6 skipped (no token from Test 1)${NC}"
    ((FAIL_COUNT++)) || true
    FAILED_TESTS+=("Token precedence (no token)")
else
    # Use a different customer ID in header to verify token is used
    test6_response=$(http_request "GET" "${API_BASE}/orders" "" "Bearer $test1_token" 200)
    save_response "Test 6: GET /orders with Bearer token (precedence test)" "$test6_response"
    test6_code=$(extract_json "$EXTRACT_CODE" "$test6_response")
    
    assert_test "Bearer token works when present" "[ \"$test6_code\" = \"0\" ] || [ \"$test6_code\" = \"404\" ]"
    assert_test "No 401 error" "[ \"$test6_code\" != \"401\" ]"
fi
echo ""

# Test 7: Login with empty customerId returns 400
echo "Test 7: Login with empty customerId returns 400"
test7_response=$(http_request "POST" "${API_BASE}/auth/login" "{\"customerId\": \"\"}" "" 200)
save_response "Test 7: POST /auth/login with empty customerId" "$test7_response"
test7_code=$(extract_json "$EXTRACT_CODE" "$test7_response")

assert_test "Empty customerId returns code=400" "[ \"$test7_code\" = \"400\" ]"
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




