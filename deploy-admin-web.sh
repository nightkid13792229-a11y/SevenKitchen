#!/usr/bin/env bash
# Admin Web Deployment Script
# Deploys admin-web to Tencent Cloud Lighthouse server via SSH

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

echo "=========================================="
echo "SevenKitchen Admin Web Deployment"
echo "=========================================="
echo ""
info "Server: $SERVER_USER@$SERVER_HOST"
info "Project path: $SERVER_PROJECT_PATH"
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

# Deploy via SSH
info "Starting remote deployment..."
ssh -i "$SSH_KEY_PATH" -o StrictHostKeyChecking=no "$SERVER_USER@$SERVER_HOST" "export SERVER_PROJECT_PATH=\"$SERVER_PROJECT_PATH\" && bash -s" << 'ENDSSH'
set -euo pipefail

# Change to project directory
cd "${SERVER_PROJECT_PATH:?SERVER_PROJECT_PATH not set}"

# Colors (for remote output)
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

info() { echo -e "${BLUE}ℹ ${1}${NC}"; }
ok() { echo -e "${GREEN}✓ ${1}${NC}"; }
warn() { echo -e "${YELLOW}⚠ ${1}${NC}"; }
fail() { echo -e "${RED}✗ ${1}${NC}"; }

echo "=========================================="
echo "Remote Server Deployment - Admin Web"
echo "=========================================="
echo ""

info "Working directory: $(pwd)"
echo ""

# Step 1: Pull latest code
info "Step 1: Pulling latest code from Git..."
MAX_RETRIES=3
RETRY_COUNT=0
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  if git pull origin main; then
    ok "Code updated successfully"
    break
  else
    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
      warn "Git pull failed (attempt $RETRY_COUNT/$MAX_RETRIES), retrying in 5 seconds..."
      sleep 5
    else
      fail "Failed to pull code after $MAX_RETRIES attempts"
      fail "Please check network connectivity or manually run: git pull origin main"
      exit 1
    fi
  fi
done
echo ""

# Step 2: Clean previous build
info "Step 2: Cleaning previous build..."
rm -rf dist node_modules/.vite
ok "Build directory cleaned"
echo ""

# Step 3: Install dependencies
info "Step 3: Installing dependencies..."
if npm install; then
  ok "Dependencies installed successfully"
else
  fail "Failed to install dependencies"
  exit 1
fi
echo ""

# Step 4: Build project
info "Step 4: Building admin-web..."
if npm run build; then
  ok "Build completed successfully"
else
  fail "Build failed"
  exit 1
fi
echo ""

# Step 5: Copy build files to project root
info "Step 5: Deploying build files..."
if cp -r dist/* . && rm -rf dist; then
  ok "Build files deployed"
else
  fail "Failed to deploy build files"
  exit 1
fi
echo ""

# Step 6: Clean up source files (keep only built files)
info "Step 6: Cleaning up source files..."
# Keep built files and git metadata, remove source code
find . -maxdepth 1 -type f ! -name "index.html" ! -name ".gitignore" -delete
find . -maxdepth 1 -type d ! -name "." ! -name ".." ! -name ".git" ! -name "assets" -exec rm -rf {} + 2>/dev/null || true
ok "Cleanup completed"
echo ""

ok "All deployment tasks completed!"
ENDSSH

# Check exit code
if [ $? -eq 0 ]; then
  echo ""
  echo "=========================================="
  ok "Admin Web deployment completed!"
  echo "=========================================="
  echo ""
  info "Access admin web at: http://$SERVER_HOST"
  info "Backend API at: http://$SERVER_HOST:8080"
  echo ""
else
  echo ""
  fail "Remote deployment failed!"
  exit 1
fi
