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
REQUIRED_UNI_FILES=("pages.json" "manifest.json" "App.vue" "main.ts")

if [ ! -f "package.json" ]; then
    echo -e "${YELLOW}⚠ Warning: Missing package.json:${NC}"
    echo -e "  - package.json"
    echo -e "\nThis might not be a valid miniapp project root."
    exit 1
fi

UNI_SOURCE_ROOT=""
for candidate in "$PROJECT_ROOT" "$PROJECT_ROOT/src"; do
    candidate_valid=true
    for file in "${REQUIRED_UNI_FILES[@]}"; do
        if [ ! -f "$candidate/$file" ]; then
            candidate_valid=false
            break
        fi
    done

    if [ "$candidate_valid" = true ]; then
        UNI_SOURCE_ROOT="$candidate"
        break
    fi
done

if [ -z "$UNI_SOURCE_ROOT" ]; then
    echo -e "${YELLOW}⚠ Warning: Missing required files:${NC}"
    for file in "${REQUIRED_UNI_FILES[@]}"; do
        echo -e "  - $file (expected in project root or src/)"
    done
    echo -e "\nThis might not be a valid Uni-app project root."
    exit 1
fi

if [ "$UNI_SOURCE_ROOT" = "$PROJECT_ROOT" ]; then
    echo -e "${GREEN}✓${NC} Uni-app project structure verified\n"
else
    echo -e "${GREEN}✓${NC} Uni-app project structure verified at src/\n"
fi

# Build for WeChat Mini Program
echo -e "${BLUE}Building for WeChat Mini Program (mp-weixin)...${NC}\n"

get_mtime() {
    stat -f "%m" "$1" 2>/dev/null || stat -c "%Y" "$1"
}

cleanup_build_process() {
    if [ -n "${BUILD_PID:-}" ] && kill -0 "$BUILD_PID" 2>/dev/null; then
        kill "$BUILD_PID" 2>/dev/null || true
        wait "$BUILD_PID" 2>/dev/null || true
    fi
}

trap cleanup_build_process EXIT

# Run build in background
if [ -n "${SEVENKITCHEN_PREVIEW_SCRIPT:-}" ]; then
    PREVIEW_SCRIPT="$SEVENKITCHEN_PREVIEW_SCRIPT"
elif [ "${SEVENKITCHEN_PREVIEW_ONCE:-0}" = "1" ]; then
    PREVIEW_SCRIPT="build:mp-weixin"
else
    PREVIEW_SCRIPT="dev:mp-weixin"
fi
BUILD_STARTED_AT="$(date +%s)"
$PKG_MANAGER run "$PREVIEW_SCRIPT" &
BUILD_PID=$!

# Check if build output exists
OUTPUT_DIR=""
if [[ "$PREVIEW_SCRIPT" == build:* ]]; then
    OUTPUT_CANDIDATES=(
        "$PROJECT_ROOT/dist/build/mp-weixin"
        "$PROJECT_ROOT/dist/dev/mp-weixin"
    )
else
    OUTPUT_CANDIDATES=(
        "$PROJECT_ROOT/dist/dev/mp-weixin"
        "$PROJECT_ROOT/dist/build/mp-weixin"
    )
fi

is_fresh_output() {
    local candidate="$1"
    if [ ! -d "$candidate" ] || [ ! -f "$candidate/app.json" ]; then
        return 1
    fi

    local app_json_mtime
    app_json_mtime="$(get_mtime "$candidate/app.json")"
    [ "$app_json_mtime" -ge "$BUILD_STARTED_AT" ]
}

# Wait for initial build
echo -e "${YELLOW}Waiting for initial build to complete...${NC}"
PREVIEW_TIMEOUT_SECONDS="${SEVENKITCHEN_PREVIEW_TIMEOUT_SECONDS:-60}"
elapsed_seconds=0

while [ "$elapsed_seconds" -lt "$PREVIEW_TIMEOUT_SECONDS" ]; do
    for candidate in "${OUTPUT_CANDIDATES[@]}"; do
        if is_fresh_output "$candidate"; then
            OUTPUT_DIR="$candidate"
            break 2
        fi
    done

    if ! kill -0 "$BUILD_PID" 2>/dev/null; then
        wait "$BUILD_PID"
        break
    fi

    sleep 1
    elapsed_seconds=$((elapsed_seconds + 1))
done

if [ -n "$OUTPUT_DIR" ]; then
    node scripts/fix-components-injection.js

    echo -e "\n${GREEN}✓${NC} Build successful!\n"
    
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}Open this directory in WeChat Developer Tools:${NC}"
    echo -e "${YELLOW}$OUTPUT_DIR${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"

    if [ "${SEVENKITCHEN_PREVIEW_ONCE:-0}" = "1" ]; then
        if [[ "$PREVIEW_SCRIPT" == build:* ]]; then
            wait "$BUILD_PID"
        else
            cleanup_build_process
        fi
        echo -e "${GREEN}Preview verification complete.${NC}\n"
        exit 0
    fi
    
    # Try to auto-open WeChat DevTools on macOS (optional, non-blocking)
    if [[ "$OSTYPE" == "darwin"* && "${SEVENKITCHEN_SKIP_DEVTOOLS:-0}" != "1" ]]; then
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
    cleanup_build_process

    echo -e "\n${YELLOW}⚠ Build output not found at expected locations:${NC}"
    for candidate in "${OUTPUT_CANDIDATES[@]}"; do
        echo -e "${YELLOW}  - $candidate${NC}"
    done
    echo -e "${YELLOW}Please check the build output above for errors.${NC}\n"
    exit 1
fi
