# 知识库最小图书馆版（v1.1）设计与阶段目标

**日期**：2026-11-09
**状态**：方向已确认；v1.1 已按独立审查修正
**实施计划**：[2026-11-09-kb-minimal-library.md](../superpowers/plans/2026-11-09-kb-minimal-library.md)
**评审报告**：[2026-11-09-knowledge-base-agent-service-review.md](2026-11-09-knowledge-base-agent-service-review.md)
**一句话**：知识库只做图书馆——藏书、编目、索引、借阅；不做临床判断；一个语料、一个服务入口；物种/分期只做检索提示，不做硬门禁。

---

## 1. 为什么改

2026-11-09 的评审结论：

- 内容资产强：159 份文档、27,902 段、499 张表、387 条有出处结论；
- 但「给 Agent 用」的服务层有四个硬伤：
  1. **Stage 3 证据被硬过滤藏掉**：IRIS 治疗建议的 Stage 3 内容在 `s005`，标题却是「Stage 2 的补充建议」，分期标签写成 2 期；按 3 期筛选时整节被排除。
  2. **表格打不开**：CKD 5 份文档有 23 张表，包括 IRIS 分期表和 SACN5 表 37-9；检索只搜正文段落。
  3. **全库检索是坏的**：一个常见 CKD 查询全库命中 11,973 段，候选池按文档编号只取前 1,000 段，SACN5/IRIS 一段都没进。
  4. **中文查询返回任意结果**：`CKD 3期 血磷 目标` 返回 5 条分数相同的任意段落——看起来有结果，其实一条都没查到。

老板的判断（2026-11-09）：**知识库应该像图书馆，分类清楚、查询高效；不要预判物种/分期，不要做金标准这种提前判定。**

独立审查（2026-11-09）补充了四个必须先解决的设计问题：

1. `s005` 的 6 段 Stage 3 原文**全部不含** `phosphate`/`phosphorus`；如果按「焦点营养词」做门禁，Stage 3 会被再次藏掉。
2. 如果把 `stage 3` 当门禁，又等于按分期硬排除，违反「不硬过滤」；还会把通用膳食磷证据（如 `S-s017`）排除。
3. 焦点词如果做成白名单，`biotin/manganese/chromium` 这类未知词会退回 `ckd/dog` 背景词，负样本全失败。
4. 26 题评估如果绕过 Agent 工具层，测的是裸服务，不是 Agent 实际行为；旧 14 题靠 `topics` + 手调 ×3 通过，新题集不能假装这些不存在。

**v1.1 的解决方式**：

- **分期短语只做召回扩展，不做门禁**（`stage 3` 可以命中 `s005`，但不排斥其他分期）；
- **焦点词 = 查询内容词减去背景词**（未知营养素天然是焦点，0 命中就是 `no_match`）；
- **门禁是「焦点短语 OR 焦点词 OR 分期短语」三者任一**，不是「必须同时满足」；
- **评估走 `executeTool`**，用和 Agent 一样的路径；
- **复用现有 `SourceLayerService`** 做打开/馆藏，不再新建第三个查询服务。

---

## 2. 设计原则

1. **图书馆，不是参考咨询**：知识库只提供证据，不提供诊断、分期、剂量、推荐结论。
2. **结构不是判断**：文档/章节/页码/表格是「书的结构」；物种/分期/主题是「编目」，描述的是书，不是病人。
3. **编目只帮「找到」**：默认只影响排序；分期短语只扩展召回，不排除其他分期。
4. **一个语料、一个服务入口**：配方 Agent、补剂 Agent 共用同一套原文检索；健康分析的 387 条结论保持独立。
5. **质量在产品外**：26 题回归、检索日志、人工抽检都在产品外跑；运行时不加载金标准。
6. **先修「查不到/查错」，再扩库**：全库章节编目不在本阶段。

---

## 3. 目标架构

```
L0 来源登记（已有，本阶段不改）
   source_id / 名称 / 机构 / 版本 / 状态（current|superseded）
        │
L1 原文层（已有，不改表结构）
   document → section → paragraph
                     └→ table / figure（caption、列、行、页码）
        │
L2 检索层（本阶段重点）
   - 现有 source_paragraph 子串检索（pg_trgm 已建；不新增 tsvector）
   - 中文/英文查询扩展 + 焦点识别（代码内）
   - 章节分组（一节 = 一个检索单位）
   - 表格检索（caption + 行文本，应用层）
   - 分期短语只做召回扩展；不做硬过滤
        │
L3 结论层（保留，本阶段不动）
   387 条，仅健康分析使用
        │
        ▼
一个服务入口，三个工具
   search_knowledge_library  找节
   open_knowledge            打开节/表
   knowledge_scope           看馆藏

内部复用两个现有 provider：
  KnowledgeLibraryService（检索）
  SourceLayerService（打开/馆藏/表格视图）
不新增第三个查询服务，避免三套原文查询行为分叉。
```

**为什么不建新的 `kb_unit` 表**：

- 现有 `source_section` 已经是「书的一节」，够用；
- 新建单元表、逐节人工确认、覆盖矩阵，是 v2 的编目增强，不是 v1 的查询前提；
- 先把「检索 + 打开 + 表格 + 中文」做好，再决定要不要加单元表。

---

## 4. 范围

### 做

1. 去掉物种/分期/主题的**硬过滤**；分期短语改召回扩展，焦点词/短语做相关性门禁；
2. 配方工具去掉坏的 `scope=all`，只开放 CKD 5 份文档；补剂适配器不传 `documentIds`，查全库；
3. 检索结果按**节**分组：一节最多 2 段、同一文档最多 2 节、一次最多 5 节；
4. 新增 `open_knowledge`：打开整节（分页 12 段）、表格、上下文；
5. 新增 `knowledge_scope`：列出 CKD 馆藏文档/节/表；
6. 表格可检索、可打开、可引用（表格 K 号）；
7. 中文查询扩展（CKD 术语表），中文查不到时明确 `no_match`；
8. 补剂 Agent 改调同一服务，退休 `chunks.jsonl` 运行时依赖；
9. 26 题回归集（走 Agent 工具层）+ 检索日志汇总脚本；
10. 修显示标题/子标题（页眉型标题、Stage 3 子标题），不重切 PDF。

### 不做

- 配方 Agent 只开放 CKD 5 份；不做全库章节编目/表格扩展；
- 不做逐节物种/分期人工确认；
- 不建疾病—营养素规则表；
- 不把 387 条结论注入配方 Agent；
- 不上向量库/embedding/reranker；
- 不做覆盖矩阵/`kb_lookup`；
- 不重切 SACN5 章节（v2 再做）；
- 不改健康分析；
- 不在本阶段加原文接口鉴权（单独安全任务）。

---

## 5. 阶段目标（Phase 1）

**阶段周期**：约 2–3 周，**12–16 人日**（不含内容审阅）；只做「止血子集」（去硬过滤 + 开表 + 中文/空结果）可压到 **7–9 人日**。
**阶段出口**：下面 7 个目标全部达标，才进入下一阶段（v2 编目/扩库）。

| # | 目标 | 现状（2026-11-09） | 本阶段目标 | 验证方式 |
|---|---|---|---|---|
| G1 | **Stage 3 证据可达** | 硬过滤会把 `s005` 整节排除；6 段 Stage 3 原文都不含 phosphate/phosphorus | **不做分期门禁**；`stage 3` 作为召回扩展；`s005` 前 3 节；`open` 能读到 Stage 3 原文 | 26 题 `stage3`/`zh-stage3`；真实数据回归 |
| G2 | **表格可打开** | 23 张 CKD 表对 Agent 不可见；0 张可打开 | 5 组核心表（37-1、37-9、37-11/12、AAHA 表 8）可打开、可引用；数值题能从表 37-9/37-11 取到值 | 26 题 2 道表题；`open_knowledge(tableId)` |
| G3 | **中文查询可用** | `CKD 3期 血磷 目标` 返回任意段落，等于没查到 | 6 道中文题中 ≥5 道前 3 节命中预期；查不到时返回 `no_match` | 26 题中文组 |
| G4 | **查不到说得清** | 只有 1 道碘题；空结果摘要只说「换个关键词」 | 4 道负样本全部返回 `no_match`/「本库未覆盖」；`biotin/manganese/chromium` 不因 `ckd/dog` 背景词返回无关段落 | 26 题负样本组 |
| G5 | **一个图书馆** | 配方 Agent（Postgres）、补剂 Agent（chunks.jsonl）、健康分析（387 条）三条路 | 配方 + 补剂共用同一个 `KnowledgeLibraryService`；配方显式 CKD，补剂查全库；补剂不再依赖 17MB 文件；生产无「知识库不可用」 | 补剂 3 查询 + 单测 + 部署冒烟 |
| G6 | **可回归** | 14 题、12 个期望章节、8/14 有同节重复；无 CI | 26 题、6 类；**走 `executeTool` Agent 路径**；每次改动跑 `kb:eval`，记录基线；关键指标不下降 | `npm run kb:eval` |
| G7 | **性能** | 未测；CKD 857 段顺序扫描 | CKD 检索 p95 <300ms；单次工具返回 <1s；返回 ≤5 节/≤10 段 | 本地计时脚本 |

**一句话验收**：

> 问 Stage 3 能拿到 Stage 3 原文；问数字能打开表格并引用；中文问得到英文原文；查不到就说没覆盖；两个 Agent 用同一个库；改完能跑 26 题证明没变坏。

---

## 6. 接口契约

### 6.1 工具清单

保留 `search_knowledge_library`（不改名，兼容历史会话和引用恢复），新增两个工具：

| 工具 | 用途 | 关键约束 |
|---|---|---|
| `search_knowledge_library` | 按问题找「节」 | 返回 ≤5 节；每节 ≤2 段；同一文档 ≤2 节；带表格命中；分期只扩召回 |
| `open_knowledge` | 打开节/表/引用 | 三选一：`sectionId` / `tableId` / `citationId`；配方侧校验 CKD 归属 |
| `knowledge_scope` | 看馆藏 | 配方侧默认 CKD 5 份；列出文档/节数/段数/表数 |

### 6.2 `search_knowledge_library` 输入

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `query` | string | 是 | 检索词；中英文都行，中文会自动扩展 |
| `sourceIds` | string[] | 否 | 如 `["SACN5","IRIS-CKD-2026","AAHA-2021-NUTRITION"]` |
| `documentIds` | string[] | 否 | 配方侧只允许 CKD 5 份；补剂不传 |
| `sectionIds` | string[] | 否 | 一般不用传 |
| `species` | `dog`/`cat` | 否 | **排序提示**，不会排除 |
| `stage` | 1–4 | 否 | **召回扩展 + 排序提示**，不会排除其他分期 |
| `topics` | string[] | 否 | **排序提示**，不会排除；未知主题报错并列合法值 |
| `limit` | 1–10 | 否 | 节数，默认 5 |

移除 `scope` 参数。配方工具传非 CKD 的 `documentIds` 返回 `ok:false`；补剂适配器不传 `documentIds`。

### 6.3 `search_knowledge_library` 返回

```text
status: "ok" | "no_match"
query: string
sections: SectionHit[]        // ≤5
tables: TableHitSummary[]     // ≤3，文档级
count: number
hints?: string[]              // 没结果时的下一步建议
```

`SectionHit`：

```text
sectionId, sectionTitle, displayTitle, subheading
documentId, documentTitle, sourceId, sourceName, sourceVersion
pageStart, pageEnd, score
passages: LibraryPassage[]    // ≤2，每段带 citationId
```

`TableHitSummary`：

```text
tableId, caption, pageNo, rowCount, documentId, sourceId, citationId
```

### 6.4 `open_knowledge` 输入/返回

输入三选一：

```text
sectionId?: string
tableId?: string
citationId?: string
paragraphOffset?: number   // 打开节时用，默认 0，每页 12 段
```

返回：

```text
status: "ok"
section?: SectionView
table?: TableView
citationId?: string          // 打开的表格/段落对应 K 号
```

`SectionView`：`sectionId/title/displayTitle/documentId/documentTitle/sourceId/sourceName/sourceVersion/pageStart/pageEnd/paragraphs/totalParagraphs/nextOffset/tables/previousSectionId/nextSectionId`；`paragraphs` 默认最多 12 段，`tables` 最多 3 张。
`TableView`：`tableId/caption/pageNo/columns/rows/rowCount/documentId/documentTitle/sourceId/sourceName`。

**范围校验**：

- 配方侧 `open_knowledge` 必须校验 `section.documentId` / `table.documentId ∈ CKD_DOCUMENT_IDS`；否则 `ok:false`。
- `knowledge_scope` 默认只返回 CKD 5 份；`sourceId` 只做收窄，不做扩权。

### 6.5 `knowledge_scope` 返回

```text
status: "ok"
documents: Array<{
  id, title, sourceId, sourceName,
  sections, paragraphs, tables, pageCount
}>
totals: { documents, sections, paragraphs, tables }
```

### 6.6 引用

- 段落：`K#` → 段落 ID + 来源/节/页码。
- 表格：`K#` → 表格 ID + 表题 + 页码；`text` 用「表题 + 行文本（截到 1,500 字）」供裁判判断。
- `open_knowledge` 打开表格/节时**必须**登记 K 号；打开节返回的每段都登记。
- `CitationRecord` 增加 `recordId`（去重键）、`kind: 'passage' | 'table'`、`tableId?`、`sectionId: string | null`；`passageId` 改为可选；表格的 `recordId = tableId`，`passageId = tableId` 仅作兼容。
- 会话恢复：识别 `sections[].passages[]`、`data.passages[]`、`data.section.paragraphs[]`、`data.table`、`data.tables[]`；表格摘要没有全文时，用 `SourceLayerService.openTable(tableId)` 补 `text`；找不到就跳过并在日志里记一条，不静默通过。

### 6.7 提示词

系统提示词只加四条全局约束：

1. 知识库是图书馆，不是结论库；不知道库里有什么时，先用 `knowledge_scope` 看一眼，再用 `search_knowledge_library` 找节；需要全文/表格用 `open_knowledge`。
2. `species`/`stage`/`topics` 只是检索提示，不会排除证据；不要因为提示没命中就断言没有。
3. 检索不到时说「知识库未覆盖」，不要用常识补；最终回答的数值/结论带 `[K#]`。
4. 表格数值要区分膳食口径（% DM）和血清口径（mg/dl、mmol/l），引用到表格。

---

## 7. 检索行为

### 7.1 查询扩展与焦点

新建 `backend/src/application/knowledge-base/query-expansion.ts`：

```text
expandQuery(query: string): string[]
extractQueryFocus(query: string): {
  topicPhrases: string[];   // 可做相关性门禁的高风险短语
  stagePhrases: string[];   // 只做召回扩展，不做门禁
  focusTerms: string[];     // 内容词减背景词
  backgroundTerms: string[];// 只排序，不门禁
}
```

规则：

- 中文术语 → 英文：血磷/磷→phosphorus，蛋白→protein，钠→sodium，钾→potassium，氯→chloride，镁→magnesium，碘→iodine，钙→calcium，鱼油/Omega-3→omega-3，蛋白尿/UPC→proteinuria/upc，血压/高血压→blood pressure/hypertension，分期→staging，肾病→chronic kidney disease/ckd，处方粮→therapeutic diet，磷结合剂→phosphate binder，3期/三期→stage 3。
- **单字也要扫**：`磷→phosphorus`、`钠→sodium`、`钾→potassium`、`氯→chloride`、`镁→magnesium`、`碘→iodine`、`钙→calcium`。不能只靠 2 字切片，否则 `犬 CKD 钠 上限` 展开不出 sodium。
- 匹配时长词优先（蛋白尿先于蛋白，血磷先于磷，慢性肾病先于肾病）。
- 英文同义：phosphate↔phosphorus，UPC↔proteinuria，BP↔blood pressure，CKD↔chronic kidney disease，omega-3↔omega 3。
- `backgroundTerms` 包括：ckd、chronic、kidney、disease、dog、dogs、canine、cat、cats、feline、stage、target、range、requirement、recommendation、level、table、value、patient、management、treatment、diet、dietary、supplementation、substaging。其余内容词都是 `focusTerms`。
- `topicPhrases` 只放高风险短语：`vitamin k`、`vitamin d`、`fish oil`、`omega-3`、`omega 3`；**在 query 里出现才返回**（不是去语料里找）。`blood pressure` 不做短语门禁，用 `blood/pressure` 焦点词 + `BP` 扩展 + 标题加成，避免只写 `BP` 的段落被排除。
- `stagePhrases`：`stage 1–4`、`1–4 期`；只扩召回，不做门禁。
- 这是「检索工程」，不是临床判断；词表可评审、可增补。

### 7.2 候选、门禁、排序

- **候选（宽召回）**：`source_paragraph` 按扩展词 OR 查询，**同时匹配段落正文和节标题**（避免只有标题写 `blood pressure`、正文只写 `BP` 的段落漏召回）；CKD 857 段全部进入候选，不按 ID 截断；`take` 上限 20,000 仅作全库保护（补剂查全库时用得上）。
- **门禁（相关性，不做分期排除）**：对每条候选，用 `节标题 + 段落正文` 做校验。**优先级**：
  1. 若 `topicPhrases` 非空：**必须**命中任一 `topicPhrases`（`vitamin k` 不能因为命中 `vitamin` 就算过）；
  2. 否则，命中任一 `focusTerms` **或**任一 `stagePhrases`；
  3. 若三组都为空（只问 `CKD dog` 这类泛问题）：不做门禁，退回背景词召回。
  这样：
  - `s005` 的 6 段 Stage 3 原文靠 `stage 3` 通过（它们不含 phosphate/phosphorus）；
  - `S-s017` 靠 `phosphorus` 通过；
  - `CKD dog biotin requirement` 没有 topic/stage，焦点 `biotin` 0 命中 → 空 → `no_match`；
  - `CKD dog vitamin K target` 靠 `vitamin k` 短语门禁；不会因为 `vitamin` 命中 `vitamin D` 就算过。
- **不做 SQL 焦点 AND**：先宽召回，再在应用层用 `节标题 + 正文` 做上述门禁。避免「焦点词只在标题里、正文没有」被 SQL 排掉。
- **排序**：词频/稀有词打分保留；新增：
  - 节标题/子标题命中 ×1.3；
  - 表格 caption 命中 ×1.2；
  - `species` 提示：匹配或 both ×1.15，相反 ×0.85；
  - `stage` 提示：`stagePhrases` 或命中段正文出现该期 ×1.25；明确其他期 ×0.95（只降权，不排除）；
  - `topics` 提示：命中 ×1.15，未命中不惩罚。
- **结构性软加权（不是硬过滤）**：查询含 `staging/substaging/分期/亚分期` 且 `sectionType==="staging"` 或 `documentType==="staging_guideline"` ×1.25；查询含 stage 短语且 `sectionType==="treatment"` ×1.15。用来补回去掉旧 `×3` 后的路由能力，但只影响排序。
- 删除 `×3`、`×1.05`、`×1.03` 这类针对 CKD 题集手调的系数。
- 去重（在 `searchSections` 分组时做）：同一节最多 2 段；**同一文档最多 2 节**；跨查询不缓存结果。

### 7.3 章节分组

`searchSections(query, options)`：

1. 调 `search` 取最多 200 段候选（避免单节段落太多把别的节挤掉）；
2. 按 `sectionId` 分组；
3. 每组取分数最高的 2 段；
4. 组分数 = 最高段分 + 标题/子标题命中加成；
5. 按组分数排序，**同一 documentId 最多保留 2 节**；
6. 取前 5 节。

### 7.4 显示标题与子标题

- 页眉型标题（`^\d{3}\s+Chronic Kidney Disease$`、`(文档开头)`）不再直接展示；`displayTitle` 用「来源名 · 第37章 · p{书内页}」。书内页从标题的前 3 位数字取（如 `781`），取不到再用 DB `pageNo`。
- `CASE 37-1 801 Chronic Kidney Disease` →「病例 37-1 · p801」。
- `(文档开头)` →「卷首 · p{pageNo}」。
- `subheading`：从**命中的段落文本**里取第一个形如 `Stage 3 Canine patients:`、`Step 2: Stage CKD`、`Table 37-9` 的行；没有则 `null`。
- `stage` 提示另从命中段正文里识别 `Stage 1–4`，所以即使子标题没取到，`s005` 的 Stage 3 段落也能被识别。
- 这一步不重切 PDF；只让 Agent 看到「这节里有一段讲 Stage 3」。

### 7.5 表格

- `SourceLayerService.searchTableViews(query, {documentIds, sourceIds, limit})`：取指定文档/来源的表（CKD 23 张），用 `extractQueryFocus` 的门禁（topic 短语优先，其次 focus 词/分期；不做分期排除）匹配 `caption + 行文本`；返回 ≤3 张，带 `tableId/caption/pageNo/rowCount/documentId/sourceId`。
- `SourceLayerService.openTable(tableId)`：返回列、行、页码、来源、文档标题；`pageNo` 允许为 null（核心表里 5 张暂时没有页码，v2 补导入）。
- 表格命中是**文档级**，不是节级；因为 `source_table` 没有 `section_id`，v2 再补。
- 核心 5 组表优先：37-1（T0253）、37-9（T0497）、37-11/12（T0260/T0261）、AAHA 表 8（T0025/T0026）。

### 7.6 空结果与错误

| 情况 | 返回 |
|---|---|
| 查询为空 | `ok:false`，`INVALID_ARGUMENT` |
| 候选为空，或门禁后为空 | `status:"no_match"`，`hints:["换同义词","用 knowledge_scope 看馆藏"]` |
| 主题/来源/文档非法 | `ok:false`，列出合法值 |
| 配方工具传非 CKD documentId | `ok:false`，说明配方本阶段只开放 CKD |
| 配方工具 open 非 CKD section/table | `ok:false`，说明本阶段只开放 CKD |
| 显式 `documentIds`/`sectionIds` 过滤后为空 | `status:"no_match"`，说明是显式范围导致 |

---

## 8. 验收标准（阶段出口）

| 指标 | 目标 |
|---|---|
| 26 题整体节命中（前 3 节含预期节） | ≥21/26（80%）；基线在 Phase 0 先跑，必要时加软 sectionType 加权，不降门槛 |
| Stage 3 | 1/1，且 `s005` 不被排除 |
| 表格题 | 2/2，能从表 37-9/37-11/37-1 取到值 |
| 中文题 | ≥5/6 |
| 负样本 | 4/4 返回 `no_match`/「未覆盖」 |
| 对抗样本（分期/口径/同义词/物种） | 4/4 |
| 5 组核心表可打开 | 5/5（允许 `pageNo=null`） |
| 引用有效率 | 100%（5 个场景 + 表格 K 号恢复） |
| 无引用临床结论 | 0 |
| 检索 p95 | <300ms（CKD 857 段） |
| 单次工具返回 | <1s |
| 补剂 Agent 知识可用 | 是（生产冒烟） |
| 回归 | 26 题结果记录，改动前后对比；关键项不下降 |

---

## 9. 风险与边界

| 风险 | 处理 |
|---|---|
| 分期短语扩召回后，Stage 2 查询可能混入 Stage 4 | 用 stage 提示排序；26 题对抗样本验证；不藏证据优先于绝对不混 |
| 中文扩展词表不全 | 先覆盖 CKD 高频 20–30 词；查不到返回 `no_match`；单字术语必须覆盖 |
| 章节标题仍是页眉 | `displayTitle` 降级 + `subheading`；重切留给 v2 |
| 表格无 `section_id`、5 张核心表页码为空 | 先文档级返回；`open` 允许 `pageNo=null`；v2 补导入 |
| 补剂 Agent 改异步接口 | 全链路 `await`；保留真实语料回归；先双轨，后切默认 |
| 全库补剂仍可能被 20,000 段截断 | 只对补剂链路记录命中数/p95；常见查询复核；v2 用相关性排序/索引 |
| 软排序仍可能排偏 | 可接受；证据不消失；26 题和日志持续观察 |
| 全库章节编目未开放 | 配方本阶段只 CKD；补剂走全库关键词检索；全库章节编目/表格扩展留给 v2 |

---

## 10. 后续（v2+，不在本阶段）

1. 按标题层级重切 SACN5/IRIS 章节（含 Stage 3 独立成节）；
2. `tsvector` 全文索引 + 中文分词/词典；
3. 轻量覆盖清单（文档/节/表，不做 7×N 矩阵）；
4. 文档级版本/取代状态；
5. 表格 `section_id` 关联、单元格引用、补核心表页码；
6. 原文接口鉴权；
7. 全库章节编目按病种分批扩，每批过同一套 26 题 + 抽检；
8. 可选：表格单元格查询 `kb_lookup`。

---

## 附录 A：26 题回归集（走 Agent 工具层）

> 节 ID 缩写：`S`=`sacn5-chapters-SACN5-37`，`I`=`iris-IRIS-DOG-Treatment-Recommendations-may-2026`，`G`=`iris-IRIS-staging-guidelines-2026`，`P`=`iris-IRIS-Pocket-Guide-to-CKD-June-2026-cn6g`，`A`=`aaha-AAHA-2021-Nutrition-and-Weight-Management-Guidelines`。
> `提示` 列是评估时传给工具的参数；不传时由工具自己从 query 推断 species/stage，topics 不自动推断。

| # | id | 查询 | 期望节 | 提示 | 类型 |
|---|---|---|---|---|---|
| 1 | dietary-phosphorus | CKD dog dietary phosphorus 0.2 0.5 % DM | S-s014, S-s017, S-s021 | topics:phosphorus | 数值 |
| 2 | protein | CKD dog protein 14 20 % DM | S-s014, S-s015, S-s017 | topics:protein | 数值 |
| 3 | sodium | CKD dog sodium 0.3 % DM | S-s017, S-s018 | topics:sodium | 数值 |
| 4 | potassium | CKD dog potassium 0.4 0.8 % DM | S-s014, S-s018, S-s021 | topics:potassium | 数值 |
| 5 | chloride | CKD dog chloride requirement | S-s014, S-s018 | topics:chloride | 数值 |
| 6 | omega3 | CKD dog omega-3 supplementation | S-s014, S-s019, S-s021 | topics:omega3 | 数值 |
| 7 | staging | CKD dog staging creatinine SDMA | G-s002, G-s003 | topics:staging | 分期 |
| 8 | upc | CKD dog UPC proteinuria substaging | G-s004 | topics:proteinuria | 分期 |
| 9 | bp | CKD dog blood pressure substaging | G-s006 | topics:bloodpressure | 分期 |
| 10 | stage3 | stage 3 canine patients phosphate target | I-s005 | stage:3 | 分期 |
| 11 | zh-stage3 | 犬 CKD 3期 血磷 目标 | I-s005 | stage:3 | 中文 |
| 12 | zh-dietary | 犬慢性肾病 膳食磷 范围 | S-s014, S-s017 | topics:phosphorus | 中文 |
| 13 | zh-protein | 犬 CKD 蛋白 推荐范围 | S-s015, S-s014 | topics:protein | 中文 |
| 14 | zh-upc | 犬 CKD 蛋白尿 UPC 怎么分期 | G-s004 | topics:proteinuria | 中文 |
| 15 | zh-bp | 犬 CKD 血压 怎么分期 | G-s006 | topics:bloodpressure | 中文 |
| 16 | zh-sodium | 犬 CKD 钠 上限 | S-s018, S-s017 | topics:sodium | 中文 |
| 17 | no-vitamin-k | CKD dog vitamin K target | 无 | 无 | 负样本 |
| 18 | no-biotin | CKD dog biotin requirement | 无 | 无 | 负样本 |
| 19 | no-manganese | CKD dog manganese requirement | 无 | 无 | 负样本 |
| 20 | no-chromium | CKD dog chromium requirement | 无 | 无 | 负样本 |
| 21 | stage2-vs4 | CKD dog stage 2 serum phosphate target | I-s004, I-s005；禁止 I-s006 | stage:2, topics:phosphorus | 对抗 |
| 22 | dietary-vs-serum | CKD dog serum phosphate target stage 3 | I-s005 | stage:3 | 对抗 |
| 23 | dog-protein-hint | CKD dog protein requirement | S-s015, S-s014 | species:dog, topics:protein | 对抗 |
| 24 | synonym | CKD dog dietary phosphate target | S-s014, S-s017 | topics:phosphorus | 对抗 |
| 25 | table-37-9 | CKD dog key nutritional factors phosphorus protein | 表 T0497/T0260/T0261 任一 | topics:phosphorus | 表格 |
| 26 | table-37-1 | IRIS staging creatinine SDMA table | 表 T0253 | topics:staging | 表格 |

**判分**：

- 节题：前 3 节中至少 1 个期望节 → 通过；有 `forbiddenSections` 时，前 3 节出现禁止节 → 不通过。Q21 的禁止项用于检查排序，不用于排除；若 `I-s006` 因 phosphate 进前 3，先加强 stage/treatment 软排序；仍不行就把禁止项降为诊断指标并记录，不改变「不硬过滤」原则。
- 负样本：`status === "no_match"` 或返回 0 节 → 通过。
- 表格题：`tables` 中包含期望 `tableId`，且 `open_knowledge` 能打开 → 通过。
- 中文题与英文题同一判分；单字术语（磷/钠/钾/氯/镁/碘/钙）必须能展开。
