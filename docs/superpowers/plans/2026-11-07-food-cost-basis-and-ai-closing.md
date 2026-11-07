# 食材成本口径归位 + AI 建档收尾 · 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让「食材的成本」只剩一个数（元/基准单位），由采购结算写入，新建食材时必须落一条带价的采购商品并用它初始化成本，从而堵住「新原料进食谱不计价」的空窗期。

**Architecture:** 食材档案的「成本」= `ingredient.current_price_per_purchase_unit`，并强制 `purchase_to_base_ratio = 1`（因此这一列就是元/g）。采购口径（件数、净含量、单价）留在 `procurement_sku`。三个写入点：建档初始化、报销覆盖、手工改价；每个写入点都落一条 `ingredient_price_history`。读点只有一个：`Ingredient.getUnitCost()`。

**Tech Stack:** NestJS + Prisma(PostgreSQL) + Jest（后端）；Vue 3 + Element Plus + Vitest（后台）。

**Spec:** `docs/superpowers/specs/2026-11-07-food-cost-basis-and-ai-closing-design.md`

## Global Constraints

- 所有代码改动只在工位 `.worktrees/20261107-t144429`（分支 `task/20261107-t144429`）进行；提交一律 `bash scripts/session.sh commit -m "..." --all` 或列出文件路径，禁止 `git add -A` 后直接 `git commit`。
- 后端测试：`cd backend && npx jest tests/<path>.spec.ts`；类型检查 `cd backend && npx tsc --noEmit`（**不要跑 `npm run build`**，会删 `dist/` 弄死本机联调后端）。
- 后台测试：`cd admin-web && npx vitest run <path>`；构建 `npm run build`。
- 数据库只通过 Prisma migration 改，不手写 DDL 到已上线的库。
- 字段名以 `backend/prisma/schema.prisma` 为准；命名遵循 `docs/DATABASE_NAMING_CONVENTIONS.md`（model PascalCase、表 snake_case、逐字段 `@map`）。
- 不碰 `miniapp/`；不碰补剂、包材的采购字段与表单。
- 金额比较一律用 `round(...,6)` 的判据，不要直接比浮点原值。

## Review Focus

1. **同一原料的两条不同规格采购商品**：员工录采购记录时填「2 件」，基数量必须按**该商品**的净含量折，不能按原料档案的换算折——错这里会把 1000 克记成 2 克。
2. **已有成本的老食材再建一条采购商品**：成本必须**不被覆盖**（只补空），否则一次建档操作会改掉已发布食谱的售价。
3. **0 成本食材进入发布**：产品线发布必须被拦住并指名是哪些原料；订单「加入待提交」只提醒不拦。
4. **保存一条已有价的食材**（改名字、改分类）：成本与换算不能被清成 0/1，也不能被后端以「不能把价格改成 0」拒掉。
5. **毫升类食材**：成本是「元/ml」，密度缺失时下单本来就报错——改造后不得把这类原料错当成「元/g」写进历史。

---

## 文件结构

**后端（新增）**
- `backend/src/application/ingredient/ingredient-cost-history.service.ts` — 成本流水的唯一写入口 + 查询
- `backend/tests/application/ingredient/ingredient-cost-history.service.spec.ts`
- `backend/prisma/migrations/20261107180000_food_cost_basis/migration.sql`
- `backend/scripts/audit-food-cost-basis.ts` — 折算对账 + 成本双跑（dry-run 默认）

**后端（修改）**
- `prisma/schema.prisma`（新表 + 枚举）
- `application/ingredient/procurement-sku.service.ts`（创建后初始化成本）
- `application/ingredient/ingredient-pricing.service.ts`（报销写历史）
- `application/ingredient/ingredient.service.ts`（手工改价写历史 + FOOD 不变量断言）
- `application/purchasing/purchasing.service.ts`（折算取 SKU、`needsProcurementSku`）
- `domain/recipe-designer/launch-readiness.ts`（新阻断码）
- `application/recipe/recipe.service.ts`（老发布接口同一道判断）
- `interfaces/controllers/admin.controller.ts`（详情返回来源/历史、历史接口、后台识别）
- `interfaces/controllers/procurement-sku.controller.ts`（透传 packCount/netContentPerPack）

**后台（修改）**
- `views/Ingredients/IngredientForm.vue`（只读成本卡、历史弹窗、保存不下发 0）
- `views/Ingredients/ai-agent/index.vue`（收尾「补采购商品」屏）
- `views/Ingredients/ai-agent/procurementClosing.ts`（新：收尾状态判定，纯函数）
- `views/Ingredients/index.vue`（待补筛选 + 标）
- `views/Inventory.vue`（改成本 元/克）
- `api/ingredients.ts`（新接口）

---

### Task 1: 数据模型与迁移（新表 + 食材口径折算）

**Files:**
- Modify: `backend/prisma/schema.prisma`（`Ingredient` 加关系；文末加 `IngredientPriceHistory` + 枚举）
- Create: `backend/prisma/migrations/20261107180000_food_cost_basis/migration.sql`
- Test: `backend/tests/infrastructure/ingredient-price-history.migration.spec.ts`

**Interfaces:**
- Produces: 表 `ingredient_price_history`；枚举 `IngredientPriceHistorySource { INIT_FROM_SKU, REIMBURSEMENT, MANUAL, MIGRATION }`；Prisma 客户端 `prisma.ingredientPriceHistory`。

- [ ] **Step 1: 写失败测试** —— 用 `Prisma.sql` 读迁移文件文本，断言包含建表语句、折算 UPDATE、备份表创建：

```ts
it('迁移包含备份、折算与建表三件事', () => {
  const sql = readFileSync('prisma/migrations/20261107180000_food_cost_basis/migration.sql', 'utf8');
  expect(sql).toContain('CREATE TABLE IF NOT EXISTS "ingredient_food_cost_backup_20261107"');
  expect(sql).toContain('ROUND(current_price_per_purchase_unit / purchase_to_base_ratio, 6)');
  expect(sql).toContain('CREATE TABLE "ingredient_price_history"');
});
```

- [ ] **Step 2: 跑测试确认失败** —— `cd backend && npx jest tests/infrastructure/ingredient-price-history.migration.spec.ts`，预期 ENOENT。

- [ ] **Step 3: 改 schema** —— `Ingredient` 增加 `priceHistories IngredientPriceHistory[]`；文末按 §5.1 的字段表加 model，`@@map("ingredient_price_history")`、`@@index([ingredientId, createdAt])`、`@@index([source])`。

- [ ] **Step 4: 写迁移 SQL** —— 顺序：建备份表（`CREATE TABLE ... AS SELECT id, current_price_per_purchase_unit, purchase_to_base_ratio, purchase_unit FROM ingredient WHERE type='FOOD'`）→ 建枚举与表 → 折算 UPDATE（`WHERE type='FOOD' AND purchase_to_base_ratio IS DISTINCT FROM 1`）→ 回填 `purchase_unit` → 插一条 `MIGRATION` 流水（`oldCost = 折算前 ÷ 换算`、`newCost = 折算后`，note 写「2026-11-07 口径归位折算」）。

- [ ] **Step 5: 应用并验证** —— `cd backend && npx prisma migrate dev --name food_cost_basis`（本地库）；再跑 Step 1 的测试，预期 PASS；`npx tsc --noEmit`。

- [ ] **Step 6: 提交** —— `bash scripts/session.sh commit -m "feat(ingredient): 食材成本口径迁移与价格流水表" --all`

---

### Task 2: 成本流水服务（唯一写入口）

**Files:**
- Create: `backend/src/application/ingredient/ingredient-cost-history.service.ts`
- Test: `backend/tests/application/ingredient/ingredient-cost-history.service.spec.ts`
- Modify: `backend/src/app.module.ts`（注册 provider）

**Interfaces:**
- Produces:
  - `record(input: RecordIngredientCostInput): Promise<void>`
    `RecordIngredientCostInput = { ingredientId: string; oldCost: number | null; newCost: number; source: IngredientPriceHistorySource; procurementSkuId?: string | null; reimbursementId?: string | null; purchaseRecordId?: string | null; operatorId?: string | null; note?: string | null; tx?: Prisma.TransactionClient }`
  - `list(ingredientId: string, limit?: number): Promise<IngredientCostHistoryView[]>`
    `IngredientCostHistoryView = { id, oldCostPerBaseUnit: number | null, newCostPerBaseUnit: number, source, note, operatorName: string | null, createdAt: string }`

- [ ] **Step 1: 写失败测试** —— 用内存 Prisma mock：

```ts
it('写一条流水：老成本、新成本、来源都落库', async () => {
  await service.record({ ingredientId: 'i1', oldCost: null, newCost: 0.0798, source: 'INIT_FROM_SKU' });
  expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({ newCostPerBaseUnit: 0.0798, oldCostPerBaseUnit: null }) });
});

it('同一条流水不会把新成本四舍五入成 0', async () => { /* 0.000002 也要原样存 */ });
```

- [ ] **Step 2: 确认失败** —— `npx jest tests/application/ingredient/ingredient-cost-history.service.spec.ts`。

- [ ] **Step 3: 实现** —— `record()` 六位小数取整后写；`tx` 存在时用 `tx.ingredientPriceHistory.create`，否则用 `this.prisma`。`list()` 关联 `operator` 取名，按 `createdAt desc` 取前 N（默认 50）。

- [ ] **Step 4: 确认通过** 并 `npx tsc --noEmit`。

- [ ] **Step 5: 提交** —— `feat(ingredient): 成本流水服务`

---

### Task 3: 建档初始化（第一条采购商品把成本带出来）

**Files:**
- Modify: `backend/src/application/ingredient/procurement-sku.service.ts`（`create()`、`createFromStaff()` 末尾各加一次调用）
- Test: `backend/tests/application/ingredient/procurement-sku.cost-init.spec.ts`

**Interfaces:**
- Consumes: Task 2 的 `IngredientCostHistoryService.record`
- Produces: 私有方法
  `initializeIngredientCostFromSku(tx, params: { ingredientId: string; skuId: string; pricePerPurchaseUnit: number | null; purchaseToBaseRatio: number | null }): Promise<void>`
  规则：`price > 0 && ratio > 0 && 现有成本 === 0` 才写；写入 `round(price / ratio, 6)`。

- [ ] **Step 1: 写失败测试**（三条，对应 Review Focus 1/2/5）

```ts
it('成本为 0 时，用商品价 ÷ 净含量初始化', ...);          // 39.9 / 500 => 0.0798
it('已有成本时一律不动', ...);                             // 旧值 0.12 保持不变
it('商品没填价时跳过，成本保持 0', ...);
```

- [ ] **Step 2: 确认失败**。

- [ ] **Step 3: 实现** —— 放在事务内（`create()` 里已有 `runCreate` 事务）：先 `SELECT current_price_per_purchase_unit FROM ingredient WHERE id = ... FOR UPDATE`（避免并发双写），再判断，`UPDATE` 后调 `costHistory.record({ source: 'INIT_FROM_SKU', procurementSkuId: skuId })`。`createFromStaff()` 同样接入（它已用 `runCreate` 事务）。

- [ ] **Step 4: 确认通过 + 跑既有 `procurement-sku` 相关测试**。

- [ ] **Step 5: 提交** —— `feat(ingredient): 建档时用第一条采购商品初始化成本`

---

### Task 4: 报销写价落历史

**Files:**
- Modify: `backend/src/application/ingredient/ingredient-pricing.service.ts:640-670`（`applyPriceChanges` 里 `ingredientRepository.update` 之后）
- Test: `backend/tests/application/ingredient/ingredient-pricing.cost-history.spec.ts`

**Interfaces:**
- Consumes: Task 2 的 `record`
- Produces: 报销每写一次价，落一条 `source='REIMBURSEMENT'` 的流水，带 `reimbursementId` / `purchaseRecordId`（多笔时留空）与 `operatorId`。

- [ ] **Step 1: 写失败测试** —— `it('审批通过后写一条 REIMBURSEMENT 流水，old/new 与档案价一致', ...)`。
- [ ] **Step 2: 确认失败**。
- [ ] **Step 3: 实现** —— 在 `appliedCurrentPriceByIngredient` 循环体里，`update` 前先读旧值（`ingredientMap.get(id)?.currentPricePerPurchaseUnit ?? null`），`update` 后调 `record`。
- [ ] **Step 4: 确认通过 + 跑 `tests/application/ingredient/` 全目录**。
- [ ] **Step 5: 提交** —— `feat(ingredient): 报销调价写成本流水`

---

### Task 5: 手工改价落历史 + 食材不变量断言

**Files:**
- Modify: `backend/src/application/ingredient/ingredient.service.ts`（`updateIngredient`、`updateIngredientPrice`）
- Test: `backend/tests/application/ingredient/ingredient.service.food-cost.spec.ts`

**Interfaces:**
- Consumes: Task 2 的 `record`
- Produces:
  - `updateIngredientPrice(id: string, dto: UpdateIngredientPriceDto, operatorId?: string | null): Promise<Ingredient>`（新增可选第三参）
  - 私有 `assertFoodPurchaseRatioInvariant(type, purchaseToBaseRatio): void` —— FOOD 且 ratio ≠ 1 时抛 `BadRequestException('食材的采购换算固定为 1（元/基准单位），请通过采购商品维护规格')`。

- [ ] **Step 1: 写失败测试**

```ts
it('手工改价写一条 MANUAL 流水，带操作人', ...);
it('食材的比例被改成 500 时拒绝保存', ...);
it('保存食材时不下发价格，成本保持原值', ...);   // Review Focus 4
```

- [ ] **Step 2: 确认失败**。
- [ ] **Step 3: 实现** —— 在 `updateIngredient` 的 `assertPriceNotWipedToZero` 旁边加不变量断言（只对 FOOD）；`updateIngredientPrice` 在 `updatePrice` 后 `record({ source: 'MANUAL', operatorId })`；控制器把当前用户传给第三参。
- [ ] **Step 4: 确认通过 + `npx tsc --noEmit`**。
- [ ] **Step 5: 提交** —— `feat(ingredient): 手工改价落历史 + 食材换算不变量`

---

### Task 6: 采购记录折算改按采购商品

**Files:**
- Modify: `backend/src/application/purchasing/purchasing.service.ts:1175-1186`（`resolvePurchaseToBaseRatio`）
- Test: `backend/tests/application/purchasing/purchase-record.ratio.spec.ts`

**Interfaces:**
- Produces: `resolvePurchaseToBaseRatio(purchaseItem): number` —— 优先 `purchaseItem.ingredient.procurementSkus` 里与 `purchaseItem.procurementSkuId` 匹配那条的 `purchaseToBaseRatio`；没有 SKU 或 SKU 未填换算时退回 `ingredient.purchaseToBaseRatio`；两者都不合法才抛原有的 400。

- [ ] **Step 1: 写失败测试**（Review Focus 1）

```ts
it('同一原料两个规格：按所选商品的净含量折，不按原料档案', ...);  // 2 件 × 400g = 800，不是 2 × 500
it('没有 SKU 时退回原料档案的换算', ...);
it('商品换算为空时退回原料档案', ...);
```

- [ ] **Step 2: 确认失败**。
- [ ] **Step 3: 实现**（`actualQuantity = baseQuantity / ratio` 的分母同步用同一函数，无需另改）。
- [ ] **Step 4: 确认通过 + 跑 `tests/application/purchasing/`**。
- [ ] **Step 5: 提交** —— `fix(purchasing): 采购记录按采购商品的换算折算`

---

### Task 7: 没有采购商品的原料，采购清单不猜单位

**Files:**
- Modify: `backend/src/application/purchasing/purchasing.service.ts:640-700`（`resolveProcurementExecutionProfile`）与 `ProcurementExecutionProfile` 接口
- Test: `backend/tests/application/purchasing/procurement-profile.no-sku.spec.ts`

**Interfaces:**
- Produces: `ProcurementExecutionProfile` 新增 `needsProcurementSku: boolean`；无 SKU 时 `purchaseUnit = ingredient.baseUnit`、`purchaseToBaseRatio = 1`、`needsProcurementSku = true`。

- [ ] **Step 1: 写失败测试**

```ts
it('没有采购商品时：单位取基准单位、标 needsProcurementSku', ...);
it('没有采购商品时：建议数量按基准单位算，不再是「几袋」', ...);
```

- [ ] **Step 2: 确认失败**。
- [ ] **Step 3: 实现**；`PurchaseItem` 落库时 `quantityUnit` 取 `profile.purchaseUnit`（现有行为即可），前端另加标记展示。
- [ ] **Step 4: 确认通过**。
- [ ] **Step 5: 提交** —— `feat(purchasing): 缺采购商品时按基准单位列出并标记`

---

### Task 8: 发布门槛（0 成本食材）

**Files:**
- Modify: `backend/src/domain/recipe-designer/launch-readiness.ts`（新增 code + 判断）
- Modify: `backend/src/application/recipe-designer/recipe-designer.service.ts`（构造 items 时带上 `costPerBaseUnit`）
- Modify: `backend/src/application/recipe/recipe.service.ts:1844`（`publishRecipe` 前同判断）
- Test: `backend/tests/domain/recipe-designer/launch-readiness.cost.spec.ts`

**Interfaces:**
- Consumes: `Ingredient.getUnitCost()`
- Produces: `LaunchReadinessItemInput` 新增可选 `costPerBaseUnit?: number | null`；
  `LAUNCH_READINESS_BLOCKER_LABEL.INGREDIENT_COST_MISSING = '有食材没有成本'`；
  仅 `designMode === 'CATALOG'` 记为 blocker（message 里列出最多 3 个原料名），`ORDER` 记为 warning（code `INGREDIENT_COST_MISSING`）。

- [ ] **Step 1: 写失败测试**

```ts
it('产品线发布：食材成本为 0 时阻断，并指名原料', ...);
it('订单加入待提交：同样的数据只提醒，不阻断', ...);
it('只有补剂缺成本时不影响（补剂不在本次范围）', ...);
```

- [ ] **Step 2: 确认失败**。
- [ ] **Step 3: 实现**；`recipe-designer.service` 组装 `items` 时从原料带出 `getUnitCost()`。
- [ ] **Step 4: 确认通过 + 跑 `tests/domain/recipe-designer/`**。
- [ ] **Step 5: 提交** —— `feat(recipe): 发布前拦截没有成本的食材`

---

### Task 9: 后台接口（来源 + 历史 + 后台识别）

**Files:**
- Modify: `backend/src/interfaces/controllers/admin.controller.ts`（`buildIngredientPriceInfo` 改为读流水；新增 `GET admin/ingredients/:id/cost-history`；新增 `POST admin/purchasing/procurement-sku-draft` 复用 `ProcurementSkuDraftService`）
- Modify: `backend/src/interfaces/controllers/procurement-sku.controller.ts`（DTO 透传 `packCount` / `netContentPerPack`）
- Modify: `backend/src/application/ingredient/procurement-sku.service.ts`（`CreateProcurementSkuDto` 支持 `packCount`+`netContentPerPack`，服务端算 `purchaseToBaseRatio`）
- Test: `backend/tests/interfaces/admin.ingredient-cost.spec.ts`

**Interfaces:**
- Consumes: Task 2 的 `list()`、Task 3 的初始化
- Produces:
  - `GET /api/v1/admin/ingredients/:id/cost-history` → `{ items: IngredientCostHistoryView[] }`
  - 原料详情 `priceBasis.source` 取值改为 `REIMBURSEMENT | INIT_FROM_SKU | MANUAL | MIGRATION | NONE`
  - `POST /api/v1/admin/purchasing/procurement-sku-draft` body `{ imageUrl, ingredientId }` → `{ draft, degraded }`

- [ ] **Step 1: 写失败测试**（来源判定、历史接口形状、packCount 换算服务端算）。
- [ ] **Step 2: 确认失败**。
- [ ] **Step 3: 实现**（`buildIngredientPriceInfo` 改成读最新一条流水，没有流水时 `source='NONE'`）。
- [ ] **Step 4: 确认通过 + `npx tsc --noEmit`**。
- [ ] **Step 5: 提交** —— `feat(admin-api): 食材成本来源与历史接口`

---

### Task 10: 后台原料页（成本卡 + 历史 + 保存不下发 0）

**Files:**
- Modify: `admin-web/src/views/Ingredients/IngredientForm.vue`（FOOD 分支加只读卡；历史弹窗；`sanitizeTopLevelFieldsForFood` 不再写 0）
- Modify: `admin-web/src/api/ingredients.ts`（`getCostHistory`）
- Modify: `admin-web/src/types/ingredient.ts`（`priceBasis.source` 联合类型）
- Test: `admin-web/src/views/Ingredients/ingredientForm.foodCost.spec.ts`

**Interfaces:**
- Consumes: Task 9 的接口
- Produces: `buildFoodCostPayload(formData)` 返回的 payload 中**不含** `currentPricePerPurchaseUnit` / `purchaseToBaseRatio`（供测试断言）。

- [ ] **Step 1: 写失败测试**

```ts
it('食材保存的 payload 不带价格与换算', () => { /* Review Focus 4 */ });
it('只读卡显示每克成本与来源', () => {});
```

- [ ] **Step 2: 确认失败**（`npx vitest run src/views/Ingredients/ingredientForm.foodCost.spec.ts`）。
- [ ] **Step 3: 实现** —— 把 `priceBasis` 只读卡从包材分支抽成组件式片段，FOOD 分支复用；`source` 文案映射四个值；「价格历史」按钮打开弹窗调 `getCostHistory`。
- [ ] **Step 4: 确认通过 + `npm run build`**。
- [ ] **Step 5: 提交** —— `feat(admin): 食材成本只读卡与历史`

---

### Task 11: AI 收尾「补采购商品」

**Files:**
- Create: `admin-web/src/views/Ingredients/ai-agent/procurementClosing.ts`（纯函数：收尾状态、必填校验、金额换算）
- Create: `admin-web/src/views/Ingredients/ai-agent/procurementClosing.spec.ts`
- Modify: `admin-web/src/views/Ingredients/ai-agent/index.vue`（`commitResult` 后渲染收尾卡片；保存调 `ingredientsApi.createProcurementSku`）
- Modify: `admin-web/src/api/ingredients.ts`（`recognizeProcurementSkuDraft`）

**Interfaces:**
- Consumes: Task 9 的识别接口与采购商品创建接口
- Produces:
  - `computeClosingState(input: { skuCount: number; pricePerUnit: number | null; netContentPerGram: number | null }): 'READY' | 'MISSING_SKU' | 'MISSING_PRICE'`
  - `buildCreateSkuPayload(form): { name; purchaseChannel; purchaseUnit; packCount; netContentPerPack; currentPurchasePrice }`
  - `formatCostPreview(price, ratio): '≈ ¥0.0798 / g'`

- [ ] **Step 1: 写失败测试**（三态判定、换算预览、缺价时不提交）。
- [ ] **Step 2: 确认失败**。
- [ ] **Step 3: 实现纯函数**。
- [ ] **Step 4: 接进页面** —— 授权成功且 `line === 'FOOD'` 时，原「已写入」块下方渲染卡片；成功后调 `refresh` 把 `commitResult` 标记为 `closingDone`；「稍后补」只提示不阻断。

- [ ] **Step 4b: 手工新建食材也复用这张卡（F6）** —— `IngredientForm.vue` 保存成功、`type === FOOD` 且还没有采购商品时，`emit` 一个 `requestProcurementSku` 事件，由原料列表页打开同一个收尾组件；关掉不影响保存。
- [ ] **Step 5: 确认通过 + `npm run build`**。
- [ ] **Step 6: 提交** —— `feat(admin): AI 建档收尾补采购商品`

---

### Task 12: 原料列表「待补采购商品」筛选

**Files:**
- Modify: `admin-web/src/views/Ingredients/index.vue`（统计数字可点、筛选条件、行标记）
- Test: `admin-web/src/views/Ingredients/missingSkuFilter.spec.ts`

**Interfaces:**
- Consumes: 现有 `hasActiveProcurementSku`、`currentPricePerPurchaseUnit`
- Produces: `filterMissingProcurementSku: boolean`；`isPendingProcurementSku(row): boolean`（FOOD 且无启用 SKU）。

- [ ] **Step 1: 写失败测试**（筛选只留 FOOD 且无 SKU；有 SKU 但成本为 0 时打「未定价」标）。
- [ ] **Step 2: 确认失败**。
- [ ] **Step 3: 实现**。
- [ ] **Step 4: 确认通过 + `npm run build`**。
- [ ] **Step 5: 提交** —— `feat(admin): 原料列表可按待补采购商品筛选`

---

### Task 13: 库存页改成本（元/克）

**Files:**
- Modify: `admin-web/src/views/Inventory.vue`（食材行：单位改 `/g`、文案「改成本」、折算预览）
- Test: `admin-web/src/views/Inventory.costUnit.spec.ts`

**Interfaces:**
- Produces: `formatCostUnit(row): '元/g' | '元/ml'`；`costPreview(price, defaultSkuRatio): string`。

- [ ] **Step 1: 写失败测试**（食材显示 `/g`；补剂/包材仍显示原采购单位）。
- [ ] **Step 2: 确认失败**。
- [ ] **Step 3: 实现**。
- [ ] **Step 4: 确认通过 + `npm run build`**。
- [ ] **Step 5: 提交** —— `feat(admin): 库存页食材按元/克改成本`

---

### Task 14: 对账脚本与全量验收

**Files:**
- Create: `backend/scripts/audit-food-cost-basis.ts`
- Modify: `backend/package.json`（`audit:food-cost-basis`）
- Create: `docs/superpowers/reports/2026-11-07-food-cost-basis-rollout.md`

**Interfaces:**
- Produces: 脚本两种模式：默认 dry-run 打印报告；`--apply` 仅用于本地。

- [ ] **Step 1: 写脚本** —— 输出三块：①逐条对账（`round(旧成本 ÷ 旧换算, 6) == 新成本`）；②食谱双跑（已发布食谱 × 1000g 净食，新旧成本对比，列出差异 > 0.005 元的行）；③待补清单（FOOD 且无启用 SKU 的原料数）。
- [ ] **Step 2: 在本地库跑 dry-run**，把报告贴进 `docs/superpowers/reports/2026-11-07-food-cost-basis-rollout.md`。
- [ ] **Step 3: 全量回归** —— `cd backend && npm test`；`npx tsc --noEmit`；`cd admin-web && npm run build && npm test`。
- [ ] **Step 4: 手工验收**（按 §7 清单逐条打勾，特别是 Review Focus 的 1/2/3/4）。
- [ ] **Step 5: 提交** —— `chore(ingredient): 成本口径对账脚本与验收报告`

---

## 完成之后

1. `bash scripts/session.sh finish` 推分支
2. `bash scripts/session.sh merge` 合并（会拿 `merge-main` 门禁）
3. 部署后端 + admin-web（脚本会自动判是否有改动）
4. 向老板报告：部署的提交、对账结果、待补采购商品的原料条数
