#!/usr/bin/env bash
#
# 疫苗本评测 · 在服务器上跑（2026-10-09）
#
# 为什么要有这个包装脚本：本地跑会撞 DNS ✗ ——
# 实测本机解析 api.sevenkitchen.cloud 报 ENOTFOUND（老板的电脑/网络环境所致），
# 而服务器上用 127.0.0.1 调同一个接口永远通 ✓。
#
# 用法（仓库根目录）：
#   bash backend/scripts/eval-vaccine-books-remote.sh            # 跑分
#   bash backend/scripts/eval-vaccine-books-remote.sh --dump     # 只生成答案草稿
#   bash backend/scripts/eval-vaccine-books-remote.sh --clean    # 清掉服务器上的评测副本
#
# 照片会被同步到服务器的一个临时目录（评测完可用 --clean 删掉 ✓）。
set -euo pipefail

SSH_KEY="$HOME/.ssh/claude_deploy"
HOST="root@1.14.3.2"
REPO_REMOTE="/opt/sevenkitchen/SevenKitchen/backend"
RUN_DIR="$REPO_REMOTE/.eval-run"
LOCAL_DATA=".eval-data/vaccine-books"
MODE="${1:-}"

ssh_run() { ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$HOST" "$@"; }

if [ "$MODE" = "--clean" ]; then
  ssh_run "rm -rf $RUN_DIR && echo '服务器上的评测副本已删除 ✓'"
  exit 0
fi

if [ ! -f "$LOCAL_DATA/labels.csv" ]; then
  echo "没找到 $LOCAL_DATA/labels.csv" >&2
  exit 1
fi

echo "① 同步评测集到服务器…"
ssh_run "mkdir -p $RUN_DIR/photos"
scp -i "$SSH_KEY" -o StrictHostKeyChecking=no -q "$LOCAL_DATA/labels.csv" "$HOST:$RUN_DIR/labels.csv"
scp -i "$SSH_KEY" -o StrictHostKeyChecking=no -q "$LOCAL_DATA"/photos/* "$HOST:$RUN_DIR/photos/" 2>/dev/null || true
scp -i "$SSH_KEY" -o StrictHostKeyChecking=no -q backend/scripts/eval-vaccine-books.cjs "$HOST:$REPO_REMOTE/eval-vaccine-books.cjs"

echo "② 在服务器上跑…"
ssh_run "cd $REPO_REMOTE && EVAL_MINT=1 EVAL_API_BASE=http://127.0.0.1:3000/api/v1 node eval-vaccine-books.cjs --dir $RUN_DIR $MODE; rm -f eval-vaccine-books.cjs"

echo
echo "（评测副本留在服务器 $RUN_DIR；不需要了就 bash backend/scripts/eval-vaccine-books-remote.sh --clean ✓）"
