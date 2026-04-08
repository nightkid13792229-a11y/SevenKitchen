# Standard Ingredient SKU Separation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split production procurement SKUs from family DIY recommendation SKUs under the same standard ingredient, while keeping recipes bound only to standard ingredients and preserving compatibility for historical purchasing data.

**Architecture:** Keep `recommended_product` as the DIY-facing SKU source, add a new `procurement_sku` model plus purchase-item and purchase-record snapshot fields for the production side, then switch the purchasing pipeline and staff UI to the new procurement SKU source. Expose the new procurement SKU CRUD through a focused admin controller and update admin-web and miniapp clients to render two separate SKU sections and procurement-first purchasing flows.

**Tech Stack:** NestJS, Prisma, Jest, Vue 3 + Element Plus admin-web, uni-app Vue 3 miniapp

---

## File Structure

### Backend persistence and services

- Create: `backend/src/application/ingredient/procurement-sku.service.ts`
- Create: `backend/src/interfaces/controllers/procurement-sku.controller.ts`
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260403121500_add_procurement_sku/migration.sql`
- Create: `backend/prisma/migrations/20260403133000_add_purchase_procurement_sku_snapshots/migration.sql`
- Modify: `backend/src/app.module.ts`
- Modify: `backend/src/application/ingredient/recommended-product.service.ts`
- Modify: `backend/src/application/purchasing/purchasing.service.ts`
- Modify: `backend/src/domain/purchasing/purchase-item.entity.ts`
- Modify: `backend/src/domain/purchasing/purchase-record.entity.ts`
- Modify: `backend/src/infrastructure/repositories/prisma-purchase-list.repository.ts`
- Modify: `backend/src/infrastructure/repositories/prisma-purchase-record.repository.ts`
- Modify: `backend/src/interfaces/controllers/recommended-product.controller.ts`
- Modify: `backend/src/interfaces/controllers/staff-purchasing.controller.ts`
- Modify: `backend/src/interfaces/controllers/admin.controller.ts`

### Backend tests

- Create: `backend/tests/application/ingredient/procurement-sku.service.spec.ts`
- Create: `backend/tests/application/purchasing/purchasing.service.spec.ts`
- Create: `backend/tests/interfaces/controllers/procurement-sku.controller.spec.ts`
- Create: `backend/tests/interfaces/controllers/recommended-product.controller.spec.ts`

### Admin web

- Modify: `admin-web/src/types/ingredient.ts`
- Modify: `admin-web/src/api/ingredients.ts`
- Modify: `admin-web/src/views/Ingredients/IngredientForm.vue`
- Modify: `admin-web/src/views/Ingredients/index.vue`

### Miniapp

- Modify: `miniapp/src/api/purchasing.ts`
- Modify: `miniapp/src/api/inventory.ts`
- Modify: `miniapp/src/pages/staff-purchasing/detail.vue`
- Modify: `miniapp/src/pages/staff-purchasing/preview.vue`
- Modify: `miniapp/src/pages/staff-purchasing/stock-create.vue`
- Modify: `miniapp/src/pages/staff-inventory/index.vue`

## Task 1: Add Procurement SKU Persistence and Service Foundation

**Files:**
- Create: `backend/tests/application/ingredient/procurement-sku.service.spec.ts`
- Create: `backend/src/application/ingredient/procurement-sku.service.ts`
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260403121500_add_procurement_sku/migration.sql`
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: Write the failing procurement SKU service test**

```ts
import { NotFoundException } from '@nestjs/common';
import { ProcurementSkuService } from 'src/application/ingredient/procurement-sku.service';

describe('ProcurementSkuService', () => {
  const prisma = {
    ingredient: { findUnique: jest.fn() },
    procurementSku: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
  } as any;

  let service: ProcurementSkuService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ProcurementSkuService(prisma);
  });

  it('groups active procurement skus by ingredient id ordered by sortOrder', async () => {
    prisma.procurementSku.findMany.mockResolvedValue([
      {
        id: 'sku-2',
        ingredientId: 'ingredient-1',
        name: '冻鸡胸 1kg/袋',
        brand: '鲜享',
        productModel: '1kg/袋',
        purchaseChannel: '美团快驴',
        referencePricePerPurchaseUnit: 42.5,
        displayUnit: '袋',
        notes: null,
        isActive: true,
        sortOrder: 1,
      },
      {
        id: 'sku-1',
        ingredientId: 'ingredient-1',
        name: '冻鸡胸 2kg/袋',
        brand: '鲜享',
        productModel: '2kg/袋',
        purchaseChannel: '京东冷链',
        referencePricePerPurchaseUnit: 76,
        displayUnit: '袋',
        notes: '整箱更便宜',
        isActive: true,
        sortOrder: 2,
      },
    ]);

    await expect(service.batchFindActive(['ingredient-1'])).resolves.toEqual({
      'ingredient-1': [
        expect.objectContaining({ id: 'sku-2', sortOrder: 1 }),
        expect.objectContaining({ id: 'sku-1', sortOrder: 2 }),
      ],
    });
  });

  it('throws when creating a procurement sku for a missing ingredient', async () => {
    prisma.ingredient.findUnique.mockResolvedValue(null);

    await expect(
      service.create('missing-ingredient', {
        name: '京东鸡胸 1kg/袋',
        purchaseChannel: '京东冷链',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npm test -- backend/tests/application/ingredient/procurement-sku.service.spec.ts --runInBand`

Expected: FAIL with a module resolution error for `src/application/ingredient/procurement-sku.service` or a TypeScript error because `prisma.procurementSku` does not exist yet.

- [ ] **Step 3: Add the new Prisma model and migration**

```prisma
model Ingredient {
  id                  String             @id @default(uuid())
  name                String
  recommendedProducts RecommendedProduct[]
  procurementSkus     ProcurementSku[]

  @@map("ingredient")
}

model ProcurementSku {
  id                            String     @id @default(uuid())
  ingredientId                  String     @map("ingredient_id")
  name                          String
  brand                         String?    @db.VarChar(100)
  productModel                  String?    @map("product_model") @db.VarChar(100)
  purchaseChannel               String?    @map("purchase_channel") @db.VarChar(200)
  referencePricePerPurchaseUnit Decimal?   @map("reference_price_per_purchase_unit") @db.Decimal(10, 2)
  displayUnit                   String?    @map("display_unit") @db.VarChar(50)
  notes                         String?
  isActive                      Boolean    @default(true) @map("is_active")
  sortOrder                     Int        @default(0) @map("sort_order")
  createdAt                     DateTime   @default(now()) @map("created_at")
  updatedAt                     DateTime   @updatedAt @map("updated_at")

  ingredient                    Ingredient @relation(fields: [ingredientId], references: [id], onDelete: Cascade)

  @@index([ingredientId])
  @@index([isActive])
  @@map("procurement_sku")
}
```

```sql
CREATE TABLE "procurement_sku" (
  "id" VARCHAR(36) NOT NULL,
  "ingredient_id" VARCHAR(36) NOT NULL,
  "name" TEXT NOT NULL,
  "brand" VARCHAR(100),
  "product_model" VARCHAR(100),
  "purchase_channel" VARCHAR(200),
  "reference_price_per_purchase_unit" DECIMAL(10, 2),
  "display_unit" VARCHAR(50),
  "notes" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "procurement_sku_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "procurement_sku_ingredient_id_idx" ON "procurement_sku"("ingredient_id");
CREATE INDEX "procurement_sku_is_active_idx" ON "procurement_sku"("is_active");

ALTER TABLE "procurement_sku"
ADD CONSTRAINT "procurement_sku_ingredient_id_fkey"
FOREIGN KEY ("ingredient_id") REFERENCES "ingredient"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 4: Implement the procurement SKU application service and register it**

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma.service';

export interface ProcurementSkuSummary {
  id: string;
  ingredientId: string;
  name: string;
  brand?: string | null;
  productModel?: string | null;
  purchaseChannel?: string | null;
  referencePricePerPurchaseUnit?: number | null;
  displayUnit?: string | null;
  notes?: string | null;
  isActive: boolean;
  sortOrder: number;
}

export interface CreateProcurementSkuDto {
  name: string;
  brand?: string;
  productModel?: string;
  purchaseChannel?: string;
  referencePricePerPurchaseUnit?: number;
  displayUnit?: string;
  notes?: string;
  isActive?: boolean;
  sortOrder?: number;
}

export interface UpdateProcurementSkuDto extends Partial<CreateProcurementSkuDto> {}

@Injectable()
export class ProcurementSkuService {
  constructor(private readonly prisma: PrismaService) {}

  async batchFindActive(ingredientIds: string[]): Promise<Record<string, ProcurementSkuSummary[]>> {
    if (ingredientIds.length === 0) return {};

    const rows = await this.prisma.procurementSku.findMany({
      where: { ingredientId: { in: ingredientIds }, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    return rows.reduce<Record<string, ProcurementSkuSummary[]>>((acc, row) => {
      if (!acc[row.ingredientId]) acc[row.ingredientId] = [];
      acc[row.ingredientId].push({
        id: row.id,
        ingredientId: row.ingredientId,
        name: row.name,
        brand: row.brand,
        productModel: row.productModel,
        purchaseChannel: row.purchaseChannel,
        referencePricePerPurchaseUnit:
          row.referencePricePerPurchaseUnit !== null && row.referencePricePerPurchaseUnit !== undefined
            ? Number(row.referencePricePerPurchaseUnit)
            : null,
        displayUnit: row.displayUnit,
        notes: row.notes,
        isActive: row.isActive,
        sortOrder: row.sortOrder,
      });
      return acc;
    }, {});
  }

  async create(ingredientId: string, dto: CreateProcurementSkuDto) {
    const ingredient = await this.prisma.ingredient.findUnique({ where: { id: ingredientId } });
    if (!ingredient) throw new NotFoundException(`Ingredient not found: ${ingredientId}`);

    return this.prisma.procurementSku.create({
      data: {
        ingredientId,
        name: dto.name,
        brand: dto.brand || null,
        productModel: dto.productModel || null,
        purchaseChannel: dto.purchaseChannel || null,
        referencePricePerPurchaseUnit: dto.referencePricePerPurchaseUnit ?? null,
        displayUnit: dto.displayUnit || null,
        notes: dto.notes || null,
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async findByIngredientId(ingredientId: string) {
    return this.prisma.procurementSku.findMany({
      where: { ingredientId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async findById(id: string) {
    const existing = await this.prisma.procurementSku.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Procurement sku not found: ${id}`);
    return existing;
  }

  async update(id: string, dto: UpdateProcurementSkuDto) {
    await this.findById(id);
    return this.prisma.procurementSku.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.brand !== undefined && { brand: dto.brand || null }),
        ...(dto.productModel !== undefined && { productModel: dto.productModel || null }),
        ...(dto.purchaseChannel !== undefined && { purchaseChannel: dto.purchaseChannel || null }),
        ...(dto.referencePricePerPurchaseUnit !== undefined && {
          referencePricePerPurchaseUnit: dto.referencePricePerPurchaseUnit ?? null,
        }),
        ...(dto.displayUnit !== undefined && { displayUnit: dto.displayUnit || null }),
        ...(dto.notes !== undefined && { notes: dto.notes || null }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
      },
    });
  }

  async delete(id: string) {
    await this.findById(id);
    await this.prisma.procurementSku.delete({ where: { id } });
  }

  async listActivePurchaseChannels(): Promise<string[]> {
    const rows = await this.prisma.procurementSku.findMany({
      where: { isActive: true, purchaseChannel: { not: null } },
      select: { purchaseChannel: true },
    });

    return Array.from(
      new Set(
        rows
          .map((row) => row.purchaseChannel?.trim())
          .filter((value): value is string => Boolean(value)),
      ),
    ).sort();
  }
}
```

```ts
import { ProcurementSkuService } from './application/ingredient/procurement-sku.service';

@Module({
  providers: [
    ProcurementSkuService,
  ],
})
export class AppModule {}
```

- [ ] **Step 5: Run Prisma generate and the targeted service test**

Run: `cd backend && npx prisma generate && npm test -- backend/tests/application/ingredient/procurement-sku.service.spec.ts --runInBand`

Expected: PASS, and Prisma Client regenerates successfully with a new `procurementSku` delegate.

- [ ] **Step 6: Commit the foundation**

```bash
git add backend/prisma/schema.prisma \
  backend/prisma/migrations/20260403121500_add_procurement_sku/migration.sql \
  backend/src/application/ingredient/procurement-sku.service.ts \
  backend/src/app.module.ts \
  backend/tests/application/ingredient/procurement-sku.service.spec.ts
git commit -m "feat: add procurement sku foundation"
```

## Task 2: Switch Purchasing Logic to Procurement SKU and Add Snapshot Fields

**Files:**
- Create: `backend/tests/application/purchasing/purchasing.service.spec.ts`
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260403133000_add_purchase_procurement_sku_snapshots/migration.sql`
- Modify: `backend/src/application/purchasing/purchasing.service.ts`
- Modify: `backend/src/domain/purchasing/purchase-item.entity.ts`
- Modify: `backend/src/domain/purchasing/purchase-record.entity.ts`
- Modify: `backend/src/infrastructure/repositories/prisma-purchase-list.repository.ts`
- Modify: `backend/src/infrastructure/repositories/prisma-purchase-record.repository.ts`

- [ ] **Step 1: Write the failing purchasing service test**

```ts
import { Test } from '@nestjs/testing';
import { PurchasingService } from 'src/application/purchasing/purchasing.service';
import { RecommendedProductService } from 'src/application/ingredient/recommended-product.service';
import { ProcurementSkuService } from 'src/application/ingredient/procurement-sku.service';
import { ORDER_REPOSITORY } from 'src/application/order/order.service';
import { INGREDIENT_REPOSITORY } from 'src/application/ingredient/ingredient.service';
import {
  PURCHASE_LIST_REPOSITORY,
  PURCHASE_RECORD_REPOSITORY,
} from 'src/application/purchasing/purchasing.service.tokens';
import { InventoryService } from 'src/application/inventory/inventory.service';

describe('PurchasingService procurement sku separation', () => {
  it('uses procurement skus for purchase suggestions and does not call RecommendedProductService', async () => {
    const ingredient = {
      id: 'ingredient-1',
      name: '鸡胸肉',
      type: 'FOOD',
      purchaseUnit: 'kg',
      unitDisplayLabel: 'kg',
      purchaseChannel: '原料默认渠道',
      productModel: '原料默认规格',
      currentPricePerPurchaseUnit: 30,
      effectivePricePerPurchaseUnit: 30,
    };
    const orderRepository = { findByTargetProductionDateRange: jest.fn().mockResolvedValue({ list: [] }) } as any;
    const ingredientRepository = {
      findByIds: jest.fn().mockResolvedValue([ingredient]),
      findAll: jest.fn().mockResolvedValue([]),
    } as any;
    const procurementSkuService = {
      batchFindActive: jest.fn().mockResolvedValue({
        'ingredient-1': [
          {
            id: 'proc-sku-1',
            ingredientId: 'ingredient-1',
            name: '快驴鸡胸 2kg/包',
            purchaseChannel: '美团快驴',
            productModel: '2kg/包',
            sortOrder: 0,
          },
        ],
      }),
      listActivePurchaseChannels: jest.fn().mockResolvedValue(['美团快驴']),
    } as any;
    const recommendedProductService = {
      batchFindActive: jest.fn(),
      listActivePurchaseChannels: jest.fn().mockResolvedValue(['京东']),
    } as any;

    const moduleRef = await Test.createTestingModule({
      providers: [
        PurchasingService,
        { provide: ORDER_REPOSITORY, useValue: orderRepository },
        { provide: INGREDIENT_REPOSITORY, useValue: ingredientRepository },
        { provide: ProcurementSkuService, useValue: procurementSkuService },
        { provide: RecommendedProductService, useValue: recommendedProductService },
        { provide: InventoryService, useValue: {} },
        { provide: PURCHASE_LIST_REPOSITORY, useValue: {} },
        { provide: PURCHASE_RECORD_REPOSITORY, useValue: {} },
      ],
    }).compile();

    const service = moduleRef.get(PurchasingService);
    const result = await (service as any).enrichRequirementsWithProcurementSkus(
      [
        {
          ingredientId: 'ingredient-1',
          ingredientName: '鸡胸肉',
          type: 'FOOD',
          quantityNeeded: 2,
          quantityUnit: 'kg',
          estimatedCost: 60,
        },
      ],
      new Map([['ingredient-1', ingredient]]),
    );

    expect(result[0]).toEqual(
      expect.objectContaining({
        procurementSkuId: 'proc-sku-1',
        procurementSkuName: '快驴鸡胸 2kg/包',
        purchaseChannel: '美团快驴',
        productModel: '2kg/包',
      }),
    );
    expect(recommendedProductService.batchFindActive).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the purchasing service test to verify it fails**

Run: `cd backend && npm test -- backend/tests/application/purchasing/purchasing.service.spec.ts --runInBand`

Expected: FAIL because `ProcurementSkuService` is not injected into `PurchasingService`, the helper method does not exist yet, and procurement snapshot fields are undefined.

- [ ] **Step 3: Add snapshot columns and update the purchase entities**

```prisma
model PurchaseItem {
  id                  String   @id @default(uuid()) @map("id")
  purchaseListId      String   @map("purchase_list_id")
  ingredientId        String   @map("ingredient_id")
  procurementSkuId    String?  @map("procurement_sku_id") @db.VarChar(36)
  procurementSkuName  String?  @map("procurement_sku_name") @db.VarChar(200)
  suggestedProductId  String?  @map("suggested_product_id") @db.VarChar(36)
  suggestedProductName String? @map("suggested_product_name") @db.VarChar(200)
}

model PurchaseRecord {
  id                  String   @id @default(uuid()) @map("id")
  purchaseListId      String   @map("purchase_list_id")
  purchaseItemId      String   @map("purchase_item_id")
  ingredientId        String   @map("ingredient_id")
  procurementSkuId    String?  @map("procurement_sku_id") @db.VarChar(36)
  procurementSkuName  String?  @map("procurement_sku_name") @db.VarChar(200)
}
```

```sql
ALTER TABLE "purchase_item"
ADD COLUMN "procurement_sku_id" VARCHAR(36),
ADD COLUMN "procurement_sku_name" VARCHAR(200);

ALTER TABLE "purchase_record"
ADD COLUMN "procurement_sku_id" VARCHAR(36),
ADD COLUMN "procurement_sku_name" VARCHAR(200);
```

```ts
export interface PurchaseItemConstructor {
  procurementSkuId?: string;
  procurementSkuName?: string;
  suggestedProductId?: string;
  suggestedProductName?: string;
  ingredient?: {
    productModel?: string | null;
    purchaseChannel?: string | null;
    purchaseUnit?: string | null;
    baseUnit?: string | null;
    unitDisplayLabel?: string | null;
    purchaseToBaseRatio?: number | null;
    properties?: any;
    procurementSkus?: Array<{
      id: string;
      name: string;
      purchaseChannel?: string | null;
      productModel?: string | null;
      displayUnit?: string | null;
      isActive: boolean;
    }>;
  };
}

export class PurchaseItem {
  public readonly procurementSkuId?: string;
  public readonly procurementSkuName?: string;

  constructor(data: PurchaseItemConstructor) {
    this.procurementSkuId = data.procurementSkuId;
    this.procurementSkuName = data.procurementSkuName;
    this.suggestedProductId = data.suggestedProductId ?? data.procurementSkuId;
    this.suggestedProductName = data.suggestedProductName ?? data.procurementSkuName;
  }
}
```

```ts
export interface PurchaseRecordConstructor {
  procurementSkuId?: string;
  procurementSkuName?: string;
}
```

- [ ] **Step 4: Refactor PurchasingService and repositories to use procurement SKUs**

```ts
import { ProcurementSkuService, type ProcurementSkuSummary } from '../ingredient/procurement-sku.service';

constructor(
  @Inject(ORDER_REPOSITORY) private readonly orderRepository: OrderRepository,
  @Inject(INGREDIENT_REPOSITORY) private readonly ingredientRepository: IngredientRepository,
  private readonly procurementSkuService: ProcurementSkuService,
  private readonly recommendedProductService: RecommendedProductService,
  private readonly inventoryService: InventoryService,
  @Inject(PURCHASE_LIST_REPOSITORY) private readonly purchaseListRepository: PurchaseListRepository,
  @Inject(PURCHASE_RECORD_REPOSITORY) private readonly purchaseRecordRepository: PurchaseRecordRepository,
) {}

export interface AddPurchaseRecordDto {
  purchaseItemId: string;
  procurementSkuId?: string;
  purchaseChannel: string;
  actualCost: number;
}

export interface PurchaseRequirement {
  ingredientId: string;
  ingredientName: string;
  type: 'FOOD' | 'SUPPLEMENT' | 'PACKAGING';
  quantityNeeded: number;
  quantityUnit: string;
  estimatedCost: number;
  purchaseChannel?: string;
  productModel?: string;
  displayUnit?: string;
  procurementSkuId?: string;
  procurementSkuName?: string;
  suggestedProductId?: string;
  suggestedProductName?: string;
}

private selectSuggestedProcurementSku(
  skus: ProcurementSkuSummary[],
  preferredChannel?: string,
  preferredModel?: string,
): ProcurementSkuSummary | undefined {
  if (!skus.length) {
    return undefined;
  }

  const normalizedChannel = this.normalizeComparableText(preferredChannel);
  const normalizedModel = this.normalizeComparableText(preferredModel);

  const ranked = skus
    .map((sku, index) => {
      let score = 0;
      if (normalizedChannel && this.normalizeComparableText(sku.purchaseChannel) === normalizedChannel) {
        score += 2;
      }
      if (normalizedModel && this.normalizeComparableText(sku.productModel) === normalizedModel) {
        score += 1;
      }
      return { sku, index, score };
    })
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.index - right.index;
    });

  return ranked[0]?.sku;
}

private async enrichRequirementsWithProcurementSkus(
  requirements: PurchaseRequirement[],
  ingredientLookup: Map<string, any>,
): Promise<PurchaseRequirement[]> {
  const procurementSkuMap = await this.procurementSkuService.batchFindActive(
    requirements.map((requirement) => requirement.ingredientId),
  );

  return requirements.map((requirement) => {
    const ingredient = ingredientLookup.get(requirement.ingredientId);
    const selectedSku = this.selectSuggestedProcurementSku(
      procurementSkuMap[requirement.ingredientId] || [],
      requirement.purchaseChannel || ingredient?.purchaseChannel,
      requirement.productModel || ingredient?.productModel,
    );

    return {
      ...requirement,
      purchaseChannel: selectedSku?.purchaseChannel || requirement.purchaseChannel || ingredient?.purchaseChannel,
      productModel: selectedSku?.productModel || requirement.productModel || ingredient?.productModel,
      displayUnit: selectedSku?.displayUnit || requirement.displayUnit || ingredient?.unitDisplayLabel || ingredient?.purchaseUnit,
      procurementSkuId: selectedSku?.id,
      procurementSkuName: selectedSku?.name,
      suggestedProductId: selectedSku?.id,
      suggestedProductName: selectedSku?.name,
    };
  });
}

async getPurchaseChannels(): Promise<string[]> {
  const [ingredients, procurementChannels] = await Promise.all([
    this.ingredientRepository.findAll(),
    this.procurementSkuService.listActivePurchaseChannels(),
  ]);
  const channels = new Set<string>();
  ingredients.forEach((ingredient) => ingredient.purchaseChannel && channels.add(ingredient.purchaseChannel));
  procurementChannels.forEach((channel) => channels.add(channel));
  return Array.from(channels).sort();
}
```

```ts
const selectedProcurementSku = dto.procurementSkuId
  ? await this.procurementSkuService.findById(dto.procurementSkuId)
  : undefined;

if (selectedProcurementSku && selectedProcurementSku.ingredientId !== purchaseItem.ingredientId) {
  throw new BadRequestException('所选生产采购 SKU 与采购明细原料不匹配');
}

const purchaseRecord = new PurchaseRecord({
  purchaseListId,
  purchaseItemId: dto.purchaseItemId,
  ingredientId: purchaseItem.ingredientId,
  ingredientName: purchaseItem.ingredientName,
  procurementSkuId: dto.procurementSkuId || purchaseItem.procurementSkuId,
  procurementSkuName:
    selectedProcurementSku?.name || purchaseItem.procurementSkuName,
  purchaseChannel: dto.purchaseChannel,
  actualQuantity: normalizedRecordData.actualQuantity,
  actualCost: dto.actualCost,
  productModel: dto.productModel,
  notes: dto.notes,
});
```

```ts
const found = await this.prisma.purchaseList.findUnique({
  where: { id },
  include: {
    items: {
      include: {
        ingredient: {
          include: {
            procurementSkus: {
              where: { isActive: true },
              orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
            },
          },
        },
      },
    },
    records: true,
    createdBy: {
      select: { id: true, nickname: true, phone: true },
    },
  },
});
```

```ts
ingredient: data.ingredient
  ? {
      productModel: data.ingredient.productModel ?? null,
      purchaseChannel: data.ingredient.purchaseChannel ?? null,
      purchaseUnit: data.ingredient.purchaseUnit ?? null,
      baseUnit: data.ingredient.baseUnit ?? null,
      unitDisplayLabel: data.ingredient.unitDisplayLabel ?? null,
      purchaseToBaseRatio:
        data.ingredient.purchaseToBaseRatio !== undefined &&
        data.ingredient.purchaseToBaseRatio !== null
          ? Number(data.ingredient.purchaseToBaseRatio)
          : null,
      properties: data.ingredient.properties ?? undefined,
      procurementSkus: (data.ingredient.procurementSkus || []).map((sku: any) => ({
        id: sku.id,
        name: sku.name,
        purchaseChannel: sku.purchaseChannel ?? null,
        productModel: sku.productModel ?? null,
        displayUnit: sku.displayUnit ?? null,
        isActive: sku.isActive,
      })),
    }
  : undefined,
```

```ts
await tx.purchaseItem.upsert({
  where: { id: item.id },
  update: {
    procurementSkuId: item.procurementSkuId,
    procurementSkuName: item.procurementSkuName,
    suggestedProductId: item.suggestedProductId,
    suggestedProductName: item.suggestedProductName,
  },
  create: {
    ...item,
    purchaseListId: data.id,
  },
});
```

- [ ] **Step 5: Run Prisma generate and the targeted purchasing test**

Run: `cd backend && npx prisma generate && npm test -- backend/tests/application/purchasing/purchasing.service.spec.ts --runInBand`

Expected: PASS, with procurement SKU snapshots being populated and no recommended-product calls from the purchase-suggestion path.

- [ ] **Step 6: Commit the purchasing refactor**

```bash
git add backend/prisma/schema.prisma \
  backend/prisma/migrations/20260403133000_add_purchase_procurement_sku_snapshots/migration.sql \
  backend/src/application/purchasing/purchasing.service.ts \
  backend/src/domain/purchasing/purchase-item.entity.ts \
  backend/src/domain/purchasing/purchase-record.entity.ts \
  backend/src/infrastructure/repositories/prisma-purchase-list.repository.ts \
  backend/src/infrastructure/repositories/prisma-purchase-record.repository.ts \
  backend/tests/application/purchasing/purchasing.service.spec.ts
git commit -m "feat: switch purchasing flow to procurement skus"
```

## Task 3: Add Procurement SKU Controllers and Backend Response Compatibility

**Files:**
- Create: `backend/tests/interfaces/controllers/procurement-sku.controller.spec.ts`
- Create: `backend/tests/interfaces/controllers/recommended-product.controller.spec.ts`
- Create: `backend/src/interfaces/controllers/procurement-sku.controller.ts`
- Modify: `backend/src/interfaces/controllers/recommended-product.controller.ts`
- Modify: `backend/src/interfaces/controllers/staff-purchasing.controller.ts`
- Modify: `backend/src/interfaces/controllers/admin.controller.ts`
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: Write the failing controller tests**

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { ProcurementSkuController } from 'src/interfaces/controllers/procurement-sku.controller';
import { ProcurementSkuService } from 'src/application/ingredient/procurement-sku.service';

describe('ProcurementSkuController (e2e)', () => {
  let app: INestApplication;
  const procurementSkuService = {
    findByIngredientId: jest.fn().mockResolvedValue([
      { id: 'proc-sku-1', ingredientId: 'ingredient-1', name: '快驴鸡胸 2kg/包', isActive: true, sortOrder: 0 },
    ]),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ProcurementSkuController],
      providers: [{ provide: ProcurementSkuService, useValue: procurementSkuService }],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('lists procurement skus under the admin ingredient path', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/admin/ingredients/ingredient-1/procurement-skus')
      .expect(200);

    expect(response.body.code).toBe(0);
    expect(response.body.data[0].name).toBe('快驴鸡胸 2kg/包');
  });
});
```

```ts
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { RecommendedProductController } from 'src/interfaces/controllers/recommended-product.controller';
import { RecommendedProductService } from 'src/application/ingredient/recommended-product.service';

describe('RecommendedProductController DIY semantics (e2e)', () => {
  let app: INestApplication;
  const recommendedProductService = {
    batchFindActive: jest.fn().mockResolvedValue({
      'ingredient-1': [{ id: 'diy-1', ingredientId: 'ingredient-1', name: '家庭补剂 60粒', purchaseLink: { url: 'https://a.example' } }],
    }),
  };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [RecommendedProductController],
      providers: [{ provide: RecommendedProductService, useValue: recommendedProductService }],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns DIY recommended products only from /api/v1/recommended-products', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/recommended-products?ingredientIds=ingredient-1')
      .expect(200);

    expect(response.body.code).toBe(0);
    expect(response.body.data['ingredient-1'][0].name).toBe('家庭补剂 60粒');
  });
});
```

- [ ] **Step 2: Run the controller tests to verify they fail**

Run: `cd backend && npm test -- backend/tests/interfaces/controllers/procurement-sku.controller.spec.ts backend/tests/interfaces/controllers/recommended-product.controller.spec.ts --runInBand`

Expected: FAIL because `ProcurementSkuController` does not exist yet and the route set is incomplete.

- [ ] **Step 3: Implement the procurement SKU controller and tighten DIY-only semantics**

```ts
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ProcurementSkuService,
  type CreateProcurementSkuDto,
  type UpdateProcurementSkuDto,
} from '../../application/ingredient/procurement-sku.service';
import { ApiResponseDto } from '../dto/common/response.dto';

@ApiTags('Admin Procurement Skus')
@Controller('api/v1/admin/ingredients/:ingredientId/procurement-skus')
export class ProcurementSkuController {
  constructor(private readonly procurementSkuService: ProcurementSkuService) {}

  @Get()
  @ApiOperation({ summary: 'Get all procurement skus for an ingredient' })
  async list(@Param('ingredientId') ingredientId: string) {
    return ApiResponseDto.success(
      await this.procurementSkuService.findByIngredientId(ingredientId),
    );
  }

  @Post()
  async create(
    @Param('ingredientId') ingredientId: string,
    @Body() dto: CreateProcurementSkuDto,
  ) {
    return ApiResponseDto.success(
      await this.procurementSkuService.create(ingredientId, dto),
    );
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateProcurementSkuDto) {
    return ApiResponseDto.success(await this.procurementSkuService.update(id, dto));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    await this.procurementSkuService.delete(id);
  }
}
```

```ts
@ApiTags('DIY Recommended Products')
@Controller('api/v1/recommended-products')
export class RecommendedProductController {
  @Get()
  @ApiOperation({ summary: 'Batch query active DIY recommended products by ingredient IDs' })
  async batchFind(@Query('ingredientIds') ingredientIdsStr: string) {
    const ingredientIds = ingredientIdsStr ? ingredientIdsStr.split(',').filter(Boolean) : [];
    return ApiResponseDto.success(
      await this.recommendedProductService.batchFindActive(ingredientIds),
    );
  }
}
```

- [ ] **Step 4: Add compatibility fields to purchase responses and ingredient counts**

```ts
const procurementSkuCountMap = new Map(
  prismaIngredients.map((p) => [p.id, p.procurementSkus.length]),
);
const activeProcurementSkuCountMap = new Map(
  prismaIngredients.map((p) => [p.id, p.procurementSkus.filter((sku) => sku.isActive).length]),
);

const ingredientList = ingredients.map((ing) => ({
  id: ing.id,
  name: ing.name,
  activeRecommendedProductCount: activeRecommendedProductCountMap.get(ing.id) || 0,
  recommendedProductCount: recommendedProductCountMap.get(ing.id) || 0,
  activeProcurementSkuCount: activeProcurementSkuCountMap.get(ing.id) || 0,
  procurementSkuCount: procurementSkuCountMap.get(ing.id) || 0,
  hasActiveRecommendedProduct: (activeRecommendedProductCountMap.get(ing.id) || 0) > 0,
  hasActiveProcurementSku: (activeProcurementSkuCountMap.get(ing.id) || 0) > 0,
}));
```

```ts
schema: {
  properties: {
    procurementSkuId: { type: 'string' },
    procurementSkuName: { type: 'string' },
    suggestedProductId: { type: 'string' },
    suggestedProductName: { type: 'string' },
  },
}
```

```ts
controllers: [
  ProcurementSkuController,
  RecommendedProductController,
]
```

- [ ] **Step 5: Run the controller tests**

Run: `cd backend && npm test -- backend/tests/interfaces/controllers/procurement-sku.controller.spec.ts backend/tests/interfaces/controllers/recommended-product.controller.spec.ts --runInBand`

Expected: PASS, with the admin procurement SKU route responding and the DIY endpoint still grouping by ingredient ID.

- [ ] **Step 6: Commit the controller layer**

```bash
git add backend/src/interfaces/controllers/procurement-sku.controller.ts \
  backend/src/interfaces/controllers/recommended-product.controller.ts \
  backend/src/interfaces/controllers/staff-purchasing.controller.ts \
  backend/src/interfaces/controllers/admin.controller.ts \
  backend/src/app.module.ts \
  backend/tests/interfaces/controllers/procurement-sku.controller.spec.ts \
  backend/tests/interfaces/controllers/recommended-product.controller.spec.ts
git commit -m "feat: expose separated diy and procurement sku endpoints"
```

## Task 4: Split the Admin Ingredient UI Into DIY and Procurement SKU Sections

**Files:**
- Modify: `admin-web/src/types/ingredient.ts`
- Modify: `admin-web/src/api/ingredients.ts`
- Modify: `admin-web/src/views/Ingredients/IngredientForm.vue`
- Modify: `admin-web/src/views/Ingredients/index.vue`

- [ ] **Step 1: Make the ingredient form expect the new procurement API before defining it**

```ts
const procurementSkus = ref<ProcurementSku[]>([])

const loadProcurementSkus = async () => {
  if (!props.ingredient?.id) return
  procurementSkus.value = await ingredientApi.listProcurementSkus(props.ingredient.id)
}

const activeProcurementSkuCount = computed(() => (
  props.ingredient?.activeProcurementSkuCount || procurementSkus.value.filter(item => item.isActive).length
))
```

- [ ] **Step 2: Run the admin build and verify it fails**

Run: `cd admin-web && npm run build`

Expected: FAIL with TypeScript errors for missing `ProcurementSku`, missing `ingredientApi.listProcurementSkus`, and missing procurement count fields on `Ingredient`.

- [ ] **Step 3: Add the new admin types and API bindings**

```ts
export interface Ingredient {
  id: string
  name: string
  activeRecommendedProductCount?: number
  recommendedProductCount?: number
  activeProcurementSkuCount?: number
  procurementSkuCount?: number
  hasActiveRecommendedProduct?: boolean
  hasActiveProcurementSku?: boolean
}

export interface ProcurementSku {
  id: string
  ingredientId: string
  name: string
  brand: string | null
  productModel: string | null
  purchaseChannel: string | null
  referencePricePerPurchaseUnit: number | null
  displayUnit: string | null
  notes: string | null
  isActive: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface ProcurementSkuForm {
  name: string
  brand?: string
  productModel?: string
  purchaseChannel?: string
  referencePricePerPurchaseUnit?: number
  displayUnit?: string
  notes?: string
  isActive?: boolean
  sortOrder?: number
}
```

```ts
import type {
  Ingredient,
  IngredientForm,
  RecommendedProduct,
  RecommendedProductForm,
  ProcurementSku,
  ProcurementSkuForm,
} from '@/types/ingredient'

listProcurementSkus: (ingredientId: string): Promise<ProcurementSku[]> =>
  api.get(`/admin/ingredients/${ingredientId}/procurement-skus`),

createProcurementSku: (ingredientId: string, data: ProcurementSkuForm): Promise<ProcurementSku> =>
  api.post(`/admin/ingredients/${ingredientId}/procurement-skus`, data),

updateProcurementSku: (ingredientId: string, id: string, data: Partial<ProcurementSkuForm>): Promise<ProcurementSku> =>
  api.put(`/admin/ingredients/${ingredientId}/procurement-skus/${id}`, data),

deleteProcurementSku: (ingredientId: string, id: string): Promise<void> =>
  api.delete(`/admin/ingredients/${ingredientId}/procurement-skus/${id}`)
```

- [ ] **Step 4: Finish the split UI**

```vue
<template v-if="isEdit">
  <div class="section-title section-title-with-tag">
    <span>家庭 DIY 推荐 SKU</span>
    <el-tag size="small" type="primary">已配置 {{ recommendedProductCount }} 个</el-tag>
  </div>
  <div class="recommended-products-section">
    <el-button type="primary" size="small" :icon="Plus" @click="openRpDialog()">新增家庭 DIY 推荐 SKU</el-button>
    <span class="hint-text" style="margin-left: 8px;">这里维护用户侧推荐商品、广告联盟链接、图片和展示信息。</span>
  </div>

  <div class="section-title section-title-with-tag">
    <span>生产采购 SKU</span>
    <el-tag size="small" type="warning">已配置 {{ procurementSkuCount }} 个</el-tag>
  </div>
  <div class="recommended-products-section">
    <el-button type="primary" size="small" :icon="Plus" @click="openProcurementSkuDialog()">新增生产采购 SKU</el-button>
    <span class="hint-text" style="margin-left: 8px;">这里维护品牌、渠道、规格和参考采购单价，只用于采购与补货。</span>
  </div>
</template>
```

```ts
const procurementSkuForm = reactive({
  name: '',
  brand: '',
  productModel: '',
  purchaseChannel: '',
  referencePricePerPurchaseUnit: undefined as number | undefined,
  displayUnit: '',
  notes: '',
  isActive: true,
  sortOrder: 0,
})

const getSkuStatusText = (ingredient: Ingredient) => {
  const diyCount = ingredient.activeRecommendedProductCount || 0
  const procurementCount = ingredient.activeProcurementSkuCount || 0
  return `DIY ${diyCount} / 采购 ${procurementCount}`
}
```

- [ ] **Step 5: Run the admin build**

Run: `cd admin-web && npm run build`

Expected: PASS, and `vue-tsc` recognizes both the DIY and procurement SKU contracts.

- [ ] **Step 6: Commit the admin UI**

```bash
git add admin-web/src/types/ingredient.ts \
  admin-web/src/api/ingredients.ts \
  admin-web/src/views/Ingredients/IngredientForm.vue \
  admin-web/src/views/Ingredients/index.vue
git commit -m "feat: split admin ingredient diy and procurement sku management"
```

## Task 5: Update Miniapp Purchasing and Inventory Screens to Use Procurement SKU Fields

**Files:**
- Modify: `miniapp/src/api/purchasing.ts`
- Modify: `miniapp/src/api/inventory.ts`
- Modify: `miniapp/src/pages/staff-purchasing/detail.vue`
- Modify: `miniapp/src/pages/staff-purchasing/preview.vue`
- Modify: `miniapp/src/pages/staff-purchasing/stock-create.vue`
- Modify: `miniapp/src/pages/staff-inventory/index.vue`

- [ ] **Step 1: Make the staff purchasing detail page expect procurement SKU fields first**

```ts
const procurementSkuName = computed(() => (
  selectedIngredient.value?.procurementSkuName ||
  selectedIngredient.value?.suggestedProductName ||
  ''
))

const procurementSkuOptions = computed(() => (
  selectedIngredient.value?.ingredient?.procurementSkus || []
))

const recordForm = ref({
  purchaseChannel: '',
  procurementSkuId: '',
  actualPackageCount: '',
  actualPackageSize: '',
  actualPackageUnit: '',
  actualCost: '',
  productModel: '',
  notes: '',
})
```

- [ ] **Step 2: Run the miniapp build and verify it fails**

Run: `cd miniapp && npm run build:mp-weixin`

Expected: FAIL because the request payload types and inventory/purchasing item shapes do not yet expose `procurementSkuId`, `procurementSkuName`, or `ingredient.procurementSkus`.

- [ ] **Step 3: Add procurement-aware API types**

```ts
export interface StockPurchaseIngredient {
  id: string;
  name: string;
  purchaseChannel?: string | null;
  productModel?: string | null;
  procurementSkuId?: string;
  procurementSkuName?: string;
  suggestedProductId?: string;
  suggestedProductName?: string;
}

export function addPurchaseRecord(purchaseListId: string, data: {
  purchaseItemId: string;
  procurementSkuId?: string;
  purchaseChannel: string;
  actualPackageCount?: number;
  actualPackageSize?: number;
  actualPackageUnit?: string;
  actualCost: number;
  productModel?: string;
  notes?: string;
}) {
  return request({
    url: `/staff/purchasing/lists/${purchaseListId}/records`,
    method: 'POST',
    data,
  });
}
```

```ts
export interface InventoryOverviewItem {
  id: string;
  name: string;
  procurementSkuId?: string;
  procurementSkuName?: string;
  suggestedProductId?: string;
  suggestedProductName?: string;
}
```

- [ ] **Step 4: Finish the page updates with compatibility fallbacks**

```vue
<text v-if="item.procurementSkuName || item.suggestedProductName" class="item-suggested-product">
  生产采购 SKU：{{ item.procurementSkuName || item.suggestedProductName }}
</text>

<view v-if="procurementSkuOptions.length > 0" class="channel-chip-group">
  <view
    v-for="sku in procurementSkuOptions"
    :key="sku.id"
    class="channel-chip"
    :class="{ active: recordForm.procurementSkuId === sku.id }"
    @tap.stop="selectProcurementSku(sku)"
  >
    <text>{{ sku.name }}</text>
  </view>
</view>
```

```ts
function selectProcurementSku(sku: any) {
  recordForm.value.procurementSkuId = sku.id
  if (sku.purchaseChannel) {
    recordForm.value.purchaseChannel = normalizeChannelLabel(sku.purchaseChannel)
  }
  if (sku.productModel) {
    recordForm.value.productModel = sku.productModel
  }
}

await addPurchaseRecord(purchaseListId.value, {
  purchaseItemId: selectedIngredient.value.id,
  procurementSkuId: recordForm.value.procurementSkuId || undefined,
  purchaseChannel: recordForm.value.purchaseChannel.trim(),
  actualPackageCount: Number(recordForm.value.actualPackageCount),
  actualPackageSize: Number(recordForm.value.actualPackageSize),
  actualPackageUnit: recordForm.value.actualPackageUnit,
  actualCost: Number(recordForm.value.actualCost),
  productModel: recordForm.value.productModel?.trim() || undefined,
  notes: recordForm.value.notes?.trim() || undefined,
})
```

```ts
const procurementLabel = (item: any) =>
  item.procurementSkuName || item.suggestedProductName || '未配置生产采购 SKU'
```

- [ ] **Step 5: Run the miniapp build**

Run: `cd miniapp && npm run build:mp-weixin`

Expected: PASS, with the staff purchasing and inventory pages compiling against the new procurement fields while still tolerating legacy mirrored fields.

- [ ] **Step 6: Commit the miniapp changes**

```bash
git add miniapp/src/api/purchasing.ts \
  miniapp/src/api/inventory.ts \
  miniapp/src/pages/staff-purchasing/detail.vue \
  miniapp/src/pages/staff-purchasing/preview.vue \
  miniapp/src/pages/staff-purchasing/stock-create.vue \
  miniapp/src/pages/staff-inventory/index.vue
git commit -m "feat: switch miniapp purchasing screens to procurement skus"
```

## Task 6: Run End-to-End Verification Before Merge

**Files:**
- Test: `backend/tests/application/ingredient/procurement-sku.service.spec.ts`
- Test: `backend/tests/application/purchasing/purchasing.service.spec.ts`
- Test: `backend/tests/interfaces/controllers/procurement-sku.controller.spec.ts`
- Test: `backend/tests/interfaces/controllers/recommended-product.controller.spec.ts`

- [ ] **Step 1: Run the focused backend tests**

Run: `cd backend && npm test -- backend/tests/application/ingredient/procurement-sku.service.spec.ts backend/tests/application/purchasing/purchasing.service.spec.ts backend/tests/interfaces/controllers/procurement-sku.controller.spec.ts backend/tests/interfaces/controllers/recommended-product.controller.spec.ts --runInBand`

Expected: PASS for all four specs.

- [ ] **Step 2: Run the backend build**

Run: `cd backend && npm run build`

Expected: PASS, with NestJS compiling after Prisma Client generation and all new controllers/services resolving.

- [ ] **Step 3: Run the admin build**

Run: `cd admin-web && npm run build`

Expected: PASS, with `vue-tsc` validating the split DIY/procurement SKU UI.

- [ ] **Step 4: Run the miniapp build**

Run: `cd miniapp && npm run build:mp-weixin`

Expected: PASS, with staff purchasing and inventory pages compiling against procurement SKU fields.

- [ ] **Step 5: Perform the manual smoke checks**

```text
1. 在管理端打开任意标准原料，确认可以分别新增“家庭 DIY 推荐 SKU”和“生产采购 SKU”。
2. 在 DIY 制作单中确认用户看到的仍然是家庭 DIY 推荐 SKU，且购买链接正常显示。
3. 在库存补货页确认“推荐”文案来自生产采购 SKU，不再复用 DIY 推荐商品。
4. 在采购清单详情页新增采购记录，确认默认带出生产采购 SKU，切换 SKU 后渠道和型号随之刷新。
5. 打开历史采购清单，确认未回填的旧数据仍能正常展示。
```

- [ ] **Step 6: Commit any verification-driven fixes**

```bash
git status --short
git add backend/prisma/schema.prisma \
  backend/prisma/migrations/20260403121500_add_procurement_sku/migration.sql \
  backend/prisma/migrations/20260403133000_add_purchase_procurement_sku_snapshots/migration.sql \
  backend/src/application/ingredient/procurement-sku.service.ts \
  backend/src/application/purchasing/purchasing.service.ts \
  backend/src/domain/purchasing/purchase-item.entity.ts \
  backend/src/domain/purchasing/purchase-record.entity.ts \
  backend/src/infrastructure/repositories/prisma-purchase-list.repository.ts \
  backend/src/infrastructure/repositories/prisma-purchase-record.repository.ts \
  backend/src/interfaces/controllers/procurement-sku.controller.ts \
  backend/src/interfaces/controllers/recommended-product.controller.ts \
  backend/src/interfaces/controllers/staff-purchasing.controller.ts \
  backend/src/interfaces/controllers/admin.controller.ts \
  backend/tests/application/ingredient/procurement-sku.service.spec.ts \
  backend/tests/application/purchasing/purchasing.service.spec.ts \
  backend/tests/interfaces/controllers/procurement-sku.controller.spec.ts \
  backend/tests/interfaces/controllers/recommended-product.controller.spec.ts \
  admin-web/src/types/ingredient.ts \
  admin-web/src/api/ingredients.ts \
  admin-web/src/views/Ingredients/IngredientForm.vue \
  admin-web/src/views/Ingredients/index.vue \
  miniapp/src/api/purchasing.ts \
  miniapp/src/api/inventory.ts \
  miniapp/src/pages/staff-purchasing/detail.vue \
  miniapp/src/pages/staff-purchasing/preview.vue \
  miniapp/src/pages/staff-purchasing/stock-create.vue \
  miniapp/src/pages/staff-inventory/index.vue
git commit -m "fix: finalize sku separation verification"
```
