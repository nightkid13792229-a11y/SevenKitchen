# 补货「下单即记 + 到货确认」Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把「补货」从计划单改造成「下单即记 → 在途 → 到货入库 → 报销」的轻流程，一单 1 分钟内记完。

**Architecture:** 复用 `purchase_list`（`kind = STOCK_REPLENISHMENT`）作为一条补货记录的容器：识别前是草稿（`isDraft = true`，无明细），保存时创建明细/采购记录并转为 `COMPLETED`，同时写入订单级金额与「本次报销金额」；到货是独立动作，只有到货才写入库存流水。补货在途与日采待买分开计算；报销服务对补货记录读 `reimbursementAmount`，对日采保持原口径。

**Tech Stack:** NestJS + Prisma + PostgreSQL（后端）；uni-app / Vue 3（小程序）；Vue 3 + Element Plus（后台）；Jest、Vitest。

**Spec:** `docs/superpowers/specs/2026-11-10-replenishment-record-design.md`

## 执行状态（2026-11-10）

- **已完成并提交**：Task 1～11。Task 12 的回归执行如下。
- **后端**：`purchasing + inventory + domain` 302 条通过；`prisma validate` 通过；改动文件 `tsc --noEmit` 无新增错误。
- **小程序**：补货页、详情、核对、报销相关 102 条通过；1 条既有红灯（报销提交页文案，非本改动）。
- **构建**：`miniapp npm run build:mp-weixin`、`admin-web npm run build` 均通过。
- **补充完成（2026-11-10 晚）**：
  - 保存后改明细（`PATCH /replenishment/:id`，详情页「修改」；已到货要先撤销到货）。
  - 撤销到货（`POST /replenishment/:id/unarrive`；有下游消耗时拒绝）。
  - 一次传 1～5 张订单截图（每张一笔订单；核对页按订单切换，保存时逐笔落记录）。
- **仍未做**：开发者工具真机冒烟（需要登录态，本会话未做）；旧 PENDING 补货单仍走旧流程。

## Global Constraints

- 补货不建计划单、不列购物清单；没有「开始采购 / 确认完成」。
- 一张订单 = 一条补货记录；保存时点 = 下单时点；保存后状态是「在途」，库存不动。
- 库存只算已到货；补货建议用「在库 + 补货在途」；**不能复用/相加现有日采 `inTransitQuantity`**。
- 本次报销金额 = 实付 − 个人商品合计；带优惠/关税/运费时也以这个数为准。
- 个人商品不生成采购记录；整单个人不生成补货记录。
- 按重量（斤/公斤/克/两）只对基准单位 G/ML 的原料生效；PCS 原料必须走商品 + 净含量。
- 报销：待审核/已报销锁定记录；驳回/需重提解锁；自己买自己审不需要转账凭证。
- 到货后不直接改数量/删行/作废；先撤销到货（未报销、未被消耗）。
- 识别 20 秒只是前端「还在识别」提示，不是服务端硬超时；失败不扣配额。
- 所有金额 `Decimal(10,2)`、数量 `Decimal(18,6)` 或 Float，遵循现有字段口径。
- 主工作区只读；改动只在本工位提交，用 `bash scripts/session.sh commit`。

## Review Focus

1. **已报销但未到货**：记录仍在待收货，仍能点「已到货」，库存正确增加；页面同时显示两个维度。
2. **带优惠/关税/个人商品**：报销金额 = 实付 − 个人，`voucherAmount ≥ 报销金额` 校验通过；行合计与实付的差额不摊到行。
3. **按重量 + PCS 原料**：「3 斤羊心」记 1500g；「鸡蛋 5 斤」被拦住并要求用商品净含量。
4. **重复图 / 订单列表页**：同一张图不能记两次；订单列表页直接拒绝，不产生脏数据。
5. **到货后改数 / 撤销到货**：改数量必须走撤销到货；已消耗时禁止；重复点「已到货」不重复入库。

---

### Task 1: 补货记录字段与草稿不变式

**Files:**
- Modify: `backend/prisma/schema.prisma`（`model PurchaseList`）
- Create: `backend/prisma/migrations/20261110120000_replenishment_record_fields/migration.sql`
- Modify: `backend/src/domain/purchasing/purchase-list.entity.ts`
- Test: `backend/tests/domain/purchasing/purchase-list.entity.spec.ts`

**Interfaces:**
- Consumes: 现有 `PurchaseList` / `PurchaseListConstructor`。
- Produces: `PurchaseListConstructor` 新增可选字段：`isDraft?: boolean`、`orderNo?: string | null`、`channel?: string | null`、`orderPlacedAt?: Date | null`、`expectedDeliveryAt?: Date | null`、`arrivedAt?: Date | null`、`subtotalAmount?: number | null`、`shippingFee?: number | null`、`packagingFee?: number | null`、`discountAmount?: number | null`、`paidAmount?: number | null`、`personalAmount?: number | null`、`reimbursementAmount?: number | null`、`voidedAt?: Date | null`；这些字段同时出现在类属性、`toPrisma()`、`fromPrisma()`。

- [ ] **Step 1: 写失败测试（草稿可以为 0 明细）**

```ts
// backend/tests/domain/purchasing/purchase-list.entity.spec.ts
import { PurchaseList } from '../../../src/domain/purchasing/purchase-list.entity';
import { PurchaseListKind, PurchaseListStatus } from '../../../src/domain/purchasing/enums';

const base = {
  targetDate: new Date('2026-11-10T12:00:00'),
  kind: PurchaseListKind.STOCK_REPLENISHMENT,
  totalEstimatedCost: 0,
  itemCount: 0,
  createdById: 'user-1',
  sourceOrderIds: [],
};

it('allows an empty draft replenishment record', () => {
  const list = new PurchaseList({ ...base, isDraft: true });
  expect(list.isDraft).toBe(true);
  expect(list.itemCount).toBe(0);
});

it('still rejects an empty non-draft list', () => {
  expect(() => new PurchaseList({ ...base })).toThrow('Item count must be positive');
});

it('round-trips replenishment amount fields', () => {
  const list = new PurchaseList({
    ...base,
    isDraft: true,
    orderNo: '261109957522606982',
    channel: 'HEMA',
    paidAmount: 113.03,
    personalAmount: 0,
    reimbursementAmount: 113.03,
  });
  const prisma = list.toPrisma();
  expect(prisma.paidAmount).toBe(113.03);
  expect(prisma.reimbursementAmount).toBe(113.03);
  expect(prisma.orderNo).toBe('261109957522606982');
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd backend && npx jest tests/domain/purchasing/purchase-list.entity.spec.ts`
Expected: FAIL（`isDraft` 不存在 / 0 明细被 `Item count must be positive` 拒绝）。

- [ ] **Step 3: 加 schema 字段与 migration**

在 `model PurchaseList` 增加（全部可空，除 `isDraft` 默认 false）：

```prisma
  isDraft             Boolean   @default(false) @map("is_draft")
  orderNo             String?   @map("order_no") @db.VarChar(40)
  channel             String?   @map("channel") @db.VarChar(30)
  orderPlacedAt       DateTime? @map("order_placed_at")
  expectedDeliveryAt  DateTime? @map("expected_delivery_at")
  arrivedAt           DateTime? @map("arrived_at")
  subtotalAmount      Decimal?  @map("subtotal_amount") @db.Decimal(10, 2)
  shippingFee         Decimal?  @map("shipping_fee") @db.Decimal(10, 2)
  packagingFee        Decimal?  @map("packaging_fee") @db.Decimal(10, 2)
  discountAmount      Decimal?  @map("discount_amount") @db.Decimal(10, 2)
  paidAmount          Decimal?  @map("paid_amount") @db.Decimal(10, 2)
  personalAmount      Decimal?  @map("personal_amount") @db.Decimal(10, 2)
  reimbursementAmount Decimal?  @map("reimbursement_amount") @db.Decimal(10, 2)
  voidedAt            DateTime? @map("voided_at")
```

migration SQL 用 `ALTER TABLE "purchase_list" ADD COLUMN ...`，并加索引 `CREATE INDEX "purchase_list_arrived_at_idx" ON "purchase_list"("arrived_at");`、`CREATE INDEX "purchase_list_is_draft_idx" ON "purchase_list"("is_draft");`。

- [ ] **Step 4: 实体加字段与草稿例外**

在 `PurchaseListConstructor` / 类 / `toPrisma()` / `fromPrisma()` 加上述字段。`validateInvariants()` 中：

```ts
if (!this.isDraft) {
  if (this.items.length !== this.itemCount) throw new Error(`Item count mismatch: ...`);
  if (this.itemCount <= 0) throw new Error('Item count must be positive');
}
```

`isDraft` 默认 false；`totalEstimatedCost < 0` 校验保留。

- [ ] **Step 5: 生成 Prisma client 并跑测试**

Run:
```bash
cd backend
npm run prisma:generate:build
npx jest tests/domain/purchasing/purchase-list.entity.spec.ts
```
Expected: PASS（3 条）。

- [ ] **Step 6: 提交**

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/20261110-replenishment-record
bash scripts/session.sh commit -m "feat(purchasing): 补货记录字段与草稿不变式"
```

---

### Task 2: 草稿记录 + 全库候选匹配

**Files:**
- Create: `backend/src/application/purchasing/replenishment.service.ts`
- Create: `backend/tests/application/purchasing/replenishment.service.spec.ts`
- Modify: `backend/src/application/purchasing/purchase-order-import.service.ts`（`assertListImportable`、`buildCandidates`）
- Modify: `backend/src/interfaces/controllers/staff-purchasing.controller.ts`
- Modify: `backend/src/application/purchasing/index.ts`（导出/模块注册，若需要）

**Interfaces:**
- Consumes: Task 1 的 `isDraft` 字段；现有 `PurchaseOrderImportService.importFromScreenshots`。
- Produces:
  - `ReplenishmentService.createDraft(userId: string): Promise<PurchaseList>` — 创建 `kind=STOCK_REPLENISHMENT`、`status=PENDING`、`isDraft=true`、`itemCount=0`、`totalEstimatedCost=0`、`targetDate=今天12:00` 的记录。
  - `POST /api/v1/staff/purchasing/replenishment/drafts` → `{ id: string }`。
  - `PurchaseOrderImportService` 的 `ListItemCandidate.purchaseItemId` 变为可选；草稿列表（无明细）时 `buildCandidates` 回退到全库原料 + 启用中的 SKU。

- [ ] **Step 1: 写失败测试（草稿创建 + 全库候选）**

```ts
// replenishment.service.spec.ts
it('creates an empty draft stock replenishment record', async () => {
  const saved = await service.createDraft('user-1');
  expect(saved.kind).toBe(PurchaseListKind.STOCK_REPLENISHMENT);
  expect(saved.status).toBe(PurchaseListStatus.PENDING);
  expect(saved.isDraft).toBe(true);
  expect(saved.itemCount).toBe(0);
});

it('uses the whole catalog when the draft has no items', async () => {
  // mock purchaseItem.findMany → []，ingredient.findMany → [青花鱼]，procurementSku.findMany → [青花鱼 220g]
  const candidates = await importService['buildCandidates']('draft-1');
  expect(candidates).toEqual([
    expect.objectContaining({ ingredientName: '青花鱼', purchaseItemId: undefined }),
  ]);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && npx jest tests/application/purchasing/replenishment.service.spec.ts`
Expected: FAIL（service/方法不存在）。

- [ ] **Step 3: 实现 createDraft + 路由**

`ReplenishmentService.createDraft` 构造 `PurchaseList`（`isDraft: true`），保存后返回。控制器加：

```ts
@Post('replenishment/drafts')
async createReplenishmentDraft(@UserId() userId: string) {
  return ApiResponseDto.success(await this.replenishmentService.createDraft(userId));
}
```

（控制器注入 `ReplenishmentService`，模块 `providers` 注册。）

- [ ] **Step 4: buildCandidates 全库回退**

`buildCandidates(purchaseListId)`：先查 `purchaseItem`；若为空，查 `ingredient.findMany({ where: { /* 可选：isActive */ }, select: { id, name }, orderBy: { name: 'asc' } })` 与该原料的启用 SKU，构造 candidate（`purchaseItemId: undefined`）。`ListItemCandidate` 的 `purchaseItemId?: string`。

`assertListImportable` 允许 `isDraft = true` 的 PENDING 列表；非草稿仍要求 `startedAt`（旧流程兼容）。`confirm` 的 `if (!list.startedAt) throw` 改为：草稿放行，非草稿保持原校验。

- [ ] **Step 5: 跑测试**

Run: `cd backend && npx jest tests/application/purchasing/replenishment.service.spec.ts tests/application/purchasing/purchase-order-import.service.spec.ts`
Expected: PASS。

- [ ] **Step 6: 提交**

```bash
bash scripts/session.sh commit -m "feat(purchasing): 补货草稿与全库候选匹配"
```

---

### Task 3: 保存补货记录（明细 + 采购记录 + 金额）

**Files:**
- Modify: `backend/src/application/purchasing/replenishment.service.ts`
- Modify: `backend/src/application/purchasing/purchase-order-import.service.ts`（`confirm` 支持预建明细、重量行）
- Modify: `backend/src/interfaces/controllers/staff-purchasing.controller.ts`
- Test: `backend/tests/application/purchasing/replenishment-save.spec.ts`

**Interfaces:**
- Consumes: Task 2 的草稿、全库候选；现有 `confirm(importIds, userId)`。
- Produces:
  - `ReplenishmentService.saveRecord(listId: string, dto: SaveReplenishmentDto, userId: string): Promise<PurchaseList>`。
  - `SaveReplenishmentDto = { paidAmount?: number; shippingFee?: number; packagingFee?: number; expectedDeliveryAt?: string; deliveredAt?: string }`。
  - `POST /api/v1/staff/purchasing/replenishment/:id/save`。
  - 保存后：`isDraft=false`、`status=COMPLETED`、`itemCount`=非个人行数、`reimbursementAmount = paidAmount - personalAmount`、`arrivedAt` 仅当 `deliveredAt` 有值时写入，并在同一事务后调入库存。

- [ ] **Step 1: 写失败测试**

```ts
it('saves a record with items, records, and reimbursement amount', async () => {
  // 1 个非个人行：青花鱼 2 袋 × 26.99；paid 53.98；运费 0；个人 0
  const saved = await service.saveRecord('draft-1', { paidAmount: 53.98 }, 'user-1');
  expect(saved.isDraft).toBe(false);
  expect(saved.status).toBe(PurchaseListStatus.COMPLETED);
  expect(saved.itemCount).toBe(1);
  expect(saved.reimbursementAmount).toBe(53.98);
  expect(saved.arrivedAt).toBeNull();
  expect(inventory.inboundFromPurchaseRecords).not.toHaveBeenCalled();
});

it('records a weight line as base grams without a SKU', async () => {
  // 羊心 3 斤，unit=斤，无 SKU
  const saved = await service.saveRecord('draft-1', { paidAmount: 37.39 }, 'user-1');
  const item = saved.items[0];
  expect(item.procurementSkuId).toBeUndefined();
  expect(item.quantityUnit).toBe('斤');
  // 采购记录 actualBaseQuantity = 1500
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && npx jest tests/application/purchasing/replenishment-save.spec.ts`
Expected: FAIL（`saveRecord` 不存在）。

- [ ] **Step 3: 保存前建明细**

在 `saveRecord` 里读取草稿 + DRAFT imports + lines。对每个非个人行：
- 有 SKU：`quantityUnit = line.unit`（回退 SKU purchaseUnit），`estimatedCost = lineTotal`。
- 无 SKU 且 `line.unit` 属于 `斤/公斤/克/两`：`quantityUnit = line.unit`，`procurementSkuId = null`。
- 其他无 SKU：抛 `BadRequestException('「X」缺少采购商品，请先新建商品')`。
- 创建 `PurchaseItem`，回写 `line.purchaseItemId`。

- [ ] **Step 4: 复用 confirm，支持重量行**

`confirm` 的逐行逻辑加分支：`line.procurementSkuId == null && isWeightUnit(line.unit)` 时：
- `actualQuantity = qty`，`actualPackageCount = qty`，`actualPackageSize = unitToBaseRatio(line.unit)`（斤=500、两=50、公斤=1000、克=1），`actualPackageUnit = line.unit`，`actualBaseQuantity = qty * ratio`，`actualCost = lineTotal`。
- 不查 SKU、不校验 ratio；`purchaseItemId` 用预建明细。

非重量行保持原逻辑（SKU、净含量、金额校验）。

- [ ] **Step 5: 计算金额与状态**

保存后更新列表：
```ts
list.subtotalAmount = sum(lineTotal, non-personal);
list.shippingFee = dto.shippingFee ?? import.shippingFee;
list.packagingFee = dto.packagingFee ?? import.packagingFee;
list.paidAmount = dto.paidAmount ?? import.paid;
list.personalAmount = sum(lineTotal, personal);
list.discountAmount = round(subtotal + shipping + packaging - paid);
list.reimbursementAmount = round(paid - personal);
list.orderNo/channel/orderPlacedAt = import 快照;
list.expectedDeliveryAt = dto.expectedDeliveryAt ?? import.expectedDeliveryAt;
list.isDraft = false; list.status = COMPLETED; list.completedAt = new Date();
if (dto.deliveredAt) { list.arrivedAt = ...; await inbound(...); }
```

- [ ] **Step 6: 跑测试 + 提交**

Run: `cd backend && npx jest tests/application/purchasing/replenishment-save.spec.ts tests/application/purchasing/purchase-order-import.service.spec.ts`
Expected: PASS。

```bash
bash scripts/session.sh commit -m "feat(purchasing): 保存补货记录与重量行"
```

---

### Task 4: 到货 / 作废 / 列表 / 详情接口

**Files:**
- Modify: `backend/src/application/purchasing/replenishment.service.ts`
- Modify: `backend/src/interfaces/controllers/staff-purchasing.controller.ts`
- Test: `backend/tests/application/purchasing/replenishment-arrival.spec.ts`

**Interfaces:**
- Produces:
  - `confirmArrival(listId, userId): Promise<{ createdCount: number; skippedCount: number }>`
  - `voidRecord(listId, userId, reason?: string): Promise<PurchaseList>`
  - `listRecords(params: { arrival?: 'IN_TRANSIT' | 'ARRIVED'; claim?: 'UNSUBMITTED' | 'SUBMITTED' | 'REIMBURSED'; page?: number; pageSize?: number }, userId: string, role: string)`
  - `getRecord(id, userId, role)`
  - `POST /replenishment/:id/arrive`、`POST /replenishment/:id/void`、`GET /replenishment`、`GET /replenishment/:id`。

- [ ] **Step 1: 写失败测试**

```ts
it('inbounds once on arrival and is idempotent', async () => {
  await service.confirmArrival('rec-1', 'user-1');
  await service.confirmArrival('rec-1', 'user-1');
  expect(inventory.inboundFromPurchaseRecords).toHaveBeenCalledTimes(1);
});

it('keeps a reimbursed but not arrived record in the in-transit list', async () => {
  const page = await service.listRecords({ arrival: 'IN_TRANSIT' }, 'user-1', 'STAFF');
  expect(page.list.map((r) => r.id)).toContain('rec-reimbursed-in-transit');
});

it('rejects voiding an arrived record', async () => {
  await expect(service.voidRecord('rec-arrived', 'user-1')).rejects.toThrow('先撤销到货');
});
```

- [ ] **Step 2: 实现**

- 到货：加载记录，校验未作废；若 `arrivedAt` 已有值直接返回 `{ createdCount: 0, skippedCount: 0 }`；否则 `inboundFromPurchaseRecords` 后写 `arrivedAt`。
- 作废：仅 `arrivedAt` 为空、`reimbursementId` 为空；写 `voidedAt`；不动物流。
- 列表：`where { kind: STOCK_REPLENISHMENT, isDraft: false, voidedAt: null }`，按到货/报销状态过滤；员工全局可见（本任务不按 createdBy 过滤），操作接口校验创建人或 ADMIN。
- 详情：返回 items、records、imports（签名 URL）、四个金额。

- [ ] **Step 3: 跑测试 + 提交**

Run: `cd backend && npx jest tests/application/purchasing/replenishment-arrival.spec.ts`
Expected: PASS。

```bash
bash scripts/session.sh commit -m "feat(purchasing): 补货到货、作废与列表接口"
```

---

### Task 5: 补货在途与补货建议

**Files:**
- Modify: `backend/src/application/purchasing/purchasing.service.ts`（`getStockReplenishmentIngredients`、`StockReplenishmentInsight`）
- Modify: `backend/src/application/inventory/inventory.service.ts`（新增按原料汇总在途）
- Test: `backend/tests/application/purchasing/replenishment-in-transit.spec.ts`

**Interfaces:**
- Produces: `StockReplenishmentInsight` 新增 `replenishmentInTransitQuantity: number`、`availableQuantity: number`；建议量用 `availableQuantity` 计算。

- [ ] **Step 1: 写失败测试**

```ts
it('adds replenishment in-transit to available but not to currentStock', async () => {
  // on-hand 200g，在途 1500g，目标 2000g
  const [row] = await service.getStockReplenishmentIngredients({});
  expect(row.currentStock).toBe(200);
  expect(row.replenishmentInTransitQuantity).toBe(1500);
  expect(row.availableQuantity).toBe(1700);
  expect(row.suggestedBaseQuantity).toBe(300);
});
```

- [ ] **Step 2: 实现**

在 `inventory.service` 加 `getReplenishmentInTransitByIngredient(ingredientIds)`：查 `purchaseRecord` join `purchaseList`（`kind=STOCK_REPLENISHMENT, isDraft=false, arrivedAt=null, voidedAt=null`），`groupBy ingredientId`，`_sum.actualBaseQuantity`。

`getStockReplenishmentIngredients` 一次取全部在途，计算 `availableQuantity = currentStock + inTransit`，建议量用 available；**不要动现有 `inTransitQuantity`**（日采待买）。

- [ ] **Step 3: 跑测试 + 提交**

Run: `cd backend && npx jest tests/application/purchasing/replenishment-in-transit.spec.ts tests/application/purchasing/purchasing.service.spec.ts`
Expected: PASS。

```bash
bash scripts/session.sh commit -m "feat(purchasing): 补货在途与可用库存"
```

---

### Task 6: 报销金额与锁定

**Files:**
- Modify: `backend/src/application/purchasing/reimbursement.service.ts`
- Test: `backend/tests/application/purchasing/reimbursement-replenishment.spec.ts`

**Interfaces:**
- Consumes: `purchase_list.reimbursementAmount`。
- Produces: 补货记录的报销金额 = `reimbursementAmount`（不是 Σ records）；驳回/需重提时解绑 `reimbursementId`。

- [ ] **Step 1: 写失败测试**

```ts
it('uses reimbursementAmount for stock lists and record sum for daily lists', async () => { ... });
it('unlocks purchase lists when a claim is rejected', async () => {
  await service.reviewClaim('claim-1', { decision: 'REJECT', comment: '金额不对' }, 'admin-1');
  expect(await prisma.purchaseList.findUnique({ where: { id: 'rec-1' } })).toMatchObject({ reimbursementId: null });
});
```

- [ ] **Step 2: 实现**

在 `prepareReimbursementSubmission` 的 `purchaseListsTotal` 计算中：`list.kind === STOCK_REPLENISHMENT ? Number(list.reimbursementAmount ?? 0) : Number(list.totalActualCost ?? list.totalEstimatedCost ?? 0)`。

在审核 REJECT / REQUIRE_RESUBMIT 的事务里，把该报销单关联的 `purchase_list.reimbursementId` 置空；`submit` 的 `saveWithPurchaseListReplacement` 已允许 `null` 或同 id。

- [ ] **Step 3: 跑测试 + 提交**

Run: `cd backend && npx jest tests/application/purchasing/reimbursement-replenishment.spec.ts tests/application/purchasing/reimbursement.service.spec.ts`
Expected: PASS。

```bash
bash scripts/session.sh commit -m "feat(purchasing): 补货报销金额与驳回解锁"
```

---

### Task 7: AI 识别扩展（多平台、到货日、页面类型、重量单位）

**Files:**
- Modify: `backend/src/application/purchasing/purchase-order-import.service.ts`（prompt + `RecognizedOrder` / `PurchaseOrderImportLine` 解析）
- Test: `backend/tests/application/purchasing/purchase-order-import.spec.ts`（扩展现有测试）

**Interfaces:**
- Produces: `PurchaseOrderImport` 新增 `expectedDeliveryAt?: Date | null`、`deliveredAt?: Date | null`、`pageType?: string | null`（migration 同 Task 1 或单独）。识别结果 JSON 增加 `expectedDeliveryAt`、`deliveredAt`、`pageType`。
- `pageType === 'order_list'` 时 `importFromScreenshots` 抛 `BadRequestException('这是订单列表页，请打开单个订单再截图')`。

- [ ] **Step 1: 写失败测试**

```ts
it('rejects an order-list screenshot', async () => { ... });
it('parses expected delivery and delivered dates', async () => { ... });
it('accepts 斤/kg/g as weight units in lines', async () => { ... });
```

- [ ] **Step 2: 改 prompt + 解析**

在 prompt 里补：iHerb/淘宝字段名、`expectedDeliveryAt`、`deliveredAt`、`pageType`（order_detail/product_detail/order_list/unknown）、重量单位原样输出。解析后写入 import；`toView` 返回新字段。

- [ ] **Step 3: 跑测试 + 提交**

Run: `cd backend && npx jest tests/application/purchasing/purchase-order-import.spec.ts`
Expected: PASS。

```bash
bash scripts/session.sh commit -m "feat(purchasing): 补货识别扩展到多平台与到货日"
```

---

### Task 8: 小程序补货页（列表 / 待收货 / 记一笔）

**Files:**
- Create: `miniapp/src/pages/staff-purchasing/replenishment/index.vue`
- Modify: `miniapp/src/pages.json`（注册路由，标题「补货」）
- Modify: `miniapp/src/pages/staff-purchasing/api/purchasing.ts`（新增 `createReplenishmentDraft`、`listReplenishmentRecords`、`getReplenishmentRecord`、`arriveReplenishment`、`voidReplenishment`、`saveReplenishment`）
- Test: `miniapp/src/pages/staff-purchasing/replenishment/replenishment-page.spec.ts`

**Interfaces:**
- Consumes: Task 2/3/4 的接口。
- Produces: 页面路由 `/pages/staff-purchasing/replenishment/index`；采购管理首页补货入口跳这里。

- [ ] **Step 1: 写源检查测试**

```ts
it('shows two independent badges', () => {
  expect(source).toContain('arrivalBadgeText');
  expect(source).toContain('claimBadgeText');
  expect(source).not.toContain("status === 'COMPLETED' ? '已完成'");
});
it('has in-transit count and record entry', () => {
  expect(source).toContain('待收货');
  expect(source).toContain('记一笔补货');
});
```

- [ ] **Step 2: 实现页面**

顶部待收货卡片（N>0），主按钮「记一笔补货」→ `createReplenishmentDraft` 后跳上传/识别；列表按创建时间倒序，显示两个徽章；筛选 全部/在途/待报销/已报销/已作废；超期标红。

- [ ] **Step 3: 跑测试 + 提交**

Run: `cd miniapp && npx vitest run src/pages/staff-purchasing/replenishment/replenishment-page.spec.ts`
Expected: PASS。

```bash
bash scripts/session.sh commit -m "feat(miniapp): 补货页与待收货入口"
```

---

### Task 9: 小程序上传/核对改造

**Files:**
- Modify: `miniapp/src/pages/staff-purchasing/order-import/review.vue`
- Modify: `miniapp/src/pages/staff-purchasing/api/purchasing.ts`
- Test: `miniapp/src/pages/staff-purchasing/order-import/replenishment-review.spec.ts`

**Interfaces:**
- Consumes: `POST /replenishment/drafts`、`POST /lists/:id/order-imports`、`PUT /order-imports/:id/lines/:lineId`、`POST /replenishment/:id/save`。
- Produces: 核对页支持 `mode=replenishment`：无「先开始采购」；原料选择走全库搜索；重量行可选「按重量」；保存调用新接口。

- [ ] **Step 1: 写源检查测试**

```ts
it('does not require startedAt for replenishment mode', () => {
  expect(source).toContain("mode === 'replenishment'");
  expect(source).not.toContain('请先开始采购，再生成采购记录');
});
```

- [ ] **Step 2: 实现**

- 进入核对页时带 `mode=replenishment`，隐藏「开始采购」确认。
- 「选择原料」抽屉支持全库搜索（名称/别名/渠道）。
- 行编辑增加「按重量」单位（斤/公斤/克/两），重量行不要求 SKU。
- 底部「保存」调用 `saveReplenishment(listId, { paidAmount, shippingFee, packagingFee, expectedDeliveryAt, deliveredAt })`。

- [ ] **Step 3: 跑测试 + 提交**

Run: `cd miniapp && npx vitest run src/pages/staff-purchasing/order-import/replenishment-review.spec.ts`
Expected: PASS。

```bash
bash scripts/session.sh commit -m "feat(miniapp): 补货核对页支持全库匹配与重量行"
```

---

### Task 10: 小程序补货记录详情与到货

**Files:**
- Create: `miniapp/src/pages/staff-purchasing/replenishment/detail.vue`
- Modify: `miniapp/src/pages.json`
- Test: `miniapp/src/pages/staff-purchasing/replenishment/replenishment-detail.spec.ts`

**Interfaces:**
- Consumes: `GET /replenishment/:id`、`POST /replenishment/:id/arrive`、`POST /replenishment/:id/void`。
- Produces: 详情页显示渠道/订单号/下单时间/预计到货/两个徽章/实付/本次报销；在途有「已到货」「去报销」；已到货只读（改数走撤销到货）；已报销只读但未到货仍可到货。

- [ ] **Step 1: 写源检查测试**

```ts
it('keeps arrival available after reimbursement', () => {
  expect(source).toContain('canConfirmArrival');
  expect(source).toContain('已报销但未到货');
});
```

- [ ] **Step 2: 实现 + 测试 + 提交**

Run: `cd miniapp && npx vitest run src/pages/staff-purchasing/replenishment/replenishment-detail.spec.ts`
Expected: PASS。

```bash
bash scripts/session.sh commit -m "feat(miniapp): 补货记录详情与到货确认"
```

---

### Task 11: 后台兼容与历史回填

**Files:**
- Modify: `admin-web/src/views/Purchasing/PurchaseLists.vue`（补货单隐藏「追加订单/剔除订单/重新计算」，展示渠道/订单号/到货/金额）
- Create: `backend/prisma/migrations/20261110120000_replenishment_record_fields/backfill.sql`（或 script）
- Test: `admin-web/src/views/Purchasing/purchase-lists.spec.ts`（若无测试基建，则用源码检查脚本）

- [ ] **Step 1: 隐藏补货单的订单类操作**（`kind === 'STOCK_REPLENISHMENT'` 时禁用/隐藏三按钮）。
- [ ] **Step 2: 历史 COMPLETED 补货单回填 `arrived_at = completed_at`**（SQL：`UPDATE purchase_list SET arrived_at = completed_at WHERE kind='STOCK_REPLENISHMENT' AND status='COMPLETED' AND arrived_at IS NULL;`）。
- [ ] **Step 3: 后台详情展示新字段**（渠道、订单号、实付、本次报销、到货时间）。
- [ ] **Step 4: 构建/检查 + 提交**

Run: `cd admin-web && npm run build`
Expected: 构建通过。

```bash
bash scripts/session.sh commit -m "feat(admin): 补货记录后台兼容与历史回填"
```

---

### Task 12: 回归与验收

**Files:**
- Test: `backend/tests/application/purchasing/replenishment.e2e.spec.ts`（服务级集成测试，不连生产库）
- Modify: `miniapp/src/pages/staff-purchasing.regression.spec.ts`（如需守文案）

- [ ] **Step 1: 后端全量测试**

Run: `cd backend && npx jest tests/application/purchasing tests/application/inventory tests/domain/purchasing`
Expected: 全绿。

- [ ] **Step 2: 前端测试**

Run: `cd miniapp && npx vitest run src/pages/staff-purchasing.regression.spec.ts src/pages/staff-purchasing.ui.regression.spec.ts src/pages/staff-purchasing/replenishment`
Expected: 全绿（已知 2 条既有红灯除外）。

- [ ] **Step 3: 构建（不自检后端 build，避免杀死本地联调）**

Run:
```bash
cd backend && npx tsc --noEmit
cd miniapp && npm run build:mp-weixin
cd admin-web && npm run build
```
Expected: 通过。

- [ ] **Step 4: 真机/开发者工具冒烟**（按 AGENTS.md：复用现有项目，不新建临时工程；预览构建目录 `miniapp/dist/dev/mp-weixin`，发布构建 `miniapp/dist/build/mp-weixin`）。

- [ ] **Step 5: 提交**

```bash
bash scripts/session.sh commit -m "test(purchasing): 补货链路回归与验收"
```

---

## 执行顺序与依赖

- Task 1 → 2 → 3 → 4 是后端主干，必须按序。
- Task 5、6 可在 3/4 后并行；本计划按序执行。
- Task 7 只改识别，可与 5/6 并行。
- Task 8 → 9 → 10 依赖后端 2/3/4。
- Task 11 依赖 1/4。
- Task 12 最后。

## 不在本计划内

- 微信推送、超市小票识别、订单列表页多单拆分、在小程序新建原料、按重量商品档案、财务总账口径调整。
