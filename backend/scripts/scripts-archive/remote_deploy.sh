#!/usr/bin/env bash
# Remote Deployment Script
# Automatically deploys to Tencent Cloud Lighthouse server via SSH

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
SERVER_PROJECT_PATH="/opt/sevenkitchen/SevenKitchen/backend"
SSH_KEY_PATH="$HOME/.ssh/claude_deploy"

echo "=========================================="
echo "SevenKitchen Remote Deployment"
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
echo "Remote Server Deployment"
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

# Step 2: Run deployment script
info "Step 2: Running deployment script..."
if bash scripts/deploy_lighthouse.sh; then
  ok "Deployment completed successfully"
else
  fail "Deployment failed"
  exit 1
fi
echo ""

ok "All deployment tasks completed!"
ENDSSH

# Check exit code
if [ $? -eq 0 ]; then
  echo ""
  echo "=========================================="
  ok "Remote deployment completed!"
  echo "=========================================="
  echo ""
  info "Next steps:"
  echo "  1. Check service status: ssh -i $SSH_KEY_PATH $SERVER_USER@$SERVER_HOST 'systemctl status sevenkitchen-backend'"
  echo "  2. View logs: ssh -i $SSH_KEY_PATH $SERVER_USER@$SERVER_HOST 'journalctl -u sevenkitchen-backend -f'"
  echo "  3. Test health endpoint: curl http://$SERVER_HOST:3000/api/v1/health"
  echo ""
else
  echo ""
  fail "Remote deployment failed!"
  exit 1
fi
