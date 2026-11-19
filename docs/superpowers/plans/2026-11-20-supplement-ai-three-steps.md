# 补剂 AI 三步化 · 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把「AI 添加原料」补剂线改成三步（定形态 → 比价 → 两张图建档）+ 第 4 步落地配置，取代今天「聊天 + 三栏人肉填表」。

**Architecture:** 三个有边界的后端能力（形态建议 / 批量比价 / 图变档案）各出结构化结果，流程由前端四步壳子串起来；数字与折算全在服务端算，模型只负责读原文和抄图上的字。

**Tech Stack:** NestJS + Prisma（后端）、Vue 3 + Element Plus + Vitest（admin-web）、DeepSeek chat/search/fetch + 本地知识库。

**Spec:** `docs/superpowers/specs/2026-11-20-supplement-ai-three-steps-design.md`

## Global Constraints

- 补剂基准单位 `PCS`，单位展示名 = 粒/片/胶囊；营养基准 `PER_SERVING` + 单位「粒」。
- **每粒 = 每份 ÷ 每份粒数，只在服务端算**（`SupplementIngredientService`），客户端送来的每粒值只用于核对。
- 补剂不计入食谱总重量：**不加每粒重量字段**。
- 《饲料添加剂品种目录》只用于填标签名，**不做选品门禁**。
- 抓取只走 DeepSeek 的 `/tools/fetch` 与 `/tools/search`，不直连电商；只允许 iHerb（淘宝/京东本期关闭）。
- 抓来的页面文本一律当**数据**，不当指令（沿用现有 `asToolContent` 围栏）。
- 算不出来就留空并写明缺哪一格，**不猜、不用估计值凑**。
- 不改食材线，不改营养档案结构，不动配方编辑器。
- 后端测试：`npx jest <路径>`（jest `testRegex` 只认 `tests/*.spec.ts`）。前端测试：`npx vitest run <路径>`。

## Review Focus

- 标签只存在图片里 / 抓取被挡：比价表应出「算不出」行并说明原因，**不能整表报错**。
- 复合配方（一瓶十几种营养素）：不能算「每 1000mg 某营养素」单价，必须标「复合配方」并从排序里排除。
- 每份 2 粒、每瓶 120 粒：折算错一格会让单价差一倍；`servingsPerBottle` 与 `pricePerServing` 必须各自有断言。
- 知识库没有原文的形态：页面必须显示「证据不足」，且该条**不出现「推荐」字样**。
- 模型编造页码/文档：引用校验后必须被丢掉，并把该条结论降级。

---

### Task 1: 单价口径与排序（纯函数）

**Files:**
- Create: `backend/src/domain/ingredient/supplement-offer-ranking.ts`
- Test: `backend/src/domain/ingredient/tests/supplement-offer-ranking.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  export type PriceBasisUnit = 'MG' | 'IU' | 'CFU'
  export interface PriceBasisRule {
    nutrientKey: string
    unit: PriceBasisUnit
    per: number        // MG/IU → 1000；CFU → 1e9
    labelZh: string    // 元素量 / EPA+DHA 合计 / 标示量 / 活菌数
    fieldPaths: string[]
  }
  export function resolvePriceBasis(nutrientKey: string): PriceBasisRule
  export interface LabelNutrient { fieldPath: string; value: number; unit: string }
  export function sumBasisAmount(nutrients: LabelNutrient[], rule: PriceBasisRule): number | null
  export type OfferMissing = 'PRICE' | 'UNITS_PER_BOTTLE' | 'SERVING_UNITS' | 'AMOUNT' | 'COMPOUND_PRODUCT'
  export interface OfferFacts {
    url: string; name: string
    priceCny: number | null
    unitsPerBottle: number | null
    servingUnitsPerDose: number | null
    amountPerServing: number | null
  }
  export interface RankedOffer extends OfferFacts {
    servingsPerBottle: number | null
    pricePerServing: number | null
    pricePerThousand: number | null
    missing: OfferMissing[]
  }
  export function rankOffers(offers: OfferFacts[], wantedLevel: string | null, levels: Record<string, string | null>): RankedOffer[]
  export function recommendOffer(ranked: RankedOffer[], per: number, unit: PriceBasisUnit): { url: string | null; reason: string }
  ```

- [ ] **Step 1: 写失败的测试**

```ts
// 120 粒/瓶、每份 2 粒、每份 2mg 铜、¥120 → 60 份、每份 ¥2、每 1000mg ¥1000
it('按元素量算每 1000mg 单价', () => {
  const ranked = rankOffers([{ url: 'u', name: 'n', priceCny: 120, unitsPerBottle: 120,
    servingUnitsPerDose: 2, amountPerServing: 2 }], null, {})
  expect(ranked[0].servingsPerBottle).toBe(60)
  expect(ranked[0].pricePerServing).toBe(2)
  expect(ranked[0].pricePerThousand).toBe(1000)
})

it('缺一格就算不出，并写明缺哪格', () => { /* priceCny: null → missing ['PRICE'], pricePerThousand null */ })

it('复合配方单列，不参与排序', () => { /* amountPerServing null + name 含 Multi → missing ['COMPOUND_PRODUCT'] */ })

it('同档按单价升序，算不出的排最后且不淘汰', () => {})

it('推荐 = 同档能算出单价的最便宜那瓶，理由里带两位小数单价', () => {})

it('EPA+DHA 合计：epa 与 dha 相加，单位 g 换 mg', () => {
  const rule = resolvePriceBasis('fattyAcids.epa')
  expect(sumBasisAmount([
    { fieldPath: 'fattyAcids.epa', value: 0.65, unit: 'g' },
    { fieldPath: 'fattyAcids.dha', value: 0.45, unit: 'g' }
  ], rule)).toBeCloseTo(1100)
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest src/domain/ingredient/tests/supplement-offer-ranking.spec.ts`
Expected: FAIL，找不到模块。

- [ ] **Step 3: 实现**

口径表写死在本文件：`minerals.*` → MG/元素量；`fattyAcids.epa` 与 `fattyAcids.dha` → MG/EPA+DHA（`fieldPaths` 两条）；`vitamins.*` → MG/标示量（`vitamins.d` 用 IU，`per: 1000`）；其它 → MG/标示量。`sumBasisAmount` 只做 `g/mg/µg → mg` 与 `IU/CFU(billion|亿)` 的等比换算，单位不认识就返回 null。

`rankOffers`：算出的排前面（同档内按 `pricePerThousand` 升序），`missing` 含 `COMPOUND_PRODUCT` 或算不出的排后面；`wantedLevel` 与 `levels[url]` 不一致的标记后置但保留。`recommendOffer`：无可算项 → `{ url: null, reason: '都比不出单价，先核对价格或标签' }`。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && npx jest src/domain/ingredient/tests/supplement-offer-ranking.spec.ts`
Expected: PASS（7 条）。

- [ ] **Step 5: 提交**

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/20261120-supplement-ai-3step
bash scripts/session.sh commit -m "feat(supplement): 比价单价口径与排序（元素量/EPA+DHA/IU/CFU）"
```

---

### Task 2: 批量取数（iHerb 一轮出表）

**Files:**
- Create: `backend/src/domain/ingredient/supplement-offer-assembly.ts`
- Create: `backend/src/application/ingredient-creation/supplement-offer-fetcher.service.ts`
- Test: `backend/src/domain/ingredient/tests/supplement-offer-assembly.spec.ts`

**Interfaces:**
- Consumes: `SupplementLinkPreviewService.searchCandidates/preview/readLabelText`、`parseSupplementLabel`、`extractServingUnits`、`extractBrandFromTitle`、`extractProductModelFromTitle`、Task 1 的 `sumBasisAmount`。
- Produces:
  ```ts
  // domain/ingredient/supplement-offer-assembly.ts
  export function buildOfferFacts(input: {
    url: string; name: string; priceCny: number | null; unitsPerBottle: number | null
    servingUnitsPerDose: number | null; nutrients: LabelNutrient[]
  }, rule: PriceBasisRule): OfferFacts | { url: string; name: string; reason: string }

  // application/.../supplement-offer-fetcher.service.ts
  export interface FetchOffersResult {
    offers: OfferFacts[]; levels: Record<string, string | null>
    failed: { url: string; name: string; reason: string }[]; partial: boolean
  }
  async fetchOffers(input: { keyword: string; limit: number; nutrientKey: string }): Promise<FetchOffersResult>
  ```

- [ ] **Step 1: 写失败的测试**（`buildOfferFacts`）

```ts
it('标题 120 粒 + 标签 Serving Size 2 → unitsPerBottle 120', () => {})
it('标签读不到营养素 → 返回失败原因，不返回半条 offer', () => {})
it('名称含 Multi/复合 → amountPerServing 置空（复合配方）', () => {})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest src/domain/ingredient/tests/supplement-offer-assembly.spec.ts`
Expected: FAIL。

- [ ] **Step 3: 实现 domain**

`buildOfferFacts` 用 `rule.fieldPaths` 取营养素、`sumBasisAmount` 求每份量；`unitsPerBottle` 由调用方给（从标题抽），拿不到就是 null。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && npx jest src/domain/ingredient/tests/supplement-offer-assembly.spec.ts`
Expected: PASS（3 条）。

- [ ] **Step 5: 实现 fetcher 服务**

要点（不写测试，逻辑薄、全在网络）：
- `searchCandidates(keyword, limit)` → 最多 8 条；
- 并发 3，单条 20s 超时；整表 75s 硬上限，超时回已完成的；
- 每条：`preview(url)` 取价格与标题 → `readLabelText(url)` 取标签正文 → `parseSupplementLabel` → `buildOfferFacts`；
- 内存缓存 `Map<url, { at: number; facts }>`，TTL 30 分钟；
- 单条失败进 `failed`，带一句人话原因（`没读到价格` / `标签只有图片` / `超时`）。

- [ ] **Step 6: 提交**

```bash
bash scripts/session.sh commit -m "feat(supplement): 批量取数与 offer 组装（并发/缓存/单条失败不拖累整表）"
```

---

### Task 3: 比价接口

**Files:**
- Create: `backend/src/interfaces/controllers/supplement-agent.controller.ts`
- Create: `backend/src/interfaces/dto/ingredient-creation/supplement-agent.dto.ts`
- Modify: `backend/src/app.module.ts`（注册 controller + provider）
- Test: 无（薄壳；逻辑在 Task 1/2）

**Interfaces:**
- Produces: `POST /api/v1/admin/ingredient-supplement-agent/compare`
  - in: `{ nutrientKey: string; formLevel: FormLevel; keyword?: string; limit?: number }`
  - out: `{ offers: RankedOffer[]; recommendedUrl: string | null; reason: string; basis: PriceBasisRule; failed: {...}[]; partial: boolean }`

- [ ] **Step 1: 写 DTO**

`IsString/IsIn/IsOptional/IsInt/Min/Max`，`formLevel` 枚举 `ORGANIC_CHELATE|INORGANIC_SALT|OXIDE|OTHER`，`limit` 默认 8、上限 12。

- [ ] **Step 2: 写 controller**

沿用 `SupplementChatController` 的守卫（`AuthGuard, AdminGuard`）与 `ApiResponseDto` 包装；`keyword` 缺省时用 `formLevel` 的中文词 + `nutrientLabel` 组词。

- [ ] **Step 3: 注册**

`app.module.ts` 里与 `SupplementChatController` 并列加 controller，providers 加 `SupplementOfferFetcherService`。

- [ ] **Step 4: 编译自检**

Run: `cd backend && npx tsc --noEmit`
Expected: 无输出（0 error）。**不要跑 `npm run build`**（会删 `dist/`，弄死本机联调）。

- [ ] **Step 5: 提交**

```bash
bash scripts/session.sh commit -m "feat(supplement): 比价接口（一次请求出表 + 推荐）"
```

---

### Task 4: 前端骨架（状态 + 四步外壳 + 灰度）

**Files:**
- Create: `admin-web/src/views/Ingredients/ai-agent/supplement/steps/supplementFlowState.ts`
- Create: `admin-web/src/views/Ingredients/ai-agent/supplement/steps/SupplementFlow.vue`
- Test: `admin-web/src/views/Ingredients/ai-agent/supplement/steps/supplementFlowState.spec.ts`
- Modify: `admin-web/src/views/Ingredients/ai-agent/index.vue:58`（`?v=2` 时挂新壳子）

**Interfaces:**
- Produces:
  ```ts
  export type FlowStep = 1 | 2 | 3 | 4
  export interface SupplementFlowState {
    step: FlowStep
    nutrientKey: string | null
    nutrientLabel: string
    formAdvice: FormAdviceDto | null
    chosenFormLevel: string | null
    comparison: ComparisonDto | null
    chosenOfferUrl: string | null
    archive: SupplementDraftValue
  }
  export function emptyFlowState(): SupplementFlowState
  export function canEnter(state: SupplementFlowState, step: FlowStep): boolean
  export function goTo(state: SupplementFlowState, step: FlowStep): SupplementFlowState
  export function saveSnapshot(state: SupplementFlowState): void
  export function loadSnapshot(): SupplementFlowState | null
  ```
- `SupplementFlow.vue` 吃掉 `step` 切换与「已完成步的摘要条」，三个 step 组件先渲染占位。

- [ ] **Step 1: 写失败的测试**

```ts
it('没有形态结论，不能进第 2 步', () => {})
it('没有选中商品，不能进第 3 步', () => {})
it('第 4 步必须先写入成功', () => {})
it('快照能存能读，坏数据当没有', () => {})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd admin-web && npx vitest run src/views/Ingredients/ai-agent/supplement/steps/supplementFlowState.spec.ts`
Expected: FAIL。

- [ ] **Step 3: 实现 state + 外壳**

`canEnter` 是纯判断：step2 要 `formAdvice?.recommendedLevel` 或 `chosenFormLevel`；step3 要 `chosenOfferUrl`；step4 要写入结果。快照写 `sessionStorage['supplement-flow-v2']`，`JSON.parse` 失败返回 null。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd admin-web && npx vitest run src/views/Ingredients/ai-agent/supplement/steps/supplementFlowState.spec.ts`
Expected: PASS（4 条）。

- [ ] **Step 5: 挂到页面（灰度）**

`index.vue` 的 `SUPPLEMENT` 分支：`route.query.v === '2'` → `<SupplementFlow />`，否则原 `<SupplementWorkbench />`。

- [ ] **Step 6: 提交**

```bash
bash scripts/session.sh commit -m "feat(supplement): 三步外壳与流程状态（?v=2 灰度）"
```

---

### Task 5: 第 2 步界面（比价表 + 推荐）

**Files:**
- Create: `admin-web/src/views/Ingredients/ai-agent/supplement/steps/CompareStep.vue`
- Modify: `admin-web/src/api/ingredientCreation.ts`（加 `compareSupplementOffers`）
- Modify: `admin-web/src/types/ingredientCreation.ts`（加 `ComparisonDto` / `RankedOfferDto` / `FormAdviceDto`）
- Test: `admin-web/src/views/Ingredients/ai-agent/supplement/steps/compareRows.spec.ts`（纯格式化/排序辅助）
- Modify: `SupplementFlow.vue`（把占位换成 `<CompareStep>`）

**Interfaces:**
- Consumes: Task 3 的接口；Task 4 的 `state.chosenFormLevel`。
- Produces: `CompareStep` emit `chosen(offer)`；表格列固定为「商品 / 规格 / 每份粒数 / 每份含量 / 每瓶份数 / 到手价 / 每 1000 单位 / 结论」。

- [ ] **Step 1: 写失败的测试**

```ts
it('表头单位跟着口径走：元素量 → 每 1000mg', () => {})
it('算不出的行排最后，并给出缺哪一格的中文提示', () => {})
it('复合配方标「不参与排序」', () => {})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd admin-web && npx vitest run src/views/Ingredients/ai-agent/supplement/steps/compareRows.spec.ts`
Expected: FAIL。

- [ ] **Step 3: 实现表格与推荐区**

顶部一句「按{{ basis.labelZh }}算，每 {{ basis.per }}（{{ basis.unit }}）多少钱」；推荐区显示「选第 N 瓶 + 理由」，理由文字**原样来自后端**，前端不拼数字。点「就买这瓶」→ `emit('chosen', offer)` 并进第 3 步。失败行灰显 + 原因，不提供选择按钮。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd admin-web && npx vitest run src/views/Ingredients/ai-agent/supplement/steps/compareRows.spec.ts`
Expected: PASS（3 条）。

- [ ] **Step 5: 手动验一次真表**

Run: `cd admin-web && npx vue-tsc -b --noEmit`（类型自检）
然后在本地起后端（`PORT=3018 npm run start:dev:miniapp`），用关键词「copper bisglycinate」调一次 `/compare`，确认至少 6 行有单价、耗时 ≤ 90s。把结果附在提交说明里。

- [ ] **Step 6: 提交**

```bash
bash scripts/session.sh commit -m "feat(supplement): 比价表与推荐（第一步界面）"
```

---

### Task 6: 形态建议（引用校验 + 服务）

**Files:**
- Create: `backend/src/domain/ingredient/supplement-form-advice.ts`
- Create: `backend/src/application/ingredient-creation/supplement-form-advice.service.ts`
- Test: `backend/src/domain/ingredient/tests/supplement-form-advice.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface Citation { documentId: string; documentName: string; page: number; quote: string }
  export interface FormOption { level: FormLevel; labelZh: string; examples: string[]; verdict: FormVerdict; reason: string; citations: Citation[] }
  export interface FormAdvice { nutrientKey: string; nutrientLabel: string; options: FormOption[]; recommendedLevel: string | null; recommendationReason: string; gaps: string[] }
  export function enforceCitationRule(advice: FormAdvice, readPages: Set<string>): FormAdvice
  export function pageKey(documentId: string, page: number): string
  ```

- [ ] **Step 1: 写失败的测试**

```ts
it('引用了没读过的页 → 丢弃该引用', () => {})
it('结论是 AVOID 但引用被丢光 → 降级 NO_EVIDENCE，理由加前缀', () => {})
it('推荐档位被降级 → recommendedLevel 变 null', () => {})
it('引用全在读过页 → 原样通过', () => {})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest src/domain/ingredient/tests/supplement-form-advice.spec.ts`
Expected: FAIL。

- [ ] **Step 3: 实现校验（纯函数）**

`pageKey` = `` `${documentId}#${page}` ``。降级时 `reason = '知识库没查到直接依据：' + 原 reason`。`gaps` 里补一条「《文档名》第 N 页没有覆盖该档位」。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && npx jest src/domain/ingredient/tests/supplement-form-advice.spec.ts`
Expected: PASS（4 条）。

- [ ] **Step 5: 实现服务**

`SupplementFormAdviceService.advise({ nutrientKey, nutrientLabel, question? })`：
1. 组 2～3 条查询（`<en> absorption`、`<en> oxide source`、`chelated <en> source`），`kb_find(limit 8)`；
2. 取前 4 页 `kb_read`（`includeImages: false`、`budgetTokens: 6000`），记 `readPages`；
3. 一次 chat 调用，`response_format: json_object`、`temperature: 0.1`、`max_tokens: 1600`，system 里给死 JSON schema 与「只给档位、不给具体盐名的结论，引用必须逐字照抄」；
4. `JSON.parse` 失败 → 抛 `BadRequestException('模型没给出可用的结构，重试一次')`；
5. 过 `enforceCitationRule` 再返回。

- [ ] **Step 6: 提交**

```bash
bash scripts/session.sh commit -m "feat(supplement): 形态建议服务与引用校验"
```

---

### Task 7: 第 1 步界面 + 接口

**Files:**
- Modify: `backend/src/interfaces/controllers/supplement-agent.controller.ts`（加 `form-advice`）
- Create: `admin-web/src/views/Ingredients/ai-agent/supplement/steps/FormAdviceStep.vue`
- Modify: `admin-web/src/api/ingredientCreation.ts`、`SupplementFlow.vue`

**Interfaces:**
- Consumes: Task 6 的 `FormAdvice`。
- Produces: `POST /api/v1/admin/ingredient-supplement-agent/form-advice`；`FormAdviceStep` emit `chosen(level)`。

- [ ] **Step 1: 接口**

入参 `{ nutrientKey, nutrientLabel, question? }`，出参 `FormAdvice`，包 `ApiResponseDto`。

- [ ] **Step 2: 界面**

营养素下拉（取 `supplementNutrientGroups` 里 `common` 的矿物质/维生素/脂肪酸）+ 一句可选补充 → 出表：档位 / 结论徽章 / 理由 / 「出处」展开看原句（文档名 + 第 N 页 + 引号原文）。推荐档位高亮 + 「用这个档位」。`NO_EVIDENCE` 用灰色，写明「证据不足，请你判断」，**不显示推荐按钮**。

- [ ] **Step 3: 自检**

Run: `cd admin-web && npx vitest run src/views/Ingredients/ai-agent/supplement`（跑该目录全部用例）
Expected: 全绿。再 `npx vue-tsc -b --noEmit`。

- [ ] **Step 4: 提交**

```bash
bash scripts/session.sh commit -m "feat(supplement): 形态建议界面（结论 + 出处 + 证据不足）"
```

---

### Task 8: 双图读取（视觉 + 解析）

**Files:**
- Modify: `backend/src/application/ingredient-creation/supplement-label-vision.service.ts`（抽出 `readWithPrompt(imageUrl, prompt)`）
- Create: `backend/src/application/ingredient-creation/supplement-label-intake.service.ts`
- Test: `backend/src/domain/ingredient/tests/supplement-front-extract.spec.ts`
- Create: `backend/src/domain/ingredient/supplement-front-extract.ts`

**Interfaces:**
- Produces:
  ```ts
  export function extractFrontFields(text: string): {
    productName: string | null; brand: string | null; productModel: string | null
    physicalForm: 'CAPSULE' | 'TABLET' | 'POWDER' | 'LIQUID' | null
    unitDisplayLabel: string | null
  }
  // LabelIntakeResult
  { frontText: string; labelText: string; front: ReturnType<typeof extractFrontFields>;
    servingUnitsPerDose: number | null; nutrients: { fieldPath: string; value: number; unit: string; rawName: string }[];
    unrecognized: string[] }
  ```

- [ ] **Step 1: 写失败的测试**（`extractFrontFields`）

```ts
it('SOFTGELS 120 → 剂型 CAPSULE、单位「粒」、规格 120 Softgels', () => {})
it('TABLETS → 剂型 TABLET、单位「片」', () => {})
it('认不出剂型 → 三个字段都 null，不猜', () => {})
```

- [ ] **Step 2: 跑测试确认失败 / 通过**

Run: `cd backend && npx jest src/domain/ingredient/tests/supplement-front-extract.spec.ts`

- [ ] **Step 3: 实现抽取 + 服务**

正面提示词只抄字（品牌/名称/规格/剂型）；标签提示词沿用现有「原样抄 Serving Size 与成分表」。服务把标签文本喂 `parseSupplementLabel` + `extractServingUnits`，**不返回任何档案字段判断**。

- [ ] **Step 4: 接口**

`POST /api/v1/admin/ingredient-supplement-agent/read-label-images`，入参两张图 URL，出参 `LabelIntakeResult`。

- [ ] **Step 5: 提交**

```bash
bash scripts/session.sh commit -m "feat(supplement): 双图读取（只抄字 + 代码映射）"
```

---

### Task 9: 第 3 步界面（图 → 档案 → 门禁 → 写入）

**Files:**
- Create: `admin-web/src/views/Ingredients/ai-agent/supplement/steps/ArchiveStep.vue`
- Modify: `SupplementFlow.vue`、`admin-web/src/api/ingredientCreation.ts`
- Test: 复用现有 `supplementFormState.spec.ts` / `supplementGates.spec.ts`（不改）

**Interfaces:**
- Consumes: Task 8 的 `LabelIntakeResult`、现有 `patchFromPreview`、`evaluateSupplementGates`、`ingredientCreationApi.createSupplement`。
- Produces: 写入成功 → `emit('saved', result)` → 进第 4 步。

- [ ] **Step 1: 双图上传**

两个上传位（正面 / 标签），都走 `ingredientApi.uploadIngredientDiyImage`；传完自动调 `read-label-images`，把结果灌进 `state.archive`（用 `patchFromPreview` 做单位对齐）。

- [ ] **Step 2: 表单**

沿用 `SupplementWorkbench` 右栏三组（基本信息 / 商品与价格 / 待你定）+ 营养组，**采购价与换算倍数默认取第 2 步选中那瓶**。

- [ ] **Step 3: 门禁与写入**

三道门禁原样调用；写入 payload 增加 `evidence.frontImageUrl` 与 `selection`（本 Task 先传空对象，Task 10 接上）。写入后显示「确认可用」，点了才算完成。

- [ ] **Step 4: 自检**

Run: `cd admin-web && npx vitest run src/views/Ingredients/ai-agent/supplement` 与 `npx vue-tsc -b --noEmit`
Expected: 全绿。

- [ ] **Step 5: 提交**

```bash
bash scripts/session.sh commit -m "feat(supplement): 图建档界面（双图 + 核算 + 写入）"
```

---

### Task 10: 证据扩展（migration + 写入带选品快照）

**Files:**
- Modify: `backend/prisma/schema.prisma`（`SupplementLabelEvidence` 加两列）
- Create: `backend/prisma/migrations/<ts>_supplement_evidence_front_image_and_selection/migration.sql`
- Modify: `backend/src/application/ingredient-creation/supplement-ingredient.service.ts`
- Modify: `backend/src/interfaces/dto/ingredient-creation/create-supplement-ingredient.dto.ts`
- Modify: `admin-web/src/types/ingredientCreation.ts`、`ArchiveStep.vue`

**Interfaces:**
- Produces: `CreateSupplementIngredientInput` 增加 `evidence.frontImageUrl?: string`、`selection?: unknown`；`getEvidence` 返回 `frontImageUrl`、`selection`。

- [ ] **Step 1: 改 schema + 生成 migration**

```prisma
frontImageUrl     String? @map("front_image_url") @db.VarChar(500)
selectionSnapshot Json?   @map("selection_snapshot")
```

Run: `cd backend && npx prisma migrate dev --name supplement_evidence_front_image_and_selection`
Expected: migration 生成、`prisma generate` 成功。**生产不跑**，随部署走脚本。

- [ ] **Step 2: 写入与回查**

`create()` 落这两列；`getEvidence()` 带出来。DTO 加字段（`@IsOptional() @IsUrl()` / `@IsObject()`）。

- [ ] **Step 3: 前端传快照**

`ArchiveStep` 写入时把 `{ formAdvice, chosenFormLevel, comparison: 选中那瓶的价与单价, chosenOfferUrl }` 一起提交。

- [ ] **Step 4: 自检**

Run: `cd backend && npx tsc --noEmit && npx jest src/application/ingredient/tests`
Expected: 全绿。

- [ ] **Step 5: 提交**

```bash
bash scripts/session.sh commit -m "feat(supplement): 证据留正面图与选品快照"
```

---

### Task 11: 第 4 步归位 + 清理 + 文档

**Files:**
- Modify: `SupplementFlow.vue`（第 4 步挂 `LaunchConfigStep`）
- Delete: `admin-web/src/views/Ingredients/ai-agent/supplement/SupplementCompare.vue`、`compareCandidates.ts`、`compareCandidates.spec.ts`
- Delete: `backend/src/interfaces/controllers/supplement-chat.controller.ts` 与 `SupplementAgentService`/`supplement-tools`（确认无人引用后）
- Modify: `docs/05_API_Specs.md`、`docs/README.md`（登记新接口与设计书）

- [ ] **Step 1: 第 4 步**

`state.step === 4` 且已有 `saved.ingredientId` 才渲染 `LaunchConfigStep`；四段照旧。

- [ ] **Step 2: 删旧**

先 `grep -rn "SupplementCompare\|compareCandidates\|supplementChat\|SupplementAgentService" admin-web/src backend/src`，确认只剩自身引用再删；删完跑 `npx vitest run`（前端）与 `npx tsc --noEmit`（后端）。

- [ ] **Step 3: 文档**

`05_API_Specs.md` 加三个接口；`README.md` 登记设计书与计划。

- [ ] **Step 4: 整体自检**

Run:
```bash
cd admin-web && npx vitest run && npx vue-tsc -b --noEmit
cd ../backend && npx tsc --noEmit && npx jest src/domain/ingredient/tests src/application/ingredient-creation
```
Expected: 全绿。

- [ ] **Step 5: 提交**

```bash
bash scripts/session.sh commit -m "feat(supplement): 第4步归位，删除人工比价与常驻聊天，补文档"
```
