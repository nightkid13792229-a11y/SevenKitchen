#!/bin/bash

# Uni-app WeChat Mini Program Development Helper Script
# This script builds the Uni-app project for WeChat Mini Program and shows the output directory

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

echo -e "${BLUE}=== Uni-app WeChat Mini Program Build Helper ===${NC}\n"

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
else
    echo -e "${GREEN}✓${NC} Dependencies already installed\n"
fi

# Verify Uni-app project structure
REQUIRED_FILES=("pages.json" "manifest.json" "App.vue" "main.ts" "package.json")
MISSING_FILES=()

for file in "${REQUIRED_FILES[@]}"; do
    if [ ! -f "$file" ]; then
        MISSING_FILES+=("$file")
    fi
done

if [ ${#MISSING_FILES[@]} -ne 0 ]; then
    echo -e "${YELLOW}⚠ Warning: Missing required files:${NC}"
    for file in "${MISSING_FILES[@]}"; do
        echo -e "  - $file"
    done
    echo -e "\nThis might not be a valid Uni-app project root."
    exit 1
fi

echo -e "${GREEN}✓${NC} Uni-app project structure verified\n"

# Build for WeChat Mini Program
echo -e "${BLUE}Building for WeChat Mini Program (mp-weixin)...${NC}\n"

# Run build in background
$PKG_MANAGER run dev:mp-weixin &
BUILD_PID=$!

# Wait a bit for initial build
echo -e "${YELLOW}Waiting for initial build to complete...${NC}"
sleep 5

# Check if build output exists
OUTPUT_DIR="$PROJECT_ROOT/dist/dev/mp-weixin"

if [ -d "$OUTPUT_DIR" ] && [ -f "$OUTPUT_DIR/app.json" ]; then
    echo -e "\n${GREEN}✓${NC} Build successful!\n"
    
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}Open this directory in WeChat Developer Tools:${NC}"
    echo -e "${YELLOW}$OUTPUT_DIR${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
    
    # Try to auto-open WeChat DevTools on macOS (optional, non-blocking)
    if [[ "$OSTYPE" == "darwin"* ]]; then
        if command -v open &> /dev/null; then
            echo -e "${BLUE}Attempting to open WeChat Developer Tools...${NC}"
            open -a "wechatwebdevtools" "$OUTPUT_DIR" 2>/dev/null || {
                echo -e "${YELLOW}Could not auto-open WeChat DevTools.${NC}"
                echo -e "${YELLOW}Please manually open: $OUTPUT_DIR${NC}"
            }
        fi
    fi
    
    echo -e "\n${GREEN}Build is running in watch mode.${NC}"
    echo -e "${YELLOW}Press Ctrl+C to stop.${NC}\n"
    
    # Wait for the build process
    wait $BUILD_PID
else
    echo -e "\n${YELLOW}⚠ Build output not found at expected location: $OUTPUT_DIR${NC}"
    echo -e "${YELLOW}Please check the build output above for errors.${NC}\n"
    exit 1
fi


