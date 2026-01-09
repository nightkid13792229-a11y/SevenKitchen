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
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

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

# Determine PORT from .env or use default
PORT=3000
if [ -f "$BACKEND_DIR/.env" ]; then
  if grep -q "^PORT=" "$BACKEND_DIR/.env"; then
    PORT=$(grep "^PORT=" "$BACKEND_DIR/.env" | cut -d '=' -f2 | tr -d '"' | tr -d "'" | xargs)
  fi
fi
info "Service will listen on port: $PORT"

# Create systemd service file
SERVICE_FILE="/etc/systemd/system/sevenkitchen-backend.service"

info "Creating systemd service file: $SERVICE_FILE"

cat > "$SERVICE_FILE" << EOF
[Unit]
Description=SevenKitchen Backend API Service
After=network.target postgresql.service
Wants=network.target

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=$BACKEND_DIR
Environment="NODE_ENV=production"
EnvironmentFile=$BACKEND_DIR/.env
ExecStart=$NODE_PATH $BACKEND_DIR/dist/main.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=sevenkitchen-backend

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
systemctl enable sevenkitchen-backend.service
ok "Service enabled"
echo ""

# Check if service is already running
if systemctl is-active --quiet sevenkitchen-backend.service; then
  info "Service is already running, restarting..."
  systemctl restart sevenkitchen-backend.service
else
  info "Starting service..."
  systemctl start sevenkitchen-backend.service
fi

# Wait a moment for service to start
sleep 2

# Check service status
echo ""
info "Service status:"
systemctl status sevenkitchen-backend.service --no-pager -l || true
echo ""

# Show useful commands
echo "=========================================="
ok "Systemd service installed successfully!"
echo "=========================================="
echo ""
info "Useful commands:"
echo "  Start service:   sudo systemctl start sevenkitchen-backend"
echo "  Stop service:    sudo systemctl stop sevenkitchen-backend"
echo "  Restart service: sudo systemctl restart sevenkitchen-backend"
echo "  View status:     sudo systemctl status sevenkitchen-backend"
echo "  View logs:       sudo journalctl -u sevenkitchen-backend -f"
echo "  View recent:     sudo journalctl -u sevenkitchen-backend -n 50"
echo ""

# Verify service is running
if systemctl is-active --quiet sevenkitchen-backend.service; then
  ok "Service is running"
  
  # Test health endpoint
  info "Testing health endpoint..."
  sleep 1
  if curl -s -f "http://127.0.0.1:$PORT/api/v1/health" > /dev/null 2>&1; then
    ok "Health endpoint is responding"
  else
    warn "Health endpoint is not responding yet (service may still be starting)"
    warn "Check logs: sudo journalctl -u sevenkitchen-backend -f"
  fi
else
  fail "Service failed to start"
  echo ""
  info "Check logs for errors:"
  echo "  sudo journalctl -u sevenkitchen-backend -n 50"
  exit 1
fi

echo ""

