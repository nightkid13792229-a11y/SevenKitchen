#!/usr/bin/env bash
# Environment Variable Verification Script
# Checks required environment variables and provides clear feedback

set -euo pipefail

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
info() { echo -e "${BLUE}ℹ ${1}${NC}"; }
ok() { echo -e "${GREEN}✓ ${1}${NC}"; }
warn() { echo -e "${YELLOW}⚠ ${1}${NC}"; }
fail() { echo -e "${RED}✗ ${1}${NC}"; }

# Track validation results
declare -a MISSING_VARS=()
declare -a EMPTY_VARS=()
declare -a INVALID_VARS=()

echo "=========================================="
echo "Environment Variable Verification"
echo "=========================================="
echo ""

# Load .env file if it exists
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="${ENV_FILE:-$BACKEND_DIR/.env}"

if [ -f "$ENV_FILE" ]; then
  info "Loading environment variables from: $ENV_FILE"
  set -a
  source "$ENV_FILE"
  set +a
  ok "Environment file loaded"
else
  warn "Environment file not found: $ENV_FILE"
  warn "Please create .env file or set environment variables manually"
fi

echo ""

# Check DATABASE_URL (required when Prisma is enabled)
check_database_url() {
  if [ -z "${DATABASE_URL:-}" ]; then
    MISSING_VARS+=("DATABASE_URL")
    fail "DATABASE_URL is not set"
    echo "  → Required when using Prisma repositories (PRODUCTION_REPO=prisma, INVENTORY_REPO=prisma)"
    echo "  → Format: postgresql://user:password@host:port/database"
    echo "  → Example: postgresql://sevenkitchen:sevenkitchen@localhost:5432/sevenkitchen"
    return 1
  fi

  if [ -z "$DATABASE_URL" ]; then
    EMPTY_VARS+=("DATABASE_URL")
    fail "DATABASE_URL is set but empty"
    return 1
  fi

  # Basic format validation
  if [[ ! "$DATABASE_URL" =~ ^postgresql:// ]]; then
    INVALID_VARS+=("DATABASE_URL")
    fail "DATABASE_URL format appears invalid (should start with 'postgresql://')"
    echo "  → Current value: ${DATABASE_URL:0:50}..."
    return 1
  fi

  ok "DATABASE_URL is set and format looks valid"
  echo "  → Value: ${DATABASE_URL%%@*}@***" # Hide password
  return 0
}

# Check PORT (optional, has default)
check_port() {
  if [ -z "${PORT:-}" ]; then
    warn "PORT is not set (will use default: 3000)"
    return 0
  fi

  if ! [[ "$PORT" =~ ^[0-9]+$ ]] || [ "$PORT" -lt 1 ] || [ "$PORT" -gt 65535 ]; then
    INVALID_VARS+=("PORT")
    fail "PORT is invalid (must be a number between 1 and 65535)"
    echo "  → Current value: $PORT"
    return 1
  fi

  ok "PORT is set: $PORT"
  return 0
}

# Check JWT_SECRET (optional but recommended for production)
check_jwt_secret() {
  if [ -z "${JWT_SECRET:-}" ]; then
    warn "JWT_SECRET is not set (will use default dev secret)"
    echo "  → ⚠️  WARNING: Using default JWT secret is insecure for production!"
    echo "  → Please set JWT_SECRET in .env file"
    return 0
  fi

  if [ ${#JWT_SECRET} -lt 32 ]; then
    warn "JWT_SECRET is too short (recommended: at least 32 characters)"
    echo "  → Current length: ${#JWT_SECRET}"
  fi

  ok "JWT_SECRET is set (length: ${#JWT_SECRET})"
  return 0
}

# Check repository mode variables (optional, have defaults)
check_repo_vars() {
  local repo_vars=(
    "ORDER_REPO"
    "ADDRESS_REPO"
    "DOG_REPO"
    "RECIPE_REPO"
    "SHIPPING_REPO"
    "PRODUCTION_REPO"
    "INVENTORY_REPO"
  )

  info "Checking repository mode variables (optional, have defaults)..."

  for var in "${repo_vars[@]}"; do
    if [ -n "${!var:-}" ]; then
      local value="${!var}"
      if [ "$value" != "memory" ] && [ "$value" != "prisma" ]; then
        INVALID_VARS+=("$var")
        fail "$var has invalid value: $value (must be 'memory' or 'prisma')"
      else
        ok "$var is set: $value"
      fi
    else
      # Show default behavior
      if [ "$var" = "PRODUCTION_REPO" ] || [ "$var" = "INVENTORY_REPO" ]; then
        info "$var is not set (default: prisma)"
      else
        info "$var is not set (default: memory)"
      fi
    fi
  done
}

# Main validation
echo "Checking required variables..."
echo ""

check_database_url
echo ""

check_port
echo ""

check_jwt_secret
echo ""

check_repo_vars
echo ""

# Summary
echo "=========================================="
echo "Verification Summary"
echo "=========================================="
echo ""

if [ ${#MISSING_VARS[@]} -eq 0 ] && [ ${#EMPTY_VARS[@]} -eq 0 ] && [ ${#INVALID_VARS[@]} -eq 0 ]; then
  ok "All environment variables are valid!"
  echo ""
  info "Next steps:"
  echo "  1. Run database migrations: pnpm prisma migrate deploy"
  echo "  2. Generate Prisma client: pnpm prisma generate"
  echo "  3. Build the project: pnpm run build"
  echo "  4. Start the service: pnpm start:prod"
  exit 0
else
  fail "Some environment variables need attention:"
  echo ""
  
  if [ ${#MISSING_VARS[@]} -gt 0 ]; then
    fail "Missing variables:"
    for var in "${MISSING_VARS[@]}"; do
      echo "  - $var"
    done
    echo ""
  fi
  
  if [ ${#EMPTY_VARS[@]} -gt 0 ]; then
    fail "Empty variables:"
    for var in "${EMPTY_VARS[@]}"; do
      echo "  - $var"
    done
    echo ""
  fi
  
  if [ ${#INVALID_VARS[@]} -gt 0 ]; then
    fail "Invalid variables:"
    for var in "${INVALID_VARS[@]}"; do
      echo "  - $var"
    done
    echo ""
  fi
  
  echo "Please fix the issues above and run this script again."
  exit 1
fi
