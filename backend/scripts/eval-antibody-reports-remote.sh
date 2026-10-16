#!/usr/bin/env bash
#
# 抗体检测报告评测 · 在服务器上跑（2026-10-19）
#
# 为什么要有这个包装脚本：本地跑会撞 DNS ✗ ——
# 实测本机解析 api.sevenkitchen.cloud 报 ENOTFOUND（老板的电脑/网络环境所致），
# 而服务器上用 127.0.0.1 调同一个接口永远通 ✓。
#
# 用法（仓库根目录）：
#   bash backend/scripts/eval-antibody-reports-remote.sh            # 跑分
#   bash backend/scripts/eval-antibody-reports-remote.sh --dump     # 只生成答案草稿
#   bash backend/scripts/eval-antibody-reports-remote.sh --guard    # 🛡️ 兜底自检（不调模型、不花钱）
#   bash backend/scripts/eval-antibody-reports-remote.sh --clean    # 清掉服务器上的评测副本
#
# 照片会被同步到服务器的一个临时目录（评测完可用 --clean 删掉 ✓）；
# 跑完把 last-report.json **拉回本地** ✓（放在 `.eval-data/antibody-reports/` 里，
# 下次再跑就有上一份可比 —— "数字涨了才算改好" ✓）。
#
# ⚠️ 退出码跟着跑分脚本走：出现"报告没写结论却替他判了 / 判反了 / 请求失败"时是 1 ✓
#    （普通结果差异不影响退出码；脚本本身出错才会非 0）
set -euo pipefail

SSH_KEY="$HOME/.ssh/claude_deploy"
HOST="root@1.14.3.2"
REPO_REMOTE="/opt/sevenkitchen/SevenKitchen/backend"
RUN_DIR="$REPO_REMOTE/.eval-run-antibody"
LOCAL_DATA=".eval-data/antibody-reports"
REMOTE_SCRIPT="eval-antibody-reports.cjs"
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
scp -i "$SSH_KEY" -o StrictHostKeyChecking=no -q backend/scripts/eval-antibody-reports.cjs "$HOST:$REPO_REMOTE/$REMOTE_SCRIPT"

echo "② 在服务器上跑…"
# 跑分脚本的退出码要留住（它非 0 = 出现了"替他判了结论"这类严重错误 ✗），
# 但同时别把后面"拉回结果 / 清理副本"两步跳过 ✓
set +e
ssh_run "cd $REPO_REMOTE && EVAL_MINT=1 EVAL_API_BASE=http://127.0.0.1:3000/api/v1 node $REMOTE_SCRIPT --dir $RUN_DIR $MODE"
STATUS=$?
set -e

echo
# --dump / --guard 不产出跑分明细：**不要去拉**（服务器上还留着上一次的文件，
# 拉回来会拿旧结果冒充这一次的 ✗ —— 本地那份原样不动 ✓）
if [ "$MODE" = "--dump" ] || [ "$MODE" = "--guard" ]; then
  echo "③ （$MODE 模式不产出跑分明细，本地已有的 last-report.json 保持不动 ✓）"
else
  echo "③ 把明细拉回本地…"
  if scp -i "$SSH_KEY" -o StrictHostKeyChecking=no -q "$HOST:$RUN_DIR/last-report.json" "$LOCAL_DATA/last-report.json"; then
    echo "   ✓ 已存到 $LOCAL_DATA/last-report.json（下次再跑可以前后对比）"
  else
    echo "   ⚠️ 没拉到 last-report.json（跑分脚本可能提前失败了 —— 看上面 ② 的输出）"
  fi
fi

echo
echo "（评测副本留在服务器 $RUN_DIR；不需要了就 bash backend/scripts/eval-antibody-reports-remote.sh --clean ✓）"
echo "（脚本副本已从服务器 backend 目录删除 ✓）"
ssh_run "rm -f $REPO_REMOTE/$REMOTE_SCRIPT" || true

if [ "$STATUS" -ne 0 ]; then
  echo
  echo "🔴 跑分脚本退出码 $STATUS —— 看上面那几行：多半是「报告没写结论却替他判了」或「判反了」✗" >&2
fi
exit "$STATUS"
