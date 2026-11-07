# 补剂原料 · 手动建档 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让「AI 添加原料」的补剂线能用：不靠 AI，人把一瓶补剂一项项填进去，过 3 道门禁后写入标准原料 + 营养档案 + 标签证据，再由人点「确认可用」。

**Architecture:** 复用现有 `ingredient-creation` 草稿骨架（`type=SUPPLEMENT`）与 `/nutrition-foods/:id/verify`；新增一个后端建档服务（原料 + 营养档案 PENDING + 主映射 + 标签证据，同一事务）和一个前端对照屏（左证据、右档案）。**本计划不含任何 AI 能力**——那是后续三个阶段的事，见 §"后续阶段"。

**Tech Stack:** Vue 3 + Element Plus + vitest（admin-web）；NestJS + Prisma + jest（backend）。

**Spec:** `docs/superpowers/specs/2026-11-07-supplement-ingredient-ai-flow-design.md`

## Global Constraints

- 基准单位固定 `PCS`，单位展示名取粒 / 片 / 胶囊 / 平勺之一（来自 `admin-web/src/constants/supplementNutrients.ts` 的 `supplementUsageUnitOptions`）。
- 营养基准固定 `PER_SERVING` + 上述单位，含义是"每 1 粒"，**不是**"每份"。
- 每份粒数 N 必须是 ≥ 1 的整数；拿不到就拦。
- 营养档案新建时状态必须是 `PENDING`，只有「确认可用」能翻成 `VERIFIED`。
- 补剂不计入食谱总重量，**不加**「每粒重量」字段。
- 门禁只有 3 道：折算闭合 / 单位闭合 / 成本可算。**查重不是门禁**，只在写入前提醒。
- 界面文案用业务词，不出现 `SUPPLEMENT` / `PER_SERVING` / `PENDING` 这类内部名。
- 不做 AI、不做链接抓取、不做选品、不做目录查名（后续阶段）。

## Review Focus

这些输入规格里提到但没有任何任务的测试直接钉住，最容易被下一阶段踩到，每个都在对应任务里补了断言：

1. 每份粒数填 0 或留空 → 折算门禁必须拦，**不能**静默当 1（Task 1）。
2. 采购价 0 或留空 → 成本门禁必须拦，**不能**算出 ¥0 就算通过（Task 1）。
3. 每粒值 × N 与每份值只差浮点尾数 → 按显示精度判相等，不能误杀（Task 1）。
4. 标签上没写的营养素 → 留空，**不写 0**（Task 2）。
5. 同一份草稿提交两次 → 不建第二套原料与档案（幂等，Task 2）。

---

## 后续阶段（本计划之外）

| 阶段 | 做什么 | 依赖 |
|---|---|---|
| 二 | 贴链接自动填：电商抓取通道 + 读标签 + 预填表单 | 本计划 |
| 三 | 选品屏：候选检索 + 四列比较 + 《补剂选品判断规则》skill | 二 |
| 四 | 目录命名：《饲料添加剂品种目录》入库 + 查规范名 + 查不到标红 | 本计划 |

---

### Task 1: 折算与门禁（纯函数）

**Files:**
- Create: `admin-web/src/views/Ingredients/ai-agent/supplement/supplementGates.ts`
- Test: `admin-web/src/views/Ingredients/ai-agent/supplement/supplementGates.spec.ts`

**Interfaces:**
- Produces:
  - `type SupplementGateKey = 'CONVERSION' | 'UNIT' | 'COST'`
  - `interface SupplementGateInput { servingUnitsPerDose: number | null; servingNutrients: Record<string, number>; perUnitNutrients: Record<string, number>; baseUnit: 'G' | 'ML' | 'PCS'; purchasePricePerPurchaseUnit: number | null; purchaseToBaseRatio: number | null }`
  - `interface SupplementGateItem { key: SupplementGateKey; label: string; passed: boolean; detail: string; anchor: 'servingUnitsPerDose' | 'baseUnit' | 'purchasePricePerPurchaseUnit' }`
  - `interface SupplementGateReport { passed: boolean; items: SupplementGateItem[] }`
  - `function convertPerUnit(servingValue: number, servingUnitsPerDose: number): number | null`
  - `function evaluateSupplementGates(input: SupplementGateInput): SupplementGateReport`

- [ ] **Step 1: 写失败的测试**

```ts
const base = {
  servingUnitsPerDose: 2,
  servingNutrients: { epa: 650, dha: 450 },
  perUnitNutrients: { epa: 325, dha: 225 },
  baseUnit: 'PCS' as const,
  purchasePricePerPurchaseUnit: 398,
  purchaseToBaseRatio: 120,
}

it('每份 2 粒折成每粒：650 → 325', () => {
  expect(convertPerUnit(650, 2)).toBe(325)
})

it('每份粒数为 0 时不折算，返回 null', () => {
  expect(convertPerUnit(650, 0)).toBeNull()
})

it('N 与每粒值对得上时折算门通过', () => {
  const report = evaluateSupplementGates(base)
  expect(report.items.find((i) => i.key === 'CONVERSION')?.passed).toBe(true)
  expect(report.passed).toBe(true)
})

it('每粒值与 N 对不上（325 改成 320）时折算门拦死，detail 指出差多少', () => {
  const report = evaluateSupplementGates({
    ...base,
    perUnitNutrients: { epa: 320, dha: 225 },
  })
  const gate = report.items.find((i) => i.key === 'CONVERSION')!
  expect(gate.passed).toBe(false)
  expect(gate.detail).toContain('epa')
  expect(report.passed).toBe(false)
})

it('浮点尾数不误杀：325.0000001 × 2 视为通过', () => {
  const report = evaluateSupplementGates({
    ...base,
    perUnitNutrients: { epa: 325.0000001, dha: 225 },
  })
  expect(report.items.find((i) => i.key === 'CONVERSION')?.passed).toBe(true)
})

it('每份粒数为 0 时单位门也拦死', () => {
  const report = evaluateSupplementGates({ ...base, servingUnitsPerDose: 0 })
  expect(report.items.find((i) => i.key === 'UNIT')?.passed).toBe(false)
})

it('采购价 0 或留空时成本门拦死', () => {
  for (const price of [0, null]) {
    const report = evaluateSupplementGates({ ...base, purchasePricePerPurchaseUnit: price })
    const gate = report.items.find((i) => i.key === 'COST')!
    expect(gate.passed).toBe(false)
    expect(gate.anchor).toBe('purchasePricePerPurchaseUnit')
  }
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd admin-web && npx vitest run src/views/Ingredients/ai-agent/supplement/supplementGates.spec.ts`
Expected: FAIL —— 模块不存在

- [ ] **Step 3: 实现**

`convertPerUnit`：N 不是 ≥1 的整数时返回 `null`，否则 `servingValue / N`。
`evaluateSupplementGates`：返回固定顺序的三项。折算闭合按**显示精度**比较（两边 `toFixed(4)` 后相等，容差就是 0.0001），不一致时 `detail` 列出对不上的字段名（小写，逗号分隔）。单位闭合判 `servingUnitsPerDose` 是 ≥1 的整数且 `baseUnit === 'PCS'`。成本判 `purchasePricePerPurchaseUnit > 0 && purchaseToBaseRatio > 0`。`passed` = 三项全通过。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd admin-web && npx vitest run src/views/Ingredients/ai-agent/supplement/supplementGates.spec.ts`
Expected: PASS（7 个用例）

- [ ] **Step 5: 提交**

```bash
cd admin-web && git add src/views/Ingredients/ai-agent/supplement/supplementGates.ts src/views/Ingredients/ai-agent/supplement/supplementGates.spec.ts
git commit -m "feat(ingredient): 补剂三道门禁（折算/单位/成本）"
```

---

### Task 2: 后端补剂建档服务（含标签证据表）

**Files:**
- Modify: `backend/prisma/schema.prisma`（新增 `SupplementLabelEvidence` 模型）
- Create: `backend/prisma/migrations/<时间戳>_supplement_label_evidence/migration.sql`（用 `npx prisma migrate dev --name supplement_label_evidence` 生成）
- Create: `backend/src/application/ingredient-creation/supplement-ingredient.service.ts`
- Test: `backend/src/application/ingredient-creation/supplement-ingredient.service.spec.ts`

**Interfaces:**
- Consumes: `PrismaService`；`normalizeNutritionProfile` 与 `withConfirmationMeta`（`backend/src/domain/recipe-designer/nutrition-profile-reader.ts`）
- Produces:
  - `interface CreateSupplementIngredientInput { name: string; brand?: string | null; productModel?: string | null; purchaseChannel?: string | null; unitDisplayLabel: string; physicalForm: 'POWDER' | 'TABLET' | 'CAPSULE' | 'LIQUID'; purchaseUnit: string; purchaseToBaseRatio: number; currentPricePerPurchaseUnit: number; addTiming: string; productionLossRate: number; diyEnabled: boolean; procurementEnabled: boolean; labelCategory: 'FEED_MATERIAL' | 'FEED_ADDITIVE' | null; labelNames: string[]; labelNameSource: string | null; tagNames: string[]; servingUnitsPerDose: number; perUnitNutrients: Record<string, number>; evidence: { productUrl?: string | null; labelImageUrl?: string | null; labelText?: string | null }; createdBy: string }`
  - `interface CreateSupplementIngredientResult { ingredientId: string; nutritionFoodId: string; nutritionFoodStatus: 'PENDING'; evidenceId: string }`
  - `class SupplementIngredientService { create(input: CreateSupplementIngredientInput): Promise<CreateSupplementIngredientResult> }`

**Prisma 模型（照抄，别改字段名）：**

```prisma
/// 补剂商品标签证据：入库前就要留下，商品下架后还能回查当时那瓶
model SupplementLabelEvidence {
  id                 String   @id @default(uuid())
  ingredientId       String?  @map("ingredient_id")
  nutritionFoodId    String?  @map("nutrition_food_id")
  productUrl         String?  @map("product_url") @db.VarChar(500)
  productName        String?  @map("product_name") @db.VarChar(200)
  servingUnitsPerDose Int     @map("serving_units_per_dose")
  labelImageUrl      String?  @map("label_image_url") @db.VarChar(500)
  labelText          String?  @map("label_text")
  conversionSnapshot Json     @map("conversion_snapshot")
  createdBy          String   @map("created_by")
  createdAt          DateTime @default(now()) @map("created_at")

  @@index([ingredientId])
  @@index([nutritionFoodId])
  @@map("supplement_label_evidence")
}
```

- [ ] **Step 1: 写失败的测试**

测试里 mock 一个 `PrismaService`，断言 `create` 在一个 `$transaction` 里被调用三次（ingredient / nutritionFood / mapping）并写一条 evidence。关键断言：

```ts
it('营养档案建成 PENDING，不能是 VERIFIED', async () => {
  const result = await service.create(input)
  expect(result.nutritionFoodStatus).toBe('PENDING')
  const created = prisma.nutritionFood.create.mock.calls[0][0].data
  expect(created.status).toBe('PENDING')
  expect(created.category).toBe('SUPPLEMENT')
})

it('映射建成立即为主档案', async () => {
  await service.create(input)
  expect(prisma.nutritionFoodMapping.create.mock.calls[0][0].data.isPrimary).toBe(true)
})

it('标签上没写的营养素不写进档案（不补 0）', async () => {
  await service.create({ ...input, perUnitNutrients: { epa: 325 } })
  const data = prisma.nutritionFood.create.mock.calls[0][0].data.nutritionData
  expect(JSON.stringify(data)).not.toContain('dha')
})

it('同一份草稿提交两次不建第二套', async () => {
  await service.create(input)
  await expect(service.create(input)).rejects.toThrow(/已经提交过/)
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest src/application/ingredient-creation/supplement-ingredient.service.spec.ts`
Expected: FAIL —— 模块不存在

- [ ] **Step 3: 生成 migration 并实现服务**

先 `cd backend && npx prisma migrate dev --name supplement_label_evidence`，再实现 `create()`：
事务内依次 ① 建 `Ingredient`（`type: SUPPLEMENT`，`baseUnit: 'PCS'`，`properties` 写 `{ category_type: 'OTHER', display_unit, serving_unit_label, active_nutrients: Object.keys(perUnitNutrients) }`）；② 用 `normalizeNutritionProfile` + `withConfirmationMeta` 组出"每 1 粒"档案，建 `NutritionFood`（`status: PENDING`、`category: SUPPLEMENT`、`dataSource: 'MANUAL'`）；③ 建 `NutritionFoodMapping`（`isPrimary: true`）；④ 写 `SupplementLabelEvidence`（`conversionSnapshot` 存 `{ servingUnitsPerDose, perUnitNutrients, unitDisplayLabel }`）。幂等：按 `ingredientId` 查已有 evidence，命中即抛 `ConflictException('这份补剂已经提交过了')`。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && npx jest src/application/ingredient-creation/supplement-ingredient.service.spec.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
cd backend && git add prisma/schema.prisma prisma/migrations src/application/ingredient-creation/supplement-ingredient.service.ts src/application/ingredient-creation/supplement-ingredient.service.spec.ts
git commit -m "feat(ingredient): 补剂建档服务（原料+待验证档案+主映射+标签证据）"
```

---

### Task 3: 建档接口

**Files:**
- Modify: `backend/src/interfaces/controllers/ingredient-creation.controller.ts`（新增路由）
- Create: `backend/src/interfaces/dto/ingredient-creation/create-supplement-ingredient.dto.ts`
- Modify: `backend/src/application/ingredient-creation/ingredient-creation.module.ts`（注册服务）
- Test: `backend/src/interfaces/controllers/ingredient-creation.supplement.spec.ts`

**Interfaces:**
- Consumes: Task 2 的 `SupplementIngredientService.create()`
- Produces: `POST /api/v1/admin/ingredient-creation/supplements` → `{ code: 0, data: CreateSupplementIngredientResult }`

- [ ] **Step 1: 写失败的测试**

```ts
it('POST supplements 返回原料、档案、证据三个 id，档案是待验证', async () => {
  const res = await request(app.getHttpServer())
    .post('/admin/ingredient-creation/supplements')
    .send(validBody)
    .expect(201)
  expect(res.body.data.nutritionFoodStatus).toBe('PENDING')
  expect(res.body.data.evidenceId).toBeTruthy()
})

it('每份粒数缺失时 400，提示指向该字段', async () => {
  const res = await request(app.getHttpServer())
    .post('/admin/ingredient-creation/supplements')
    .send({ ...validBody, servingUnitsPerDose: undefined })
    .expect(400)
  expect(JSON.stringify(res.body)).toContain('servingUnitsPerDose')
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest src/interfaces/controllers/ingredient-creation.supplement.spec.ts`
Expected: FAIL —— 404

- [ ] **Step 3: 实现 DTO 与路由**

DTO 用 class-validator：`servingUnitsPerDose` 是 `@IsInt() @Min(1)`；`perUnitNutrients` 是 `@IsObject()` 且值 `@IsNumber() @Min(0)`；`unitDisplayLabel` 用 `@IsIn(SUPPLEMENT_UNIT_LABELS)`，该常量在 DTO 文件里就地定义，值照抄前端 `supplementUsageUnitOptions` 的 7 项：`['g','ml','粒','片','胶囊','平勺','份']`。路由挂 `@UseGuards(AdminGuard)`，`createdBy` 取 `@CurrentUser().userId`。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && npx jest src/interfaces/controllers/ingredient-creation.supplement.spec.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
cd backend && git add src/interfaces src/application/ingredient-creation/ingredient-creation.module.ts
git commit -m "feat(ingredient): 补剂建档接口"
```

---

### Task 4: 字段目录 + 对照屏骨架

**Files:**
- Create: `admin-web/src/constants/supplementCardFields.ts`
- Test: `admin-web/src/constants/supplementCardFields.spec.ts`
- Create: `admin-web/src/views/Ingredients/ai-agent/supplement/SupplementWorkbench.vue`
- Test: `admin-web/src/views/Ingredients/ai-agent/supplement/SupplementWorkbench.spec.ts`
- Modify: `admin-web/src/api/ingredientCreation.ts`、`admin-web/src/types/ingredientCreation.ts`

**Interfaces:**
- Produces:
  - `interface SupplementCardField { key: string; label: string; group: 'BASIC' | 'PRODUCT' | 'PURCHASE' | 'LABEL'; owner: 'AI' | 'HUMAN' | 'DEFAULT'; required: boolean }`
  - `const SUPPLEMENT_CARD_FIELDS: SupplementCardField[]`
  - `const SUPPLEMENT_HUMAN_FIELD_KEYS: string[]`（值必须是 `['tagNames', 'addTiming']`——标签分类走原料标签多选，添加时机走枚举）
  - `ingredientCreationApi.createSupplement(payload: CreateSupplementIngredientPayload): Promise<CreateSupplementIngredientResultDto>`
- Consumes: Task 3 的接口

- [ ] **Step 1: 写失败的测试**

```ts
it('字段目录里"标签分类"和"添加时机"归人，其余归 AI 或默认', () => {
  const human = SUPPLEMENT_CARD_FIELDS.filter((f) => f.owner === 'HUMAN').map((f) => f.key)
  expect(human.sort()).toEqual(['addTiming', 'tagNames'])
})

it('每个字段的 key 不重复', () => {
  const keys = SUPPLEMENT_CARD_FIELDS.map((f) => f.key)
  expect(new Set(keys).size).toBe(keys.length)
})
```

组件测试（只测渲染，不测保存）：

```ts
it('渲染右侧档案时，待你定的两项永远展开，其余收起', async () => {
  const wrapper = mount(SupplementWorkbench, { props: { draft: emptySupplementDraft() } })
  expect(wrapper.text()).toContain('待你定')
  expect(wrapper.findAll('[data-folded-group]')).toHaveLength(2)
})

it('左栏空态有"手动录入"提示，不是空白', () => {
  const wrapper = mount(SupplementWorkbench, { props: { draft: emptySupplementDraft() } })
  expect(wrapper.text()).toContain('没有链接也能填')
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd admin-web && npx vitest run src/constants/supplementCardFields.spec.ts src/views/Ingredients/ai-agent/supplement/SupplementWorkbench.spec.ts`
Expected: FAIL

- [ ] **Step 3: 实现常量、组件与 API**

`SupplementWorkbench.vue`：`<div class="supplement-workbench">` 两栏 —— 左 `SupplementEvidencePanel`（本任务只做只读空态 + 上传图片入口的位置）、右 `SupplementArchiveForm`（本任务只渲染，字段来自 `SUPPLEMENT_CARD_FIELDS`，分组折叠；`owner === 'HUMAN'` 的两项展开并标黄）。`createSupplement` 只是 `api.post('/admin/ingredient-creation/supplements', payload)`。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd admin-web && npx vitest run src/constants/supplementCardFields.spec.ts src/views/Ingredients/ai-agent/supplement/SupplementWorkbench.spec.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
cd admin-web && git add src/constants/supplementCardFields.ts src/constants/supplementCardFields.spec.ts src/views/Ingredients/ai-agent/supplement src/api/ingredientCreation.ts src/types/ingredientCreation.ts
git commit -m "feat(ingredient): 补剂对照屏骨架与字段目录"
```

---

### Task 5: 门禁联动与保存

**Files:**
- Modify: `admin-web/src/views/Ingredients/ai-agent/supplement/SupplementWorkbench.vue`
- Modify: `admin-web/src/views/Ingredients/ai-agent/supplement/SupplementArchiveForm.vue`
- Test: `admin-web/src/views/Ingredients/ai-agent/supplement/SupplementArchiveForm.spec.ts`

**Interfaces:**
- Consumes: Task 1 的 `evaluateSupplementGates`；Task 4 的 `ingredientCreationApi.createSupplement`
- Produces: `emit('saved', { ingredientId, nutritionFoodId, evidenceId })`

- [ ] **Step 1: 写失败的测试**

```ts
it('门禁没过时"核验并写入"按钮禁用', async () => {
  const wrapper = mount(SupplementArchiveForm, { props: { initial: draftWith({ servingUnitsPerDose: 0 }) } })
  expect(wrapper.get('[data-action="submit"]').attributes('disabled')).toBeDefined()
})

it('门禁全过但标签分类没选时按钮仍禁用，并提示只剩哪一项', async () => {
  const wrapper = mount(SupplementArchiveForm, { props: { initial: draftWith({ tagNames: [] }) } })
  expect(wrapper.get('[data-action="submit"]').attributes('disabled')).toBeDefined()
  expect(wrapper.text()).toContain('标签分类')
})

it('粘了标签原文就随保存一起提交', async () => {
  const wrapper = mount(SupplementArchiveForm, { props: { initial: completeDraft() } })
  await wrapper.get('[data-evidence="labelText"]').setValue('Serving Size 2 Softgels')
  await wrapper.get('[data-action="submit"]').trigger('click')
  await flushPromises()
  expect(createSupplement).toHaveBeenCalledWith(
    expect.objectContaining({ evidence: expect.objectContaining({ labelText: 'Serving Size 2 Softgels' }) }),
  )
})

it('保存成功后抛出 saved，并带上三个 id', async () => {
  const wrapper = mount(SupplementArchiveForm, { props: { initial: completeDraft() } })
  await wrapper.get('[data-action="submit"]').trigger('click')
  await flushPromises()
  expect(wrapper.emitted('saved')![0][0]).toEqual({
    ingredientId: 'i1', nutritionFoodId: 'n1', evidenceId: 'e1',
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd admin-web && npx vitest run src/views/Ingredients/ai-agent/supplement/SupplementArchiveForm.spec.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

左栏补两个证据入口（手动录入时唯一的证据来源）：「上传标签图片」把文件传上去拿 URL，写进 `evidence.labelImageUrl`；「粘贴标签原文」是个 textarea，写进 `evidence.labelText`。两者都可空——空着也能存，但写入后回查时只有右栏的数字，界面上要如实显示"没有留存标签"。

表单值变化 → `evaluateSupplementGates` 重算；门禁条显示三项，点任一项滚动到 `anchor` 对应输入框。写入按钮禁用条件 = `!report.passed || 人定项有空`。点写入 → `createSupplement` → 成功后 `emit('saved')`，失败把后端原文放到门禁条上方（不弹窗）。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd admin-web && npx vitest run src/views/Ingredients/ai-agent/supplement/SupplementArchiveForm.spec.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
cd admin-web && git add src/views/Ingredients/ai-agent/supplement
git commit -m "feat(ingredient): 补剂对照屏门禁联动与写入"
```

---

### Task 6: 线路放行与页面接线

**Files:**
- Modify: `admin-web/src/views/Ingredients/ai-agent/index.vue:57-70`（把「补剂线还没开放」卡片换成 `<SupplementWorkbench />`）
- Modify: `admin-web/src/views/Ingredients/ai-agent/lineEntry.ts`（`SUPPLEMENT` 不再被拒）
- Test: `admin-web/src/views/Ingredients/ai-agent/lineEntry.spec.ts`、`aiAgentLineGate.regression.spec.ts`

**Interfaces:**
- Consumes: Task 5 的 `SupplementWorkbench`
- Produces: 无新接口；`resolveLineEntry({ userPick: 'SUPPLEMENT' }).line === 'SUPPLEMENT'` 且 `rejected === false`

- [ ] **Step 1: 写失败的测试**

```ts
it('选补剂时不再被拒，线路是 SUPPLEMENT', () => {
  const decision = resolveLineEntry({ userPick: 'SUPPLEMENT' })
  expect(decision.line).toBe('SUPPLEMENT')
  expect(decision.rejected).toBe(false)
})

it('包装仍然被拒（回归）', () => {
  expect(resolveLineEntry({ draftType: 'PACKAGING' }).rejected).toBe(true)
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd admin-web && npx vitest run src/views/Ingredients/ai-agent/lineEntry.spec.ts src/views/Ingredients/aiAgentLineGate.regression.spec.ts`
Expected: 新增用例 FAIL，其余 PASS

- [ ] **Step 3: 实现**

`index.vue` 的 `v-else-if="line === 'SUPPLEMENT'"` 分支改成渲染工作台；删掉"改回食材"的强制回转，保留「换线路」。`lineEntry.ts` 只改注释与测试，逻辑本身已支持 `SUPPLEMENT`——若测试显示它本来就放行，则本步骤只删 `index.vue` 里的拦截渲染。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd admin-web && npx vitest run src/views/Ingredients/ai-agent/lineEntry.spec.ts src/views/Ingredients/aiAgentLineGate.regression.spec.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
cd admin-web && git add src/views/Ingredients/ai-agent/index.vue src/views/Ingredients/ai-agent/lineEntry.ts src/views/Ingredients/ai-agent/lineEntry.spec.ts
git commit -m "feat(ingredient): 补剂线放行并接入对照屏"
```

---

### Task 7: 确认可用与端到端验收

**Files:**
- Modify: `admin-web/src/views/Ingredients/ai-agent/supplement/SupplementWorkbench.vue`
- Modify: `admin-web/src/api/ingredients.ts`（若无现成方法，加 `verifyNutritionFood(id)` → `PATCH /nutrition-foods/:id/verify`）
- Test: `admin-web/src/views/Ingredients/ai-agent/supplement/SupplementWorkbench.spec.ts`

**Interfaces:**
- Consumes: `/nutrition-foods/:id/verify`（`backend/src/application/nutrition-food/nutrition-food.service.ts:365`）
- Produces: 无

- [ ] **Step 1: 写失败的测试**

```ts
it('写入成功后才出现"确认可用"，点了才翻成已确认', async () => {
  const wrapper = mount(SupplementWorkbench)
  expect(wrapper.find('[data-action="confirm"]').exists()).toBe(false)
  await emitSaved(wrapper, { ingredientId: 'i1', nutritionFoodId: 'n1', evidenceId: 'e1' })
  expect(wrapper.find('[data-action="confirm"]').exists()).toBe(true)
  await wrapper.get('[data-action="confirm"]').trigger('click')
  await flushPromises()
  expect(verifyNutritionFood).toHaveBeenCalledWith('n1')
  expect(wrapper.text()).toContain('配方里现在能选到')
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd admin-web && npx vitest run src/views/Ingredients/ai-agent/supplement/SupplementWorkbench.spec.ts`
Expected: 新用例 FAIL

- [ ] **Step 3: 实现确认按钮**

写入成功后在右栏顶部出现「确认可用」；点击调 verify；成功后文案改为"已确认，配方里现在能选到这条补剂"，失败用后端原文。

- [ ] **Step 4: 跑测试确认通过 + 全量回归**

Run: `cd admin-web && npx vitest run` 和 `cd admin-web && npm run build`
Expected: 全绿、构建通过

- [ ] **Step 5: 手工验收（本地起后端）**

按顺序走一遍并记录：① 进「AI 添加原料」选补剂 → ② 填一瓶「每份 2 粒」的补剂 → ③ 故意把每粒值填错，确认折算门拦死 → ④ 改对，写入 → ⑤ 看状态是"待验证"、配方里选不到 → ⑥ 点「确认可用」→ ⑦ 配方里能选到。
后端启动用 `cd backend && npm run start:dev:miniapp`（不要跑 `npm run build`，会弄死 dev 进程）。

- [ ] **Step 6: 提交**

```bash
cd admin-web && git add src/views/Ingredients/ai-agent/supplement src/api/ingredients.ts
git commit -m "feat(ingredient): 补剂写入后确认可用"
```
