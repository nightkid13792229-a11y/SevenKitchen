#!/usr/bin/env bash
# Remote Deployment Script (Refactored)
# This script ONLY handles deployment business logic
# SSH operations are delegated to ssh-helper.sh

set -euo pipefail

# ============================================================================
# Configuration
# ============================================================================
SERVER_HOST="1.14.3.2"
SERVER_USER="root"
SERVER_PROJECT_PATH="/opt/sevenkitchen/SevenKitchen/backend"
SSH_KEY_PATH="$HOME/.ssh/claude_deploy"

# Export configuration for ssh-helper
export SERVER_HOST
export SERVER_USER
export SSH_KEY_PATH

# ============================================================================
# Colors and Helper Functions
# ============================================================================
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

info() { echo -e "${BLUE}ℹ ${1}${NC}"; }
ok() { echo -e "${GREEN}✓ ${1}${NC}"; }
warn() { echo -e "${YELLOW}⚠ ${1}${NC}"; }
fail() { echo -e "${RED}✗ ${1}${NC}"; }

# ============================================================================
# Load SSH Helper Functions
# ============================================================================
SSH_HELPER_SCRIPT="$(dirname "${BASH_SOURCE[0]}")/ssh-helper.sh"

if [ ! -f "$SSH_HELPER_SCRIPT" ]; then
  fail "SSH helper script not found: $SSH_HELPER_SCRIPT"
  exit 1
fi

# Source the SSH helper to get its functions
source "$SSH_HELPER_SCRIPT"

# ============================================================================
# Deployment Functions (Business Logic)
# ============================================================================

# deploy_to_production - Main deployment logic
deploy_to_production() {
  echo "=========================================="
  echo "SevenKitchen Remote Deployment"
  echo "=========================================="
  echo ""
  info "Server: ${SERVER_USER}@${SERVER_HOST}"
  info "Project path: ${SERVER_PROJECT_PATH}"
  echo ""

  # Step 1: Validate SSH connection (using ssh-helper)
  info "Step 1: Validating SSH connection..."
  if ! validate_ssh_connection; then
    fail "SSH connection validation failed"
    exit 1
  fi
  echo ""

  # Step 2: Deploy via SSH (using ssh-helper)
  info "Step 2: Starting remote deployment..."
  echo ""

  ssh_exec_multiline <<'ENDSSH'
set -euo pipefail

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

# Step 2.1: Change to project directory
info "Step 2.1: Changing to project directory..."
cd "/opt/sevenkitchen/SevenKitchen/backend"
ok "Current directory: $(pwd)"
echo ""

# Step 2.2: Pull latest code
info "Step 2.2: Pulling latest code from Git..."
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

# Step 2.3: Run deployment script
info "Step 2.3: Running deployment script..."
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
  local exit_code=$?
  if [ $exit_code -eq 0 ]; then
    echo ""
    echo "=========================================="
    ok "Remote deployment completed!"
    echo "=========================================="
    echo ""
    info "Next steps:"
    echo "  1. Check service status:"
    echo "     ssh -i $SSH_KEY_PATH $SERVER_USER@$SERVER_HOST 'systemctl status sevenkitchen-backend'"
    echo ""
    echo "  2. View logs:"
    echo "     ssh -i $SSH_KEY_PATH $SERVER_USER@$SERVER_HOST 'journalctl -u sevenkitchen-backend -f'"
    echo ""
    echo "  3. Test health endpoint:"
    echo "     curl http://$SERVER_HOST:3000/api/v1/health"
    echo ""
    return 0
  else
    echo ""
    fail "Remote deployment failed!"
    return 1
  fi
}

# ============================================================================
# Main Execution
# ============================================================================
deploy_to_production
exit $?
