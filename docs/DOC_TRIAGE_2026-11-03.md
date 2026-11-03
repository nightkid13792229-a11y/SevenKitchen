# 文档分堆清单（2026-11-03）

> 目的：先判断“哪些文档值得继续维护”，本次**不修改、不删除、不移动**任何现有文档。
> 范围：仓库内 `docs/**/*.md` 共 483 份，根目录 `.md` 共 13 份（含 `AGENTS.md`）。
> 结论：真正需要长期维护的约 **15–20 份**；其余绝大多数是历史/一次性资料，按“归档”处理，不逐份改写。

---

## 一、判断标准

一份文档值得继续维护，至少要满足其中两条：

1. 它影响**高频决策**（字段名、接口、部署、权限、通知、时区、金额口径）。
2. 它包含**代码里看不出来的信息**（约束、取舍、为什么、踩过的坑）。
3. 它有**机制保证不被写错**（生成、测试、钩子、评审、固定更新人）。

三条都不满足，就应该归档或删除；只满足第 1 条，应做成“可校验的活文档”；只满足第 2 条，应写成短小的决策记录。

---

## 二、总账

| 类别 | 数量（约） | 处理方式 |
|---|---:|---|
| 活文档（长期维护） | 15–20 | 保留，纳入固定更新 |
| 需刷新/瘦身 | 8–10 | 保留但重写、删明细、或改为生成 |
| 历史资料（按日期） | 约 440 | 归档到 `_archive/`，加“历史记录”横幅 |
| 重复/一次性资料 | 10–15 | 合并到活文档，原件归档或删除 |

> 数量按目录估算，不是逐文件精确统计。重点不是“483 份都要分类”，而是把真正要养的那十几份挑出来。
> 后文引用的“其后提交数”只是**漂移风险信号**，不等于内容一定错；最终判断以对照代码为准。

---

## 三、核心文档清单

| 文档 | 现状 | 建议 | 优先级 |
|---|---|---|---|
| `AGENTS.md` | 2026-11-03 更新；路径和命令是新的 | **保留**，逐条核对业务说法（端口、部署、钩子、技能） | P0 |
| `.agents/skills/`（3 个技能） | 2026-11-03 迁移到 DSH 结构 | **保留**，逐条核对命令、路径、流程 | P0 |
| `docs/DATABASE_NAMING_CONVENTIONS.md` | 2025-12-24；字段示例已错：`birthDate` 实际是 `birthday`，Dog 表体重实际是 `currentWeightKg`；全篇 0 次提疫苗/过敏/采购/知识库/补剂 | **重写**为“原则 + 验证方法”，字段表由 Prisma schema 生成 | P0 |
| `docs/05_API_Specs.md` | 2026-10-16 后 570 个后端提交；文档约 29 个接口段落 vs 后端 84 个 controller；缺采购/知识库/补剂 | 只留跨接口约定；接口清单从 controller/OpenAPI 生成 | P1 |
| `docs/07_Core_Architecture.md` | 2026-10-04 后 699 个相关提交；1347 行，含大量字段明细 | 保留“模块地图 + 关键决策”，删易过期的字段明细 | P1 |
| `docs/04_Domain_Model_and_Algorithms.md` | 2026-10-04 后 282 个相关提交 | 保留算法、状态机、不变量；删过时表结构 | P1 |
| `docs/03_Features_and_UI_Blueprints.md` | 2026-10-04 后 694 个相关提交 | 保留“页面/功能对照表”，删细节截图与旧交互 | P1 |
| `docs/02_Roles_and_Core_Flows.md` | 2025-12-16 后 2,345 个提交 | 重写成短版“角色 + 主流程”，细节交给代码/页面 | P2 |
| `docs/01_Project_Overview.md` | 2025-12-16 后 2,102 个提交 | 重写成 1–2 页概览 | P2 |
| `docs/00_Tech_Stack_Standards.md` | 2025-12-16 后 65 个提交 | 刷新技术栈、目录约定、测试命令 | P2 |
| `README.md` | 2025-12-24 | 更新 quick start；去掉“AI 必读旧入口”，指向 `AGENTS.md` | P2 |
| `docs/06_Cursor_Collaboration_Guide.md` | 2025-12-16，Cursor 专用 | Cursor 仍在用则更新；不用则归档或删除 | P2 |
| `docs/MULTI_SESSION_WORKFLOW.md` | 2026-11-03 新建 | **保留**，随流程变化维护 | — |
| `docs/员工端UI规范.md` | 2026-11-03 | **保留**，随员工端 UI 变化维护 | — |
| `docs/notification-matrix.md` | 2026-10-31 | **保留**，逐条核对代码里的通知触发点 | P1 |
| `docs/TIMEZONE_HANDLING.md` | 2026-01-23 | **保留**，核对当前时区实现是否仍遵守 | P1 |
| `docs/supplement-amount-rules.md` | 2026-04-17 | **保留**，核对补剂损耗/添加量口径 | P1 |
| `docs/ingredient-batch-replace.md` | 2026-09-03 | 保留或并到“原料领域”文档 | P2 |
| `docs/DEPLOYMENT.md` + `docs/REMOTE_DEPLOY_GUIDE.md` + `docs/SSH_REFACTOR.md` | 三份讲同一套部署/SSH，内容重叠 | **合并成一份《生产部署与 SSH 手册》**，其余归档 | P1 |
| `docs/COS_*`、`docs/BCS_IMAGE_*`、根目录 `TENCENT_COS_SETUP.md` | 六份讲 COS/图片/CDN，内容重叠 | **合并成一份《对象存储与图片故障手册》**，其余归档 | P2 |
| `docs/PRINT_LAYOUT_DESIGN.md`、`PRINTER_TROUBLESHOOTING.md`、`JCING_SDK_SETUP.md` | 打印机三份 | 合并成一份“打印机配置与排障”，保留操作步骤 | P2 |
| `docs/knowledge-base/`（22 份） | 治理类与审计/报告类混在一起 | 保留 `evidence-policy`、`source-register`、`knowledge-structure-v1`；审计/报告归档 | P1/P2 |
| `docs/design/`（3 份） | 设计草案/审核单 | 当前仍在用的保留；已实施的归档 | P2 |
| `docs/testing/`（2 份） | 验收/测试指南 | 若回归测试仍引用则保留，否则归档 | P2 |

---

## 四、根目录一次性资料

这些基本是某次改造的“完成报告/测试报告/优化计划”，不建议继续维护：

| 文档 | 时间 | 建议 |
|---|---|---|
| `FRONTEND_TEST_REPORT.md` | 2026-01-14 | 归档 |
| `IMPLEMENTATION_GUIDE.md` | 2026-01-14 | 归档 |
| `INGREDIENT_VERIFICATION_REPORT.md` | 2026-01-14 | 归档 |
| `MINIPAPP_COMPLETION_REPORT.md` | 2026-01-14 | 归档 |
| `TEST_REPORT.md` | 2026-01-14 | 归档 |
| `P0_OPTIMIZATION_PLAN.md` | 2026-09-09（已实施） | 归档 |
| `P1_OPTIMIZATION_PLAN.md` | 2026-09-10（待实施） | 先确认是否还做；不做就归档 |
| `P2_OPTIMIZATION_PLAN.md` | 2026-09-10（待实施） | 先确认是否还做；不做就归档 |
| `UX_RECTIFICATION_LIST.md` | 2026-09-09 | 归档 |
| `TENCENT_COS_SETUP.md` | 2026-01-09 | 合并到 COS 运维手册后归档 |

---

## 五、按目录批量处理

| 目录 | 数量 | 处理 |
|---|---:|---|
| `docs/plans/` | 150 | **全部归档**。按日期命名的设计/执行/收尾记录，属于历史。 |
| `docs/superpowers/plans/`、`specs/`、`acceptance/`、`reviews/`、`audits/` | 219 | **全部归档**。设计历史与验收记录，不再当作当前实现说明。 |
| `docs/audits/` | 9 | **归档**。按日期的代码/算法/UI 审计报告。 |
| `docs/reports/` | 26 | **归档**。按日期的导入、审计、事故复盘。 |
| `docs/handoff/` | 4 | **归档**；其中环境/账号交接可保留为内部参考，但不要当现行流程。 |
| `docs/_history/`、`docs/_alignment/` | 8 | 已经是历史区，保留现状。 |
| `docs/knowledge-base/` | 22 | 治理类保留；审计/报告/一次性清单归档。 |
| `docs/testing/` | 2 | 核对是否仍被回归流程引用；没有就归档。 |
| `docs/prototypes/`、`docs/e2e/`、`docs/config/` | 5 | 归档或作为参考资料，不纳入日常维护。 |

---

## 六、建议的目标结构（本次不执行）

```text
docs/
  core/                 # 00–07 的瘦身版 + 数据库命名规范
  ops/                  # 生产部署、SSH、COS/图片、打印机
  domain/               # 时区、补剂口径、通知矩阵
  knowledge-base/       # 知识库治理层
  _archive/             # plans、audits、reports、handoff、superpowers
```

移动文件是下一步的事；这次只定“留 / 改 / 归档”的边界。

---

## 七、执行顺序建议

1. **P0（先做）**：`AGENTS.md` + 三个技能 + 数据库命名规范。  
   这些是 AI 每次行动都会读的，错了会直接导致写错字段或跑错命令。
2. **P1**：API 规范、核心架构、领域模型、功能蓝图、部署/SSH 合并。  
   分模块做，每份先出“过时/缺失”清单，再改。
3. **P2**：技术栈、项目概览、角色流程、README、COS/BCS/打印机合并。
4. **P3**：批量归档 + 加“历史记录”横幅。  
   只移动/标注，不逐份改写。

---

## 八、这次没有动什么

- 没有修改、删除、移动任何现有文档。
- 没有改代码。
- 旧 worktree 里的文档不在本次范围。
- 本清单本身是新增文件，方便后续按图施工。
