# 疫苗板块 · 上线后的运维手册（2026-10-17）

> **一句话**：上线后**不需要人天天盯**的两件事，都挂成了固定动作 ——
> ① 每天自动汇总"识别失败"（跑完落一份报告，保留 30 天）；
> ② 上线前清掉 50 只测试档案（**脚本已就绪，等老板点头才执行**）。
>
> 这份是给"接手的人"看的：怎么看结果、怎么手动跑一次、阈值在哪改。

| 项 | 值 |
|---|---|
| 生产机 | `root@1.14.3.2`（`VM-0-13-ubuntu`，systemd 249） |
| 生产代码目录 | `/opt/sevenkitchen/SevenKitchen`（部署时会 `git reset --hard origin/main`） |
| 后端服务 | `sevenkitchen-backend.service`（另有灰度 `sevenkitchen-backend-gray.service`，识别流量不走它） |
| 报告目录 | `/var/log/sevenkitchen/` |

---

## 一、识别失败汇总（每天 08:10 自动跑）

### 1.1 它解决什么

家长说"识别失败"的时候，原来只有一行服务端日志、还淹在几百行里。
现在每天自动把最近 24 小时的识别结果汇总成一张表：
总共识别几次、有几次"一张都没读出来"、都是哪一类文档、看的是哪张图（可以点开看）。

### 1.2 怎么查看（日常只需要这一条）

```bash
# 看今天这份（最新一份的软链，不用记日期）
ssh root@1.14.3.2 'cat /var/log/sevenkitchen/scan-failure-latest.txt'

# 看指定某天
ssh root@1.14.3.2 'cat /var/log/sevenkitchen/scan-failure-20261017.txt'

# 最近 30 天都有哪几份
ssh root@1.14.3.2 'ls -la /var/log/sevenkitchen/'

# 定时任务自己的运行日志（跑没跑、几秒、退出码）
ssh root@1.14.3.2 'journalctl -u sevenkitchen-scan-failure -n 30 --no-pager'
```

报告长这样（**正常**的样子）：

```
识别失败汇总 · 每日定时任务
主机：VM-0-13-ubuntu ｜ 生成时间：2026-10-17 08:10:02 CST

──────── 识别情况（最近 24 小时）────────
日志来源：本机 journalctl -u sevenkitchen-backend
总共识别：150 次 ｜ 一张都没读出来：0 次
✓ 这段时间没有'一张都没读出来'的情况

退出码：0（这段时间没有'一张都没读出来'的）
```

**有失败时**长这样（会多出按文档类型的分组 + 逐条明细，每条带 `image=` 那张图的地址）：

```
总共识别：150 次 ｜ 一张都没读出来：3 次

按文档类型分（没读出来的）：
   3 VACCINE_BOOK

明细（image= 后面是那张图，可以点开看）：
   · [Extraction][EMPTY] type=VACCINE_BOOK image=https://img.sevenkitchen.cloud/...
⚠️ 有没读出来的 —— 若集中在同一类文档，多半是提示词或那一类照片的问题
```

### 1.3 怎么手动触发（不用等第二天 8:10）

```bash
# ✅ 正确姿势：直接跑那个一次性任务
ssh root@1.14.3.2 'systemctl start sevenkitchen-scan-failure.service'

# 看它跑完没有、退出码是什么
ssh root@1.14.3.2 'systemctl status sevenkitchen-scan-failure.service --no-pager -n 10'
```

> ⚠️ **`systemctl start sevenkitchen-scan-failure.timer` 不会立刻跑** ——
> timer 只负责"到点叫我"，`start` 它等于"把它重新挂上"。
> 要"现在就跑一次"，start 的是 **`.service`**。（任务书里写的是 start timer，
> 两条都执行过：start timer 返回 0 且不影响已排的下一次；真正出报告的是 start service ✓）

不想用 systemd 也能直接跑（**必须在生产机上**）：

```bash
ssh root@1.14.3.2
cd /opt/sevenkitchen/SevenKitchen/backend
bash scripts/scan-failure-report-daily.sh          # 落一份今天的报告，退出码=报告结论
bash scripts/scan-failure-report.sh --local        # 只看屏幕（本机模式，不 ssh 自己）
bash scripts/scan-failure-report.sh --local 168    # 换成最近 7 天
```

在**自己电脑上**手动查（走 ssh，和上线前一样）：

```bash
bash backend/scripts/scan-failure-report.sh        # 最近 24 小时
bash backend/scripts/scan-failure-report.sh 168    # 最近 7 天
```

### 1.4 阈值在哪改

有四个旋钮，**都在 systemd 单元里**（改完要 `daemon-reload` + 下次生效）：

| 想改什么 | 变量 | 现在 | 改在哪 |
|---|---|---|---|
| 看最近多少小时 | `SCAN_FAILURE_HOURS` | `24` | `/etc/systemd/system/sevenkitchen-scan-failure.service` 的 `Environment=` |
| 报告保留多少天 | `SCAN_FAILURE_KEEP_DAYS` | `30` | 同上（清理逻辑是 `-mtime +29`，即"第 30 天及更早"的删掉） |
| 报告放哪个目录 | `SCAN_FAILURE_LOG_DIR` | `/var/log/sevenkitchen` | 同上 |
| 读哪个服务的日志 | `SCAN_FAILURE_SERVICE` | `sevenkitchen-backend` | 同上（灰度服务默认**不看**） |
| 每天都几点跑 | — | `08:10` | `/etc/systemd/system/sevenkitchen-scan-failure.timer` 的 `OnCalendar=` |

改完固定动作：

```bash
ssh root@1.14.3.2 'systemctl daemon-reload && systemctl restart sevenkitchen-scan-failure.timer \
  && systemctl list-timers sevenkitchen-scan-failure.timer --no-pager'
```

**"告警"怎么算**（脚本退出码，systemd 会把非 0 的那次标成 failed）：

| 退出码 | 含义 | 要去做什么 |
|---|---|---|
| `0` | 这段时间没有"一张都没读出来"的 | 什么都不用做 |
| `1` | **有**识别失败 | 看报告里的明细；若集中在同一类文档 → 多半是提示词或那类照片的问题 |
| `2` | 汇总本身没跑成（服务名写错、没权限、在 mac 上误用 `--local`） | 修环境；**不要**当成"没问题" |
| `3` | 报告压根没生成（连"总共识别"那行都没有） | 看 `journalctl -u sevenkitchen-scan-failure` |

一条命令看有没有攒下失败：

```bash
ssh root@1.14.3.2 'systemctl --failed --no-pager | grep -E "scan-failure|UNIT"'
```

### 1.5 装在哪、怎么重装

| 文件 | 作用 |
|---|---|
| `backend/scripts/scan-failure-report.sh` | **给人手动看**的报告（默认 ssh 到生产；加 `--local` 就在本机读 journalctl） |
| `backend/scripts/scan-failure-report-daily.sh` | **定时任务入口**：本机模式 + 落盘到 `/var/log/sevenkitchen/scan-failure-YYYYMMDD.txt` + 保留 30 天 + 原样带出退出码 |
| `backend/scripts/systemd/sevenkitchen-scan-failure.service` | oneshot 服务（被 timer 叫） |
| `backend/scripts/systemd/sevenkitchen-scan-failure.timer` | 每天 08:10（`Persistent=true`，机器重启后补跑） |

三份文件都是**仓库里的版本**，生产上放在：

```
/opt/sevenkitchen/SevenKitchen/backend/scripts/scan-failure-report.sh
/opt/sevenkitchen/SevenKitchen/backend/scripts/scan-failure-report-daily.sh
/etc/systemd/system/sevenkitchen-scan-failure.service
/etc/systemd/system/sevenkitchen-scan-failure.timer
```

重装/换机器时：

```bash
scp backend/scripts/scan-failure-report*.sh root@1.14.3.2:/opt/sevenkitchen/SevenKitchen/backend/scripts/
scp backend/scripts/systemd/sevenkitchen-scan-failure.* root@1.14.3.2:/etc/systemd/system/
ssh root@1.14.3.2 'chmod 755 /opt/sevenkitchen/SevenKitchen/backend/scripts/scan-failure-report*.sh \
  && systemctl daemon-reload && systemctl enable --now sevenkitchen-scan-failure.timer'
```

> ⚠️ 这两份脚本目前是**生产机上的未跟踪文件**（还没进 git 的 main）。
> 部署脚本只做 `git fetch + git reset --hard`，**不会删未跟踪文件** —— 所以能活下来 ✓。
> 但等它们并进 main 之后，部署会把生产上这两份覆盖成 main 的版本，
> 那时以仓库为准（**这正是想要的**）。
> 万一哪天发现 `/opt/.../scripts/scan-failure-report-daily.sh` 不见了，
> 就重跑上面那三条命令（timer 会报 "找不到 …"，见 `journalctl -u sevenkitchen-scan-failure`）。

### 1.6 装的时候踩到的三个坑（都是"假绿"，已修）

| # | 坑 | 症状 | 现在怎么防 |
|---|---|---|---|
| 1 | systemd 起的服务**没有 `HOME`** | 脚本 `set -u` 直接报 `HOME: unbound variable`，报告里只有一行报错 | `$HOME` 只在"要走 ssh"的分支里才算；本机模式完全不碰它 |
| 2 | **服务名写错时 `journalctl -u 错名字` 退出码是 0、输出为空** | 汇总显示"0 次识别 ✓ 一切正常" | 先 `systemctl cat <服务>` 确认 unit 存在；不存在直接 rc=2 |
| 3 | 报告脚本自己挂了，退出码也是 1 | 和"真的有识别失败"分不清 | 每日入口会检查报告里有没有"总共识别"那行；没有就记 rc=3 |

> 这三条的共同点：**坏掉的时候看起来像好的**。所以脚本里对"读不到日志""0 次识别"
> 都留了明确的告警行，宁可吵，不要假绿。

---

## 二、清掉 50 只测试档案（**等老板点头才执行**）

### 2.1 现状（2026-10-17 dry-run 实测）

生产库里有 **50 只**「测01 ~ 测49」测试档案，全部挂在老板账号
`seven爸爸 / 186****8025（id=51e87107-…）` 名下。dry-run 结论：

| 会动什么 | 数量 |
|---|---|
| 接种记录（先删） | **78 条** |
| 抗体检测（再删） | **2 份** |
| 忽略/决定（再删） | 0 条 |
| 狗档案（最后删） | **50 只** |
| 跟着 CASCADE 一起没的 | 体重记录 2、体检记录 1、就诊记录 1、过敏记录 1 |
| ⚠️ 订单：**不删**，但会丢掉"是哪只狗"的关联 | **7 笔，全是 CANCELLED（已取消）** |
| ⚠️ 删完会变成孤儿行（脚本**不删**） | 档案漏斗事件 400、成品漏斗事件 8、自制食谱单 1、订单明细 7 |
| 云上原图（脚本**不删**） | 2 张（测49 的疫苗本 + 抗体报告），由每天 03:07 的 orphan 清理任务回收 |
| 备份文件大小 | 约 **540 KB**（JSON） |

> **要老板拍一下的两件事**：
> ① 那 7 笔 CANCELLED 订单会从"属于某只测试狗"变成"不属于任何狗"（订单本身不删、金额状态都不动）；
> ② 400 条档案漏斗事件会留下（`dog_id` 指向已删的狗）—— 它们是埋点数据，脚本故意不删。

### 2.2 执行步骤（**老板点头后**）

```bash
ssh root@1.14.3.2
cd /opt/sevenkitchen/SevenKitchen/backend

# ① 先看一遍（默认就是 dry-run，一个字节都不写）
node scripts/cleanup-vaccine-test-dogs.js

# ② 确认无误再真删（会先把相关数据全量导出成 JSON，校验通过才删）
node scripts/cleanup-vaccine-test-dogs.js --apply
```

`--apply` 时脚本自己会做四件事（顺序固定）：

1. **安全闸**：待删清单里只要有一只名字不以「测」开头的 → **立刻中止**，什么都不删；
2. **先备份**：`backend/scripts/backup/vaccine-test-dogs-backup-<时间戳>.json`
   （写完会**读回来 `JSON.parse` 校验**，对不上就不删）；
3. **一个事务里按顺序删**：接种记录 → 抗体检测 → 忽略决定 → 狗
   （删狗那一步的 `where` 里**再带一次**「测」字头，双保险）；其余子表由数据库 `CASCADE` 跟着走；
4. **删完复查**：这些狗和它们的关联数据必须都为 0，否则报错退出（备份还在，可据此恢复）。

备份目录 `backend/scripts/backup/` **已在 `.gitignore` 里**（可能含真实档案数据，绝不入库）。

### 2.3 怎么恢复（万一删错了）

备份是"每张表一个数组 + 这 50 只狗的原始行"，按 `dogs[].id` 就能把行找回来。
恢复思路（**人工确认后再做**，不要直接跑）：

```bash
# 备份在生产机上（把 <时间戳> 换成实际那一份）
ls -la /opt/sevenkitchen/SevenKitchen/backend/scripts/backup/
# 文件结构：{ dogs: [...], related: { vaccineRecord: [...], antibodyTestRecord: [...], … },
#            orphansNotDeleted: {...}, ordersNotDeleted: [...] }
```

---

## 三、相关文件

| 文件 | 是什么 |
|---|---|
| `backend/scripts/scan-failure-report.sh` | 识别失败汇总（手动版 / `--local` 本机版） |
| `backend/scripts/scan-failure-report-daily.sh` | 每日定时任务入口（落盘 + 保留 30 天 + 退出码） |
| `backend/scripts/systemd/sevenkitchen-scan-failure.{service,timer}` | systemd 单元（仓库里的版本，装到 `/etc/systemd/system/`） |
| `backend/scripts/cleanup-vaccine-test-dogs.js` | 清测试档案（默认 dry-run，`--apply` 才删） |
| `docs/plans/2026-10-16-vaccine-recognition-baseline.md` | 识别基线（"0 次失败"这个结论的出处） |
| `docs/plans/2026-10-16-e6-vaccine-e2e-automation.md` | 端到端自动化（E6）怎么跑、连的是生产这件事的来龙去脉 |
