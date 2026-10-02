# 健康知识审核包

**这份目录是干什么的**：把代码里的健康知识条目导出成**能打印、能打勾、能写意见**的文档，
交给合作兽医审。老板定的边界是**没人审过就不给顾客看**，所以这一份文档就是那道闸门。

## 怎么生成

```bash
cd backend
npx ts-node -r tsconfig-paths/register scripts/export-knowledge-review-packet.ts
# 可选：--out <目录>  --date <YYYY-MM-DD>
```

会生成两个文件（同一批条目，两种用法）：

| 文件 | 给谁用 | 特点 |
|---|---|---|
| `健康知识审核包-<日期>.md` | 兽医逐条读 | 按领域分节；每条带结论、要点、注意事项、出处、风险等级、紧急程度、证据强度，后面留「□ 通过 □ 需修改 □ 删除 □ 拿不准」与意见栏 |
| `健康知识审核包-<日期>.csv` | 批量筛选/回填 | 一行一条，带 BOM，Excel 直接打开不乱码；最后两列「审核结论」「审核意见」留空待填 |

导出前建议先跑一次内容自检：

```bash
cd backend
npx ts-node -r tsconfig-paths/register scripts/audit-health-knowledge.ts
```

它会报出结构校验管不到的问题：标题写重复、正文里混进猫的内容（**我们只做狗**）、
复核日期已过期、健康侧条目被误标成已审核。
**硬问题（退出码 1）必须清零再送审**；"待人工判断"那部分可以自己先过一眼。

## 审核结论怎么用（2026-10-02 起有工具了）

兽医填完 CSV 的「审核结论（请填）」列之后，**一条命令回填**：

```bash
cd backend
# 先预览（默认什么都不写），CSV 路径缺省取 review-packet 里最新那份
npx ts-node -r tsconfig-paths/register scripts/apply-knowledge-review.ts --reviewer "XX动物医院 王医生"
# 确认无误再落盘
npx ts-node -r tsconfig-paths/register scripts/apply-knowledge-review.ts --reviewer "XX动物医院 王医生" --apply
```

| 结论 | 工具做什么 |
|---|---|
| 通过 | 记进 `knowledge-base/approvals.ts` 的**审核登记表**（带审核人 + 日期）→ 顾客侧据此放行 |
| 需修改 | **不改代码**，条目保持未审核；意见打印出来，我们改内容后下一轮再审 |
| 删除 | **不自动删**（删内容是破坏性操作），列入清单交人工处理 |
| 拿不准 / 未填 | 原样保持未审核 |

> **为什么"通过"不直接改条目的 `reviewStatus`**：条目分散在 32 个数据文件里，
> 一条条改代码块既容易改错、diff 也吵；更要紧的是要**留痕** ——
> 谁在什么时候把哪条放行的，得一眼查得到。
> 所以约定：数据文件里的 `reviewStatus` 是作者写的初始状态，
> **只有审核登记表才是"通过"的唯一凭据**，而它只由这个脚本生成、不手写。
| 拿不准 | 保持 `PENDING_REVIEW`，单独列一份问题清单再找人定 |

> **这件事卡着两条产品线**：`HEALTH_ANALYSIS=customer`（AI 健康分析给顾客看）
> 与 `VACCINE_PLAN=customer`（疫苗计划给顾客看）两个开关默认是关的，
> 只有等条目审完才有意义去开。
>
> **进度（2026-10-02）**：188 条送审内容全数通过，登记进 `approvals.ts`（审核人栏写的是
> "合作兽医（老板 2026-10-02 转达：全部通过）"）。
> · `HEALTH_ANALYSIS=customer` —— **已开**，生产环境 2026-10-02 起顾客侧「健康分析」可见。
> · `VACCINE_PLAN=customer` —— **还没开**，等老板定。
> 另外按老板要求，知识库只保留犬相关结论，猫的内容（含猫心肌病共识）已从条目里剔除。

