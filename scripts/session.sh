#!/usr/bin/env bash
#
# 多会话任务工位管理（唯一入口）
#
# 目标：一个任务 = 一个独立工位 + 一个独立分支 + 一份自己的提交。
# 主工作区只做合并和部署，不写代码。
#
# 常用：
#   bash scripts/session.sh start "订单卡片改版"
#   bash scripts/session.sh status
#   bash scripts/session.sh commit -m "feat(order): ..."
#   bash scripts/session.sh finish
#   bash scripts/session.sh merge
#   bash scripts/session.sh cleanup <分支或工位名>
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/collab.sh
source "$SCRIPT_DIR/lib/collab.sh"

die() { printf '✗ %s\n' "$1" >&2; exit 1; }
info() { printf 'ℹ %s\n' "$1"; }
ok() { printf '✓ %s\n' "$1"; }
warn() { printf '⚠ %s\n' "$1" >&2; }

usage() {
  cat <<'EOF'
用法：
  session.sh start "任务名" [--slug 英文短名] [--no-deps]
      从 origin/main 开一个独立工位和分支（task/日期-短名），
      自动复制 .env、克隆 node_modules、分配一个本地端口。

  session.sh status
      看主工作区状态、所有任务工位、以及共享出口门禁被谁占着。

  session.sh commit -m "提交说明" [--all | 文件路径...]
      在当前工位提交；拒绝在主工作区提交；提交前检查敏感文件/大文件/冲突标记。

  session.sh finish
      把当前工位分支推到 origin（备份），并提示下一步合并。

  session.sh merge [--no-push] [--wait 秒]
      拿 merge-main 门禁 → 同步 origin/main → rebase → 推送分支 →
      快进合并到主工作区 → 推送 main。失败会回滚并释放门禁。

  session.sh cleanup <分支或工位名> [--force]
      删除已合并的工位和分支；未合并时必须加 --force。

  session.sh install-hooks
      安装本机 git 钩子：禁止在 main 上直接提交；禁止绕过门禁推 main。

  session.sh help
EOF
}

# ---------------------------------------------------------------------------
# start
# ---------------------------------------------------------------------------

pick_port() {
  local p state used meta
  state="$(collab_state_dir 2>/dev/null || true)"
  for p in $(seq 3012 3099); do
    # 先看已登记工位，避免两个工位在启动后端前拿到同一个端口
    used=0
    for meta in "$state"/tasks/*.meta; do
      [ -f "$meta" ] || continue
      if [ "$(collab_meta_get "$meta" port)" = "$p" ]; then
        used=1
        break
      fi
    done
    [ "$used" -eq 1 ] && continue

    if command -v nc >/dev/null 2>&1; then
      if ! nc -z 127.0.0.1 "$p" >/dev/null 2>&1; then
        printf '%s\n' "$p"
        return 0
      fi
    else
      if ! lsof -nP -iTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1; then
        printf '%s\n' "$p"
        return 0
      fi
    fi
  done
  printf '3012\n'
}

set_env_port() {
  local file="$1" port="$2"
  [ -f "$file" ] || return 0
  if grep -q '^PORT=' "$file"; then
    sed -i.bak -E "s/^PORT=.*/PORT=${port}/" "$file"
    rm -f "${file}.bak"
  else
    printf '\nPORT=%s\n' "$port" >> "$file"
  fi
}

copy_env_files() {
  local main_wt="$1" wt="$2" rel
  for rel in \
    backend/.env \
    backend/.env.development \
    admin-web/.env.development \
    miniapp/.env.development; do
    if [ -f "$main_wt/$rel" ] && [ ! -e "$wt/$rel" ]; then
      mkdir -p "$(dirname "$wt/$rel")"
      cp -p "$main_wt/$rel" "$wt/$rel"
      info "已复制 $rel"
    fi
  done
}

clone_deps() {
  local main_wt="$1" wt="$2" rel
  for rel in node_modules backend/node_modules admin-web/node_modules miniapp/node_modules; do
    [ -d "$main_wt/$rel" ] || continue
    [ -e "$wt/$rel" ] && continue
    info "准备 $rel（APFS 克隆，通常几秒）..."
    if ! cp -cR "$main_wt/$rel" "$wt/$rel" 2>/dev/null; then
      cp -R "$main_wt/$rel" "$wt/$rel"
    fi
  done
}

cmd_start() {
  local task="" slug="" no_deps=0
  while [ $# -gt 0 ]; do
    case "$1" in
      --slug)
        [ $# -ge 2 ] || die "--slug 需要一个值"
        slug="$2"; shift 2 ;;
      --slug=*)
        slug="${1#*=}"; shift ;;
      --no-deps)
        no_deps=1; shift ;;
      -h|--help)
        usage; exit 0 ;;
      *)
        if [ -z "$task" ]; then task="$1"; else task="$task $1"; fi
        shift ;;
    esac
  done
  [ -n "$task" ] || die "用法：session.sh start \"任务名\" [--slug 英文短名] [--no-deps]"

  local main_wt cur_wt state date_tag id branch wt port
  main_wt="$(collab_main_worktree)"
  [ -n "$main_wt" ] || die "找不到主工作区；请在仓库内执行"

  cur_wt="$(git rev-parse --show-toplevel 2>/dev/null || true)"
  if [ -n "$cur_wt" ] && [ "$cur_wt" != "$main_wt" ]; then
    if [ -f "$(collab_state_dir)/tasks/$(basename "$cur_wt").meta" ]; then
      die "你当前在任务工位 $(basename "$cur_wt") 里；先 finish / cleanup，再开新任务"
    fi
  fi

  if [ -n "$(git -C "$main_wt" status --porcelain --untracked-files=no)" ]; then
    warn "主工作区还有未提交改动；新工位不会带上它们，建议先归位到任务工位"
  fi

  # 短名：优先用 --slug；否则从任务名提取 ASCII；中文任务名退化为时间戳
  if [ -z "$slug" ]; then
    slug="$(printf '%s' "$task" \
      | tr '[:upper:]' '[:lower:]' \
      | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//' \
      | cut -c1-32)"
  else
    slug="$(printf '%s' "$slug" \
      | tr '[:upper:]' '[:lower:]' \
      | sed -E 's/[^a-z0-9._-]+/-/g; s/^-+//; s/-+$//')"
  fi
  [ -n "$slug" ] || slug="t$(date +%H%M%S)"

  date_tag="$(date +%Y%m%d)"
  id="${date_tag}-${slug}"
  branch="task/${id}"
  wt="$main_wt/.worktrees/$id"

  if git -C "$main_wt" show-ref --verify --quiet "refs/heads/$branch"; then
    die "分支 $branch 已存在；不复用旧分支，请换一个任务名或先 cleanup"
  fi
  [ -e "$wt" ] && die "工位目录已存在：$wt"

  info "同步 origin/main ..."
  git -C "$main_wt" fetch origin main || die "拉取 origin/main 失败；检查网络后重试"

  info "创建工位 $id ..."
  git -C "$main_wt" worktree add -b "$branch" "$wt" origin/main >/dev/null

  port="$(pick_port)"
  copy_env_files "$main_wt" "$wt"
  set_env_port "$wt/backend/.env.development" "$port"
  set_env_port "$wt/backend/.env" "$port"
  if [ "$no_deps" -eq 0 ]; then
    clone_deps "$main_wt" "$wt"
  else
    info "已跳过 node_modules 复制（--no-deps）；需要时自行 npm install"
  fi

  state="$(collab_state_dir)"
  cat > "$state/tasks/$id.meta" <<EOF
task=$task
branch=$branch
worktree=$wt
base=origin/main
created=$(collab_now)
pid=$$
host=$(collab_host)
port=$port
EOF

  ok "工位已建好"
  printf '\n'
  printf '  任务：%s\n' "$task"
  printf '  目录：%s\n' "$wt"
  printf '  分支：%s\n' "$branch"
  printf '  端口：%s\n' "$port"
  printf '\n下一步：\n'
  printf '  cd "%s"\n' "$wt"
  printf '  ...改代码...\n'
  printf '  bash scripts/session.sh commit -m "说明"\n'
  printf '  bash scripts/session.sh finish\n'
  printf '  bash scripts/session.sh merge\n'
  printf '\n启动本地后端时用：PORT=%s npm run start:dev:miniapp\n' "$port"
}

# ---------------------------------------------------------------------------
# status
# ---------------------------------------------------------------------------

cmd_status() {
  local main_wt state meta found=0
  main_wt="$(collab_main_worktree)"
  state="$(collab_state_dir)"

  printf '主工作区：%s\n' "${main_wt:-（未找到）}"
  if [ -n "$main_wt" ] && [ -d "$main_wt" ]; then
    local mb md mu ab behind ahead
    mb="$(git -C "$main_wt" branch --show-current 2>/dev/null || echo '?')"
    md="$(git -C "$main_wt" status --porcelain --untracked-files=no 2>/dev/null | wc -l | tr -d ' ')"
    mu="$(git -C "$main_wt" status --porcelain 2>/dev/null | grep -c '^??' || true)"
    ab="$(git -C "$main_wt" rev-list --left-right --count origin/main...HEAD 2>/dev/null || echo '0 0')"
    behind="$(printf '%s' "$ab" | awk '{print $1}')"
    ahead="$(printf '%s' "$ab" | awk '{print $2}')"
    printf '  分支：%s  未提交改动：%s  未跟踪文件：%s  领先/落后 origin/main：%s/%s\n' \
      "$mb" "$md" "$mu" "$ahead" "$behind"
    if [ "$mb" != "main" ]; then
      printf '  ⚠ 主工作区不在 main 上；合并前请切回 main\n'
    fi
    if [ "$md" != "0" ]; then
      printf '  ⚠ 主工作区有未提交改动；严格模式下应先归位到任务工位\n'
    fi
  fi

  printf '\n任务工位：\n'
  for meta in "$state"/tasks/*.meta; do
    [ -f "$meta" ] || continue
    found=1
    local task branch wt created port dirty status ab behind ahead
    task="$(collab_meta_get "$meta" task)"
    branch="$(collab_meta_get "$meta" branch)"
    wt="$(collab_meta_get "$meta" worktree)"
    created="$(collab_meta_get "$meta" created)"
    port="$(collab_meta_get "$meta" port)"
    printf '  - %s\n' "${task:-（未命名）}"
    printf '    分支 %s，端口 %s，建于 %s\n' "${branch:-?}" "${port:-?}" "${created:-?}"
    if [ -d "$wt" ]; then
      dirty="$(git -C "$wt" status --porcelain 2>/dev/null | wc -l | tr -d ' ')"
      ab="$(git -C "$wt" rev-list --left-right --count origin/main...HEAD 2>/dev/null || echo '0 0')"
      behind="$(printf '%s' "$ab" | awk '{print $1}')"
      ahead="$(printf '%s' "$ab" | awk '{print $2}')"
      if [ "$dirty" = "0" ]; then status="干净"; else status="$dirty 个文件未提交"; fi
      printf '    工位 %s\n' "$wt"
      printf '    状态：%s；领先/落后 origin/main：%s/%s\n' "$status" "$ahead" "$behind"
    else
      printf '    工位 %s（目录已不存在，可 cleanup 掉登记）\n' "${wt:-?}"
    fi
  done
  if [ "$found" -eq 0 ]; then
    printf '  （没有登记中的任务）\n'
  fi

  printf '\n'
  collab_lock_status
}

# ---------------------------------------------------------------------------
# commit
# ---------------------------------------------------------------------------

check_staged_files() {
  local staged f size
  staged="$(git diff --cached --name-only)"
  [ -n "$staged" ] || die "没有暂存内容；用 --all 或指定文件路径"

  while IFS= read -r f; do
    [ -n "$f" ] || continue
    case "$f" in
      .env|*/.env|*.env.local|*/.env.local|*.env.development|*/.env.development|*.env.bak|*/.env.bak|*.env.ingredient-agent.local)
        die "拒绝提交环境变量文件：$f（里面可能有密钥/数据库密码）" ;;
      node_modules/*|*/node_modules/*)
        die "拒绝提交 node_modules：$f" ;;
      dist/*|*/dist/*)
        die "拒绝提交构建产物：$f（构建产物不入库）" ;;
      .DS_Store|*/.DS_Store)
        die "拒绝提交 .DS_Store：$f" ;;
    esac
    if [ -f "$f" ]; then
      size="$(stat -f%z "$f" 2>/dev/null || stat -c%s "$f" 2>/dev/null || echo 0)"
      if [ "$size" -gt 5242880 ]; then
        die "文件超过 5MB，拒绝提交：$f（${size} 字节）"
      fi
    fi
  done <<< "$staged"

  local staged_diff
  staged_diff="$(git diff --cached --unified=0)"
  if grep -qE '^\+(<<<<<<<|>>>>>>>)' <<< "$staged_diff"; then
    die "暂存内容里还有未解决的冲突标记；先解决冲突再提交"
  fi
}

cmd_commit() {
  local msg="" all=0
  local -a paths=()
  while [ $# -gt 0 ]; do
    case "$1" in
      -m)
        [ $# -ge 2 ] || die "-m 需要一个提交说明"
        msg="$2"; shift 2 ;;
      --all)
        all=1; shift ;;
      -h|--help)
        usage; exit 0 ;;
      *)
        paths[${#paths[@]}]="$1"; shift ;;
    esac
  done
  [ -n "$msg" ] || die "用法：session.sh commit -m \"提交说明\" [--all | 文件路径...]"

  local wt main_wt branch
  wt="$(git rev-parse --show-toplevel 2>/dev/null)" || die "当前目录不在 git 仓库里"
  main_wt="$(collab_main_worktree)"
  branch="$(git branch --show-current 2>/dev/null || true)"

  if [ "$wt" = "$main_wt" ] || [ "$branch" = "main" ]; then
    die "主工作区只读：不要在这里提交。先 session.sh start \"任务名\" 开工位"
  fi
  [ -n "$branch" ] || die "当前是 detached HEAD；请在有分支的工位里提交"

  if [ "$all" -eq 1 ]; then
    git add -A
  elif [ ${#paths[@]} -gt 0 ]; then
    git add -- "${paths[@]}"
  fi

  check_staged_files

  printf '本次提交包含：\n'
  git diff --cached --stat
  printf '\n'

  git commit -m "$msg"
  ok "已提交 $(git rev-parse --short HEAD)：$msg"

  if [ ! -f "$(collab_state_dir)/tasks/$(basename "$wt").meta" ]; then
    warn "当前工位没有任务登记（legacy 分支）；建议后续用 session.sh start 新建工位"
  fi
}

# ---------------------------------------------------------------------------
# finish / merge
# ---------------------------------------------------------------------------

cmd_finish() {
  local wt branch main_wt
  wt="$(git rev-parse --show-toplevel 2>/dev/null)" || die "当前目录不在 git 仓库里"
  main_wt="$(collab_main_worktree)"
  branch="$(git branch --show-current 2>/dev/null || true)"
  [ "$wt" != "$main_wt" ] || die "主工作区不是任务工位"
  [ -n "$branch" ] && [ "$branch" != "main" ] || die "当前不在任务分支上"

  if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
    die "还有未提交的改动；先 commit 或确认丢弃"
  fi

  info "推送分支 $branch 到 origin（备份）..."
  if ! git push -u origin "$branch"; then
    die "推送分支失败；检查网络/权限后重试"
  fi
  ok "分支已推送"
  printf '\n下一步：bash scripts/session.sh merge\n'
}

cmd_merge() {
  local no_push=0 wait_s=600
  while [ $# -gt 0 ]; do
    case "$1" in
      --no-push) no_push=1; shift ;;
      --wait)
        [ $# -ge 2 ] || die "--wait 需要一个秒数"
        wait_s="$2"; shift 2 ;;
      -h|--help) usage; exit 0 ;;
      *) die "未知参数：$1" ;;
    esac
  done

  local wt branch main_wt state token original_branch_sha safe_main_tips
  wt="$(git rev-parse --show-toplevel 2>/dev/null)" || die "当前目录不在 git 仓库里"
  main_wt="$(collab_main_worktree)"
  branch="$(git branch --show-current 2>/dev/null || true)"
  state="$(collab_state_dir)"

  [ "$wt" != "$main_wt" ] || die "请在任务工位里执行 merge，不要在 main 上"
  [ -n "$branch" ] && [ "$branch" != "main" ] || die "当前不在任务分支上"
  original_branch_sha="$(git rev-parse "$branch")"
  safe_main_tips=" $original_branch_sha "

  if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
    die "工位还有未提交改动；先 commit"
  fi

  if [ ! -f "$state/tasks/$(basename "$wt").meta" ]; then
    warn "当前工位没有任务登记（legacy 分支），仍继续合并"
  fi

  token="$(collab_lock_acquire merge-main "合并 $branch" 1800 "$wait_s")" \
    || die "拿不到 merge-main 门禁；看 gate.sh status 确认谁在合并"
  # 注意：trap 在函数返回后才执行，token 是 local 会失效，所以在定义时展开
  trap "collab_lock_release merge-main '$token' >/dev/null 2>&1 || true" EXIT

  info "同步 origin/main ..."
  git fetch origin main || die "拉取 origin/main 失败"

  info "把 $branch 变基到最新 origin/main ..."
  if ! git rebase origin/main; then
    git rebase --abort >/dev/null 2>&1 || true
    die "与 origin/main 有冲突，已回滚；请手工解决后再 merge"
  fi

  if [ "$no_push" -eq 0 ]; then
    info "推送任务分支（备份）..."
    if ! git push -u origin "$branch"; then
      git push --force-with-lease origin "$branch" || die "推送任务分支失败"
    fi
  fi

  # 主工作区必须干净、在 main、且没有未推送提交
  [ "$(git -C "$main_wt" branch --show-current 2>/dev/null || true)" = "main" ] \
    || die "主工作区不在 main 上；先切回 main"
  if [ -n "$(git -C "$main_wt" status --porcelain --untracked-files=no)" ]; then
    die "主工作区有未提交改动；先归位到任务工位"
  fi

  git -C "$main_wt" fetch origin main || die "主工作区拉取 origin/main 失败"

  local attempt=1 pushed=0
  while [ "$attempt" -le 3 ]; do
    git -C "$main_wt" fetch origin main || die "主工作区拉取 origin/main 失败"

    # 如果主工作区领先 origin：只允许“上一次合并遗留”这一种情况，回退后重来；
    # 其它未推送提交（别人/手工）一律不碰。
    local ahead main_tip branch_tip safe
    ahead="$(git -C "$main_wt" rev-list --count origin/main..main)"
    if [ "$ahead" -ne 0 ]; then
      main_tip="$(git -C "$main_wt" rev-parse main)"
      branch_tip="$(git rev-parse "$branch")"
      case " $safe_main_tips " in
        *" $main_tip "*) safe=1 ;;
        *) safe=0 ;;
      esac
      if [ "$main_tip" = "$branch_tip" ] || [ "$safe" -eq 1 ]; then
        warn "主工作区有上次合并遗留，回退到 origin/main 后重试"
        git -C "$main_wt" reset --hard origin/main || die "回退主工作区失败"
      else
        die "主工作区有 $ahead 个未推送提交，且不是本次合并；请人工检查"
      fi
    fi

    # origin/main 在合并前又前进了：重新变基到最新 main，再合并。
    if ! git merge-base --is-ancestor origin/main "$branch"; then
      info "origin/main 已前进，重新把 $branch 变基到最新 main ..."
      if ! git rebase origin/main; then
        git rebase --abort >/dev/null 2>&1 || true
        die "与最新 origin/main 有冲突，已回滚；请手工解决后再 merge"
      fi
      if [ "$no_push" -eq 0 ]; then
        git push --force-with-lease origin "$branch" || die "推送任务分支失败"
      fi
    fi

    info "快进合并到主工作区 ..."
    git -C "$main_wt" merge --ff-only "$branch" \
      || die "无法快进合并（可能主工作区被占用或有未跟踪文件冲突）"
    safe_main_tips="$safe_main_tips $(git -C "$main_wt" rev-parse main)"

    if [ "$no_push" -eq 1 ]; then
      pushed=1
      break
    fi

    if git -C "$main_wt" push origin main; then
      pushed=1
      break
    fi

    warn "推送 main 失败（可能有人同时提交），第 $attempt/3 次重试..."
    attempt=$((attempt + 1))
    sleep 2
  done

  if [ "$pushed" -ne 1 ]; then
    # 只回退“本次合并”这一个提交；分支本身保留，下次还能重新 merge。
    if [ "$(git -C "$main_wt" rev-parse main)" = "$(git rev-parse "$branch")" ]; then
      git -C "$main_wt" reset --hard origin/main >/dev/null 2>&1 || true
    fi
    die "推送 main 失败（已重试 3 次）；本次合并已回滚，分支保留"
  fi

  local merged_sha push_label task_name
  merged_sha="$(git -C "$main_wt" rev-parse --short HEAD)"
  push_label="pushed"
  [ "$no_push" -eq 1 ] && push_label="no-push"
  task_name="$(collab_meta_get "$state/tasks/$(basename "$wt").meta" task)"
  printf '%s\t%s\t%s\t%s\t%s\n' "$(collab_now)" "$branch" "$merged_sha" "$push_label" \
    "${task_name:-未登记}" >> "$state/merges.log"

  ok "已合并到 main：$merged_sha"
  printf '\n下一步：\n'
  printf '  bash scripts/session.sh cleanup %s\n' "$branch"
  printf '  需要部署时，先看 bash scripts/gate.sh status\n'
}

# ---------------------------------------------------------------------------
# cleanup
# ---------------------------------------------------------------------------

cmd_cleanup() {
  local target="" force=0
  while [ $# -gt 0 ]; do
    case "$1" in
      --force) force=1; shift ;;
      -h|--help) usage; exit 0 ;;
      *) target="$1"; shift ;;
    esac
  done

  local main_wt state meta="" branch wt cur_wt
  main_wt="$(collab_main_worktree)"
  state="$(collab_state_dir)"
  cur_wt="$(git rev-parse --show-toplevel 2>/dev/null || true)"

  if [ -z "$target" ]; then
    [ -n "$cur_wt" ] && [ "$cur_wt" != "$main_wt" ] \
      || die "用法：session.sh cleanup <分支或工位名> [--force]"
    target="$(basename "$cur_wt")"
  fi

  # 支持传分支名（task/...）或工位目录名（日期-短名）
  if [ -f "$state/tasks/$target.meta" ]; then
    meta="$state/tasks/$target.meta"
  else
    local base
    base="$(basename "$target")"
    if [ -f "$state/tasks/$base.meta" ]; then
      meta="$state/tasks/$base.meta"
    fi
  fi

  if [ -n "$meta" ]; then
    branch="$(collab_meta_get "$meta" branch)"
    wt="$(collab_meta_get "$meta" worktree)"
  else
    # 兼容没有登记的老分支/老工位：允许直接传 task/... 分支名
    if git -C "$main_wt" show-ref --verify --quiet "refs/heads/$target"; then
      branch="$target"
      wt="$(git -C "$main_wt" worktree list --porcelain | awk -v b="refs/heads/$branch" '
        /^worktree / { path=substr($0, 10) }
        /^branch / { if ($2 == b) { print path; exit } }
      ')"
      [ -n "$wt" ] || die "分支 $branch 没有对应的工位目录"
    else
      die "找不到任务登记或分支：$target"
    fi
  fi

  [ -n "$branch" ] && [ -n "$wt" ] || die "任务登记不完整：${meta:-$target}"

  if [ "$cur_wt" = "$wt" ]; then
    die "当前就在这个工位里；先 cd 到主工作区再 cleanup"
  fi

  local merged=0
  git -C "$main_wt" fetch origin main --quiet >/dev/null 2>&1 || true
  if git -C "$main_wt" show-ref --verify --quiet "refs/heads/$branch"; then
    if git -C "$main_wt" merge-base --is-ancestor "$branch" origin/main 2>/dev/null; then
      merged=1
    fi
  else
    merged=1
  fi

  if [ "$merged" -ne 1 ] && [ "$force" -ne 1 ]; then
    die "分支 $branch 还没合并进 origin/main；确认不要了再加 --force"
  fi

  if [ -d "$wt" ]; then
    info "删除工位目录 $wt ..."
    if ! git -C "$main_wt" worktree remove "$wt" 2>/dev/null; then
      [ "$force" -eq 1 ] || die "工位有未提交内容；确认丢弃加 --force"
      git -C "$main_wt" worktree remove --force "$wt"
    fi
  fi

  if git -C "$main_wt" show-ref --verify --quiet "refs/heads/$branch"; then
    # 前面已经确认“已合并进 origin/main”或用户加了 --force；用 -D 避免
    # 主工作区 HEAD 落后 origin/main 时 -d 误判“未合并”。
    if ! git -C "$main_wt" branch -D "$branch" >/dev/null; then
      warn "工位已删除，但分支 $branch 删除失败；登记保留：${meta:-无}"
      exit 1
    fi
  fi

  [ -n "$meta" ] && rm -f "$meta"
  ok "已清理：$branch"
}

# ---------------------------------------------------------------------------
# hooks
# ---------------------------------------------------------------------------

cmd_install_hooks() {
  local hook_dir src dst stamp
  hook_dir="$(collab_common_dir)/hooks"
  mkdir -p "$hook_dir"

  for name in pre-commit pre-push; do
    src="$SCRIPT_DIR/hooks/$name"
    dst="$hook_dir/$name"
    [ -f "$src" ] || die "缺少钩子模板：$src"
    if [ -f "$dst" ] && ! cmp -s "$src" "$dst"; then
      stamp="$(date +%Y%m%d%H%M%S)"
      cp -p "$dst" "$dst.bak.$stamp"
      warn "已备份原钩子：$dst.bak.$stamp"
    fi
    cp "$src" "$dst"
    chmod +x "$dst"
    ok "已安装 $name"
  done
  printf '\n钩子只对本机生效（放在 .git/hooks），用于兜底：\n'
  printf '  - 禁止在 main 上直接 commit\n'
  printf '  - 禁止绕过 merge-main 门禁推 main\n'
}

# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------

case "${1:-}" in
  start) shift; cmd_start "$@" ;;
  status) cmd_status ;;
  commit) shift; cmd_commit "$@" ;;
  finish) cmd_finish ;;
  merge) shift; cmd_merge "$@" ;;
  cleanup) shift; cmd_cleanup "$@" ;;
  install-hooks) cmd_install_hooks ;;
  help|-h|--help) usage ;;
  *) usage; exit 1 ;;
esac
