#!/usr/bin/env bash
# Remote Deployment Script (Artifact Deploy)
# Builds backend dist locally and uploads it to production.
# The production server must not run Nest/TypeScript builds.

set -euo pipefail

# ============================================================================
# Configuration
# ============================================================================
SERVER_HOST="1.14.3.2"
SERVER_USER="root"
SERVER_PROJECT_PATH="/opt/sevenkitchen/SevenKitchen/backend"
SSH_KEY_PATH="$HOME/.ssh/claude_deploy"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BUILD_ROOT=""
BUILD_BACKEND_DIR=""
DIST_DIR=""
DEPLOY_COMMIT=""

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

cleanup() {
  if [ -n "${BUILD_ROOT:-}" ] && [ -d "$BUILD_ROOT" ]; then
    rm -rf "$BUILD_ROOT"
  fi
}
trap cleanup EXIT

# ============================================================================
# Load SSH Helper Functions
# ============================================================================
SSH_HELPER_SCRIPT="$SCRIPT_DIR/ssh-helper.sh"

if [ ! -f "$SSH_HELPER_SCRIPT" ]; then
  fail "SSH helper script not found: $SSH_HELPER_SCRIPT"
  exit 1
fi

# Source the SSH helper to get its functions
source "$SSH_HELPER_SCRIPT"

# ============================================================================
# Deployment Functions (Business Logic)
# ============================================================================

build_artifact_locally() {
  info "Step 1: Building backend artifact locally from origin/main..."
  echo ""

  if ! command -v git >/dev/null 2>&1; then
    fail "git is required for deployment"
    exit 1
  fi

  if ! command -v npm >/dev/null 2>&1; then
    fail "npm is required for local build"
    exit 1
  fi

  info "Fetching origin/main..."
  git -C "$REPO_ROOT" fetch origin main
  DEPLOY_COMMIT="$(git -C "$REPO_ROOT" rev-parse FETCH_HEAD)"
  ok "Deploy commit: ${DEPLOY_COMMIT}"

  BUILD_ROOT="$(mktemp -d)"
  BUILD_BACKEND_DIR="$BUILD_ROOT/backend"
  DIST_DIR="$BUILD_BACKEND_DIR/dist"

  info "Creating clean local build workspace..."
  git -C "$REPO_ROOT" archive "$DEPLOY_COMMIT" | tar -x -C "$BUILD_ROOT"

  cd "$BUILD_BACKEND_DIR"

  info "Installing local build dependencies..."
  npm ci

  info "Running local backend build..."
  npm run build

  if [ ! -f "$DIST_DIR/src/main.js" ]; then
    fail "Build artifact missing: $DIST_DIR/src/main.js"
    exit 1
  fi

  ok "Local artifact is ready: $DIST_DIR"
  echo ""
}

validate_remote_access() {
  info "Step 2: Validating SSH connection..."
  if ! validate_ssh_connection; then
    fail "SSH connection validation failed"
    exit 1
  fi
  echo ""
}

prepare_remote_runtime() {
  info "Step 3: Preparing production runtime without building..."
  echo ""

  ssh_exec_multiline <<'ENDSSH'
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

echo "=========================================="
echo "Remote Runtime Preparation"
echo "=========================================="
echo ""

cd "/opt/sevenkitchen/SevenKitchen/backend"
ok "Current directory: $(pwd)"
echo ""

info "Resetting production source to origin/main..."
MAX_RETRIES=3
RETRY_COUNT=0
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  if git fetch origin main; then
    git reset --hard FETCH_HEAD
    ok "Code reset to $(git rev-parse --short HEAD)"
    break
  else
    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
      warn "Git fetch failed (attempt $RETRY_COUNT/$MAX_RETRIES), retrying in 5 seconds..."
      sleep 5
    else
      fail "Failed to fetch code after $MAX_RETRIES attempts"
      exit 1
    fi
  fi
done
echo ""

info "Checking Prisma schema and migration history..."
bash scripts/check_migration_history.sh
ok "Schema and migrations are in sync"
echo ""

info "Verifying environment variables..."
bash scripts/verify_env.sh
ok "Environment variables verified"
echo ""

if [ -f .env ]; then
  set -a
  source .env
  set +a
  info "Loaded environment variables from .env"
fi
echo ""

info "Ensuring pnpm is available..."
if ! command -v pnpm >/dev/null 2>&1; then
  info "pnpm not found, enabling corepack..."
  if command -v corepack >/dev/null 2>&1; then
    sudo corepack enable || {
      warn "Failed to enable corepack with sudo, trying without..."
      corepack enable || fail "Failed to enable corepack"
    }
    corepack prepare pnpm@latest --activate
    ok "pnpm installed via corepack"
  else
    fail "corepack not found. Please install Node.js 18+ or install pnpm manually"
    exit 1
  fi
else
  ok "pnpm is available: $(pnpm --version)"
fi
echo ""

info "Installing/updating runtime dependencies..."
NEEDS_INSTALL=false
if [ ! -d node_modules ] || [ ! -f node_modules/.pnpm-lock.yaml ]; then
  NEEDS_INSTALL=true
elif [ package.json -nt node_modules/.pnpm-lock.yaml ] || [ pnpm-lock.yaml -nt node_modules/.pnpm-lock.yaml ]; then
  NEEDS_INSTALL=true
fi

if [ "$NEEDS_INSTALL" = true ]; then
  pnpm install --frozen-lockfile --prod=false
  ok "Dependencies installed"
else
  ok "Dependencies are up to date"
fi
echo ""

if [ -z "${DATABASE_URL:-}" ]; then
  warn "DATABASE_URL not set, skipping Prisma Client generation and migrations"
else
  info "Generating Prisma Client..."
  pnpm prisma generate
  ok "Prisma Client generated"
  echo ""

  info "Applying database migrations..."
  pnpm prisma migrate deploy
  ok "Database migrations applied"
fi
echo ""

mkdir -p dist
ok "Remote runtime is ready for artifact upload"
ENDSSH
}

upload_artifact() {
  info "Step 4: Uploading local dist artifact to production..."
  echo ""

  if ! command -v rsync >/dev/null 2>&1; then
    fail "rsync is required for artifact upload"
    exit 1
  fi

  local rsync_ssh
  rsync_ssh="ssh -i $SSH_KEY_PATH -o ConnectTimeout=10 -o StrictHostKeyChecking=no"

  rsync -az --delete -e "$rsync_ssh" "$DIST_DIR/" "$SERVER_USER@$SERVER_HOST:$SERVER_PROJECT_PATH/dist/"
  ok "Uploaded artifact to $SERVER_PROJECT_PATH/dist/"
  echo ""
}

restart_and_verify_remote() {
  info "Step 5: Restarting service and verifying health..."
  echo ""

  ssh_exec_multiline <<'ENDSSH'
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

echo "=========================================="
echo "Remote Restart and Verification"
echo "=========================================="
echo ""

cd "/opt/sevenkitchen/SevenKitchen/backend"

if [ ! -f dist/src/main.js ]; then
  fail "Uploaded artifact is missing dist/src/main.js"
  exit 1
fi
ok "Uploaded artifact found"
echo ""

if [ -f .env ]; then
  set -a
  source .env
  set +a
  info "Loaded environment variables from .env"
fi
echo ""

if ! systemctl list-unit-files sevenkitchen-backend.service >/dev/null 2>&1 && [ ! -f /etc/systemd/system/sevenkitchen-backend.service ]; then
  fail "Systemd service sevenkitchen-backend is not installed"
  exit 1
fi

info "Restarting sevenkitchen-backend..."
sudo systemctl restart sevenkitchen-backend

info "Waiting for service to start..."
sleep 3

if systemctl is-active --quiet sevenkitchen-backend; then
  ok "Service restarted and running"
else
  fail "Service failed to start"
  sudo systemctl status sevenkitchen-backend --no-pager
  exit 1
fi
echo ""

sudo systemctl status sevenkitchen-backend --no-pager | sed -n '1,15p'
echo ""

info "Running health check..."
HEALTH_PORT="${PORT:-3000}"
MAX_RETRIES=5
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  if curl -sf "http://127.0.0.1:$HEALTH_PORT/api/v1/health" >/dev/null 2>&1; then
    ok "Health check passed"
    break
  else
    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
      info "Health check failed (attempt $RETRY_COUNT/$MAX_RETRIES), retrying in 2 seconds..."
      sleep 2
    else
      fail "Health check failed after $MAX_RETRIES attempts"
      sudo journalctl -u sevenkitchen-backend -n 50 --no-pager
      exit 1
    fi
  fi
done
echo ""

info "Running post-deployment verification..."
if [ -f scripts/post_deploy_verify.sh ]; then
  if bash scripts/post_deploy_verify.sh; then
    ok "Post-deployment verification passed"
  else
    warn "Post-deployment verification had issues (see output above)"
  fi
else
  warn "Post-deployment verification script not found, skipping"
fi
echo ""

ok "Remote verification completed"
ENDSSH
}

# deploy_to_production - Main deployment logic
deploy_to_production() {
  echo "=========================================="
  echo "SevenKitchen Artifact Deployment"
  echo "=========================================="
  echo ""
  info "Server: ${SERVER_USER}@${SERVER_HOST}"
  info "Project path: ${SERVER_PROJECT_PATH}"
  info "Deploy ref: origin/main"
  echo ""

  build_artifact_locally
  validate_remote_access
  prepare_remote_runtime
  upload_artifact
  restart_and_verify_remote

  echo ""
  echo "=========================================="
  ok "Artifact deployment completed!"
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
}

# ============================================================================
# Main Execution
# ============================================================================
deploy_to_production
exit $?
