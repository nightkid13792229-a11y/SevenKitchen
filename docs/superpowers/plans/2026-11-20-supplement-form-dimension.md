# 补剂形态维度化 · 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把「定形态」从固定四档改成「固定维度 + 取值由知识库与市场实时长出」，让 B 族、鱼油、益生菌和以后的新品类都不用改代码。

**Architecture:** 两个抽取器（市场标题 / 知识库原文）各自产出候选词，经归一化合并成「维度 → 候选」两张小表；有原文的才给结论，只有市场的标「无依据但可买」。旧四档在迁移期用 `mode` 开关并存，最后一次删掉。

**Tech Stack:** NestJS + Prisma（后端）、Vue 3 + Element Plus + Vitest（admin-web）、DeepSeek chat/search/fetch + 本地知识库 v3。

**Spec:** `docs/superpowers/specs/2026-11-20-supplement-form-dimension-design.md`

## Global Constraints

- 形态**不再按品类写死**；代码里只允许固定**维度**（`FORM` / `SOURCE`）。
- 任何一条标「有原文」的候选，必须能在**本次读过的页**里找到逐字原句；引用校验沿用 `enforceCitationRule`。
- 候选词必须**逐字出现在原文 / 标题里**，服务端做子串校验，模型说了但文本里没有的一律丢弃。
- 只有市场、没有原文的候选：`verdict` 固定 `NO_EVIDENCE`，不许出现"推荐"。
- 不改第 2 步比价口径与排序、不改第 3 步建档与写入、不改第 4 步落地配置。
- 抓取只走 DeepSeek 的 `/tools/search` 与 `/tools/fetch`；只搜 `cn.iherb.com`。
- 迁移期间接口用 `mode: 'legacy' | 'dimensions'` 并存，**默认 `legacy`**，Phase 3 前端切换后再在 Phase 4 删除。
- 后端测试：`npx jest src/domain/ingredient/tests/<file>`（jest 只认 `tests/*.spec.ts`）；自检用 `npx tsc --noEmit`，**不要跑 `npm run build`**（会删 `dist/` 弄死本机联调）。
- 本机联调需要 `INGREDIENT_INTAKE` 模型配置：**临时**插一条（从 `DEFAULT` 复制），测完删除，见 Task 2 Step 4。

## Review Focus

- 检索仍可能被高频词带偏（如 `absorption` 命中胃肠药指南）：取页规划必须**每条查询轮流取**，并记下被丢的页与原因。
- 商品标题里的品牌/规格/剂量被当成形态词：没有「同标题出现目标营养素」的过滤就不许入库。
- 归一化把不同东西并成一个（`glycinate` 与 `bisglycinate`）：先按词形归，可疑的标 `NEEDS_REVIEW`，不自动合并。
- 知识库抽不到任何词：页面必须**明说"库里没提到，以下是市场形态"**，且不出现"建议用"。
- 复合维生素（一瓶十几种）：不出现形态表，直接进比价，且比价里标"复方、不参与单价排序"。

---

### Task 1: 取页规划与索引页判定（纯函数）

**Files:**
- Create: `backend/src/domain/ingredient/kb-retrieval-plan.ts`
- Test: `backend/src/domain/ingredient/tests/kb-retrieval-plan.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface RetrievalHit { documentId: string; pageNo: number; score: number; snippet: string }
  export interface RetrievalQueryHits { query: string; hits: RetrievalHit[] }
  export interface RetrievalPlanOptions { totalPages: number; perQueryMax: number; perDocumentMax: number }
  export interface PlannedPage { documentId: string; pageNo: number; score: number; query: string }
  export type DropReason = 'DUPLICATE' | 'QUERY_LIMIT' | 'DOC_LIMIT' | 'TOTAL_LIMIT' | 'INDEX_PAGE'
  export interface DroppedPage { documentId: string; pageNo: number; reason: DropReason }
  export function planRetrievalPages(input: RetrievalQueryHits[], opts: RetrievalPlanOptions): { pages: PlannedPage[]; dropped: DroppedPage[] }
  export function looksLikeIndexPage(text: string): boolean
  ```

- [ ] **Step 1: 写失败的测试**

```ts
it('三条查询轮流取：先各取 1 页，再回头补', () => {
  // 每查询 3 条命中、total=4、perQueryMax=2、perDocMax=2
  // 期望顺序：q1[0], q2[0], q3[0], q1[1]
})
it('同一文档最多 2 页，第 3 页记 DOC_LIMIT', () => {})
it('同一页被两条查询命中只取一次，第二次记 DUPLICATE', () => {})
it('索引页不读，记 INDEX_PAGE', () => {
  expect(looksLikeIndexPage('Index\nAAFCO, 2001 ... 512\n...')).toBe(true)
  expect(looksLikeIndexPage('Iron oxide and carbonate demonstrate negligible bioavailability.')).toBe(false)
})
it('总数到上限后其余记 TOTAL_LIMIT，且不抛错', () => {})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest src/domain/ingredient/tests/kb-retrieval-plan.spec.ts`
Expected: FAIL，找不到模块。

- [ ] **Step 3: 实现**

轮流取页：第一轮每条查询取第 1 条可用命中，之后按同样顺序补第 2 条，直到 `totalPages`。跳过的页要写进 `dropped` 并带原因。`looksLikeIndexPage` 的判据：首行是 `Index` / `Contents` / `目 录` / `索引`，或「数字+点号开头的短行占比 > 50%」。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && npx jest src/domain/ingredient/tests/kb-retrieval-plan.spec.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
bash scripts/session.sh commit -m "feat(supplement): 取页规划（查询轮流取/文档限页/过滤索引页）"
```

---

### Task 2: 形态建议接入取页规划，并记录检索

**Files:**
- Modify: `backend/src/application/ingredient-creation/supplement-form-advice.service.ts`
- Modify: `backend/src/domain/ingredient/supplement-form-advice.ts`（`FormAdvice` 增可选 `retrieval`）
- Test: 复用 Task 1；本任务靠日志与接口手验

**Interfaces:**
- Produces: `FormAdvice.retrieval?: { queries: string[]; pages: { documentId: string; page: number; score: number }[]; dropped: { documentId: string; page: number; reason: string }[] }`

- [ ] **Step 1: 收拢命中**

`findPages` 改成返回 `RetrievalQueryHits[]`（保留 query 与 hits），不再把三条查询的命中混成一个数组。

- [ ] **Step 2: 用规划器选页**

`readPages` 改用 `planRetrievalPages(hits, { totalPages: 4, perQueryMax: 2, perDocumentMax: 2 })`；被丢的页写进 `retrieval.dropped`，读成功的页写进 `retrieval.pages`。

- [ ] **Step 3: 查询词按维度生成**

三条改成：`<en> bioavailability`、`<en> form`、`<en> source`；保留 `absorption` 作为第四条（总数仍 3～4 条，避免把"吸收"当唯一入口）。

- [ ] **Step 4: 本机手验（铁与铜）**

```bash
cd backend && PORT=3018 npm run start:dev:miniapp   # 后台跑
```
临时插一条模型配置（测完必删）：

```bash
node -e "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();
(async()=>{const d=await p.agentProviderConfig.findUnique({where:{purpose_provider:{purpose:'DEFAULT',provider:'DEEPSEEK'}}});
if(!await p.agentProviderConfig.findUnique({where:{purpose_provider:{purpose:'INGREDIENT_INTAKE',provider:'DEEPSEEK'}}}))
await p.agentProviderConfig.create({data:{purpose:'INGREDIENT_INTAKE',provider:'DEEPSEEK',enabled:true,baseUrl:d.baseUrl,model:d.model,apiKeyEncrypted:d.apiKeyEncrypted,apiKeyLast4:d.apiKeyLast4,maxConcurrency:2,requestTimeoutMs:90000,retryCount:2}});
process.exit(0)})()"
```

用开发令牌调 `form-advice` 两次（`minerals.iron`、`minerals.copper`），**期望**：
- 铁：至少一条候选引用到含 `Iron oxide and carbonate` 的原句；
- 铜：结论与改动前一致（无机盐可用 / 氧化物不可用 / 螯合证据不足）；
- 响应里 `retrieval.pages` 的文档不重复超过 2 页。

测完删除那条配置（`deleteMany({where:{purpose:'INGREDIENT_INTAKE'}})`），并停掉本机后端。

- [ ] **Step 5: 提交**

```bash
bash scripts/session.sh commit -m "feat(supplement): 形态建议按规划取页并回传检索明细"
```

---

### Task 3: 市场抽取器（标题 → 形态/来源词）

**Files:**
- Create: `backend/src/domain/ingredient/supplement-form-candidates.ts`（本任务只放纯函数）
- Create: `backend/src/application/ingredient-creation/supplement-market-form.service.ts`
- Test: `backend/src/domain/ingredient/tests/supplement-form-candidates.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  export type DimensionKey = 'FORM' | 'SOURCE'
  export function normalizeTermKey(raw: string): string          // 小写、去空格与连字符、合并重复空格
  export function mentionsNutrient(title: string, nutrientEnglish: string): boolean
  export function filterTermsByNutrient(terms: { surface: string; title: string; nutrientEnglish: string }[], nutrientEnglish: string): string[]
  // 服务
  export interface MarketTerm { key: string; labelZh: string; dimension: DimensionKey; count: number; samples: string[] }
  async extract(input: { nutrientKey: string; nutrientEnglish: string }): Promise<MarketTerm[]>
  ```

- [ ] **Step 1: 写失败的测试**

```ts
it('normalizeTermKey 把常见写法并成一个键', () => {
  expect(normalizeTermKey('Bis-Glycinate')).toBe('bisglycinate')
  expect(normalizeTermKey('  methyl cobalamin ')).toBe('methylcobalamin')
})
it('标题里没提到这个营养素 → 不算它的形态', () => {
  expect(mentionsNutrient('B-Complex 50 mg', 'vitamin b12')).toBe(false)
  expect(mentionsNutrient('Vitamin B12 Methylcobalamin 1000 mcg', 'vitamin b12')).toBe(true)
})
it('过滤后只留下确实指向该营养素的词', () => {})
```

- [ ] **Step 2: 跑测试确认失败 / 通过**

Run: `cd backend && npx jest src/domain/ingredient/tests/supplement-form-candidates.spec.ts`

- [ ] **Step 3: 实现纯函数**

`mentionsNutrient`：把标题小写，去掉连字符，命中营养素英文的**任一别名**（`vitamin b12` / `b-12` / `cobalamin`）。别名表先放本文件常量，Phase 3 迁进数据库。

- [ ] **Step 4: 实现服务**

1. `SupplementLinkPreviewService.searchCandidates('site:cn.iherb.com ' + nutrientEnglish, 20, 'cn.iherb.com')` 拿标题（复用已有搜索与缓存）；
2. 一次模型调用，提示词要求只输出 `{ "terms": [{ "surface": "bisglycinate", "labelZh": "双甘氨酸盐", "dimension": "FORM" }] }`，并明确「不要品牌、不要规格、不要剂量」；
3. 服务端用 `mentionsNutrient` 过滤、`normalizeTermKey` 归一、按 key 计数；
4. 结果缓存 30 分钟（按 nutrientKey）。

- [ ] **Step 5: 提交**

```bash
bash scripts/session.sh commit -m "feat(supplement): 市场形态抽取（标题→形态/来源词）"
```

---

### Task 4: 合并器（原文 × 市场）

**Files:**
- Modify: `backend/src/domain/ingredient/supplement-form-candidates.ts`
- Test: `backend/src/domain/ingredient/tests/supplement-form-merge.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface KbCandidate { key: string; labelZh: string; dimension: DimensionKey; citations: Citation[]; verdict: 'RECOMMENDED' | 'ACCEPTABLE' | 'AVOID' | 'NO_EVIDENCE'; reason: string }
  export interface DimensionCandidate { key: string; labelZh: string; dimension: DimensionKey; status: 'EVIDENCED' | 'MARKET_ONLY'; citations: Citation[]; verdict: 'RECOMMENDED' | 'ACCEPTABLE' | 'AVOID' | 'NO_EVIDENCE'; reason: string; market: { count: number; samples: string[] } | null }
  export function mergeCandidates(kb: KbCandidate[], market: MarketTerm[]): DimensionCandidate[]
  ```

- [ ] **Step 1: 写失败的测试**

```ts
it('原文有 + 市场有 → EVIDENCED 且带市场计数', () => {})
it('只有市场 → MARKET_ONLY，verdict 强制 NO_EVIDENCE、reason 写明"库里没有依据"', () => {})
it('只有原文、市场没有 → EVIDENCED，market 为 null（页面标"市场上没见到"）', () => {})
it('两边都没有 → 不产生候选', () => {})
it('同一 key 大小写不同 → 合并成一条，不重复', () => {})
```

- [ ] **Step 2: 跑测试确认失败 / 通过**

Run: `cd backend && npx jest src/domain/ingredient/tests/supplement-form-merge.spec.ts`

- [ ] **Step 3: 实现合并**

按 `normalizeTermKey` 归并；`MARKET_ONLY` 的 `verdict` 与 `reason` 在合并阶段就写死，避免后面有人给它加推荐。

- [ ] **Step 4: 提交**

```bash
bash scripts/session.sh commit -m "feat(supplement): 原文×市场合并（EVIDENCED / MARKET_ONLY）"
```

---

### Task 5: 新管线 + `mode` 开关

**Files:**
- Modify: `backend/src/application/ingredient-creation/supplement-form-advice.service.ts`（新增 `adviseDimensions`）
- Modify: `backend/src/interfaces/controllers/supplement-agent.controller.ts`
- Modify: `backend/src/interfaces/dto/ingredient-creation/supplement-agent.dto.ts`（`mode?`）
- Test: 无（薄壳），靠下面手验

**Interfaces:**
- Produces: `POST form-advice` 接受 `mode?: 'legacy' | 'dimensions'`（默认 `legacy`）；`dimensions` 模式返回
  ```ts
  { nutrientKey, nutrientLabel, dimensions: [{ key, label, candidates: DimensionCandidate[] }], recommendation: { dimensionKey, candidateKey } | null, gaps: string[], retrieval: {...} }
  ```

- [ ] **Step 1: 实现 `adviseDimensions`**

编排：`Promise.all([ KB 侧（取页 + 判定，复用现有）, 市场侧（Task 3）])` → `mergeCandidates` → 生成 `FORM` / `SOURCE` 两个维度 → 推荐取「同维度里第一条 RECOMMENDED，没有就 null」。

- [ ] **Step 2: 复合配方短路**

标题或标签里认得出 ≥2 个已知营养素 → 直接返回空 `dimensions` + `gaps: ['这是复方，不按形态判断']`，不发模型调用。

- [ ] **Step 3: 控制器按 `mode` 分流**

`legacy` 走原逻辑（保证线上页面不受影响）；`dimensions` 走新管线。

- [ ] **Step 4: 手验**

本机起后端（临时配置见 Task 2 Step 4），分别用 `minerals.copper`、`vitamins.vitaminB12`、`fattyAcids.epa` 调 `mode: 'dimensions'`，**期望**：
- B12 至少出 3 个市场候选（甲钴胺/氰钴胺/羟钴胺）；
- 鱼油至少出 4 个（TG/EE/rTG/磷虾/藻油）；
- 铜的 `dimensions` 里出现 `oxide` 且 `status=EVIDENCED`、`verdict=AVOID`。

- [ ] **Step 5: 提交**

```bash
bash scripts/session.sh commit -m "feat(supplement): 维度模式管线与 mode 开关"
```

---

### Task 6: 形态词典表（归一化 + 人工纠正）

**Files:**
- Modify: `backend/prisma/schema.prisma`（新增 `SupplementFormTerm`）
- Create: `backend/prisma/migrations/<ts>_supplement_form_term/migration.sql`
- Create: `backend/src/application/ingredient-creation/supplement-form-term.service.ts`
- Test: `backend/src/domain/ingredient/tests/supplement-form-term.spec.ts`（纯函数部分）

**Interfaces:**
- Produces:
  ```ts
  // 纯函数
  export function buildAliases(raw: string): string[]        // 原词 + 归一化 + 常见分隔写法
  // 服务
  async resolve(dimension: DimensionKey, raw: string): Promise<{ key: string; labelZh: string | null; status: 'CONFIRMED' | 'NEEDS_REVIEW' }>
  async upsertAuto(dimension, key, labelZh): Promise<void>
  ```

- [ ] **Step 1: 加表与迁移**

```prisma
model SupplementFormTerm {
  id           String   @id @default(uuid())
  dimension    String   @db.VarChar(16)
  canonicalKey String   @map("canonical_key") @db.VarChar(120)
  labelZh      String?  @map("label_zh") @db.VarChar(120)
  labelEn      String?  @map("label_en") @db.VarChar(120)
  aliases      String[] @default([])
  nutrientKeys String[] @map("nutrient_keys")
  status       String   @default("AUTO") @db.VarChar(16)
  source       String   @default("MARKET") @db.VarChar(16)
  reviewedBy   String?  @map("reviewed_by")
  reviewedAt   DateTime? @map("reviewed_at")
  createdAt    DateTime @default(now()) @map("created_at")

  @@unique([dimension, canonicalKey])
  @@map("supplement_form_term")
}
```

迁移只加表，不改旧表；本机用 `npx prisma db execute --file ...` 应用（本地库有历史漂移，不要 `migrate dev`），再 `npx prisma generate`。

- [ ] **Step 2: 写失败的测试**

```ts
it('buildAliases 覆盖连字符与空格写法', () => {
  expect(buildAliases('Bis-Glycinate')).toEqual(expect.arrayContaining(['bis-glycinate', 'bisglycinate']))
})
it('认不出的新词 → NEEDS_REVIEW，不自动合并到已有词', () => {})
it('别名命中 → 用已有 canonical key', () => {})
```

- [ ] **Step 3: 实现服务（带内存缓存，TTL 10 分钟）**

先查表（dimension + aliases 包含归一化词）；没命中就 `upsertAuto` 成 `NEEDS_REVIEW`，返回新键。

- [ ] **Step 4: 跑测试 + 提交**

Run: `cd backend && npx jest src/domain/ingredient/tests/supplement-form-term.spec.ts`

```bash
bash scripts/session.sh commit -m "feat(supplement): 形态词典表与归一化（可疑词标待确认）"
```

---

### Task 7: 知识库抽词（原文 → 候选 + 引用）

**Files:**
- Create: `backend/src/application/ingredient-creation/supplement-kb-form.service.ts`
- Create: `backend/src/domain/ingredient/supplement-kb-form.ts`（纯函数：子串校验与清洗）
- Test: `backend/src/domain/ingredient/tests/supplement-kb-form.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  export function verifyAgainstPages(term: { surface: string; quote: string; documentId: string; page: number }, pages: { documentId: string; page: number; text: string }[]): boolean
  export function cleanSurface(raw: string): string   // 去引号、去括号注释、去首尾标点
  // 服务
  async extract(input: { nutrientKey: string; nutrientEnglish: string; pages: {...}[] }): Promise<KbCandidate[]>
  ```

- [ ] **Step 1: 写失败的测试**

```ts
it('原文里没有这个词 → 丢弃', () => {})
it('引用原句不在该页 → 丢弃', () => {})
it('大小写与连字符差异不影响命中', () => {})
it('cleanSurface 去掉引号与括号注释', () => {
  expect(cleanSurface('“copper oxide” (CuO)')).toBe('copper oxide')
})
```

- [ ] **Step 2: 跑测试确认失败 / 通过**

Run: `cd backend && npx jest src/domain/ingredient/tests/supplement-kb-form.spec.ts`

- [ ] **Step 3: 实现服务**

一次模型调用，要求输出 `{ terms: [{ surface, labelZh, dimension, documentId, page, quote, verdict, reason }] }`；服务端用 `verifyAgainstPages` 逐条校验，再用 Task 6 的 `resolve` 归一，最后过 `enforceCitationRule`。

- [ ] **Step 4: 提交**

```bash
bash scripts/session.sh commit -m "feat(supplement): 知识库抽词与逐字校验"
```

---

### Task 8: 把两条抽取接进维度管线

**Files:**
- Modify: `backend/src/application/ingredient-creation/supplement-form-advice.service.ts`
- Test: 无（编排），靠 Task 5 的手验脚本重跑

- [ ] **Step 1: 替换旧的"四档判定"**

`adviseDimensions` 不再让模型按 `ORGANIC_CHELATE` 等四档作答，改为：KB 抽词（Task 7）+ 市场抽词（Task 3）→ 合并（Task 4）→ 归一（Task 6）→ 推荐。

- [ ] **Step 2: 推荐规则**

同维度里：有 `RECOMMENDED` 取第一条；没有就取第一条 `ACCEPTABLE`；都没有则 `recommendation = null`，并在 `gaps` 写「库里没给出可用结论」。

- [ ] **Step 3: 手验四条**

铜 / 铁 / B12 / 鱼油各跑一次 `mode: 'dimensions'`，对照设计书 §12 的验收口径。

- [ ] **Step 4: 提交**

```bash
bash scripts/session.sh commit -m "feat(supplement): 维度管线接上两条抽取"
```

---

### Task 9: 前端第一屏重画

**Files:**
- Modify: `admin-web/src/types/ingredientCreation.ts`（`FormDimensionsDto` 等）
- Modify: `admin-web/src/api/ingredientCreation.ts`（请求带 `mode: 'dimensions'`）
- Rewrite: `admin-web/src/views/Ingredients/ai-agent/supplement/steps/FormAdviceStep.vue`
- Modify: `admin-web/src/views/Ingredients/ai-agent/supplement/steps/formAdviceView.ts` + spec
- Test: `formAdviceView.spec.ts`（状态徽章、空表分支）

**Interfaces:**
- Consumes: Task 5/8 的响应结构。
- Produces: `FormAdviceStep` emit `chosen({ dimensionKey, candidateKey, labelZh, status })`。

- [ ] **Step 1: 写失败的测试**

```ts
it('MARKET_ONLY 永远不可推荐：徽章为灰、无"建议用"', () => {})
it('整张表为空 → 文案是"这一类不按形态判断"，并给出"去比价"', () => {})
it('有原文的行才显示出处条数', () => {})
```

- [ ] **Step 2: 重画界面**

按维度分组（形态 / 来源），每行：名称 + 状态徽章 + 出处（可展开）+ 市场计数 + 选择按钮；`MARKET_ONLY` 用灰卡 +「仍用这一档」（沿用现有确认弹窗）；顶部"建议用"只在有 `recommendation` 时出现。

- [ ] **Step 3: 自检**

Run: `cd admin-web && npx vitest run src/views/Ingredients/ai-agent/supplement && npx vue-tsc -b --noEmit`
Expected: 全绿。

- [ ] **Step 4: 提交**

```bash
bash scripts/session.sh commit -m "feat(supplement): 形态第一屏按维度渲染"
```

---

### Task 10: 流程状态与快照跟着改

**Files:**
- Modify: `admin-web/src/views/Ingredients/ai-agent/supplement/steps/supplementFlowState.ts` + spec
- Modify: `SupplementFlow.vue`、`ArchiveStep.vue`（快照字段）

- [ ] **Step 1: 写失败的测试**

```ts
it('选中的是 MARKET_ONLY 时，快照里 humanOverride 为 true', () => {})
it('老快照没有 dimensionKey 也能读，缺字段补默认', () => {})
```

- [ ] **Step 2: 改状态与快照**

`chosenFormLevel` 换成 `chosenForm: { dimensionKey, candidateKey, labelZh, status }`；快照写 `formCandidate`，`humanOverride = status !== 'EVIDENCED'`。

- [ ] **Step 3: 自检并提交**

```bash
cd admin-web && npx vitest run src/views/Ingredients && npx vue-tsc -b --noEmit
bash scripts/session.sh commit -m "feat(supplement): 流程状态与选品快照改用维度候选"
```

---

### Task 11: 回归与清理

**Files:**
- Delete: `FormLevel` / `FormOption` / 四档相关常量与测试
- Modify: `backend/src/domain/ingredient/supplement-form-advice.ts`（只留 Citation 与 `enforceCitationRule`）
- Modify: `docs/05_API_Specs.md`、`docs/README.md`

- [ ] **Step 1: 四种补剂回归**

铜 / 铁 / B12 / 鱼油 + 复合维生素（应跳过形态），按设计书 §12 逐条对照，把结果贴进提交说明。

- [ ] **Step 2: 删旧**

`grep -rn "ORGANIC_CHELATE\|INORGANIC_SALT"` 确认只剩比价里的历史数据兼容（若有）再删；删完跑：

```bash
cd admin-web && npx vitest run && npx vue-tsc -b --noEmit
cd ../backend && npx tsc --noEmit && npx jest src/domain/ingredient/tests
```

- [ ] **Step 3: 文档**

`05_API_Specs.md` 补 `mode` 参数与返回结构；`README.md` 登记设计书与计划。

- [ ] **Step 4: 提交**

```bash
bash scripts/session.sh commit -m "refactor(supplement): 删除固定四档，形态改由维度驱动"
```
