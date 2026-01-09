#!/bin/bash

# Uni-app WeChat Mini Program Production Build Script
# This script builds the Uni-app project for production

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get the script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

echo -e "${BLUE}=== Uni-app WeChat Mini Program Production Build ===${NC}\n"

# Detect package manager
if command -v pnpm &> /dev/null; then
    PKG_MANAGER="pnpm"
    echo -e "${GREEN}✓${NC} Using pnpm"
elif command -v npm &> /dev/null; then
    PKG_MANAGER="npm"
    echo -e "${GREEN}✓${NC} Using npm"
else
    echo -e "${YELLOW}✗${NC} Neither pnpm nor npm found. Please install one of them."
    exit 1
fi

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing dependencies...${NC}"
    $PKG_MANAGER install
    echo -e "${GREEN}✓${NC} Dependencies installed\n"
fi

# Build for WeChat Mini Program
echo -e "${BLUE}Building for WeChat Mini Program (mp-weixin)...${NC}\n"

$PKG_MANAGER run build:mp-weixin

# Check if build output exists
OUTPUT_DIR="$PROJECT_ROOT/dist/build/mp-weixin"

if [ -d "$OUTPUT_DIR" ] && [ -f "$OUTPUT_DIR/app.json" ]; then
    echo -e "\n${GREEN}✓${NC} Build successful!\n"
    
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}Production build output:${NC}"
    echo -e "${YELLOW}$OUTPUT_DIR${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
    
    echo -e "${GREEN}You can now upload this directory to WeChat Developer Tools for release.${NC}\n"
else
    echo -e "\n${YELLOW}⚠ Build output not found at expected location: $OUTPUT_DIR${NC}"
    echo -e "${YELLOW}Please check the build output above for errors.${NC}\n"
    exit 1
fi



