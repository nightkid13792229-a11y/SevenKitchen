#!/usr/bin/env bash
#
# 共享出口门禁（跨工位共用）
#
# 合并 main、部署后端、部署后台、上传体验版、跑数据库迁移之前，
# 先在这里排队，避免两个会话同时动同一件共享资源。
#
# 常用：
#   bash scripts/gate.sh status
#   bash scripts/gate.sh acquire deploy-backend --task "后端部署" --ttl 3600
#   bash scripts/gate.sh release deploy-backend --token <token>
#   bash scripts/gate.sh run db-migrate --task "迁移" --ttl 1800 -- npx prisma migrate deploy
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/collab.sh
source "$SCRIPT_DIR/lib/collab.sh"

die() { printf '✗ %s\n' "$1" >&2; exit 1; }
ok() { printf '✓ %s\n' "$1"; }

usage() {
  cat <<'EOF'
用法：
  gate.sh status
  gate.sh acquire <资源> --task "谁在做什么" [--ttl 秒] [--wait 秒]
  gate.sh release <资源> --token <token>
  gate.sh run <资源> --task "谁在做什么" [--ttl 秒] [--wait 秒] -- <命令...>

资源名：
  merge-main         合并/推送 main
  deploy-backend     部署后端
  deploy-admin-web   部署后台
  upload-trial       上传小程序体验版
  db-migrate         跑 Prisma migration
EOF
}

cmd_acquire() {
  local resource="$1" task="" ttl=1800 wait_s=0
  shift
  while [ $# -gt 0 ]; do
    case "$1" in
      --task) [ $# -ge 2 ] || die "--task 需要值"; task="$2"; shift 2 ;;
      --ttl) [ $# -ge 2 ] || die "--ttl 需要值"; ttl="$2"; shift 2 ;;
      --wait) [ $# -ge 2 ] || die "--wait 需要值"; wait_s="$2"; shift 2 ;;
      -h|--help) usage; exit 0 ;;
      *) die "未知参数：$1" ;;
    esac
  done
  [ -n "$task" ] || task="手动占用"
  local token
  token="$(collab_lock_acquire "$resource" "$task" "$ttl" "$wait_s" manual)" \
    || die "门禁 $resource 被占用"
  ok "已拿到门禁 $resource" >&2
  printf '%s\n' "$token"
}

cmd_release() {
  local resource="$1" token=""
  shift
  while [ $# -gt 0 ]; do
    case "$1" in
      --token) [ $# -ge 2 ] || die "--token 需要值"; token="$2"; shift 2 ;;
      -h|--help) usage; exit 0 ;;
      *) die "未知参数：$1" ;;
    esac
  done
  [ -n "$token" ] || die "--token 必填（acquire 时会打印）"
  collab_lock_release "$resource" "$token" || die "释放失败（token 不匹配）"
  ok "已释放门禁 $resource"
}

cmd_run() {
  local resource="$1" task="" ttl=1800 wait_s=0
  shift
  while [ $# -gt 0 ]; do
    case "$1" in
      --task) [ $# -ge 2 ] || die "--task 需要值"; task="$2"; shift 2 ;;
      --ttl) [ $# -ge 2 ] || die "--ttl 需要值"; ttl="$2"; shift 2 ;;
      --wait) [ $# -ge 2 ] || die "--wait 需要值"; wait_s="$2"; shift 2 ;;
      --) shift; break ;;
      *) die "未知参数：$1（命令前要加 --）" ;;
    esac
  done
  [ $# -gt 0 ] || die "缺少要执行的命令"
  [ -n "$task" ] || task="手动占用"

  local token status
  token="$(collab_lock_acquire "$resource" "$task" "$ttl" "$wait_s")" \
    || die "门禁 $resource 被占用"
  # 注意：trap 在函数返回后才执行，token 是 local 会失效，所以在定义时展开
  trap "collab_lock_release '$resource' '$token' >/dev/null 2>&1 || true" EXIT

  set +e
  "$@"
  status=$?
  set -e
  exit "$status"
}

case "${1:-}" in
  status) collab_lock_status ;;
  acquire) shift; [ $# -ge 1 ] || die "缺少资源名"; cmd_acquire "$@" ;;
  release) shift; [ $# -ge 1 ] || die "缺少资源名"; cmd_release "$@" ;;
  run) shift; [ $# -ge 1 ] || die "缺少资源名"; cmd_run "$@" ;;
  help|-h|--help) usage ;;
  *) usage; exit 1 ;;
esac
