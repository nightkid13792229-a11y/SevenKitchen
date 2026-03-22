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

# Step 1: Install dependencies
info "Step 1: Installing dependencies..."
cd "$ADMIN_WEB_DIR"
if npm install; then
  ok "Dependencies installed successfully"
else
  fail "Failed to install dependencies"
  exit 1
fi
echo ""

# Step 2: Build project
info "Step 2: Building admin-web..."
if npm run build:prod; then
  ok "Build completed successfully"
else
  fail "Build failed"
  exit 1
fi
echo ""

# Step 3: Verify build output
info "Step 3: Verifying build output..."
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

# Step 4: Deploy to server
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

echo "=========================================="
ok "Admin Web deployment completed!"
echo "=========================================="
echo ""
info "Access admin web at: http://$SERVER_HOST"
info "Backend API at: http://$SERVER_HOST:8080"
echo ""
