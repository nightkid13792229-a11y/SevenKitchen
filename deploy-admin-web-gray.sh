#!/usr/bin/env bash
# Gray Admin Web Deployment Script
# Builds locally and deploys to the isolated gray directory on Lighthouse.

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

info() { echo -e "${BLUE}ℹ ${1}${NC}"; }
ok() { echo -e "${GREEN}✓ ${1}${NC}"; }
warn() { echo -e "${YELLOW}⚠ ${1}${NC}"; }
fail() { echo -e "${RED}✗ ${1}${NC}"; }

SERVER_HOST="${SERVER_HOST:-1.14.3.2}"
SERVER_USER="${SERVER_USER:-root}"
GRAY_ADMIN_PATH="${GRAY_ADMIN_PATH:-/opt/sevenkitchen/SevenKitchen-gray/admin-web-dist}"
SSH_KEY_PATH="${SSH_KEY_PATH:-$HOME/.ssh/claude_deploy}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_WEB_DIR="$SCRIPT_DIR/admin-web"
DIST_DIR="$ADMIN_WEB_DIR/dist"

echo "=========================================="
echo "SevenKitchen Gray Admin Web Deployment"
echo "=========================================="
echo ""
info "Server: $SERVER_USER@$SERVER_HOST"
info "Gray admin path: $GRAY_ADMIN_PATH"
info "Local source: $ADMIN_WEB_DIR"
echo ""

if [ ! -f "$SSH_KEY_PATH" ]; then
  fail "SSH key not found at: $SSH_KEY_PATH"
  exit 1
fi

cd "$ADMIN_WEB_DIR"
info "Installing dependencies..."
npm install
ok "Dependencies ready"
echo ""

info "Building admin-web..."
npm run build
ok "Build completed"
echo ""

if [ ! -f "$DIST_DIR/index.html" ]; then
  fail "Build output missing: $DIST_DIR/index.html"
  exit 1
fi

info "Ensuring remote gray directory exists..."
ssh -i "$SSH_KEY_PATH" -o StrictHostKeyChecking=no "$SERVER_USER@$SERVER_HOST" \
  "mkdir -p '$GRAY_ADMIN_PATH'"
ok "Remote gray directory ready"
echo ""

info "Uploading gray admin assets..."
rsync -avz --delete -e "ssh -i $SSH_KEY_PATH -o StrictHostKeyChecking=no" \
  "$DIST_DIR/" "$SERVER_USER@$SERVER_HOST:$GRAY_ADMIN_PATH/"
ok "Gray admin assets uploaded"
echo ""

info "Verifying remote upload..."
ssh -i "$SSH_KEY_PATH" -o StrictHostKeyChecking=no "$SERVER_USER@$SERVER_HOST" \
  "test -f '$GRAY_ADMIN_PATH/index.html'"
ok "Remote gray admin index.html verified"
echo ""

echo "=========================================="
ok "Gray admin deployment completed!"
echo "=========================================="
echo ""
