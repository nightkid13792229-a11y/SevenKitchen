#!/usr/bin/env bash
# Remote Admin Web Deployment Script
# Builds admin-web on the production server from a Git ref, then publishes static files.

set -euo pipefail

# ============================================================================
# Configuration
# ============================================================================
SERVER_HOST="${SERVER_HOST:-1.14.3.2}"
SERVER_USER="${SERVER_USER:-root}"
SSH_KEY_PATH="${SSH_KEY_PATH:-$HOME/.ssh/claude_deploy}"

DEPLOY_REF="${DEPLOY_REF:-main}"
REPO_URL="${REPO_URL:-git@github.com:nightkid13792229-a11y/SevenKitchen.git}"
REMOTE_SOURCE_PATH="${REMOTE_SOURCE_PATH:-/opt/sevenkitchen/SevenKitchen-admin-web-source}"
REMOTE_DEPLOY_PATH="${REMOTE_DEPLOY_PATH:-/opt/sevenkitchen/SevenKitchen/admin-web}"
REMOTE_RELEASES_PATH="${REMOTE_RELEASES_PATH:-/opt/sevenkitchen/admin-web-releases}"

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

shell_quote() {
  printf '%q' "$1"
}

# ============================================================================
# Load SSH Helper Functions
# ============================================================================
SSH_HELPER_SCRIPT="$(dirname "${BASH_SOURCE[0]}")/ssh-helper.sh"

if [ ! -f "$SSH_HELPER_SCRIPT" ]; then
  fail "SSH helper script not found: $SSH_HELPER_SCRIPT"
  exit 1
fi

source "$SSH_HELPER_SCRIPT"

# ============================================================================
# Deployment
# ============================================================================
deploy_admin_web_to_production() {
  echo "=========================================="
  echo "SevenKitchen Admin Web Remote Deployment"
  echo "=========================================="
  echo ""
  info "Server: ${SERVER_USER}@${SERVER_HOST}"
  info "Git ref: ${DEPLOY_REF}"
  info "Remote source checkout: ${REMOTE_SOURCE_PATH}"
  info "Remote deploy path: ${REMOTE_DEPLOY_PATH}"
  echo ""

  info "Step 1: Validating SSH connection..."
  if ! validate_ssh_connection; then
    fail "SSH connection validation failed"
    exit 1
  fi
  echo ""

  local deploy_ref_q
  local repo_url_q
  local remote_source_path_q
  local remote_deploy_path_q
  local remote_releases_path_q

  deploy_ref_q="$(shell_quote "$DEPLOY_REF")"
  repo_url_q="$(shell_quote "$REPO_URL")"
  remote_source_path_q="$(shell_quote "$REMOTE_SOURCE_PATH")"
  remote_deploy_path_q="$(shell_quote "$REMOTE_DEPLOY_PATH")"
  remote_releases_path_q="$(shell_quote "$REMOTE_RELEASES_PATH")"

  info "Step 2: Building and publishing on remote server..."
  ssh -i "$SSH_KEY_PATH" \
      -o ConnectTimeout=10 \
      -o StrictHostKeyChecking=no \
      "${SERVER_USER}@${SERVER_HOST}" \
      "DEPLOY_REF=$deploy_ref_q REPO_URL=$repo_url_q REMOTE_SOURCE_PATH=$remote_source_path_q REMOTE_DEPLOY_PATH=$remote_deploy_path_q REMOTE_RELEASES_PATH=$remote_releases_path_q bash -s" <<'ENDSSH'
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

rollback_release() {
  local previous_dir="$1"
  local failed_dir="$2"

  if [ -d "$previous_dir" ]; then
    warn "Rolling back to previous admin-web release..."
    rm -rf "$failed_dir"
    if [ -e "$REMOTE_DEPLOY_PATH" ]; then
      mv "$REMOTE_DEPLOY_PATH" "$failed_dir"
    fi
    mv "$previous_dir" "$REMOTE_DEPLOY_PATH"
    ok "Rollback completed"
  fi
}

echo "=========================================="
echo "Remote Admin Web Deployment"
echo "=========================================="
echo ""
info "Git ref: $DEPLOY_REF"
info "Source checkout: $REMOTE_SOURCE_PATH"
info "Deploy path: $REMOTE_DEPLOY_PATH"
echo ""

info "Step 2.1: Preparing source checkout..."
mkdir -p "$(dirname "$REMOTE_SOURCE_PATH")"
if [ ! -d "$REMOTE_SOURCE_PATH/.git" ]; then
  rm -rf "$REMOTE_SOURCE_PATH"
  git clone "$REPO_URL" "$REMOTE_SOURCE_PATH"
fi
cd "$REMOTE_SOURCE_PATH"
git remote set-url origin "$REPO_URL"
git fetch origin "$DEPLOY_REF"
git checkout -B admin-web-deploy FETCH_HEAD
git reset --hard FETCH_HEAD
git clean -fd
ok "Source checkout is at $(git rev-parse --short HEAD)"
echo ""

info "Step 2.2: Installing admin-web dependencies..."
cd "$REMOTE_SOURCE_PATH/admin-web"
npm ci
ok "Dependencies installed"
echo ""

info "Step 2.3: Building admin-web production bundle..."
npm run build:prod
test -f dist/index.html
ok "Build output verified"
echo ""

info "Step 2.4: Creating release directory..."
release_id="$(date +%Y%m%d%H%M%S)-$(cd "$REMOTE_SOURCE_PATH" && git rev-parse --short HEAD)"
release_dir="$REMOTE_RELEASES_PATH/$release_id"
previous_dir="${REMOTE_DEPLOY_PATH}.previous"
failed_dir="${REMOTE_DEPLOY_PATH}.failed"

mkdir -p "$REMOTE_RELEASES_PATH"
rm -rf "$release_dir"
mkdir -p "$release_dir"
rsync -a --delete dist/ "$release_dir/"
test -f "$release_dir/index.html"
ok "Release prepared: $release_dir"
echo ""

info "Step 2.5: Publishing release..."
rm -rf "$previous_dir" "$failed_dir"
if [ -e "$REMOTE_DEPLOY_PATH" ]; then
  mv "$REMOTE_DEPLOY_PATH" "$previous_dir"
fi

if mv "$release_dir" "$REMOTE_DEPLOY_PATH"; then
  if test -f "$REMOTE_DEPLOY_PATH/index.html"; then
    ok "Admin web published to $REMOTE_DEPLOY_PATH"
  else
    fail "Published admin web is missing index.html"
    rollback_release "$previous_dir" "$failed_dir"
    exit 1
  fi
else
  fail "Failed to move release into deploy path"
  rollback_release "$previous_dir" "$failed_dir"
  exit 1
fi
echo ""

info "Step 2.6: Final verification..."
test -f "$REMOTE_DEPLOY_PATH/index.html"
test -d "$REMOTE_DEPLOY_PATH/assets"
ok "Final verification passed"
echo ""

ok "Remote admin-web deployment completed"
ENDSSH

  local exit_code=$?
  if [ "$exit_code" -eq 0 ]; then
    echo ""
    echo "=========================================="
    ok "Admin web remote deployment completed!"
    echo "=========================================="
    echo ""
    info "Access admin web at: https://sevenkitchen.cloud"
    return 0
  fi

  echo ""
  fail "Admin web remote deployment failed!"
  return "$exit_code"
}

deploy_admin_web_to_production
exit $?
