#!/usr/bin/env bash
# Production Log Viewer Script
# View logs from production server via SSH
#
# 这个脚本只读取日志，不部署。
# 真实部署请用：bash backend/scripts/remote_deploy_v2.sh
#
# Usage: bash .agents/skills/production-ssh/example-view-logs.sh

set -euo pipefail

# ============================================================================
# 1. Configuration
# ============================================================================
SERVER_HOST="1.14.3.2"
SERVER_USER="root"
SSH_KEY_PATH="$HOME/.ssh/claude_deploy"
SERVICE_NAME="sevenkitchen-backend"
LOG_LINES=50

# ============================================================================
# 2. Load the project SSH helper
# ============================================================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../../../backend/scripts/ssh-helper.sh
source "$SCRIPT_DIR/../../../backend/scripts/ssh-helper.sh"

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
# 3. Main
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
if ! validate_ssh_connection; then
  exit 1
fi
echo ""

# Step 2: Fetch logs from server
info "Fetching last ${LOG_LINES} lines of logs..."
echo ""

if ! ssh_exec "journalctl -u ${SERVICE_NAME} -n ${LOG_LINES} --no-pager"; then
  fail "Failed to retrieve logs"
  info "Check if service exists: systemctl status ${SERVICE_NAME}"
  exit 1
fi

echo ""
ok "Log retrieval completed successfully"
echo ""
info "To follow logs in real-time, run:"
echo "  ssh -i ${SSH_KEY_PATH} ${SERVER_USER}@${SERVER_HOST} 'journalctl -u ${SERVICE_NAME} -f'"
