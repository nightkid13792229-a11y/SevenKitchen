#!/usr/bin/env bash
#
# 识别失败汇总（2026-10-16 清单 E4）
#
# 为什么要有它：家长说"识别失败"的时候，我们只有一行服务端日志，而且淹在几百行里 ✗。
# 这个脚本把最近一段时间的识别结果汇总成一张看得懂的表 —— 有几张没读出来、
# 都是哪一类文档、看的是哪张图（可以点开来看）。
#
# 用法（仓库根目录）：
#   bash backend/scripts/scan-failure-report.sh              # 最近 24 小时
#   bash backend/scripts/scan-failure-report.sh 168          # 最近 7 天（小时数自己给）
#
# 退出码：只要有"一张都没读出来"的，就返回 1（方便以后挂到定时任务里当告警 ✓）
set -uo pipefail

SSH_KEY="$HOME/.ssh/claude_deploy"
HOST="root@1.14.3.2"
HOURS="${1:-24}"

ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$HOST" "journalctl -u sevenkitchen-backend --since '$HOURS hours ago' --no-pager 2>/dev/null | grep '\[Extraction\]'" > /tmp/scan-lines.txt || true

# ⚠️ `grep -c` 没匹配时**会打印 0 但退出码是 1** —— 用 `|| true` 而不是 `|| echo 0`，
#    否则变量会变成两行（"0\n0"），下面的大小比较直接报 integer expression expected ✗
TOTAL=$(grep -c '\[Extraction\]' /tmp/scan-lines.txt 2>/dev/null || true)
EMPTY=$(grep -c '\[Extraction\]\[EMPTY\]' /tmp/scan-lines.txt 2>/dev/null || true)
TOTAL=${TOTAL:-0}
EMPTY=${EMPTY:-0}

echo "──────── 识别情况（最近 ${HOURS} 小时）────────"
echo "总共识别：${TOTAL} 次 ｜ 一张都没读出来：${EMPTY} 次"

if [ "$EMPTY" -gt 0 ]; then
  echo
  echo "按文档类型分（没读出来的）："
  grep '\[Extraction\]\[EMPTY\]' /tmp/scan-lines.txt | sed -E 's/.*type=([A-Z_]+).*/\1/' | sort | uniq -c | sed 's/^/   /'
  echo
  echo "明细（image= 后面是那张图，可以点开看）："
  grep '\[Extraction\]\[EMPTY\]' /tmp/scan-lines.txt | sed -E 's/.*(\[Extraction\]\[EMPTY\] type=[A-Z_]+).*(image=\S+).*/   · \1 \2/' | tail -20
  echo
  echo "⚠️ 有没读出来的 —— 若集中在同一类文档，多半是提示词或那一类照片的问题"
  rm -f /tmp/scan-lines.txt
  exit 1
fi

echo "✓ 这段时间没有'一张都没读出来'的情况"
rm -f /tmp/scan-lines.txt
exit 0
