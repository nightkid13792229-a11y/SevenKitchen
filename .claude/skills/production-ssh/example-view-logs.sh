#!/usr/bin/env bash
# Production Log Viewer Script
# View logs from production server via SSH
#
# This script follows the production-ssh skill guidelines:
# https://github.com/your-org/SevenKitchen/skills/production-ssh/

set -euo pipefail

# ============================================================================
# 1. Configuration Variables (MUST BE DEFINED FIRST)
# ============================================================================
SERVER_HOST="1.14.3.2"
SERVER_USER="root"
SSH_KEY_PATH="$HOME/.ssh/claude_deploy"
SERVICE_NAME="sevenkitchen-backend"
LOG_LINES=50

# ============================================================================
# 2. Helper Functions
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
# 3. Validation Function (REQUIRED BY production-ssh SKILL)
# ============================================================================
validate_ssh_connection() {
  local host="$1"
  local user="$2"
  local key_path="$3"

  # Check if SSH key exists
  if [ ! -f "$key_path" ]; then
    fail "SSH key not found at: $key_path"
    info "Please run: ssh-keygen -t ed25519 -C \"claude-deploy\" -f $key_path"
    return 1
  fi

  # Test SSH connection
  info "Testing SSH connection to ${user}@${host}..."
  if ssh -i "$key_path" \
          -o ConnectTimeout=10 \
          -o StrictHostKeyChecking=no \
          -o BatchMode=yes \
          "${user}@${host}" \
          "echo 'Connection test successful'" >/dev/null 2>&1; then
    ok "SSH connection test passed"
    return 0
  else
    fail "SSH connection test failed"
    info "Please check:"
    echo "  1. Server is accessible"
    echo "  2. SSH key is properly configured"
    echo "  3. Firewall allows SSH connections"
    return 1
  fi
}

# ============================================================================
# 4. Main Script
# ============================================================================
echo "=========================================="
echo "SevenKitchen Production Log Viewer"
echo "=========================================="
echo ""
info "Server: ${SERVER_USER}@${SERVER_HOST}"
info "Service: ${SERVICE_NAME}"
info "Lines: ${LOG_LINES}"
echo ""

# Step 1: Validate SSH connection (MANDATORY)
if ! validate_ssh_connection "$SERVER_HOST" "$SERVER_USER" "$SSH_KEY_PATH"; then
  exit 1
fi
echo ""

# Step 2: Fetch logs from server
info "Fetching last ${LOG_LINES} lines of logs..."
echo ""

ssh -i "$SSH_KEY_PATH" \
    -o ConnectTimeout=10 \
    -o StrictHostKeyChecking=no \
    "${SERVER_USER}@${SERVER_HOST}" \
    "journalctl -u ${SERVICE_NAME} -n ${LOG_LINES} --no-pager"

# ============================================================================
# 5. Exit Code Check (REQUIRED BY production-ssh SKILL)
# ============================================================================
SSH_EXIT_CODE=$?

if [ $SSH_EXIT_CODE -eq 0 ]; then
  echo ""
  ok "Log retrieval completed successfully"
  echo ""
  info "To follow logs in real-time, run:"
  echo "  ssh -i ${SSH_KEY_PATH} ${SERVER_USER}@${SERVER_HOST} 'journalctl -u ${SERVICE_NAME} -f'"
  exit 0
else
  echo ""
  fail "Failed to retrieve logs (exit code: ${SSH_EXIT_CODE})"
  info "Check if service exists: systemctl status ${SERVICE_NAME}"
  exit 1
fi
