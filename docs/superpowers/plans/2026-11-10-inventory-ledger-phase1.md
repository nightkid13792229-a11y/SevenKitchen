# 库存台账一期（把账修对）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让「采购入库 − 生产扣料 = 账面库存」这条公式在系统里真正成立，并且每一笔变动都能查到人。

**Architecture:** 全部改动集中在后端与 Prisma：采购完成时不再按采购策略过滤，一律入库；批次结算只标记预占已消耗、不再写第二笔扣减；完工扣料保留唯一口径；台账改为只增不删（撤回写冲红）；盘点/调整/完工补操作人字段。

**Tech Stack:** NestJS、Prisma（PostgreSQL）、Jest。

**Spec:** `docs/superpowers/specs/2026-11-09-inventory-ledger-design.md`（界面部分见 `2026-11-10-inventory-ui-design.md`，本期不含 UI）

## Global Constraints

- 字段命名遵循 `docs/DATABASE_NAMING_CONVENTIONS.md`；表结构以 `backend/prisma/schema.prisma` 为准。
- 禁止直接改数据库：所有结构变更走 `npx prisma migrate dev`，脚本一律「默认 dry-run，加 `--apply` 才写」。
- 不改订单成本口径：成本仍按「当前价 × 配方用量」，`ProductionBatchCostSettlement.inventoryCost` 保持 0。
- 台账只增不删：任何撤回都写负数行，不 `deleteMany`。
- 单位：数量一律以原料基准单位（g / ml / pcs）落账，展示层再换算。
- 测试：`cd backend && npx jest <path> --runInBand`；提交前 `npx tsc --noEmit`。

## Review Focus

1. **重复点「完成采购」**——同一张采购单点两次，不能入库两次；期望第二次是 0 条新增。
2. **冲红之后又点「完成采购」**——不能让冲红行被当成入库再次扣减，余额要回到冲红后的状态。
3. **车间端没登录/没 token**——加鉴权后，车间点「完工」必须给出明确失败提示，不能静默不扣料。
4. **采购没完成就手工建批次**——必须被拦；`force` 只允许管理员用，且要留痕。
5. **期初盘点漏掉账面为 0 的原料**——冰箱里有、账上没有的货，必须能录进去。

---

### Task 1: 采购完成时全部入库（不再按策略过滤）

**Files:**
- Modify: `backend/src/application/inventory/inventory.service.ts`（`inboundFromPurchaseRecords`，约 269–360 行）
- Test: `backend/tests/application/inventory/inventory.service.spec.ts`

**Interfaces:**
- Consumes: `PurchaseRecord.actualBaseQuantity`、`PurchaseRecord.id`
- Produces: `inboundFromPurchaseRecords(records: PurchaseRecord[]): Promise<{ createdCount: number; skippedCount: number }>`（签名不变）

- [ ] **Step 1: 写失败测试**

在现有 spec 里新增：

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
Expected: FAIL（只入账了 `ing-stock`）

- [ ] **Step 3: 改实现**

删掉 `inboundFromPurchaseRecords` 里查 `ingredient.procurementStrategy` 的整段过滤（`stockManagedStrategies` / `stockManagedIngredientIds`），所有 `actualBaseQuantity > 0` 的记录都生成 `PURCHASE_RECORD` 流水；`skippedCount` 只统计数量 ≤ 0 的记录。

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
- Produces: `consumeAllocationsForOrderIds(orderIds: string[], batchId: string): Promise<ConsumeInventoryAllocationResult>`，其中 `ledgerEntryCount` 恒为 `0`

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
Expected: FAIL（当前会调用 `createMany`）

- [ ] **Step 3: 改实现**

删除构造 `PRODUCTION_ALLOCATION_CONSUMPTION` 流水的整段；事务里只保留 `inventoryAllocation.updateMany({ status: 'CONSUMED' })`；返回值里 `ledgerEntryCount: 0`、`totalConsumedQuantityG` 仍按预占行数汇总（用于成本快照展示）。

- [ ] **Step 4: 跑测试确认通过**

Run: 同上。Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add backend/src/application/inventory/inventory.service.ts backend/tests/application/inventory/inventory-allocation.service.spec.ts
git commit -m "fix(inventory): 批次结算只标记预占已消耗，不再重复扣库存"
```

---

### Task 3: 盘点 / 调整 / 完工记录操作人

**Files:**
- Modify: `backend/prisma/schema.prisma`（`InventoryStocktake`、`InventoryAdjustment`、`PackagingUnit`）
- Create: `backend/prisma/migrations/<ts>_inventory_operator_fields/migration.sql`（`prisma migrate dev` 生成）
- Modify: `backend/src/application/inventory/inventory.service.ts`（`createStocktake` / `createManualAdjustment`）
- Modify: `backend/src/interfaces/controllers/staff-inventory.controller.ts`、`backend/src/interfaces/controllers/admin.controller.ts`、`backend/src/interfaces/controllers/staff-kitchen.controller.ts`
- Test: `backend/tests/application/inventory/inventory.service.spec.ts`（盘点和调整都在这里加）

**Interfaces:**
- Produces:
  - `createStocktake(dto: CreateInventoryStocktakeDto, createdBy?: string)`
  - `createManualAdjustment(dto: CreateInventoryAdjustmentDto, createdBy?: string)`
  - `PackagingUnit.completedBy: string | null`

- [ ] **Step 1: 改 schema 并生成 migration**

三个模型各加一列：`createdBy String? @map("created_by") @db.VarChar(36)`；`PackagingUnit` 加 `completedBy String? @map("completed_by") @db.VarChar(36)`。
Run: `cd backend && npx prisma migrate dev --name inventory_operator_fields`
Expected: 生成 migration 且 `prisma generate` 成功。

- [ ] **Step 2: 写失败测试**

> 注：`createStocktake` 走 `prisma.$transaction`，测试里把 `$transaction` 实现成「回调透传」，断言写在 `tx.inventoryStocktake.create` 的 mock 上。

```ts
it('创建盘点单时写入操作人', async () => {
  const dto = await service.createStocktake({ lines: [{ ingredientId: 'i-1', countedQuantityG: 10 }] }, 'user-1');
  expect(prisma.inventoryStocktake.create.mock.calls[0][0].data.createdBy).toBe('user-1');
});
```

- [ ] **Step 3: 跑测试确认失败**

Run: `cd backend && npx jest tests/application/inventory/inventory.service.spec.ts -t "写入操作人" --runInBand`
Expected: FAIL（`createdBy` 为 undefined）

- [ ] **Step 4: 改实现**

service 的 `create`/`createMany` 写入 `createdBy`；三个 controller 用 `@UserId() userId` 透传（`staff-kitchen` 的完工接口在 Task 6 一起加守卫）。

- [ ] **Step 5: 跑测试确认通过并提交**

Run: 同上。Expected: PASS

```bash
git add backend/prisma backend/src backend/tests
git commit -m "feat(inventory): 盘点/调整/完工记录操作人"
```

---

### Task 4: 撤回入库改为冲红（不再删除流水）

**Files:**
- Modify: `backend/prisma/schema.prisma`（`enum InventorySourceType` 加 `PURCHASE_RECORD_REVERSAL`）
- Modify: `backend/src/application/inventory/inventory.service.ts`（`releasePurchaseRecordInboundsForPurchaseList`，约 363–389 行）
- Test: `backend/tests/application/inventory/inventory.service.spec.ts`

**Interfaces:**
- Produces: 冲红流水 `sourceType = PURCHASE_RECORD_REVERSAL`、`sourceId = purchaseRecordId`、`deltaG = -原值`

- [ ] **Step 1: 改 enum + migration**

`npx prisma migrate dev --name inventory_purchase_reversal`；同步 `backend/src/domain/inventory/enums.ts` 与前端类型映射（`admin-web/src/types/ingredient.ts` 的 `InventorySourceType`）。

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
Expected: FAIL（当前调用 `deleteMany`）

- [ ] **Step 4: 改实现**

先 `findMany` 出该采购单下所有 `PURCHASE_RECORD` 流水，按 `ingredientId` 写等量负数行（`skipDuplicates`），再返回 `reversedCount`。重复调用要幂等：已有 `PURCHASE_RECORD_REVERSAL` 的跳过。

- [ ] **Step 5: 跑测试确认通过并提交**

```bash
git add backend/prisma backend/src backend/tests admin-web/src/types
git commit -m "feat(inventory): 撤回采购入库改为冲红，流水只增不删"
```

---

### Task 5: 排产前校验采购已完成

**Files:**
- Modify: `backend/src/application/production/production.service.ts`（`createProductionBatch`，约 107 行）
- Modify: `backend/src/application/production/production.service.ts`（`CreateProductionBatchDto`，约 36 行）
- Test: `backend/tests/application/production/production.service.spec.ts`

**Interfaces:**
- Produces: `CreateProductionBatchDto.force?: boolean`；未完成采购且 `force !== true` 时抛 `BadRequestException('请先完成当天的采购任务后再排产')`

- [ ] **Step 1: 写失败测试**

```ts
it('采购未完成时拒绝建批次', async () => {
  await expect(service.createProductionBatch({ productionDate: '2026-11-10' })).rejects.toThrow('请先完成当天的采购任务后再排产');
});
it('管理员强制排产可以跳过', async () => {
  await expect(service.createProductionBatch({ productionDate: '2026-11-10', force: true })).resolves.toBeDefined();
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest tests/application/production/production.service.spec.ts -t "排产" --runInBand`
Expected: FAIL

- [ ] **Step 3: 改实现**

在加载订单之前，查 `PurchaseListKind.ORDER_DEMAND` + 当天日期，存在非 `COMPLETED` 且 `force !== true` → 抛错；`force` 时打 `logger.warn` 并写入 `ProductionBatch.notes`（没有该字段则只记日志）。

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
- Consumes: `@UserId()`、`AuthGuard`、`StaffGuard`
- Produces: `PackagingUnit.completedBy = userId`

- [ ] **Step 1: 写失败测试**

控制器 spec：未带 token 的请求返回 401；带 token 时把 `userId` 传给 service（`expect(service.completeTask).toHaveBeenCalledWith('task-1', expect.objectContaining({ completedBy: 'user-1' }))`）。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest tests/controllers/staff-kitchen.controller.spec.ts --runInBand`
Expected: FAIL（当前没有守卫）

- [ ] **Step 3: 改实现**

类上加 `@UseGuards(AuthGuard, StaffGuard)`；完工方法加 `@UserId() userId` 并透传，service 更新 `completedBy`。

- [ ] **Step 4: 跑测试确认通过并提交**

```bash
git add backend/src/interfaces/controllers/staff-kitchen.controller.ts backend/src/application/kitchen backend/tests/controllers
git commit -m "feat(kitchen): 完工接口加鉴权并记录操作人"
```

---

### Task 7: 完工扣料默认为开（仅影响新装）

**Files:**
- Modify: `backend/src/application/config/global-config.service.ts`（两处 `?? false`）
- Modify: `admin-web/src/views/GlobalConfig.vue`（表单默认值 `false` → `true`）
- Test: `backend/tests/application/config/global-config.service.spec.ts`

- [ ] **Step 1: 写失败测试**

```ts
it('未配置时默认开启完工自动扣料', async () => {
  const cfg = await service.getGlobalConfig();
  expect(cfg.autoDeductInventoryOnProduction).toBe(true);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest tests/application/config/global-config.service.spec.ts -t "默认开启完工自动扣料" --runInBand`
Expected: FAIL

- [ ] **Step 3: 改实现并跑测试**

两处 `?? false` 改 `?? true`；后台表单默认值改 `true`。
Run: 同上。Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add backend/src/application/config/global-config.service.ts admin-web/src/views/GlobalConfig.vue backend/tests/application/config
git commit -m "feat(config): 完工自动扣料默认开启（新装）"
```

> ⚠️ 上线顺序：先部署代码 → 做期初盘点 → 再在后台把开关打开。改默认值不会影响已经存过的配置行。

---

### Task 8: 期初盘点导入脚本

**Files:**
- Create: `backend/scripts/opening-stocktake.ts`
- Modify: `backend/package.json`（加 `backfill:opening-stocktake` / `:apply`）
- Test: `backend/tests/scripts/opening-stocktake.spec.ts`

**Interfaces:**
- Produces: `runOpeningStocktake({ csvPath, apply, createdBy })`，CSV 列 `ingredient_name,counted_quantity,unit`
- 行为：按名称匹配原料 → 调 `inventoryService.createStocktake({ lines, applyImmediately: apply, note: '期初盘点' }, createdBy)`；`apply=false` 只打印将写入的行数与差异。

- [ ] **Step 1: 写失败测试**

```ts
it('CSV 里账面为 0 的原料也会进盘点单', async () => {
  const result = await runOpeningStocktake({ csvPath: fixture, apply: false, createdBy: 'u-1' });
  expect(result.lines.map((l) => l.ingredientName)).toContain('南瓜');
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest tests/scripts/opening-stocktake.spec.ts --runInBand`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现脚本**

按仓库既有 backfill 脚本风格：默认 dry-run，`--apply` 才写；名称匹配不到时列出全部未匹配项并退出码 1；`unit` 与原料 `baseUnit`/`unitDisplayLabel` 不一致时拒绝该行。

- [ ] **Step 4: 跑测试确认通过并提交**

```bash
git add backend/scripts/opening-stocktake.ts backend/package.json backend/tests/scripts
git commit -m "feat(inventory): 期初盘点导入脚本（默认 dry-run）"
```

---

## 上线顺序（一期）

1. 合并到 main → 部署后端（`bash backend/scripts/remote_deploy_v2.sh`）。
2. 先**不要**打开「完工自动扣料」。
3. 盘点冻库 → 导出 CSV → `npm run backfill:opening-stocktake -- --csv=...` 核对 → `--apply`。
4. 后台打开「完工自动扣料」。
5. 观察一周：账面是否随采购涨、随完工跌；负库存是否出现。
6. 二期开始做盘库界面与复核。

## 不在本期范围

- 包材扣减、在途、净额下单（三期）。
- 盘库录入/复核 UI（二期）。
- 订单成本口径调整。
