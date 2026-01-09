#!/bin/bash

# Uni-app WeChat Mini Program Build Verification Script
# This script runs a one-shot build and verifies the output structure

set -e

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get the script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

echo -e "${BLUE}=== Uni-app WeChat Mini Program Build Verification ===${NC}\n"

# Detect package manager
if command -v pnpm &> /dev/null; then
    PKG_MANAGER="pnpm"
    echo -e "${GREEN}✓${NC} Using pnpm"
elif command -v npm &> /dev/null; then
    PKG_MANAGER="npm"
    echo -e "${GREEN}✓${NC} Using npm"
else
    echo -e "${RED}✗${NC} Neither pnpm nor npm found. Please install one of them."
    exit 1
fi

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing dependencies...${NC}"
    $PKG_MANAGER install
    echo -e "${GREEN}✓${NC} Dependencies installed\n"
fi

# Clean previous build output
if [ -d "dist" ]; then
    echo -e "${YELLOW}Cleaning previous build output...${NC}"
    rm -rf dist
    echo -e "${GREEN}✓${NC} Cleaned\n"
fi

# Build for WeChat Mini Program
echo -e "${BLUE}Building for WeChat Mini Program (mp-weixin)...${NC}\n"

if ! $PKG_MANAGER run build:mp-weixin; then
    echo -e "\n${RED}✗${NC} Build failed. Please check the error messages above."
    exit 1
fi

# Check build output location
# Uni-app Vite builds to dist/build/mp-weixin for production builds
OUTPUT_DIR="$PROJECT_ROOT/dist/build/mp-weixin"

# Also check dist/dev/mp-weixin in case it's a dev build
DEV_OUTPUT_DIR="$PROJECT_ROOT/dist/dev/mp-weixin"

if [ -d "$OUTPUT_DIR" ]; then
    ACTUAL_OUTPUT_DIR="$OUTPUT_DIR"
elif [ -d "$DEV_OUTPUT_DIR" ]; then
    ACTUAL_OUTPUT_DIR="$DEV_OUTPUT_DIR"
else
    echo -e "\n${RED}✗${NC} Build output directory not found."
    echo -e "${YELLOW}Expected locations:${NC}"
    echo -e "  - $OUTPUT_DIR (production)"
    echo -e "  - $DEV_OUTPUT_DIR (development)"
    echo -e "\n${YELLOW}Available dist directories:${NC}"
    find dist -type d -maxdepth 3 2>/dev/null | head -10 || echo "  (none found)"
    exit 1
fi

# Verify required files exist
echo -e "\n${BLUE}Verifying build output structure...${NC}\n"

MISSING_FILES=0

# Check app.json
if [ ! -f "$ACTUAL_OUTPUT_DIR/app.json" ]; then
    echo -e "${RED}✗${NC} Missing: app.json"
    MISSING_FILES=$((MISSING_FILES + 1))
else
    echo -e "${GREEN}✓${NC} app.json exists"
fi

# Check app.js
if [ ! -f "$ACTUAL_OUTPUT_DIR/app.js" ]; then
    echo -e "${RED}✗${NC} Missing: app.js"
    MISSING_FILES=$((MISSING_FILES + 1))
else
    echo -e "${GREEN}✓${NC} app.js exists"
fi

# Check pages directory
if [ ! -d "$ACTUAL_OUTPUT_DIR/pages" ]; then
    echo -e "${RED}✗${NC} Missing: pages/ directory"
    MISSING_FILES=$((MISSING_FILES + 1))
else
    PAGE_COUNT=$(find "$ACTUAL_OUTPUT_DIR/pages" -type d -mindepth 1 -maxdepth 1 | wc -l | tr -d ' ')
    echo -e "${GREEN}✓${NC} pages/ directory exists ($PAGE_COUNT page directories)"
fi

# Final result
echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

if [ $MISSING_FILES -eq 0 ]; then
    echo -e "${GREEN}✓ Build verification successful!${NC}\n"
    echo -e "${BLUE}Build output directory (absolute path):${NC}"
    echo -e "${YELLOW}$(cd "$ACTUAL_OUTPUT_DIR" && pwd)${NC}\n"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
    echo -e "${GREEN}You can now open this directory in WeChat Developer Tools.${NC}\n"
    exit 0
else
    echo -e "${RED}✗ Build verification failed!${NC}"
    echo -e "${YELLOW}Missing $MISSING_FILES required file(s)/directory(ies).${NC}\n"
    echo -e "${BLUE}Build output location:${NC}"
    echo -e "${YELLOW}$(cd "$ACTUAL_OUTPUT_DIR" && pwd)${NC}\n"
    echo -e "${YELLOW}Contents of output directory:${NC}"
    ls -la "$ACTUAL_OUTPUT_DIR" | head -20
    exit 1
fi

