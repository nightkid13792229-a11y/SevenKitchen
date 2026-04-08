#!/bin/bash
# Pre-deploy check: verify Prisma schema is in sync with migrations
# Usage: bash scripts/pre-deploy-check.sh
# Exit code 0 = OK, 1 = schema drift detected

set -euo pipefail

echo "[Pre-deploy] Checking Prisma schema vs migrations..."

if bash scripts/check_migration_history.sh; then
  echo "[Pre-deploy] ✓ Applied migration history is in sync with local files"
  exit 0
fi

echo ""
echo "[Pre-deploy] Resolve missing or modified applied migrations before deploying."
exit 1
