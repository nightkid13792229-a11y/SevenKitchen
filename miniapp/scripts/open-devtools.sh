#!/bin/bash

# Script to show the exact directory to import in WeChat Developer Tools
# Usage: bash scripts/open-devtools.sh [dev|build]

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

# Determine build type (default to dev)
BUILD_TYPE="${1:-dev}"

if [ "$BUILD_TYPE" != "dev" ] && [ "$BUILD_TYPE" != "build" ]; then
    echo -e "${RED}Error: Build type must be 'dev' or 'build'${NC}"
    echo -e "Usage: bash scripts/open-devtools.sh [dev|build]"
    exit 1
fi

# Set output directory based on build type
if [ "$BUILD_TYPE" == "dev" ]; then
    OUTPUT_DIR="$PROJECT_ROOT/dist/dev/mp-weixin"
    BUILD_NAME="Development"
else
    OUTPUT_DIR="$PROJECT_ROOT/dist/build/mp-weixin"
    BUILD_NAME="Production"
fi

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}WeChat Developer Tools - Import Directory${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"

echo -e "${YELLOW}Build Type:${NC} $BUILD_NAME"
echo -e "${YELLOW}Import Directory:${NC}"
echo -e "${GREEN}$OUTPUT_DIR${NC}\n"

# Check if directory exists
if [ ! -d "$OUTPUT_DIR" ]; then
    echo -e "${RED}⚠ Warning: Directory does not exist yet!${NC}\n"
    echo -e "Please run one of the following first:"
    if [ "$BUILD_TYPE" == "dev" ]; then
        echo -e "  ${BLUE}pnpm dev:mp-weixin${NC}  (development with watch)"
        echo -e "  ${BLUE}bash scripts/mp-weixin-dev.sh${NC}"
    else
        echo -e "  ${BLUE}pnpm build:mp-weixin${NC}  (production build)"
        echo -e "  ${BLUE}bash scripts/mp-weixin-verify.sh${NC}"
    fi
    echo ""
    exit 1
fi

# Check if app.json exists (required file)
if [ ! -f "$OUTPUT_DIR/app.json" ]; then
    echo -e "${RED}⚠ Warning: app.json not found in output directory!${NC}\n"
    echo -e "The build may be incomplete. Please rebuild the project."
    echo ""
    exit 1
fi

echo -e "${GREEN}✓${NC} Directory exists and appears valid\n"

echo -e "${BLUE}Instructions:${NC}"
echo -e "1. Open WeChat Developer Tools (微信开发者工具)"
echo -e "2. Click 'Import Project' (导入项目)"
echo -e "3. Select this directory:"
echo -e "   ${GREEN}$OUTPUT_DIR${NC}"
echo -e "4. In Project Settings, enable:"
echo -e "   ${YELLOW}'Do not verify valid domain names'${NC}"
echo -e "   (不校验合法域名)\n"

# Try to auto-open on macOS (optional)
if [[ "$OSTYPE" == "darwin"* ]]; then
    if command -v open &> /dev/null; then
        echo -e "${BLUE}Attempting to open WeChat Developer Tools...${NC}"
        open -a "wechatwebdevtools" "$OUTPUT_DIR" 2>/dev/null || {
            echo -e "${YELLOW}Could not auto-open. Please open manually.${NC}\n"
        }
    fi
fi

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
