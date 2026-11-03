#!/usr/bin/env bash
# 协作脚本冒烟测试：不碰真实仓库，全程在临时目录里跑。
# 覆盖回归点：
#   1. 门禁释放不依赖 cwd（部署脚本会 cd 到临时目录）
#   2. 两个工位在 backend 启动前不会拿到同一个端口
#   3. 主工作区已有“上次合并”、origin/main 又前进时，merge 能回退/重变基/重推
#   4. cleanup 能删干净工位、分支和登记
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/sevenkitchen-smoke.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

fail() { printf '✗ %s\n' "$*" >&2; exit 1; }
ok()   { printf '✓ %s\n' "$*"; }

REMOTE="$TMP/remote.git"
SEED="$TMP/seed"

git init --bare --quiet "$REMOTE"
git init --quiet "$SEED"
git -C "$SEED" config user.email smoke@example.com
git -C "$SEED" config user.name "Smoke Test"
git -C "$SEED" config commit.gpgsign false

mkdir -p "$SEED/scripts/lib" "$SEED/scripts/hooks" "$SEED/backend" "$SEED/admin-web" "$SEED/miniapp"
cp -R "$ROOT/scripts/lib/." "$SEED/scripts/lib/"
cp "$ROOT/scripts/session.sh" "$SEED/scripts/session.sh"
cp "$ROOT/scripts/gate.sh" "$SEED/scripts/gate.sh"
cp "$ROOT/scripts/hooks/pre-commit" "$SEED/scripts/hooks/pre-commit"
cp "$ROOT/scripts/hooks/pre-push" "$SEED/scripts/hooks/pre-push"
chmod +x "$SEED/scripts/session.sh" "$SEED/scripts/gate.sh" \
  "$SEED/scripts/hooks/pre-commit" "$SEED/scripts/hooks/pre-push"

printf 'seed\n' > "$SEED/README.md"
git -C "$SEED" add -A
git -C "$SEED" commit -q -m "chore: seed"
git -C "$SEED" branch -M main
git -C "$SEED" remote add origin "$REMOTE"
git -C "$SEED" push -q -u origin main

# ---------------------------------------------------------------------------
# 1. 门禁：从仓库外释放
# ---------------------------------------------------------------------------
(
  cd "$TMP"
  # shellcheck disable=SC1090
  source "$SEED/scripts/lib/collab.sh"
  token="$(collab_lock_acquire smoke-lock "smoke" 60 0)"
  lock_dir="$(collab_lock_dir smoke-lock)"
  [ -d "$lock_dir" ] || fail "门禁没有创建：$lock_dir"
  collab_lock_release_at "$lock_dir" "$token"
  [ ! -d "$lock_dir" ] || fail "门禁没有释放：$lock_dir"
)
ok "门禁可从仓库外释放"

# ---------------------------------------------------------------------------
# 2. 工位：端口不冲突
# ---------------------------------------------------------------------------
cd "$SEED"
bash scripts/session.sh start "smoke merge" --no-deps --slug smoke >/tmp/sevenkitchen-smoke-start.log 2>&1 \
  || { cat /tmp/sevenkitchen-smoke-start.log >&2; fail "session start 失败"; }

WT="$(git -C "$SEED" worktree list --porcelain | awk '
  /^worktree / { p=substr($0, 10) }
  /^branch / { if ($2 ~ /smoke$/) { print p; exit } }
')"
[ -n "$WT" ] || fail "找不到 smoke 工位"
BRANCH="$(git -C "$WT" branch --show-current)"

bash scripts/session.sh start "smoke two" --no-deps --slug smoke-two >/tmp/sevenkitchen-smoke-start2.log 2>&1 \
  || { cat /tmp/sevenkitchen-smoke-start2.log >&2; fail "第二个 session start 失败"; }
WT2="$(git -C "$SEED" worktree list --porcelain | awk '
  /^worktree / { p=substr($0, 10) }
  /^branch / { if ($2 ~ /smoke-two$/) { print p; exit } }
')"
[ -n "$WT2" ] || fail "找不到 smoke-two 工位"
BRANCH2="$(git -C "$WT2" branch --show-current)"

META1="$(find "$SEED/.git/sevenkitchen/tasks" -maxdepth 1 -name '*smoke.meta' | head -1)"
META2="$(find "$SEED/.git/sevenkitchen/tasks" -maxdepth 1 -name '*smoke-two.meta' | head -1)"
PORT1="$(awk -F= '/^port=/{print $2}' "$META1")"
PORT2="$(awk -F= '/^port=/{print $2}' "$META2")"
[ -n "$PORT1" ] && [ -n "$PORT2" ] || fail "工位没有记录端口"
[ "$PORT1" != "$PORT2" ] || fail "两个工位拿到同一端口：$PORT1"
ok "两个工位端口不冲突（$PORT1 / $PORT2）"

# ---------------------------------------------------------------------------
# 3. 合并恢复：main 已有上次合并，origin/main 又前进
# ---------------------------------------------------------------------------
printf 'feature\n' > "$WT/feature.txt"
( cd "$WT" && bash scripts/session.sh commit -m "feat: smoke" --all >/dev/null )

# 模拟“上一次 merge 已经快进到 main，但还没推送”
git -C "$SEED" merge --ff-only "$BRANCH" >/dev/null
[ "$(git -C "$SEED" rev-parse main)" = "$(git -C "$SEED" rev-parse "$BRANCH")" ] \
  || fail "模拟上次合并失败"

# 另一个会话推进 origin/main
git clone --quiet "$REMOTE" "$TMP/other"
git -C "$TMP/other" config user.email smoke2@example.com
git -C "$TMP/other" config user.name "Smoke Other"
git -C "$TMP/other" config commit.gpgsign false
printf 'other\n' > "$TMP/other/other.txt"
git -C "$TMP/other" add other.txt
git -C "$TMP/other" commit -q -m "feat: other"
git -C "$TMP/other" push -q origin main

( cd "$WT" && bash scripts/session.sh merge ) >/tmp/sevenkitchen-smoke-merge.log 2>&1 \
  || { cat /tmp/sevenkitchen-smoke-merge.log >&2; fail "并发推进后 merge 失败"; }

git -C "$SEED" fetch -q origin main
git -C "$SEED" cat-file -e origin/main:feature.txt || fail "feature 没进 origin/main"
git -C "$SEED" cat-file -e origin/main:other.txt || fail "other 没进 origin/main"
[ "$(git -C "$SEED" rev-parse main)" = "$(git -C "$SEED" rev-parse origin/main)" ] \
  || fail "本地 main 没和 origin/main 对齐"
[ -z "$(git -C "$SEED" status --porcelain --untracked-files=no)" ] \
  || fail "主工作区不干净"
ok "并发推进后 merge 可恢复"

# ---------------------------------------------------------------------------
# 4. 清理：已合并、未合并且 --force
# ---------------------------------------------------------------------------
( cd "$SEED" && bash scripts/session.sh cleanup "$BRANCH" ) >/tmp/sevenkitchen-smoke-cleanup.log 2>&1 \
  || { cat /tmp/sevenkitchen-smoke-cleanup.log >&2; fail "cleanup 已合并分支失败"; }
[ ! -d "$WT" ] || fail "cleanup 后工位目录还在"
( cd "$SEED" && bash scripts/session.sh cleanup "$BRANCH2" --force ) >/tmp/sevenkitchen-smoke-cleanup2.log 2>&1 \
  || { cat /tmp/sevenkitchen-smoke-cleanup2.log >&2; fail "cleanup --force 失败"; }
[ ! -d "$WT2" ] || fail "cleanup --force 后工位目录还在"
ok "cleanup 可删干净"

printf '\n全部通过\n'
