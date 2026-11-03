# Admin Food Ingredient Edit Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重构 Web 管理后台食材类编辑页，把食材标准原料与生产采购 SKU 的职责拆清楚，同时保证补剂、包材单层编辑页不被误伤。

**Architecture:** 后端把食材采购执行字段收拢到 `ProcurementSku`，并让订单来源匹配、采购缺口、生产结算优先使用 SKU 级字段。前端继续用 `ingredientTypeCapabilities` 做类型边界保护，只为 `FOOD` 启用新的食材编辑布局、SKU 字段和标签管理抽屉，补剂与包材保持现有单层表单结构。

**Tech Stack:** NestJS, Prisma, Jest, Vue 3 Composition API, Element Plus, TypeScript, node:test.

---

## File Structure

Backend files:

- Modify: `backend/prisma/schema.prisma`
  Add SKU-level `procurementStrategy`, `allowInventoryEntry`, and `edibleYieldRatio`.
- Create: `backend/prisma/migrations/202604190001_add_procurement_sku_execution_fields/migration.sql`
  Add nullable columns for the new SKU-level execution fields.
- Modify: `backend/src/application/ingredient/procurement-sku.service.ts`
  Persist and summarize new SKU fields, validate only FOOD can own procurement SKUs.
- Modify: `backend/src/application/order/order-source-plan.service.ts`
  Use only `currentPurchasePrice` as calculation price; apply SKU edible yield into selected ingredient properties.
- Modify: `backend/src/application/purchasing/purchasing.service.ts`
  Stop using reference price as fallback for SKU purchase/cost suggestions.
- Modify: `backend/src/application/ingredient-tag/ingredient-tag.service.ts`
  Add usage counts and merge support for tag management drawer.
- Modify: `backend/src/domain/ingredient-tag/ingredient-tag.repository.ts`
  Add repository methods for usage count and merge.
- Modify: `backend/src/infrastructure/repositories/prisma-ingredient-tag.repository.ts`
  Implement usage count and merge with Prisma.
- Modify: `backend/src/interfaces/controllers/admin.controller.ts`
  Expose tag usage counts and merge endpoint.
- Test: `backend/tests/application/ingredient/procurement-sku.service.spec.ts`
- Test: `backend/tests/application/order/order-source-plan.service.spec.ts`
- Test: `backend/tests/application/ingredient-tag/ingredient-tag.service.spec.ts`
- Test: `backend/tests/application/purchasing/purchasing-procurement-sku.spec.ts`

Admin frontend files:

- Modify: `admin-web/src/types/ingredient.ts`
  Add SKU-level execution fields to `ProcurementSku` and `ProcurementSkuForm`.
- Modify: `admin-web/src/api/ingredientTags.ts`
  Add tag usage and merge APIs.
- Modify: `admin-web/src/utils/ingredientTypeCapabilities.ts`
  Keep child SKU support only for FOOD and remove standard-level procurement strategy editor from FOOD.
- Modify: `admin-web/tests/ingredientTypeCapabilities.test.ts`
  Lock type boundaries so SUPPLEMENT and PACKAGING remain single-layer.
- Modify: `admin-web/src/views/Ingredients/IngredientForm.vue`
  Reorganize FOOD-only standard section and wire new child components without changing SUPPLEMENT/PACKAGING blocks.
- Create: `admin-web/src/views/Ingredients/components/FoodProcurementSkuSection.vue`
  FOOD-only production procurement SKU table.
- Create: `admin-web/src/views/Ingredients/components/ProcurementSkuEditorDialog.vue`
  FOOD-only procurement SKU editor with grouped fields and validation.
- Create: `admin-web/src/views/Ingredients/components/IngredientTagManagerDrawer.vue`
  Current-page tag manager drawer.
- Test: `admin-web/tests/ingredientTypeCapabilities.test.ts`
  Existing node:test coverage, expanded for the new FOOD boundary.

Manual validation:

- Open one FOOD ingredient and verify new layout.
- Open one SUPPLEMENT ingredient and verify no procurement SKU table appears.
- Open one PACKAGING ingredient and verify no procurement SKU table or tag selector appears.
- Create/edit one FOOD procurement SKU and verify persisted fields reload.

---

### Task 1: Add SKU-Level Execution Fields In The Backend

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/202604190001_add_procurement_sku_execution_fields/migration.sql`
- Modify: `backend/src/application/ingredient/procurement-sku.service.ts`
- Test: `backend/tests/application/ingredient/procurement-sku.service.spec.ts`

- [ ] **Step 1: Add failing service test for new SKU fields**

Append this test to `backend/tests/application/ingredient/procurement-sku.service.spec.ts` inside `describe('ProcurementSkuService', () => { ... })`:

```ts
  it('create persists food procurement strategy, inventory entry flag, and sku edible yield ratio', async () => {
    mockPrismaService.ingredient.findUnique.mockResolvedValue({
      id: 'ingredient-1',
      type: 'FOOD',
    });
    mockPrismaService.procurementSku.create.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'sku-execution-fields',
        ingredientId: data.ingredientId,
        name: data.name,
        brand: null,
        productModel: null,
        purchaseChannel: null,
        supplierName: null,
        purchaseUnit: data.purchaseUnit ?? null,
        purchaseToBaseRatio: data.purchaseToBaseRatio ?? null,
        currentPurchasePrice: data.currentPurchasePrice ?? null,
        referencePurchasePrice: data.referencePurchasePrice ?? null,
        referencePricePerPurchaseUnit: data.referencePricePerPurchaseUnit ?? null,
        displayUnit: data.displayUnit ?? null,
        sourceTier: data.sourceTier ?? null,
        procurementStrategy: data.procurementStrategy ?? null,
        allowInventoryEntry: data.allowInventoryEntry ?? null,
        edibleYieldRatio: data.edibleYieldRatio ?? null,
        notes: null,
        isDefault: false,
        isActive: true,
        sortOrder: 0,
        safetyStock: null,
        reorderPoint: null,
        targetStock: null,
        createdAt: new Date('2026-04-19T00:00:00.000Z'),
      }),
    );

    await expect(
      service.create('ingredient-1', {
        name: '盒马精修牛霖',
        purchaseUnit: 'kg',
        purchaseToBaseRatio: 1000,
        currentPurchasePrice: 92,
        sourceTier: 'MARKET_PREMIUM',
        procurementStrategy: 'DAILY_PURCHASE',
        allowInventoryEntry: true,
        edibleYieldRatio: 0.95,
      } as any),
    ).resolves.toEqual(
      expect.objectContaining({
        procurementStrategy: 'DAILY_PURCHASE',
        allowInventoryEntry: true,
        edibleYieldRatio: 0.95,
      }),
    );

    expect(mockPrismaService.procurementSku.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          procurementStrategy: 'DAILY_PURCHASE',
          allowInventoryEntry: true,
          edibleYieldRatio: 0.95,
        }),
      }),
    );
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd backend
npm test -- tests/application/ingredient/procurement-sku.service.spec.ts --runInBand
```

Expected: FAIL because `procurementStrategy`, `allowInventoryEntry`, and `edibleYieldRatio` are not part of `ProcurementSkuSummary` yet.

- [ ] **Step 3: Update Prisma schema**

In `backend/prisma/schema.prisma`, update `model ProcurementSku` by adding the new fields after `sourceTier`:

```prisma
  sourceTier                    ProcurementSkuSourceTier? @map("source_tier")
  procurementStrategy           IngredientProcurementStrategy? @map("procurement_strategy")
  allowInventoryEntry           Boolean? @map("allow_inventory_entry")
  edibleYieldRatio              Float?   @map("edible_yield_ratio")
  notes                         String?
```

Also add indexes near the existing indexes:

```prisma
  @@index([sourceTier])
  @@index([procurementStrategy])
```

- [ ] **Step 4: Create Prisma migration**

Create the migration directory:

```bash
mkdir -p backend/prisma/migrations/202604190001_add_procurement_sku_execution_fields
```

Create `backend/prisma/migrations/202604190001_add_procurement_sku_execution_fields/migration.sql`:

```sql
ALTER TABLE "procurement_sku"
  ADD COLUMN "procurement_strategy" "IngredientProcurementStrategy",
  ADD COLUMN "allow_inventory_entry" BOOLEAN,
  ADD COLUMN "edible_yield_ratio" DOUBLE PRECISION;

CREATE INDEX "procurement_sku_procurement_strategy_idx"
  ON "procurement_sku"("procurement_strategy");
```

- [ ] **Step 5: Update ProcurementSku service DTOs and summary**

In `backend/src/application/ingredient/procurement-sku.service.ts`, add fields to `ProcurementSkuRecord`, `ProcurementSkuSummary`, and `CreateProcurementSkuDto`:

```ts
  procurementStrategy: string | null;
  allowInventoryEntry: boolean | null;
  edibleYieldRatio: number | null;
```

In `CreateProcurementSkuDto`, use:

```ts
  procurementStrategy?: string | null;
  allowInventoryEntry?: boolean | null;
  edibleYieldRatio?: number | null;
```

Update `toSummary`:

```ts
  procurementStrategy: sku.procurementStrategy ?? null,
  allowInventoryEntry: sku.allowInventoryEntry ?? null,
  edibleYieldRatio: sku.edibleYieldRatio ?? null,
```

- [ ] **Step 6: Add normalization helpers**

In `backend/src/application/ingredient/procurement-sku.service.ts`, add this helper after `normalizeOptionalSourceTier`:

```ts
const INGREDIENT_PROCUREMENT_STRATEGIES = [
  'DAILY_PURCHASE',
  'STOCK_REPLENISHMENT',
  'HYBRID',
] as const;

const normalizeOptionalProcurementStrategy = (
  value: string | null | undefined,
): string | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return null;

  const normalized = value.trim().toUpperCase();
  if (normalized.length === 0) return null;

  if (INGREDIENT_PROCUREMENT_STRATEGIES.includes(normalized as any)) {
    return normalized;
  }

  throw new BadRequestException(`Unknown procurement strategy: ${value}`);
};

const normalizeOptionalRatio = (
  value: number | null | undefined,
  fieldName: string,
): number | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (!Number.isFinite(value) || value <= 0 || value > 1) {
    throw new BadRequestException(`${fieldName} must be greater than 0 and less than or equal to 1`);
  }
  return value;
};
```

- [ ] **Step 7: Persist fields on create and update**

In `create`, add to `data`:

```ts
        procurementStrategy:
          normalizeOptionalProcurementStrategy(dto.procurementStrategy) ?? null,
        allowInventoryEntry: dto.allowInventoryEntry ?? null,
        edibleYieldRatio:
          normalizeOptionalRatio(dto.edibleYieldRatio, 'edibleYieldRatio') ??
          null,
```

In `update`, add before `notes` handling:

```ts
    const procurementStrategy = normalizeOptionalProcurementStrategy(
      dto.procurementStrategy,
    );
    if (procurementStrategy !== undefined) {
      data.procurementStrategy = procurementStrategy;
    }

    if (dto.allowInventoryEntry !== undefined) {
      data.allowInventoryEntry = dto.allowInventoryEntry;
    }

    const edibleYieldRatio = normalizeOptionalRatio(
      dto.edibleYieldRatio,
      'edibleYieldRatio',
    );
    if (edibleYieldRatio !== undefined) {
      data.edibleYieldRatio = edibleYieldRatio;
    }
```

- [ ] **Step 8: Run backend service test**

Run:

```bash
cd backend
npm test -- tests/application/ingredient/procurement-sku.service.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 9: Commit task 1**

Run:

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/202604190001_add_procurement_sku_execution_fields backend/src/application/ingredient/procurement-sku.service.ts backend/tests/application/ingredient/procurement-sku.service.spec.ts
git commit -m "feat: add food procurement sku execution fields"
```

---

### Task 2: Make Source Plan Pricing Use Cost Price Only And Apply SKU Edible Yield

**Files:**
- Modify: `backend/src/application/order/order-source-plan.service.ts`
- Test: `backend/tests/application/order/order-source-plan.service.spec.ts`

- [ ] **Step 1: Add failing tests for cost price and SKU edible yield**

Append these tests to `backend/tests/application/order/order-source-plan.service.spec.ts`:

```ts
  it('does not use reference price as a fallback for source plan eligibility', async () => {
    const ingredient = createFoodIngredient();
    procurementSkuService.batchFindActive.mockResolvedValue({
      [ingredient.id]: [
        withSourceTier(
          sku({
            id: 'sku-reference-only',
            purchaseUnit: 'kg',
            purchaseToBaseRatio: 1000,
            currentPurchasePrice: null,
            referencePurchasePrice: 66,
            referencePricePerPurchaseUnit: 66,
          }),
          'WHOLESALE',
        ),
      ],
    });

    await expect(
      service.applySourcePlanToIngredients([ingredient], 'WHOLESALE'),
    ).rejects.toThrow('鸡胸肉');
  });

  it('applies sku edible yield ratio over the standard ingredient default when selecting a source sku', async () => {
    const ingredient = createFoodIngredient();
    procurementSkuService.batchFindActive.mockResolvedValue({
      [ingredient.id]: [
        withSourceTier(
          sku({
            id: 'sku-with-yield',
            currentPurchasePrice: 88,
            edibleYieldRatio: 0.95,
          } as any),
          'MARKET_PREMIUM',
        ),
      ],
    });

    const result = await service.applySourcePlanToIngredients(
      [ingredient],
      'MARKET_PREMIUM',
    );

    expect(result.get(ingredient.id)!.properties).toEqual(
      expect.objectContaining({
        edible_yield_rate: 0.95,
        standard_edible_yield_rate: 0.8,
        procurement_sku_edible_yield_ratio: 0.95,
      }),
    );
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd backend
npm test -- tests/application/order/order-source-plan.service.spec.ts --runInBand
```

Expected: FAIL because reference price is currently accepted and SKU edible yield is not applied.

- [ ] **Step 3: Use only currentPurchasePrice for eligibility and pricing**

In `backend/src/application/order/order-source-plan.service.ts`, replace price fallback logic in `isEligibleSourceSku`:

```ts
    const skuPrice = sku.currentPurchasePrice;
```

Keep the finite and positive checks unchanged.

In `withProcurementSku`, replace the `skuPrice` assignment with:

```ts
    const skuPrice = sku.currentPurchasePrice;
```

- [ ] **Step 4: Apply SKU edible yield into selected ingredient properties**

In `withProcurementSku`, before building `properties`, add:

```ts
    const skuEdibleYieldRatio =
      typeof (sku as any).edibleYieldRatio === 'number' &&
      Number.isFinite((sku as any).edibleYieldRatio) &&
      (sku as any).edibleYieldRatio > 0 &&
      (sku as any).edibleYieldRatio <= 1
        ? (sku as any).edibleYieldRatio
        : null;
```

Then update the `properties` object:

```ts
    const properties = {
      ...ingredient.properties,
      ...(skuEdibleYieldRatio
        ? {
            standard_edible_yield_rate:
              (ingredient.properties as any)?.edible_yield_rate ?? null,
            edible_yield_rate: skuEdibleYieldRatio,
            procurement_sku_edible_yield_ratio: skuEdibleYieldRatio,
          }
        : {}),
      procurement_sku_id: sku.id,
      procurement_sku_name: sku.name,
      procurement_sku_display_unit: sku.displayUnit,
      procurement_sku_supplier_name: sku.supplierName,
      procurement_sku_source_plan: planCode,
      procurement_sku_source_tier: selectedSku.sourceTier,
      procurement_sku_fallback_level: selectedSku.fallbackLevel,
    };
```

- [ ] **Step 5: Run source plan tests**

Run:

```bash
cd backend
npm test -- tests/application/order/order-source-plan.service.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 6: Commit task 2**

Run:

```bash
git add backend/src/application/order/order-source-plan.service.ts backend/tests/application/order/order-source-plan.service.spec.ts
git commit -m "fix: use sku cost price and edible yield for source plans"
```

---

### Task 3: Stop Using Reference Price In Purchasing SKU Suggestions

**Files:**
- Modify: `backend/src/application/purchasing/purchasing.service.ts`
- Test: `backend/tests/application/purchasing/purchasing-procurement-sku.spec.ts`

- [ ] **Step 1: Add failing test for reference-only SKU**

Append this test to `backend/tests/application/purchasing/purchasing-procurement-sku.spec.ts` inside `describe('PurchasingService stock replenishment procurement sku flow', () => { ... })`:

```ts
  it('does not use reference-only procurement sku price for stock replenishment cost', async () => {
    const { service, procurementSkuService } = await createModule();
    procurementSkuService.batchFindActive.mockResolvedValue({
      'ingredient-1': [
        {
          ...defaultProcurementSku,
          id: 'sku-reference-only',
          currentPurchasePrice: null,
          referencePurchasePrice: 88,
          referencePricePerPurchaseUnit: 88,
          isDefault: true,
        },
      ],
    });

    const result = await service.getStockReplenishmentIngredients({
      includeDaily: true,
    });

    expect(result[0].procurementSkuId).not.toBe('sku-reference-only');
    expect(result[0].currentPricePerPurchaseUnit).toBe(
      legacyIngredient.currentPricePerPurchaseUnit,
    );
    expect(result[0].suggestedEstimatedCost).not.toBe(1056);
  });
```

- [ ] **Step 2: Run purchasing test to verify failure**

Run:

```bash
cd backend
npm test -- tests/application/purchasing/purchasing-procurement-sku.spec.ts --runInBand
```

Expected: FAIL because `purchasing.service.ts` currently falls back to reference price around the `selectSuggestedProcurementSku` logic.

- [ ] **Step 3: Remove reference price fallback**

In `backend/src/application/purchasing/purchasing.service.ts`, replace both fallback chains around the existing `procurementSku?.currentPurchasePrice ?? procurementSku?.referencePurchasePrice ?? procurementSku?.referencePricePerPurchaseUnit` logic with:

```ts
const skuPrice = procurementSku?.currentPurchasePrice ?? null;
```

Only use `skuPrice` when it is finite and greater than zero. Do not use `referencePurchasePrice` or `referencePricePerPurchaseUnit` in cost calculations.

- [ ] **Step 4: Run purchasing tests**

Run:

```bash
cd backend
npm test -- tests/application/purchasing/purchasing-procurement-sku.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 5: Commit task 3**

Run:

```bash
git add backend/src/application/purchasing/purchasing.service.ts backend/tests/application/purchasing/purchasing-procurement-sku.spec.ts
git commit -m "fix: keep sku reference price out of purchasing costs"
```

---

### Task 4: Add Tag Usage Counts And Merge Support

**Files:**
- Modify: `backend/src/domain/ingredient-tag/ingredient-tag.repository.ts`
- Modify: `backend/src/infrastructure/repositories/prisma-ingredient-tag.repository.ts`
- Modify: `backend/src/application/ingredient-tag/ingredient-tag.service.ts`
- Modify: `backend/src/interfaces/controllers/admin.controller.ts`
- Test: `backend/tests/application/ingredient-tag/ingredient-tag.service.spec.ts`

- [ ] **Step 1: Create failing tag service test**

Create `backend/tests/application/ingredient-tag/ingredient-tag.service.spec.ts`:

```ts
import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  INGREDIENT_TAG_REPOSITORY,
  IngredientTagService,
} from '../../../src/application/ingredient-tag/ingredient-tag.service';
import { IngredientTag } from '../../../src/domain/ingredient-tag/ingredient-tag.entity';

describe('IngredientTagService', () => {
  const repository = {
    findById: jest.fn(),
    findAll: jest.fn(),
    findRootTags: jest.fn(),
    findChildren: jest.fn(),
    findByIngredient: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
    hasChildren: jest.fn(),
    getHierarchy: jest.fn(),
    getUsageCounts: jest.fn(),
    mergeTagAssignments: jest.fn(),
  };
  let service: IngredientTagService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new IngredientTagService(repository as any);
  });

  it('returns usage counts keyed by tag id', async () => {
    repository.getUsageCounts.mockResolvedValue(
      new Map([
        ['tag-a', 2],
        ['tag-b', 0],
      ]),
    );

    await expect(service.getTagUsageCounts()).resolves.toEqual({
      'tag-a': 2,
      'tag-b': 0,
    });
  });

  it('merges one tag into another and deletes the source tag', async () => {
    repository.findById
      .mockResolvedValueOnce(new IngredientTag('source', '旧标签', null, null, 0, null))
      .mockResolvedValueOnce(new IngredientTag('target', '新标签', null, null, 0, null));
    repository.hasChildren.mockResolvedValue(false);

    await service.mergeTag('source', 'target');

    expect(repository.mergeTagAssignments).toHaveBeenCalledWith('source', 'target');
    expect(repository.delete).toHaveBeenCalledWith('source');
  });

  it('does not merge a tag into itself', async () => {
    await expect(service.mergeTag('same', 'same')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('does not merge a missing source tag', async () => {
    repository.findById.mockResolvedValueOnce(null);

    await expect(service.mergeTag('missing', 'target')).rejects.toThrow(
      NotFoundException,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd backend
npm test -- tests/application/ingredient-tag/ingredient-tag.service.spec.ts --runInBand
```

Expected: FAIL because repository methods and service methods do not exist.

- [ ] **Step 3: Extend repository interface**

In `backend/src/domain/ingredient-tag/ingredient-tag.repository.ts`, add:

```ts
  /**
   * Count ingredient assignments for every tag.
   */
  getUsageCounts(): Promise<Map<string, number>>;

  /**
   * Move all assignments from source tag to target tag.
   */
  mergeTagAssignments(sourceTagId: string, targetTagId: string): Promise<void>;
```

- [ ] **Step 4: Implement Prisma repository methods**

In `backend/src/infrastructure/repositories/prisma-ingredient-tag.repository.ts`, add:

```ts
  async getUsageCounts(): Promise<Map<string, number>> {
    const rows = await this.prisma.ingredientTagAssignment.groupBy({
      by: ['tagId'],
      _count: { tagId: true },
    });

    return new Map(
      rows.map((row) => [row.tagId, row._count.tagId]),
    );
  }

  async mergeTagAssignments(
    sourceTagId: string,
    targetTagId: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const sourceAssignments = await tx.ingredientTagAssignment.findMany({
        where: { tagId: sourceTagId },
        select: { ingredientId: true },
      });

      for (const assignment of sourceAssignments) {
        await tx.ingredientTagAssignment.upsert({
          where: {
            ingredientId_tagId: {
              ingredientId: assignment.ingredientId,
              tagId: targetTagId,
            },
          },
          create: {
            ingredientId: assignment.ingredientId,
            tagId: targetTagId,
          },
          update: {},
        });
      }

      await tx.ingredientTagAssignment.deleteMany({
        where: { tagId: sourceTagId },
      });
    });
  }
```

The schema has `@@unique([ingredientId, tagId])`, so Prisma generates the compound key name `ingredientId_tagId` used above.

- [ ] **Step 5: Add service methods**

In `backend/src/application/ingredient-tag/ingredient-tag.service.ts`, add:

```ts
  async getTagUsageCounts(): Promise<Record<string, number>> {
    const counts = await this.tagRepository.getUsageCounts();
    return Object.fromEntries(counts);
  }

  async mergeTag(sourceTagId: string, targetTagId: string): Promise<void> {
    if (sourceTagId === targetTagId) {
      throw new BadRequestException('Source tag and target tag must be different');
    }

    const source = await this.tagRepository.findById(sourceTagId);
    if (!source) {
      throw new NotFoundException(`Tag not found: ${sourceTagId}`);
    }

    const target = await this.tagRepository.findById(targetTagId);
    if (!target) {
      throw new NotFoundException(`Tag not found: ${targetTagId}`);
    }

    const hasChildren = await this.tagRepository.hasChildren(sourceTagId);
    if (hasChildren) {
      throw new BadRequestException('Cannot merge a tag with children');
    }

    await this.tagRepository.mergeTagAssignments(sourceTagId, targetTagId);
    await this.tagRepository.delete(sourceTagId);
  }
```

- [ ] **Step 6: Expose controller endpoints**

In `backend/src/interfaces/controllers/admin.controller.ts`, add before `@Get('ingredient-tags/:id')` so the static route is not captured as an id:

```ts
  @Get('ingredient-tags/usage-counts')
  @ApiOperation({ summary: 'Get ingredient tag usage counts' })
  async getIngredientTagUsageCounts(): Promise<ApiResponseDto<Record<string, number>>> {
    return ApiResponseDto.success(
      await this.ingredientTagService.getTagUsageCounts(),
    );
  }

  @Post('ingredient-tags/:id/merge')
  @ApiOperation({ summary: 'Merge one ingredient tag into another' })
  async mergeIngredientTag(
    @Param('id') id: string,
    @Body() dto: { targetTagId: string },
  ): Promise<ApiResponseDto<void>> {
    await this.ingredientTagService.mergeTag(id, dto.targetTagId);
    return ApiResponseDto.success(null);
  }
```

- [ ] **Step 7: Run tag service tests**

Run:

```bash
cd backend
npm test -- tests/application/ingredient-tag/ingredient-tag.service.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 8: Commit task 4**

Run:

```bash
git add backend/src/domain/ingredient-tag/ingredient-tag.repository.ts backend/src/infrastructure/repositories/prisma-ingredient-tag.repository.ts backend/src/application/ingredient-tag/ingredient-tag.service.ts backend/src/interfaces/controllers/admin.controller.ts backend/tests/application/ingredient-tag/ingredient-tag.service.spec.ts
git commit -m "feat: add ingredient tag usage and merge support"
```

---

### Task 5: Update Admin Types, APIs, And Type Boundary Tests

**Files:**
- Modify: `admin-web/src/types/ingredient.ts`
- Modify: `admin-web/src/api/ingredientTags.ts`
- Modify: `admin-web/src/utils/ingredientTypeCapabilities.ts`
- Modify: `admin-web/tests/ingredientTypeCapabilities.test.ts`

- [ ] **Step 1: Update type capability tests first**

In `admin-web/tests/ingredientTypeCapabilities.test.ts`, change the FOOD procurement strategy test:

```ts
test('FOOD keeps tag selector and child sku model but does not edit procurement strategy on the standard ingredient', () => {
  const caps = getIngredientTypeCapabilities('FOOD')

  assert.equal(caps.showTagSelector, true)
  assert.equal(caps.supportsChildSkus, true)
  assert.equal(caps.showProcurementStrategyEditor, false)
  assert.equal(caps.showSupplierField, false)
})
```

Keep the existing SUPPLEMENT and PACKAGING assertions that child SKUs are false.

- [ ] **Step 2: Run capability test to verify failure**

Run:

```bash
cd admin-web
npm test -- tests/ingredientTypeCapabilities.test.ts
```

Expected: FAIL because FOOD still returns `showProcurementStrategyEditor: true`.

- [ ] **Step 3: Update capabilities**

In `admin-web/src/utils/ingredientTypeCapabilities.ts`, change the FOOD capability:

```ts
        showProcurementStrategyEditor: false,
```

Do not change SUPPLEMENT or PACKAGING capabilities.

- [ ] **Step 4: Add new procurement SKU types**

In `admin-web/src/types/ingredient.ts`, extend `ProcurementSku`:

```ts
  procurementStrategy: IngredientProcurementStrategy | null
  allowInventoryEntry: boolean | null
  edibleYieldRatio: number | null
```

Extend `ProcurementSkuForm`:

```ts
  procurementStrategy?: IngredientProcurementStrategy | null
  allowInventoryEntry?: boolean | null
  edibleYieldRatio?: number | null
```

- [ ] **Step 5: Add tag management API types**

In `admin-web/src/api/ingredientTags.ts`, add:

```ts
export interface MergeTagDto {
  targetTagId: string
}
```

Add methods:

```ts
  /**
   * 获取标签使用数量
   */
  getUsageCounts: (): Promise<Record<string, number>> =>
    api.get('/admin/ingredient-tags/usage-counts'),

  /**
   * 合并标签
   */
  merge: (id: string, data: MergeTagDto): Promise<void> =>
    api.post(`/admin/ingredient-tags/${id}/merge`, data),
```

Place `getUsageCounts` before `getDetail` in the object to mirror backend static route ordering.

- [ ] **Step 6: Run admin tests**

Run:

```bash
cd admin-web
npm test -- tests/ingredientTypeCapabilities.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit task 5**

Run:

```bash
git add admin-web/src/types/ingredient.ts admin-web/src/api/ingredientTags.ts admin-web/src/utils/ingredientTypeCapabilities.ts admin-web/tests/ingredientTypeCapabilities.test.ts
git commit -m "feat: lock food-only procurement sku admin types"
```

---

### Task 6: Build FOOD-Only Procurement SKU UI Components

**Files:**
- Create: `admin-web/src/views/Ingredients/components/FoodProcurementSkuSection.vue`
- Create: `admin-web/src/views/Ingredients/components/ProcurementSkuEditorDialog.vue`
- Modify: `admin-web/src/views/Ingredients/IngredientForm.vue`

- [ ] **Step 1: Create FOOD procurement section component**

Create `admin-web/src/views/Ingredients/components/FoodProcurementSkuSection.vue`:

```vue
<template>
  <section class="food-sku-section">
    <div class="section-header">
      <div>
        <h3>生产采购 SKU</h3>
        <p>采购、库存、生产和成本计算使用这里的具体采购商品。</p>
      </div>
      <el-button type="primary" size="small" @click="$emit('create')">
        新增采购 SKU
      </el-button>
    </div>

    <el-table v-if="skus.length > 0" :data="skus" border>
      <el-table-column label="SKU" min-width="220">
        <template #default="{ row }">
          <div class="sku-name">{{ row.name }}</div>
          <div class="sku-meta">
            <span v-if="row.brand">品牌：{{ row.brand }}</span>
            <span v-if="row.productModel">规格：{{ row.productModel }}</span>
            <span v-if="row.purchaseChannel">渠道：{{ row.purchaseChannel }}</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="来源等级" width="100">
        <template #default="{ row }">
          <el-tag :type="row.sourceTier ? 'success' : 'warning'" size="small">
            {{ sourceTierLabel(row.sourceTier) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="采购策略" width="110">
        <template #default="{ row }">
          {{ procurementStrategyLabel(row.procurementStrategy) }}
        </template>
      </el-table-column>
      <el-table-column label="入库" width="80">
        <template #default="{ row }">
          {{ row.allowInventoryEntry === false ? '不入库' : '允许' }}
        </template>
      </el-table-column>
      <el-table-column label="SKU 可食部" width="110">
        <template #default="{ row }">
          {{ row.edibleYieldRatio ? row.edibleYieldRatio.toFixed(2) : '标准兜底' }}
        </template>
      </el-table-column>
      <el-table-column label="单位 / 换算" width="140">
        <template #default="{ row }">
          <span v-if="row.purchaseUnit && row.purchaseToBaseRatio">
            {{ row.purchaseUnit }} / {{ row.purchaseToBaseRatio }}{{ baseUnitLabel }}
          </span>
          <span v-else>未完整</span>
        </template>
      </el-table-column>
      <el-table-column label="成本计算价" width="120">
        <template #default="{ row }">
          <span v-if="row.currentPurchasePrice !== null && row.currentPurchasePrice !== undefined">
            ¥{{ Number(row.currentPurchasePrice).toFixed(2) }}
          </span>
          <el-tag v-else type="danger" size="small">缺少价格</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag :type="row.isActive ? 'success' : 'info'" size="small">
            {{ row.isActive ? '启用' : '停用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="150" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click="$emit('edit', row)">编辑</el-button>
          <el-button link type="warning" size="small" @click="$emit('toggle-active', row)">
            {{ row.isActive ? '停用' : '启用' }}
          </el-button>
          <el-button link type="danger" size="small" @click="$emit('delete', row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-empty v-else description="暂无生产采购 SKU">
      <el-button type="primary" @click="$emit('create')">新增采购 SKU</el-button>
    </el-empty>
  </section>
</template>

<script setup lang="ts">
import {
  BaseUnitLabels,
  IngredientProcurementStrategyLabels,
  type BaseUnit,
  type IngredientProcurementStrategy,
  type ProcurementSku,
  type ProcurementSkuSourceTier,
} from '@/types/ingredient'

defineEmits<{
  (e: 'create'): void
  (e: 'edit', sku: ProcurementSku): void
  (e: 'toggle-active', sku: ProcurementSku): void
  (e: 'delete', sku: ProcurementSku): void
}>()

const props = defineProps<{
  skus: ProcurementSku[]
  baseUnit: BaseUnit
}>()

const baseUnitLabel = computed(() => BaseUnitLabels[props.baseUnit])

const sourceTierLabel = (value?: ProcurementSkuSourceTier | null) => {
  if (value === 'ORGANIC') return '有机'
  if (value === 'MARKET_PREMIUM') return '商超'
  if (value === 'WHOLESALE') return '性价比'
  return '未设置'
}

const procurementStrategyLabel = (value?: IngredientProcurementStrategy | null) =>
  value ? IngredientProcurementStrategyLabels[value] : '未设置'
</script>

<style scoped>
.food-sku-section {
  margin-top: 20px;
}
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 12px;
}
.section-header h3 {
  margin: 0 0 4px;
}
.section-header p,
.sku-meta {
  margin: 0;
  color: #909399;
  font-size: 12px;
  line-height: 1.5;
}
.sku-name {
  font-weight: 600;
  color: #1f7a4d;
}
.sku-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
```

Add missing import at top of script:

```ts
import { computed } from 'vue'
```

- [ ] **Step 2: Create procurement SKU editor dialog component**

Create `admin-web/src/views/Ingredients/components/ProcurementSkuEditorDialog.vue` with props and emits matching existing `procurementForm` data:

```vue
<template>
  <el-dialog
    v-model="visibleProxy"
    :title="editing ? '编辑生产采购 SKU' : '新增生产采购 SKU'"
    width="720px"
    destroy-on-close
  >
    <el-form :model="form" label-width="130px">
      <div class="dialog-group-title">基础信息</div>
      <el-form-item label="SKU 名称" required>
        <el-input v-model="form.name" maxlength="100" />
      </el-form-item>
      <el-form-item label="来源等级">
        <el-select v-model="form.sourceTier" clearable style="width: 240px">
          <el-option label="有机" value="ORGANIC" />
          <el-option label="商超" value="MARKET_PREMIUM" />
          <el-option label="性价比" value="WHOLESALE" />
        </el-select>
      </el-form-item>
      <el-form-item label="品牌">
        <el-input v-model="form.brand" maxlength="100" />
      </el-form-item>
      <el-form-item label="规格">
        <el-input v-model="form.productModel" maxlength="100" />
      </el-form-item>
      <el-form-item label="采购渠道">
        <el-input v-model="form.purchaseChannel" maxlength="200" />
      </el-form-item>
      <el-form-item label="供应商">
        <el-input v-model="form.supplierName" maxlength="200" />
      </el-form-item>

      <div class="dialog-group-title">采购与库存策略</div>
      <el-form-item label="采购策略">
        <el-select v-model="form.procurementStrategy" clearable style="width: 220px">
          <el-option label="日采" value="DAILY_PURCHASE" />
          <el-option label="库存补货" value="STOCK_REPLENISHMENT" />
          <el-option label="混合" value="HYBRID" />
        </el-select>
      </el-form-item>
      <el-form-item label="允许入库">
        <el-switch v-model="allowInventoryProxy" />
        <span class="hint">关闭后，生产剩余原料不进入库存。</span>
      </el-form-item>
      <el-form-item label="安全库存">
        <el-input-number
          v-model="form.safetyStock"
          :disabled="form.allowInventoryEntry === false"
          :min="0"
          :precision="2"
        />
      </el-form-item>
      <el-form-item label="目标库存">
        <el-input-number
          v-model="form.targetStock"
          :disabled="form.allowInventoryEntry === false"
          :min="0"
          :precision="2"
        />
      </el-form-item>

      <div class="dialog-group-title">成本与损耗</div>
      <el-form-item label="采购单位">
        <el-input v-model="form.purchaseUnit" maxlength="50" />
      </el-form-item>
      <el-form-item label="换算倍数">
        <el-input-number v-model="form.purchaseToBaseRatio" :min="0.01" :precision="2" />
      </el-form-item>
      <el-form-item label="成本计算价">
        <el-input-number v-model="form.currentPurchasePrice" :min="0" :precision="2" />
      </el-form-item>
      <el-form-item label="市场参考价">
        <el-input-number v-model="form.referencePurchasePrice" :min="0" :precision="2" />
      </el-form-item>
      <el-form-item label="SKU 可食部">
        <el-input-number
          v-model="form.edibleYieldRatio"
          :min="0.01"
          :max="1"
          :step="0.01"
          :precision="2"
        />
        <span class="hint">不填则使用标准原料默认值 {{ defaultEdibleYieldRatioLabel }}</span>
      </el-form-item>
      <el-form-item label="显示单位">
        <el-input v-model="form.displayUnit" maxlength="50" />
      </el-form-item>
      <el-form-item label="备注">
        <el-input v-model="form.notes" type="textarea" :rows="3" maxlength="300" show-word-limit />
      </el-form-item>
      <el-form-item label="默认 SKU">
        <el-switch v-model="form.isDefault" />
      </el-form-item>
      <el-form-item label="启用状态">
        <el-switch v-model="form.isActive" />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="visibleProxy = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="handleSave">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { ElMessage } from 'element-plus'
import type { ProcurementSkuForm } from '@/types/ingredient'

const props = defineProps<{
  modelValue: boolean
  editing: boolean
  saving: boolean
  form: ProcurementSkuForm
  defaultEdibleYieldRatio?: number | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'save'): void
}>()

const visibleProxy = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
})

const allowInventoryProxy = computed({
  get: () => props.form.allowInventoryEntry !== false,
  set: (value: boolean) => {
    props.form.allowInventoryEntry = value
    if (!value) {
      props.form.safetyStock = null
      props.form.targetStock = null
    }
  },
})

const defaultEdibleYieldRatioLabel = computed(() =>
  typeof props.defaultEdibleYieldRatio === 'number'
    ? props.defaultEdibleYieldRatio.toFixed(2)
    : '1.00',
)

const handleSave = () => {
  if (!props.form.name?.trim()) {
    ElMessage.warning('请输入 SKU 名称')
    return
  }
  if (
    props.form.edibleYieldRatio !== null &&
    props.form.edibleYieldRatio !== undefined &&
    (props.form.edibleYieldRatio <= 0 || props.form.edibleYieldRatio > 1)
  ) {
    ElMessage.warning('SKU 可食部必须大于 0 且小于等于 1')
    return
  }
  emit('save')
}
</script>

<style scoped>
.dialog-group-title {
  margin: 16px 0 10px;
  font-weight: 700;
  color: #303133;
}
.hint {
  margin-left: 8px;
  color: #909399;
  font-size: 12px;
}
</style>
```

- [ ] **Step 3: Wire components into IngredientForm**

In `admin-web/src/views/Ingredients/IngredientForm.vue`:

1. Import the components:

```ts
import FoodProcurementSkuSection from './components/FoodProcurementSkuSection.vue'
import ProcurementSkuEditorDialog from './components/ProcurementSkuEditorDialog.vue'
```

2. Replace the current inline "生产采购 SKU" block with:

```vue
      <FoodProcurementSkuSection
        :skus="procurementSkus"
        :base-unit="formData.baseUnit"
        @create="openProcurementDialog()"
        @edit="openProcurementDialog"
        @toggle-active="toggleProcurementSkuActive"
        @delete="(sku) => deleteProcurementSku(sku.id)"
      />
```

3. Replace the current inline procurement SKU dialog with:

```vue
  <ProcurementSkuEditorDialog
    v-model="procurementDialogVisible"
    :editing="!!procurementEditingId"
    :saving="procurementSaving"
    :form="procurementForm"
    :default-edible-yield-ratio="foodProperties.edible_yield_rate"
    @save="saveProcurementSku"
  />
```

Keep the SUPPLEMENT and PACKAGING template blocks untouched.

- [ ] **Step 4: Extend procurement form state and save payload**

In `IngredientForm.vue`, add to `procurementForm`:

```ts
  procurementStrategy: null as IngredientProcurementStrategy | null,
  allowInventoryEntry: null as boolean | null,
  edibleYieldRatio: undefined as number | undefined,
```

In `openProcurementDialog(sku)`, set:

```ts
    procurementForm.procurementStrategy = sku.procurementStrategy || null
    procurementForm.allowInventoryEntry = sku.allowInventoryEntry ?? null
    procurementForm.edibleYieldRatio = sku.edibleYieldRatio ?? undefined
```

In the new-SKU branch, set:

```ts
    procurementForm.procurementStrategy = IngredientProcurementStrategy.DAILY_PURCHASE
    procurementForm.allowInventoryEntry = true
    procurementForm.edibleYieldRatio = undefined
```

In `saveProcurementSku`, add to `data`:

```ts
    procurementStrategy: procurementForm.procurementStrategy ?? null,
    allowInventoryEntry: procurementForm.allowInventoryEntry ?? null,
    edibleYieldRatio: procurementForm.edibleYieldRatio ?? null,
```

- [ ] **Step 5: Run admin build**

Run:

```bash
cd admin-web
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit task 6**

Run:

```bash
git add admin-web/src/views/Ingredients/IngredientForm.vue admin-web/src/views/Ingredients/components/FoodProcurementSkuSection.vue admin-web/src/views/Ingredients/components/ProcurementSkuEditorDialog.vue
git commit -m "feat: add food procurement sku editor UI"
```

---

### Task 7: Add Current-Page Tag Management Drawer

**Files:**
- Create: `admin-web/src/views/Ingredients/components/IngredientTagManagerDrawer.vue`
- Modify: `admin-web/src/views/Ingredients/IngredientForm.vue`

- [ ] **Step 1: Create tag manager drawer component**

Create `admin-web/src/views/Ingredients/components/IngredientTagManagerDrawer.vue`:

```vue
<template>
  <el-drawer v-model="visibleProxy" title="管理标签" size="420px">
    <div class="tag-actions">
      <el-button type="primary" size="small" @click="startCreate">新增标签</el-button>
      <el-button size="small" @click="load">刷新</el-button>
    </div>

    <el-table :data="tags" row-key="id" border>
      <el-table-column label="标签">
        <template #default="{ row }">
          <div class="tag-name">{{ row.name }}</div>
          <div class="tag-desc">{{ row.description || '无描述' }}</div>
        </template>
      </el-table-column>
      <el-table-column label="使用" width="70">
        <template #default="{ row }">
          {{ usageCounts[row.id] || 0 }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="150">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click="startEdit(row)">更名</el-button>
          <el-button link type="warning" size="small" @click="startMerge(row)">合并</el-button>
          <el-button link type="danger" size="small" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="editVisible" :title="editingTag?.id ? '编辑标签' : '新增标签'" width="420px" append-to-body>
      <el-form label-width="80px">
        <el-form-item label="名称">
          <el-input v-model="editForm.name" maxlength="20" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="editForm.description" type="textarea" :rows="2" maxlength="100" />
        </el-form-item>
        <el-form-item label="颜色">
          <el-color-picker v-model="editForm.color" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" @click="saveEdit">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="mergeVisible" title="合并标签" width="420px" append-to-body>
      <el-form label-width="90px">
        <el-form-item label="来源标签">
          {{ mergingTag?.name }}
        </el-form-item>
        <el-form-item label="目标标签">
          <el-select v-model="mergeTargetId" style="width: 100%">
            <el-option
              v-for="tag in tags.filter((tag) => tag.id !== mergingTag?.id)"
              :key="tag.id"
              :label="tag.name"
              :value="tag.id"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="mergeVisible = false">取消</el-button>
        <el-button type="primary" @click="confirmMerge">确认合并</el-button>
      </template>
    </el-dialog>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  ingredientTagApi,
  type IngredientTag,
} from '@/api/ingredientTags'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'changed'): void
}>()

const visibleProxy = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
})

const tags = ref<IngredientTag[]>([])
const usageCounts = ref<Record<string, number>>({})
const editVisible = ref(false)
const mergeVisible = ref(false)
const editingTag = ref<IngredientTag | null>(null)
const mergingTag = ref<IngredientTag | null>(null)
const mergeTargetId = ref('')
const editForm = reactive({
  name: '',
  description: '',
  color: '',
})

const load = async () => {
  const [tagRows, counts] = await Promise.all([
    ingredientTagApi.list(),
    ingredientTagApi.getUsageCounts(),
  ])
  tags.value = tagRows
  usageCounts.value = counts
}

watch(
  () => props.modelValue,
  (visible) => {
    if (visible) load()
  },
)

const startCreate = () => {
  editingTag.value = null
  editForm.name = ''
  editForm.description = ''
  editForm.color = ''
  editVisible.value = true
}

const startEdit = (tag: IngredientTag) => {
  editingTag.value = tag
  editForm.name = tag.name
  editForm.description = tag.description || ''
  editForm.color = tag.color || ''
  editVisible.value = true
}

const saveEdit = async () => {
  if (!editForm.name.trim()) {
    ElMessage.warning('请输入标签名称')
    return
  }

  if (editingTag.value) {
    await ingredientTagApi.update(editingTag.value.id, {
      name: editForm.name.trim(),
      description: editForm.description.trim() || null,
      color: editForm.color || null,
    })
  } else {
    await ingredientTagApi.create({
      name: editForm.name.trim(),
      description: editForm.description.trim() || null,
      color: editForm.color || null,
    })
  }

  editVisible.value = false
  await load()
  emit('changed')
  ElMessage.success('标签已保存')
}

const startMerge = (tag: IngredientTag) => {
  mergingTag.value = tag
  mergeTargetId.value = ''
  mergeVisible.value = true
}

const confirmMerge = async () => {
  if (!mergingTag.value || !mergeTargetId.value) {
    ElMessage.warning('请选择目标标签')
    return
  }
  await ingredientTagApi.merge(mergingTag.value.id, {
    targetTagId: mergeTargetId.value,
  })
  mergeVisible.value = false
  await load()
  emit('changed')
  ElMessage.success('标签已合并')
}

const remove = async (tag: IngredientTag) => {
  const count = usageCounts.value[tag.id] || 0
  await ElMessageBox.confirm(
    count > 0
      ? `“${tag.name}”已被 ${count} 个原料使用，请先合并到其他标签。`
      : `确认删除标签“${tag.name}”？`,
    '删除标签',
    { type: count > 0 ? 'warning' : 'info' },
  )
  if (count > 0) return
  await ingredientTagApi.delete(tag.id)
  await load()
  emit('changed')
  ElMessage.success('标签已删除')
}
</script>

<style scoped>
.tag-actions {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}
.tag-name {
  font-weight: 600;
}
.tag-desc {
  color: #909399;
  font-size: 12px;
}
</style>
```

- [ ] **Step 2: Wire drawer into IngredientForm**

In `IngredientForm.vue`, import:

```ts
import IngredientTagManagerDrawer from './components/IngredientTagManagerDrawer.vue'
```

Add state:

```ts
const tagManagerVisible = ref(false)
```

In the tag selector actions, add a button next to quick create:

```vue
          <el-button size="small" @click="tagManagerVisible = true">
            管理标签
          </el-button>
```

At the bottom of template, before `</template>`, add:

```vue
  <IngredientTagManagerDrawer
    v-model="tagManagerVisible"
    @changed="loadTags"
  />
```

- [ ] **Step 3: Run admin build**

Run:

```bash
cd admin-web
npm run build
```

Expected: PASS.

- [ ] **Step 4: Commit task 7**

Run:

```bash
git add admin-web/src/views/Ingredients/IngredientForm.vue admin-web/src/views/Ingredients/components/IngredientTagManagerDrawer.vue
git commit -m "feat: add inline ingredient tag manager"
```

---

### Task 8: Final Verification And Manual Validation Checklist

**Files:**
- No code files unless previous tasks reveal failures.

- [ ] **Step 1: Run focused backend tests**

Run:

```bash
cd backend
npm test -- tests/application/ingredient/procurement-sku.service.spec.ts tests/application/order/order-source-plan.service.spec.ts tests/application/ingredient-tag/ingredient-tag.service.spec.ts tests/application/purchasing/purchasing-procurement-sku.spec.ts --runInBand
```

Expected: all listed suites PASS.

- [ ] **Step 2: Run backend build**

Run:

```bash
cd backend
npm run build
```

Expected: build completes successfully.

- [ ] **Step 3: Run admin tests and build**

Run:

```bash
cd admin-web
npm test -- tests/ingredientTypeCapabilities.test.ts
npm run build
```

Expected: test and build both PASS.

- [ ] **Step 4: Manual UI validation**

Start or reuse the admin dev server from the worktree:

```bash
cd admin-web
npm run dev -- --host 0.0.0.0 --port 5176
```

Validate:

```text
1. 打开一个 FOOD 食材，例如“牛霖”。
2. 标准原料信息里不再出现标准层采购策略编辑。
3. 页面显示生产采购 SKU 表格。
4. 编辑一个生产采购 SKU，保存来源等级、采购策略、允许入库、成本计算价、市场参考价、SKU 可食部。
5. 关闭弹窗后重新打开该 SKU，刚才保存的值仍然存在。
6. 打开一个 SUPPLEMENT 补剂，确认没有生产采购 SKU 表格，没有来源等级字段。
7. 打开一个 PACKAGING 包材，确认没有生产采购 SKU 表格，没有标签选择器。
8. 打开标签管理抽屉，确认可查看使用数量，可更名未冲突标签。
```

- [ ] **Step 5: Manual order source plan validation**

Use a test recipe whose FOOD ingredients all have manually tagged procurement SKUs:

```text
1. 小程序订购成品页选择“有机优先”，价格预览成功。
2. 切换“超市优先”，如果 SKU 成本不同，订单价格变化。
3. 切换“性价比优先”，如果 SKU 成本不同，订单价格变化。
4. 删除或清空某个食材 SKU 的成本计算价后，价格预览报缺少可用采购来源，而不是用市场参考价兜底。
5. 补剂和包材价格逻辑保持原来的单层字段，不走食材 SKU 来源方案。
```

- [ ] **Step 6: Commit verification note if docs need updating**

If verification reveals no documentation changes, skip this commit. If a verification note is added, run:

```bash
git add docs
git commit -m "docs: record food ingredient editor verification"
```

---

## Self-Review

- Spec coverage: This plan covers standard-vs-SKU field ownership, SKU-level procurement strategy, inventory entry flag, SKU edible yield, cost-vs-reference price, tag management, FOOD-only UI, and SUPPLEMENT/PACKAGING regression.
- Completion-marker scan: no unresolved task markers or vague future-work language are intentionally left in the tasks.
- Type consistency: Backend field names use `procurementStrategy`, `allowInventoryEntry`, and `edibleYieldRatio`; admin types and form payloads use the same names.
