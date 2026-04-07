#!/usr/bin/env bash
# Gray deployment wrapper for SevenKitchen backend on Lighthouse

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

export SERVICE_NAME="${SERVICE_NAME:-sevenkitchen-backend-gray}"
export ENV_FILE="${ENV_FILE:-$BACKEND_DIR/.env.gray}"
export PORT="${PORT:-3003}"

bash "$SCRIPT_DIR/deploy_lighthouse.sh"
