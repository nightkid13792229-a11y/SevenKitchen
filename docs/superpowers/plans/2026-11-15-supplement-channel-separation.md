# 补剂三口径拆分实施计划（一期 / 二期 / 三期）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把「补剂候选」一份数据同时承担生产、预分装、DIY 推荐三件事的现状拆开：制作单只显示参考产品，DIY 推荐走外链商品，预分装走自己的商品池并在下单页换款。

**Architecture:** 新增 `SupplementPlanService` 作为唯一解析口（参考产品 + 预分装池 + 推荐商品），新接口 `GET /recipes/:id/supplement-plan` 替换旧候选接口；下单校验改按预分装池；前端两页按新结构渲染，旧接口保留一个版本周期做兼容。后台只加口径展示与生产门禁，不改表结构。

**Tech Stack:** NestJS + Prisma + Jest（后端）、uni-app + Vue 3 + Vitest（小程序）、Vue 3 + Element Plus + Vitest（后台）。

**Spec:** `docs/superpowers/specs/2026-11-15-supplement-channel-separation-design.md`

## Global Constraints

- **不改数据库表结构**：一期、二期都不加字段、不跑 migration。需要新字段的「预分装默认指定」留到观察期后再说。
- **不动生产排产、扣料、成本结算**：本计划只读生产数据，不写。
- **价格只从报价接口出**：`supplement-plan` 响应里不得出现单价/成本。
- **文案固定**：`仅生产，不单独出售`、`可分装`、`暂不可购买`、`查看商品 〉`、`换一个`。
- **开关默认关闭**：`equivalenceEnabled` 由上线动作人工打开，代码里不改默认值。
- **旧接口保留**：`GET /recipes/:id/supplement-candidates` 在一个小程序版本周期内继续可用。
- **每个任务结束必须提交**：在任务工位里 `bash scripts/session.sh commit -m "..."`，不要在主工作区提交。
- **测试命令**：后端 `cd backend && npx jest --runTestsByPath <path>`；小程序 `cd miniapp && npx vitest run <path>`；后台 `cd admin-web && npx vitest run <path>`。
- **后端自检只跑 `npx tsc --noEmit`**，联调期间不要 `npm run build`（会删 dist 把本地后端弄死）。

## Review Focus

1. **参考产品没有等价组、或档案缺浓度** → 这一行仍要正常显示（用量可为空），`repackPool` 为空，页面落到「仅生产」，不能 500。
2. **组里唯一可售的就是参考产品，而它已下架** → 必须是「仅生产，不单独出售」，不能显示成「暂不可购买」（后者只用于“有可售品但算不出”）。
3. **旧版小程序提交的下单行**（沿用旧候选的 `ingredientId`）→ 只要命中新池子就放行，不能因为协议变了把在线订单打死。
4. **制作单冻结的版本比食谱最新版旧** → 必须按冻结版解析，返回的 `recipeVersion` 与冻结版一致，不能悄悄用最新版。
5. **顾客草稿里选的产品后来被下架** → 提交时明确拒绝并提示刷新，不能静默换成别的产品。

---

# 一期：客户两页 + 接口

## Task 1: 预分装池解析（后端纯逻辑）

**Files:**
- Create: `backend/src/application/supplement-shop/supplement-plan.service.ts`
- Test: `backend/tests/application/supplement-shop/supplement-plan.service.spec.ts`

**Interfaces:**
- Consumes: `SupplementDosageService.computeDosage({ ingredient, targets, totalWeightG })`（现有）、`isSupplementUnitOneToOne(displayUnit, baseUnit)`（现有）。
- Produces:
  - `type SupplementRepackOption = { ingredientId: string; name: string; brand: string | null; productModel: string | null; displayUnit: string; unit: string; amount: number | null; available: boolean; unavailableReason: string | null; isDefault: boolean }`
  - `buildRepackPool(input: { reference: any; group: any; legacyAlternatives?: any[]; equivalenceEnabled: boolean; targets: SupplementTargetInput[]; totalWeightG: number }): SupplementRepackOption[]`
  - `pickRepackOption(pool: SupplementRepackOption[], ingredientId: string): SupplementRepackOption | null`
  - `computeReference(ingredient: any, targets: SupplementTargetInput[], totalWeightG: number): { ingredientId: string; name: string; brand: string | null; productModel: string | null; displayUnit: string; amount: number | null; unit: string; status: string; targets: SupplementTargetInput[] }`

- [ ] **Step 1: 写失败测试**

```ts
// 组：海藻粉(参考,未上架) / 海带粉胶囊(上架) / 碘钾片(上架)
it('跨产品开启时，池子只含已上架的组员，默认取第一个可用的', () => {
  const pool = service.buildRepackPool({
    reference: kelpPowder,            // supplementRetailEnabled: false
    group: iodineGroup,               // 含 kelpPowder、kelpCapsule、iodineK
    equivalenceEnabled: true,
    targets: [{ fieldPath: 'minerals.iodine', unit: 'μg', targetValuePerKg: 624.13 }],
    totalWeightG: 1232,
  });
  expect(pool.map((o) => o.ingredientId)).toEqual(['kelp-capsule', 'iodine-k']);
  expect(pool[0]).toMatchObject({ isDefault: true, available: true });
  expect(pool[0].amount).toBeCloseTo(2.37, 2);
});

it('跨产品关闭时只保留参考产品与食谱级旧备选', () => {
  const pool = service.buildRepackPool({
    reference: kelpPowder, group: iodineGroup, legacyAlternatives: [kelpCapsule],
    equivalenceEnabled: false, targets, totalWeightG: 1232,
  });
  expect(pool.map((o) => o.ingredientId)).toEqual(['kelp-capsule']);
});

it('没有已上架产品时返回空池', () => {
  const pool = service.buildRepackPool({ reference: kelpPowder, group: null, equivalenceEnabled: true, targets, totalWeightG: 1232 });
  expect(pool).toEqual([]);
});

it('有可售品但单位不能 1:1 时，标记 available=false 并保留在池里', () => {
  const pool = service.buildRepackPool({ reference: kelpPowder, group: badUnitGroup, equivalenceEnabled: true, targets, totalWeightG: 1232 });
  expect(pool[0]).toMatchObject({ available: false, unavailableReason: expect.stringContaining('1:1') });
});

it('参考产品没有碘浓度时，仍然返回参考行，只是用量为空', () => {
  const pool = service.buildRepackPool({ reference: noIodine, group: null, equivalenceEnabled: true, targets, totalWeightG: 1232 });
  expect(pool).toEqual([]);
  expect(service.computeReference(noIodine, targets, 1232)).toMatchObject({ amount: null, status: 'MISSING_CONCENTRATION' });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest --runTestsByPath tests/application/supplement-shop/supplement-plan.service.spec.ts`
Expected: FAIL，`buildRepackPool is not a function`。

- [ ] **Step 3: 实现**

规则（与 spec 第四节一致）：
1. 候选成员：`equivalenceEnabled && group?.status === 'APPROVED' && group.isActive !== false && group.ingredients.length >= 2` → 组员；否则 `[reference, ...legacyAlternatives]`。
2. 只保留 `type === 'SUPPLEMENT' && supplementRetailEnabled === true` 的成员（**不再看 `diyEnabled`**）。
3. 每个成员用 `computeDosage` 算量；`physicalForm === 'LIQUID'`、单位不能 1:1、`dosage.status !== 'OK'`、`amount <= 0` 都记为 `available:false` + 具体原因。
4. 排序：可用在前；同组按 `equivalencePriority` 升序，再按 `name.localeCompare`。
5. 第一个可用的 `isDefault = true`；若一个都不可用，第一个 `isDefault = true`（池子非空、页面显示「暂不可购买」）。

- [ ] **Step 4: 跑测试确认通过**

Run: 同 Step 2。Expected: PASS。

- [ ] **Step 5: 提交**

```bash
bash scripts/session.sh commit -m "feat(supplement): 预分装池解析（组∩上架，含不可用原因）"
```

---

## Task 2: 新接口 `GET /recipes/:id/supplement-plan`

**Files:**
- Modify: `backend/src/application/supplement-shop/supplement-plan.service.ts`
- Modify: `backend/src/interfaces/controllers/recipes.controller.ts`（在 `getSupplementCandidates` 之后加路由）
- Test: `backend/tests/application/supplement-shop/supplement-plan.service.spec.ts`

**Interfaces:**
- Consumes: Task 1 的 `buildRepackPool`。
- Produces: `resolveForRecipeRequest(input: { recipeId: string; recipeVersion: number; totalWeightG: number; diySheetId?: string; userId?: string }): Promise<SupplementPlanResponse>`，其中
  - `SupplementPlanResponse = { totalWeightG: number; weightSource: 'DIY_SHEET' | 'QUERY'; recipeVersion: number; items: SupplementPlanItem[] }`
  - `SupplementPlanItem = { recipeItemId; sourceIngredientId; name; preparationMethod; addTimingLabel; sortOrder; reference: { ingredientId; name; brand; productModel; displayUnit; amount; unit; status; targets }; recommendedProducts: Array<{ id; name; brand; productModel; purchaseChannel; purchaseLink; imageUrl; displayUnit }>; repackPool: SupplementRepackOption[] }`

- [ ] **Step 1: 写失败测试**

```ts
it('带制作单时按制作单冻结的版本解析，并回传同一个版本号', async () => {
  const plan = await service.resolveForRecipeRequest({
    recipeId: 'recipe-1', recipeVersion: 6, totalWeightG: 1232, diySheetId: 'sheet-1', userId: 'u1',
  });
  expect(plan.recipeVersion).toBe(6);
  expect(prisma.recipe.findUnique).toHaveBeenCalledWith(expect.objectContaining({
    where: { recipeId_version: { recipeId: 'recipe-1', version: 6 } },
  }));
});

it('推荐商品按参考产品批量取，且只回传启用项', async () => {
  const plan = await service.resolveForRecipeRequest({ recipeId: 'recipe-1', recipeVersion: 6, totalWeightG: 1232 });
  expect(plan.items[0].recommendedProducts.map((r) => r.id)).toEqual(['rp-1']);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest --runTestsByPath tests/application/supplement-shop/supplement-plan.service.spec.ts`
Expected: FAIL，`resolveForRecipeRequest is not a function`。

- [ ] **Step 3: 实现**

- 查 `recipe`（`recipeId_version`）含 `items.ingredient`、`items.supplementAlternatives.alternativeIngredient`，按 `sortOrder`。
- 只处理 `ingredient.type === 'SUPPLEMENT'` 的行。
- 每个补剂行：`reference` 用 `computeDosage`（不看任何开关）；`recommendedProducts` 用 `RecommendedProductService.batchFindActive([reference.ingredientId])` 取该原料的启用商品；`repackPool` 用 Task 1。
- 控制器新路由：`@Get(':id/supplement-plan')`，参数 `totalWeightG / diySheetId / orderId / shareToken`，先用 `getAccessibleRecipe` 做访问校验，再用 `diySheetId` 读 `dIYSheet.recipeVersion`（属主校验同现有代码），最后调 `resolveForRecipeRequest`。
- 旧 `getSupplementCandidates` 不动。

- [ ] **Step 4: 跑测试 + 类型检查**

Run: `cd backend && npx jest --runTestsByPath tests/application/supplement-shop/supplement-plan.service.spec.ts && npx tsc --noEmit`
Expected: PASS，无类型错误。

- [ ] **Step 5: 提交**

```bash
bash scripts/session.sh commit -m "feat(supplement): 新增 supplement-plan 接口（按制作单版本解析）"
```

---

## Task 3: 下单校验改按预分装池

**Files:**
- Modify: `backend/src/application/supplement-shop/supplement-order.service.ts`（`resolveServerDosageLines`，约 2100-2200 行）
- Modify: `backend/src/app.module.ts`（注册 `SupplementPlanService`）
- Test: `backend/tests/application/supplement-shop/supplement-order.service.spec.ts`（扩展现有 describe）

**Interfaces:**
- Consumes: `SupplementPlanService.resolveForRecipeRequest` + `pickRepackOption`。
- Produces: 下单行只接受 `item.repackPool` 中 `available === true` 的 `ingredientId`；用量取该 option 的 `amount`。

- [ ] **Step 1: 写失败测试**

```ts
it('下单行命中预分装池时按池里的用量通过', async () => {
  const result = await service.resolveServerDosageLines(
    { diySheetId: 'sheet-1', lines: [{ recipeItemId: 'item-1', ingredientId: 'kelp-capsule' }] } as any,
    'u1',
  );
  expect(result!.lines).toEqual([{ ingredientId: 'kelp-capsule', amount: 2.37 }]);
});

it('下单行不在预分装池时拒绝并提示刷新', async () => {
  await expect(service.resolveServerDosageLines(
    { diySheetId: 'sheet-1', lines: [{ recipeItemId: 'item-1', ingredientId: 'not-in-pool' }] } as any,
    'u1',
  )).rejects.toThrow('补剂已下架，请刷新制作单');
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest --runTestsByPath tests/application/supplement-shop/supplement-order.service.spec.ts -t "预分装池"`
Expected: FAIL。

- [ ] **Step 3: 实现**

- 用 `planService.resolveForRecipeRequest`（版本取 `sheet.recipeVersion`，与 Task 2 一致）替换 `candidateService.resolveForRecipe`。
- `pickRepackOption(item.repackPool, line.ingredientId)`；`null` 或 `available === false` 抛 `BadRequestException('补剂已下架，请刷新制作单')`。
- 用量、单位取 option；`dosageSnapshot` 里补 `channel: 'REPACK'`、`referenceIngredientId`。
- 旧版行（没有新字段）走同一逻辑即可：旧候选本来就是池子的子集。

- [ ] **Step 4: 跑测试确认通过**

Run: 同 Step 2（去掉 `-t` 跑整个文件）。Expected: PASS。

- [ ] **Step 5: 提交**

```bash
bash scripts/session.sh commit -m "feat(supplement): 下单校验改按预分装池，旧候选行兼容"
```

---

## Task 4: 小程序数据映射层

**Files:**
- Create: `miniapp/src/pages/diy-sheet/supplement-plan.ts`
- Modify: `miniapp/src/api/supplements.ts`（加 `fetchSupplementPlan`）
- Test: `miniapp/src/pages/diy-sheet/supplement-plan.spec.ts`

**Interfaces:**
- Produces:
  - `type SupplementRowState = 'REPACK' | 'TEMP_UNAVAILABLE' | 'PRODUCTION_ONLY'`
  - `buildSupplementPlanRows(plan: SupplementPlanResponse, selections?: Record<string, string>): SupplementPlanRow[]`
  - `buildSupplementPurchaseLines(rows: SupplementPlanRow[]): Array<{ recipeItemId: string; ingredientId: string; name: string; unit: string; specText: string }>`
  - `SupplementPlanRow = { recipeItemId; ingredientId; sourceIngredientId; name; brand; productModel; referenceText; amount; unit; displayUnit; state; recommendedProducts; repackPool; selectedRepackIngredientId }`

- [ ] **Step 1: 写失败测试**

```ts
it('池子为空 → 仅生产', () => {
  expect(buildSupplementPlanRows({ items: [item({ repackPool: [] })] } as any)[0].state).toBe('PRODUCTION_ONLY');
});
it('池子有货但都不可用 → 暂不可购买', () => {
  expect(buildSupplementPlanRows({ items: [item({ repackPool: [option({ available: false })] })] } as any)[0].state).toBe('TEMP_UNAVAILABLE');
});
it('默认选中 isDefault，且购买行只带有货的行', () => {
  const rows = buildSupplementPlanRows({ items: [item({ repackPool: [option({ ingredientId: 'a' }), option({ ingredientId: 'b', isDefault: true })] })] } as any);
  expect(rows[0].ingredientId).toBe('b');
  expect(buildSupplementPurchaseLines(rows)).toEqual([{ recipeItemId: 'item-1', ingredientId: 'b', name: '海带粉胶囊', unit: '粒', specText: 'NOW FOODS / 325mcg碘/粒' }]);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd miniapp && npx vitest run src/pages/diy-sheet/supplement-plan.spec.ts`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现**

- 小程序侧自己定义镜像类型 `SupplementPlanResponse` / `SupplementPlanItem` / `SupplementRepackOption`（不要 import 后端类型），字段与 Task 2 的响应一一对应。
- `fetchSupplementPlan(recipeId, { totalWeightG?, diySheetId? })` → `GET /recipes/${recipeId}/supplement-plan`，返回 `plan`。
- 行映射：`state` 由池决定（空 → PRODUCTION_ONLY；`pool[0].available` → REPACK，否则 TEMP_UNAVAILABLE）。
- 选中：`selections[recipeItemId]` 命中池内可用项就用它，否则 `isDefault`。
- `referenceText` 由 `brand / productModel` 拼，缺省 `—`。
- 购买行：只取 `state === 'REPACK' && amount > 0`。

- [ ] **Step 4: 跑测试确认通过**

Run: 同 Step 2。Expected: PASS。

- [ ] **Step 5: 提交**

```bash
bash scripts/session.sh commit -m "feat(miniapp): 补剂计划行映射与预分装购买行"
```

---

## Task 5: DIY 制作单页接线

**Files:**
- Modify: `miniapp/src/pages/diy-sheet/index.vue`
- Modify: `miniapp/src/pages/diy-sheet/copy.ts`（`仅生产，不单独出售`）
- Delete（Task 14）: `miniapp/src/pages/diy-sheet/supplement-candidates.ts` 及其 spec

**Interfaces:**
- Consumes: Task 4 的 `buildSupplementPlanRows` / `buildSupplementPurchaseLines`。
- Produces: 页面行数据 `SupplementPlanRow`；`canBuySupplements = rows.some(r => r.state === 'REPACK')`。

- [ ] **Step 1: 写失败测试（迁移现有 regression spec）**

在 `miniapp/src/pages/diy-sheet.regression.spec.ts` 加：

```ts
it('制作单不再用候选徽章，推荐入口只由推荐商品数量决定', () => {
  const src = readFileSync('src/pages/diy-sheet/index.vue', 'utf8');
  expect(src).not.toContain('formatSupplementChoiceLabel');
  expect(src).toContain('recommendedProducts.length');
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd miniapp && npx vitest run src/pages/diy-sheet.regression.spec.ts`
Expected: FAIL。

- [ ] **Step 3: 实现**

- 数据源换成 `fetchSupplementPlan(recipeId, { diySheetId })`；删除 `loadSupplementCandidates` 与 `supplementCandidateItems`。
- 补剂行「产品」列渲染 `referenceText`；状态标签按 `state` 三态；`仅生产，不单独出售` 替换旧文案。
- 徽章：`recommendedProducts.length` 0/1/≥2 → 无 / `查看商品 〉` / `换一个`。
- 弹窗改成推荐商品卡片（名称/品牌/规格/渠道/去购买），删除「确认选择」与候选列表。
- 购买入口：`buildSupplementPurchaseLines(rows)` 存草稿；为空时 toast「暂无可购买的补剂」。
- 删除 `supplement-candidates.ts` 的引用（文件和 spec 等 Task 14 再删）。

- [ ] **Step 4: 跑测试 + 构建**

Run: `cd miniapp && npx vitest run src/pages/diy-sheet.regression.spec.ts src/pages/diy-sheet/supplement-plan.spec.ts`
Expected: PASS。随后 `npm run build:mp-weixin`（产物 `miniapp/dist/build/mp-weixin`，微信开发者工具打开这个目录）。

- [ ] **Step 5: 提交**

```bash
bash scripts/session.sh commit -m "feat(miniapp): 制作单补剂行改显示参考产品，推荐入口独立"
```

---

## Task 6: 预分装下单页页内换款

**Files:**
- Create: `miniapp/src/pages/supplement-order/line-options.ts`
- Modify: `miniapp/src/pages/supplement-order/index.vue`
- Test: `miniapp/src/pages/supplement-order/line-options.spec.ts`

**Interfaces:**
- Produces: `buildPurchaseLineOptions(plan: SupplementPlanResponse, lines: SupplementPurchaseLine[]): Array<{ line; options: SupplementRepackOption[]; selected: SupplementRepackOption | null }>`
- 页面消费：`options.length > 1` 才渲染「换一款」；切换后 `line.ingredientId = option.ingredientId` 并重新 `quoteSupplements`。

- [ ] **Step 1: 写失败测试**

```ts
it('同一行有多个可售产品时给出换款选项', () => {
  const result = buildPurchaseLineOptions(plan, [line({ recipeItemId: 'item-1', ingredientId: 'a' })]);
  expect(result[0].options.map((o) => o.ingredientId)).toEqual(['a', 'b']);
  expect(result[0].selected!.ingredientId).toBe('a');
});
it('只有一个可售产品时不显示换款', () => {
  const result = buildPurchaseLineOptions(planSingle, [line({ recipeItemId: 'item-1', ingredientId: 'a' })]);
  expect(result[0].options).toHaveLength(1);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd miniapp && npx vitest run src/pages/supplement-order/line-options.spec.ts`
Expected: FAIL。

- [ ] **Step 3: 实现**

- 页面 mounted 后调 `fetchSupplementPlan(recipeId, { diySheetId })`（draft 里已有 `diySheetId` / `recipeId`）。
- 行上显示所选产品的品牌/规格；「换一款」用 `uni.showActionSheet` 列出 `options` 的 `name + 规格`。
- 选择后更新本地行并触发 `useSupplementQuote` 重新报价；报价失败保留旧值并提示。
- 提交时只带 `recipeItemId + ingredientId`（沿用现有 payload）。

- [ ] **Step 4: 跑测试 + 构建**

Run: `cd miniapp && npx vitest run src/pages/supplement-order/line-options.spec.ts && npm run build:mp-weixin`
Expected: PASS + 构建成功。

- [ ] **Step 5: 提交**

```bash
bash scripts/session.sh commit -m "feat(miniapp): 预分装下单页支持页内换款并重算价格"
```

---

## Task 7: 一期收尾验证

- [ ] **Step 1:** `cd backend && npx tsc --noEmit && npx jest --runTestsByPath tests/application/supplement-shop/supplement-plan.service.spec.ts tests/application/supplement-shop/supplement-order.service.spec.ts`
- [ ] **Step 2:** `cd miniapp && npx vitest run src/pages/diy-sheet src/pages/supplement-order && npm run build:mp-weixin`
- [ ] **Step 3:** 手动回归（本机后端 `npm run start:dev:miniapp`）：打开「鸭肉南瓜燕麦」制作单 → 海藻粉行显示参考产品 + 状态；点「查看商品」只出推荐商品；点「购买预分装」只出有货的行。
- [ ] **Step 4:** 提交（如有测试快照调整）。

---

# 二期：后台与门禁

## Task 8: 生产门禁（同组 >2 才拦）

**Files:**
- Modify: `backend/src/application/ingredient/ingredient.service.ts`（update 路径，约 330 行）
- Test: `backend/tests/application/ingredient/ingredient-production-gate.spec.ts`

**Interfaces:**
- Produces: `assertProductionPoolLimit(groupId: string, selfId: string): Promise<void>`；组内已有 2 个开生产时再开第 3 个 → `BadRequestException('同一等价组最多允许 2 个产品同时用于生产，请先关闭不用的一个：<names>')`。

- [ ] **Step 1: 写失败测试**

```ts
it('组内已有 2 个开生产时，第 3 个被拒绝', async () => {
  await expect(service.assertProductionPoolLimit('g1', 'new')).rejects.toThrow('最多允许 2 个');
});
it('组内只有 1 个开生产时放行（覆盖换料过渡期）', async () => {
  await expect(service.assertProductionPoolLimit('g1', 'new')).resolves.toBeUndefined();
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest --runTestsByPath tests/application/ingredient/ingredient-production-gate.spec.ts`
Expected: FAIL。

- [ ] **Step 3: 实现**

- 在 `update` 中，当 `dto.procurementEnabled === true` 且该原料有 `equivalenceGroupId` 时先调 `assertProductionPoolLimit`。
- 只拦「开」不拦「关」；没归组的原料不拦。

- [ ] **Step 4: 跑测试确认通过**

Run: 同 Step 2。Expected: PASS。

- [ ] **Step 5: 提交**

```bash
bash scripts/session.sh commit -m "feat(ingredient): 同组生产开关超过 2 个时拦截"
```

---

## Task 9: 上架清单口径展示 + 筛选改名

**Files:**
- Modify: `backend/src/application/supplement-shop/supplement-catalog.service.ts`（`buildCatalogItem` 返回值加 `procurementEnabled`）
- Modify: `admin-web/src/views/SupplementShop/Catalog.vue`（筛选 `可用于生产` → `在食谱中`；新增「生产」「预分装」两列）
- Test: `backend/tests/application/supplement-shop/supplement-catalog.service.spec.ts`

**Interfaces:**
- Produces: `SupplementCatalogItem.procurementEnabled: boolean`。

- [ ] **Step 1: 写失败测试**

```ts
it('上架清单回传生产开关，供后台分列展示', async () => {
  const res = await service.listCatalog();
  expect(res.items.find((i) => i.id === 'kelp')!.procurementEnabled).toBe(true);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest --runTestsByPath tests/application/supplement-shop/supplement-catalog.service.spec.ts`
Expected: FAIL，`procurementEnabled` 为 undefined。

- [ ] **Step 3: 实现**

- 后端 `select` 补 `procurementEnabled`，`buildCatalogItem` 返回它。
- 后台两列：`生产` = `procurementEnabled ? '开' : '关'`；`预分装` = `supplementRetailEnabled ? '已上架' : '未上架'`；筛选项文案改「在食谱中」。

- [ ] **Step 4: 跑测试确认通过**

Run: 同 Step 2 + `cd admin-web && npm run build`。Expected: PASS + 构建通过。

- [ ] **Step 5: 提交**

```bash
bash scripts/session.sh commit -m "feat(admin): 上架清单分列展示生产/预分装，筛选改名"
```

---

## Task 10: 等价组详情展示两个池子

**Files:**
- Create: `admin-web/src/views/SupplementShop/pool-summary.ts`
- Modify: `admin-web/src/views/SupplementShop/EquivalenceGroups.vue`（详情抽屉加「生产池 / 预分装池」一行）
- Test: `admin-web/src/views/SupplementShop/pool-summary.spec.ts`

**Interfaces:**
- Produces: `summarizePools(members: Array<{ name: string; procurementEnabled: boolean; supplementRetailEnabled: boolean }>): { production: string[]; repack: string[] }`

- [ ] **Step 1: 写失败测试**

```ts
it('按开关分出生产池与预分装池', () => {
  expect(summarizePools([
    { name: '海藻粉', procurementEnabled: true, supplementRetailEnabled: false },
    { name: '海带粉胶囊', procurementEnabled: false, supplementRetailEnabled: true },
  ])).toEqual({ production: ['海藻粉'], repack: ['海带粉胶囊'] });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd admin-web && npx vitest run src/views/SupplementShop/pool-summary.spec.ts`
Expected: FAIL。

- [ ] **Step 3: 实现**

- 纯函数拼名字；详情抽屉里渲染两行，池子为空时显示「—」。

- [ ] **Step 4: 跑测试确认通过**

Run: 同 Step 2 + `npm run build`。Expected: PASS。

- [ ] **Step 5: 提交**

```bash
bash scripts/session.sh commit -m "feat(admin): 等价组详情展示生产池与预分装池"
```

---

## Task 11: 只读体检脚本

**Files:**
- Create: `backend/scripts/audit-supplement-channels.ts`

**Interfaces:**
- Produces: 控制台报告，四个部分：① 同组生产开 >2；② 同组在售为 0；③ 每组默认预分装产品（谁会被默认选中）；④ 食谱在用但没有生产开产品的补剂。只读，不写库。

- [ ] **Step 1: 写脚本**

用 `PrismaClient` 读 `ingredient` + `supplement_equivalence_group` + `recipe_item`，按组聚合后打印表格。

- [ ] **Step 2: 本地跑一次（只读）**

Run: `cd backend && npx ts-node -r tsconfig-paths/register scripts/audit-supplement-channels.ts`
Expected: 打印四段报告；本地库连不上时明确报错，不静默。

- [ ] **Step 3: 提交**

```bash
bash scripts/session.sh commit -m "chore(supplement): 增加三口径只读体检脚本"
```

---

# 三期：上线切换与观察

## Task 12: 上线前数据清理（人工，后台操作）

- [ ] **Step 1:** 补剂商城 → 等价组 → 「碘·复方盐」→ 添加成员「碘钾片」（会自动从「碘·天然」移出）。
- [ ] **Step 2:** 补剂上架清单 → 海带粉胶囊 → 打开「上架」（档案已齐）。
- [ ] **Step 3:** 只读复核：`select code, count(*) filter (where procurement_enabled) from ...` 确认碘组只剩海藻粉开生产。

## Task 13: 打开开关 + 发布

- [ ] **Step 1:** 补剂商城 → 配置 → 打开「允许跨产品替换预分装产品」→ 保存 → 刷新确认回显。
- [ ] **Step 2:** 后端合并 `main` 后部署（`bash backend/scripts/remote_deploy_v2.sh`）；后台部署（`bash /Users/zhaochen/Documents/SevenKitchen/deploy-admin-web.sh`）。
- [ ] **Step 3:** `bash scripts/upload-trial.sh "补剂三口径拆分"`；微信开发者工具打开 `miniapp/dist/build/mp-weixin` 验一遍。
- [ ] **Step 4:** 观察 48 小时：补剂订单创建数、`补剂已下架，请刷新制作单` 报错数、分装任务产品分布。

## Task 14: 下线旧接口（发布满一个版本周期后）

- [ ] **Step 1:** 确认线上小程序版本已更新（后台访问日志里 `supplement-candidates` 24 小时为 0）。
- [ ] **Step 2:** 删除 `getSupplementCandidates` 路由、`SupplementCandidateService` 及其测试、`supplement-candidates.ts`。
- [ ] **Step 3:** 跑后端全量测试 + 小程序构建，提交。

---

## 明确不在本计划内

- **生产端手动换产品**：会改扣料与成本结算口径，需要单独设计（数据模型、留痕、成本重算）。本计划只做到「池子定义 + 门禁 + 只读体检」。
- **预分装默认指定某款**：观察期后再决定是否加 `repack_default_ingredient_id`。
- **下单后换款/补退差价**：老板已明确取消。
