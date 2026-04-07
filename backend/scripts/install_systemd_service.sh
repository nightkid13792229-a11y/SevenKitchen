#!/usr/bin/env bash
# Systemd Service Installation Script
# Creates and installs a systemd service for SevenKitchen backend

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
BACKEND_DIR="${BACKEND_DIR:-$(cd "$SCRIPT_DIR/.." && pwd)}"
SERVICE_NAME="${SERVICE_NAME:-sevenkitchen-backend}"
SERVICE_DESCRIPTION="${SERVICE_DESCRIPTION:-SevenKitchen Backend API Service}"
SERVICE_IDENTIFIER="${SERVICE_IDENTIFIER:-$SERVICE_NAME}"
ENV_FILE="${ENV_FILE:-$BACKEND_DIR/.env}"
APP_ENTRY="${APP_ENTRY:-$BACKEND_DIR/dist/src/main.js}"

# Check if running as root (for systemctl operations)
if [ "$EUID" -ne 0 ]; then
  fail "This script must be run as root (use sudo)"
  exit 1
fi

echo "=========================================="
echo "Systemd Service Installation"
echo "=========================================="
echo ""

# Detect user who will run the service
if [ -n "${SUDO_USER:-}" ]; then
  SERVICE_USER="$SUDO_USER"
else
  SERVICE_USER="$USER"
fi

info "Service will run as user: $SERVICE_USER"
info "Backend directory: $BACKEND_DIR"
echo ""

# Verify backend directory exists
if [ ! -d "$BACKEND_DIR" ]; then
  fail "Backend directory not found: $BACKEND_DIR"
  exit 1
fi

# Verify dist directory exists (build output)
if [ ! -d "$BACKEND_DIR/dist" ]; then
  warn "dist directory not found. The service may fail to start."
  warn "Please run 'pnpm run build' first, or the service will start after build."
fi

# Get Node.js path
NODE_PATH=$(which node)
if [ -z "$NODE_PATH" ]; then
  fail "Node.js not found in PATH"
  exit 1
fi
info "Node.js path: $NODE_PATH"

# Get pnpm path (if available)
PNPM_PATH=$(which pnpm 2>/dev/null || echo "")

# Determine PORT from env file or use default
PORT="${PORT:-3000}"
if [ -f "$ENV_FILE" ]; then
  if grep -q "^PORT=" "$ENV_FILE"; then
    PORT=$(grep "^PORT=" "$ENV_FILE" | cut -d '=' -f2 | tr -d '"' | tr -d "'" | xargs)
  fi
fi
info "Service will listen on port: $PORT"

# Create systemd service file
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

info "Creating systemd service file: $SERVICE_FILE"

cat > "$SERVICE_FILE" << EOF
[Unit]
Description=${SERVICE_DESCRIPTION}
After=network.target postgresql.service
Wants=network.target

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=$BACKEND_DIR
Environment="NODE_ENV=production"
Environment="PORT=$PORT"
EnvironmentFile=$ENV_FILE
ExecStart=$NODE_PATH $APP_ENTRY
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=$SERVICE_IDENTIFIER

# Security settings
NoNewPrivileges=true
PrivateTmp=true

# Resource limits (adjust as needed)
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF

ok "Service file created"
echo ""

# Reload systemd daemon
info "Reloading systemd daemon..."
systemctl daemon-reload
ok "Systemd daemon reloaded"
echo ""

# Enable service (start on boot)
info "Enabling service (start on boot)..."
systemctl enable "${SERVICE_NAME}.service"
ok "Service enabled"
echo ""

# Check if service is already running
if systemctl is-active --quiet "${SERVICE_NAME}.service"; then
  info "Service is already running, restarting..."
  systemctl restart "${SERVICE_NAME}.service"
else
  info "Starting service..."
  systemctl start "${SERVICE_NAME}.service"
fi

# Wait a moment for service to start
sleep 2

# Check service status
echo ""
info "Service status:"
systemctl status "${SERVICE_NAME}.service" --no-pager -l || true
echo ""

# Show useful commands
echo "=========================================="
ok "Systemd service installed successfully!"
echo "=========================================="
echo ""
info "Useful commands:"
echo "  Start service:   sudo systemctl start ${SERVICE_NAME}"
echo "  Stop service:    sudo systemctl stop ${SERVICE_NAME}"
echo "  Restart service: sudo systemctl restart ${SERVICE_NAME}"
echo "  View status:     sudo systemctl status ${SERVICE_NAME}"
echo "  View logs:       sudo journalctl -u ${SERVICE_NAME} -f"
echo "  View recent:     sudo journalctl -u ${SERVICE_NAME} -n 50"
echo ""

# Verify service is running
if systemctl is-active --quiet "${SERVICE_NAME}.service"; then
  ok "Service is running"
  
  # Test health endpoint
  info "Testing health endpoint..."
  sleep 1
  if curl -s -f "http://127.0.0.1:$PORT/api/v1/health" > /dev/null 2>&1; then
    ok "Health endpoint is responding"
  else
    warn "Health endpoint is not responding yet (service may still be starting)"
    warn "Check logs: sudo journalctl -u ${SERVICE_NAME} -f"
  fi
else
  fail "Service failed to start"
  echo ""
  info "Check logs for errors:"
  echo "  sudo journalctl -u ${SERVICE_NAME} -n 50"
  exit 1
fi

echo ""
