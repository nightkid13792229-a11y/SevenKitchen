# 知识库最小图书馆版（v1.1）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把知识库从「带硬过滤的段落检索」改成「可分节浏览、可打开、可引用表格的图书馆」，让配方 Agent 和补剂 Agent 共用同一套原文检索，并用 26 题（走 Agent 工具层）证明没有改坏。

**Architecture:** 保留现有原文层（`source_document/section/paragraph/table`），不新建单元表；检索用 `KnowledgeLibraryService`（查询扩展/焦点/节级分组/软排序），打开与馆藏复用现有 `SourceLayerService`（开节/开表/scope/表格视图）；Agent 侧新增 `open_knowledge`/`knowledge_scope`；补剂 Agent 从 `chunks.jsonl` 切到同一个 `KnowledgeLibraryService`。分期短语只做召回扩展，不做门禁。

**Tech Stack:** NestJS + TypeScript + Prisma/PostgreSQL（已有 `pg_trgm` 索引）+ Jest + ts-node 脚本。

**Spec:** `docs/knowledge-base/2026-11-09-kb-minimal-library-design.md`

## Global Constraints

- **只在工位改代码**：先 `cd /Users/zhaochen/Documents/SevenKitchen && bash scripts/session.sh start "知识库最小图书馆版" --slug kb-minimal-library`；进入打印的 worktree；主工作区只读，不提交、不 `git add`。
- **提交只在工位**：每个 Task 结束，先 `git add` **本任务 Files 列出的路径**，再 `bash scripts/session.sh commit -m "<message>"`。不要 `cd` 回主工作区提交；不要 `--all`；不要 `git add -A`。
- **只改 `backend/` 和 `docs/`**：不碰 `miniapp/`、`admin-web/`。
- **数据库只经 Prisma/迁移**：本计划不新增表；如果实现中发现需要迁移，先停，回到 spec 讨论。
- **不硬过滤**：`species`/`stage`/`topics` 只影响排序或召回扩展；不得出现「分期不满足就排除」的代码路径。
- **焦点门禁**：`topicPhrases` 非空时**必须**命中 topicPhrase；否则 `focusTerms OR stagePhrases`；三组都空才不做门禁。`focusTerms` = 内容词减背景词，不允许白名单回退到 `ckd/dog`。
- **范围分层**：配方工具移除 `scope=all`，只开放 `CKD_DOCUMENT_IDS` 的 5 份；补剂适配器可查全库，但只做关键词检索，不做章节编目/表格扩展。
- **不做临床判断**：不建疾病—营养素规则表，不把结论注入配方 Agent，不改评估标准。
- **工具名**：保留 `search_knowledge_library`；新增 `open_knowledge`、`knowledge_scope`。
- **引用**：返回的每段/每张表都要有 `citationId`；打开节/表必须登记 K 号。
- **返回预算**：≤5 节、每节 ≤2 段、同一文档 ≤2 节、≤3 张表；单次结果约 1.5–2k token。
- **测试**：`cd backend && npm test -- <path>`；类型检查 `npx tsc --noEmit`；联调期间不要跑 `npm run build`（会删 `dist`，弄死本机后端）。
- **中文词表放代码里**：不读 `docs/knowledge-base/tools/glossary-zh-en.json` 这类仓库路径；词表放 `backend/src/application/knowledge-base/`。
- **评估走工具层**：26 题用 `executeTool('search_knowledge_library', ...)`，不直接调裸服务。
- **测试不许只有注释**：每个新增 `it` 至少一个 `expect`；TDD 的「先失败」必须能看到真实断言失败，不接受空壳测试。
- **merge 在工位里执行**：`bash scripts/session.sh merge` 必须在 worktree 根目录跑，不能在主工作区。

## Review Focus

1. **Stage 3 的 6 段原文不含 phosphate/phosphorus**：`stage 3` 必须作为召回扩展通过门禁，而不是被焦点营养词排除；同时不得按分期排除其他段落。
2. **未知营养素负样本**（biotin/manganese/chromium）：焦点词必须来自「内容词减背景词」，0 命中返回 `no_match`，不能回退到 `ckd/dog` 背景词。
3. **中文单字术语**（磷/钠/钾/氯/镁/碘/钙）：`expandQuery` 必须直接扫原始字符串，不能只靠 2 字切片。
4. **现有测试会被改坏**：`agent-tools-library.spec.ts`（9 处上下文 + 3 条断言）和 `knowledge-search.service.spec.ts`（已存在、同步接口、真实语料）必须改写，不能当新文件。
5. **表格 K 号恢复**：`CitationRecord` 不能依赖必填 `passageId`；表格要有 `recordId`，会话恢复后仍能审计。
6. **范围**：配方侧 `knowledge_scope`/`open_knowledge` 不得暴露 CKD 之外的馆藏。

---

## Phase 0：基线（不提交代码，除文档外）

- [ ] **Step 1: 开工位**

Run:
```bash
cd /Users/zhaochen/Documents/SevenKitchen
bash scripts/session.sh start "知识库最小图书馆版" --slug kb-minimal-library
```
Expected: 打印 worktree 路径（应为 `.worktrees/20261109-kb-minimal-library`）、分支 `task/20261109-kb-minimal-library`、端口。后续命令都在该 worktree 下执行。

- [ ] **Step 2: 把三份文档复制进工位并提交**

工位从 `origin/main` 切出，主工作区未提交的文档不会自动带过去。进入工位后：

```bash
mkdir -p docs/superpowers/plans
cp /Users/zhaochen/Documents/SevenKitchen/docs/knowledge-base/2026-11-09-kb-minimal-library-design.md docs/knowledge-base/
cp /Users/zhaochen/Documents/SevenKitchen/docs/knowledge-base/2026-11-09-knowledge-base-agent-service-review.md docs/knowledge-base/
cp /Users/zhaochen/Documents/SevenKitchen/docs/superpowers/plans/2026-11-09-kb-minimal-library.md docs/superpowers/plans/
git add docs/knowledge-base/2026-11-09-kb-minimal-library-design.md docs/knowledge-base/2026-11-09-knowledge-base-agent-service-review.md docs/superpowers/plans/2026-11-09-kb-minimal-library.md
bash scripts/session.sh commit -m "docs(knowledge): 加入最小图书馆设计与实施计划"
```

Expected: 三份文档进入工位分支；后续 Spec 路径可读。

- [ ] **Step 3: 记录现有测试基线和关键查询**

在 worktree 的 `backend/` 下运行：
```bash
npm test -- tests/application/knowledge-base tests/application/recipe-designer/agent-tools-library.spec.ts tests/application/recipe-designer/citation-registry.spec.ts tests/application/knowledge/knowledge-search.service.spec.ts
```
Expected: 现有测试全绿（若 `knowledge-search.service.spec.ts` 因语料缺失跳过，记录「skipped」）。

用现有 `KnowledgeLibraryService` 写一次性脚本（放 `/tmp`，不提交），记录 4 条：
- `stage 3 canine patients phosphate target`；
- `犬 CKD 3期 血磷 目标`；
- `CKD dog key nutritional factors phosphorus protein`（表格）；
- `CKD dog vitamin K target` / `CKD dog biotin requirement`（负样本）。

再把 spec 附录 A 的 26 题按当前服务跑**两遍**（脚本放 `/tmp`，不提交）：先不带 `species/stage/topics`（近似 v1.1 宽召回），再带附录 A 提示；记录两遍前 3 节/表格。重点看 Q8/Q9/Q14/Q15/Q21/Q23：
- 如果 UPC/BP 题 `G-s004/G-s006` 进不了前 3，Task 1 必须启用「staging 文档/节类型 ×1.25」软加权；
- 如果 Q21 `I-s004/I-s005` 进不了前 3，Task 1 必须启用「stage 短语 + treatment ×1.15」；
- 如果 Q23 仍不可达，按 Task 6 的说明调整该题期望并记录理由，不降整体门槛。

把结果贴到执行记录，作为 Task 6 的对照基线。

- [ ] **Step 4: 确认工作区干净**

Run: `git status --short`
Expected: 只剩工位自身文档提交；没有主工作区改动。

---

## 工作量估算（供排期，不含内容审阅）

| Task | 内容 | 人日 |
|---|---|---:|
| 1 | 查询扩展/焦点/显示标题/节级分组/软排序 | 3–4 |
| 2 | `SourceLayerService` 开节/开表/馆藏/表格视图 | 1.5–2 |
| 3 | Agent 工具 + 表格引用 + 范围校验 + 现有测试改写 | 2.5–3 |
| 4 | 空结果/参数校验/移除全库选项 | 1 |
| 5 | 补剂 Agent 统一检索 + 现有 spec 改写 | 1–1.5 |
| 6 | 26 题工具层回归 + 用量报告 | 2–3 |
| 7 | 文档 + 引用冒烟 + 合并/部署检查 | 1 |
| **合计** |  | **12–16** |

> 只做止血子集（Task 1 + 4 + Task 2/3 的开表最小版）可压到 **7–9 人日**；26 题校准和补剂迁移放下一批。

---

### Task 1: 查询扩展、焦点、显示标题、节级分组

**Files:**
- Create: `backend/src/application/knowledge-base/query-expansion.ts`
- Create: `backend/src/application/knowledge-base/section-display.ts`
- Create: `backend/src/domain/knowledge/topic-aliases.ts`
- Modify: `backend/src/application/knowledge-base/knowledge-library.service.ts`
- Modify: `backend/src/application/knowledge-base/section-catalog.service.ts`（引用共享词表）
- Test: `backend/tests/application/knowledge-base/knowledge-library.service.spec.ts`

**Interfaces:**
- Produces: `expandQuery(query: string): string[]`
- Produces: `extractQueryFocus(query: string): { topicPhrases: string[]; stagePhrases: string[]; focusTerms: string[]; backgroundTerms: string[] }`
- Produces: `TOPIC_ALIASES: Record<string, string[]>`, `TOPIC_KEYS: string[]`, `normalizeTopic(value: string): string | null`
- Produces: `deriveDisplayTitle(input: { title: string; sourceName: string | null; pageNo: number | null }): string`
- Produces: `extractSubheading(text: string): string | null`
- Produces: `detectStageHints(text: string): number[]`
- Produces: `searchSections(query: string, options?: LibrarySearchOptions): Promise<SectionHit[]>`
- Produces: `SectionHit`（字段见 spec 6.3）
- Consumes: 现有 `LibraryPassage`、`PrismaService`

- [ ] **Step 1: 写失败测试**

在 `knowledge-library.service.spec.ts` 顶部把 `filterRow` 提到模块级（现在它在 `describe` 内部，新增用例会 `ReferenceError`），然后增加：

```ts
it('中文单字术语也能展开', () => {
  expect(expandQuery('犬 CKD 钠 上限')).toEqual(expect.arrayContaining(['sodium']));
  expect(expandQuery('犬 CKD 3期 血磷 目标')).toEqual(expect.arrayContaining(['phosphorus', 'stage 3']));
});

it('焦点 = 内容词减背景词；未知营养素不会回退', () => {
  const neg = extractQueryFocus('CKD dog biotin requirement');
  expect(neg.focusTerms).toContain('biotin');
  expect(neg.focusTerms).not.toContain('ckd');
  expect(extractQueryFocus('CKD dog vitamin K target').topicPhrases).toContain('vitamin k');
  expect(extractQueryFocus('CKD dog stage 3 phosphate target').stagePhrases).toContain('stage 3');
});

it('分期短语通过门禁，但不排除其他分期', async () => {
  const rows = [
    filterRow({ id: 's005-3', sectionId: 's005', text: 'Stage 3 Canine patients: target <1.6 mmol/l.' }),
    filterRow({ id: 's017-p', sectionId: 's017', text: 'Dietary phosphorus 0.2 to 0.5% in foods for dogs.' }),
  ];
  const service = new KnowledgeLibraryService({ sourceParagraph: { findMany: jest.fn().mockResolvedValue(rows) } } as any);
  const result = await service.search('stage 3 canine patients phosphate target', { stage: 3, limit: 10 });
  expect(result.map((item) => item.id)).toEqual(expect.arrayContaining(['s005-3', 's017-p']));
});

it('负样本：topic 短语必须命中，vitamin D 不算 vitamin K', async () => {
  const rows = [filterRow({ id: 'vd', text: 'Vitamin D supplementation in CKD.' })];
  const service = new KnowledgeLibraryService({ sourceParagraph: { findMany: jest.fn().mockResolvedValue(rows) } } as any);
  await expect(service.search('CKD dog vitamin K target')).resolves.toEqual([]);
});

it('正样本：vitamin D 短语能命中', async () => {
  const rows = [filterRow({ id: 'vd', text: 'Vitamin D supplementation in CKD.' })];
  const service = new KnowledgeLibraryService({ sourceParagraph: { findMany: jest.fn().mockResolvedValue(rows) } } as any);
  await expect(service.search('CKD dog vitamin D target')).resolves.toHaveLength(1);
});

it('负样本：未知营养素 0 命中返回空', async () => {
  const rows = [filterRow({ id: 'protein', text: 'Minimum protein requirements for CKD.' })];
  const service = new KnowledgeLibraryService({ sourceParagraph: { findMany: jest.fn().mockResolvedValue(rows) } } as any);
  await expect(service.search('CKD dog biotin requirement')).resolves.toEqual([]);
});

it('不再按 1000 段截断候选', async () => {
  const findMany = jest.fn().mockResolvedValue([]);
  const service = new KnowledgeLibraryService({ sourceParagraph: { findMany } } as any);
  await service.search('phosphorus');
  expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 20000 }));
});

it('按节分组：≤5 节、每节 ≤2 段、同一文档 ≤2 节', async () => {
  const rows = [
    ...Array.from({ length: 3 }, (_, i) => filterRow({ id: `s1-${i}`, sectionId: 's1', text: 'phosphorus target' })),
    ...Array.from({ length: 3 }, (_, i) => filterRow({ id: `s2-${i}`, sectionId: 's2', text: 'phosphorus target' })),
    ...Array.from({ length: 3 }, (_, i) => filterRow({ id: `s3-${i}`, sectionId: 's3', text: 'phosphorus target' })),
    filterRow({ id: 'i1', sectionId: 'i1', documentId: 'iris-doc', text: 'phosphorus target' }),
  ];
  const service = new KnowledgeLibraryService({ sourceParagraph: { findMany: jest.fn().mockResolvedValue(rows) } } as any);
  const sections = await service.searchSections('phosphorus', { limit: 5 });
  expect(sections.length).toBeLessThanOrEqual(5);
  for (const section of sections) expect(section.passages.length).toBeLessThanOrEqual(2);
  expect(sections.filter((section) => section.documentId === 'sacn5-chapters-SACN5-37')).toHaveLength(2);
});

it('页眉标题降级，书内页从标题取', () => {
  expect(deriveDisplayTitle({ title: '787 Chronic Kidney Disease', sourceName: '小动物临床营养学（第5版）', pageNo: 17 }))
    .toContain('p787');
  expect(deriveDisplayTitle({ title: '(文档开头)', sourceName: 'SACN5', pageNo: 1 })).toContain('卷首');
});
```

旧用例改写：
- 「按物种 + 分期 + 主题收窄到犬 Stage 2 磷段落」改为「不排除其他期，Stage 2 排前」，断言 p1/p2/p3 都返回。
- 删除/改写断言 `take: 1000`、`filterBoost`、`isExactFilterMatch` 的行为。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npm test -- tests/application/knowledge-base/knowledge-library.service.spec.ts`
Expected: FAIL，`expandQuery`/`extractQueryFocus`/`searchSections`/`deriveDisplayTitle` 未定义、`take` 仍是 1000、硬过滤仍返回 1 条。

- [ ] **Step 3: 实现查询扩展/焦点/显示标题**

`query-expansion.ts`：
- `expandQuery`：中英术语、单字术语、长词优先、同义扩展；返回去重词表，扩展词排前。
- `extractQueryFocus`：
  - `backgroundTerms` = ckd/chronic/kidney/disease/dog/canine/cat/feline/stage/target/range/requirement/recommendation/level/table/value/patient/management/treatment/diet/dietary/supplementation/substaging。
  - `focusTerms` = 扩展后的词减背景词（保留长度 ≥2 的词）。
  - `topicPhrases` = `vitamin k`、`vitamin d`、`fish oil`、`omega-3`、`omega 3`（在 query 里出现才返回）。
  - `stagePhrases` = `stage 1–4`、`1–4 期`。
- `normalizeTopic`：中文/别名 → 受控 key；未知返回 null。

`topic-aliases.ts`：合并 `section-catalog.service.ts` 和 `knowledge-library.service.ts` 的两份 `TOPIC_ALIASES`，导出 `TOPIC_KEYS`/`normalizeTopic`。

`section-display.ts`：
- `deriveDisplayTitle`：`^\d{3}\s+Chronic Kidney Disease$` → `${sourceName} · 第37章 · p{前3位数字}`；`^CASE\s+([\d-]+)\s+(\d{3})\b` → `病例 ${1} · p${2}`；`(文档开头)` → `卷首 · p${pageNo}`；其他原样。
- `extractSubheading`：匹配 `^(Stage \d|Step \d|Table \d|Figure \d|[A-Z][A-Za-z ]{3,40}:)`，返回第一行。
- `detectStageHints`：识别 `stage 1–4` / `1–4 期`。

- [ ] **Step 4: 改 `search` 与新增 `searchSections`**

`knowledge-library.service.ts`：
- `queryTerms` 用 `expandQuery`，去重，最多 16 个；
- SQL 宽召回：`take: 20000`，保留 `orderBy id asc`；**候选 OR 同时匹配段落正文和节标题**（`section.title contains`），避免只写 `BP` 的段落漏召回；**不在 SQL 里做焦点 AND**；
- 删除 `catalogSectionIds`、`routedSectionIds`、`filteredRows` 的硬过滤；
- 删除 `filterBoost`、`isExactFilterMatch`、`SACN5 ×1.05`、`IRIS ×1.03`；
- 对每条候选用 `section.title + text` 算门禁，**优先级**：
  1. `topicPhrases` 非空 → **必须**命中一个 topicPhrase（vitamin k 不能靠 vitamin 过）；
  2. 否则 → `focusTerms OR stagePhrases` 任一；
  3. 三组都为空 → 不做门禁，退回背景词召回；
- `score` 加软提示：标题/子标题 ×1.3、表格 caption ×1.2、物种匹配 ×1.15/相反 ×0.85、主题命中 ×1.15；查询含 `staging/substaging/分期/亚分期` 且 `meta.sectionType==="staging"` 或 `meta.documentType==="staging_guideline"` → ×1.25（软加权，不排除）；查询含 stage 短语且 `meta.sectionType==="treatment"` → ×1.15；分期提示**先看命中段正文/子标题**（`detectStageHints`），命中目标期 ×1.25；正文没提分期时才看 `meta.stages`，明确其他期 ×0.95（只降权，不排除）；
- `searchSections`：调 `search` 取最多 200 段 → 按 sectionId 分组 → 每组最多 2 段 → 组分数排序 → **同一 documentId 最多 2 节** → 取 5 节；
- `SectionHit` 加 `displayTitle`/`subheading`，用 `section-display.ts`；
- `MAX_LIMIT` 内部改成 200；工具层仍限制 10。

- [ ] **Step 5: 跑单测**

Run:
```bash
cd backend
npm test -- tests/application/knowledge-base/knowledge-library.service.spec.ts
npx tsc --noEmit
```
Expected: PASS。

- [ ] **Step 6: Task 1 后的 26 题硬门禁（Task 2 前必须过）**

用 Phase 0 的 `/tmp` 26 题脚本，切到新 `KnowledgeLibraryService` 再跑一遍（先不带提示，再带附录 A 提示）。硬门禁：
- Q8 `upc` 前 3 含 `G-s004`；
- Q9 `bp` 前 3 含 `G-s006`；
- Q14 `zh-upc` 前 3 含 `G-s004`；
- Q15 `zh-bp` 前 3 含 `G-s006`；
- Q21 `stage2-vs4` 前 3 含 `I-s004` 或 `I-s005`；
- Q10 `stage3`、Q11 `zh-stage3` 前 3 含 `I-s005`。

未过就先调 Task 1 的 `staging ×1.25` / `stage+treatment ×1.15` 软加权，再复跑；**不要进入 Task 2，也不要改期望来绕门禁**。把这 6 组结果贴进执行记录。

- [ ] **Step 7: 提交**

提交（在工位根目录）：
```bash
git add backend/src/application/knowledge-base/query-expansion.ts \
        backend/src/application/knowledge-base/section-display.ts \
        backend/src/domain/knowledge/topic-aliases.ts \
        backend/src/application/knowledge-base/knowledge-library.service.ts \
        backend/src/application/knowledge-base/section-catalog.service.ts \
        backend/tests/application/knowledge-base/knowledge-library.service.spec.ts
bash scripts/session.sh commit -m "feat(knowledge): 查询扩展/焦点门禁/节级分组与显示标题"
```

---

### Task 2: `SourceLayerService` 开节/开表/馆藏/表格视图

**Files:**
- Modify: `backend/src/application/knowledge-base/source-layer.service.ts`
- Test: `backend/tests/application/knowledge-base/source-layer.service.spec.ts`（现有；补充用例）
- 不改 `app.module.ts`（`SourceLayerService` 已注册）

**Interfaces:**
- Produces: `openSection(sectionId: string, options?: { paragraphOffset?: number; paragraphLimit?: number; anchorParagraphId?: string }): Promise<SectionView | null>`
- Produces: `openTable(tableId: string): Promise<TableView | null>`
- Produces: `scope(options?: { sourceId?: string; documentIds?: string[] }): Promise<ScopeView>`
- Produces: `searchTableViews(query: string, options?: { documentIds?: string[]; sourceIds?: string[]; limit?: number }): Promise<TableView[]>`
- Produces: `SectionView`/`TableView`/`ScopeView`（字段见 spec 6.4/6.5）
- Consumes: `deriveDisplayTitle`（Task 1）、现有 `PrismaService`

- [ ] **Step 1: 写失败测试**

在 `source-layer.service.spec.ts` 增加（真实断言，不是注释）：

```ts
it('打开节：≤12 段、nextOffset、显示标题、相邻节', async () => {
  // mock sourceSection.findUnique 返回 title='787 Chronic Kidney Disease'、pageNo=17、20 段
  const view = await service.openSection('s1');
  expect(view?.paragraphs).toHaveLength(12);
  expect(view?.nextOffset).toBe(12);
  expect(view?.displayTitle).toContain('第37章');
});

it('打开节：anchorParagraphId 让被引用段出现在第一页', async () => {
  const view = await service.openSection('s1', { anchorParagraphId: 'p15' });
  expect(view?.paragraphs[0].id).toBe('p13');
});

it('打开表：返回列/行/页码/文档标题', async () => {
  const table = await service.openTable('T0497');
  expect(table?.rowCount).toBe(10);
  expect(table?.pageNo).toBe(17);
  expect(table?.caption).toContain('37-9');
});

it('馆藏：传 CKD 5 份 documentIds 返回 5 份，按来源可收窄', async () => {
  const result = await service.scope({ documentIds: CKD_DOCUMENT_IDS });
  expect(result.totals.documents).toBe(5);
});

it('表格视图：按行文本命中 T0497，焦点门禁排除 vitamin E 表', async () => {
  const hits = await service.searchTableViews('phosphorus', { documentIds: CKD_DOCUMENT_IDS });
  expect(hits.map((table) => table.tableId)).toContain('T0497');
  const vitaminK = await service.searchTableViews('CKD dog vitamin K target', { documentIds: CKD_DOCUMENT_IDS });
  expect(vitaminK.map((table) => table.tableId)).not.toContain('T0025');
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npm test -- tests/application/knowledge-base/source-layer.service.spec.ts`
Expected: FAIL，新方法不存在。

- [ ] **Step 3: 实现**

- `openSection`：`sourceSection.findUnique` + document + paragraphs（按 id 升序）；有 `anchorParagraphId` 时算序号，`paragraphOffset = max(0, index - 2)`；切最多 12 段；`tables` 取该文档表（页码在节范围优先，null 的也允许，最多 3 张）；前后节按 `documentId + sortOrder`。
- `openTable`：`sourceTable.findUnique` + document；返回 columns/rows/pageNo/documentTitle/sourceId/sourceName；`pageNo` 允许 null。
- `scope({ sourceId?, documentIds? })`：`sourceDocument.findMany` 的 `where` 用 Prisma 合法写法：有 `documentIds` 时 `{ id: { in: documentIds }, ...(sourceId ? { sourceId } : {}) }`；没有 `documentIds` 时 `sourceId ? { sourceId } : undefined`；`select` 带 `_count: { select: { sections: true, paragraphs: true, tables: true } }`；汇总 totals。默认由调用方传 CKD documentIds，服务本身不硬编码 CKD。
- `searchTableViews`：按 documentIds/sourceIds 取表（CKD 23 张），用 `extractQueryFocus` 的门禁（**topicPhrases 非空时必须命中 topicPhrases**；否则 focusTerms/stagePhrases）匹配 `caption + JSON.stringify(rows)`；返回 ≤3 张。
- 保留现有 `searchTables` 供 HTTP 接口使用；`searchTableViews` 是新方法，不改旧签名。

- [ ] **Step 4: 跑测试并提交**

Run:
```bash
cd backend
npm test -- tests/application/knowledge-base/source-layer.service.spec.ts
npx tsc --noEmit
```
Expected: PASS。

提交：
```bash
git add backend/src/application/knowledge-base/source-layer.service.ts \
        backend/tests/application/knowledge-base/source-layer.service.spec.ts
bash scripts/session.sh commit -m "feat(knowledge): SourceLayerService 支持开节/开表/馆藏/表格视图"
```

---

### Task 3: Agent 工具、表格引用、范围校验、现有测试改写

**Files:**
- Modify: `backend/src/application/recipe-designer/agent/tools.ts`
- Modify: `backend/src/application/recipe-designer/agent/recipe-agent.service.ts`
- Modify: `backend/src/application/recipe-designer/agent/citation-registry.ts`
- Modify: `backend/src/application/recipe-designer/agent/prompt.ts`
- Test: `backend/tests/application/recipe-designer/agent-tools-library.spec.ts`（现有；改写 9 处上下文 + 3 条断言）
- Test: `backend/tests/application/recipe-designer/citation-registry.spec.ts`（补充表格用例）

**Interfaces:**
- Changes: `ToolExecutionContext.sourceLayer: SourceLayerService`（替换原计划的新 `browser`）
- Changes: `CitationRecord` 增加 `recordId: string`、`kind: 'passage' | 'table'`、`tableId?: string`、`sectionId: string | null`；`passageId?: string`
- Produces: `CitationRegistry.registerTable(table: TableView): CitationRecord`
- Produces types: `CitedPassage = LibraryPassage & { citationId: string }`、`CitedSection = Omit<SectionHit,'passages'> & { passages: CitedPassage[] }`；表格用 `TableHitSummary`（含 `citationId`）
- Produces tools: `open_knowledge`、`knowledge_scope`
- Consumes: Task 1 `searchSections`、Task 2 `SourceLayerService`

- [ ] **Step 1: 写失败测试**

`citation-registry.spec.ts`：

```ts
it('表格也登记 K 号并参与审计', () => {
  const registry = new CitationRegistry();
  const record = registry.registerTable(tableFixture());
  expect(record.kind).toBe('table');
  expect(record.recordId).toBe('T0497');
  expect(registry.audit('磷 0.2–0.5% DM [K1]').validCitationCount).toBe(1);
});

it('表格 K 号会话恢复后仍有效', () => {
  const first = new CitationRegistry();
  const record = first.registerTable(tableFixture());
  const second = new CitationRegistry();
  second.restore(record);
  expect(second.audit('磷 0.2–0.5% DM [K1]').validCitationCount).toBe(1);
});
```

`agent-tools-library.spec.ts`：
- 新增/改写：
  - 工具清单含 `open_knowledge`、`knowledge_scope`，总数 10。
  - search 调 `library.searchSections` + `sourceLayer.searchTableViews`，返回 `sections`/`tables`，都有 K 号。
  - `open_knowledge` 打开表格返回内容 + K；打开发表返回段落 K。
  - `knowledge_scope` 只返回 CKD 5 份。
  - 非 CKD `documentId`/`tableId` 被拒绝。
- 改写现有 9 处 `executeTool` 上下文，补 `sourceLayer` mock；3 条 `library.search` 断言改为 `searchSections` 参数。

- [ ] **Step 2: 跑测试确认失败**

Run:
```bash
cd backend
npm test -- tests/application/recipe-designer/agent-tools-library.spec.ts tests/application/recipe-designer/citation-registry.spec.ts
```
Expected: FAIL，工具/方法不存在；旧上下文缺 `sourceLayer`。

- [ ] **Step 3: 实现**

`citation-registry.ts`：
- `recordId` 去重（段落 = passage.id，表格 = table.tableId）；`byPassageId` 改为 `byRecordId`；
- `register(passage)`：`kind:'passage'`、`recordId: passage.id`、`sectionId: passage.sectionId`；
- `registerTable(table)`：`kind:'table'`、`recordId: table.tableId`、`tableId`、`passageId: table.tableId`（兼容）、`sectionId: null`、`text = caption + "\n" + JSON.stringify(rows)` 截到 1,500 字；
- `restore`：兼容没有 `recordId` 的旧记录（用 `passageId`/`tableId` 兜底）；不再要求 `passageId` 必填。

`tools.ts`：
- `ToolExecutionContext` 加 `sourceLayer`；
- `AGENT_TOOLS` 加 `open_knowledge`/`knowledge_scope`（参数见 spec 6.4/6.5）；
- `search_knowledge_library`：解析 query/sourceIds/documentIds/sectionIds/species/stage/topics/limit；不接受 `scope`；`library.searchSections` + `sourceLayer.searchTableViews`；段落/表格分别登记 K；返回 `{status,query,sections,tables,count,hints?}`；摘要列前 3 节 `displayTitle（pXX）[K#]`；0 节写「知识库未覆盖」；
- `open_knowledge`：section/table/citation 三选一；`sourceLayer.openSection/openTable`；打开节的每段登记 K（`ParagraphHit` → `LibraryPassage` 映射：补 `sourceId/sourceName/documentTitle`，`score:0`，`truncated:false`）；表格登记 K；配方侧校验 documentId ∈ CKD；
- `knowledge_scope`：`sourceLayer.scope({ documentIds: CKD_DOCUMENT_IDS, sourceId })`；
- 更新工具描述：不再写「5–8 段」「不传 sourceIds 则全库」；写「返回节」「配方默认 CKD」。

`recipe-agent.service.ts`：
- 构造函数注入 `SourceLayerService`；`runTool`/`executeTool` 传 `sourceLayer`；
- `loadCitationRegistry`：`where.toolName in ['search_knowledge_library','open_knowledge']`；恢复 `sections[].passages[]`、`data.passages[]`、`data.section.paragraphs[]`、`data.table`、`data.tables[]`；表格摘要无全文时用 `sourceLayer.openTable(tableId)` 补 `text`；补 `sectionId`/`kind`/`recordId`。

`prompt.ts`：按 spec 6.7 四条约束更新。

- [ ] **Step 4: 跑测试并提交**

Run:
```bash
cd backend
npm test -- tests/application/recipe-designer/agent-tools-library.spec.ts tests/application/recipe-designer/citation-registry.spec.ts
npx tsc --noEmit
```
Expected: PASS。

提交：
```bash
git add backend/src/application/recipe-designer/agent/tools.ts \
        backend/src/application/recipe-designer/agent/recipe-agent.service.ts \
        backend/src/application/recipe-designer/agent/citation-registry.ts \
        backend/src/application/recipe-designer/agent/prompt.ts \
        backend/tests/application/recipe-designer/agent-tools-library.spec.ts \
        backend/tests/application/recipe-designer/citation-registry.spec.ts
bash scripts/session.sh commit -m "feat(knowledge): Agent 新增 open/scope 工具、表格引用与 CKD 范围校验"
```

---

### Task 4: 空结果语义、参数校验、移除全库选项

**Files:**
- Modify: `backend/src/application/recipe-designer/agent/tools.ts`
- Modify: `backend/src/application/knowledge-base/query-expansion.ts`（`normalizeTopics` 辅助）
- Test: `backend/tests/application/recipe-designer/agent-tools-library.spec.ts`

**Interfaces:**
- Produces: `normalizeTopics(values: unknown): { topics: string[]; invalid: string[] }`
- Produces: `status: 'ok' | 'no_match'`

- [ ] **Step 1: 写失败测试**

```ts
it('schema 不再暴露 scope=all', () => {
  const tool = AGENT_TOOLS.find((item) => item.function.name === 'search_knowledge_library');
  expect((tool!.function.parameters as any).properties.scope).toBeUndefined();
});

it('传 scope 时明确拒绝', async () => {
  const outcome = await executeTool('search_knowledge_library', { query: 'x', scope: 'all' }, ctx);
  expect(outcome.ok).toBe(false);
  expect(outcome.error?.message).toContain('scope');
});

it('未知主题报错并列合法值', async () => {
  const outcome = await executeTool('search_knowledge_library', { query: 'x', topics: ['foo'] }, ctx);
  expect(outcome.ok).toBe(false);
  expect(outcome.error?.message).toContain('phosphorus');
});

it('中文主题归一成英文', async () => {
  const searchSections = jest.fn().mockResolvedValue([]);
  await executeTool('search_knowledge_library', { query: 'x', topics: ['磷'] }, { ...ctx, library: { searchSections } });
  expect(searchSections).toHaveBeenCalledWith('x', expect.objectContaining({ topics: ['phosphorus'] }));
});

it('0 结果返回 no_match 和未覆盖摘要', async () => {
  const outcome = await executeTool('search_knowledge_library', { query: 'x' }, { ...ctx, library: { searchSections: jest.fn().mockResolvedValue([]) } });
  expect((outcome.data as any).status).toBe('no_match');
  expect(outcome.summary).toContain('未覆盖');
});

it('非 CKD 文档被拒绝', async () => {
  const outcome = await executeTool('search_knowledge_library', { query: 'x', documentIds: ['aaha-AAHA-2010-Nutritional-Assessment-Guidelines'] }, ctx);
  expect(outcome.ok).toBe(false);
  expect(outcome.error?.message).toContain('CKD');
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npm test -- tests/application/recipe-designer/agent-tools-library.spec.ts`
Expected: FAIL。

- [ ] **Step 3: 实现**

- 从 tool schema 删除 `scope`；模型仍传 `scope` → `ok:false`「本阶段只开放 CKD；scope 参数已移除」。
- `knowledge_scope` 的 `sourceId` 也校验 CKD 来源；非 CKD → `ok:false`。
- `normalizeTopics`：用 `normalizeTopic` 归一中文/别名；未知收集 valid 错误；`fail('INVALID_ARGUMENT', '未知主题：...；可用：...')`。
- 校验 `sourceIds`（`isKnownSourceId` 且属于 CKD 来源：`SACN5` / `IRIS-CKD-2026` / `AAHA-2021-NUTRITION`）、`documentIds`（CKD 子集）；未知/越界 fail，提示「配方本阶段只开放 CKD」。
- 0 结果：`status:'no_match'`、`hints:['换同义词','用 knowledge_scope 看馆藏']`、摘要「知识库未覆盖该问题」。
- `tools.ts` 的 `CKD_DOCUMENT_IDS` 改为从 `section-catalog.service.ts` 导入，删除本地重复。

- [ ] **Step 4: 跑测试并提交**

Run: `cd backend && npm test -- tests/application/recipe-designer/agent-tools-library.spec.ts && npx tsc --noEmit`
Expected: PASS。

提交：
```bash
git add backend/src/application/recipe-designer/agent/tools.ts \
        backend/src/application/knowledge-base/query-expansion.ts \
        backend/tests/application/recipe-designer/agent-tools-library.spec.ts
bash scripts/session.sh commit -m "fix(knowledge): 空结果语义、参数校验与移除全库选项"
```

---

### Task 5: 补剂 Agent 改用统一检索（改写现有 spec）

**Files:**
- Modify: `backend/src/application/knowledge/knowledge-search.service.ts`
- Modify: `backend/src/application/ingredient-creation/supplement-tools.ts`
- Modify: `backend/tests/application/knowledge/knowledge-search.service.spec.ts`（**已存在，不是新建**）

**Interfaces:**
- Changes: `search(query: string, limit?: number): Promise<KnowledgeHit[]>`
- Changes: `isAvailable(): Promise<boolean>`
- Consumes: `KnowledgeLibraryService`、`PrismaService`

- [ ] **Step 1: 写失败测试（改写现有 spec）**

现有 spec 是同步接口、`new KnowledgeSearchService()`、真实 `chunks.jsonl`。改写为：

```ts
it('从数据库返回命中，不再读 chunks.jsonl', async () => {
  const library = { search: jest.fn().mockResolvedValue([passage('zinc sulfate ...')]) };
  const service = new KnowledgeSearchService({ sourceParagraph: { count: jest.fn().mockResolvedValue(1) } } as any, library as any);
  const hits = await service.search('zinc sulfate bioavailability', 4);
  expect(hits[0].chunkId).toBe('p1');
  expect(hits[0].text).toContain('zinc');
  expect(library.search).toHaveBeenCalledWith('zinc sulfate bioavailability', expect.objectContaining({ limit: 4 }));
  expect(library.search).toHaveBeenCalledWith(expect.anything(), expect.not.objectContaining({ documentIds: expect.anything() }));
});

it('数据库为空时 isAvailable=false', async () => {
  const service = new KnowledgeSearchService({ sourceParagraph: { count: jest.fn().mockResolvedValue(0) } } as any, {} as any);
  await expect(service.isAvailable()).resolves.toBe(false);
});
```

保留原有「真实语料 zinc/copper」用例的**意图**，但改成数据库可用时跑、不可用 skip：
- 若 `process.env.DATABASE_URL` 存在且 `sourceParagraph.count()>0`，用真实 `PrismaClient` + `KnowledgeLibraryService` 跑 3 个查询（zinc sulfate / copper oxide / bioavailability），断言命中且 `text` 含关键词；
- 否则 `describe.skip`，不假装通过。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npm test -- tests/application/knowledge/knowledge-search.service.spec.ts`
Expected: FAIL，接口还是同步、构造参数不匹配、仍读文件。

- [ ] **Step 3: 实现**

- `KnowledgeSearchService` 构造函数注入 `PrismaService` + `KnowledgeLibraryService`；
- `search` 改为 async，调 `library.search(query, { limit })`（**不传 `documentIds`**，补剂查全库），映射 `{ chunkId: p.id, docId: p.documentId, text: p.text.slice(0, 600), score: p.score }`；
- `isAvailable` 改为 async，`sourceParagraph.count() > 0`；
- 删除 `readFileSync`/`chunks.jsonl` 路径常量；错误信息改成「知识库数据库不可用或为空」；
- `supplement-tools.ts` 两处 `await`：`if (!(await context.knowledge.isAvailable()))`、`data: await context.knowledge.search(...)`。

- [ ] **Step 4: 补剂 3 个查询人工验证**

用一次性脚本调 `KnowledgeSearchService`：
- `zinc sulfate bioavailability`
- `calcium carbonate absorption`
- `fish oil omega-3`

Expected: 三题都返回非空，带 `docId` 和原文片段；记录命中文档名。若为空，先查查询扩展/候选上限，不把「不可用」当通过。

- [ ] **Step 5: 跑测试并提交**

Run:
```bash
cd backend
npm test -- tests/application/knowledge/knowledge-search.service.spec.ts tests/application/ingredient-creation
npx tsc --noEmit
```
Expected: PASS（真实语料用例在无 DB 时 skip，不失败）。

提交：
```bash
git add backend/src/application/knowledge/knowledge-search.service.ts \
        backend/src/application/ingredient-creation/supplement-tools.ts \
        backend/tests/application/knowledge/knowledge-search.service.spec.ts
bash scripts/session.sh commit -m "feat(knowledge): 补剂 Agent 改用统一原文检索"
```

---

### Task 6: 26 题工具层回归、检索用量报告

**Files:**
- Create: `docs/knowledge-base/ckd-structure/library-questions.json`（按 spec 附录 A）
- Create: `backend/src/application/knowledge-base/library-eval.ts`
- Create: `backend/tests/application/knowledge-base/library-eval.spec.ts`
- Create: `backend/scripts/knowledge-base/evaluate-library.ts`
- Create: `backend/scripts/knowledge-base/knowledge-usage-report.ts`
- Modify: `backend/package.json`（`kb:eval`、`kb:usage`）
- Generated: `docs/knowledge-base/ckd-structure/library-evaluation.md`、`.json`

**Interfaces:**
- Produces: `judgeQuestion(result: QuestionResult, spec: QuestionSpec): QuestionVerdict`
- Produces: `QuestionSpec`（id/query/expectedSections/forbiddenSections/expectedTables/expectNoSource/category/species?/stage?/topics?）
- Produces: `QuestionResult`（status/sections/tables）
- Produces CLI: `npm run kb:eval`、`npm run kb:usage`

- [ ] **Step 1: 写失败测试**

`library-eval.spec.ts`：

```ts
it('前 3 节命中即通过', () => {
  expect(judgeQuestion({ status:'ok', sections:[{sectionId:'I-s005'}] }, { id:'stage3', expectedSections:['I-s005'], category:'staging' }).passed).toBe(true);
});

it('出现禁止节即不通过', () => {
  expect(judgeQuestion({ status:'ok', sections:[{sectionId:'I-s006'}] }, { id:'stage2', expectedSections:['I-s004'], forbiddenSections:['I-s006'], category:'adversarial' }).passed).toBe(false);
});

it('负样本需要 no_match', () => {
  expect(judgeQuestion({ status:'ok', sections:[{sectionId:'S-s017'}] }, { id:'neg', expectNoSource:true, category:'negative' }).passed).toBe(false);
});

it('表格题需要表格命中', () => {
  expect(judgeQuestion({ status:'ok', sections:[], tables:[{ tableId:'T0497' }] }, { id:'t', expectedTables:['T0497'], category:'table' }).passed).toBe(true);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npm test -- tests/application/knowledge-base/library-eval.spec.ts`
Expected: FAIL。

- [ ] **Step 3: 实现评估与脚本**

- `library-eval.ts`：纯函数 `judgeQuestion`，按 spec 附录 A 判分。
- `library-questions.json`：26 题，按 spec 附录 A（含 `species/stage/topics` 提示、修正后的期望节）。
- `evaluate-library.ts`：
  - `import 'dotenv/config'`；
  - 实例化 `KnowledgeLibraryService`、`SourceLayerService`、`CitationRegistry`；
  - **走 `executeTool('search_knowledge_library', { query, species, stage, topics, limit: 5 }, context)`**；context 的 `port`/`catalog` 用 `{} as any`，`onAsk: () => {}`；
  - 表题再 `executeTool('open_knowledge', { tableId }, context)` 验证能打开、有 `citationId`；
  - 记录每题耗时，输出 Markdown + JSON，打印分类通过数、p50/p95/max、5 组核心表（T0253/T0497/T0260/T0261/T0025/T0026）是否可打开；
  - `process.exitCode` 在以下任一情况为 1：整体 <21/26、Stage 3 <1/1、表格 <2/2、中文 <5/6、负样本 <4/4、对抗 <4/4。
- `knowledge-usage-report.ts`：查 `recipeDesignAgentMessage` 中 `toolName in ['search_knowledge_library','open_knowledge','knowledge_scope']`；统计调用数、0 结果数、Top 查询、最近 7 天；输出 Markdown。
- `package.json`：
  - `"kb:eval": "ts-node -r tsconfig-paths/register scripts/knowledge-base/evaluate-library.ts"`
  - `"kb:usage": "ts-node -r tsconfig-paths/register scripts/knowledge-base/knowledge-usage-report.ts"`

- [ ] **Step 4: 跑 26 题并记录基线**

Run:
```bash
cd backend
npm test -- tests/application/knowledge-base/library-eval.spec.ts
npm run kb:eval
```
Expected: 26 题结果；整体 ≥21/26，Stage 3 1/1，表格 2/2，中文 ≥5/6，负样本 4/4，对抗 4/4；5 组核心表全部可打开；p95 <300ms、max <1s。未达标先回去调 Task 1 的焦点/软排序或 Task 2 的表格视图，不降低整体门槛；如果某题期望本身不合理（例如语料里没有该物种/分期证据），改该题期望并在报告里写理由，不动其他题的期望。

- [ ] **Step 5: 提交**

```bash
git add docs/knowledge-base/ckd-structure/library-questions.json \
        docs/knowledge-base/ckd-structure/library-evaluation.md \
        docs/knowledge-base/ckd-structure/library-evaluation.json \
        backend/src/application/knowledge-base/library-eval.ts \
        backend/tests/application/knowledge-base/library-eval.spec.ts \
        backend/scripts/knowledge-base/evaluate-library.ts \
        backend/scripts/knowledge-base/knowledge-usage-report.ts \
        backend/package.json
bash scripts/session.sh commit -m "test(knowledge): 26 题工具层回归与检索用量报告"
```

---

### Task 7: 文档、引用冒烟、整体验证、合并/部署检查

**Files:**
- Modify: `docs/knowledge-base/README.md`
- Modify: `docs/knowledge-base/ckd-structure/README.md`
- Modify: `docs/knowledge-base/ckd-structure/full-library-decision.md`
- Optional: `docs/knowledge-base/2026-11-09-knowledge-base-agent-service-review.md` 顶部说明 v1.1

- [ ] **Step 1: 更新文档**

- `README.md`：新增「最小图书馆版」一节（不重写原有治理层结构）；写清三个工具、焦点/分期规则、配方 CKD 范围、补剂全库。
- `ckd-structure/README.md`：写清 `retrieval-evaluation` 是旧 14 题，`library-evaluation` 是新 26 题（走工具层）；`kb:eval` 用法。
- `ckd-structure/full-library-decision.md`：加「v1 最小图书馆；配方只 CKD，补剂可全库关键词；全库章节编目扩展开关在 v2，过 26 题 + 抽检后再谈」。

- [ ] **Step 2: 静态检查**

Run:
```bash
cd backend
npx tsc --noEmit
npm test -- tests/application/knowledge-base tests/application/recipe-designer/agent-tools-library.spec.ts tests/application/recipe-designer/citation-registry.spec.ts tests/application/knowledge/knowledge-search.service.spec.ts
npm run kb:eval
```
Expected: 全绿；26 题达标。

- [ ] **Step 3: 引用冒烟（5 个 CKD 场景）**

用 `scripts/knowledge-base/evaluate-library.ts` 的同一套 `executeTool` + `CitationRegistry`，跑 5 个查询（CKD 2 期血磷、CKD 3 期血磷、CKD 4 期贫血、CKD 2 期 + UPC + 血压、非 CKD 对照）：
- 取返回的 `[K#]`，构造「数值 + [K#]」的短句，`audit` 有效；
- 打开表格的 K 号在会话恢复后仍有效；
- 记录引用有效/无效数。

Expected: 5/5 有效，0 无效；把结果贴回执行记录。

- [ ] **Step 4: 清理旧路径**

Run:
```bash
cd backend
grep -rn "scope.*all\|chunks.jsonl\|take: 1000\|filterBoost\|isExactFilterMatch" src/application/knowledge-base src/application/knowledge src/application/recipe-designer/agent
```
Expected: 无 `scope=all`；`chunks.jsonl` 只出现在注释/文档；无 `take: 1000`、`filterBoost`、`isExactFilterMatch`。

- [ ] **Step 5: 提交**

```bash
git add docs/knowledge-base/README.md \
        docs/knowledge-base/ckd-structure/README.md \
        docs/knowledge-base/ckd-structure/full-library-decision.md \
        docs/knowledge-base/2026-11-09-knowledge-base-agent-service-review.md
bash scripts/session.sh commit -m "docs(knowledge): 最小图书馆版说明与验收口径"
```

- [ ] **Step 6: 合并（在工位里）与部署（合并后）**

在**工位根目录**执行：
```bash
bash scripts/gate.sh status
bash scripts/session.sh merge
```
Expected: 拿到 merge-main 门禁，rebase、推送分支、快进合并到 main。工位必须没有未提交改动（Task 6 的评估输出已提交）。

合并成功后，回主工作区部署：
```bash
cd /Users/zhaochen/Documents/SevenKitchen
cd backend && bash scripts/remote_deploy_v2.sh
```
Expected: 后端部署成功（若 backend 无改动，脚本会跳过；本计划有改动，应部署）。

生产冒烟：
- 补剂 Agent `isAvailable` 为 true，跑 3 个补剂查询；
- 5 组核心表可 `open_knowledge` 打开；
- Stage 3 查询前 3 节含 `s005`；
- 26 题本地已达标，生产不重复跑全量。
把结果贴回执行记录。

---

## 验收清单（执行者收尾时逐条打勾）

- [ ] `search_knowledge_library` 不再有硬过滤；`species/stage/topics` 只影响排序/召回扩展。
- [ ] `s005`（Stage 2 标题、Stage 3 正文，6/6 不含 phosphate）在 Stage 3 查询前 3 节里。
- [ ] `biotin/manganese/chromium` 负样本返回 `no_match`，不返回 SACN5 无关段落。
- [ ] 6 道中文题 ≥5 道命中；单字术语（磷/钠/钾/氯/镁/碘/钙）能展开。
- [ ] 5 组核心表可 `open_knowledge` 打开，表格有 K 号且会话恢复后仍有效。
- [ ] 补剂 Agent 走同一服务，`chunks.jsonl` 不再是运行时依赖；zinc/copper 真实召回未退化。
- [ ] 26 题走 `executeTool`，结果达标并生成报告。
- [ ] 配方侧 `knowledge_scope`/`open_knowledge` 不暴露 CKD 之外馆藏。
- [ ] `npx tsc --noEmit` 通过；目标测试全绿。
- [ ] 文档与代码一致；无 `scope=all`、`take: 1000`、`filterBoost`、`isExactFilterMatch`。

## 不在本计划内

- 全库章节编目、逐节人工确认、覆盖矩阵、`kb_lookup`、向量检索、重切 SACN5/IRIS 章节、原文接口鉴权、健康分析改造、评估标准修改。
