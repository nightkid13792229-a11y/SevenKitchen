#!/bin/bash

# Doctor script to diagnose miniapp setup issues
# Checks backend connectivity, build output, and configuration
# This is the "One-Command Dev Verification Flow"

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Get the script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}SevenKitchen Miniapp Doctor${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"

ISSUES=0
WARNINGS=0
CRITICAL_FAIL=0

# Check 1: Default BASE_URL configuration
echo -e "${BLUE}[1/7]${NC} Checking BASE_URL configuration..."
DEFAULT_URL="http://127.0.0.1:3000/api/v1"
if grep -q "127.0.0.1" src/utils/config.ts 2>/dev/null; then
    echo -e "${GREEN}✓${NC} BASE_URL uses 127.0.0.1 (WeChat DevTools compatible)"
else
    echo -e "${RED}✗${NC} BASE_URL does not use 127.0.0.1 - may cause connection issues"
    ISSUES=$((ISSUES + 1))
    CRITICAL_FAIL=1
fi

# Check BASE_URL resolution logic
if grep -q "getBaseUrl" src/utils/api.ts 2>/dev/null && grep -q "getBaseUrl" src/utils/config.ts 2>/dev/null; then
    echo -e "${GREEN}✓${NC} BASE_URL resolution uses storage-first pattern"
else
    echo -e "${RED}✗${NC} BASE_URL resolution pattern not found"
    ISSUES=$((ISSUES + 1))
    CRITICAL_FAIL=1
fi
echo ""

# Check 2: Backend health endpoint
echo -e "${BLUE}[2/7]${NC} Testing backend health endpoint..."
BACKEND_URL="http://127.0.0.1:3000"
HEALTH_URL="$BACKEND_URL/api/v1/health"

if command -v curl &> /dev/null; then
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 "$HEALTH_URL" 2>/dev/null || echo "000")
    HTTP_BODY=$(curl -s --max-time 3 "$HEALTH_URL" 2>/dev/null || echo "")
    
    if [ "$HTTP_CODE" == "200" ]; then
        if echo "$HTTP_BODY" | grep -q "status.*ok" 2>/dev/null; then
            echo -e "${GREEN}✓${NC} Backend health endpoint is healthy: $HEALTH_URL"
        else
            echo -e "${YELLOW}⚠${NC} Backend responded 200 but unexpected format"
            WARNINGS=$((WARNINGS + 1))
        fi
    elif [ "$HTTP_CODE" == "000" ]; then
        echo -e "${RED}✗${NC} Backend is NOT reachable at $BACKEND_URL"
        echo -e "${RED}  CRITICAL: Cannot proceed without backend${NC}"
        echo -e "${YELLOW}  Action: Start the backend server:${NC}"
        echo -e "    cd backend && pnpm start:dev"
        ISSUES=$((ISSUES + 1))
        CRITICAL_FAIL=1
    elif [ "$HTTP_CODE" == "404" ]; then
        echo -e "${YELLOW}⚠${NC} Health endpoint not found (404) - backend may be running but endpoint missing"
        WARNINGS=$((WARNINGS + 1))
    else
        echo -e "${YELLOW}⚠${NC} Backend responded with HTTP $HTTP_CODE"
        WARNINGS=$((WARNINGS + 1))
    fi
else
    echo -e "${RED}✗${NC} curl not found - cannot test backend connectivity"
    echo -e "${YELLOW}  Install curl or test manually${NC}"
    ISSUES=$((ISSUES + 1))
fi
echo ""

# Check 3: JWT login availability
echo -e "${BLUE}[3/7]${NC} Testing JWT login endpoint..."
LOGIN_URL="$BACKEND_URL/api/v1/auth/login"
LOGIN_PAYLOAD='{"customerId":"mvp-user-001"}'

if command -v curl &> /dev/null; then
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 \
        -X POST \
        -H "Content-Type: application/json" \
        -d "$LOGIN_PAYLOAD" \
        "$LOGIN_URL" 2>/dev/null || echo "000")
    HTTP_BODY=$(curl -s --max-time 3 \
        -X POST \
        -H "Content-Type: application/json" \
        -d "$LOGIN_PAYLOAD" \
        "$LOGIN_URL" 2>/dev/null || echo "")
    
    if [ "$HTTP_CODE" == "200" ] || [ "$HTTP_CODE" == "201" ]; then
        if echo "$HTTP_BODY" | grep -q "token" 2>/dev/null || echo "$HTTP_BODY" | grep -q '"code":0' 2>/dev/null; then
            echo -e "${GREEN}✓${NC} JWT login endpoint is available and working"
        else
            echo -e "${YELLOW}⚠${NC} Login endpoint responded but format may be unexpected"
            WARNINGS=$((WARNINGS + 1))
        fi
    elif [ "$HTTP_CODE" == "000" ]; then
        echo -e "${RED}✗${NC} Cannot reach login endpoint (backend not running?)"
        ISSUES=$((ISSUES + 1))
        CRITICAL_FAIL=1
    elif [ "$HTTP_CODE" == "404" ]; then
        echo -e "${RED}✗${NC} Login endpoint not found (404) - API may be misconfigured"
        ISSUES=$((ISSUES + 1))
        CRITICAL_FAIL=1
    else
        echo -e "${YELLOW}⚠${NC} Login endpoint responded with HTTP $HTTP_CODE"
        echo -e "${YELLOW}  Response: ${HTTP_BODY:0:100}${NC}"
        WARNINGS=$((WARNINGS + 1))
    fi
else
    echo -e "${YELLOW}⚠${NC} curl not found - skipping login test"
    WARNINGS=$((WARNINGS + 1))
fi
echo ""

# Check 4: BASE_URL resolution (storage vs default)
echo -e "${BLUE}[4/7]${NC} Checking BASE_URL resolution logic..."
if grep -q "getStorageSync.*api_base_url" src/utils/config.ts 2>/dev/null; then
    echo -e "${GREEN}✓${NC} BASE_URL can be overridden via storage (runtime config)"
else
    echo -e "${YELLOW}⚠${NC} Storage-based BASE_URL override not found"
    WARNINGS=$((WARNINGS + 1))
fi
echo ""

# Check 5: Build output directories (which dist directory to import)
echo -e "${BLUE}[5/7]${NC} Checking build output directories..."

DEV_DIR="$PROJECT_ROOT/dist/dev/mp-weixin"
BUILD_DIR="$PROJECT_ROOT/dist/build/mp-weixin"

DEV_EXISTS=0
BUILD_EXISTS=0

if [ -d "$DEV_DIR" ] && [ -f "$DEV_DIR/app.json" ]; then
    echo -e "${GREEN}✓${NC} Development build exists: $DEV_DIR"
    echo -e "   ${BLUE}→ IMPORT THIS for dev mode (watch): ${GREEN}$DEV_DIR${NC}"
    DEV_EXISTS=1
else
    echo -e "${YELLOW}⚠${NC} Development build not found: $DEV_DIR"
    echo -e "   ${BLUE}→ Run: pnpm dev:mp-weixin${NC}"
    echo -e "   ${RED}→ DO NOT open dist/build/mp-weixin for development${NC}"
    WARNINGS=$((WARNINGS + 1))
fi

if [ -d "$BUILD_DIR" ] && [ -f "$BUILD_DIR/app.json" ]; then
    echo -e "${GREEN}✓${NC} Production build exists: $BUILD_DIR"
    echo -e "   ${BLUE}→ Use this for production testing only${NC}"
    BUILD_EXISTS=1
else
    echo -e "${YELLOW}⚠${NC} Production build not found: $BUILD_DIR"
    echo -e "   ${BLUE}→ Run: pnpm build:mp-weixin${NC}"
    WARNINGS=$((WARNINGS + 1))
fi

# Determine which directory should be imported
if [ $DEV_EXISTS -eq 1 ]; then
    echo -e "${GREEN}  → Import directory for dev: ${DEV_DIR}${NC}"
elif [ $BUILD_EXISTS -eq 1 ]; then
    echo -e "${YELLOW}  → Only production build available: ${BUILD_DIR}${NC}"
    echo -e "${YELLOW}  → For development, run: pnpm dev:mp-weixin${NC}"
else
    echo -e "${RED}  → No build output found - run build first${NC}"
    ISSUES=$((ISSUES + 1))
fi
echo ""

# Check 6: Required files
echo -e "${BLUE}[6/7]${NC} Checking project structure..."
REQUIRED_FILES=("src/pages.json" "src/App.vue" "src/main.ts" "package.json")
MISSING=0

for file in "${REQUIRED_FILES[@]}"; do
    if [ -f "$PROJECT_ROOT/$file" ]; then
        echo -e "${GREEN}✓${NC} $file"
    else
        echo -e "${RED}✗${NC} $file (missing)"
        MISSING=$((MISSING + 1))
    fi
done

if [ $MISSING -gt 0 ]; then
    ISSUES=$((ISSUES + MISSING))
fi
echo ""

# Check 7: Network Settings page and runtime config
echo -e "${BLUE}[7/7]${NC} Checking Network Settings page..."
if [ -f "$PROJECT_ROOT/src/pages/network-settings/index.vue" ]; then
    echo -e "${GREEN}✓${NC} Network Settings page exists"
    echo -e "   ${BLUE}→ Use this to change BASE_URL at runtime without rebuild${NC}"
else
    echo -e "${RED}✗${NC} Network Settings page not found"
    ISSUES=$((ISSUES + 1))
    CRITICAL_FAIL=1
fi
echo ""

# Summary
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Summary${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"

if [ $CRITICAL_FAIL -eq 1 ]; then
    echo -e "${RED}✗ CRITICAL ISSUES FOUND - Cannot proceed safely${NC}\n"
    echo -e "${RED}Fix the critical issues above before running the miniapp.${NC}\n"
    exit 1
elif [ $ISSUES -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}✓ All checks passed! Ready for real user verification.${NC}\n"
    echo -e "Next steps:"
    if [ $DEV_EXISTS -eq 1 ]; then
        echo -e "1. ${BLUE}bash scripts/open-devtools.sh dev${NC}  (for development)"
    fi
    if [ $BUILD_EXISTS -eq 1 ]; then
        echo -e "2. ${BLUE}bash scripts/open-devtools.sh build${NC}  (for production)"
    fi
    echo -e "3. Open WeChat DevTools and import the directory shown above"
    echo -e "4. Enable 'Do not verify valid domain names' in DevTools settings"
    exit 0
elif [ $ISSUES -eq 0 ]; then
    echo -e "${YELLOW}⚠ $WARNINGS warning(s) found (non-critical)${NC}\n"
    echo -e "${GREEN}Miniapp should work, but review warnings above.${NC}\n"
    exit 0
else
    echo -e "${RED}✗ $ISSUES issue(s) found, $WARNINGS warning(s)${NC}\n"
    echo -e "${YELLOW}Please fix the issues above before proceeding.${NC}\n"
    exit 1
fi
