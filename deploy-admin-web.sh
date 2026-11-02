#!/usr/bin/env bash
# Admin Web Deployment Script
# Builds locally and deploys to Tencent Cloud Lighthouse server via SSH

set -euo pipefail

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# Helper functions
info() { echo -e "${BLUE}ℹ ${1}${NC}"; }
ok() { echo -e "${GREEN}✓ ${1}${NC}"; }
warn() { echo -e "${YELLOW}⚠ ${1}${NC}"; }
fail() { echo -e "${RED}✗ ${1}${NC}"; }

# Server configuration
SERVER_HOST="1.14.3.2"
SERVER_USER="root"
SERVER_PROJECT_PATH="/opt/sevenkitchen/SevenKitchen/admin-web"
SSH_KEY_PATH="$HOME/.ssh/claude_deploy"

# Local paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_WEB_DIR="$SCRIPT_DIR/admin-web"
DIST_DIR="$ADMIN_WEB_DIR/dist"

# 多会话门禁：同一时间只允许一个后台部署；记录上次部署的提交
COLLAB_LIB="$SCRIPT_DIR/scripts/lib/collab.sh"
if [ ! -f "$COLLAB_LIB" ]; then
  fail "缺少协作库：$COLLAB_LIB（请先把多会话门禁合并到 main）"
  exit 1
fi
# shellcheck source=scripts/lib/collab.sh
source "$COLLAB_LIB"

SK_FORCE_DEPLOY=0
for _arg in "$@"; do
  [ "$_arg" = "--force" ] && SK_FORCE_DEPLOY=1
done

LOCK_TOKEN="$(collab_lock_acquire deploy-admin-web "后台部署" 1800 0)" || {
  fail "另一个后台部署正在进行（看门禁：bash scripts/gate.sh status）"
  exit 1
}
BUILD_ROOT=""

cleanup() {
  if [ -n "${BUILD_ROOT:-}" ] && [ -d "$BUILD_ROOT" ]; then
    rm -rf "$BUILD_ROOT"
  fi
  if [ -n "${LOCK_TOKEN:-}" ]; then
    collab_lock_release deploy-admin-web "$LOCK_TOKEN" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

DEPLOY_STATE_FILE="$(collab_state_dir)/deploy-state/admin-web"

echo "=========================================="
echo "SevenKitchen Admin Web Deployment"
echo "=========================================="
echo ""
info "Server: $SERVER_USER@$SERVER_HOST"
info "Project path: $SERVER_PROJECT_PATH"
info "Local source: $ADMIN_WEB_DIR"
echo ""

# Verify SSH key exists
if [ ! -f "$SSH_KEY_PATH" ]; then
  fail "SSH key not found at: $SSH_KEY_PATH"
  info "Please run: ssh-keygen -t ed25519 -C \"claude-deploy\" -f ~/.ssh/claude_deploy"
  exit 1
fi
ok "SSH key found"

# Test SSH connection
info "Testing SSH connection..."
if ssh -i "$SSH_KEY_PATH" -o ConnectTimeout=10 -o StrictHostKeyChecking=no "$SERVER_USER@$SERVER_HOST" "echo 'Connection test successful'" >/dev/null 2>&1; then
  ok "SSH connection test passed"
else
  fail "SSH connection test failed"
  info "Please check:"
  echo "  1. Server is accessible"
  echo "  2. SSH key is properly configured"
  echo "  3. Firewall allows SSH connections"
  exit 1
fi
echo ""

# Step 0: 解析构建源（始终用 origin/main，与当前工作区停在哪个分支无关）
info "Resolving build source (origin/main)..."
git -C "$SCRIPT_DIR" fetch origin --quiet
DEPLOY_COMMIT="$(git -C "$SCRIPT_DIR" rev-parse origin/main)"
ok "Build source: origin/main @ ${DEPLOY_COMMIT:0:8}"

# 自上次部署以来 admin-web 没改动 → 跳过，避免无意义覆盖（--force 可强制）
if [ "$SK_FORCE_DEPLOY" -ne 1 ] && [ -f "$DEPLOY_STATE_FILE" ]; then
  LAST_DEPLOY_COMMIT="$(awk 'NR==1{print $1}' "$DEPLOY_STATE_FILE")"
  if [ -n "$LAST_DEPLOY_COMMIT" ] \
     && git -C "$SCRIPT_DIR" merge-base --is-ancestor "$LAST_DEPLOY_COMMIT" "$DEPLOY_COMMIT" 2>/dev/null \
     && git -C "$SCRIPT_DIR" diff --quiet "$LAST_DEPLOY_COMMIT..$DEPLOY_COMMIT" -- admin-web/; then
    ok "admin-web 自上次部署（${LAST_DEPLOY_COMMIT:0:8}）以来没有改动，跳过部署"
    info "需要强制部署请加 --force"
    exit 0
  fi
fi

# Step 1: 导出源码到临时目录（不读当前工作区，旧分支 / 脏工作区都不影响结果）
BUILD_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/sevenkitchen-admin-web.XXXXXX")"
info "Exporting source to $BUILD_ROOT..."
git -C "$SCRIPT_DIR" archive "$DEPLOY_COMMIT" | tar -x -C "$BUILD_ROOT"
ADMIN_WEB_BUILD_DIR="$BUILD_ROOT/admin-web"
DIST_DIR="$ADMIN_WEB_BUILD_DIR/dist"
ok "Source exported"

# Step 2: Install dependencies
cd "$ADMIN_WEB_BUILD_DIR"
info "Step 2: Installing dependencies..."
if npm install; then
  ok "Dependencies installed successfully"
else
  fail "Failed to install dependencies"
  exit 1
fi
echo ""

# Step 3: Build project
info "Step 3: Building admin-web..."
if npm run build:prod; then
  ok "Build completed successfully"
else
  fail "Build failed"
  exit 1
fi
echo ""

# Step 4: Verify build output
info "Step 4: Verifying build output..."
if [ ! -d "$DIST_DIR" ]; then
  fail "Build output directory not found: $DIST_DIR"
  exit 1
fi
if [ ! -f "$DIST_DIR/index.html" ]; then
  fail "index.html not found in build output"
  exit 1
fi
ok "Build output verified"
echo ""

# Step 5: Deploy to server
info "Step 4: Deploying to server..."

# Clear remote directory and upload new files
ssh -i "$SSH_KEY_PATH" -o StrictHostKeyChecking=no "$SERVER_USER@$SERVER_HOST" "rm -rf $SERVER_PROJECT_PATH/*"

# Upload build files
if rsync -avz --delete -e "ssh -i $SSH_KEY_PATH -o StrictHostKeyChecking=no" "$DIST_DIR/" "$SERVER_USER@$SERVER_HOST:$SERVER_PROJECT_PATH/"; then
  ok "Files uploaded successfully"
else
  fail "Failed to upload files"
  exit 1
fi
echo ""

# Step 5: Verify deployment
info "Step 5: Verifying deployment..."
if ssh -i "$SSH_KEY_PATH" -o StrictHostKeyChecking=no "$SERVER_USER@$SERVER_HOST" "test -f $SERVER_PROJECT_PATH/index.html"; then
  ok "Deployment verified - index.html exists on server"
else
  fail "Deployment verification failed - index.html not found on server"
  exit 1
fi
echo ""

printf '%s %s\n' "$DEPLOY_COMMIT" "$(date '+%F %T')" > "$DEPLOY_STATE_FILE"
ok "部署记录：$DEPLOY_STATE_FILE（${DEPLOY_COMMIT:0:8}）"
echo ""

echo "=========================================="
ok "Admin Web deployment completed!"
echo "=========================================="
echo ""
info "Access admin web at: http://$SERVER_HOST"
info "Backend API at: http://$SERVER_HOST:8080"
echo ""
