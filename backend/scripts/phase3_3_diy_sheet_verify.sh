#!/bin/bash

# Phase 3.3 Acceptance Verification Script
# Tests POST /api/v1/recipes/:id/diy-sheet endpoint

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
OUTPUT_FILE="${OUTPUT_FILE:-docs/phase3_3_diy_sheet_verify_output.txt}"
mkdir -p "$(dirname "$OUTPUT_FILE")"

# Check for JSON parser (prefer jq, fallback to node, then python)
if command -v jq &> /dev/null; then
    JSON_PARSER="jq"
    EXTRACT_CODE='.code'
    EXTRACT_MESSAGE='.message'
    EXTRACT_RECIPE_ID='.data.recipeId'
    EXTRACT_RECIPE_NAME='.data.recipeName'
    EXTRACT_STEPS='.data.steps'
    EXTRACT_RECOMMENDED_INTAKE='.data.recommendedDailyIntakeG'
elif command -v node &> /dev/null; then
    JSON_PARSER="node"
    EXTRACT_CODE='process.stdout.write(JSON.parse(require("fs").readFileSync(0, "utf-8")).code?.toString() || "")'
    EXTRACT_MESSAGE='process.stdout.write(JSON.parse(require("fs").readFileSync(0, "utf-8")).message || "")'
    EXTRACT_RECIPE_ID='process.stdout.write(JSON.parse(require("fs").readFileSync(0, "utf-8")).data?.recipeId || "")'
    EXTRACT_RECIPE_NAME='process.stdout.write(JSON.parse(require("fs").readFileSync(0, "utf-8")).data?.recipeName || "")'
    EXTRACT_STEPS='const d=JSON.parse(require("fs").readFileSync(0, "utf-8")); process.stdout.write(JSON.stringify(d.data?.steps || []))'
    EXTRACT_RECOMMENDED_INTAKE='const d=JSON.parse(require("fs").readFileSync(0, "utf-8")); process.stdout.write(d.data?.recommendedDailyIntakeG?.toString() || "")'
elif command -v python3 &> /dev/null; then
    JSON_PARSER="python3"
    EXTRACT_CODE='import sys, json; print(str(json.load(sys.stdin).get("code", "")), end="")'
    EXTRACT_MESSAGE='import sys, json; print(json.load(sys.stdin).get("message", ""), end="")'
    EXTRACT_RECIPE_ID='import sys, json; print(json.load(sys.stdin).get("data", {}).get("recipeId", ""), end="")'
    EXTRACT_RECIPE_NAME='import sys, json; print(json.load(sys.stdin).get("data", {}).get("recipeName", ""), end="")'
    EXTRACT_STEPS='import sys, json; d=json.load(sys.stdin); print(json.dumps(d.get("data", {}).get("steps", [])), end="")'
    EXTRACT_RECOMMENDED_INTAKE='import sys, json; d=json.load(sys.stdin); print(str(d.get("data", {}).get("recommendedDailyIntakeG", "")), end="")'
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
echo "Phase 3.3 DIY Sheet API Acceptance Verification"
echo "=========================================="
echo "Base URL: $API_BASE"
echo "JSON Parser: $JSON_PARSER"
echo "Output File: $OUTPUT_FILE"
echo ""

# Initialize output file
{
    echo "Phase 3.3 DIY Sheet API Verification Output"
    echo "Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    echo "Base URL: $API_BASE"
    echo "JSON Parser: $JSON_PARSER"
    echo ""
} > "$OUTPUT_FILE"

# Recipe ID seeded in AppModule.onModuleInit
SEEDED_RECIPE_ID="3fa85f64-5717-4562-b3fc-2c963f66afa7"

# ==========================================
# Test a) POST /recipes/:id/diy-sheet success
# ==========================================
echo "Test a) POST /api/v1/recipes/:id/diy-sheet - Success (no dogId)"

DIY_SHEET_BODY='{}'

response=$(http_request "POST" "${API_BASE}/recipes/${SEEDED_RECIPE_ID}/diy-sheet" "$DIY_SHEET_BODY" "200") || {
    echo -e "${RED}✗ FAIL: Test a) Generate DIY sheet - http_request failed${NC}"
    ((FAIL_COUNT++)) || true
    FAILED_TESTS+=("Test a: Generate DIY sheet - http_request failed")
    exit 1
}

save_response "a) POST /recipes/:id/diy-sheet Success" "$response"

code=$(extract_json "$EXTRACT_CODE" "$response") || code=""
recipe_id=$(extract_json "$EXTRACT_RECIPE_ID" "$response") || recipe_id=""
recipe_name=$(extract_json "$EXTRACT_RECIPE_NAME" "$response") || recipe_name=""

# Check if steps array exists and has items
if [ "$JSON_PARSER" = "jq" ]; then
    steps_count=$(echo "$response" | jq -r '.data.steps | length' 2>/dev/null || echo "0")
    has_steps=$(echo "$response" | jq -r 'if .data.steps != null and (.data.steps | type == "array") then "true" else "false" end' 2>/dev/null || echo "false")
elif [ "$JSON_PARSER" = "node" ]; then
    steps_count=$(echo "$response" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf-8')); process.stdout.write((d.data?.steps||[]).length.toString())" 2>/dev/null || echo "0")
    has_steps=$(echo "$response" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf-8')); process.stdout.write(Array.isArray(d.data?.steps) ? 'true' : 'false')" 2>/dev/null || echo "false")
else
    steps_count=$(echo "$response" | python3 -c "import sys, json; d=json.load(sys.stdin); print(len(d.get('data', {}).get('steps', [])), end='')" 2>/dev/null || echo "0")
    has_steps=$(echo "$response" | python3 -c "import sys, json; d=json.load(sys.stdin); print('true' if isinstance(d.get('data', {}).get('steps'), list) else 'false', end='')" 2>/dev/null || echo "false")
fi

assert_test "Response code is 0" "[ \"$code\" = \"0\" ]"
assert_test "Response contains recipeId" "[ -n \"$recipe_id\" ]"
assert_test "Response contains recipeName" "[ -n \"$recipe_name\" ]"
assert_test "Response contains steps array" "[ \"$has_steps\" = \"true\" ]"
assert_test "Steps array has at least 1 step" "[ \"$steps_count\" -ge 1 ]"

echo "  Response code: $code"
echo "  Recipe ID: $recipe_id"
echo "  Recipe Name: $recipe_name"
echo "  Steps count: $steps_count"
echo ""

# ==========================================
# Test b) POST /recipes/:id/diy-sheet NotFound
# ==========================================
echo "Test b) POST /api/v1/recipes/:id/diy-sheet - NotFound (invalid recipeId)"

NON_EXISTENT_RECIPE_ID="00000000-0000-0000-0000-000000000000"

response=$(http_request "POST" "${API_BASE}/recipes/${NON_EXISTENT_RECIPE_ID}/diy-sheet" "$DIY_SHEET_BODY" "200") || {
    echo -e "${RED}✗ FAIL: Test b) NotFound - http_request failed${NC}"
    ((FAIL_COUNT++)) || true
    FAILED_TESTS+=("Test b: NotFound - http_request failed")
    exit 1
}

save_response "b) POST /recipes/:id/diy-sheet NotFound" "$response"

code=$(extract_json "$EXTRACT_CODE" "$response") || code=""
message=$(extract_json "$EXTRACT_MESSAGE" "$response") || message=""

assert_test "Response code is 404" "[ \"$code\" = \"404\" ]"
# Check if message contains "Recipe not found" (case insensitive)
if echo "$message" | grep -qi "recipe not found"; then
    assert_test "Error message contains 'Recipe not found'" "true"
else
    assert_test "Error message contains 'Recipe not found'" "false"
fi

echo "  Response code: $code"
echo "  Error message: $message"
echo ""

# ==========================================
# Test c) POST /recipes/:id/diy-sheet Validation
# ==========================================
echo "Test c) POST /api/v1/recipes/:id/diy-sheet - Validation (invalid dogId format)"

INVALID_DOG_ID_BODY='{"dogId": "invalid-uuid"}'

response=$(curl -s -w "\n%{http_code}" -X "POST" \
    -H "Content-Type: application/json" \
    -d "$INVALID_DOG_ID_BODY" \
    "${API_BASE}/recipes/${SEEDED_RECIPE_ID}/diy-sheet") || {
    echo -e "${RED}✗ FAIL: Test c) Validation - curl failed${NC}"
    ((FAIL_COUNT++)) || true
    FAILED_TESTS+=("Test c: Validation - curl failed")
    exit 1
}

status_code=$(echo "$response" | tail -n1)
response_body=$(echo "$response" | sed '$d')

if [ "$status_code" = "000" ]; then
    echo -e "${RED}✗ FAIL: Test c) Validation - connection failed${NC}"
    ((FAIL_COUNT++)) || true
    FAILED_TESTS+=("Test c: Validation - connection failed")
    exit 1
fi

save_response "c) POST /recipes/:id/diy-sheet Validation Error" "$response_body"

# Validation errors typically return HTTP 400
if [ "$status_code" = "400" ]; then
    assert_test "Invalid dogId returns HTTP 400" "true"
elif [ "$status_code" = "200" ]; then
    code=$(extract_json "$EXTRACT_CODE" "$response_body") || code=""
    assert_test "Invalid dogId returns error code 400" "[ \"$code\" = \"400\" ]"
else
    echo -e "${YELLOW}  Warning: Expected HTTP 400 or 200 with code=400, got $status_code${NC}"
    assert_test "Invalid dogId returns validation error" "false"
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
    echo "Note: dogId personalization test not included in script."
    echo "      This feature is implemented but requires a valid dogId."
    echo "      Unit tests verify this functionality."
    echo ""
} >> "$OUTPUT_FILE"

if [ $FAIL_COUNT -eq 0 ]; then
    echo -e "${GREEN}✓ All tests PASSED${NC}"
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



