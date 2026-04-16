# Procurement Inventory Reservation Phase Two A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make order-demand purchase generation subtract usable inventory, reserve the stock it plans to consume, and show staff the difference between gross demand, stock offset, and purchase shortage.

**Architecture:** Keep physical inventory as the existing append-only ledger. Add a separate inventory reservation model so on-hand stock remains auditable while available stock is calculated as `onHand - activeReservations`. Purchasing first aggregates gross order demand from order snapshots, then applies inventory availability only for stock-managed ingredients, creates purchase items for the remaining shortage, and creates active reservations for the stock offset.

**Tech Stack:** NestJS, Prisma, PostgreSQL migrations, Jest, uni-app Vue 3, WeChat mini program preview.

---

## Scope Check

This plan implements Phase 2A from `docs/superpowers/specs/2026-04-16-order-procurement-production-inventory-chain-design.md`:

- Purchase preview shows gross order demand, on-hand stock, active reservations, available stock, stock offset, and purchase shortage.
- Order-demand purchase list generation uses purchase shortage as the purchase quantity.
- Ingredients with `STOCK_REPLENISHMENT` or `HYBRID` procurement strategy can use stock and create reservations.
- Ingredients with `DAILY_PURCHASE` procurement strategy do not use stock for shortage calculation.
- Deleting a pending purchase list releases its active reservations.
- If a date range is fully covered by stock, the system creates a completed zero-item order-demand purchase list as an inventory allocation record, so the order can continue through the fulfillment chain without a fake purchase item.

This plan does not implement:

- Production surplus or shortage recording.
- Batch actual cost settlement.
- Reservation consumption when production deducts stock.
- Order settlement adjustment records.
- Refund or补差价 UI.

## Key Design Decisions

Inventory reservation is not a negative ledger entry. The ledger remains the physical stock record. Reservations live in `inventory_reservation` and affect only available stock:

```text
onHandQuantityG = SUM(inventory_ledger_entry.delta_g)
reservedQuantityG = SUM(active inventory_reservation.quantity_g)
availableQuantityG = max(onHandQuantityG - reservedQuantityG, 0)
```

Daily non-stock ingredients keep the previous behavior: their purchase shortage equals gross demand, even if an old manual ledger entry exists.

The purchase list item quantity means "quantity still needing purchase". New display fields show the original demand and stock offset so staff can see why the purchase number is lower.

## Current Code Map

- `backend/src/application/purchasing/purchasing.service.ts` currently aggregates PAID orders into `PurchaseRequirement[]` and directly uses `quantityNeeded` as the purchase list item quantity.
- `backend/src/application/inventory/inventory.service.ts` currently exposes physical balances through `getBalanceByIngredient()`.
- `backend/prisma/schema.prisma` has `InventoryLedgerEntry`, `PurchaseList`, and `PurchaseItem`, but no reservation model.
- `backend/src/domain/purchasing/purchase-list.entity.ts` currently rejects `itemCount <= 0`; Phase 2A must allow zero purchase items only for stock-covered order-demand lists.
- `miniapp/src/pages/staff-purchasing/preview.vue` and `miniapp/src/pages/staff-purchasing/detail.vue` currently show one purchase quantity, with no stock offset explanation.

## File Structure

Create:

- `backend/prisma/migrations/202604160002_add_inventory_reservations/migration.sql`  
  Adds `inventory_reservation` table and `InventoryReservationStatus` enum.

- `backend/src/domain/inventory/inventory-reservation.entity.ts`  
  Defines reservation status, constructor invariants, and Prisma mapping.

- `backend/tests/application/inventory/inventory-reservation.service.spec.ts`  
  Tests availability calculation, idempotent reservation replacement, and release behavior.

- `backend/tests/application/purchasing/purchasing-inventory-reservation.spec.ts`  
  Tests daily-vs-stock-managed purchase shortage calculation and reservation creation.

Modify:

- `backend/prisma/schema.prisma`  
  Adds `InventoryReservation`, `InventoryReservationStatus`, and relations from `Ingredient` and `PurchaseList`.

- `backend/src/domain/inventory/index.ts`  
  Exports reservation entity and status.

- `backend/src/application/inventory/inventory.service.ts`  
  Adds availability and reservation methods.

- `backend/src/domain/purchasing/purchase-item.entity.ts`  
  Adds optional stock-offset metadata to purchase items.

- `backend/src/domain/purchasing/purchase-list.entity.ts`  
  Allows zero-item order-demand lists only when they represent stock allocation.

- `backend/src/infrastructure/repositories/prisma-purchase-list.repository.ts`  
  Persists purchase item stock-offset metadata and includes reservations on list details.

- `backend/src/application/purchasing/purchasing.service.ts`  
  Applies inventory availability to purchase requirements, creates reservations, releases reservations on delete, and recalculates reservations when order membership changes.

- `backend/src/interfaces/controllers/staff-purchasing.controller.ts`  
  Documents the new preview/list response fields.

- `miniapp/src/api/purchasing.ts`  
  Normalizes stock-offset display fields.

- `miniapp/src/pages/staff-purchasing/preview.vue`  
  Shows gross demand, stock offset, purchase shortage, and fully-covered hints.

- `miniapp/src/pages/staff-purchasing/detail.vue`  
  Shows stock offset metadata on generated purchase items.

## Task 1: Reservation Schema And Domain Entity

**Files:**
- Create: `backend/prisma/migrations/202604160002_add_inventory_reservations/migration.sql`
- Create: `backend/src/domain/inventory/inventory-reservation.entity.ts`
- Modify: `backend/prisma/schema.prisma`
- Modify: `backend/src/domain/inventory/index.ts`

- [ ] **Step 1: Add failing schema expectation test through Prisma generation**

Run before editing:

```bash
cd backend && npm run prisma:generate:build
```

Expected: PASS on the existing schema. This gives a clean baseline before changing Prisma models.

- [ ] **Step 2: Add Prisma model and enum**

Modify `backend/prisma/schema.prisma`:

```prisma
model Ingredient {
  // existing fields stay unchanged
  inventoryReservations        InventoryReservation[]
}

model PurchaseList {
  // existing fields stay unchanged
  inventoryReservations InventoryReservation[]
}

model InventoryReservation {
  id               String                     @id @default(uuid()) @map("id")
  purchaseListId   String                     @map("purchase_list_id")
  ingredientId     String                     @map("ingredient_id")
  procurementSkuId String?                    @map("procurement_sku_id") @db.VarChar(36)
  quantityG        Float                      @map("quantity_g")
  status           InventoryReservationStatus @default(ACTIVE) @map("status")
  sourceOrderIds   String[]                   @default([]) @map("source_order_ids")
  createdAt        DateTime                   @default(now()) @map("created_at")
  releasedAt       DateTime?                  @map("released_at")
  consumedAt       DateTime?                  @map("consumed_at")
  purchaseList     PurchaseList               @relation(fields: [purchaseListId], references: [id], onDelete: Cascade)
  ingredient       Ingredient                 @relation(fields: [ingredientId], references: [id], onDelete: Cascade)

  @@unique([purchaseListId, ingredientId])
  @@index([ingredientId, status])
  @@index([purchaseListId, status])
  @@index([procurementSkuId])
  @@map("inventory_reservation")
}

enum InventoryReservationStatus {
  ACTIVE
  RELEASED
  CONSUMED
}
```

- [ ] **Step 3: Add SQL migration**

Create `backend/prisma/migrations/202604160002_add_inventory_reservations/migration.sql`:

```sql
CREATE TYPE "InventoryReservationStatus" AS ENUM ('ACTIVE', 'RELEASED', 'CONSUMED');

CREATE TABLE "inventory_reservation" (
  "id" TEXT NOT NULL,
  "purchase_list_id" TEXT NOT NULL,
  "ingredient_id" TEXT NOT NULL,
  "procurement_sku_id" VARCHAR(36),
  "quantity_g" DOUBLE PRECISION NOT NULL,
  "status" "InventoryReservationStatus" NOT NULL DEFAULT 'ACTIVE',
  "source_order_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "released_at" TIMESTAMP(3),
  "consumed_at" TIMESTAMP(3),
  CONSTRAINT "inventory_reservation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "inventory_reservation_purchase_list_id_ingredient_id_key"
  ON "inventory_reservation"("purchase_list_id", "ingredient_id");

CREATE INDEX "inventory_reservation_ingredient_id_status_idx"
  ON "inventory_reservation"("ingredient_id", "status");

CREATE INDEX "inventory_reservation_purchase_list_id_status_idx"
  ON "inventory_reservation"("purchase_list_id", "status");

CREATE INDEX "inventory_reservation_procurement_sku_id_idx"
  ON "inventory_reservation"("procurement_sku_id");

ALTER TABLE "inventory_reservation"
  ADD CONSTRAINT "inventory_reservation_purchase_list_id_fkey"
  FOREIGN KEY ("purchase_list_id") REFERENCES "purchase_list"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "inventory_reservation"
  ADD CONSTRAINT "inventory_reservation_ingredient_id_fkey"
  FOREIGN KEY ("ingredient_id") REFERENCES "ingredient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 4: Add domain entity**

Create `backend/src/domain/inventory/inventory-reservation.entity.ts`:

```ts
import { ValidationError } from '../common/errors';

export enum InventoryReservationStatus {
  ACTIVE = 'ACTIVE',
  RELEASED = 'RELEASED',
  CONSUMED = 'CONSUMED',
}

export interface InventoryReservationConstructor {
  id: string;
  purchaseListId: string;
  ingredientId: string;
  procurementSkuId?: string | null;
  quantityG: number;
  status?: InventoryReservationStatus;
  sourceOrderIds?: string[];
  createdAt?: Date;
  releasedAt?: Date | null;
  consumedAt?: Date | null;
}

export class InventoryReservation {
  public readonly id: string;
  public readonly purchaseListId: string;
  public readonly ingredientId: string;
  public readonly procurementSkuId?: string | null;
  public readonly quantityG: number;
  public readonly status: InventoryReservationStatus;
  public readonly sourceOrderIds: string[];
  public readonly createdAt: Date;
  public readonly releasedAt?: Date | null;
  public readonly consumedAt?: Date | null;

  constructor(data: InventoryReservationConstructor) {
    this.id = data.id;
    this.purchaseListId = data.purchaseListId;
    this.ingredientId = data.ingredientId;
    this.procurementSkuId = data.procurementSkuId ?? null;
    this.quantityG = data.quantityG;
    this.status = data.status ?? InventoryReservationStatus.ACTIVE;
    this.sourceOrderIds = data.sourceOrderIds ?? [];
    this.createdAt = data.createdAt ?? new Date();
    this.releasedAt = data.releasedAt ?? null;
    this.consumedAt = data.consumedAt ?? null;
    this.validate();
  }

  private validate(): void {
    if (!this.id.trim()) {
      throw new ValidationError('reservation id cannot be empty');
    }
    if (!this.purchaseListId.trim()) {
      throw new ValidationError('purchaseListId cannot be empty');
    }
    if (!this.ingredientId.trim()) {
      throw new ValidationError('ingredientId cannot be empty');
    }
    if (!Number.isFinite(this.quantityG) || this.quantityG <= 0) {
      throw new ValidationError('reservation quantityG must be positive');
    }
  }
}
```

Modify `backend/src/domain/inventory/index.ts`:

```ts
export * from './inventory-reservation.entity';
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
git add backend/prisma/schema.prisma backend/prisma/migrations/202604160002_add_inventory_reservations/migration.sql backend/src/domain/inventory/inventory-reservation.entity.ts backend/src/domain/inventory/index.ts
git commit -m "feat: add inventory reservations"
```

## Task 2: Inventory Availability And Reservation Service

**Files:**
- Create: `backend/tests/application/inventory/inventory-reservation.service.spec.ts`
- Modify: `backend/src/application/inventory/inventory.service.ts`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/application/inventory/inventory-reservation.service.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { InventoryService, INVENTORY_REPOSITORY } from 'src/application/inventory/inventory.service';
import type { InventoryRepository } from 'src/domain/inventory';
import { PRODUCTION_BATCH_REPOSITORY } from 'src/application/production/production.service';
import { PrismaService } from 'src/infrastructure/prisma.service';

describe('InventoryService reservations', () => {
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
      inventoryReservation: {
        groupBy: jest.fn(),
        updateMany: jest.fn(),
        createMany: jest.fn(),
        findMany: jest.fn(),
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

  it('calculates available stock from on-hand minus active reservations', async () => {
    inventoryRepository.getCurrentBalanceByIngredient
      .mockResolvedValueOnce(5000)
      .mockResolvedValueOnce(800);
    prisma.inventoryReservation.groupBy.mockResolvedValue([
      { ingredientId: 'beef', _sum: { quantityG: 1200 } },
    ]);

    const result = await service.getAvailabilityByIngredientIds(['beef', 'spinach']);

    expect(result.get('beef')).toEqual({
      ingredientId: 'beef',
      onHandQuantityG: 5000,
      reservedQuantityG: 1200,
      availableQuantityG: 3800,
    });
    expect(result.get('spinach')).toEqual({
      ingredientId: 'spinach',
      onHandQuantityG: 800,
      reservedQuantityG: 0,
      availableQuantityG: 800,
    });
  });

  it('replaces active reservations for a purchase list in one transaction', async () => {
    await service.reserveForPurchaseList('purchase-list-1', [
      {
        ingredientId: 'beef',
        procurementSkuId: 'sku-beef',
        quantityG: 1500,
        sourceOrderIds: ['order-1'],
      },
    ]);

    expect(prisma.inventoryReservation.updateMany).toHaveBeenCalledWith({
      where: { purchaseListId: 'purchase-list-1', status: 'ACTIVE' },
      data: { status: 'RELEASED', releasedAt: expect.any(Date) },
    });
    expect(prisma.inventoryReservation.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          purchaseListId: 'purchase-list-1',
          ingredientId: 'beef',
          procurementSkuId: 'sku-beef',
          quantityG: 1500,
          status: 'ACTIVE',
          sourceOrderIds: ['order-1'],
        }),
      ],
    });
  });

  it('releases active reservations for a purchase list', async () => {
    await service.releaseReservationsForPurchaseList('purchase-list-1');

    expect(prisma.inventoryReservation.updateMany).toHaveBeenCalledWith({
      where: { purchaseListId: 'purchase-list-1', status: 'ACTIVE' },
      data: { status: 'RELEASED', releasedAt: expect.any(Date) },
    });
  });
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run:

```bash
cd backend && npm test -- tests/application/inventory/inventory-reservation.service.spec.ts --runInBand
```

Expected: FAIL because the new service methods do not exist.

- [ ] **Step 3: Add service DTOs and methods**

Modify `backend/src/application/inventory/inventory.service.ts` near existing inventory DTOs:

```ts
export interface InventoryAvailabilitySnapshot {
  ingredientId: string;
  onHandQuantityG: number;
  reservedQuantityG: number;
  availableQuantityG: number;
}

export interface InventoryReservationRequest {
  ingredientId: string;
  procurementSkuId?: string | null;
  quantityG: number;
  sourceOrderIds?: string[];
}
```

Add methods to `InventoryService`:

```ts
async getAvailabilityByIngredientIds(
  ingredientIds: string[],
): Promise<Map<string, InventoryAvailabilitySnapshot>> {
  const uniqueIds = Array.from(new Set(ingredientIds.filter(Boolean)));
  if (uniqueIds.length === 0) {
    return new Map();
  }

  const [balances, reservations] = await Promise.all([
    Promise.all(
      uniqueIds.map(async (ingredientId) => [
        ingredientId,
        await this.getBalanceByIngredient(ingredientId),
      ] as const),
    ),
    this.prisma.inventoryReservation.groupBy({
      by: ['ingredientId'],
      where: {
        ingredientId: { in: uniqueIds },
        status: 'ACTIVE',
      },
      _sum: { quantityG: true },
    }),
  ]);

  const balanceMap = new Map(balances);
  const reservedMap = new Map(
    reservations.map((item: any) => [
      item.ingredientId,
      Number(item._sum.quantityG ?? 0),
    ]),
  );

  return new Map(
    uniqueIds.map((ingredientId) => {
      const onHandQuantityG = Number(balanceMap.get(ingredientId) ?? 0);
      const reservedQuantityG = Number(reservedMap.get(ingredientId) ?? 0);
      return [
        ingredientId,
        {
          ingredientId,
          onHandQuantityG,
          reservedQuantityG,
          availableQuantityG: Math.max(onHandQuantityG - reservedQuantityG, 0),
        },
      ];
    }),
  );
}

async reserveForPurchaseList(
  purchaseListId: string,
  reservations: InventoryReservationRequest[],
): Promise<void> {
  const activeReservations = reservations
    .filter((item) => Number.isFinite(item.quantityG) && item.quantityG > 0)
    .map((item) => ({
      id: randomUUID(),
      purchaseListId,
      ingredientId: item.ingredientId,
      procurementSkuId: item.procurementSkuId ?? null,
      quantityG: this.roundNumber(item.quantityG, 3),
      status: 'ACTIVE' as const,
      sourceOrderIds: item.sourceOrderIds ?? [],
      createdAt: new Date(),
    }));

  await this.prisma.$transaction(async (tx) => {
    await tx.inventoryReservation.updateMany({
      where: { purchaseListId, status: 'ACTIVE' },
      data: { status: 'RELEASED', releasedAt: new Date() },
    });

    if (activeReservations.length > 0) {
      await tx.inventoryReservation.createMany({
        data: activeReservations,
      });
    }
  });
}

async releaseReservationsForPurchaseList(purchaseListId: string): Promise<void> {
  await this.prisma.inventoryReservation.updateMany({
    where: { purchaseListId, status: 'ACTIVE' },
    data: { status: 'RELEASED', releasedAt: new Date() },
  });
}
```

- [ ] **Step 4: Run reservation service tests**

Run:

```bash
cd backend && npm test -- tests/application/inventory/inventory-reservation.service.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 5: Commit inventory service behavior**

```bash
git add backend/src/application/inventory/inventory.service.ts backend/tests/application/inventory/inventory-reservation.service.spec.ts
git commit -m "feat: calculate reserved inventory availability"
```

## Task 3: Purchase Requirement Stock Offset

**Files:**
- Create: `backend/tests/application/purchasing/purchasing-inventory-reservation.spec.ts`
- Modify: `backend/src/application/purchasing/purchasing.service.ts`

- [ ] **Step 1: Write failing purchasing tests**

Create `backend/tests/application/purchasing/purchasing-inventory-reservation.spec.ts` with two cases:

```ts
import { Test } from '@nestjs/testing';
import { InventoryService } from 'src/application/inventory/inventory.service';
import { ProcurementSkuService } from 'src/application/ingredient/procurement-sku.service';
import { RecommendedProductService } from 'src/application/ingredient/recommended-product.service';
import { INGREDIENT_REPOSITORY } from 'src/application/ingredient/ingredient.service';
import { ORDER_REPOSITORY } from 'src/application/order/order.service';
import { PurchasingService } from 'src/application/purchasing/purchasing.service';
import {
  PURCHASE_LIST_REPOSITORY,
  PURCHASE_RECORD_REPOSITORY,
} from 'src/application/purchasing/purchasing.service.tokens';
import { OrderStatus } from 'src/domain';

const makePaidOrder = (ingredientId: string, name: string, purchaseAmount: number) => ({
  id: `order-${ingredientId}`,
  status: OrderStatus.PAID,
  targetProductionDate: new Date('2026-04-20T00:00:00.000Z'),
  pricingBreakdownSnapshot: {
    ingredientDetails: [
      {
        ingredientId,
        name,
        purchaseAmount,
        unit: 'G',
        cost: purchaseAmount / 100,
        type: 'FOOD',
      },
    ],
  },
  items: [
    {
      recipeSnapshot: {
        items: [
          {
            ingredient_id: ingredientId,
            ingredient_type: 'FOOD',
            sort_order: 1,
          },
        ],
      },
    },
  ],
});

describe('PurchasingService inventory reservation calculation', () => {
  async function createService() {
    const orderRepository = {
      findByTargetProductionDateRange: jest.fn().mockResolvedValue({
        list: [
          makePaidOrder('beef', '牛肉', 3000),
          makePaidOrder('spinach', '菠菜', 600),
        ],
      }),
      save: jest.fn(),
    };
    const ingredientRepository = {
      findByIds: jest.fn().mockResolvedValue([
        {
          id: 'beef',
          name: '牛肉',
          type: 'FOOD',
          procurementStrategy: 'HYBRID',
          baseUnit: 'G',
          purchaseUnit: 'G',
          purchaseToBaseRatio: 1,
          currentPricePerPurchaseUnit: 0.08,
        },
        {
          id: 'spinach',
          name: '菠菜',
          type: 'FOOD',
          procurementStrategy: 'DAILY_PURCHASE',
          baseUnit: 'G',
          purchaseUnit: 'G',
          purchaseToBaseRatio: 1,
          currentPricePerPurchaseUnit: 0.03,
        },
      ]),
      findAll: jest.fn().mockResolvedValue([]),
    };
    const inventoryService = {
      getAvailabilityByIngredientIds: jest.fn().mockResolvedValue(
        new Map([
          [
            'beef',
            {
              ingredientId: 'beef',
              onHandQuantityG: 5000,
              reservedQuantityG: 1000,
              availableQuantityG: 4000,
            },
          ],
          [
            'spinach',
            {
              ingredientId: 'spinach',
              onHandQuantityG: 900,
              reservedQuantityG: 0,
              availableQuantityG: 900,
            },
          ],
        ]),
      ),
      reserveForPurchaseList: jest.fn(),
      releaseReservationsForPurchaseList: jest.fn(),
      inboundFromPurchaseRecords: jest.fn(),
    };
    const purchaseListRepository = {
      findByDateRange: jest.fn().mockResolvedValue([]),
      save: jest.fn(async (list) => ({ ...list, id: list.id || 'purchase-list-1' })),
    };

    const module = await Test.createTestingModule({
      providers: [
        PurchasingService,
        { provide: ORDER_REPOSITORY, useValue: orderRepository },
        { provide: INGREDIENT_REPOSITORY, useValue: ingredientRepository },
        { provide: InventoryService, useValue: inventoryService },
        { provide: ProcurementSkuService, useValue: { batchFindActive: jest.fn().mockResolvedValue({}) } },
        { provide: RecommendedProductService, useValue: { batchFindActive: jest.fn().mockResolvedValue({}) } },
        { provide: PURCHASE_LIST_REPOSITORY, useValue: purchaseListRepository },
        { provide: PURCHASE_RECORD_REPOSITORY, useValue: {} },
      ],
    }).compile();

    return {
      service: module.get(PurchasingService),
      inventoryService,
      purchaseListRepository,
    };
  }

  it('offsets hybrid ingredients by available stock but leaves daily purchase ingredients untouched', async () => {
    const { service } = await createService();

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

  it('creates reservations for stock offsets when generating a purchase list', async () => {
    const { service, inventoryService } = await createService();

    const result = await service.generatePurchaseList(
      { startDate: '2026-04-20' },
      'admin-1',
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        ingredientId: 'spinach',
        quantityNeeded: 600,
      }),
    );
    expect(inventoryService.reserveForPurchaseList).toHaveBeenCalledWith(
      expect.any(String),
      [
        expect.objectContaining({
          ingredientId: 'beef',
          quantityG: 3000,
          sourceOrderIds: ['order-beef', 'order-spinach'],
        }),
      ],
    );
  });
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run:

```bash
cd backend && npm test -- tests/application/purchasing/purchasing-inventory-reservation.spec.ts --runInBand
```

Expected: FAIL because purchase requirements do not expose stock offset fields and generation does not reserve inventory.

- [ ] **Step 3: Extend purchase requirement shape**

Modify `PurchaseRequirement` in `backend/src/application/purchasing/purchasing.service.ts`:

```ts
export interface PurchaseRequirement {
  ingredientId: string;
  ingredientName: string;
  type: 'FOOD' | 'SUPPLEMENT' | 'PACKAGING';
  quantityNeeded: number;
  quantityUnit: string;
  estimatedCost: number;
  grossQuantityNeeded?: number;
  stockDeductedQuantity?: number;
  purchaseShortageQuantity?: number;
  onHandQuantity?: number;
  reservedQuantity?: number;
  availableQuantity?: number;
  usesInventory?: boolean;
  reservationRequired?: boolean;
  preparationMethods?: string[];
  purchaseChannel?: string;
  productModel?: string;
  displayUnit?: string;
  ingredientBaseUnit?: string;
  foodDensityGPerMl?: number | null;
  procurementSkuId?: string;
  procurementSkuName?: string;
  suggestedProductId?: string;
  suggestedProductName?: string;
  minSortOrder?: number;
}
```

- [ ] **Step 4: Add inventory offset helpers**

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
    reservedQuantityG: number;
    availableQuantityG: number;
  };
}): PurchaseRequirement {
  const { requirement, ingredient, availability } = params;
  const grossQuantity = this.roundNumber(
    requirement.grossQuantityNeeded ?? requirement.quantityNeeded,
    3,
  );
  const usesInventory = this.usesInventoryForRequirement(ingredient);
  const unitCost =
    grossQuantity > 0 ? Number(requirement.estimatedCost || 0) / grossQuantity : 0;
  const stockDeductedQuantity = usesInventory
    ? this.roundNumber(Math.min(grossQuantity, availability?.availableQuantityG ?? 0), 3)
    : 0;
  const shortage = this.roundNumber(Math.max(grossQuantity - stockDeductedQuantity, 0), 3);

  return {
    ...requirement,
    grossQuantityNeeded: grossQuantity,
    stockDeductedQuantity,
    purchaseShortageQuantity: shortage,
    quantityNeeded: shortage,
    estimatedCost: this.roundNumber(unitCost * shortage, 2),
    onHandQuantity: availability?.onHandQuantityG ?? 0,
    reservedQuantity: availability?.reservedQuantityG ?? 0,
    availableQuantity: availability?.availableQuantityG ?? 0,
    usesInventory,
    reservationRequired: stockDeductedQuantity > 0,
  };
}

private async applyInventoryAvailability(
  requirements: PurchaseRequirement[],
  ingredientLookup: Map<string, any>,
): Promise<PurchaseRequirement[]> {
  const stockManagedIngredientIds = requirements
    .filter((requirement) =>
      this.usesInventoryForRequirement(ingredientLookup.get(requirement.ingredientId)),
    )
    .map((requirement) => requirement.ingredientId);
  const availabilityMap =
    await this.inventoryService.getAvailabilityByIngredientIds(stockManagedIngredientIds);

  return requirements.map((requirement) =>
    this.applyInventoryOffset({
      requirement,
      ingredient: ingredientLookup.get(requirement.ingredientId),
      availability: availabilityMap.get(requirement.ingredientId),
    }),
  );
}
```

- [ ] **Step 5: Apply offset after catalog enrichment**

At the end of `calculatePurchaseRequirements`, replace the existing return:

```ts
const enriched = await this.enrichRequirementsWithCatalogData(
  requirements,
  ingredientLookup,
);

return this.applyInventoryAvailability(enriched, ingredientLookup);
```

- [ ] **Step 6: Filter purchase items by shortage and reserve offsets**

In `generatePurchaseList`, create `purchaseRequirements` and `reservations`:

```ts
const purchaseRequirements = enrichedRequirements.filter(
  (requirement) => requirement.quantityNeeded > 0,
);
const reservations = enrichedRequirements
  .filter((requirement) => (requirement.stockDeductedQuantity ?? 0) > 0)
  .map((requirement) => ({
    ingredientId: requirement.ingredientId,
    procurementSkuId: requirement.procurementSkuId,
    quantityG: requirement.stockDeductedQuantity!,
    sourceOrderIds,
  }));
```

Build purchase items from `purchaseRequirements`, not from all requirements. If `purchaseRequirements.length === 0` and `reservations.length > 0`, create the purchase list with `status: PurchaseListStatus.COMPLETED`, `itemCount: 0`, and `totalEstimatedCost: 0`.

After saving the purchase list, call:

```ts
await this.inventoryService.reserveForPurchaseList(saved.id, reservations);
```

- [ ] **Step 7: Run purchasing reservation tests**

Run:

```bash
cd backend && npm test -- tests/application/purchasing/purchasing-inventory-reservation.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 8: Commit purchase calculation behavior**

```bash
git add backend/src/application/purchasing/purchasing.service.ts backend/tests/application/purchasing/purchasing-inventory-reservation.spec.ts
git commit -m "feat: offset purchase demand with reserved inventory"
```

## Task 4: Purchase Entities And Persistence Metadata

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Add migration SQL to `backend/prisma/migrations/202604160002_add_inventory_reservations/migration.sql`
- Modify: `backend/src/domain/purchasing/purchase-item.entity.ts`
- Modify: `backend/src/domain/purchasing/purchase-list.entity.ts`
- Modify: `backend/src/infrastructure/repositories/prisma-purchase-list.repository.ts`
- Modify: `backend/tests/infrastructure/repositories/prisma-purchase-list.repository.spec.ts`

- [ ] **Step 1: Extend purchase item schema**

Add fields to `PurchaseItem` in `backend/prisma/schema.prisma`:

```prisma
grossQuantityNeeded      Float? @map("gross_quantity_needed")
stockDeductedQuantity    Float? @map("stock_deducted_quantity")
purchaseShortageQuantity Float? @map("purchase_shortage_quantity")
onHandQuantity           Float? @map("on_hand_quantity")
reservedQuantity         Float? @map("reserved_quantity")
availableQuantity        Float? @map("available_quantity")
usesInventory            Boolean @default(false) @map("uses_inventory")
```

Append to the migration file:

```sql
ALTER TABLE "purchase_item"
  ADD COLUMN "gross_quantity_needed" DOUBLE PRECISION,
  ADD COLUMN "stock_deducted_quantity" DOUBLE PRECISION,
  ADD COLUMN "purchase_shortage_quantity" DOUBLE PRECISION,
  ADD COLUMN "on_hand_quantity" DOUBLE PRECISION,
  ADD COLUMN "reserved_quantity" DOUBLE PRECISION,
  ADD COLUMN "available_quantity" DOUBLE PRECISION,
  ADD COLUMN "uses_inventory" BOOLEAN NOT NULL DEFAULT false;
```

- [ ] **Step 2: Extend PurchaseItem constructor and Prisma mapping**

Add optional fields to `PurchaseItemConstructor` and readonly properties:

```ts
grossQuantityNeeded?: number;
stockDeductedQuantity?: number;
purchaseShortageQuantity?: number;
onHandQuantity?: number;
reservedQuantity?: number;
availableQuantity?: number;
usesInventory?: boolean;
```

In the constructor, assign defaults:

```ts
this.grossQuantityNeeded = data.grossQuantityNeeded;
this.stockDeductedQuantity = data.stockDeductedQuantity;
this.purchaseShortageQuantity = data.purchaseShortageQuantity;
this.onHandQuantity = data.onHandQuantity;
this.reservedQuantity = data.reservedQuantity;
this.availableQuantity = data.availableQuantity;
this.usesInventory = data.usesInventory ?? false;
```

Include the fields in `toPrisma()` and `fromPrisma()`.

- [ ] **Step 3: Allow stock-covered zero-item order-demand list**

Modify `PurchaseList.validateInvariants()`:

```ts
const isStockCoveredOrderDemand =
  this.kind === PurchaseListKind.ORDER_DEMAND &&
  this.itemCount === 0 &&
  this.sourceOrderIds.length > 0 &&
  this.totalEstimatedCost === 0;

if (this.itemCount <= 0 && !isStockCoveredOrderDemand) {
  throw new Error('Item count must be positive');
}
```

Keep the existing `items.length !== itemCount` and `sourceOrderIds` validations.

- [ ] **Step 4: Persist purchase item metadata**

Update `PrismaPurchaseListRepository.save()` create and update mappings so `grossQuantityNeeded`, `stockDeductedQuantity`, `purchaseShortageQuantity`, `onHandQuantity`, `reservedQuantity`, `availableQuantity`, and `usesInventory` are saved.

- [ ] **Step 5: Run repository and build checks**

Run:

```bash
cd backend && npm run prisma:generate:build
cd backend && npm test -- tests/infrastructure/repositories/prisma-purchase-list.repository.spec.ts --runInBand
cd backend && npm run build
```

Expected: all pass.

- [ ] **Step 6: Commit entity persistence**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/202604160002_add_inventory_reservations/migration.sql backend/src/domain/purchasing/purchase-item.entity.ts backend/src/domain/purchasing/purchase-list.entity.ts backend/src/infrastructure/repositories/prisma-purchase-list.repository.ts backend/tests/infrastructure/repositories/prisma-purchase-list.repository.spec.ts
git commit -m "feat: persist purchase stock offsets"
```

## Task 5: Release Reservations On Purchase List Changes

**Files:**
- Modify: `backend/src/application/purchasing/purchasing.service.ts`
- Modify: `backend/tests/application/purchasing/purchasing-inventory-reservation.spec.ts`

- [ ] **Step 1: Add failing release test**

Append to `backend/tests/application/purchasing/purchasing-inventory-reservation.spec.ts`:

```ts
it('releases active reservations before deleting a pending purchase list', async () => {
  const { service, inventoryService } = await createService();
  const purchaseList: any = {
    id: 'purchase-list-1',
    status: 'PENDING',
    reimbursementId: null,
    sourceOrderIds: [],
    items: [],
  };
  (service as any).purchaseListRepository.findById.mockResolvedValue(purchaseList);
  (service as any).purchaseListRepository.delete.mockResolvedValue(undefined);

  await service.deletePurchaseList('purchase-list-1', 'admin-1');

  expect(inventoryService.releaseReservationsForPurchaseList).toHaveBeenCalledWith(
    'purchase-list-1',
  );
});
```

- [ ] **Step 2: Release before delete**

In `deletePurchaseList`, call before repository delete:

```ts
await this.inventoryService.releaseReservationsForPurchaseList(purchaseListId);
await this.purchaseListRepository.delete(purchaseListId);
```

- [ ] **Step 3: Recalculate reservations when removing orders or recalculating**

For Phase 2A, use the safe conservative rule:

```ts
await this.inventoryService.releaseReservationsForPurchaseList(purchaseListId);
```

Call it in `removeOrdersFromPurchaseList()` and `recalculatePurchaseList()` before saving recalculated items. Then call `reserveForPurchaseList()` with the newly calculated stock offsets after save.

- [ ] **Step 4: Run purchasing tests**

Run:

```bash
cd backend && npm test -- tests/application/purchasing/purchasing-inventory-reservation.spec.ts tests/application/purchasing/purchasing.service.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 5: Commit release behavior**

```bash
git add backend/src/application/purchasing/purchasing.service.ts backend/tests/application/purchasing/purchasing-inventory-reservation.spec.ts
git commit -m "feat: release inventory reservations with purchase changes"
```

## Task 6: Backend Response Contract

**Files:**
- Modify: `backend/src/application/purchasing/purchasing.service.ts`
- Modify: `backend/src/interfaces/controllers/staff-purchasing.controller.ts`
- Modify: `backend/tests/application/purchasing/purchasing-inventory-reservation.spec.ts`

- [ ] **Step 1: Add preview response assertions**

Add assertions that `previewPurchaseRequirements()` returns:

```ts
expect(preview.items[0]).toEqual(
  expect.objectContaining({
    grossQuantityNeeded: 3000,
    stockDeductedQuantity: 3000,
    purchaseShortageQuantity: 0,
    onHandQuantity: 5000,
    reservedQuantity: 1000,
    availableQuantity: 4000,
    usesInventory: true,
  }),
);
expect(preview.totalEstimatedCost).toBe(18);
```

The expected total is only the daily spinach shortage cost in the test fixture.

- [ ] **Step 2: Return stock fields in preview items**

In `previewPurchaseRequirements()`, include:

```ts
grossQuantityNeeded: req.grossQuantityNeeded ?? req.quantityNeeded,
stockDeductedQuantity: req.stockDeductedQuantity ?? 0,
purchaseShortageQuantity: req.purchaseShortageQuantity ?? req.quantityNeeded,
onHandQuantity: req.onHandQuantity ?? 0,
reservedQuantity: req.reservedQuantity ?? 0,
availableQuantity: req.availableQuantity ?? 0,
usesInventory: req.usesInventory ?? false,
reservationRequired: req.reservationRequired ?? false,
```

Calculate `totalEstimatedCost` from purchase shortages only:

```ts
const totalEstimatedCost = enrichedRequirements.reduce(
  (sum, req) => sum + req.estimatedCost,
  0,
);
```

- [ ] **Step 3: Update Swagger response schema**

Add the same fields to `StaffPurchasingController` preview response schema:

```ts
grossQuantityNeeded: { type: 'number', description: '订单原始需求量' },
stockDeductedQuantity: { type: 'number', description: '库存抵扣量' },
purchaseShortageQuantity: { type: 'number', description: '仍需采购量' },
onHandQuantity: { type: 'number', description: '当前在库量' },
reservedQuantity: { type: 'number', description: '已预占量' },
availableQuantity: { type: 'number', description: '可用库存量' },
usesInventory: { type: 'boolean', description: '是否参与库存抵扣' },
reservationRequired: { type: 'boolean', description: '是否会生成库存预占' },
```

- [ ] **Step 4: Run backend response tests and build**

Run:

```bash
cd backend && npm test -- tests/application/purchasing/purchasing-inventory-reservation.spec.ts tests/application/purchasing/purchasing.service.spec.ts --runInBand
cd backend && npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit response contract**

```bash
git add backend/src/application/purchasing/purchasing.service.ts backend/src/interfaces/controllers/staff-purchasing.controller.ts backend/tests/application/purchasing/purchasing-inventory-reservation.spec.ts
git commit -m "feat: expose purchase stock offsets"
```

## Task 7: Miniapp Purchasing Preview Display

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
resolvedReservedQuantity: toOptionalNumber(item?.reservedQuantity) ?? 0,
resolvedAvailableQuantity: toOptionalNumber(item?.availableQuantity) ?? 0,
resolvedUsesInventory: item?.usesInventory === true,
```

- [ ] **Step 2: Update preview quantity display**

In `miniapp/src/pages/staff-purchasing/preview.vue`, keep the main quantity as purchase shortage:

```vue
<text class="quantity">{{ formatPurchaseShortage(item) }}</text>
<text class="unit">{{ getDisplayUnit(item) }}</text>
```

Add stock detail below the main line:

```vue
<view v-if="item.resolvedUsesInventory" class="stock-offset-lines">
  <text>订单需求：{{ formatBaseQuantity(item.resolvedGrossQuantityNeeded) }}{{ getDisplayUnit(item) }}</text>
  <text>可用库存：{{ formatBaseQuantity(item.resolvedAvailableQuantity) }}{{ getDisplayUnit(item) }}</text>
  <text>库存抵扣：{{ formatBaseQuantity(item.resolvedStockDeductedQuantity) }}{{ getDisplayUnit(item) }}</text>
  <text>仍需采购：{{ formatBaseQuantity(item.resolvedPurchaseShortageQuantity) }}{{ getDisplayUnit(item) }}</text>
</view>
```

Add helpers:

```ts
const formatBaseQuantity = (value: number) => {
  const numeric = Number(value || 0);
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(1);
};

const formatPurchaseShortage = (item: any) => {
  return formatBaseQuantity(item.resolvedPurchaseShortageQuantity ?? item.quantityNeeded ?? 0);
};
```

- [ ] **Step 3: Add visual state for fully covered items**

Add a class:

```vue
:class="{ 'fully-covered': item.resolvedUsesInventory && item.resolvedPurchaseShortageQuantity <= 0 }"
```

Add CSS:

```scss
.ingredient-item.fully-covered {
  border-color: #6bbf8f;
  background: #f2fbf6;
}

.stock-offset-lines {
  display: flex;
  flex-direction: column;
  gap: 6rpx;
  margin-top: 12rpx;
  color: #5c6f63;
  font-size: 24rpx;
}
```

- [ ] **Step 4: Update detail page stock metadata**

In `miniapp/src/pages/staff-purchasing/detail.vue`, display stock offset metadata on generated items using the same normalized fields. Hide the block for manual items and non-stock-managed ingredients.

- [ ] **Step 5: Run miniapp checks**

Run:

```bash
cd miniapp && npm run type-check
cd miniapp && npm test -- --runInBand
cd miniapp && SEVENKITCHEN_PREVIEW_ONCE=1 SEVENKITCHEN_SKIP_DEVTOOLS=1 SEVENKITCHEN_PREVIEW_TIMEOUT_SECONDS=90 npm run preview
```

Expected: type-check and tests pass; preview builds `dist/build/mp-weixin`.

- [ ] **Step 6: Commit miniapp display**

```bash
git add miniapp/src/api/purchasing.ts miniapp/src/pages/staff-purchasing/preview.vue miniapp/src/pages/staff-purchasing/detail.vue
git commit -m "feat: show purchase stock offsets in miniapp"
```

## Task 8: Final Verification

**Files:**
- No new files.

- [ ] **Step 1: Run focused backend tests**

```bash
cd backend && npm test -- tests/application/inventory/inventory-reservation.service.spec.ts tests/application/purchasing/purchasing-inventory-reservation.spec.ts tests/application/purchasing/purchasing.service.spec.ts tests/application/purchasing/purchasing-procurement-sku.spec.ts tests/application/inventory/inventory-procurement-sku.spec.ts --runInBand
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
- Inventory reservations are separate from physical ledger balances.
- Pending purchase list deletion releases active reservations.
- Fully stock-covered order demand can move forward without a fake purchase item.
- Backend build and focused tests pass.
- Miniapp preview build passes.
