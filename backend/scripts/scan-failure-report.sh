#!/usr/bin/env bash
#
# 识别失败汇总（2026-10-16 清单 E4）
#
# 为什么要有它：家长说"识别失败"的时候，我们只有一行服务端日志，而且淹在几百行里 ✗。
# 这个脚本把最近一段时间的识别结果汇总成一张看得懂的表 —— 有几张没读出来、
# 都是哪一类文档、看的是哪张图（可以点开来看）。
#
# 用法（仓库根目录）：
#   bash backend/scripts/scan-failure-report.sh              # 最近 24 小时（从本机 ssh 到生产去读）
#   bash backend/scripts/scan-failure-report.sh 168          # 最近 7 天（小时数自己给）
#   bash backend/scripts/scan-failure-report.sh --local      # **本机模式**：直接读本机 journalctl，不 ssh
#   bash backend/scripts/scan-failure-report.sh --local 72   # 本机模式 + 最近 3 天
#
# ⚠️ 两个模式的分工（2026-10-17 加 --local，B3 那次）：
#   · **不带 --local**（默认，手动版）：给"在自己电脑上跑"用的 —— ssh 到生产读日志。
#     老板、我、以后任何人手动查，用的都是这一条，**行为一个字没变** ✓。
#   · **带 --local**：给"已经站在生产机上"用的（定时任务就是这种）——
#     直接 `journalctl` 读本机，**不要 ssh 自己**（ssh 自己会依赖密钥/known_hosts，
#     定时任务里失败起来是静默的 ✗）。
#
# 定时任务入口不直接用它，而是用它旁边的 `scan-failure-report-daily.sh`
# （落盘到 /var/log/sevenkitchen/scan-failure-YYYYMMDD.txt + 保留 30 天）。
# 运维手册：docs/plans/2026-10-17-vaccine-ops-runbook.md
#
# 退出码：只要有"一张都没读出来"的，就返回 1（定时任务用它当告警 ✓）
set -uo pipefail

# ⚠️ `HOME` 在这里**不能提前展开**：systemd 起的服务默认没有 HOME，
#    提前算 `$HOME/.ssh/...` 会在 `set -u` 下直接报 "HOME: unbound variable" ✗
#    （2026-10-17 实测踩到：定时任务第一次跑就是被这个弄挂的）。
#    所以：只在"要走 ssh"的那条分支里、用到的时候才算它 ✓
HOST="root@1.14.3.2"
# 看哪个服务的日志（灰度服务默认不看：它现在不接识别流量；要看得显式改）
SERVICE="${SCAN_FAILURE_SERVICE:-sevenkitchen-backend}"

# ── 参数 ────────────────────────────────────────────────────────────────────
MODE="remote"
HOURS=""
for arg in "$@"; do
  case "$arg" in
    --local|-l)
      MODE="local"
      ;;
    -h|--help)
      sed -n '2,26p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    ''|*[!0-9]*)
      echo "看不懂的参数：$arg（用法：$0 [--local] [小时数]）" >&2
      exit 2
      ;;
    *)
      HOURS="$arg"
      ;;
  esac
done
HOURS="${HOURS:-24}"

# ── 取日志 ──────────────────────────────────────────────────────────────────
# ⚠️ 原来固定写 /tmp/scan-lines.txt：定时任务和手动跑会互相踩（两个进程同时写同一个文件）。
#    改成 mktemp + trap，跑完（含中途报错）自己清掉 ✓
TMP="$(mktemp "${TMPDIR:-/tmp}/scan-lines.XXXXXX")" || exit 1
trap 'rm -f "$TMP"' EXIT

if [ "$MODE" = "local" ]; then
  # ⚠️ 别在 mac 上误用 --local：那里没有 journalctl，读不到日志会被下面算成"0 次识别"，
  #    看起来像"✓ 一切正常"—— 是最危险的那种假绿 ✗。所以直接报错退出。
  if ! command -v journalctl >/dev/null 2>&1; then
    echo "✗ 本机没有 journalctl —— --local 只能在生产机（Ubuntu）上用；在你自己电脑上请去掉 --local（走 ssh）。" >&2
    exit 2
  fi
  # ⚠️ journalctl 自己失败（没权限、服务名写错）不能算成"0 次识别" ✗ ——
  #    那会显示成"✓ 一切正常"，是最危险的那种假绿。所以要看**管道里 journalctl 那一段**
  #    的退出码（PIPESTATUS[0]；grep 没匹配时退出码是 1，那是正常情况，不算错）。
  # ⚠️ 服务名写错时 `journalctl -u 写错的名字` **退出码是 0、输出为空** ✗ ——
  #    只看退出码会得到"0 次识别 ✓ 一切正常"，又是一个假绿 ✗（2026-10-17 自检踩到）。
  #    所以先确认这个 unit 真的存在。
  if command -v systemctl >/dev/null 2>&1 && ! systemctl cat "$SERVICE" >/dev/null 2>&1; then
    echo "✗ 生产机上没有 $SERVICE 这个 systemd 服务（systemctl cat 找不到）—— 服务名是不是改了？" >&2
    exit 2
  fi
  journalctl -u "$SERVICE" --since "$HOURS hours ago" --no-pager 2>/dev/null \
    | grep '\[Extraction\]' > "$TMP"
  JOURNAL_RC=${PIPESTATUS[0]}
  if [ "$JOURNAL_RC" -ne 0 ]; then
    echo "✗ 读不到 journalctl -u $SERVICE 的日志（rc=$JOURNAL_RC；服务名写错？没权限？）" >&2
    exit 2
  fi
else
  SSH_KEY="${SSH_KEY:-${HOME:-/root}/.ssh/claude_deploy}"
  ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$HOST" \
    "journalctl -u '$SERVICE' --since '$HOURS hours ago' --no-pager 2>/dev/null | grep '\[Extraction\]'" \
    > "$TMP" || true
fi

# ⚠️ `grep -c` 没匹配时**会打印 0 但退出码是 1** —— 用 `|| true` 而不是 `|| echo 0`，
#    否则变量会变成两行（"0\n0"），下面的大小比较直接报 integer expression expected ✗
TOTAL=$(grep -c '\[Extraction\]' "$TMP" 2>/dev/null || true)
EMPTY=$(grep -c '\[Extraction\]\[EMPTY\]' "$TMP" 2>/dev/null || true)
# 2026-10-16（B5）：识别失败/被每日上限拒绝也各留一行 `[Extraction][FAIL]`。
# 在此之前"请求失败"在日志里一片空白 ✗ —— 现在能数出来了。
FAILED=$(grep -c '\[Extraction\]\[FAIL\]' "$TMP" 2>/dev/null || true)
TOTAL=${TOTAL:-0}
EMPTY=${EMPTY:-0}
FAILED=${FAILED:-0}
# ⚠️ 口径：一行 = 一次识别尝试（成功 / 没读出内容 / 失败都算一次），
#    所以 TOTAL 就是"这段时间调了几次模型"——成本按它算 ✓
#    上限拒绝那一行用的是 `[ExtractionQuota]` 前缀，**故意不带** `[Extraction]`，
#    否则一次被拒会被数成两次（见 health-extraction-quota.service.ts 的注释）。

echo "──────── 识别情况（最近 ${HOURS} 小时）────────"
echo "日志来源：$([ "$MODE" = "local" ] && echo "本机 journalctl -u $SERVICE" || echo "ssh $HOST → journalctl -u $SERVICE")"
echo "总共识别：${TOTAL} 次 ｜ 一张都没读出来：${EMPTY} 次 ｜ 请求失败：${FAILED} 次"
if [ "$TOTAL" -eq 0 ]; then
  echo "⚠️ 这段时间一次识别都没有（0 次）—— 要么真没人传疫苗本，要么后端/日志有问题，建议上去看一眼"
fi

if [ "$FAILED" -gt 0 ]; then
  echo
  echo "失败明细（`type=` 后是文档类别，`phase=` 是走到哪一步挂的，reason= 是原因）："
  grep '\[Extraction\]\[FAIL\]' "$TMP" | tail -20 | sed 's/^/   · /'
  echo
  echo "⚠️ 失败里有 quota 字样的 = 当天额度真的用完了（不是故障）；"
  echo "   其余（phase=ocr/vision/document、reason=模型/网络报错）才要上去查。"
fi

if [ "$EMPTY" -gt 0 ]; then
  echo
  echo "按文档类型分（没读出来的）："
  grep '\[Extraction\]\[EMPTY\]' "$TMP" | sed -E 's/.*type=([A-Z_]+).*/\1/' | sort | uniq -c | sed 's/^/   /'
  echo
  echo "明细（image= 后面是那张图，可以点开看）："
  grep '\[Extraction\]\[EMPTY\]' "$TMP" | sed -E 's/.*(\[Extraction\]\[EMPTY\] type=[A-Z_]+).*(image=\S+).*/   · \1 \2/' | tail -20
  echo
  echo "⚠️ 有没读出来的 —— 若集中在同一类文档，多半是提示词或那一类照片的问题"
  exit 1
fi

# ⚠️ 2026-10-16（B5）：失败也要算异常（退出码 1）——
#    原来只看 "没读出内容"，于是"接口层整个挂了、每次请求都是 FAIL"会显示成
#    "✓ 一切正常" ✗（最危险的那种假绿）。现在失败同样报警 ✓
if [ "$FAILED" -gt 0 ]; then
  echo "⚠️ 有 ${FAILED} 次识别根本没跑起来 —— 见上面的失败明细"
  exit 1
fi

echo "✓ 这段时间没有'一张都没读出来'、也没有失败的识别"
exit 0
