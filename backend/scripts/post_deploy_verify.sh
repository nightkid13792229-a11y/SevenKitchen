#!/usr/bin/env bash
# Post-Deployment Verification Script
# Verifies that the deployment is successful and service is accessible

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

# Load .env file if it exists
PORT=3000
if [ -f "$BACKEND_DIR/.env" ]; then
  set -a
  source "$BACKEND_DIR/.env"
  set +a
  if [ -n "${PORT:-}" ]; then
    PORT="$PORT"
  fi
fi

echo "=========================================="
echo "Post-Deployment Verification"
echo "=========================================="
echo ""

# Track results
declare -a PASSED=()
declare -a FAILED=()

# Test 1: Check if service is running (if systemd is used)
test_service_running() {
  echo "Test 1: Checking if service is running..."
  if systemctl list-unit-files | grep -q sevenkitchen-backend.service; then
    if systemctl is-active --quiet sevenkitchen-backend.service; then
      ok "Systemd service is running"
      PASSED+=("Service running")
      return 0
    else
      fail "Systemd service is installed but not running"
      FAILED+=("Service not running")
      return 1
    fi
  else
    warn "Systemd service not found (service may be running manually)"
    info "Skipping service status check"
    return 0
  fi
}

# Test 2: Check if port is listening
test_port_listening() {
  echo ""
  echo "Test 2: Checking if port $PORT is listening..."
  if command -v netstat >/dev/null 2>&1; then
    if netstat -tln 2>/dev/null | grep -q ":$PORT "; then
      ok "Port $PORT is listening"
      PASSED+=("Port listening")
      return 0
    else
      fail "Port $PORT is not listening"
      FAILED+=("Port not listening")
      return 1
    fi
  elif command -v ss >/dev/null 2>&1; then
    if ss -tln 2>/dev/null | grep -q ":$PORT "; then
      ok "Port $PORT is listening"
      PASSED+=("Port listening")
      return 0
    else
      fail "Port $PORT is not listening"
      FAILED+=("Port not listening")
      return 1
    fi
  else
    warn "netstat/ss not found, skipping port check"
    return 0
  fi
}

# Test 3: Health endpoint (localhost)
test_health_local() {
  echo ""
  echo "Test 3: Testing health endpoint (localhost)..."
  local response
  local status_code
  
  if response=$(curl -s -w "\n%{http_code}" "http://127.0.0.1:$PORT/api/v1/health" 2>/dev/null); then
    status_code=$(echo "$response" | tail -n1)
    response_body=$(echo "$response" | head -n-1)
    
    if [ "$status_code" = "200" ]; then
      if echo "$response_body" | grep -q '"status":"ok"'; then
        ok "Health endpoint responded successfully"
        info "Response: $response_body"
        PASSED+=("Health endpoint (localhost)")
        return 0
      else
        fail "Health endpoint returned unexpected response"
        info "Response: $response_body"
        FAILED+=("Health endpoint response")
        return 1
      fi
    else
      fail "Health endpoint returned status code: $status_code"
      FAILED+=("Health endpoint status")
      return 1
    fi
  else
    fail "Failed to connect to health endpoint"
    FAILED+=("Health endpoint connection")
    return 1
  fi
}

# Test 4: Health endpoint (public IP - if provided)
test_health_public() {
  echo ""
  echo "Test 4: Testing health endpoint (public IP)..."
  
  # Try to detect public IP
  local public_ip
  if [ -n "${PUBLIC_IP:-}" ]; then
    public_ip="$PUBLIC_IP"
  else
    # Try to get public IP automatically
    public_ip=$(curl -s ifconfig.me 2>/dev/null || curl -s ipinfo.io/ip 2>/dev/null || echo "")
  fi
  
  if [ -z "$public_ip" ]; then
    warn "Could not detect public IP, skipping public access test"
    info "To test public access, set PUBLIC_IP environment variable or test manually:"
    info "  curl http://<your-public-ip>:$PORT/api/v1/health"
    return 0
  fi
  
  info "Testing public IP: $public_ip"
  local response
  local status_code
  
  if response=$(curl -s -w "\n%{http_code}" "http://$public_ip:$PORT/api/v1/health" 2>/dev/null); then
    status_code=$(echo "$response" | tail -n1)
    response_body=$(echo "$response" | head -n-1)
    
    if [ "$status_code" = "200" ]; then
      if echo "$response_body" | grep -q '"status":"ok"'; then
        ok "Public health endpoint responded successfully"
        info "Response: $response_body"
        PASSED+=("Health endpoint (public)")
        return 0
      else
        fail "Public health endpoint returned unexpected response"
        info "Response: $response_body"
        FAILED+=("Public health endpoint response")
        return 1
      fi
    else
      warn "Public health endpoint returned status code: $status_code"
      warn "This may be due to firewall or security group settings"
      info "Please check:"
      info "  1. Firewall allows port $PORT: sudo ufw status"
      info "  2. Cloud provider security group allows port $PORT"
      return 0
    fi
  else
    warn "Failed to connect to public health endpoint"
    warn "This may be due to firewall or security group settings"
    info "Please check firewall and security group configurations"
    return 0
  fi
}

# Test 5: Database connection (if DATABASE_URL is set)
test_database_connection() {
  echo ""
  echo "Test 5: Testing database connection..."
  
  if [ -z "${DATABASE_URL:-}" ]; then
    warn "DATABASE_URL not set, skipping database connection test"
    return 0
  fi
  
  if command -v psql >/dev/null 2>&1; then
    if psql "$DATABASE_URL" -c "SELECT 1;" >/dev/null 2>&1; then
      ok "Database connection successful"
      PASSED+=("Database connection")
      return 0
    else
      fail "Database connection failed"
      FAILED+=("Database connection")
      return 1
    fi
  else
    warn "psql not found, skipping database connection test"
    info "Install PostgreSQL client to test database connection: sudo apt install postgresql-client"
    return 0
  fi
}

# Run all tests
test_service_running
test_port_listening
test_health_local
test_health_public
test_database_connection

# Summary
echo ""
echo "=========================================="
echo "Verification Summary"
echo "=========================================="
echo ""

if [ ${#PASSED[@]} -gt 0 ]; then
  ok "Passed tests (${#PASSED[@]}):"
  for test in "${PASSED[@]}"; do
    echo "  ✓ $test"
  done
  echo ""
fi

if [ ${#FAILED[@]} -gt 0 ]; then
  fail "Failed tests (${#FAILED[@]}):"
  for test in "${FAILED[@]}"; do
    echo "  ✗ $test"
  done
  echo ""
  info "Troubleshooting:"
  echo "  1. Check service logs: sudo journalctl -u sevenkitchen-backend -n 50"
  echo "  2. Check service status: sudo systemctl status sevenkitchen-backend"
  echo "  3. Verify environment variables: bash scripts/verify_env.sh"
  echo "  4. Check port availability: sudo netstat -tlnp | grep $PORT"
  exit 1
else
  ok "All tests passed! Deployment is successful."
  echo ""
  info "Service is accessible at:"
  echo "  Local:   http://127.0.0.1:$PORT/api/v1/health"
  echo "  Public:  http://<your-public-ip>:$PORT/api/v1/health"
  echo ""
  exit 0
fi

