# Procurement Inventory Allocation Phase Two A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make order-demand purchasing subtract available inventory, create an auditable inventory allocation record for stock used by orders, and generate purchase list items only for the remaining shortage.

**Architecture:** Keep physical stock in the existing append-only inventory ledger. Add an independent inventory allocation header plus allocation lines, so available stock is calculated as `onHand - activeAllocations` without turning allocations into fake stock movements. Purchasing preview and generation both use the same demand calculation: stock-managed ingredients create allocation lines; shortage quantities create purchase items; fully stock-covered demand creates only an inventory allocation record and no purchase list.

**Tech Stack:** NestJS, Prisma, PostgreSQL migrations, Jest, uni-app Vue 3, WeChat mini program preview.

---

## Scope Check

This plan implements Phase 2A from `docs/superpowers/specs/2026-04-16-order-procurement-production-inventory-chain-design.md`:

- Purchase preview shows gross order demand, on-hand stock, active allocations, available stock, stock offset, and purchase shortage.
- Order-demand purchase list generation uses purchase shortage as the purchase item quantity.
- Ingredients with `STOCK_REPLENISHMENT` or `HYBRID` procurement strategy can use stock and create inventory allocation lines.
- Ingredients with `DAILY_PURCHASE` procurement strategy do not use inventory to reduce purchase shortage.
- Fully stock-covered order demand creates an inventory allocation record only. It does not create a zero-item purchase list.
- Deleting a pending purchase list releases the linked active inventory allocation.
- Removing orders from a pending purchase list releases and recreates the allocation for the remaining orders.

This plan does not implement:

- Production surplus or shortage recording.
- Production consumption of allocation lines.
- Batch actual cost settlement.
- Order settlement adjustment records.
- Refund or补差价 UI.
- A dedicated inventory allocation management page.

## Key Design Decisions

Inventory allocation is not a negative inventory ledger entry. The ledger records physical stock movement; allocation records which stock has been assigned to which orders.

```text
onHandQuantityG = SUM(inventory_ledger_entry.delta_g)
activeAllocatedQuantityG = SUM(active inventory_allocation_line.quantity_g)
availableQuantityG = max(onHandQuantityG - activeAllocatedQuantityG, 0)
```

Use a header table and line table:

- `inventory_allocation` represents one order-demand inventory allocation batch.
- `inventory_allocation_line` represents the ingredient quantities assigned to that batch.
- `purchaseListId` is optional. It is present when the same generation also created a purchase list, and null when inventory fully covers the demand.

This avoids the old zero-item purchase list idea. A purchase list means "things someone must buy"; an allocation means "existing stock has been set aside for these orders".

## Current Code Map

- `backend/src/application/purchasing/purchasing.service.ts` currently aggregates PAID orders into `PurchaseRequirement[]` and directly uses `quantityNeeded` as the purchase list item quantity.
- `backend/src/application/inventory/inventory.service.ts` currently exposes physical balances through `getBalanceByIngredient()`.
- `backend/prisma/schema.prisma` has `InventoryLedgerEntry`, `PurchaseList`, and `PurchaseItem`, but no allocation model.
- `backend/src/domain/purchasing/purchase-list.entity.ts` rejects `itemCount <= 0`. This should remain true; fully stock-covered demand will not create a purchase list.
- `miniapp/src/pages/staff-purchasing/preview.vue` and `miniapp/src/pages/staff-purchasing/detail.vue` currently show one purchase quantity, with no stock offset explanation.

## File Structure

Create:

- `backend/prisma/migrations/202604170001_add_inventory_allocations/migration.sql`
  Adds inventory allocation header and line tables.

- `backend/src/domain/inventory/inventory-allocation.entity.ts`
  Defines allocation header/line status, invariants, and mapping-friendly domain objects.

- `backend/tests/application/inventory/inventory-allocation.service.spec.ts`
  Tests availability calculation, allocation creation, replacement, and release behavior.

- `backend/tests/application/purchasing/purchasing-inventory-allocation.spec.ts`
  Tests daily-vs-stock-managed demand calculation, partial purchase generation, and fully stock-covered allocation.

Modify:

- `backend/prisma/schema.prisma`
  Adds `InventoryAllocation`, `InventoryAllocationLine`, and `InventoryAllocationStatus`.

- `backend/src/domain/inventory/index.ts`
  Exports allocation entity and status.

- `backend/src/application/inventory/inventory.service.ts`
  Adds availability and allocation methods.

- `backend/src/application/purchasing/purchasing.service.ts`
  Applies inventory availability, returns nullable purchase-list generation results, creates allocations, and releases allocations for purchase changes.

- `backend/src/domain/purchasing/purchase-item.entity.ts`
  Adds optional stock-offset metadata to purchase items.

- `backend/src/infrastructure/repositories/prisma-purchase-list.repository.ts`
  Persists purchase item stock-offset metadata.

- `backend/src/interfaces/controllers/staff-purchasing.controller.ts`
  Documents preview fields and the new generation response shape.

- `miniapp/src/api/purchasing.ts`
  Normalizes stock-offset display fields and nullable purchase-list generation responses.

- `miniapp/src/pages/staff-purchasing/preview.vue`
  Shows gross demand, stock offset, purchase shortage, and "无需采购，库存已分配" hints.

- `miniapp/src/pages/staff-purchasing/detail.vue`
  Shows stock offset metadata on generated purchase items.

## Task 1: Inventory Allocation Schema And Domain Entity

**Files:**
- Create: `backend/prisma/migrations/202604170001_add_inventory_allocations/migration.sql`
- Create: `backend/src/domain/inventory/inventory-allocation.entity.ts`
- Modify: `backend/prisma/schema.prisma`
- Modify: `backend/src/domain/inventory/index.ts`

- [ ] **Step 1: Verify the current Prisma baseline**

Run:

```bash
cd backend && npm run prisma:generate:build
```

Expected: PASS on the existing schema before adding allocation tables.

- [ ] **Step 2: Add Prisma models**

Modify `backend/prisma/schema.prisma`:

```prisma
model Ingredient {
  // existing fields stay unchanged
  inventoryAllocationLines InventoryAllocationLine[]
}

model PurchaseList {
  // existing fields stay unchanged
  inventoryAllocations InventoryAllocation[]
}

model InventoryAllocation {
  id             String                    @id @default(uuid()) @map("id")
  targetDate     DateTime                  @map("target_date")
  status         InventoryAllocationStatus @default(ACTIVE) @map("status")
  purchaseListId String?                   @map("purchase_list_id")
  sourceOrderIds String[]                  @default([]) @map("source_order_ids")
  createdById    String?                   @map("created_by_id")
  createdAt      DateTime                  @default(now()) @map("created_at")
  releasedAt     DateTime?                 @map("released_at")
  consumedAt     DateTime?                 @map("consumed_at")
  purchaseList   PurchaseList?             @relation(fields: [purchaseListId], references: [id], onDelete: SetNull)
  lines          InventoryAllocationLine[]

  @@index([targetDate])
  @@index([status])
  @@index([purchaseListId])
  @@map("inventory_allocation")
}

model InventoryAllocationLine {
  id               String              @id @default(uuid()) @map("id")
  allocationId     String              @map("allocation_id")
  ingredientId     String              @map("ingredient_id")
  procurementSkuId String?             @map("procurement_sku_id") @db.VarChar(36)
  quantityG        Float               @map("quantity_g")
  createdAt        DateTime            @default(now()) @map("created_at")
  allocation       InventoryAllocation @relation(fields: [allocationId], references: [id], onDelete: Cascade)
  ingredient       Ingredient          @relation(fields: [ingredientId], references: [id], onDelete: Cascade)

  @@unique([allocationId, ingredientId])
  @@index([ingredientId])
  @@index([procurementSkuId])
  @@map("inventory_allocation_line")
}

enum InventoryAllocationStatus {
  ACTIVE
  RELEASED
  CONSUMED
}
```

- [ ] **Step 3: Add SQL migration**

Create `backend/prisma/migrations/202604170001_add_inventory_allocations/migration.sql`:

```sql
CREATE TYPE "InventoryAllocationStatus" AS ENUM ('ACTIVE', 'RELEASED', 'CONSUMED');

CREATE TABLE "inventory_allocation" (
  "id" TEXT NOT NULL,
  "target_date" TIMESTAMP(3) NOT NULL,
  "status" "InventoryAllocationStatus" NOT NULL DEFAULT 'ACTIVE',
  "purchase_list_id" TEXT,
  "source_order_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "created_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "released_at" TIMESTAMP(3),
  "consumed_at" TIMESTAMP(3),
  CONSTRAINT "inventory_allocation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inventory_allocation_line" (
  "id" TEXT NOT NULL,
  "allocation_id" TEXT NOT NULL,
  "ingredient_id" TEXT NOT NULL,
  "procurement_sku_id" VARCHAR(36),
  "quantity_g" DOUBLE PRECISION NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventory_allocation_line_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "inventory_allocation_target_date_idx"
  ON "inventory_allocation"("target_date");

CREATE INDEX "inventory_allocation_status_idx"
  ON "inventory_allocation"("status");

CREATE INDEX "inventory_allocation_purchase_list_id_idx"
  ON "inventory_allocation"("purchase_list_id");

CREATE UNIQUE INDEX "inventory_allocation_line_allocation_id_ingredient_id_key"
  ON "inventory_allocation_line"("allocation_id", "ingredient_id");

CREATE INDEX "inventory_allocation_line_ingredient_id_idx"
  ON "inventory_allocation_line"("ingredient_id");

CREATE INDEX "inventory_allocation_line_procurement_sku_id_idx"
  ON "inventory_allocation_line"("procurement_sku_id");

ALTER TABLE "inventory_allocation"
  ADD CONSTRAINT "inventory_allocation_purchase_list_id_fkey"
  FOREIGN KEY ("purchase_list_id") REFERENCES "purchase_list"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "inventory_allocation_line"
  ADD CONSTRAINT "inventory_allocation_line_allocation_id_fkey"
  FOREIGN KEY ("allocation_id") REFERENCES "inventory_allocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "inventory_allocation_line"
  ADD CONSTRAINT "inventory_allocation_line_ingredient_id_fkey"
  FOREIGN KEY ("ingredient_id") REFERENCES "ingredient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 4: Add domain entity**

Create `backend/src/domain/inventory/inventory-allocation.entity.ts`:

```ts
import { ValidationError } from '../common/errors';

export enum InventoryAllocationStatus {
  ACTIVE = 'ACTIVE',
  RELEASED = 'RELEASED',
  CONSUMED = 'CONSUMED',
}

export interface InventoryAllocationLineConstructor {
  id: string;
  allocationId: string;
  ingredientId: string;
  procurementSkuId?: string | null;
  quantityG: number;
  createdAt?: Date;
}

export class InventoryAllocationLine {
  public readonly id: string;
  public readonly allocationId: string;
  public readonly ingredientId: string;
  public readonly procurementSkuId?: string | null;
  public readonly quantityG: number;
  public readonly createdAt: Date;

  constructor(data: InventoryAllocationLineConstructor) {
    this.id = data.id;
    this.allocationId = data.allocationId;
    this.ingredientId = data.ingredientId;
    this.procurementSkuId = data.procurementSkuId ?? null;
    this.quantityG = data.quantityG;
    this.createdAt = data.createdAt ?? new Date();
    this.validate();
  }

  private validate(): void {
    if (!this.id.trim()) throw new ValidationError('allocation line id cannot be empty');
    if (!this.allocationId.trim()) throw new ValidationError('allocationId cannot be empty');
    if (!this.ingredientId.trim()) throw new ValidationError('ingredientId cannot be empty');
    if (!Number.isFinite(this.quantityG) || this.quantityG <= 0) {
      throw new ValidationError('allocation quantityG must be positive');
    }
  }
}

export interface InventoryAllocationConstructor {
  id: string;
  targetDate: Date;
  status?: InventoryAllocationStatus;
  purchaseListId?: string | null;
  sourceOrderIds?: string[];
  createdById?: string | null;
  createdAt?: Date;
  releasedAt?: Date | null;
  consumedAt?: Date | null;
  lines?: InventoryAllocationLine[];
}

export class InventoryAllocation {
  public readonly id: string;
  public readonly targetDate: Date;
  public readonly status: InventoryAllocationStatus;
  public readonly purchaseListId?: string | null;
  public readonly sourceOrderIds: string[];
  public readonly createdById?: string | null;
  public readonly createdAt: Date;
  public readonly releasedAt?: Date | null;
  public readonly consumedAt?: Date | null;
  public readonly lines: InventoryAllocationLine[];

  constructor(data: InventoryAllocationConstructor) {
    this.id = data.id;
    this.targetDate = data.targetDate;
    this.status = data.status ?? InventoryAllocationStatus.ACTIVE;
    this.purchaseListId = data.purchaseListId ?? null;
    this.sourceOrderIds = data.sourceOrderIds ?? [];
    this.createdById = data.createdById ?? null;
    this.createdAt = data.createdAt ?? new Date();
    this.releasedAt = data.releasedAt ?? null;
    this.consumedAt = data.consumedAt ?? null;
    this.lines = data.lines ?? [];
    this.validate();
  }

  private validate(): void {
    if (!this.id.trim()) throw new ValidationError('allocation id cannot be empty');
    if (Number.isNaN(this.targetDate.getTime())) {
      throw new ValidationError('targetDate must be valid');
    }
    if (this.status === InventoryAllocationStatus.ACTIVE && this.lines.length === 0) {
      throw new ValidationError('active allocation must contain at least one line');
    }
  }
}
```

Modify `backend/src/domain/inventory/index.ts`:

```ts
export * from './inventory-allocation.entity';
```

- [ ] **Step 5: Generate Prisma client and verify build types**

Run:

```bash
cd backend && npm run prisma:generate:build
cd backend && npm run build
```

Expected: both commands pass.

- [ ] **Step 6: Commit schema and entity**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/202604170001_add_inventory_allocations/migration.sql backend/src/domain/inventory/inventory-allocation.entity.ts backend/src/domain/inventory/index.ts
git commit -m "feat: add inventory allocations"
```

## Task 2: Inventory Availability And Allocation Service

**Files:**
- Create: `backend/tests/application/inventory/inventory-allocation.service.spec.ts`
- Modify: `backend/src/application/inventory/inventory.service.ts`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/application/inventory/inventory-allocation.service.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { InventoryService, INVENTORY_REPOSITORY } from 'src/application/inventory/inventory.service';
import type { InventoryRepository } from 'src/domain/inventory';
import { PRODUCTION_BATCH_REPOSITORY } from 'src/application/production/production.service';
import { PrismaService } from 'src/infrastructure/prisma.service';

describe('InventoryService allocations', () => {
  let service: InventoryService;
  let inventoryRepository: jest.Mocked<InventoryRepository>;
  let prisma: any;

  beforeEach(async () => {
    inventoryRepository = {
      recordEntries: jest.fn(),
      existsBySourceAndIngredient: jest.fn(),
      getCurrentBalanceByIngredient: jest.fn(),
      findBySource: jest.fn(),
    };
    prisma = {
      inventoryAllocation: {
        create: jest.fn(),
        updateMany: jest.fn(),
      },
      inventoryAllocationLine: {
        groupBy: jest.fn(),
        createMany: jest.fn(),
      },
      $transaction: jest.fn(async (callback: any) => callback(prisma)),
    };

    const module = await Test.createTestingModule({
      providers: [
        InventoryService,
        { provide: INVENTORY_REPOSITORY, useValue: inventoryRepository },
        { provide: PRODUCTION_BATCH_REPOSITORY, useValue: {} },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(InventoryService);
  });

  it('calculates available stock from on-hand minus active allocations', async () => {
    inventoryRepository.getCurrentBalanceByIngredient
      .mockResolvedValueOnce(5000)
      .mockResolvedValueOnce(800);
    prisma.inventoryAllocationLine.groupBy.mockResolvedValue([
      { ingredientId: 'beef', _sum: { quantityG: 1200 } },
    ]);

    const result = await service.getAvailabilityByIngredientIds(['beef', 'spinach']);

    expect(result.get('beef')).toEqual({
      ingredientId: 'beef',
      onHandQuantityG: 5000,
      allocatedQuantityG: 1200,
      availableQuantityG: 3800,
    });
    expect(result.get('spinach')).toEqual({
      ingredientId: 'spinach',
      onHandQuantityG: 800,
      allocatedQuantityG: 0,
      availableQuantityG: 800,
    });
  });

  it('creates an allocation header and lines without requiring a purchase list', async () => {
    await service.createAllocationForOrderDemand({
      targetDate: new Date('2026-04-20T12:00:00.000Z'),
      purchaseListId: null,
      sourceOrderIds: ['order-1'],
      createdById: 'admin-1',
      lines: [{ ingredientId: 'beef', procurementSkuId: 'sku-beef', quantityG: 1500 }],
    });

    expect(prisma.inventoryAllocation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        targetDate: new Date('2026-04-20T12:00:00.000Z'),
        purchaseListId: null,
        sourceOrderIds: ['order-1'],
        status: 'ACTIVE',
      }),
      select: { id: true },
    });
    expect(prisma.inventoryAllocationLine.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          ingredientId: 'beef',
          procurementSkuId: 'sku-beef',
          quantityG: 1500,
        }),
      ],
    });
  });

  it('releases active allocations by purchase list id', async () => {
    await service.releaseAllocationsForPurchaseList('purchase-list-1');

    expect(prisma.inventoryAllocation.updateMany).toHaveBeenCalledWith({
      where: { purchaseListId: 'purchase-list-1', status: 'ACTIVE' },
      data: { status: 'RELEASED', releasedAt: expect.any(Date) },
    });
  });
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run:

```bash
cd backend && npm test -- tests/application/inventory/inventory-allocation.service.spec.ts --runInBand
```

Expected: FAIL because the new service methods do not exist.

- [ ] **Step 3: Add service DTOs and methods**

Modify `backend/src/application/inventory/inventory.service.ts` near existing inventory DTOs:

```ts
export interface InventoryAvailabilitySnapshot {
  ingredientId: string;
  onHandQuantityG: number;
  allocatedQuantityG: number;
  availableQuantityG: number;
}

export interface CreateInventoryAllocationDto {
  targetDate: Date;
  purchaseListId?: string | null;
  sourceOrderIds: string[];
  createdById?: string | null;
  lines: Array<{
    ingredientId: string;
    procurementSkuId?: string | null;
    quantityG: number;
  }>;
}
```

Add methods to `InventoryService`:

```ts
async getAvailabilityByIngredientIds(
  ingredientIds: string[],
): Promise<Map<string, InventoryAvailabilitySnapshot>> {
  const uniqueIds = Array.from(new Set(ingredientIds.filter(Boolean)));
  if (uniqueIds.length === 0) return new Map();

  const [balances, allocationLines] = await Promise.all([
    Promise.all(
      uniqueIds.map(async (ingredientId) => [
        ingredientId,
        await this.getBalanceByIngredient(ingredientId),
      ] as const),
    ),
    this.prisma.inventoryAllocationLine.groupBy({
      by: ['ingredientId'],
      where: {
        ingredientId: { in: uniqueIds },
        allocation: { status: 'ACTIVE' },
      },
      _sum: { quantityG: true },
    }),
  ]);

  const balanceMap = new Map(balances);
  const allocatedMap = new Map(
    allocationLines.map((item: any) => [
      item.ingredientId,
      Number(item._sum.quantityG ?? 0),
    ]),
  );

  return new Map(
    uniqueIds.map((ingredientId) => {
      const onHandQuantityG = Number(balanceMap.get(ingredientId) ?? 0);
      const allocatedQuantityG = Number(allocatedMap.get(ingredientId) ?? 0);
      return [
        ingredientId,
        {
          ingredientId,
          onHandQuantityG,
          allocatedQuantityG,
          availableQuantityG: Math.max(onHandQuantityG - allocatedQuantityG, 0),
        },
      ];
    }),
  );
}

async createAllocationForOrderDemand(
  dto: CreateInventoryAllocationDto,
): Promise<{ id: string }> {
  const validLines = dto.lines
    .filter((line) => Number.isFinite(line.quantityG) && line.quantityG > 0)
    .map((line) => ({
      id: randomUUID(),
      ingredientId: line.ingredientId,
      procurementSkuId: line.procurementSkuId ?? null,
      quantityG: this.roundNumber(line.quantityG, 3),
      createdAt: new Date(),
    }));

  if (validLines.length === 0) {
    throw new BadRequestException('库存分配至少需要一条有效明细');
  }

  return this.prisma.$transaction(async (tx) => {
    const allocation = await tx.inventoryAllocation.create({
      data: {
        targetDate: dto.targetDate,
        purchaseListId: dto.purchaseListId ?? null,
        sourceOrderIds: dto.sourceOrderIds,
        createdById: dto.createdById ?? null,
        status: 'ACTIVE',
      },
      select: { id: true },
    });

    await tx.inventoryAllocationLine.createMany({
      data: validLines.map((line) => ({
        ...line,
        allocationId: allocation.id,
      })),
    });

    return allocation;
  });
}

async releaseAllocationsForPurchaseList(purchaseListId: string): Promise<void> {
  await this.prisma.inventoryAllocation.updateMany({
    where: { purchaseListId, status: 'ACTIVE' },
    data: { status: 'RELEASED', releasedAt: new Date() },
  });
}
```

- [ ] **Step 4: Run allocation service tests**

Run:

```bash
cd backend && npm test -- tests/application/inventory/inventory-allocation.service.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 5: Commit inventory service behavior**

```bash
git add backend/src/application/inventory/inventory.service.ts backend/tests/application/inventory/inventory-allocation.service.spec.ts
git commit -m "feat: calculate allocated inventory availability"
```

## Task 3: Purchase Requirement Stock Offset

**Files:**
- Create: `backend/tests/application/purchasing/purchasing-inventory-allocation.spec.ts`
- Modify: `backend/src/application/purchasing/purchasing.service.ts`

- [ ] **Step 1: Write failing purchasing tests**

Create `backend/tests/application/purchasing/purchasing-inventory-allocation.spec.ts` with these cases:

```ts
it('offsets hybrid ingredients by available stock but leaves daily purchase ingredients untouched', async () => {
  const result = await service.calculatePurchaseRequirements('2026-04-20');

  expect(result).toEqual([
    expect.objectContaining({
      ingredientId: 'beef',
      grossQuantityNeeded: 3000,
      stockDeductedQuantity: 3000,
      quantityNeeded: 0,
      purchaseShortageQuantity: 0,
      usesInventory: true,
    }),
    expect.objectContaining({
      ingredientId: 'spinach',
      grossQuantityNeeded: 600,
      stockDeductedQuantity: 0,
      quantityNeeded: 600,
      purchaseShortageQuantity: 600,
      usesInventory: false,
    }),
  ]);
});

it('creates a purchase list for shortages and an allocation for stock offsets', async () => {
  const result = await service.generatePurchaseList({ startDate: '2026-04-20' }, 'admin-1');

  expect(result.purchaseList?.items).toHaveLength(1);
  expect(result.purchaseList?.items[0]).toEqual(
    expect.objectContaining({ ingredientId: 'spinach', quantityNeeded: 600 }),
  );
  expect(result.inventoryAllocation).toEqual(
    expect.objectContaining({ id: 'allocation-1', lineCount: 1 }),
  );
});

it('creates only an inventory allocation when all order demand is covered by stock', async () => {
  inventoryService.getAvailabilityByIngredientIds.mockResolvedValue(
    new Map([
      ['beef', { ingredientId: 'beef', onHandQuantityG: 5000, allocatedQuantityG: 0, availableQuantityG: 5000 }],
    ]),
  );
  orderRepository.findByTargetProductionDateRange.mockResolvedValue({
    list: [makePaidOrder('beef', '牛肉', 3000)],
  });

  const result = await service.generatePurchaseList({ startDate: '2026-04-20' }, 'admin-1');

  expect(result.purchaseList).toBeNull();
  expect(result.inventoryAllocation).toEqual(
    expect.objectContaining({ id: 'allocation-1', lineCount: 1 }),
  );
  expect(purchaseListRepository.save).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run:

```bash
cd backend && npm test -- tests/application/purchasing/purchasing-inventory-allocation.spec.ts --runInBand
```

Expected: FAIL because purchasing does not yet apply inventory allocation.

- [ ] **Step 3: Extend purchase requirement shape**

Modify `PurchaseRequirement` in `backend/src/application/purchasing/purchasing.service.ts`:

```ts
grossQuantityNeeded?: number;
stockDeductedQuantity?: number;
purchaseShortageQuantity?: number;
onHandQuantity?: number;
allocatedQuantity?: number;
availableQuantity?: number;
usesInventory?: boolean;
allocationRequired?: boolean;
```

- [ ] **Step 4: Apply inventory availability**

Add helper methods inside `PurchasingService`:

```ts
private usesInventoryForRequirement(ingredient: any): boolean {
  return (
    ingredient?.procurementStrategy === IngredientProcurementStrategy.STOCK_REPLENISHMENT ||
    ingredient?.procurementStrategy === IngredientProcurementStrategy.HYBRID
  );
}

private applyInventoryOffset(params: {
  requirement: PurchaseRequirement;
  ingredient: any;
  availability?: {
    onHandQuantityG: number;
    allocatedQuantityG: number;
    availableQuantityG: number;
  };
}): PurchaseRequirement {
  const grossQuantity = this.roundNumber(
    params.requirement.grossQuantityNeeded ?? params.requirement.quantityNeeded,
    3,
  );
  const usesInventory = this.usesInventoryForRequirement(params.ingredient);
  const unitCost =
    grossQuantity > 0 ? Number(params.requirement.estimatedCost || 0) / grossQuantity : 0;
  const stockDeductedQuantity = usesInventory
    ? this.roundNumber(Math.min(grossQuantity, params.availability?.availableQuantityG ?? 0), 3)
    : 0;
  const shortage = this.roundNumber(Math.max(grossQuantity - stockDeductedQuantity, 0), 3);

  return {
    ...params.requirement,
    grossQuantityNeeded: grossQuantity,
    stockDeductedQuantity,
    purchaseShortageQuantity: shortage,
    quantityNeeded: shortage,
    estimatedCost: this.roundNumber(unitCost * shortage, 2),
    onHandQuantity: params.availability?.onHandQuantityG ?? 0,
    allocatedQuantity: params.availability?.allocatedQuantityG ?? 0,
    availableQuantity: params.availability?.availableQuantityG ?? 0,
    usesInventory,
    allocationRequired: stockDeductedQuantity > 0,
  };
}
```

At the end of `calculatePurchaseRequirements`, enrich catalog data first, then apply availability:

```ts
const enriched = await this.enrichRequirementsWithCatalogData(
  requirements,
  ingredientLookup,
);
return this.applyInventoryAvailability(enriched, ingredientLookup);
```

- [ ] **Step 5: Change generatePurchaseList return shape**

Change `generatePurchaseList()` to return:

```ts
export interface GeneratePurchaseListResult {
  purchaseList: PurchaseList | null;
  inventoryAllocation: {
    id: string;
    lineCount: number;
    totalAllocatedQuantityG: number;
  } | null;
  fullyCoveredByInventory: boolean;
}
```

Build:

```ts
const purchaseRequirements = enrichedRequirements.filter(
  (requirement) => requirement.quantityNeeded > 0,
);
const allocationLines = enrichedRequirements
  .filter((requirement) => (requirement.stockDeductedQuantity ?? 0) > 0)
  .map((requirement) => ({
    ingredientId: requirement.ingredientId,
    procurementSkuId: requirement.procurementSkuId,
    quantityG: requirement.stockDeductedQuantity!,
  }));
```

Create a purchase list only when `purchaseRequirements.length > 0`. Create an inventory allocation when `allocationLines.length > 0`, with `purchaseListId` set to the saved purchase list id or null.

- [ ] **Step 6: Run purchasing allocation tests**

Run:

```bash
cd backend && npm test -- tests/application/purchasing/purchasing-inventory-allocation.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 7: Commit purchase calculation behavior**

```bash
git add backend/src/application/purchasing/purchasing.service.ts backend/tests/application/purchasing/purchasing-inventory-allocation.spec.ts
git commit -m "feat: allocate inventory for purchase demand"
```

## Task 4: Purchase Item Metadata Persistence

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Modify: `backend/prisma/migrations/202604170001_add_inventory_allocations/migration.sql`
- Modify: `backend/src/domain/purchasing/purchase-item.entity.ts`
- Modify: `backend/src/infrastructure/repositories/prisma-purchase-list.repository.ts`
- Modify: `backend/tests/infrastructure/repositories/prisma-purchase-list.repository.spec.ts`

- [ ] **Step 1: Extend purchase item schema**

Add fields to `PurchaseItem` in `backend/prisma/schema.prisma`:

```prisma
grossQuantityNeeded      Float?  @map("gross_quantity_needed")
stockDeductedQuantity    Float?  @map("stock_deducted_quantity")
purchaseShortageQuantity Float?  @map("purchase_shortage_quantity")
onHandQuantity           Float?  @map("on_hand_quantity")
allocatedQuantity        Float?  @map("allocated_quantity")
availableQuantity        Float?  @map("available_quantity")
usesInventory            Boolean @default(false) @map("uses_inventory")
```

Append matching `ALTER TABLE "purchase_item"` statements to the migration.

- [ ] **Step 2: Extend PurchaseItem mapping**

Add the fields to `PurchaseItemConstructor`, constructor assignments, `toPrisma()`, and `fromPrisma()` in `backend/src/domain/purchasing/purchase-item.entity.ts`.

- [ ] **Step 3: Persist purchase item metadata**

Update `PrismaPurchaseListRepository.save()` create and update mappings so the new fields are saved.

- [ ] **Step 4: Run repository and build checks**

Run:

```bash
cd backend && npm run prisma:generate:build
cd backend && npm test -- tests/infrastructure/repositories/prisma-purchase-list.repository.spec.ts --runInBand
cd backend && npm run build
```

Expected: all pass.

- [ ] **Step 5: Commit entity persistence**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/202604170001_add_inventory_allocations/migration.sql backend/src/domain/purchasing/purchase-item.entity.ts backend/src/infrastructure/repositories/prisma-purchase-list.repository.ts backend/tests/infrastructure/repositories/prisma-purchase-list.repository.spec.ts
git commit -m "feat: persist purchase stock offsets"
```

## Task 5: Release Allocations On Purchase List Changes

**Files:**
- Modify: `backend/src/application/purchasing/purchasing.service.ts`
- Modify: `backend/tests/application/purchasing/purchasing-inventory-allocation.spec.ts`

- [ ] **Step 1: Add release tests**

Append cases to `backend/tests/application/purchasing/purchasing-inventory-allocation.spec.ts`:

```ts
it('releases active allocations before deleting a pending purchase list', async () => {
  purchaseListRepository.findById.mockResolvedValue(makePendingPurchaseList());
  purchaseListRepository.delete.mockResolvedValue(undefined);

  await service.deletePurchaseList('purchase-list-1', 'admin-1');

  expect(inventoryService.releaseAllocationsForPurchaseList).toHaveBeenCalledWith(
    'purchase-list-1',
  );
});

it('releases and recreates allocation when removing orders from a pending purchase list', async () => {
  purchaseListRepository.findById.mockResolvedValue(makePendingPurchaseList());

  await service.removeOrdersFromPurchaseList('purchase-list-1', ['order-beef'], 'admin-1');

  expect(inventoryService.releaseAllocationsForPurchaseList).toHaveBeenCalledWith(
    'purchase-list-1',
  );
  expect(inventoryService.createAllocationForOrderDemand).toHaveBeenCalled();
});
```

- [ ] **Step 2: Release allocation before purchase list delete**

In `deletePurchaseList`, call:

```ts
await this.inventoryService.releaseAllocationsForPurchaseList(purchaseListId);
await this.purchaseListRepository.delete(purchaseListId);
```

- [ ] **Step 3: Rebuild allocation on order removal and recalculation**

In `removeOrdersFromPurchaseList()` and `recalculatePurchaseList()`, release the old allocation first, recalculate demand for the remaining orders, save the purchase list, then create a new allocation if stock offsets remain.

- [ ] **Step 4: Run purchasing tests**

Run:

```bash
cd backend && npm test -- tests/application/purchasing/purchasing-inventory-allocation.spec.ts tests/application/purchasing/purchasing.service.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 5: Commit release behavior**

```bash
git add backend/src/application/purchasing/purchasing.service.ts backend/tests/application/purchasing/purchasing-inventory-allocation.spec.ts
git commit -m "feat: release inventory allocations with purchase changes"
```

## Task 6: Backend Response Contract

**Files:**
- Modify: `backend/src/application/purchasing/purchasing.service.ts`
- Modify: `backend/src/interfaces/controllers/staff-purchasing.controller.ts`
- Modify: `backend/tests/application/purchasing/purchasing-inventory-allocation.spec.ts`

- [ ] **Step 1: Add preview response assertions**

Add assertions that `previewPurchaseRequirements()` returns:

```ts
expect(preview.items[0]).toEqual(
  expect.objectContaining({
    grossQuantityNeeded: 3000,
    stockDeductedQuantity: 3000,
    purchaseShortageQuantity: 0,
    onHandQuantity: 5000,
    allocatedQuantity: 1000,
    availableQuantity: 4000,
    usesInventory: true,
  }),
);
```

- [ ] **Step 2: Return stock fields in preview items**

In `previewPurchaseRequirements()`, include:

```ts
grossQuantityNeeded: req.grossQuantityNeeded ?? req.quantityNeeded,
stockDeductedQuantity: req.stockDeductedQuantity ?? 0,
purchaseShortageQuantity: req.purchaseShortageQuantity ?? req.quantityNeeded,
onHandQuantity: req.onHandQuantity ?? 0,
allocatedQuantity: req.allocatedQuantity ?? 0,
availableQuantity: req.availableQuantity ?? 0,
usesInventory: req.usesInventory ?? false,
allocationRequired: req.allocationRequired ?? false,
```

- [ ] **Step 3: Update generation API response**

The `POST /staff/purchasing/lists` response should support:

```ts
{
  purchaseList: PurchaseList | null;
  inventoryAllocation: {
    id: string;
    lineCount: number;
    totalAllocatedQuantityG: number;
  } | null;
  fullyCoveredByInventory: boolean;
}
```

The controller message should be:

```ts
const message = result.purchaseList
  ? '采购清单生成成功'
  : '库存已分配，本批订单无需采购';
```

- [ ] **Step 4: Run backend response tests and build**

Run:

```bash
cd backend && npm test -- tests/application/purchasing/purchasing-inventory-allocation.spec.ts tests/application/purchasing/purchasing.service.spec.ts --runInBand
cd backend && npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit response contract**

```bash
git add backend/src/application/purchasing/purchasing.service.ts backend/src/interfaces/controllers/staff-purchasing.controller.ts backend/tests/application/purchasing/purchasing-inventory-allocation.spec.ts
git commit -m "feat: expose inventory allocation purchase results"
```

## Task 7: Miniapp Purchasing Display

**Files:**
- Modify: `miniapp/src/api/purchasing.ts`
- Modify: `miniapp/src/pages/staff-purchasing/preview.vue`
- Modify: `miniapp/src/pages/staff-purchasing/detail.vue`

- [ ] **Step 1: Add display normalization**

In `miniapp/src/api/purchasing.ts`, add fields inside `resolvePurchaseItemDisplay(item)`:

```ts
resolvedGrossQuantityNeeded:
  toOptionalNumber(item?.grossQuantityNeeded) ?? toOptionalNumber(item?.quantityNeeded) ?? 0,
resolvedStockDeductedQuantity: toOptionalNumber(item?.stockDeductedQuantity) ?? 0,
resolvedPurchaseShortageQuantity:
  toOptionalNumber(item?.purchaseShortageQuantity) ?? toOptionalNumber(item?.quantityNeeded) ?? 0,
resolvedOnHandQuantity: toOptionalNumber(item?.onHandQuantity) ?? 0,
resolvedAllocatedQuantity: toOptionalNumber(item?.allocatedQuantity) ?? 0,
resolvedAvailableQuantity: toOptionalNumber(item?.availableQuantity) ?? 0,
resolvedUsesInventory: item?.usesInventory === true,
```

- [ ] **Step 2: Update preview quantity display**

In `miniapp/src/pages/staff-purchasing/preview.vue`, keep the main quantity as purchase shortage and show stock details when `resolvedUsesInventory` is true:

```vue
<view v-if="item.resolvedUsesInventory" class="stock-offset-lines">
  <text>订单需求：{{ formatBaseQuantity(item.resolvedGrossQuantityNeeded) }}{{ getDisplayUnit(item) }}</text>
  <text>可用库存：{{ formatBaseQuantity(item.resolvedAvailableQuantity) }}{{ getDisplayUnit(item) }}</text>
  <text>库存抵扣：{{ formatBaseQuantity(item.resolvedStockDeductedQuantity) }}{{ getDisplayUnit(item) }}</text>
  <text>仍需采购：{{ formatBaseQuantity(item.resolvedPurchaseShortageQuantity) }}{{ getDisplayUnit(item) }}</text>
</view>
```

- [ ] **Step 3: Handle fully stock-covered generation result**

Where the miniapp calls `generatePurchaseList`, handle `purchaseList === null`:

```ts
if (data?.fullyCoveredByInventory) {
  uni.showToast({ title: '库存已分配，无需采购', icon: 'success' });
  uni.navigateBack();
  return;
}
```

- [ ] **Step 4: Run miniapp checks**

Run:

```bash
cd miniapp && npm run type-check
cd miniapp && npm test -- --runInBand
cd miniapp && SEVENKITCHEN_PREVIEW_ONCE=1 SEVENKITCHEN_SKIP_DEVTOOLS=1 SEVENKITCHEN_PREVIEW_TIMEOUT_SECONDS=90 npm run preview
```

Expected: type-check and tests pass; preview builds `dist/build/mp-weixin`.

- [ ] **Step 5: Commit miniapp display**

```bash
git add miniapp/src/api/purchasing.ts miniapp/src/pages/staff-purchasing/preview.vue miniapp/src/pages/staff-purchasing/detail.vue
git commit -m "feat: show inventory allocation in purchasing"
```

## Task 8: Final Verification

**Files:**
- No new files.

- [ ] **Step 1: Run focused backend tests**

```bash
cd backend && npm test -- tests/application/inventory/inventory-allocation.service.spec.ts tests/application/purchasing/purchasing-inventory-allocation.spec.ts tests/application/purchasing/purchasing.service.spec.ts tests/application/purchasing/purchasing-procurement-sku.spec.ts tests/application/inventory/inventory-procurement-sku.spec.ts --runInBand
```

Expected: all suites pass.

- [ ] **Step 2: Run backend build**

```bash
cd backend && npm run build
```

Expected: Prisma generation and Nest build pass.

- [ ] **Step 3: Run miniapp preview build**

```bash
cd miniapp && SEVENKITCHEN_PREVIEW_ONCE=1 SEVENKITCHEN_SKIP_DEVTOOLS=1 SEVENKITCHEN_PREVIEW_TIMEOUT_SECONDS=90 npm run preview
```

Expected: command exits 0 and `miniapp/dist/build/mp-weixin/app.json` is freshly written.

- [ ] **Step 4: Check formatting-sensitive diffs**

```bash
git diff --check
```

Expected: no whitespace errors.

## Acceptance Checklist

- Purchase preview distinguishes gross demand, stock offset, and purchase shortage.
- Daily purchase ingredients do not use old stock as a future offset.
- Hybrid and stock-replenishment ingredients use available inventory first.
- Purchase list items represent only what still needs to be bought.
- Fully stock-covered demand creates an inventory allocation record and no purchase list.
- Inventory allocations are separate from physical ledger balances.
- Pending purchase list deletion releases linked active allocations.
- Backend build and focused tests pass.
- Miniapp preview build passes.
