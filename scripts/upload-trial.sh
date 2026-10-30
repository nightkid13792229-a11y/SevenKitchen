#!/usr/bin/env bash
#
# 上传微信体验版（唯一入口，2026-10-31）
#
# 为什么要有这个脚本：
#   体验版对一个 AppID 只有一个包，谁最后上传谁生效。以前直接跑
#   `cli upload`，构建用的是"当前工作区"的代码 —— 如果那个工作区不在
#   main 上（比如停在某个功能分支），传上去的包就会缺别人的改动，
#   顾客端会莫名其妙变回旧页面。
#
# 这个脚本保证三件事：
#   1. 永远从 origin/main 构建（不管当前在哪个分支、工作区干不干净）；
#   2. 同一时间只允许一个上传（防止两个会话撞包）；
#   3. 版本号自动递增并记录（能看到线上这一版对应哪个提交）。
#
# 用法：
#   bash scripts/upload-trial.sh "这次改了什么"
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLI="/Applications/wechatwebdevtools.app/Contents/MacOS/cli"
LOCK_DIR="$REPO_ROOT/.wechat-trial.lock"
STATE_FILE="$REPO_ROOT/.wechat-trial-state"
DESC="${1:-小程序更新}"
TODAY="$(date '+%Y.%m.%d')"

info() { printf '\033[0;34mℹ %s\033[0m\n' "$1"; }
ok()   { printf '\033[0;32m✓ %s\033[0m\n' "$1"; }
fail() { printf '\033[0;31m✗ %s\033[0m\n' "$1" >&2; }

if [ ! -x "$CLI" ]; then
  fail "找不到微信开发者工具命令行：$CLI"
  exit 1
fi

# ---- 1. 互斥锁：同一时间只允许一个上传 ----
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  fail "另一个上传正在进行（锁：$LOCK_DIR）"
  fail "如果确认没有在传，删除这个目录后重试"
  exit 1
fi

BUILD_ROOT=""
cleanup() {
  if [ -n "$BUILD_ROOT" ] && [ -d "$BUILD_ROOT" ]; then
    git -C "$REPO_ROOT" worktree remove "$BUILD_ROOT" --force >/dev/null 2>&1 || true
  fi
  rmdir "$LOCK_DIR" 2>/dev/null || true
}
trap cleanup EXIT

# ---- 2. 从 origin/main 构建 ----
info "拉取 origin/main..."
git -C "$REPO_ROOT" fetch origin main
DEPLOY_COMMIT="$(git -C "$REPO_ROOT" rev-parse origin/main)"
ok "构建提交：${DEPLOY_COMMIT:0:8} $(git -C "$REPO_ROOT" log -1 --format=%s origin/main)"

BUILD_ROOT="$(mktemp -d)"
info "在干净目录里构建（与当前工作区无关）..."
git -C "$REPO_ROOT" worktree add --quiet --detach "$BUILD_ROOT" "$DEPLOY_COMMIT"
ln -sfn "$REPO_ROOT/miniapp/node_modules" "$BUILD_ROOT/miniapp/node_modules"

( cd "$BUILD_ROOT/miniapp" && npm run build:mp-weixin >/dev/null 2>&1 )

if [ ! -f "$BUILD_ROOT/miniapp/dist/build/mp-weixin/app.json" ]; then
  fail "构建产物缺失：app.json"
  exit 1
fi
ok "构建完成"

# ---- 3. 把产物放进开发者工具认的目录 ----
rm -rf "$REPO_ROOT/miniapp/dist/build/mp-weixin"
cp -R "$BUILD_ROOT/miniapp/dist/build/mp-weixin" "$REPO_ROOT/miniapp/dist/build/mp-weixin"
ok "产物已就位：miniapp/dist/build/mp-weixin"

# ---- 4. 版本号：日期 + 当天序号 ----
SEQ=1
if [ -f "$STATE_FILE" ]; then
  PREV_DATE="$(awk '{print $1}' "$STATE_FILE")"
  PREV_SEQ="$(awk '{print $2}' "$STATE_FILE")"
  if [ "$PREV_DATE" = "$TODAY" ] && [ -n "$PREV_SEQ" ]; then
    SEQ=$((PREV_SEQ + 1))
  fi
fi
VERSION="${TODAY}.${SEQ}"

# ---- 5. 上传（失败重试一次，开发者工具偶发抽风）----
# 先把输出收进变量再判断：直接管道给 grep -q 会提前关闭管道，
# 让开发者工具进程收到 SIGPIPE，反而把成功当失败。
upload_once() {
  "$CLI" upload --project "$REPO_ROOT/miniapp" \
    --version "$VERSION" --desc "$DESC" --lang zh 2>&1 || true
}

info "上传体验版 ${VERSION} ..."
OUT="$(upload_once)"
if ! grep -q "✔ upload" <<< "$OUT"; then
  info "第一次没成功，重试一次..."
  sleep 3
  OUT="$(upload_once)"
  if ! grep -q "✔ upload" <<< "$OUT"; then
    printf '%s\n' "$OUT" | tail -15
    fail "上传失败，请看上面的输出"
    exit 1
  fi
fi

echo "$TODAY $SEQ $DEPLOY_COMMIT $(date '+%F %T')" > "$STATE_FILE"
ok "体验版 ${VERSION} 上传成功"
ok "对应提交：${DEPLOY_COMMIT:0:8}"
ok "记录：$STATE_FILE"
