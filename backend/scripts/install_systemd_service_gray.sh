#!/usr/bin/env bash
# Gray systemd service wrapper for SevenKitchen backend

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

export SERVICE_NAME="${SERVICE_NAME:-sevenkitchen-backend-gray}"
export SERVICE_DESCRIPTION="${SERVICE_DESCRIPTION:-SevenKitchen Backend Gray API Service}"
export SERVICE_IDENTIFIER="${SERVICE_IDENTIFIER:-sevenkitchen-backend-gray}"
export ENV_FILE="${ENV_FILE:-$BACKEND_DIR/.env.gray}"
export PORT="${PORT:-3003}"
export APP_ENTRY="${APP_ENTRY:-$BACKEND_DIR/dist/src/main.js}"

bash "$SCRIPT_DIR/install_systemd_service.sh"
