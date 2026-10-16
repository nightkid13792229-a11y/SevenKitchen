#!/usr/bin/env bash
#
# 识别失败汇总 · 每日定时任务入口（2026-10-17，上线前 B3）
#
# 它做什么（**只在生产机上跑**，由 systemd timer 每天叫一次）：
#   ① 用 `scan-failure-report.sh --local` 读本机 journalctl（不 ssh 自己）
#   ② 把结果落到固定路径：/var/log/sevenkitchen/scan-failure-YYYYMMDD.txt
#   ③ 自动清掉 30 天前的旧报告（保留最近 30 天，含今天）
#   ④ 把报告的退出码原样带出去 —— 有"一张都没读出来"时脚本退出码为 1，
#      systemd 会把这次服务标成 failed（`systemctl --failed` 一眼看得到 ✓）
#
# 为什么不直接把 scan-failure-report.sh 挂进 systemd：
#   那个脚本是**给人手动看**的（默认 ssh、输出到屏幕）；
#   定时任务要的是"本机模式 + 落盘 + 保留策略 + 退出码"这四件事，
#   混在一起改会把手动版弄坏 —— 所以这里只做定时任务这一份包装 ✓
#
# 手动触发一次（不用等定时）：
#   sudo systemctl start sevenkitchen-scan-failure.service
# 看今天这份报告：
#   sudo cat /var/log/sevenkitchen/scan-failure-$(date +%Y%m%d).txt
#
# 可调（一般不用动；要改就改 systemd 单元里的 Environment=）：
#   SCAN_FAILURE_HOURS     看最近多少小时（默认 24）
#   SCAN_FAILURE_KEEP_DAYS 报告保留多少天（默认 30）
#   SCAN_FAILURE_LOG_DIR   报告放哪（默认 /var/log/sevenkitchen）
#   SCAN_FAILURE_SERVICE   读哪个服务的日志（默认 sevenkitchen-backend）
#
# 运维手册：docs/plans/2026-10-17-vaccine-ops-runbook.md
set -uo pipefail

HOURS="${SCAN_FAILURE_HOURS:-24}"
KEEP_DAYS="${SCAN_FAILURE_KEEP_DAYS:-30}"
LOG_DIR="${SCAN_FAILURE_LOG_DIR:-/var/log/sevenkitchen}"
SERVICE="${SCAN_FAILURE_SERVICE:-sevenkitchen-backend}"

SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPORT="$SELF_DIR/scan-failure-report.sh"

if [ ! -f "$REPORT" ]; then
  echo "找不到 $REPORT —— 生产机上这份代码是不是被 deploy 重置掉了？（见运维手册）" >&2
  exit 3
fi

STAMP="$(date +%Y%m%d)"
OUT="$LOG_DIR/scan-failure-$STAMP.txt"

mkdir -p "$LOG_DIR" || exit 3

rc=0
# ⚠️ 先把报告内容抓成变量再落盘，为的是能判断"报告到底跑出来没有"：
#    脚本自己出错（例如环境里少个变量）也是非 0 退出码，
#    跟"确实有识别失败"混在一起就分不清了 ✗（2026-10-17 定时任务第一次跑就踩到）。
REPORT_OUT="$(bash "$REPORT" --local "$HOURS" 2>&1)" || rc=$?

# 汇总没跑出来 = 3（和"确实有识别失败 = 1"分开，别让人误以为真有失败）
if ! printf '%s' "$REPORT_OUT" | grep -q '总共识别：'; then
  rc=3
fi

{
  echo "识别失败汇总 · 每日定时任务"
  echo "主机：$(hostname) ｜ 生成时间：$(date '+%Y-%m-%d %H:%M:%S %Z')"
  echo
  printf '%s\n' "$REPORT_OUT"
  echo
  case "$rc" in
    0) echo "退出码：0（这段时间没有'一张都没读出来'的）" ;;
    1) echo "退出码：1 —— ⚠️ 有识别失败，请上去看一眼（明细就在上面）" ;;
    *) echo "退出码：${rc} —— ✗ 汇总本身没跑成功（连『总共识别』那行都没有）；看上面的报错" ;;
  esac
} > "$OUT" 2>&1

chmod 644 "$OUT" 2>/dev/null || true
# 方便"永远看最新那份"，不用记日期
ln -sf "$(basename "$OUT")" "$LOG_DIR/scan-failure-latest.txt" 2>/dev/null || true

# 保留最近 ${KEEP_DAYS} 天（含今天）：-mtime +（N-1）= 第 N 天及更早的
find "$LOG_DIR" -maxdepth 1 -type f -name 'scan-failure-????????.txt' \
  -mtime +"$((KEEP_DAYS - 1))" -delete 2>/dev/null || true

KEPT=$(find "$LOG_DIR" -maxdepth 1 -type f -name 'scan-failure-????????.txt' 2>/dev/null | wc -l | tr -d ' ')
echo "识别失败汇总：${OUT}（rc=${rc}，目录里现有 ${KEPT} 份，保留最近 ${KEEP_DAYS} 天）"

exit "$rc"
