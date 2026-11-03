# Production Completion And Cost Settlement Phase Two B/C Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let staff complete production by recording only finished-product surplus or shortage, then settle inventory consumption, batch cost, and order cost/margin summaries from auditable backend records.

**Architecture:** Keep staff input at the packaging-unit level because the current production workflow already treats `PackagingUnit` as the kitchen task. Store production result fields on `PackagingUnit`, aggregate them onto `ProductionBatch`, consume active inventory allocations as inventory ledger movements, and persist a `ProductionBatchCostSettlement` plus per-order `OrderCostSettlement` snapshots. This is a first operational settlement version: it uses active allocation lines and completed purchase records as cost sources, with weighted order splitting by planned grams; fine-grained FIFO lot costing remains out of scope.

**Tech Stack:** NestJS, Prisma, PostgreSQL migrations, Jest, uni-app Vue 3, WeChat mini program preview.

---

## Scope Check

This plan implements Phase 2B and Phase 2C from `docs/superpowers/specs/2026-04-16-order-procurement-production-inventory-chain-design.md`.

Included:

- Staff production completion records `NORMAL`, `SURPLUS`, or `SHORTAGE`.
- Staff records surplus or shortage grams only; no per-ingredient actual usage is required.
- Optional production result photo URLs can be saved.
- Production completion consumes active inventory allocations linked to the affected orders.
- Batch settlement snapshots planned output, actual output, surplus, shortage, inventory cost, purchase cost, loss cost, total actual cost, and suggested refund amount.
- Order settlement snapshots estimated cost, actual allocated cost, revenue, actual margin, and suggested shortage adjustment.
- Admin/order financial summary can read actual cost and margin after settlement.

Not included:

- FIFO or lot-level costing by exact purchase record.
- Automatically changing the payable/refund state of an order.
- Blocking shipment on shortage adjustments.
- Editing recipe production loss rates automatically.

## File Structure

Create:

- `backend/prisma/migrations/202604170002_add_production_completion_settlement/migration.sql`
  Adds production result fields, cost settlement tables, and new inventory ledger source types.

- `backend/src/application/production/production-cost-settlement.service.ts`
  Calculates and persists batch and order cost settlement snapshots.

- `backend/tests/application/production/production-completion-settlement.spec.ts`
  Covers production result recording, allocation consumption, and cost settlement.

Modify:

- `backend/prisma/schema.prisma`
  Adds settlement models and production result fields.

- `backend/src/domain/production/packaging-unit.entity.ts`
  Carries production result fields and validates surplus/shortage.

- `backend/src/domain/production/production-batch.entity.ts`
  Carries aggregate completion and cost snapshot fields.

- `backend/src/domain/inventory/enums.ts`
  Adds `PRODUCTION_ALLOCATION_CONSUMPTION` and `PRODUCTION_SURPLUS`.

- `backend/src/application/inventory/inventory.service.ts`
  Adds allocation consumption and surplus inbound methods.

- `backend/src/infrastructure/repositories/prisma-production.repository.ts`
  Persists production result and batch settlement fields.

- `backend/src/application/production/kitchen.service.ts`
  Accepts completion result DTO for `/staff/production/packaging-units/:id/complete`.

- `backend/src/application/production/production.service.ts`
  Triggers settlement after all units in a batch are complete.

- `backend/src/interfaces/controllers/staff-production.controller.ts`
  Documents and forwards production completion result input.

- `backend/src/application/order/order.service.ts`
  Adds read-only financial summary method.

- `backend/src/interfaces/controllers/admin.controller.ts`
  Exposes admin order financial summary.

- `miniapp/src/api/production.ts`
  Sends completion result fields.

- `miniapp/src/pages/staff-production/detail.vue`
  Adds a compact completion panel for normal/surplus/shortage.

## Task 1: Schema And Domain Fields

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/202604170002_add_production_completion_settlement/migration.sql`
- Modify: `backend/src/domain/production/packaging-unit.entity.ts`
- Modify: `backend/src/domain/production/production-batch.entity.ts`
- Modify: `backend/src/domain/inventory/enums.ts`

- [ ] **Step 1: Write failing domain tests**

Create or extend `backend/tests/application/production/production-completion-settlement.spec.ts` with tests that construct a `PackagingUnit`, call `recordProductionResult({ resultStatus: 'SURPLUS', surplusG: 250 })`, and expect `actualOutputG` to be `totalProductionG + 250`.

- [ ] **Step 2: Run domain test to verify RED**

Run:

```bash
cd backend && npm test -- tests/application/production/production-completion-settlement.spec.ts --runInBand
```

Expected: FAIL because `recordProductionResult` does not exist.

- [ ] **Step 3: Add schema and migration**

Add nullable result fields to `PackagingUnit`:

- `resultStatus String? @map("result_status") @db.VarChar(20)`
- `actualOutputG Float? @map("actual_output_g")`
- `surplusG Float? @map("surplus_g")`
- `shortageG Float? @map("shortage_g")`
- `resultPhotoUrls String[] @default([]) @map("result_photo_urls")`
- `completedAt DateTime? @map("completed_at")`

Add aggregate fields to `ProductionBatch`:

- `plannedOutputG Float? @map("planned_output_g")`
- `actualOutputG Float? @map("actual_output_g")`
- `surplusG Float? @map("surplus_g")`
- `shortageG Float? @map("shortage_g")`
- `actualCost Decimal? @map("actual_cost") @db.Decimal(10, 2)`
- `costSettlementSnapshot Json? @map("cost_settlement_snapshot")`
- `completedAt DateTime? @map("completed_at")`

Create models:

- `ProductionBatchCostSettlement`
- `OrderCostSettlement`

Extend `InventorySourceType` with:

- `PRODUCTION_ALLOCATION_CONSUMPTION`
- `PRODUCTION_SURPLUS`

Add nullable `costAmount Decimal? @map("cost_amount") @db.Decimal(10, 2)` to `InventoryLedgerEntry`.

- [ ] **Step 4: Add domain methods**

Implement `PackagingUnit.recordProductionResult()` with these rules:

- `NORMAL`: surplus and shortage must be zero; actual output equals planned output.
- `SURPLUS`: `surplusG > 0`, shortage is zero; actual output equals planned output plus surplus.
- `SHORTAGE`: `shortageG > 0`, surplus is zero; actual output equals max(planned output minus shortage, zero).
- Photo URLs are optional arrays.

- [ ] **Step 5: Generate Prisma client and run tests**

Run:

```bash
cd backend && npm run prisma:generate:build
cd backend && npm test -- tests/application/production/production-completion-settlement.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/202604170002_add_production_completion_settlement/migration.sql backend/src/domain/production/packaging-unit.entity.ts backend/src/domain/production/production-batch.entity.ts backend/src/domain/inventory/enums.ts backend/tests/application/production/production-completion-settlement.spec.ts
git commit -m "feat: add production completion settlement schema"
```

## Task 2: Inventory Allocation Consumption

**Files:**
- Modify: `backend/src/application/inventory/inventory.service.ts`
- Modify: `backend/tests/application/inventory/inventory-allocation.service.spec.ts`

- [ ] **Step 1: Write failing service test**

Add a test that mocks active allocations for `sourceOrderIds = ['order-1']`, calls `consumeAllocationsForOrderIds(['order-1'], 'batch-1')`, and expects negative ledger entries with source type `PRODUCTION_ALLOCATION_CONSUMPTION` and allocation status `CONSUMED`.

- [ ] **Step 2: Run test to verify RED**

Run:

```bash
cd backend && npm test -- tests/application/inventory/inventory-allocation.service.spec.ts --runInBand
```

Expected: FAIL because `consumeAllocationsForOrderIds` does not exist.

- [ ] **Step 3: Implement allocation consumption**

Add `consumeAllocationsForOrderIds(orderIds: string[], batchId: string)`:

- Find active `InventoryAllocation` rows whose `sourceOrderIds` overlap.
- For each allocation line, create one negative `InventoryLedgerEntry`.
- Use `sourceId = batchId + ':' + allocation.id` to preserve uniqueness per ingredient.
- Set consumed allocations to `CONSUMED` and `consumedAt = now`.
- Return `{ consumedAllocationCount, ledgerEntryCount, totalConsumedQuantityG, totalInventoryCost }`.

- [ ] **Step 4: Add production surplus inbound**

Add `recordProductionSurplus(batchId: string, lines)`:

- Creates positive ledger entries with source type `PRODUCTION_SURPLUS`.
- Uses cost amount from settlement if present; otherwise zero.
- Idempotently skips existing entries.

- [ ] **Step 5: Run inventory tests**

Run:

```bash
cd backend && npm test -- tests/application/inventory/inventory-allocation.service.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/application/inventory/inventory.service.ts backend/tests/application/inventory/inventory-allocation.service.spec.ts
git commit -m "feat: consume inventory allocations for production"
```

## Task 3: Production Completion API

**Files:**
- Modify: `backend/src/application/production/kitchen.service.ts`
- Modify: `backend/src/interfaces/controllers/staff-production.controller.ts`
- Modify: `backend/src/infrastructure/repositories/prisma-production.repository.ts`
- Test: `backend/tests/application/production/production-completion-settlement.spec.ts`

- [ ] **Step 1: Write failing completion test**

Test `completeProductionTask(unitId, dto)` with `{ resultStatus: 'SHORTAGE', shortageG: 300 }` and expect the saved packaging unit to contain `shortageG = 300`, `actualOutputG = totalProductionG - 300`, and status `COMPLETED`.

- [ ] **Step 2: Run test to verify RED**

Run:

```bash
cd backend && npm test -- tests/application/production/production-completion-settlement.spec.ts --runInBand
```

Expected: FAIL because completion does not accept result DTO.

- [ ] **Step 3: Implement completion DTO**

Add optional body fields to `/staff/production/packaging-units/:id/complete`:

- `resultStatus?: 'NORMAL' | 'SURPLUS' | 'SHORTAGE'`
- `surplusG?: number`
- `shortageG?: number`
- `resultPhotoUrls?: string[]`

Default to `NORMAL` when omitted.

- [ ] **Step 4: Persist production result**

Update repository mapping and `updatePackagingUnit()` to save and load new result fields.

- [ ] **Step 5: Run production tests**

Run:

```bash
cd backend && npm test -- tests/application/production/production-completion-settlement.spec.ts tests/application/production/production.service.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/application/production/kitchen.service.ts backend/src/interfaces/controllers/staff-production.controller.ts backend/src/infrastructure/repositories/prisma-production.repository.ts backend/tests/application/production/production-completion-settlement.spec.ts
git commit -m "feat: record production surplus and shortage"
```

## Task 4: Batch Cost Settlement

**Files:**
- Create: `backend/src/application/production/production-cost-settlement.service.ts`
- Modify: `backend/src/application/production/production.service.ts`
- Modify: `backend/src/app.module.ts`
- Test: `backend/tests/application/production/production-completion-settlement.spec.ts`

- [ ] **Step 1: Write failing settlement test**

Test a completed batch with two orders, one consumed allocation line, and one completed purchase record. Expect a persisted `ProductionBatchCostSettlement` and two `OrderCostSettlement` rows split by planned grams.

- [ ] **Step 2: Run test to verify RED**

Run:

```bash
cd backend && npm test -- tests/application/production/production-completion-settlement.spec.ts --runInBand
```

Expected: FAIL because `ProductionCostSettlementService` does not exist.

- [ ] **Step 3: Implement settlement service**

Implement:

- `settleCompletedBatch(batchId: string)`
- `getOrderFinancialSummary(orderId: string)`

Settlement inputs:

- Planned grams from `PackagingUnit.totalProductionG`.
- Actual grams from `PackagingUnit.actualOutputG`.
- Surplus and shortage from unit result fields.
- Inventory cost from consumed allocation ledger `costAmount`.
- Purchase cost from completed order-demand purchase records whose purchase list overlaps source orders.
- Estimated cost from order pricing snapshot.

Settlement output:

- Upsert one batch settlement.
- Upsert one order settlement per source order.
- Create pending shortage adjustment snapshot when shortage is present, but do not change order payable amount.

- [ ] **Step 4: Hook batch completion**

After `checkAndCompleteBatch()` marks a batch completed, call:

```ts
await this.productionCostSettlementService.settleCompletedBatch(batchId);
```

- [ ] **Step 5: Run settlement tests**

Run:

```bash
cd backend && npm test -- tests/application/production/production-completion-settlement.spec.ts tests/application/production/production.service.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/application/production/production-cost-settlement.service.ts backend/src/application/production/production.service.ts backend/src/app.module.ts backend/tests/application/production/production-completion-settlement.spec.ts
git commit -m "feat: settle production batch costs"
```

## Task 5: Order Financial Summary

**Files:**
- Modify: `backend/src/application/order/order.service.ts`
- Modify: `backend/src/interfaces/controllers/admin.controller.ts`
- Test: `backend/tests/application/order/order-financial-summary.spec.ts`

- [ ] **Step 1: Write failing order summary test**

Test `getOrderFinancialSummary(orderId)` returns original amount, estimated cost, actual cost, actual margin, shortage adjustment amount, and whether customer payment is required.

- [ ] **Step 2: Run test to verify RED**

Run:

```bash
cd backend && npm test -- tests/application/order/order-financial-summary.spec.ts --runInBand
```

Expected: FAIL because the method does not exist.

- [ ] **Step 3: Implement read-only summary**

Add `OrderService.getOrderFinancialSummary(orderId)` using:

- `Order.amountTotal` as revenue.
- `pricingBreakdownSnapshot.totalProductCost` or component costs as estimated cost.
- Latest `OrderCostSettlement.actualCost` as actual cost.
- Pending shortage adjustment from settlement snapshot.

- [ ] **Step 4: Add admin endpoint**

Expose:

```text
GET /api/v1/admin/orders/:orderId/financial-summary
```

- [ ] **Step 5: Run summary tests**

Run:

```bash
cd backend && npm test -- tests/application/order/order-financial-summary.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/application/order/order.service.ts backend/src/interfaces/controllers/admin.controller.ts backend/tests/application/order/order-financial-summary.spec.ts
git commit -m "feat: expose order financial summary"
```

## Task 6: Miniapp Production Completion UI

**Files:**
- Modify: `miniapp/src/api/production.ts`
- Modify: `miniapp/src/pages/staff-production/detail.vue`

- [ ] **Step 1: Add API helper fields**

Change `completeProductionTask(unitId)` to accept an optional payload:

```ts
completeProductionTask(unitId, {
  resultStatus,
  surplusG,
  shortageG,
  resultPhotoUrls,
})
```

- [ ] **Step 2: Add completion panel**

On the staff production detail page, show a segmented choice:

- 正常完成
- 有余量
- 有缺口

Show a numeric input only for surplus or shortage.

- [ ] **Step 3: Run miniapp tests and preview**

Run:

```bash
cd miniapp && npm test
cd miniapp && SEVENKITCHEN_PREVIEW_ONCE=1 SEVENKITCHEN_SKIP_DEVTOOLS=1 SEVENKITCHEN_PREVIEW_TIMEOUT_SECONDS=90 npm run preview
```

Expected: PASS and preview build successful.

- [ ] **Step 4: Commit**

```bash
git add miniapp/src/api/production.ts miniapp/src/pages/staff-production/detail.vue
git commit -m "feat: collect production completion result"
```

## Task 7: Final Verification

- [ ] **Step 1: Run backend focused tests**

```bash
cd backend && npm test -- tests/application/inventory/inventory-allocation.service.spec.ts tests/application/production/production-completion-settlement.spec.ts tests/application/production/production.service.spec.ts tests/application/order/order-financial-summary.spec.ts --runInBand
```

- [ ] **Step 2: Run backend build**

```bash
cd backend && npm run build
```

- [ ] **Step 3: Run miniapp tests**

```bash
cd miniapp && npm test
```

- [ ] **Step 4: Run miniapp preview**

```bash
cd miniapp && SEVENKITCHEN_PREVIEW_ONCE=1 SEVENKITCHEN_SKIP_DEVTOOLS=1 SEVENKITCHEN_PREVIEW_TIMEOUT_SECONDS=90 npm run preview
```

- [ ] **Step 5: Check git state**

```bash
git diff --check
git status --short
```

Expected: no whitespace errors; only intentional files changed before final commit.
