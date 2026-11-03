#!/usr/bin/env bash
# SevenKitchen 多会话协作公共函数
#
# 被 session.sh / gate.sh / 部署脚本 source。
# 设计原则：
#   1. 共享状态放在 git 公共目录（所有 worktree 共用），不放在某个工作区里；
#   2. 门禁用 mkdir 原子创建，目录里写持有者、任务、开始时间、TTL；
#   3. 会话异常退出后，靠 pid / TTL 自动判定过期，不需要人工删锁。
#
# 注意：调用方应先 `set -euo pipefail`。本文件不主动改调用方的 shell 选项。

# 以库文件位置锁定仓库根，不依赖调用时的 cwd。
# 部署脚本会 cd 到临时构建目录，cleanup 时如果还按 cwd 找 .git，锁就释放不掉。
COLLAB_REPO_ROOT="${COLLAB_REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"

# ---------------------------------------------------------------------------
# 基础路径
# ---------------------------------------------------------------------------

# 主工作区（git worktree list 的第一条），所有工位都从它切出去
collab_main_worktree() {
  git -C "$COLLAB_REPO_ROOT" worktree list --porcelain 2>/dev/null \
    | awk 'NR==1 && $1=="worktree" {sub(/^worktree /,""); print; exit}'
}

# git 公共目录：主工作区是 .git，工位里会解析回主仓库的 .git
collab_common_dir() {
  local top common
  top="${COLLAB_REPO_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null)}" || return 1
  common="$(git -C "$top" rev-parse --git-common-dir 2>/dev/null)" || return 1
  ( cd "$top" && cd "$common" && pwd )
}

# 共享状态目录：<git-common-dir>/sevenkitchen
# 这里放门禁、任务登记、部署状态；不进入 git，只在本机共享。
collab_state_dir() {
  local base
  base="$(collab_common_dir)" || return 1
  base="$base/sevenkitchen"
  mkdir -p "$base/locks" "$base/tasks" "$base/deploy-state"
  printf '%s\n' "$base"
}

collab_now() {
  date '+%Y-%m-%d %H:%M:%S'
}

collab_host() {
  hostname -s 2>/dev/null || hostname
}

# 把 "YYYY-MM-DD HH:MM:SS" 转成 epoch；兼容 macOS / Linux
collab_epoch() {
  local s="$1"
  if date -j -f '%Y-%m-%d %H:%M:%S' "$s" '+%s' 2>/dev/null; then
    return 0
  fi
  date -d "$s" '+%s' 2>/dev/null
}

# 从 owner/meta 文件里取一个键的值（值里可以有空格，不能有换行）
collab_meta_get() {
  local file="$1" key="$2"
  [ -f "$file" ] || return 0
  sed -n "s/^${key}=//p" "$file" 2>/dev/null | head -1
}

# ---------------------------------------------------------------------------
# 门禁（互斥锁）
# ---------------------------------------------------------------------------

collab_lock_dir() {
  local state
  state="$(collab_state_dir)" || return 1
  printf '%s/locks/%s.lock\n' "$state" "$1"
}

# 判断门禁是否已过期。返回 0 = 过期，可以清理。
collab_lock_is_stale() {
  local dir="$1" owner="$1/owner"
  local host pid started ttl now age mtime mode

  [ -d "$dir" ] || return 1

  # 刚 mkdir 还没来得及写 owner：给 60 秒宽限
  if [ ! -f "$owner" ]; then
    mtime="$(stat -f %m "$dir" 2>/dev/null || stat -c %Y "$dir" 2>/dev/null || echo 0)"
    now="$(date +%s)"
    [ $((now - mtime)) -gt 60 ]
    return $?
  fi

  host="$(collab_meta_get "$owner" host)"
  pid="$(collab_meta_get "$owner" pid)"
  started="$(collab_meta_get "$owner" started)"
  ttl="$(collab_meta_get "$owner" ttl)"
  mode="$(collab_meta_get "$owner" mode)"

  case "$ttl" in
    ''|*[!0-9]*) ttl=1800 ;;
  esac

  now="$(date +%s)"
  if [ -n "$started" ]; then
    age=$((now - $(collab_epoch "$started" || echo "$now")))
  else
    age=0
  fi

  # 超过 TTL：无论进程是否还在，都视为过期（防止 pid 复用）
  if [ "$ttl" -gt 0 ] && [ "$age" -ge "$ttl" ]; then
    return 0
  fi

  # 同一台机器上，持有进程已经没了：立即视为过期（手动占用的锁除外）
  if [ "$mode" != "manual" ] \
     && [ -n "$host" ] && [ "$host" = "$(collab_host)" ] \
     && [ -n "$pid" ] && ! kill -0 "$pid" 2>/dev/null; then
    return 0
  fi

  return 1
}

# 拿门禁。成功时把 token 打到 stdout，过程信息走 stderr。
# 用法：token="$(collab_lock_acquire <资源> <任务名> [ttl秒] [最多等待秒] [mode])"
#   mode=process（默认）：持有进程退出即视为过期，适合脚本内部持有；
#   mode=manual：手动占用，进程退出不释放，只按 TTL 过期，适合 gate.sh acquire。
collab_lock_acquire() {
  local resource="$1" task="$2" ttl="${3:-1800}" wait_s="${4:-0}" mode="${5:-process}"
  local dir token waited=0 holder hbranch hstarted stale
  dir="$(collab_lock_dir "$resource")" || return 1
  token="$$-$(date +%s)-$RANDOM"

  while :; do
    if mkdir "$dir" 2>/dev/null; then
      if ! {
        printf 'resource=%s\n' "$resource"
        printf 'task=%s\n' "$task"
        printf 'branch=%s\n' "$(git branch --show-current 2>/dev/null || true)"
        printf 'worktree=%s\n' "$(git rev-parse --show-toplevel 2>/dev/null || true)"
        printf 'pid=%s\n' "$$"
        printf 'host=%s\n' "$(collab_host)"
        printf 'started=%s\n' "$(collab_now)"
        printf 'ttl=%s\n' "$ttl"
        printf 'mode=%s\n' "$mode"
        printf 'token=%s\n' "$token"
      } > "$dir/owner" 2>/dev/null; then
        rm -rf "$dir"
        return 1
      fi
      printf '%s\n' "$token"
      return 0
    fi

    if collab_lock_is_stale "$dir"; then
      stale="$dir.stale.$$.$RANDOM"
      if mv "$dir" "$stale" 2>/dev/null; then
        rm -rf "$stale"
        printf 'ℹ 清理过期门禁：%s\n' "$resource" >&2
        continue
      fi
    fi

    holder="$(collab_meta_get "$dir/owner" task)"
    hbranch="$(collab_meta_get "$dir/owner" branch)"
    hstarted="$(collab_meta_get "$dir/owner" started)"
    [ -n "$holder" ] || holder="（未知）"

    if [ "$wait_s" -le 0 ]; then
      printf '✗ 门禁 %s 被占用：%s（分支 %s，开始于 %s）\n' \
        "$resource" "$holder" "${hbranch:-?}" "${hstarted:-?}" >&2
      return 1
    fi
    if [ "$waited" -eq 0 ]; then
      printf 'ℹ 门禁 %s 被 %s 占用，排队等待（最多 %s 秒）...\n' \
        "$resource" "$holder" "$wait_s" >&2
    fi
    sleep 3
    waited=$((waited + 3))
    if [ "$waited" -ge "$wait_s" ]; then
      printf '✗ 等待门禁 %s 超时（占用者：%s）\n' "$resource" "$holder" >&2
      return 1
    fi
  done
}

# 按绝对路径释放门禁；不依赖 cwd，部署脚本 cd 到临时目录后仍能释放
collab_lock_release_at() {
  local dir="$1" token="${2:-}" owner
  [ -d "$dir" ] || return 1
  owner="$(collab_meta_get "$dir/owner" token)"
  if [ -z "$token" ] || [ "$owner" != "$token" ]; then
    printf '⚠ 门禁 %s 的持有者已变化，跳过释放\n' "$(basename "$dir" .lock)" >&2
    return 1
  fi
  rm -rf "$dir"
}

# 释放门禁；只有 token 对得上才删，避免误删别人的锁
collab_lock_release() {
  local resource="$1" token="${2:-}"
  local dir
  dir="$(collab_lock_dir "$resource")" || return 1
  collab_lock_release_at "$dir" "$token"
}

# 打印当前所有门禁
collab_lock_status() {
  local state dir found=0
  local resource task branch started ttl pid host age note
  state="$(collab_state_dir)" || return 1

  printf '共享出口门禁：\n'
  for dir in "$state"/locks/*.lock; do
    [ -d "$dir" ] || continue
    found=1
    resource="$(basename "$dir" .lock)"
    task="$(collab_meta_get "$dir/owner" task)"
    branch="$(collab_meta_get "$dir/owner" branch)"
    started="$(collab_meta_get "$dir/owner" started)"
    ttl="$(collab_meta_get "$dir/owner" ttl)"
    pid="$(collab_meta_get "$dir/owner" pid)"
    host="$(collab_meta_get "$dir/owner" host)"
    note=""
    if [ -n "$started" ]; then
      age=$(( $(date +%s) - $(collab_epoch "$started" || echo "$(date +%s)") ))
      note="已占用 ${age}s"
    fi
    if collab_lock_is_stale "$dir"; then
      note="$note，已过期（下次获取会自动清理）"
    fi
    printf '  - %-18s %s\n' "$resource" "${task:-（未知任务）}"
    printf '    分支 %s，开始 %s，%s\n' "${branch:-?}" "${started:-?}" "${note:-?}"
    printf '    进程 %s@%s，TTL %ss\n' "${pid:-?}" "${host:-?}" "${ttl:-?}"
  done
  if [ "$found" -eq 0 ]; then
    printf '  （没有门禁被占用）\n'
  fi
}
