# 库存管理改版 Implementation Plan（全量）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让「采购入库 − 生产扣料 = 账面库存」真正成立，差异可复核、可追责，包材自动扣减，并按新台账重做员工端库存页。

**Architecture:** 三期递进。一期只动后端记账口径（全量入库、单一口径出库、操作人、冲红、期初盘点）；二期加盘点状态机与复核、报废/内部领用入口，并同步重做小程序库存与盘点页；三期把包材扣减、在途量、净额下单接上。每期结束都能独立上线、独立验收。

**Tech Stack:** NestJS + Prisma(PostgreSQL) + Jest；uni-app(Vue3 小程序) + Vitest（源码级回归测试）；admin-web(Vue3)。

**Spec:**
- `docs/superpowers/specs/2026-11-09-inventory-ledger-design.md`（台账与盘点）
- `docs/superpowers/specs/2026-11-10-inventory-ui-design.md`（界面与交互）
- 原型：`mockups/inventory-ledger-ui-2026-11-10.*`、`mockups/inventory-stocktake-ui-2026-11-10.*`

## Global Constraints

- 字段命名遵循 `docs/DATABASE_NAMING_CONVENTIONS.md`；表结构以 `backend/prisma/schema.prisma` 为准。
- 禁止直接改数据库：结构变更走 `npx prisma migrate dev`；脚本默认 dry-run，`--apply` 才写。
- 台账只增不删：撤回写负数行，不 `deleteMany`。
- 数量一律以原料基准单位（g / ml / pcs）落账，展示层再换算；展示走 `src/utils/staff-quantity.ts`。
- 不改订单成本口径：`ProductionBatchCostSettlement.inventoryCost` 保持 0。
- 后端：`cd backend && npx jest <path> --runInBand`；提交前 `npx tsc --noEmit`。
- 小程序：改完必须跑 `cd miniapp && npm run preview` 或 `npm run build:mp-weixin`；**不上传正式版**。
- 员工端 UI 遵循 `docs/员工端UI规范.md`：深绿导航、页面内不写大标题、最小字号 24rpx、选中态深绿底米白字。

## Review Focus

1. **重复点「完成采购」**——同一张采购单点两次不能入库两次。
2. **冲红后再点「完成采购」**——冲红行不能被当成入库再次扣减。
3. **车间没登录/没 token**——加鉴权后必须给出明确失败提示，不能静默不扣料。
4. **采购没完成就手工建批次**——必须被拦；`force` 只给管理员且留痕。
5. **期初盘点漏掉账面为 0 的原料**——冰箱里有、账上没有的货必须能录进去。
6. **盘点期间又生产/发货**——差异仍按建单时算定，复核只放行不改数字（二期状态机不能重算）。

---

## 阶段总览

| 期 | 目标 | 任务 | 粗估 |
|---|---|---|---|
| 一期 | 把账修对 | T1–T8 | 2–3 天 |
| 二期 | 差异可复核 + 内部领用 + 界面 | T9–T15 | 4–5 天 |
| 三期 | 包材 + 在途 + 净额 | T16–T21 | 3–4 天 |

依赖关系：二期依赖一期的操作人字段与单一口径；三期依赖二期的盘点基线（包材期初）。

---

# 一期：把账修对

### Task 1: 采购完成时全部入库（不再按策略过滤）

**Files:**
- Modify: `backend/src/application/inventory/inventory.service.ts`（`inboundFromPurchaseRecords`，约 269–360 行）
- Test: `backend/tests/application/inventory/inventory.service.spec.ts`

**Interfaces:**
- Consumes: `PurchaseRecord.actualBaseQuantity`、`PurchaseRecord.id`
- Produces: `inboundFromPurchaseRecords(records: PurchaseRecord[]): Promise<{ createdCount: number; skippedCount: number }>`（签名不变）

- [ ] **Step 1: 写失败测试**

```ts
it('入账不再按采购策略过滤：日采原料也入库', async () => {
  prisma.inventoryLedgerEntry.createMany.mockResolvedValue({ count: 2 });
  const result = await service.inboundFromPurchaseRecords([
    { id: 'pr-1', ingredientId: 'ing-daily', actualBaseQuantity: 500 },
    { id: 'pr-2', ingredientId: 'ing-stock', actualBaseQuantity: 1200 },
  ] as any);
  expect(result.createdCount).toBe(2);
  const rows = prisma.inventoryLedgerEntry.createMany.mock.calls[0][0].data;
  expect(rows.map((r: any) => r.ingredientId)).toEqual(['ing-daily', 'ing-stock']);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest tests/application/inventory/inventory.service.spec.ts -t "日采原料也入库" --runInBand`
Expected: FAIL（只入账 `ing-stock`）

- [ ] **Step 3: 改实现**

删掉按 `procurementStrategy` 过滤的整段（`stockManagedStrategies` / `stockManagedIngredientIds`）；所有 `actualBaseQuantity > 0` 的记录都生成 `PURCHASE_RECORD` 流水；`skippedCount` 只统计数量 ≤ 0。

- [ ] **Step 4: 跑测试确认通过**

Run: 同上。Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add backend/src/application/inventory/inventory.service.ts backend/tests/application/inventory/inventory.service.spec.ts
git commit -m "feat(inventory): 采购完成时全部入库，不再按采购策略过滤"
```

---

### Task 2: 批次结算不再写第二笔扣减

**Files:**
- Modify: `backend/src/application/inventory/inventory.service.ts`（`consumeAllocationsForOrderIds`，约 568–650 行）
- Test: `backend/tests/application/inventory/inventory-allocation.service.spec.ts`

**Interfaces:**
- Produces: `consumeAllocationsForOrderIds(orderIds: string[], batchId: string)` 返回 `ledgerEntryCount: 0`

- [ ] **Step 1: 写失败测试**

```ts
it('消耗预占只改状态，不再写库存流水', async () => {
  const result = await service.consumeAllocationsForOrderIds(['o-1'], 'batch-1');
  expect(result.consumedAllocationCount).toBe(1);
  expect(result.ledgerEntryCount).toBe(0);
  expect(prisma.inventoryLedgerEntry.createMany).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest tests/application/inventory/inventory-allocation.service.spec.ts -t "不再写库存流水" --runInBand`
Expected: FAIL

- [ ] **Step 3: 改实现**

删除构造 `PRODUCTION_ALLOCATION_CONSUMPTION` 流水的整段；事务只保留 `updateMany({ status: 'CONSUMED' })`；`totalConsumedQuantityG` 仍按预占行汇总（成本快照展示用）。

- [ ] **Step 4: 跑测试确认通过并提交**

```bash
git add backend/src/application/inventory/inventory.service.ts backend/tests/application/inventory/inventory-allocation.service.spec.ts
git commit -m "fix(inventory): 批次结算只标记预占已消耗，不再重复扣库存"
```

---

### Task 3: 盘点 / 调整 / 完工记录操作人

**Files:**
- Modify: `backend/prisma/schema.prisma`（`InventoryStocktake`、`InventoryAdjustment`、`PackagingUnit`）
- Create: `backend/prisma/migrations/<ts>_inventory_operator_fields/`
- Modify: `backend/src/application/inventory/inventory.service.ts`（`createStocktake` / `createManualAdjustment`）
- Modify: `backend/src/interfaces/controllers/staff-inventory.controller.ts`、`admin.controller.ts`、`staff-kitchen.controller.ts`
- Test: `backend/tests/application/inventory/inventory.service.spec.ts`

**Interfaces:**
- Produces: `createStocktake(dto, createdBy?: string)`、`createManualAdjustment(dto, createdBy?: string)`、`PackagingUnit.completedBy: string | null`

- [ ] **Step 1: 改 schema 并生成 migration**

三个模型各加 `createdBy String? @map("created_by") @db.VarChar(36)`；`PackagingUnit` 加 `completedBy String? @map("completed_by") @db.VarChar(36)`。
Run: `cd backend && npx prisma migrate dev --name inventory_operator_fields`

- [ ] **Step 2: 写失败测试**

> 注：`createStocktake` 走 `prisma.$transaction`，测试里把 `$transaction` 实现成回调透传。

```ts
it('创建盘点单时写入操作人', async () => {
  await service.createStocktake({ lines: [{ ingredientId: 'i-1', countedQuantityG: 10 }] }, 'user-1');
  expect(tx.inventoryStocktake.create.mock.calls[0][0].data.createdBy).toBe('user-1');
});
```

- [ ] **Step 3: 跑测试确认失败**

Run: `cd backend && npx jest tests/application/inventory/inventory.service.spec.ts -t "写入操作人" --runInBand`
Expected: FAIL

- [ ] **Step 4: 改实现**

service 写入 `createdBy`；三个 controller 用 `@UserId() userId` 透传（`staff-kitchen` 的守卫在 Task 6 加）。

- [ ] **Step 5: 跑测试确认通过并提交**

```bash
git add backend/prisma backend/src backend/tests
git commit -m "feat(inventory): 盘点/调整/完工记录操作人"
```

---

### Task 4: 撤回入库改为冲红

**Files:**
- Modify: `backend/prisma/schema.prisma`（`enum InventorySourceType` 加 `PURCHASE_RECORD_REVERSAL`）
- Modify: `backend/src/application/inventory/inventory.service.ts`（`releasePurchaseRecordInboundsForPurchaseList`，约 363–389 行）
- Modify: `admin-web/src/types/ingredient.ts`（`InventorySourceType` 映射）
- Test: `backend/tests/application/inventory/inventory.service.spec.ts`

**Interfaces:**
- Produces: 冲红流水 `sourceType = PURCHASE_RECORD_REVERSAL`、`sourceId = purchaseRecordId`、`deltaG = -原值`

- [ ] **Step 1: 改 enum + migration**

`npx prisma migrate dev --name inventory_purchase_reversal`。

- [ ] **Step 2: 写失败测试**

```ts
it('撤回采购完成时写冲红，不删除原流水', async () => {
  await service.releasePurchaseRecordInboundsForPurchaseList('pl-1');
  expect(prisma.inventoryLedgerEntry.deleteMany).not.toHaveBeenCalled();
  const rows = prisma.inventoryLedgerEntry.createMany.mock.calls[0][0].data;
  expect(rows[0].sourceType).toBe('PURCHASE_RECORD_REVERSAL');
  expect(rows[0].deltaG).toBeLessThan(0);
});
```

- [ ] **Step 3: 跑测试确认失败**

Run: `cd backend && npx jest tests/application/inventory/inventory.service.spec.ts -t "写冲红" --runInBand`

- [ ] **Step 4: 改实现**

先查该采购单下所有 `PURCHASE_RECORD` 流水，按 `ingredientId` 写等量负数（`skipDuplicates`）；重复调用幂等（已有 `PURCHASE_RECORD_REVERSAL` 的跳过）。

- [ ] **Step 5: 跑测试确认通过并提交**

```bash
git add backend/prisma backend/src backend/tests admin-web/src/types
git commit -m "feat(inventory): 撤回采购入库改为冲红，流水只增不删"
```

---

### Task 5: 排产前校验采购已完成

**Files:**
- Modify: `backend/src/application/production/production.service.ts`（`createProductionBatch` 约 107 行；`CreateProductionBatchDto` 约 36 行）
- Test: `backend/tests/application/production/production.service.spec.ts`

**Interfaces:**
- Produces: `CreateProductionBatchDto.force?: boolean`；未完成且 `force !== true` 抛 `BadRequestException('请先完成当天的采购任务后再排产')`

- [ ] **Step 1: 写失败测试**

```ts
it('采购未完成时拒绝建批次', async () => {
  await expect(service.createProductionBatch({ productionDate: '2026-11-10' })).rejects.toThrow('请先完成当天的采购任务后再排产');
});
it('强制排产可以跳过', async () => {
  await expect(service.createProductionBatch({ productionDate: '2026-11-10', force: true })).resolves.toBeDefined();
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest tests/application/production/production.service.spec.ts -t "排产" --runInBand`

- [ ] **Step 3: 改实现**

加载订单前查 `PurchaseListKind.ORDER_DEMAND` + 当天；存在非 `COMPLETED` 且非 `force` → 抛错；`force` 时 `logger.warn`。

- [ ] **Step 4: 跑测试确认通过并提交**

```bash
git add backend/src/application/production backend/tests/application/production
git commit -m "feat(production): 采购未完成时不允许排产，管理员可强制"
```

---

### Task 6: 车间完工接口加鉴权并记录操作人

**Files:**
- Modify: `backend/src/interfaces/controllers/staff-kitchen.controller.ts`
- Modify: `backend/src/application/kitchen/kitchen.service.ts`（完工方法）
- Create: `backend/tests/controllers/staff-kitchen.controller.spec.ts`

**Interfaces:**
- Produces: `PackagingUnit.completedBy = userId`

- [ ] **Step 1: 写失败测试**

控制器 spec：无 token 返回 401；带 token 时 `expect(service.completeTask).toHaveBeenCalledWith('task-1', expect.objectContaining({ completedBy: 'user-1' }))`。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest tests/controllers/staff-kitchen.controller.spec.ts --runInBand`

- [ ] **Step 3: 改实现**

类上加 `@UseGuards(AuthGuard, StaffGuard)`；完工方法加 `@UserId() userId` 透传；service 更新 `completedBy`。

- [ ] **Step 4: 跑测试确认通过并提交**

```bash
git add backend/src/interfaces/controllers/staff-kitchen.controller.ts backend/src/application/kitchen backend/tests/controllers
git commit -m "feat(kitchen): 完工接口加鉴权并记录操作人"
```

---

### Task 7: 完工扣料默认为开（仅影响新装）

**Files:**
- Modify: `backend/src/application/config/global-config.service.ts`（两处 `?? false`）
- Modify: `admin-web/src/views/GlobalConfig.vue`（表单默认值）
- Test: `backend/tests/application/config/global-config.service.spec.ts`

- [ ] **Step 1: 写失败测试**

```ts
it('未配置时默认开启完工自动扣料', async () => {
  expect((await service.getGlobalConfig()).autoDeductInventoryOnProduction).toBe(true);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest tests/application/config/global-config.service.spec.ts -t "默认开启完工自动扣料" --runInBand`

- [ ] **Step 3: 改实现并跑测试**

两处 `?? false` → `?? true`；后台表单默认 → `true`。

- [ ] **Step 4: 提交**

```bash
git add backend/src/application/config/global-config.service.ts admin-web/src/views/GlobalConfig.vue backend/tests/application/config
git commit -m "feat(config): 完工自动扣料默认开启（新装）"
```

> ⚠️ 上线顺序：部署代码 → 期初盘点 → 后台打开开关。改默认值不影响已存在的配置行。

---

### Task 8: 期初盘点导入脚本

**Files:**
- Create: `backend/scripts/opening-stocktake.ts`
- Modify: `backend/package.json`（`backfill:opening-stocktake` / `:apply`）
- Create: `backend/tests/scripts/opening-stocktake.spec.ts`

**Interfaces:**
- Produces: `runOpeningStocktake({ csvPath, apply, createdBy })`；CSV 列 `ingredient_name,counted_quantity,unit`；内部调 `createStocktake({ lines, applyImmediately: apply, note: '期初盘点' }, createdBy)`

- [ ] **Step 1: 写失败测试**

```ts
it('CSV 里账面为 0 的原料也会进盘点单', async () => {
  const result = await runOpeningStocktake({ csvPath: fixture, apply: false, createdBy: 'u-1' });
  expect(result.lines.map((l) => l.ingredientName)).toContain('南瓜');
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest tests/scripts/opening-stocktake.spec.ts --runInBand`

- [ ] **Step 3: 实现脚本**

默认 dry-run，`--apply` 才写；名称匹配不到列出未匹配项并以退出码 1 结束；`unit` 与原料 `baseUnit`/`unitDisplayLabel` 不一致时拒绝该行。

- [ ] **Step 4: 跑测试确认通过并提交**

```bash
git add backend/scripts/opening-stocktake.ts backend/package.json backend/tests/scripts
git commit -m "feat(inventory): 期初盘点导入脚本（默认 dry-run）"
```

---

# 二期：差异可复核 + 内部领用 + 界面

### Task 9: 盘点状态机与复核接口

**Files:**
- Modify: `backend/prisma/schema.prisma`（`InventoryStocktakeStatus` 加 `SUBMITTED`、`REJECTED`；`InventoryStocktake` 加 `submittedAt`、`reviewedBy`、`reviewedAt`、`reviewNote`）
- Modify: `backend/src/application/inventory/inventory.service.ts`（`createStocktake` / `applyStocktake` / `listStocktakes`）
- Modify: `backend/src/interfaces/controllers/staff-inventory.controller.ts`、`admin.controller.ts`
- Test: `backend/tests/application/inventory/inventory-stocktake-review.spec.ts`（新建）

**Interfaces:**
- `submitStocktake(id: string, userId: string): Promise<InventoryStocktakeDto>` — 容差内直接 `APPLIED`，超出进 `SUBMITTED`
- `reviewStocktake(id, { approve: boolean; note?: string }, reviewerId): Promise<InventoryStocktakeDto>`
- 容差：`Math.max(expect * 0.02, 50)`，逐行比较；`expect` 为建单时账面

- [ ] **Step 1: 改 schema + migration**

`npx prisma migrate dev --name stocktake_review_flow`

- [ ] **Step 2: 写失败测试（4 条状态转换）**

```ts
it('容差内提交直接入账', ...);          // DRAFT → APPLIED
it('超容差提交进入待复核', ...);        // DRAFT → SUBMITTED
it('复核通过后入账且写入复核人', ...);  // SUBMITTED → APPLIED, reviewedBy
it('驳回需要填原因', ...);              // 无 note 抛错；有 note → REJECTED
it('盘点后又有领用，入账仍按建单 delta', ...); // 不重算，账面 = 实盘 + 期间变动
```

- [ ] **Step 3: 跑测试确认失败**

Run: `cd backend && npx jest tests/application/inventory/inventory-stocktake-review.spec.ts --runInBand`

- [ ] **Step 4: 改实现**

- 入账一律用 `line.deltaG`（建单时算定），**不重算**；
- `submitStocktake` 判容差；
- `reviewStocktake` 仅 `ADMIN`（controller 用 `AdminGuard`）；
- `applyStocktake` 保留为内部方法，不再对外暴露。

- [ ] **Step 5: 跑测试确认通过并提交**

```bash
git add backend/prisma backend/src backend/tests/application/inventory
git commit -m "feat(inventory): 盘点增加提交/复核/驳回状态机"
```

---

### Task 10: 报废 / 内部领用（员工可记）

**Files:**
- Modify: `backend/prisma/schema.prisma`（`InventoryAdjustment` 加 `category`、`createdBy`；`InventoryAdjustmentMode` 不变）
- Modify: `backend/src/application/inventory/inventory.service.ts`（`createManualAdjustment` 支持 `category`）
- Modify: `backend/src/interfaces/controllers/staff-inventory.controller.ts`（新增 `POST adjustments`）
- Test: `backend/tests/application/inventory/inventory-adjustment.spec.ts`（新建）

**Interfaces:**
- `POST /api/v1/staff/inventory/adjustments` body `{ ingredientId, quantity, mode: 'DELTA', category, note? }`
- 分类枚举 `InventoryAdjustmentCategory`：`INTERNAL_USE` / `EXPIRED` / `DAMAGED` / `OTHER`
- 规则：`INTERNAL_USE` 直接入账；其余按「数量 × 当时单价 ≥ 50 元」进 `PENDING_REVIEW`（新增 `reviewStatus` 字段）

- [ ] **Step 1: 改 schema + migration**

`npx prisma migrate dev --name inventory_adjustment_category`

- [ ] **Step 2: 写失败测试**

```ts
it('内部领用免审批直接入账', ...);
it('报废超过 50 元进入待复核', ...);
it('金额按发生当时单价快照', ...);
```

- [ ] **Step 3: 跑测试确认失败**

Run: `cd backend && npx jest tests/application/inventory/inventory-adjustment.spec.ts --runInBand`

- [ ] **Step 4: 改实现 + 跑测试**

金额 = `|quantity| / purchaseToBaseRatio × currentPricePerPurchaseUnit`，写入 `costAmount`；缺价一律 `PENDING_REVIEW`。

- [ ] **Step 5: 提交**

```bash
git add backend/prisma backend/src backend/tests/application/inventory
git commit -m "feat(inventory): 员工端报废/内部领用入口，含审批阈值"
```

---

### Task 11: 小程序库存首页重做

**Files:**
- Modify: `miniapp/src/pages/staff-inventory/index.vue`（整体替换）
- Modify: `miniapp/src/pages/staff-inventory/api/inventory.ts`（补字段：`lastMovement`、`lastStocktakeAt`）
- Modify: `miniapp/src/pages.json`（`staff-inventory` 加 `navigationBarBackgroundColor: "#1E3A2F"`、`navigationBarTextStyle: "white"`）
- Create: `miniapp/src/pages/staff-inventory.ui.regression.spec.ts`

**Interfaces:**
- 复用 `components/staff/StaffStatusBadge.vue`、`StaffEmptyState.vue`、`StaffQuantityText.vue`
- 复用 `utils/staff-quantity.ts`

- [ ] **Step 1: 写失败测试（源码级）**

断言：无页面内大标题（不含 `class="title"` 的「库存管理」）；筛选选中态 `color` 与 `background` 不同；最小字号 ≥24rpx；含「数据截至」「上次盘库」「记一笔」。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd miniapp && npx vitest run src/pages/staff-inventory.ui.regression.spec.ts`

- [ ] **Step 3: 实现页面**

按 UI 文档 §3：日期行、预警条、搜索、筛选、三张卡（名称/状态/大数字/建议补货+金额/最近一笔/两个动作）、底部固定栏。

- [ ] **Step 4: 跑测试 + 构建**

Run: `cd miniapp && npx vitest run src/pages/staff-inventory.ui.regression.spec.ts && npm run build:mp-weixin`

- [ ] **Step 5: 提交**

```bash
git add miniapp/src/pages/staff-inventory/index.vue miniapp/src/pages/staff-inventory/api/inventory.ts miniapp/src/pages.json miniapp/src/pages/staff-inventory.ui.regression.spec.ts
git commit -m "feat(miniapp): 库存首页按新台账重做"
```

---

### Task 12: 小程序盘点录入页

**Files:**
- Modify: `miniapp/src/pages/staff-inventory/stocktake-create.vue`（整体替换为清单式录入）
- Modify: `miniapp/src/pages/staff-inventory/api/inventory.ts`（`createStocktake` / `submitStocktake` / 草稿保存）
- Modify: `miniapp/src/pages.json`（标题改「盘点」）
- Test: `miniapp/src/pages/staff-inventory.ui.regression.spec.ts`（追加断言）

**Interfaces:**
- 盲盘：不渲染账面字段
- 排序：`lastCountedAt` 优先，其次分类 + 名称（后端在 Task 11 的 overview 里补 `lastCountedAt`）
- 草稿：本地 storage 键 `staff_stocktake_draft_v1`；提交前提示未盘项数

- [ ] **Step 1: 写失败测试（源码级）**

断言：不出现 `expectedQuantityG`/`账面`；有 `存草稿`、`已盘`、进度；输入项 `type="digit"`。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd miniapp && npx vitest run src/pages/staff-inventory.ui.regression.spec.ts`

- [ ] **Step 3: 实现页面 + 草稿持久化**

- [ ] **Step 4: 跑测试 + 构建**

Run: `cd miniapp && npx vitest run src/pages/staff-inventory.ui.regression.spec.ts && npm run build:mp-weixin`

- [ ] **Step 5: 提交**

```bash
git add miniapp/src/pages/staff-inventory/stocktake-create.vue miniapp/src/pages/staff-inventory/api/inventory.ts miniapp/src/pages.json miniapp/src/pages/staff-inventory.ui.regression.spec.ts
git commit -m "feat(miniapp): 盘点录入改为清单式盲盘"
```

---

### Task 13: 小程序盘点结果与记录

**Files:**
- Create: `miniapp/src/pages/staff-inventory/stocktake-records.vue`
- Create: `miniapp/src/pages/staff-inventory/stocktake-result.vue`
- Modify: `miniapp/src/pages.json`（两个新页面）
- Test: `miniapp/src/pages/staff-inventory.ui.regression.spec.ts`（追加断言）

**Interfaces:**
- 记录页：待复核 / 已入账两段；待复核行有「驳回重盘」「通过并入账」（仅 ADMIN 可见）
- 结果页：容差分两堆展示，正绿负红

- [ ] **Step 1: 写失败测试（源码级）**

断言：存在 `待复核`、`通过并入账`、`驳回`；`ADMIN` 权限判断；不存在把「差异绝对值」直接求和展示。

- [ ] **Step 2: 跑测试确认失败 → 实现 → 再跑通过**

Run: `cd miniapp && npx vitest run src/pages/staff-inventory.ui.regression.spec.ts`

- [ ] **Step 3: 构建并提交**

```bash
cd miniapp && npm run build:mp-weixin
git add miniapp/src/pages/staff-inventory miniapp/src/pages.json
git commit -m "feat(miniapp): 盘点记录与结果页，含管理员复核"
```

---

### Task 14: 小程序「记一笔」

**Files:**
- Create: `miniapp/src/pages/staff-inventory/adjustment-create.vue`
- Modify: `miniapp/src/pages/staff-inventory/index.vue`（底部「记一笔」跳转）
- Modify: `miniapp/src/pages.json`
- Test: `miniapp/src/pages/staff-inventory.ui.regression.spec.ts`

- [ ] **Step 1: 写失败测试（源码级）**

断言：四个分类常量；`INTERNAL_USE` 提示「免审批」；缺价提示「需复核」。

- [ ] **Step 2: 实现页面（选原料、数量、分类、备注、提交）**

- [ ] **Step 3: 跑测试 + 构建 + 提交**

```bash
cd miniapp && npx vitest run src/pages/staff-inventory.ui.regression.spec.ts && npm run build:mp-weixin
git add miniapp/src/pages/staff-inventory miniapp/src/pages.json
git commit -m "feat(miniapp): 报废/内部领用记一笔"
```

---

### Task 15: 把库存页纳入 UI 回归守门

**Files:**
- Modify: `miniapp/src/pages/staff-purchasing.ui.regression.spec.ts`（`PAGES` 数组加两个库存页）
- Test: 同上

- [ ] **Step 1: 加页面路径**

`staff-inventory/index.vue`、`staff-inventory/stocktake-create.vue`、`staff-inventory/stocktake-records.vue`、`staff-inventory/stocktake-result.vue`、`staff-inventory/adjustment-create.vue`

- [ ] **Step 2: 跑测试，修掉所有对比度/字号告警**

Run: `cd miniapp && npx vitest run src/pages/staff-purchasing.ui.regression.spec.ts`

- [ ] **Step 3: 提交**

```bash
git add miniapp/src/pages/staff-purchasing.ui.regression.spec.ts miniapp/src/pages/staff-inventory
git commit -m "test(miniapp): 库存页纳入可读性守门"
```

---

# 三期：包材 + 在途 + 净额

### Task 16: 发货时按价格快照扣袋与标签

**Files:**
- Modify: `backend/src/application/shipping/order-shipment.service.ts`（`createShipment` 事务内）
- Create: `backend/src/application/inventory/packaging-consumption.service.ts`
- Modify: `backend/src/app.module.ts`（注册）
- Test: `backend/tests/application/inventory/packaging-consumption.spec.ts`（新建）

**Interfaces:**
- `consumePackagingForShipment(shipmentId, packages, orderIds, actorId)`：
  - 袋/标签：从 `Order.pricingBreakdownSnapshot.packagingDetails` 读 `vacuumBagsCount`、`labelsCount` 与袋型原料 id
  - 写流水：`sourceType = PACKAGING_CONSUMPTION`（新增枚举）、`sourceId = shipmentId:orderId`

- [ ] **Step 1: 加枚举 + migration（`PACKAGING_CONSUMPTION`）**
- [ ] **Step 2: 写失败测试**：一单 7 袋 → 7 个真空袋 + 7 张标签的流水；重复调用幂等
- [ ] **Step 3: 实现 + 跑测试**
- [ ] **Step 4: 接入 `createShipment` 事务**
- [ ] **Step 5: 提交**

```bash
git commit -m "feat(inventory): 发货时按订单快照扣减真空袋与标签"
```

---

### Task 17: 包裹箱型 + 箱/保温袋/冰袋扣减

**Files:**
- Modify: `backend/prisma/schema.prisma`（`OrderShipmentPackage` 加 `boxIngredientId`、`thermalBagIngredientId`）
- Modify: `backend/src/application/shipping/order-shipment.service.ts`（`ShipmentPackageInput` 加 `boxIngredientId?`；缺省按总重推荐）
- Modify: `miniapp/src/pages/staff-orders/batch-ship.vue`（每个包裹加箱型选择）
- Test: `backend/tests/application/inventory/packaging-consumption.spec.ts`

**Interfaces:**
- 箱型默认值：复用 `PackagingService.calculateShippingContainers(weightG)[0]`
- 冰袋：4 号箱 3 个、3 号箱 5 个（现有映射）

- [ ] **Step 1: schema + migration**
- [ ] **Step 2: 写失败测试**：合并发货 3 单 1 包裹 → 只扣 1 个箱、1 个保温袋、3 个冰袋
- [ ] **Step 3: 实现扣减 + 小程序选箱型**
- [ ] **Step 4: 跑后端测试 + 小程序构建**
- [ ] **Step 5: 提交**

```bash
git commit -m "feat(inventory): 包裹箱型可确认，按包裹扣箱/保温袋/冰袋"
```

---

### Task 18: 补剂分装扣袋/标签/干燥剂

**Files:**
- Modify: `backend/src/application/supplement-shop/supplement-packaging.service.ts`
- Modify: `backend/src/application/supplement-shop/supplement-inventory.service.ts`
- Test: `backend/tests/application/supplement-shop/supplement-packaging-consumption.spec.ts`（新建）

- [ ] **Step 1: 写失败测试**：一单 3 袋 → 扣 3 只袋、3 张标签、按规则扣干燥剂
- [ ] **Step 2: 实现（把现有「只算需求量」接成写流水）**
- [ ] **Step 3: 跑测试 + 提交**

---

### Task 19: 在途量计入可用量

**Files:**
- Modify: `backend/src/application/purchasing/purchasing.service.ts`（`applyInventoryOffset` / `getStockReplenishmentIngredients`）
- Modify: `backend/src/application/inventory/inventory.service.ts`（`getAvailabilityByIngredientIds` 返回 `inTransitQuantityG`）
- Test: `backend/tests/application/purchasing/purchasing-inventory-allocation.spec.ts`

**Interfaces:**
- `availableQuantityG = onHand − allocated − inTransit`
- 在途 = 当天 `ORDER_DEMAND` 采购单里未完成部分的 `purchaseShortageQuantity` 折算基准单位

- [ ] **Step 1: 写失败测试**：已下单 3kg、现存 1kg、需求 5kg → 可用 1kg，缺口 4kg（不是 2kg）
- [ ] **Step 2: 实现 + 跑测试 + 提交**

---

### Task 20: 日采也按净额下单（并启用预占）

**Files:**
- Modify: `backend/src/application/purchasing/purchasing.service.ts`（`usesInventoryForRequirement` 去掉策略判断）
- Test: `backend/tests/application/purchasing/purchasing-inventory-allocation.spec.ts`

- [ ] **Step 1: 写失败测试**：日采原料现存 2kg、需求 3kg → 采购 1kg，且生成预占 2kg
- [ ] **Step 2: 实现 + 跑测试 + 提交**
- [ ] **Step 3: 上线顺序**：先跑 Task 19，再开这个；开启前确认期初盘点已完成

---

### Task 21: 补货建议与库存页展示在途

**Files:**
- Modify: `backend/src/application/purchasing/purchasing.service.ts`（`StockReplenishmentInsight` 加 `inTransitQuantity`）
- Modify: `miniapp/src/pages/staff-inventory/index.vue`（卡片加一行「在途 3袋」）
- Modify: `admin-web/src/views/Inventory.vue`（表格加「在途」列）
- Test: `miniapp/src/pages/staff-inventory.ui.regression.spec.ts`、`admin-web/src/views/Inventory.costUnit.spec.ts`

- [ ] **Step 1: 写失败测试（小程序源码断言含「在途」）**
- [ ] **Step 2: 实现 + 跑测试 + 构建 + 提交**

---

## 上线顺序（全量）

| 步 | 动作 | 前置 |
|---|---|---|
| 1 | 一期合并 → 部署后端 | — |
| 2 | 期初盘点（脚本 dry-run → apply） | 步 1 |
| 3 | 后台打开「完工自动扣料」 | 步 2 |
| 4 | 观察一周：采购涨、完工跌、负库存告警 | 步 3 |
| 5 | 二期合并 → 部署后端 + 上传小程序体验版 | 步 4 稳定 |
| 6 | 盘一次库（验证盲盘、容差、复核） | 步 5 |
| 7 | 三期合并 → 部署后端 + 上传体验版 | 步 6 |
| 8 | 包材期初盘点（单独一次） | 步 7 |

## 验收标准（全量）

1. 一笔采购 → 一锅生产 → 一份出库，三段数量能对上。
2. 每条流水都能点回源单；没有「无来源」的库存变动。
3. 盘点差异能按「报废 / 内部领用 / 盘亏」分开统计。
4. 任意一笔变动能查到操作人和时间。
5. 包材在发货后余额下降，合并发货不多扣。
6. 补货建议不含已下单在途，不重复下单。

## 不做

- 补货清单页、流水页（点回源单）：下一轮单独做。
- 多仓/库位、批次效期。
- 订单成本口径调整。
- 工作台红点含义（下一轮单独定）。
