#!/usr/bin/env bash
# SSH Helper - Pure SSH Connection Tool
# This script ONLY handles SSH connections and command execution
# It does NOT contain any business logic

set -euo pipefail

# ============================================================================
# Configuration (can be overridden by caller)
# ============================================================================
SERVER_HOST="${SERVER_HOST:-1.14.3.2}"
SERVER_USER="${SERVER_USER:-root}"
SSH_KEY_PATH="${SSH_KEY_PATH:-$HOME/.ssh/claude_deploy}"

# ============================================================================
# SSH Connection Functions (from production-ssh skill)
# ============================================================================

# validate_ssh_connection - Test SSH connection before executing commands
# Usage: validate_ssh_connection
# Returns: 0 on success, 1 on failure
validate_ssh_connection() {
  # Check if SSH key exists
  if [ ! -f "$SSH_KEY_PATH" ]; then
    echo "ERROR: SSH key not found: $SSH_KEY_PATH"
    echo "Please run: ssh-keygen -t ed25519 -C \"claude-deploy\" -f ~/.ssh/claude_deploy"
    return 1
  fi

  # Test SSH connection
  if ! ssh -i "$SSH_KEY_PATH" \
          -o ConnectTimeout=10 \
          -o StrictHostKeyChecking=no \
          -o BatchMode=yes \
          "${SERVER_USER}@${SERVER_HOST}" \
          "echo 'Connection test successful'" >/dev/null 2>&1; then
    echo "ERROR: SSH connection test failed to ${SERVER_USER}@${SERVER_HOST}"
    echo "Please check:"
    echo "  1. Server is accessible"
    echo "  2. SSH key is properly configured on server"
    echo "  3. Firewall allows SSH (port 22)"
    return 1
  fi

  echo "✓ SSH connection validated"
  return 0
}

# ssh_exec - Execute a single command on remote server
# Usage: ssh_exec "command"
# Returns: SSH exit code
ssh_exec() {
  local command="$1"

  ssh -i "$SSH_KEY_PATH" \
      -o ConnectTimeout=10 \
      -o StrictHostKeyChecking=no \
      "${SERVER_USER}@${SERVER_HOST}" \
      "$command"

  return $?
}

# ssh_exec_multiline - Execute multiple commands via heredoc
# Usage: ssh_exec_multiline
# Then provide commands via stdin
# Returns: SSH exit code
ssh_exec_multiline() {
  ssh -i "$SSH_KEY_PATH" \
      -o ConnectTimeout=10 \
      -o StrictHostKeyChecking=no \
      "${SERVER_USER}@${SERVER_HOST}" \
      "bash -s"

  return $?
}

# ssh_upload - Upload file to remote server
# Usage: ssh_upload local_path remote_path
# Returns: SCP exit code
ssh_upload() {
  local local_path="$1"
  local remote_path="$2"

  scp -i "$SSH_KEY_PATH" \
      -o ConnectTimeout=10 \
      -o StrictHostKeyChecking=no \
      "$local_path" \
      "${SERVER_USER}@${SERVER_HOST}:${remote_path}"

  return $?
}

# ssh_download - Download file from remote server
# Usage: ssh_download remote_path local_path
# Returns: SCP exit code
ssh_download() {
  local remote_path="$1"
  local local_path="$2"

  scp -i "$SSH_KEY_PATH" \
      -o ConnectTimeout=10 \
      -o StrictHostKeyChecking=no \
      "${SERVER_USER}@${SERVER_HOST}:${remote_path}" \
      "$local_path"

  return $?
}

# ============================================================================
# Export functions for use in other scripts
# ============================================================================
export -f validate_ssh_connection
export -f ssh_exec
export -f ssh_exec_multiline
export -f ssh_upload
export -f ssh_download
