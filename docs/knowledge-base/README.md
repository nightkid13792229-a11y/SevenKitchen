> **2026-11-11 起运行时以 v3 为准**：知识库只做原文图书馆（书/页/块/目录 + 3 个动作），
> 387 条结论已删除。历史治理/评测文档保留作背景；设计与实施见
> [2026-11-11-kb-v3-design.md](2026-11-11-kb-v3-design.md)，上线/运维见
> [RUNBOOK-kb-v3.md](RUNBOOK-kb-v3.md)；Agent 接线见
> [2026-11-12-kb-v3-agent-wiring.md](2026-11-12-kb-v3-agent-wiring.md)。下面第一～五节是 v1/v2 历史记录，已下线，只作背景。

# 知识库（治理层）

**建立日期**：2026-09-30
**这一层是干什么的**：规定知识**从哪来、能不能用、怎么维持不过期**。
它和代码里的知识库是两件事，配套使用。

---

> **历史（v1/v2，已下线）**：结论层、`review-packet/` 审核包和配套的
> `audit-health-knowledge.ts` / `export-knowledge-review-packet.ts` 已随 v3 删除；
> 下面是当时的形态，只作背景，不要再照着跑。

## 一、两层结构

```
运行时层（旧，已删除）
  backend/src/domain/recipe-designer/knowledge-base/
  └ 每条知识 = id · 领域 · 标签 · 关键词 · 结论 · 要点 · 注意事项 · 出处 · 引用优先级

治理层（本目录，给人看、给流程用）
  ├ source-register.md      来源登记表：有哪些来源、什么版本、本地有没有、用在哪
  ├ evidence-policy.md      证据分级 A–E + 七条硬边界 + 分诊口径
  ├ intake-sop.md           新来源/新条目怎么入库
  └ evidence-update-sop.md  多久复核一次、过期了怎么办
```

> **为什么要有治理层**：规定知识**从哪来、能不能用、怎么维持不过期**。
> 结论层已删除，但“来源是否可信、是否过期”的治理记录仍保留作背景。

### 旧自检脚本（已删除）

`audit-health-knowledge.ts` 和 `export-knowledge-review-packet.ts` 随 387 条结论一起删除，
不要再引用或恢复。v3 的验证改用 `npm run kb:v3:smoke` / `npm run kb:v3:bench`
与 `scripts/knowledge-v3/assert-no-conclusions.ts`（见 [RUNBOOK-kb-v3.md](RUNBOOK-kb-v3.md)）。

---

## 二、四条核心规则

| # | 规则 |
|---|---|
| 1 | **知识条目引用的每个来源，必须先在 `source-register.md` 登记**。没登记的不许写进条目 |
| 2 | **紧急程度（立即就医/尽快就医/可观察）由人写死，AI 只能照用，不许自己判断** |
| 3 | **不给诊断、不给分期、不给药物剂量**；化验区间以顾客报告为准 |
| 4 | **没有出处的结论，一个字都不说** |

---

## 三、来源清单概览

完整清单见 `source-register.md`。当前状态：

| 领域 | 必需来源 | 状态 |
|---|---|---|
| 免疫（新建） | WSAVA 2024 疫苗指南 | 📁 正本已在本地 |
| 营养（已有） | WSAVA 工具包 / FEDIAF 2025 / NRC 2006 / SACN5 / AAHA | 📁 全部已在本地 |
| 检查指标解读（新建） | SACN5 + Merck 兽医手册（公开网页）+ IRIS | 📁 + 🌐 |
| 常见病与就医时机（新建） | SACN5 + WSAVA 各专科指南（公开） + ACVIM 共识 | 📁 + 🌐 |
| 预防与体检节奏（第二批） | AAHA 生命阶段指南 2019 + AAHA 老年照护工具包 2023 + IRIS | 📁 已在本地 |
| 日常护理（第二批） | WSAVA 口腔指南 + AAHA 口腔指南 2019 + WSAVA 福祉/营养工具包 | 📁 已在本地 |
| 就诊前准备（第二批） | WSAVA 营养工具包（饮食史表/评估清单）+ AAHA 生命阶段指南 | 📁 已在本地 |
| 品种遗传风险（第二批） | WSAVA 遗传病委员会立场文件 + AAHA 生命阶段/老年工具包 | 📁 已在本地 |
| 行为与认知（第二批） | AAHA 老年照护工具包 2023 + WSAVA 福祉指南 + WSAVA 疼痛指南 | 📁 已在本地 |

> **来源文件不放进代码仓库。** 体积太大（数百 MB）、且多数有版权限制。
> 登记表里记录**本地绝对路径 + SHA256**（本地的）或**官方链接**（公开的）。

---

## 四、原文层（B 方案，老板 2026-09-30 决定）

资料库不只做"存档备查"，还要**让 AI 能直接读原文**。完整方案见
`source-archive-and-retrieval-plan.md`，要点：

| 要点 | 内容 |
|---|---|
| 三层结构 | 原文层（AI 可读、给出页码）／结论层（已审核条目）／输出层（分诊口径 + 免责声明） |
| 关键约束 | **AI 能读原文，但面向顾客的结论只能来自已审核条目**——防止拿原文片段拼出新结论或顺势下诊断 |
| 来源落地 | **全部下载到本地 + 上传生产服务器受保护目录**，不依赖网络实时访问（约 550 MB） |
| 检索 | 「领域标签 → 章节」映射表 + 中文关键词（`pg_trgm`）；**向量检索暂不做**（PG 没装 `pgvector`）。**这是早期 B 方案；当前检索行为以 §五 为准** |
| 前置条件 | **必须先修检索上限**，否则加了原文层提示词会继续膨胀 |

---

## 五、最小图书馆版（2026-11-09，历史；已被 v3 取代）

这一节是**当时（2026-11-09）的运行时形态**，不是当前契约；上面的治理层（来源登记、证据政策、SOP）不变。

> **口径说明（已过时）**：本节描述的是 2026-11-09 的 v1/v2 形态；v3 已用
> `catalog` / `find` / `read` 三个动作取代它，387 条结论层与健康分析已下线。
> 下面只作历史背景，当前契约以 [2026-11-11-kb-v3-design.md](2026-11-11-kb-v3-design.md) 为准。

**一句话**：知识库只做图书馆——藏书、编目、索引、借阅；不做临床判断；一个语料、一个服务入口；物种/分期只做检索提示，不做硬门禁。

| 工具 | 用途 | 关键约束 |
|---|---|---|
| `search_knowledge_library` | 按问题找「节」 | 返回 ≤5 节；每节 ≤2 段；同一文档 ≤2 节；带表格命中；分期只扩召回 |
| `open_knowledge` | 打开节/表/引用 | `sectionId` / `tableId` / `citationId` 三选一；每段/每表登记 `K#` |
| `knowledge_scope` | 看馆藏 | 配方侧默认 CKD 5 份；列文档/节/段/表 |

**检索规则（v1.1）**：

- **分期只扩召回、软排序，不做硬过滤**：`stage 1–4` 短语只用来把对应分期内容召回，不排除其他分期；
  排序里对匹配分期加权、对其他分期只降权。Stage 3 证据不会因为标签写成 2 期而消失。
- **焦点门禁按优先级**：`topicPhrases`（如 `vitamin k` / `fish oil` / `omega-3`）非空时**必须命中短语**；
  否则命中任一 `focusTerms` 或 `stagePhrases`；三组都空才不做门禁。`CKD dog vitamin K target`
  不会因为命中 `vitamin` 就返回 `vitamin D`。
- **查不到就说没覆盖**：门禁后为空返回 `status:"no_match"`（0 节 0 表），不拿常识补。

**范围**：

- **配方 Agent 只开放 CKD 5 份文档**；传非 CKD 的 `documentIds`/`sourceIds` 或打开非 CKD 节/表 → `ok:false`。
- **补剂 Agent 可查全库**（不传 `documentIds`），走同一个 `KnowledgeLibraryService`；`chunks.jsonl` 不再是运行时依赖。
- **全库章节编目/表格扩展留到 v2**，不在本阶段。

**质量在产品外**：

- 在 `backend/` 下跑 `npm run kb:eval`：**26 题**（走 Agent 工具层 `executeTool`），每次改动后跑，记录基线；
  产品运行时不加载金标准。`--no-write` 只验证、不覆盖已提交报告。
- 在 `backend/` 下跑 `npm run kb:smoke`：**5 场景引用冒烟**（检索 → 打开 → `K#` 有效 + 1 个负样本）。
- 两者都在**产品外**跑，不参与运行时。

**文档指针**：

- 设计与阶段目标：[2026-11-09-kb-minimal-library-design.md](2026-11-09-kb-minimal-library-design.md)
- 实施计划：[2026-11-09-kb-minimal-library.md](../superpowers/plans/2026-11-09-kb-minimal-library.md)
- 26 题回归结果：[ckd-structure/library-evaluation.md](ckd-structure/library-evaluation.md)
- 5 场景引用冒烟：[ckd-structure/citation-smoke.md](ckd-structure/citation-smoke.md)
- 全库扩展开关：[ckd-structure/full-library-decision.md](ckd-structure/full-library-decision.md)

---

## 六、相关文档

- 《健康管理 · 需求报告》：`docs/_archive/plans/2026-09-30-health-management-requirements.md`
- 《知识库 · 技术评审 + 来源清单 + 扩充计划》：
  `docs/_archive/plans/2026-09-30-knowledge-base-review-and-source-plan.md`
- 《资料库 B 方案 · 原文归档 + AI 读原文》：
  `docs/knowledge-base/source-archive-and-retrieval-plan.md`
