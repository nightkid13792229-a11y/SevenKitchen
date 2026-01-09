#!/usr/bin/env bash
# Release Verification Script for Phase 8.14-8.16
# One-click verification of release readiness

set -euo pipefail

# Resolve script directory and repo root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BACKEND_DIR="$REPO_ROOT/backend"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

# Step tracking
declare -a STEP_RESULTS=()
declare -a STEP_NAMES=()

# Helper functions
info() { echo -e "${BLUE}ℹ ${1:-Info}${NC}"; }
ok() { echo -e "${GREEN}✓ ${1:-OK}${NC}"; }
warn() { echo -e "${YELLOW}⚠ ${1:-Warning}${NC}"; }
fail() { echo -e "${RED}✗ ${1:-Failed}${NC}"; }

# Require command to exist
require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    fail "Required command not found: $cmd"
    echo "  Please install $cmd and try again."
    exit 1
  fi
  ok "Command found: $cmd"
}

# Require environment variable to be set
require_env() {
  local var_name="$1"
  if [ -z "${!var_name:-}" ]; then
    fail "Required environment variable not set: $var_name"
    echo "  Please set $var_name and try again."
    exit 1
  fi
  ok "Environment variable set: $var_name"
}

# Run a step and track result
# Note: This function temporarily disables 'set -e' to allow continuation on failure
run_step() {
  local step_name="$1"
  shift
  local step_cmd="$*"
  
  echo ""
  echo "=========================================="
  echo "Step: $step_name"
  echo "=========================================="
  echo ""
  
  STEP_NAMES+=("$step_name")
  
  # Temporarily disable exit on error to capture failure and continue
  set +e
  eval "$step_cmd"
  local step_exit=$?
  set -e
  
  if [ $step_exit -eq 0 ]; then
    STEP_RESULTS+=("PASS")
    ok "$step_name completed successfully"
  else
    STEP_RESULTS+=("FAIL")
    fail "$step_name failed"
  fi
  
  # Always return success from run_step itself so script continues
  return 0
}

# Print final summary
print_summary() {
  echo ""
  echo "=========================================="
  echo "Release Verification Summary"
  echo "=========================================="
  echo ""
  
  local all_passed=true
  local i=0
  
  for step_name in "${STEP_NAMES[@]}"; do
    local result="${STEP_RESULTS[$i]}"
    if [ "$result" = "PASS" ]; then
      echo -e "${GREEN}✓${NC} $step_name: PASS"
    else
      echo -e "${RED}✗${NC} $step_name: FAIL"
      all_passed=false
    fi
    i=$((i + 1))
  done
  
  echo ""
  if [ "$all_passed" = true ]; then
    ok "All steps passed! Release verification successful."
    return 0
  else
    fail "Some steps failed. Please review the output above."
    return 1
  fi
}

# Main execution
main() {
  echo "=========================================="
  echo "Phase 8.14-8.16 Release Verification"
  echo "=========================================="
  echo ""
  info "Repository root: $REPO_ROOT"
  info "Backend directory: $BACKEND_DIR"
  echo ""
  
  # Step 1: Verify required tools
  run_step "1. Verify Required Tools" '
    require_cmd psql &&
    require_cmd node &&
    require_cmd pnpm &&
    require_cmd jq &&
    require_cmd curl
  '
  
  # Step 2: Verify environment variables
  run_step "2. Verify Environment Variables" '
    require_env DATABASE_URL
  '
  
  # Step 3: Fix OrderStatus enum (Phase 8.18) before Prisma migrations
  run_step "3. Fix OrderStatus Enum (Phase 8.18)" '
    cd "$BACKEND_DIR" &&
    if [ -z "${DATABASE_URL:-}" ]; then
      warn "DATABASE_URL not set, skipping enum fix"
      return 0
    fi &&
    info "Applying Phase 8.18 OrderStatus enum fix (idempotent)" &&
    if psql "$DATABASE_URL" -f "$BACKEND_DIR/scripts/migrations/phase8_18_fix_orderstatus_enum.sql" >/dev/null 2>&1; then
      ok "OrderStatus enum fix applied successfully"
    else
      fail "OrderStatus enum fix failed"
      return 1
    fi
  '

  # Step 4: Apply migrations using Prisma
  run_step "4. Apply Database Migrations" '
    cd "$BACKEND_DIR" &&
    info "Applying Prisma migrations (includes Phase 8.16 cancellation fields)" &&
    if ! pnpm prisma migrate deploy; then
      fail "Prisma migrate deploy failed"
      return 1
    fi &&
    ok "All migrations applied successfully"
  '
  
  # Step 5: Generate Prisma client
  run_step "5. Generate Prisma Client" '
    cd "$BACKEND_DIR" &&
    pnpm prisma generate
  '
  
  # Step 6: Build
  run_step "6. Build Project" '
    cd "$BACKEND_DIR" &&
    pnpm run build
  '
  
  # Step 7: Run tests
  run_step "7. Run Tests" '
    cd "$BACKEND_DIR" &&
    pnpm test
  '
  
  # Step 8: Run E2E verification
  run_step "8. Run E2E Verification" '
    /bin/bash "$BACKEND_DIR/scripts/phase8_14_shipping_fulfillment_e2e_verify.sh"
  '
  
  # Print summary and exit with appropriate code
  if print_summary; then
    exit 0
  else
    exit 1
  fi
}

# Execute main function
main "$@"

