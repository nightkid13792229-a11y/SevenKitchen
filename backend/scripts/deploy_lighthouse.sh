#!/usr/bin/env bash
# Lighthouse Deployment Script
# Automated deployment script for Tencent Cloud Lighthouse (Ubuntu 22.04)

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

# Resolve script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=========================================="
echo "SevenKitchen Backend Deployment"
echo "=========================================="
echo ""
info "Backend directory: $BACKEND_DIR"
echo ""

# Change to backend directory
cd "$BACKEND_DIR"

# Step 0: Check Prisma schema drift (before any deployment actions)
echo "Step 0: Checking Prisma schema vs migrations..."
if bash scripts/check_migration_history.sh; then
  ok "Schema and migrations are in sync"
else
  fail "MIGRATION HISTORY CHECK FAILED!"
  echo ""
  fail "Deployment aborted. Resolve missing or modified applied migrations and retry."
  exit 1
fi
echo ""

# Step 1: Verify environment variables
echo "Step 1: Verifying environment variables..."
if ! bash scripts/verify_env.sh; then
  fail "Environment variable verification failed"
  echo "Please fix the issues and run this script again."
  exit 1
fi
echo ""

# Load .env file if it exists
if [ -f .env ]; then
  set -a
  source .env
  set +a
  info "Loaded environment variables from .env"
fi

# Step 2: Ensure corepack/pnpm is available
echo "Step 2: Ensuring pnpm is available..."
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

# Step 3: Install dependencies
echo "Step 3: Installing dependencies..."
if [ ! -d node_modules ] || [ package.json -nt node_modules/.pnpm-lock.yaml ] 2>/dev/null; then
  info "Installing/updating dependencies..."
  pnpm install
  ok "Dependencies installed"
else
  ok "Dependencies are up to date"
fi
echo ""

# Step 4: Generate Prisma Client
echo "Step 4: Generating Prisma Client..."
if [ -z "${DATABASE_URL:-}" ]; then
  warn "DATABASE_URL not set, skipping Prisma Client generation"
  warn "Note: This may cause runtime errors if Prisma repositories are enabled"
else
  pnpm prisma generate
  ok "Prisma Client generated"
fi
echo ""

# Step 5: Run database migrations
echo "Step 5: Running database migrations..."
if [ -z "${DATABASE_URL:-}" ]; then
  warn "DATABASE_URL not set, skipping migrations"
else
  info "Applying database migrations..."
  if pnpm prisma migrate deploy; then
    ok "Database migrations applied successfully"
  else
    fail "Database migration failed"
    echo "Please check:"
    echo "  1. Database is running and accessible"
    echo "  2. DATABASE_URL is correct"
    echo "  3. Database user has necessary permissions"
    exit 1
  fi
fi
echo ""

# Step 6: Build the project
echo "Step 6: Building the project..."
if pnpm run build; then
  ok "Project built successfully"
else
  fail "Build failed"
  exit 1
fi
echo ""

# Step 7: Restart systemd service (ALWAYS restart to ensure latest code is loaded)
echo "Step 7: Restarting service..."
SERVICE_INSTALLED=false

# Check if systemd service exists (multiple detection methods)
if systemctl list-unit-files sevenkitchen-backend.service >/dev/null 2>&1; then
  SERVICE_INSTALLED=true
elif [ -f /etc/systemd/system/sevenkitchen-backend.service ]; then
  SERVICE_INSTALLED=true
fi

if [ "$SERVICE_INSTALLED" = true ]; then
  info "Systemd service found, restarting..."

  # Always restart to ensure latest code is loaded
  sudo systemctl restart sevenkitchen-backend

  # Wait for service to be ready
  info "Waiting for service to start..."
  sleep 3

  # Verify service is running
  if systemctl is-active --quiet sevenkitchen-backend; then
    ok "Service restarted and running"
  else
    fail "Service failed to start"
    sudo systemctl status sevenkitchen-backend --no-pager
    exit 1
  fi

  # Show service status without triggering SIGPIPE under pipefail.
  echo ""
  sudo systemctl status sevenkitchen-backend --no-pager | sed -n '1,15p'
else
  warn "Systemd service is not installed"
  warn "To install systemd service, run: sudo bash scripts/install_systemd_service.sh"
  echo ""
  info "You can start the service manually with:"
  echo "  pnpm start:prod"
  echo ""
  info "Or install systemd service for automatic startup:"
  echo "  sudo bash scripts/install_systemd_service.sh"
fi
echo ""

# Step 8: Health check (verify service is responding)
echo "Step 8: Health check..."
HEALTH_PORT="${PORT:-3000}"
MAX_RETRIES=5
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  if curl -sf "http://127.0.0.1:$HEALTH_PORT/api/v1/health" >/dev/null 2>&1; then
    ok "Health check passed - service is responding"
    break
  else
    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
      info "Health check failed (attempt $RETRY_COUNT/$MAX_RETRIES), retrying in 2 seconds..."
      sleep 2
    else
      warn "Health check failed after $MAX_RETRIES attempts - service may not be ready"
      warn "Check logs: sudo journalctl -u sevenkitchen-backend -n 50"
    fi
  fi
done
echo ""

# Step 9: Final verification
echo "Step 9: Running post-deployment verification..."
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

echo "=========================================="
ok "Deployment completed!"
echo "=========================================="
echo ""
info "Next steps:"
echo "  1. Verify the service is running: sudo systemctl status sevenkitchen-backend"
echo "  2. Check service logs: sudo journalctl -u sevenkitchen-backend -f"
echo "  3. Test health endpoint: curl http://127.0.0.1:${PORT:-3000}/api/v1/health"
echo "  4. Test public access: curl http://<your-public-ip>:${PORT:-3000}/api/v1/health"
echo ""
