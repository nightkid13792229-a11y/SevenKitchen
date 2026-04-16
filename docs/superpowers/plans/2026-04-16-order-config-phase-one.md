# Order Config Phase One Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build phase one of the order chain redesign: the customer finished-product order page can choose an ingredient source plan, use 7/15/30 day default portioning, customize package specs, preview a real price, and create an immutable order snapshot containing the full package plan.

**Architecture:** Treat `recipe-order/index.vue` as the real customer ordering page. Add backend-first support for `packagePlan` and `ingredientSourcePlan`, persist them on `OrderItem` and pricing snapshots, then update the miniapp to generate and submit those values. Keep old `packageCount` and `packageSpecG` fields as compatibility summaries for order lists, production screens, and existing APIs.

**Tech Stack:** NestJS, Prisma, PostgreSQL migrations, Jest, uni-app Vue 3, Vitest, WeChat mini program preview.

---

## Scope Check

This plan implements only phase one from `docs/superpowers/specs/2026-04-16-order-procurement-production-inventory-chain-design.md`:

- Customer ordering page enhancements.
- Ingredient source plan selection.
- Default 7/15/30 day package plan generation.
- Customer-defined multi-row package plan.
- 1kg minimum order validation.
- Pricing preview and order creation from immutable snapshot.

This plan does not implement:

- Settlement adjustment records.
- Purchase shortage generation changes.
- Inventory reservation.
- Production surplus/shortage recording.
- Reimbursement workflow changes.
- Special add-ons or special packaging.

## Current Code Map

Primary flow today:

- `miniapp/src/pages/recipe-detail/index.vue` sends “订购成品” to `/pages/recipe-order/index`.
- `miniapp/src/pages/recipe-order/index.vue` is the real order configuration page.
- `miniapp/src/pages/checkout/index.vue` confirms address/date and creates the order from `snapshotId`.
- `backend/src/interfaces/controllers/orders.controller.ts` exposes `POST /orders/pricing/preview` and `POST /orders`.
- `backend/src/application/order/order.service.ts` creates pricing snapshots and orders.
- `backend/src/domain/pricing/pricing.service.ts` calculates ingredient, packaging, labor, overhead, and product price.
- `backend/src/domain/packaging/packaging.service.ts` currently prices one package spec for all bags.
- `backend/prisma/schema.prisma` has `OrderItem.packageCount` and `OrderItem.packageSpecG`, but no multi-row package plan.

Legacy page:

- `miniapp/src/pages/order-config/index.vue` is an older direct-create page. Do not make it the primary implementation surface in this phase. Leave it compatible unless a test reveals it is still an active entry point.

## File Structure

Create:

- `backend/src/domain/order/order-package-plan.ts`  
  Normalizes and validates package plan rows, computes total grams/count, and produces compatibility summary fields.

- `backend/src/domain/order/ingredient-source-plan.ts`  
  Defines the three customer-facing source plans and channel matching rules.

- `backend/src/application/order/order-source-plan.service.ts`  
  Selects procurement SKU pricing for FOOD ingredients according to the selected source plan and returns pricing-ready recipe items.

- `backend/tests/domain/order/order-package-plan.spec.ts`  
  Unit tests for package plan validation and summary.

- `backend/tests/domain/order/ingredient-source-plan.spec.ts`  
  Unit tests for source plan matching.

- `backend/prisma/migrations/202604160001_add_order_item_package_plan/migration.sql`  
  Adds persisted snapshot fields using snake_case SQL column names.

- `miniapp/src/utils/order-package-plan.ts`  
  Miniapp-side default plan generation, package plan totals, estimated days, and source plan labels.

- `miniapp/src/utils/order-package-plan.spec.ts`  
  Vitest coverage for default cycles, 1kg validation, and totals.

Modify:

- `backend/prisma/schema.prisma`  
  Add `packagePlan` and `ingredientSourcePlan` to `OrderItem`.

- `backend/src/domain/order/order-item.entity.ts`  
  Add `packagePlan` and `ingredientSourcePlan` while keeping existing fields.

- `backend/src/domain/order/order.repository.ts`  
  Add fields to `OrderItemDto`.

- `backend/src/domain/order/index.ts`  
  Export new domain helpers.

- `backend/src/domain/pricing/pricing.service.ts`  
  Accept `totalNetFoodWeightG` and `packagePlan`; price packaging per row when present.

- `backend/src/domain/packaging/packaging.service.ts`  
  Add multi-spec packaging cost calculation and keep the current single-spec method as a wrapper.

- `backend/src/interfaces/dto/orders/create-order.dto.ts`  
  Accept `packagePlan` and `ingredientSourcePlan`.

- `backend/src/interfaces/dto/orders/pricing-preview.dto.ts`  
  Accept and document `packagePlan` and `ingredientSourcePlan`.

- `backend/src/application/order/order.service.ts`  
  Resolve package plan inputs, apply source plan pricing, store request params, and create order items from snapshot.

- `backend/src/app.module.ts`  
  Register `OrderSourcePlanService` if constructor injection is used.

- `backend/src/infrastructure/repositories/prisma-order.repository.ts`  
  Serialize and deserialize new `OrderItem` fields.

- `backend/src/infrastructure/repositories/file-backed-order.repository.ts` and `backend/src/infrastructure/repositories/in-memory-order.repository.ts`  
  Preserve compatibility in tests/dev storage.

- `backend/tests/application/order/order.service.spec.ts`  
  Add package plan and source plan snapshot assertions.

- `backend/tests/interfaces/controllers/orders.controller.spec.ts`  
  Add API coverage for package plan pricing preview.

- `miniapp/src/pages/recipe-order/index.vue`  
  Replace cycle-driven fixed total with source plan, default package cycles, custom package rows, and fixed bottom price.

- `miniapp/src/pages/checkout/index.vue`  
  Read display config from local storage, show package plan, source plan, total grams, estimated days, and price.

- `miniapp/src/pages/order-detail/index.vue`, `miniapp/src/pages/orders-list/index.vue`, `miniapp/src/pages/staff-production/print-task.vue`, `miniapp/src/pages/staff-production/print-label.vue`  
  Add read-only compatibility display of `packagePlan` where existing screens currently assume one `packageSpecG`.

## Task 1: Backend Package Plan Domain Helper

**Files:**
- Create: `backend/src/domain/order/order-package-plan.ts`
- Create: `backend/tests/domain/order/order-package-plan.spec.ts`
- Modify: `backend/src/domain/order/index.ts`

- [ ] **Step 1: Write failing tests for package plan normalization**

Create `backend/tests/domain/order/order-package-plan.spec.ts`:

```ts
import {
  estimatePackagePlanDays,
  normalizePackagePlan,
  summarizePackagePlan,
} from '../../../src/domain/order/order-package-plan';

describe('order-package-plan', () => {
  it('normalizes rows and summarizes total quantity/count', () => {
    const plan = normalizePackagePlan([
      { packageSpecG: 100.4, packageCount: 2.9 },
      { packageSpecG: 200, packageCount: 3 },
    ]);

    expect(plan).toEqual([
      { packageSpecG: 100, packageCount: 2 },
      { packageSpecG: 200, packageCount: 3 },
    ]);
    expect(summarizePackagePlan(plan)).toEqual({
      totalQuantityG: 800,
      totalPackageCount: 5,
      primaryPackageSpecG: 200,
      packageSpecSummary: '100g×2袋，200g×3袋',
    });
  });

  it('rejects empty or non-positive rows', () => {
    expect(() => normalizePackagePlan([])).toThrow('packagePlan must contain at least one row');
    expect(() => normalizePackagePlan([{ packageSpecG: 0, packageCount: 1 }])).toThrow('packageSpecG must be >= 1');
    expect(() => normalizePackagePlan([{ packageSpecG: 100, packageCount: 0 }])).toThrow('packageCount must be >= 1');
  });

  it('estimates days from total quantity and daily intake', () => {
    expect(estimatePackagePlanDays(4500, 300)).toBe(15);
    expect(estimatePackagePlanDays(4400, 300)).toBeCloseTo(14.7, 1);
    expect(estimatePackagePlanDays(4400, 0)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
cd backend && npm test -- tests/domain/order/order-package-plan.spec.ts --runInBand
```

Expected: FAIL because `order-package-plan.ts` does not exist.

- [ ] **Step 3: Implement the helper**

Create `backend/src/domain/order/order-package-plan.ts`:

```ts
import { BadRequestException } from '@nestjs/common';

export interface OrderPackagePlanItem {
  packageSpecG: number;
  packageCount: number;
}

export interface OrderPackagePlanSummary {
  totalQuantityG: number;
  totalPackageCount: number;
  primaryPackageSpecG: number;
  packageSpecSummary: string;
}

export function normalizePackagePlan(
  input: Array<Partial<OrderPackagePlanItem>> | null | undefined,
): OrderPackagePlanItem[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new BadRequestException('packagePlan must contain at least one row');
  }

  return input.map((row, index) => {
    const packageSpecG = Math.floor(Number(row.packageSpecG));
    const packageCount = Math.floor(Number(row.packageCount));

    if (!Number.isFinite(packageSpecG) || packageSpecG < 1) {
      throw new BadRequestException(
        `packagePlan[${index}].packageSpecG must be >= 1`,
      );
    }

    if (!Number.isFinite(packageCount) || packageCount < 1) {
      throw new BadRequestException(
        `packagePlan[${index}].packageCount must be >= 1`,
      );
    }

    return { packageSpecG, packageCount };
  });
}

export function summarizePackagePlan(
  packagePlan: OrderPackagePlanItem[],
): OrderPackagePlanSummary {
  const totalQuantityG = packagePlan.reduce(
    (sum, row) => sum + row.packageSpecG * row.packageCount,
    0,
  );
  const totalPackageCount = packagePlan.reduce(
    (sum, row) => sum + row.packageCount,
    0,
  );
  const largestRow = [...packagePlan].sort(
    (left, right) =>
      right.packageCount - left.packageCount ||
      right.packageSpecG - left.packageSpecG,
  )[0];

  return {
    totalQuantityG,
    totalPackageCount,
    primaryPackageSpecG: largestRow.packageSpecG,
    packageSpecSummary: packagePlan
      .map((row) => `${row.packageSpecG}g×${row.packageCount}袋`)
      .join('，'),
  };
}

export function estimatePackagePlanDays(
  totalQuantityG: number,
  dailyIntakeG: number | null | undefined,
): number | null {
  if (!dailyIntakeG || dailyIntakeG <= 0) {
    return null;
  }

  return Math.round((totalQuantityG / dailyIntakeG) * 10) / 10;
}
```

Modify `backend/src/domain/order/index.ts`:

```ts
export * from './order-package-plan';
```

- [ ] **Step 4: Run the package plan test**

Run:

```bash
cd backend && npm test -- tests/domain/order/order-package-plan.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/domain/order/order-package-plan.ts backend/src/domain/order/index.ts backend/tests/domain/order/order-package-plan.spec.ts
git commit -m "feat: add order package plan helper"
```

## Task 2: Backend Ingredient Source Plan Helper

**Files:**
- Create: `backend/src/domain/order/ingredient-source-plan.ts`
- Create: `backend/tests/domain/order/ingredient-source-plan.spec.ts`
- Modify: `backend/src/domain/order/index.ts`

- [ ] **Step 1: Write failing tests for source plan matching**

Create `backend/tests/domain/order/ingredient-source-plan.spec.ts`:

```ts
import {
  INGREDIENT_SOURCE_PLANS,
  IngredientSourcePlanCode,
  matchSourcePlanChannel,
  normalizeIngredientSourcePlan,
} from '../../../src/domain/order/ingredient-source-plan';

describe('ingredient-source-plan', () => {
  it('defaults to MARKET_PREMIUM', () => {
    expect(normalizeIngredientSourcePlan(undefined)).toBe('MARKET_PREMIUM');
    expect(INGREDIENT_SOURCE_PLANS.MARKET_PREMIUM.label).toBe('尽量山姆、盒马、沃集鲜');
  });

  it('matches organic, premium market, and wholesale channels', () => {
    expect(matchSourcePlanChannel('有机农场', 'ORGANIC')).toBe(true);
    expect(matchSourcePlanChannel('Sam 山姆会员店', 'MARKET_PREMIUM')).toBe(true);
    expect(matchSourcePlanChannel('盒马鲜生', 'MARKET_PREMIUM')).toBe(true);
    expect(matchSourcePlanChannel('沃集鲜', 'MARKET_PREMIUM')).toBe(true);
    expect(matchSourcePlanChannel('生鲜批发商', 'WHOLESALE')).toBe(true);
  });

  it('rejects unknown codes', () => {
    expect(() =>
      normalizeIngredientSourcePlan('RANDOM' as IngredientSourcePlanCode),
    ).toThrow('Unknown ingredientSourcePlan');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
cd backend && npm test -- tests/domain/order/ingredient-source-plan.spec.ts --runInBand
```

Expected: FAIL because `ingredient-source-plan.ts` does not exist.

- [ ] **Step 3: Implement source plan constants**

Create `backend/src/domain/order/ingredient-source-plan.ts`:

```ts
import { BadRequestException } from '@nestjs/common';

export type IngredientSourcePlanCode =
  | 'ORGANIC'
  | 'MARKET_PREMIUM'
  | 'WHOLESALE';

export interface IngredientSourcePlanDefinition {
  code: IngredientSourcePlanCode;
  label: string;
  description: string;
  channelKeywords: string[];
}

export const INGREDIENT_SOURCE_PLANS: Record<
  IngredientSourcePlanCode,
  IngredientSourcePlanDefinition
> = {
  ORGANIC: {
    code: 'ORGANIC',
    label: '尽量有机来源',
    description: '优先匹配有机、生态、认证来源的采购 SKU。',
    channelKeywords: ['有机', 'organic', '生态', '认证'],
  },
  MARKET_PREMIUM: {
    code: 'MARKET_PREMIUM',
    label: '尽量山姆、盒马、沃集鲜',
    description: '优先匹配山姆、盒马、沃集鲜等稳定零售/会员渠道。',
    channelKeywords: ['山姆', 'sam', '盒马', '沃集鲜'],
  },
  WHOLESALE: {
    code: 'WHOLESALE',
    label: '生鲜批发商',
    description: '优先匹配批发商、生鲜批发、供应商直采等高性价比渠道。',
    channelKeywords: ['批发', '生鲜批发', '批发商', '供应商'],
  },
};

export function normalizeIngredientSourcePlan(
  code: IngredientSourcePlanCode | string | null | undefined,
): IngredientSourcePlanCode {
  if (!code) {
    return 'MARKET_PREMIUM';
  }

  if (code in INGREDIENT_SOURCE_PLANS) {
    return code as IngredientSourcePlanCode;
  }

  throw new BadRequestException(`Unknown ingredientSourcePlan: ${code}`);
}

export function matchSourcePlanChannel(
  channel: string | null | undefined,
  planCode: IngredientSourcePlanCode,
): boolean {
  if (!channel) {
    return false;
  }

  const normalized = channel.toLowerCase();
  return INGREDIENT_SOURCE_PLANS[planCode].channelKeywords.some((keyword) =>
    normalized.includes(keyword.toLowerCase()),
  );
}
```

Modify `backend/src/domain/order/index.ts`:

```ts
export * from './ingredient-source-plan';
```

- [ ] **Step 4: Run the source plan test**

Run:

```bash
cd backend && npm test -- tests/domain/order/ingredient-source-plan.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/domain/order/ingredient-source-plan.ts backend/src/domain/order/index.ts backend/tests/domain/order/ingredient-source-plan.spec.ts
git commit -m "feat: add ingredient source plan helper"
```

## Task 3: Persist Package Plan And Source Plan On Order Items

**Files:**
- Create: `backend/prisma/migrations/202604160001_add_order_item_package_plan/migration.sql`
- Modify: `backend/prisma/schema.prisma`
- Modify: `backend/src/domain/order/order-item.entity.ts`
- Modify: `backend/src/domain/order/order.repository.ts`
- Modify: `backend/src/infrastructure/repositories/prisma-order.repository.ts`
- Modify: `backend/src/infrastructure/repositories/file-backed-order.repository.ts`
- Modify: `backend/src/infrastructure/repositories/in-memory-order.repository.ts`
- Test: `backend/tests/application/order/order.service.spec.ts`

- [ ] **Step 1: Add a failing order service snapshot persistence test**

In `backend/tests/application/order/order.service.spec.ts`, add this test near the existing snapshot tests:

```ts
it('should create order items from snapshot with packagePlan and ingredientSourcePlan', async () => {
  const recipe = createMockRecipe();
  const ingredient = createMockIngredient();
  const dog = createMockDog();
  const packagePlan = [
    { packageSpecG: 100, packageCount: 2 },
    { packageSpecG: 200, packageCount: 3 },
  ];

  const snapshot = new OrderPricingSnapshot(
    'snapshot-package-plan',
    'owner-id-1',
    {
      dogId: dog.id,
      ingredientSourcePlan: 'WHOLESALE',
      items: [
        {
          recipeId: recipe.id,
          packagePlan,
          quantityG: 800,
          packageCount: 5,
          packageSpecG: 200,
          cycleDays: 3,
          dailyIntakeG: 300,
        },
      ],
    },
    {
      amountProduct: 180,
      amountShipping: 20,
      amountTotal: 200,
      pricingBreakdown: {
        costIngredients: 100,
        costPackaging: 10,
        costLabor: 20,
        costOverhead: 5,
        totalProductCost: 135,
        productPrice: 180,
        ingredientDetails: [],
        packagingDetails: {
          perPackConsumables: { vacuumBagSpec: '多规格' },
        },
      },
    },
    new Date(Date.now() + 15 * 60 * 1000),
    false,
    new Date(),
  );

  mockPricingSnapshotRepository.findById.mockResolvedValue(snapshot);
  dogRepository.findById.mockResolvedValue(dog);
  recipeRepository.findById.mockResolvedValue(recipe);
  mockIngredientRepository.findByIds.mockResolvedValue([ingredient]);
  orderRepository.save.mockImplementation(async (order: Order) => order);

  await service.createOrderDraft({
    customerId: 'owner-id-1',
    type: OrderType.FRESH_FOOD,
    snapshotId: 'snapshot-package-plan',
    targetProductionDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  const savedOrder = orderRepository.save.mock.calls[0][0] as Order;
  expect(savedOrder.items[0].quantityG).toBe(800);
  expect(savedOrder.items[0].packageCount).toBe(5);
  expect(savedOrder.items[0].packageSpecG).toBe(200);
  expect(savedOrder.items[0].packagePlan).toEqual(packagePlan);
  expect(savedOrder.items[0].ingredientSourcePlan).toBe('WHOLESALE');
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
cd backend && npm test -- tests/application/order/order.service.spec.ts --runInBand
```

Expected: FAIL because `OrderItem` does not expose `packagePlan` and `ingredientSourcePlan`.

- [ ] **Step 3: Add Prisma schema fields and migration**

Modify `backend/prisma/schema.prisma` in `model OrderItem`:

```prisma
  packagePlan          Json?     @map("package_plan")
  ingredientSourcePlan String?   @map("ingredient_source_plan") @db.VarChar(40)
```

Create `backend/prisma/migrations/202604160001_add_order_item_package_plan/migration.sql`:

```sql
ALTER TABLE "order_item"
  ADD COLUMN IF NOT EXISTS "package_plan" JSONB,
  ADD COLUMN IF NOT EXISTS "ingredient_source_plan" VARCHAR(40);

UPDATE "order_item"
SET "package_plan" = jsonb_build_array(
  jsonb_build_object(
    'packageSpecG', "package_spec_g",
    'packageCount', "package_count"
  )
)
WHERE "package_plan" IS NULL;
```

- [ ] **Step 4: Add fields to the domain entity**

Modify `backend/src/domain/order/order-item.entity.ts` constructor tail:

```ts
    public readonly productionBatchId: string | null = null,
    public readonly allocatedAt: Date | null = null,
    public readonly packagePlan: OrderPackagePlanItem[] | null = null,
    public readonly ingredientSourcePlan: IngredientSourcePlanCode | null = null,
```

Add imports:

```ts
import type { IngredientSourcePlanCode, OrderPackagePlanItem } from './index';
```

Add validation in `validateInvariants()`:

```ts
    if (this.packagePlan && this.packagePlan.length > 0) {
      const totalQuantity = this.packagePlan.reduce(
        (sum, row) => sum + row.packageSpecG * row.packageCount,
        0,
      );
      const totalCount = this.packagePlan.reduce(
        (sum, row) => sum + row.packageCount,
        0,
      );

      if (Math.round(totalQuantity) !== Math.round(this.quantityG)) {
        throw new ValidationError(
          `Package plan total (${totalQuantity}) must equal quantityG (${this.quantityG})`,
        );
      }

      if (totalCount !== this.packageCount) {
        throw new ValidationError(
          `Package plan count (${totalCount}) must equal packageCount (${this.packageCount})`,
        );
      }
    }
```

- [ ] **Step 5: Add repository DTO fields**

Modify `backend/src/domain/order/order.repository.ts`:

```ts
  packagePlan: Array<{ packageSpecG: number; packageCount: number }> | null;
  ingredientSourcePlan: string | null;
```

- [ ] **Step 6: Serialize and deserialize in repositories**

In `backend/src/infrastructure/repositories/prisma-order.repository.ts`, when writing `OrderItem`, add:

```ts
packagePlan: item.packagePlan ?? undefined,
ingredientSourcePlan: item.ingredientSourcePlan ?? null,
```

When reading an order item into `new OrderItem(...)`, pass:

```ts
record.packagePlan as any,
record.ingredientSourcePlan as any,
```

In `backend/src/infrastructure/repositories/file-backed-order.repository.ts` and `backend/src/infrastructure/repositories/in-memory-order.repository.ts`, preserve the same fields in saved JSON objects and constructor calls. Use `null` when legacy records do not have them.

- [ ] **Step 7: Run focused tests**

Run:

```bash
cd backend && npm test -- tests/application/order/order.service.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/202604160001_add_order_item_package_plan/migration.sql backend/src/domain/order/order-item.entity.ts backend/src/domain/order/order.repository.ts backend/src/infrastructure/repositories/prisma-order.repository.ts backend/src/infrastructure/repositories/file-backed-order.repository.ts backend/src/infrastructure/repositories/in-memory-order.repository.ts backend/tests/application/order/order.service.spec.ts
git commit -m "feat: persist order package plan"
```

## Task 4: Backend Pricing Preview Accepts Package Plans

**Files:**
- Modify: `backend/src/interfaces/dto/orders/create-order.dto.ts`
- Modify: `backend/src/interfaces/dto/orders/pricing-preview.dto.ts`
- Modify: `backend/src/domain/pricing/pricing.service.ts`
- Modify: `backend/src/domain/packaging/packaging.service.ts`
- Modify: `backend/src/application/order/order.service.ts`
- Test: `backend/tests/interfaces/controllers/orders.controller.spec.ts`
- Test: `backend/tests/domain/pricing/pricing-supplement-resolver.spec.ts`

- [ ] **Step 1: Add failing controller test for packagePlan preview**

In `backend/tests/interfaces/controllers/orders.controller.spec.ts`, add under `POST /api/v1/orders/pricing/preview`:

```ts
it('should price a multi-spec packagePlan and return a pricing snapshot', async () => {
  const customerId = 'test-customer-package-plan';
  const dogId = '550e8400-e29b-41d4-a716-446655440000';
  const recipeId = '550e8400-e29b-41d4-a716-446655440001';
  const ingredientId = '550e8400-e29b-41d4-a716-446655440002';

  await createTestDog(customerId, dogId);
  await createTestIngredient(ingredientId);
  await createTestRecipeWithItems(recipeId, ingredientId);

  const response = await request(app.getHttpServer())
    .post('/api/v1/orders/pricing/preview')
    .set('X-Customer-Id', customerId)
    .send({
      dogId,
      type: OrderType.FRESH_FOOD,
      ingredientSourcePlan: 'MARKET_PREMIUM',
      items: [
        {
          recipeId,
          packagePlan: [
            { packageSpecG: 100, packageCount: 2 },
            { packageSpecG: 200, packageCount: 3 },
          ],
          dailyIntakeG: 300,
        },
      ],
    })
    .expect(200);

  expect(response.body).toHaveProperty('code', 0);
  expect(response.body.data.snapshotId).toBeTruthy();
  expect(response.body.data.amountProduct).toBeGreaterThan(0);
  expect(response.body.data.pricingBreakdown.packagingDetails.perPackConsumables.vacuumBagsCount).toBe(5);
});
```

- [ ] **Step 2: Run the failing controller test**

Run:

```bash
cd backend && npm test -- tests/interfaces/controllers/orders.controller.spec.ts --runInBand
```

Expected: FAIL because DTOs do not accept `packagePlan` and service still expects `quantityG/packageSpecG`.

- [ ] **Step 3: Add DTO classes**

In both `backend/src/interfaces/dto/orders/create-order.dto.ts` and `backend/src/interfaces/dto/orders/pricing-preview.dto.ts`, add:

```ts
export class PackagePlanItemDto {
  @ApiProperty({ description: 'Package weight in grams', example: 150 })
  @IsInt()
  @Min(1)
  packageSpecG!: number;

  @ApiProperty({ description: 'Number of bags for this spec', example: 30 })
  @IsInt()
  @Min(1)
  packageCount!: number;
}
```

In item DTOs:

```ts
  @ApiPropertyOptional({
    type: [PackagePlanItemDto],
    description: 'Custom package plan. When present, quantityG/packageCount/packageSpecG are derived from this list.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PackagePlanItemDto)
  packagePlan?: PackagePlanItemDto[];
```

Make `quantityG` and `packageSpecG` optional in preview/create item DTOs while preserving validation when supplied:

```ts
  @IsOptional()
  @IsNumber()
  @Min(1)
  quantityG?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  packageSpecG?: number;
```

In request DTOs, add:

```ts
  @ApiPropertyOptional({
    description: 'Ingredient source plan',
    enum: ['ORGANIC', 'MARKET_PREMIUM', 'WHOLESALE'],
  })
  @IsOptional()
  ingredientSourcePlan?: string;
```

- [ ] **Step 4: Add multi-spec packaging support**

Modify `backend/src/domain/packaging/packaging.service.ts`:

```ts
import type { OrderPackagePlanItem } from '../order/order-package-plan';
```

Add:

```ts
async calculatePackagingCostForPlan(
  packagePlan: OrderPackagePlanItem[],
  totalFoodWeightG: number,
): Promise<PackagingCost> {
  let perPackCost = 0;
  let perPackWeight = 0;
  let totalPacks = 0;
  const specs: string[] = [];
  const allPackaging = await this.ingredientRepo.findByType(IngredientType.PACKAGING);
  const productLabel = await this.ingredientRepo.findById(
    '22831322-3463-49c7-8346-f5cc14277943',
  );

  if (!productLabel) {
    throw new NotFoundException('Product label not found in database');
  }

  for (const row of packagePlan) {
    const vacuumBag = await this.selectVacuumBag(row.packageSpecG);
    const rowCost =
      row.packageCount * (vacuumBag.getUnitCost() + productLabel.getUnitCost());
    const rowWeight =
      row.packageCount * ((vacuumBag.weightG || 0) + (productLabel.weightG || 0));

    perPackCost += rowCost;
    perPackWeight += rowWeight;
    totalPacks += row.packageCount;
    specs.push(`${row.packageSpecG}g×${row.packageCount}`);
  }

  const containers = await this.calculateShippingContainers(totalFoodWeightG);
  const ice = await this.ingredientRepo.findById(
    '1e3d5990-e553-44fb-8bb9-6144593b6899',
  );

  if (!ice) {
    throw new NotFoundException('Ice pack not found in database');
  }

  const shippingContainersBreakdown = containers.map((container) => {
    const cost =
      container.boxItem.getUnitCost() +
      container.thermalItem.getUnitCost() +
      container.icePacks * ice.getUnitCost();
    const weight =
      (container.boxItem.weightG || 0) +
      (container.thermalItem.weightG || 0) +
      container.icePacks * (ice.weightG || 0);

    return {
      boxName: container.boxItem.name,
      boxSpec: container.boxItem.maxCapacityG
        ? `容量${(container.boxItem.maxCapacityG / 1000).toFixed(1)}kg`
        : container.boxItem.productModel || container.boxItem.name,
      thermalBagName: container.thermalItem.name,
      thermalBagSpec: container.thermalItem.productModel || container.thermalItem.name,
      icePacks: container.icePacks,
      cost,
      weight,
    };
  });

  const shippingCost = shippingContainersBreakdown.reduce(
    (sum, item) => sum + item.cost,
    0,
  );
  const shippingWeight = shippingContainersBreakdown.reduce(
    (sum, item) => sum + item.weight,
    0,
  );

  return {
    cost: perPackCost + shippingCost,
    weightG: perPackWeight + shippingWeight,
    breakdown: {
      perPackConsumables: {
        vacuumBagName: '多规格食品真空袋',
        vacuumBagSpec: specs.join('，'),
        labelName: productLabel.name,
        labelSpec: productLabel.productModel || productLabel.name,
        vacuumBagCostPerPack: totalPacks > 0 ? perPackCost / totalPacks : 0,
        labelCostPerPack: productLabel.getUnitCost(),
        costPerPack: totalPacks > 0 ? perPackCost / totalPacks : 0,
        weightPerPack: totalPacks > 0 ? perPackWeight / totalPacks : 0,
      },
      shippingContainers: shippingContainersBreakdown,
    },
  };
}
```

Keep `calculatePackagingCost(totalPacks, singlePackSpecG, totalFoodWeightG)` and have it call `calculatePackagingCostForPlan([{ packageSpecG: singlePackSpecG, packageCount: totalPacks }], totalFoodWeightG)` so old callers keep working.

- [ ] **Step 5: Extend pricing input**

Modify `backend/src/domain/pricing/pricing.service.ts`:

```ts
import type { OrderPackagePlanItem } from '../order/order-package-plan';
```

Change `PricingCalculationInput`:

```ts
  dailyG?: number;
  days?: number;
  totalNetFoodWeightG?: number;
  packagePlan?: OrderPackagePlanItem[];
```

At the top of `calculateOrderPrice`, replace the current total calculation with:

```ts
const totalNetFoodWeightG =
  input.totalNetFoodWeightG ??
  ((input.dailyG ?? 0) * (input.days ?? 0));

if (totalNetFoodWeightG < globalConfig.minOrderWeightG) {
  throw new ValidationError(
    `订单净重不足 ${globalConfig.minOrderWeightG}g (当前 ${totalNetFoodWeightG}g)`,
  );
}

const totalPacks = input.packagePlan
  ? input.packagePlan.reduce((sum, row) => sum + row.packageCount, 0)
  : dog.mealsPerDay * (input.days ?? 0);
const singlePackSpecG =
  input.singlePackSpecG ??
  input.packagePlan?.[0]?.packageSpecG ??
  ((input.dailyG ?? 0) / dog.mealsPerDay);
```

Use package plan for packaging:

```ts
const packagingResult = input.packagePlan
  ? await this.packagingService.calculatePackagingCostForPlan(
      input.packagePlan,
      totalNetFoodWeightG,
    )
  : await this.packagingService.calculatePackagingCost(
      totalPacks,
      singlePackSpecG,
      totalNetFoodWeightG,
    );
```

- [ ] **Step 6: Resolve package plan in OrderService**

In `backend/src/application/order/order.service.ts`, import:

```ts
import {
  normalizeIngredientSourcePlan,
  normalizePackagePlan,
  summarizePackagePlan,
  type IngredientSourcePlanCode,
  type OrderPackagePlanItem,
} from '../../domain/order';
```

Extend `CreateOrderDraftDto`:

```ts
  ingredientSourcePlan?: string;
```

Extend `CreateOrderItemDto`:

```ts
  quantityG?: number;
  packageSpecG?: number;
  packagePlan?: OrderPackagePlanItem[];
```

Add helper:

```ts
private resolveOrderItemPackageInput(itemDto: CreateOrderItemDto): {
  quantityG: number;
  packageCount: number;
  packageSpecG: number;
  packagePlan: OrderPackagePlanItem[];
} {
  if (itemDto.packagePlan && itemDto.packagePlan.length > 0) {
    const packagePlan = normalizePackagePlan(itemDto.packagePlan);
    const summary = summarizePackagePlan(packagePlan);
    return {
      quantityG: summary.totalQuantityG,
      packageCount: summary.totalPackageCount,
      packageSpecG: summary.primaryPackageSpecG,
      packagePlan,
    };
  }

  if (!itemDto.quantityG || !itemDto.packageSpecG) {
    throw new BadRequestException(
      'quantityG and packageSpecG are required when packagePlan is not provided',
    );
  }

  const packageCount = this.normalizePackageCount(
    itemDto.quantityG,
    itemDto.packageCount,
    itemDto.packageSpecG,
  );

  return {
    quantityG: itemDto.quantityG,
    packageCount,
    packageSpecG: itemDto.packageSpecG,
    packagePlan: [{ packageSpecG: itemDto.packageSpecG, packageCount }],
  };
}
```

Use the helper in `previewPricing`, `createOrderFromItems`, and `createOrderFromSnapshot`.

When calling `pricingService.calculateOrderPrice`, pass:

```ts
const packageInput = this.resolveOrderItemPackageInput(itemDto);
const dailyG = itemDto.dailyIntakeG ?? packageInput.quantityG;
const days = itemDto.dailyIntakeG
  ? Math.max(1, packageInput.quantityG / itemDto.dailyIntakeG)
  : 1;

const pricing = await this.pricingService.calculateOrderPrice({
  dog: { mealsPerDay: dog.mealsPerDay || 2 },
  recipe: { ... },
  dailyG,
  days,
  totalNetFoodWeightG: packageInput.quantityG,
  packagePlan: packageInput.packagePlan,
  discountRate: 1.0,
  globalConfig,
  singlePackSpecG: packageInput.packageSpecG,
});
```

Store snapshot params:

```ts
requestParams: {
  dogId: dto.dogId,
  addressId: dto.addressId,
  ingredientSourcePlan: normalizeIngredientSourcePlan(dto.ingredientSourcePlan),
  items: [{
    recipeId: itemDto.recipeId,
    quantityG: packageInput.quantityG,
    packageCount: packageInput.packageCount,
    packageSpecG: packageInput.packageSpecG,
    packagePlan: packageInput.packagePlan,
    cycleDays: itemDto.cycleDays,
    dailyIntakeG: itemDto.dailyIntakeG,
  }],
}
```

Create `OrderItem` with:

```ts
packageInput.quantityG,
packageInput.packageCount,
packageInput.packageSpecG,
...
packageInput.packagePlan,
sourcePlan,
```

- [ ] **Step 7: Run backend tests**

Run:

```bash
cd backend && npm test -- tests/interfaces/controllers/orders.controller.spec.ts --runInBand
cd backend && npm test -- tests/application/order/order.service.spec.ts --runInBand
cd backend && npm test -- tests/domain/pricing/pricing-supplement-resolver.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/src/interfaces/dto/orders/create-order.dto.ts backend/src/interfaces/dto/orders/pricing-preview.dto.ts backend/src/domain/pricing/pricing.service.ts backend/src/domain/packaging/packaging.service.ts backend/src/application/order/order.service.ts backend/tests/interfaces/controllers/orders.controller.spec.ts backend/tests/application/order/order.service.spec.ts backend/tests/domain/pricing/pricing-supplement-resolver.spec.ts
git commit -m "feat: price custom package plans"
```

## Task 5: Apply Ingredient Source Plans To Pricing

**Files:**
- Create: `backend/src/application/order/order-source-plan.service.ts`
- Modify: `backend/src/application/order/order.service.ts`
- Modify: `backend/src/app.module.ts`
- Test: `backend/tests/application/order/order.service.spec.ts`

- [ ] **Step 1: Add failing service test for source-plan SKU pricing**

In `backend/tests/application/order/order.service.spec.ts`, add a test that spies on `mockPricingService.calculateOrderPrice` and asserts the `PricingRecipeItem` ingredient carries source-plan channel metadata:

```ts
it('should pass selected ingredientSourcePlan through pricing request params', async () => {
  const recipe = createMockRecipe();
  const ingredient = createMockIngredient();
  const dog = createMockDog();

  dogRepository.findById.mockResolvedValue(dog);
  recipeRepository.findById.mockResolvedValue(recipe);
  mockIngredientRepository.findByIds.mockResolvedValue([ingredient]);
  mockPricingService.calculateOrderPrice.mockResolvedValue({
    costIngredients: 50,
    costPackaging: 10,
    costLabor: 20,
    costOverhead: 5,
    totalProductCost: 85,
    productPrice: 141.67,
    weightPackagingG: 0,
    ingredientDetails: [],
    packagingDetails: {
      perPackConsumables: { vacuumBagSpec: '多规格' },
    },
  });
  mockPricingSnapshotRepository.create.mockResolvedValue({ id: 'snapshot-source-plan' });
  mockShippingService.calculateShippingFeePreview.mockResolvedValue({
    amountShipping: 0,
    templateId: null,
  });

  await service.previewPricing({
    customerId: 'owner-id-1',
    dogId: dog.id,
    type: OrderType.FRESH_FOOD,
    ingredientSourcePlan: 'ORGANIC',
    items: [
      {
        recipeId: recipe.id,
        packagePlan: [{ packageSpecG: 100, packageCount: 10 }],
        dailyIntakeG: 300,
      },
    ],
  });

  expect(mockPricingSnapshotRepository.create).toHaveBeenCalledWith(
    expect.objectContaining({
      requestParams: expect.objectContaining({
        ingredientSourcePlan: 'ORGANIC',
      }),
    }),
  );
});
```

- [ ] **Step 2: Implement source-plan service**

Create `backend/src/application/order/order-source-plan.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { Ingredient } from '../../domain/ingredient';
import { IngredientType } from '../../domain/ingredient/enums';
import {
  matchSourcePlanChannel,
  type IngredientSourcePlanCode,
} from '../../domain/order';
import {
  ProcurementSkuService,
  type ProcurementSkuSummary,
} from '../ingredient/procurement-sku.service';

@Injectable()
export class OrderSourcePlanService {
  constructor(private readonly procurementSkuService: ProcurementSkuService) {}

  async applySourcePlanToIngredients(
    ingredients: Ingredient[],
    planCode: IngredientSourcePlanCode,
  ): Promise<Map<string, Ingredient>> {
    const foodIds = ingredients
      .filter((ingredient) => ingredient.type === IngredientType.FOOD)
      .map((ingredient) => ingredient.id);
    const skuMap = await this.procurementSkuService.batchFindActive(foodIds);

    return new Map(
      ingredients.map((ingredient) => {
        const selectedSku = this.selectSkuForPlan(
          skuMap[ingredient.id] || [],
          planCode,
        );

        return [
          ingredient.id,
          selectedSku ? this.withProcurementSku(ingredient, selectedSku) : ingredient,
        ];
      }),
    );
  }

  private selectSkuForPlan(
    skus: ProcurementSkuSummary[],
    planCode: IngredientSourcePlanCode,
  ): ProcurementSkuSummary | undefined {
    return (
      skus.find((sku) => matchSourcePlanChannel(sku.purchaseChannel, planCode)) ||
      skus.find((sku) => sku.isDefault) ||
      skus[0]
    );
  }

  private withProcurementSku(
    ingredient: Ingredient,
    sku: ProcurementSkuSummary,
  ): Ingredient {
    return new Ingredient(
      ingredient.id,
      ingredient.name,
      ingredient.type,
      ingredient.procurementStrategy,
      ingredient.diyEnabled,
      ingredient.procurementEnabled,
      sku.brand ?? ingredient.brand,
      sku.productModel ?? ingredient.productModel,
      sku.purchaseChannel ?? ingredient.purchaseChannel,
      ingredient.notes,
      ingredient.baseUnit,
      ingredient.unitDisplayLabel,
      sku.purchaseUnit ?? ingredient.purchaseUnit,
      sku.purchaseToBaseRatio ?? ingredient.purchaseToBaseRatio,
      sku.currentPurchasePrice ??
        sku.referencePurchasePrice ??
        sku.referencePricePerPurchaseUnit ??
        ingredient.currentPricePerPurchaseUnit,
      null,
      ingredient.weightG,
      ingredient.maxCapacityG,
      sku.safetyStock ?? ingredient.safetyStock,
      sku.reorderPoint ?? ingredient.reorderPoint,
      sku.targetStock ?? ingredient.targetStock,
      {
        ...ingredient.properties,
        procurement_sku_id: sku.id,
        procurement_sku_name: sku.name,
      },
      ingredient.nutritionProfile,
    );
  }
}
```

- [ ] **Step 3: Register and use the service**

Modify `backend/src/app.module.ts` providers to include:

```ts
OrderSourcePlanService,
```

Modify `backend/src/application/order/order.service.ts` constructor:

```ts
private readonly orderSourcePlanService: OrderSourcePlanService,
```

After ingredients load in preview/order creation:

```ts
const sourcePlan = normalizeIngredientSourcePlan(dto.ingredientSourcePlan);
const sourceIngredientMap =
  await this.orderSourcePlanService.applySourcePlanToIngredients(
    ingredients,
    sourcePlan,
  );
```

Use `sourceIngredientMap.get(ri.ingredientId)` when building pricing recipe items and recipe snapshots so source plan affects both price and customer-facing ingredient details.

- [ ] **Step 4: Run tests**

Run:

```bash
cd backend && npm test -- tests/application/order/order.service.spec.ts --runInBand
cd backend && npm test -- tests/interfaces/controllers/orders.controller.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/application/order/order-source-plan.service.ts backend/src/application/order/order.service.ts backend/src/app.module.ts backend/tests/application/order/order.service.spec.ts
git commit -m "feat: apply ingredient source plans to pricing"
```

## Task 6: Miniapp Package Plan Utility

**Files:**
- Create: `miniapp/src/utils/order-package-plan.ts`
- Create: `miniapp/src/utils/order-package-plan.spec.ts`

- [ ] **Step 1: Write failing miniapp utility tests**

Create `miniapp/src/utils/order-package-plan.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ORDER_CYCLE_DAYS,
  buildDefaultPackagePlan,
  estimateFeedDays,
  getPackagePlanTotal,
  getSourcePlanLabel,
  isMinimumOrderMet,
} from './order-package-plan';

describe('order-package-plan miniapp helper', () => {
  it('uses 15 days as the default cycle', () => {
    expect(DEFAULT_ORDER_CYCLE_DAYS).toBe(15);
  });

  it('builds default package plan from daily intake and meals per day', () => {
    expect(
      buildDefaultPackagePlan({
        dailyIntakeG: 300,
        mealsPerDay: 2,
        days: 15,
      }),
    ).toEqual([{ packageSpecG: 150, packageCount: 30 }]);
  });

  it('summarizes custom package rows', () => {
    const total = getPackagePlanTotal([
      { packageSpecG: 100, packageCount: 10 },
      { packageSpecG: 150, packageCount: 20 },
      { packageSpecG: 200, packageCount: 5 },
    ]);

    expect(total).toEqual({ totalGrams: 5000, totalPackages: 35 });
    expect(isMinimumOrderMet(total.totalGrams)).toBe(true);
    expect(estimateFeedDays(total.totalGrams, 300)).toBe('16.7');
  });

  it('returns customer-facing source plan labels', () => {
    expect(getSourcePlanLabel('MARKET_PREMIUM')).toBe('尽量山姆、盒马、沃集鲜');
  });
});
```

- [ ] **Step 2: Run failing test**

Run:

```bash
cd miniapp && npm run test -- src/utils/order-package-plan.spec.ts
```

Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Implement miniapp helper**

Create `miniapp/src/utils/order-package-plan.ts`:

```ts
export type IngredientSourcePlanCode =
  | 'ORGANIC'
  | 'MARKET_PREMIUM'
  | 'WHOLESALE';

export interface PackagePlanItem {
  packageSpecG: number;
  packageCount: number;
}

export const DEFAULT_ORDER_CYCLE_DAYS = 15;
export const ORDER_CYCLE_OPTIONS = [7, 15, 30] as const;
export const MIN_ORDER_WEIGHT_G = 1000;

export const SOURCE_PLAN_OPTIONS: Array<{
  code: IngredientSourcePlanCode;
  label: string;
  description: string;
}> = [
  {
    code: 'ORGANIC',
    label: '尽量有机来源',
    description: '优先匹配有机、生态、认证来源',
  },
  {
    code: 'MARKET_PREMIUM',
    label: '尽量山姆、盒马、沃集鲜',
    description: '默认方案，稳定且品质较好',
  },
  {
    code: 'WHOLESALE',
    label: '生鲜批发商',
    description: '高性价比，适合大规格订购',
  },
];

export function buildDefaultPackagePlan(input: {
  dailyIntakeG: number;
  mealsPerDay: number;
  days: number;
}): PackagePlanItem[] {
  const mealsPerDay = Math.max(1, Math.floor(input.mealsPerDay || 1));
  const packageSpecG = Math.max(
    1,
    Math.round((input.dailyIntakeG || 0) / mealsPerDay),
  );
  return [
    {
      packageSpecG,
      packageCount: mealsPerDay * input.days,
    },
  ];
}

export function getPackagePlanTotal(plan: PackagePlanItem[]) {
  return plan.reduce(
    (total, row) => ({
      totalGrams: total.totalGrams + row.packageSpecG * row.packageCount,
      totalPackages: total.totalPackages + row.packageCount,
    }),
    { totalGrams: 0, totalPackages: 0 },
  );
}

export function isMinimumOrderMet(totalGrams: number): boolean {
  return totalGrams >= MIN_ORDER_WEIGHT_G;
}

export function estimateFeedDays(
  totalGrams: number,
  dailyIntakeG: number,
): string {
  if (!dailyIntakeG || dailyIntakeG <= 0) {
    return '-';
  }
  return (totalGrams / dailyIntakeG).toFixed(1);
}

export function getSourcePlanLabel(code: IngredientSourcePlanCode): string {
  return SOURCE_PLAN_OPTIONS.find((item) => item.code === code)?.label || '';
}
```

- [ ] **Step 4: Run utility tests**

Run:

```bash
cd miniapp && npm run test -- src/utils/order-package-plan.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add miniapp/src/utils/order-package-plan.ts miniapp/src/utils/order-package-plan.spec.ts
git commit -m "feat: add miniapp package plan helper"
```

## Task 7: Refactor Recipe Order Page

**Files:**
- Modify: `miniapp/src/pages/recipe-order/index.vue`
- Test: `miniapp/src/pages/recipe-order.regression.spec.ts`

- [ ] **Step 1: Add source-read regression tests**

Create `miniapp/src/pages/recipe-order.regression.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('recipe-order phase one UI contract', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/pages/recipe-order/index.vue'),
    'utf-8',
  );

  it('exposes the three default order cycles and no custom days input', () => {
    expect(source).toContain('ORDER_CYCLE_OPTIONS');
    expect(source).not.toContain('customDays');
    expect(source).not.toContain('自选');
  });

  it('uses packagePlan instead of single packageCount/packageSpecG payload only', () => {
    expect(source).toContain('packagePlan');
    expect(source).toContain('ingredientSourcePlan');
  });

  it('does not expose quick meal-size editing controls', () => {
    expect(source).not.toContain('startEditPerMeal');
    expect(source).not.toContain('修改</button>');
    expect(source).not.toContain('重置</button>');
  });
});
```

- [ ] **Step 2: Run failing regression test**

Run:

```bash
cd miniapp && npm run test -- src/pages/recipe-order.regression.spec.ts
```

Expected: FAIL because the page still has custom days and quick meal edit.

- [ ] **Step 3: Update script imports and state**

In `miniapp/src/pages/recipe-order/index.vue`, import:

```ts
import {
  DEFAULT_ORDER_CYCLE_DAYS,
  ORDER_CYCLE_OPTIONS,
  SOURCE_PLAN_OPTIONS,
  buildDefaultPackagePlan,
  estimateFeedDays,
  getPackagePlanTotal,
  getSourcePlanLabel,
  isMinimumOrderMet,
  type IngredientSourcePlanCode,
  type PackagePlanItem,
} from '../../utils/order-package-plan';
```

Replace state:

```ts
const selectedCycleDays = ref(DEFAULT_ORDER_CYCLE_DAYS);
const selectedSourcePlan = ref<IngredientSourcePlanCode>('MARKET_PREMIUM');
const packagePlan = ref<PackagePlanItem[]>([]);
```

Remove these state variables and related functions:

```ts
const customDays = ref('');
const isEditingPerMeal = ref(false);
const tempPerMealG = ref('');
const isPerMealModified = ref(false);
function startEditPerMeal() {}
function savePerMeal() {}
function cancelEditPerMeal() {}
function resetPerMeal() {}
function confirmCustomDays() {}
```

Add computed values:

```ts
const packagePlanTotal = computed(() => getPackagePlanTotal(packagePlan.value));
const totalGrams = computed(() => packagePlanTotal.value.totalGrams);
const totalPackages = computed(() => packagePlanTotal.value.totalPackages);
const estimatedFeedDays = computed(() =>
  estimateFeedDays(totalGrams.value, displayDailyIntakeG.value),
);
const minimumOrderMet = computed(() => isMinimumOrderMet(totalGrams.value));
const sourcePlanLabel = computed(() => getSourcePlanLabel(selectedSourcePlan.value));
```

- [ ] **Step 4: Generate default package plan from dog calculation**

In `loadDogCalcResult`, after setting `displayDailyIntakeG.value`, replace custom meal editing flags with:

```ts
packagePlan.value = buildDefaultPackagePlan({
  dailyIntakeG: displayDailyIntakeG.value,
  mealsPerDay: selectedDog.value?.mealsPerDay || 2,
  days: selectedCycleDays.value,
});
```

Update `selectCycle(days: number)`:

```ts
function selectCycle(days: number) {
  selectedCycleDays.value = days;
  packagePlan.value = buildDefaultPackagePlan({
    dailyIntakeG: displayDailyIntakeG.value,
    mealsPerDay: selectedDog.value?.mealsPerDay || 2,
    days,
  });
  loadPricePreview();
}
```

- [ ] **Step 5: Add custom package row actions**

Add script functions:

```ts
function addPackagePlanRow() {
  packagePlan.value = [
    ...packagePlan.value,
    { packageSpecG: Math.max(1, Math.round(perMealG.value || 100)), packageCount: 1 },
  ];
  loadPricePreview();
}

function updatePackagePlanRow(
  index: number,
  field: 'packageSpecG' | 'packageCount',
  value: string | number,
) {
  const next = [...packagePlan.value];
  const numeric = Math.max(1, Math.floor(Number(value) || 1));
  next[index] = { ...next[index], [field]: numeric };
  packagePlan.value = next;
  loadPricePreview();
}

function removePackagePlanRow(index: number) {
  if (packagePlan.value.length === 1) {
    uni.showToast({ title: '至少保留一条分装规格', icon: 'none' });
    return;
  }
  packagePlan.value = packagePlan.value.filter((_, rowIndex) => rowIndex !== index);
  loadPricePreview();
}

function selectSourcePlan(code: IngredientSourcePlanCode) {
  selectedSourcePlan.value = code;
  loadPricePreview();
}
```

- [ ] **Step 6: Update price preview payload**

In `loadPricePreview`, replace old `pkgCount/pkgSpecG` payload with:

```ts
if (!selectedDogId.value || packagePlan.value.length === 0) return;
if (!minimumOrderMet.value) {
  resetPricePreviewState();
  return;
}

const payload = {
  dogId: selectedDogId.value,
  type: 'FRESH_FOOD',
  ingredientSourcePlan: selectedSourcePlan.value,
  items: [
    {
      recipeId: recipeId.value,
      packagePlan: packagePlan.value,
      dailyIntakeG: displayDailyIntakeG.value,
      preparationMethod: preparationMethod.value || undefined,
      cookingMethod: cookingMethod.value || undefined,
    },
  ],
};
```

- [ ] **Step 7: Store checkout display config before navigation**

In `buyNow`, write display data to storage:

```ts
const checkoutConfig = {
  snapshotId: pricingSnapshotId.value,
  dogName: selectedDog.value?.name || '',
  breedName: selectedDog.value?.breedName || '',
  weightKg: selectedDog.value?.currentWeightKg || 0,
  mealsPerDay: selectedDog.value?.mealsPerDay || 2,
  dailyIntakeG: displayDailyIntakeG.value,
  estimatedFeedDays: estimatedFeedDays.value,
  recipeName: recipe.value.name,
  recipeCoverImage: recipe.value.coverImageUrl || '',
  packagePlan: packagePlan.value,
  totalPackages: totalPackages.value,
  totalGrams: totalGrams.value,
  ingredientSourcePlan: selectedSourcePlan.value,
  ingredientSourcePlanLabel: sourcePlanLabel.value,
  amountProduct: pricePreview.value?.amountProduct || 0,
  amountShipping: pricePreview.value?.amountShipping || 0,
  amountTotal: pricePreview.value?.amountTotal || 0,
};

uni.setStorageSync('direct_buy_order_config', checkoutConfig);

uni.navigateTo({
  url: `/pages/checkout/index?mode=directBuy&snapshotId=${encodeURIComponent(pricingSnapshotId.value)}`,
});
```

- [ ] **Step 8: Update template**

Replace the “确定饭量” section with a read-only explanation:

```vue
<view class="section feeding-section" v-if="selectedDog">
  <view class="section-title">
    <text class="title-text">饭量参考</text>
  </view>
  <view class="feeding-info">
    <view class="feeding-item">
      <text class="feeding-label">建议每日饭量</text>
      <text class="feeding-value readonly">{{ Math.round(displayDailyIntakeG) }}g/天</text>
    </view>
    <view class="feeding-item">
      <text class="feeding-label">建议每餐饭量</text>
      <text class="feeding-value">{{ Math.round(perMealG) }}g/餐</text>
    </view>
  </view>
  <view class="calculation-explanation">
    <view class="explanation-header" @tap="toggleCalculationDetails">
      <view class="explanation-title-row">
        <text class="explanation-title">饭量计算过程</text>
        <text class="toggle-icon">{{ showCalculationDetails ? '▲' : '▼' }}</text>
      </view>
    </view>
    <view v-if="showCalculationDetails && dogCalcResult" class="explanation-content">
      <view class="calc-cards">
        <view class="calc-card"><text class="card-title">每日能量需求</text><text class="result-value">{{ Math.round(dogCalcResult.totalDer || 0) }} kcal/天</text></view>
        <view class="calc-card"><text class="card-title">每日鲜食能量</text><text class="result-value">{{ Math.round(dogCalcResult.finalFoodKcal || 0) }} kcal/天</text></view>
        <view class="calc-card highlight"><text class="card-title">换算鲜食克数</text><text class="formula-text">每日鲜食能量 ÷ 食谱能量密度 × 1000</text><text class="result-value highlight">{{ Math.round(displayDailyIntakeG) }}g/天</text></view>
      </view>
    </view>
  </view>
</view>
```

Replace “订购周期” with default cycles and package plan rows:

```vue
<view class="section cycle-section" v-if="selectedDog">
  <view class="section-title">
    <text class="title-text">默认分装周期</text>
  </view>
  <view class="cycle-options">
    <view
      v-for="days in ORDER_CYCLE_OPTIONS"
      :key="days"
      class="cycle-option"
      :class="{ active: selectedCycleDays === days }"
      @tap="selectCycle(days)"
    >
      <text class="cycle-text">{{ days }}天</text>
    </view>
  </view>
</view>

<view class="section portion-section" v-if="selectedDog">
  <view class="section-title">
    <text class="title-text">自定义分装</text>
    <button class="btn-add-row" @tap="addPackagePlanRow">新增规格</button>
  </view>
  <view
    v-for="(row, index) in packagePlan"
    :key="index"
    class="portion-row"
  >
    <input class="portion-input" type="number" :value="row.packageSpecG" @input="updatePackagePlanRow(index, 'packageSpecG', $event.detail.value)" />
    <text class="portion-unit">g ×</text>
    <input class="portion-input" type="number" :value="row.packageCount" @input="updatePackagePlanRow(index, 'packageCount', $event.detail.value)" />
    <text class="portion-unit">袋</text>
    <button class="btn-remove-row" @tap="removePackagePlanRow(index)">删除</button>
  </view>
  <view class="total-summary">
    <view class="summary-item"><text class="summary-label">订单总量：</text><text class="summary-value">{{ Math.round(totalGrams) }}g</text></view>
    <view class="summary-item"><text class="summary-label">总袋数：</text><text class="summary-value">{{ totalPackages }}袋</text></view>
    <view class="summary-item"><text class="summary-label">预计可吃：</text><text class="summary-value">约{{ estimatedFeedDays }}天</text></view>
  </view>
  <view v-if="!minimumOrderMet" class="min-order-warning">
    <text class="warning-text">本产品 1kg 起订，可增加袋数或选择更长周期</text>
  </view>
</view>
```

Add source plan selector:

```vue
<view class="section source-plan-section" v-if="selectedDog">
  <view class="section-title"><text class="title-text">原料采购方案</text></view>
  <view class="source-plan-options">
    <view
      v-for="plan in SOURCE_PLAN_OPTIONS"
      :key="plan.code"
      class="source-plan-card"
      :class="{ active: selectedSourcePlan === plan.code }"
      @tap="selectSourcePlan(plan.code)"
    >
      <text class="source-plan-label">{{ plan.label }}</text>
      <text class="source-plan-desc">{{ plan.description }}</text>
    </view>
  </view>
</view>
```

Update bottom bar:

```vue
<view class="bottom-bar">
  <view class="bottom-price" v-if="pricePreview">
    <text class="bottom-total">¥{{ pricePreview.amountTotal.toFixed(2) }}</text>
    <text class="bottom-sub">约 ¥{{ (pricePreview.amountTotal / Math.max(1, Number(estimatedFeedDays))).toFixed(2) }}/天</text>
  </view>
  <button class="btn-buy-now" :disabled="!canBuyNow || !minimumOrderMet" @tap="buyNow">
    立即下单
  </button>
</view>
```

- [ ] **Step 9: Add product intro image block**

Add a section below the header:

```vue
<view class="section product-intro-section">
  <view class="section-title">
    <text class="title-text">产品说明</text>
  </view>
  <image
    class="product-intro-image"
    src="/static/share-recipe.png"
    mode="widthFix"
  />
</view>
```

This uses an existing image asset for phase one. Final brand assets can replace the same `src` path without changing the order-flow code.

- [ ] **Step 10: Run miniapp tests**

Run:

```bash
cd miniapp && npm run test -- src/pages/recipe-order.regression.spec.ts src/utils/order-package-plan.spec.ts
```

Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add miniapp/src/pages/recipe-order/index.vue miniapp/src/pages/recipe-order.regression.spec.ts
git commit -m "feat: update recipe order package flow"
```

## Task 8: Update Checkout Display For Package Plan

**Files:**
- Modify: `miniapp/src/pages/checkout/index.vue`
- Test: `miniapp/src/pages/checkout.regression.spec.ts`

- [ ] **Step 1: Add source-read regression test**

Create `miniapp/src/pages/checkout.regression.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('checkout package plan display', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/pages/checkout/index.vue'),
    'utf-8',
  );

  it('loads direct buy display config from storage', () => {
    expect(source).toContain('direct_buy_order_config');
  });

  it('displays package plan and ingredient source plan', () => {
    expect(source).toContain('packagePlan');
    expect(source).toContain('ingredientSourcePlanLabel');
  });
});
```

- [ ] **Step 2: Run failing test**

Run:

```bash
cd miniapp && npm run test -- src/pages/checkout.regression.spec.ts
```

Expected: FAIL because checkout only reads URL fields.

- [ ] **Step 3: Extend checkout interfaces**

Modify `miniapp/src/pages/checkout/index.vue`:

```ts
interface PackagePlanItem {
  packageSpecG: number;
  packageCount: number;
}

interface OrderConfig {
  dogName: string;
  breedName?: string;
  weightKg?: number;
  mealsPerDay: number;
  dailyIntakeG: number;
  estimatedFeedDays: string;
  totalPackages: number;
  totalGrams: number;
  packagePlan: PackagePlanItem[];
  ingredientSourcePlanLabel: string;
  preparationMethod: 'CHOPPED' | 'DICED';
  cookingMethod: 'RAW' | 'COOKED';
  recipeName: string;
  recipeCoverImage?: string;
}
```

Initialize:

```ts
packagePlan: [],
dailyIntakeG: 0,
estimatedFeedDays: '-',
ingredientSourcePlanLabel: '',
```

- [ ] **Step 4: Load config from storage**

Replace `loadDirectBuyItem(options)` internals:

```ts
function loadDirectBuyItem(options: any) {
  const storedConfig = uni.getStorageSync('direct_buy_order_config') || {};
  pricingSnapshotId.value = options.snapshotId || storedConfig.snapshotId || null;

  directBuyPrice.value = {
    amountProduct: Number(storedConfig.amountProduct || options.amountProduct || 0),
    amountShipping: Number(storedConfig.amountShipping || options.amountShipping || 0),
    amountTotal: Number(storedConfig.amountTotal || options.amountTotal || 0),
  };

  orderConfig.value = {
    dogName: storedConfig.dogName || decodeURIComponent(options.dogName || ''),
    breedName: storedConfig.breedName || decodeURIComponent(options.breedName || ''),
    weightKg: Number(storedConfig.weightKg || options.weightKg || 0) || undefined,
    mealsPerDay: Number(storedConfig.mealsPerDay || options.mealsPerDay || 2),
    dailyIntakeG: Number(storedConfig.dailyIntakeG || 0),
    estimatedFeedDays: String(storedConfig.estimatedFeedDays || '-'),
    totalPackages: Number(storedConfig.totalPackages || options.totalPackages || 0),
    totalGrams: Number(storedConfig.totalGrams || options.totalGrams || 0),
    packagePlan: Array.isArray(storedConfig.packagePlan) ? storedConfig.packagePlan : [],
    ingredientSourcePlanLabel: storedConfig.ingredientSourcePlanLabel || '',
    preparationMethod: (storedConfig.preparationMethod || options.preparationMethod || 'CHOPPED') as 'CHOPPED' | 'DICED',
    cookingMethod: (storedConfig.cookingMethod || options.cookingMethod || 'RAW') as 'RAW' | 'COOKED',
    recipeName: storedConfig.recipeName || decodeURIComponent(options.recipeName || ''),
    recipeCoverImage: storedConfig.recipeCoverImage || decodeURIComponent(options.recipeCoverImage || ''),
  };
}
```

- [ ] **Step 5: Update checkout template**

In “订购信息”, replace single `perMealG` display with package plan summary:

```vue
<view class="config-item">
  <text class="config-label">订单总量</text>
  <text class="config-value">{{ orderConfig.totalGrams }}g</text>
</view>
<view class="config-item">
  <text class="config-label">预计可吃</text>
  <text class="config-value">约{{ orderConfig.estimatedFeedDays }}天</text>
</view>
<view class="config-item">
  <text class="config-label">总袋数</text>
  <text class="config-value">{{ orderConfig.totalPackages }}袋</text>
</view>
<view class="config-item">
  <text class="config-label">原料方案</text>
  <text class="config-value">{{ orderConfig.ingredientSourcePlanLabel || '-' }}</text>
</view>
```

Add package plan rows:

```vue
<view class="info-card order-info-card">
  <text class="info-card-title">分装明细</text>
  <view
    v-for="(row, index) in orderConfig.packagePlan"
    :key="index"
    class="package-plan-row"
  >
    <text class="config-label">{{ row.packageSpecG }}g</text>
    <text class="config-value">× {{ row.packageCount }}袋</text>
  </view>
</view>
```

Update bottom button to keep total amount visible:

```vue
<view class="bottom-bar">
  <view class="checkout-bottom-price">
    <text class="checkout-bottom-total">¥{{ totalAmount.toFixed(2) }}</text>
    <text class="checkout-bottom-sub">约{{ orderConfig.estimatedFeedDays }}天</text>
  </view>
  <button class="btn-pay-with-amount" :disabled="!canSubmitOrder" @tap="submitOrder">
    <text class="btn-text">提交订单</text>
  </button>
</view>
```

- [ ] **Step 6: Run checkout test**

Run:

```bash
cd miniapp && npm run test -- src/pages/checkout.regression.spec.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add miniapp/src/pages/checkout/index.vue miniapp/src/pages/checkout.regression.spec.ts
git commit -m "feat: show package plan in checkout"
```

## Task 9: Compatibility Displays For Existing Order Screens

**Files:**
- Modify: `miniapp/src/pages/order-detail/index.vue`
- Modify: `miniapp/src/pages/orders-list/index.vue`
- Modify: `miniapp/src/pages/staff-production/print-task.vue`
- Modify: `miniapp/src/pages/staff-production/print-label.vue`
- Test: `miniapp/src/pages/order-detail.regression.spec.ts`

- [ ] **Step 1: Extend order detail regression test**

Modify `miniapp/src/pages/order-detail.regression.spec.ts`:

```ts
it('supports multi-row package plan display when present', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/pages/order-detail/index.vue'),
    'utf-8',
  );

  expect(source).toContain('packagePlan');
  expect(source).toContain('分装明细');
});
```

- [ ] **Step 2: Add packagePlan types**

Where order item interfaces currently contain:

```ts
packageCount: number
packageSpecG: number
```

Add:

```ts
packagePlan?: Array<{ packageSpecG: number; packageCount: number }>
ingredientSourcePlan?: string | null
```

- [ ] **Step 3: Add display helper**

In each page that displays one package spec, add:

```ts
function formatPackagePlan(item: {
  packagePlan?: Array<{ packageSpecG: number; packageCount: number }>
  packageSpecG?: number
  packageCount?: number
}): string {
  if (item.packagePlan && item.packagePlan.length > 0) {
    return item.packagePlan
      .map(row => `${row.packageSpecG}g×${row.packageCount}袋`)
      .join('，')
  }
  return `${item.packageSpecG || 0}g×${item.packageCount || 0}袋`
}
```

Use this helper where the UI currently shows only `{{ item.packageSpecG }}g/餐` and `{{ item.packageCount }}餐`.

- [ ] **Step 4: Run miniapp regression tests**

Run:

```bash
cd miniapp && npm run test -- src/pages/order-detail.regression.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add miniapp/src/pages/order-detail/index.vue miniapp/src/pages/orders-list/index.vue miniapp/src/pages/staff-production/print-task.vue miniapp/src/pages/staff-production/print-label.vue miniapp/src/pages/order-detail.regression.spec.ts
git commit -m "feat: display package plans on order screens"
```

## Task 10: Full Verification And Miniapp Preview

**Files:**
- No source files unless tests reveal defects.

- [ ] **Step 1: Run backend focused tests**

Run:

```bash
cd backend && npm test -- tests/domain/order/order-package-plan.spec.ts tests/domain/order/ingredient-source-plan.spec.ts tests/application/order/order.service.spec.ts tests/interfaces/controllers/orders.controller.spec.ts tests/domain/pricing/pricing-supplement-resolver.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 2: Run backend build**

Run:

```bash
cd backend && npm run build
```

Expected: PASS and Nest build completes without TypeScript errors.

- [ ] **Step 3: Run miniapp tests**

Run:

```bash
cd miniapp && npm run test
```

Expected: PASS.

- [ ] **Step 4: Run miniapp preview build**

Run:

```bash
cd miniapp && npm run preview
```

Expected: build output exists at:

```text
miniapp/dist/dev/mp-weixin
```

- [ ] **Step 5: Sync unified preview directory**

Run:

```bash
rm -rf /Users/zhaochen/Documents/SevenKitchen-miniapp-preview
mkdir -p /Users/zhaochen/Documents/SevenKitchen-miniapp-preview
cp -R miniapp/dist/dev/mp-weixin/. /Users/zhaochen/Documents/SevenKitchen-miniapp-preview/
```

Expected: `/Users/zhaochen/Documents/SevenKitchen-miniapp-preview/app.json` exists.

- [ ] **Step 6: Manual smoke test in WeChat Developer Tools**

Open:

```text
/Users/zhaochen/Documents/SevenKitchen-miniapp-preview
```

Smoke path:

```text
食谱详情 -> 订购成品 -> 选择狗狗 -> 默认 15 天 -> 查看饭量计算 -> 切换三档原料方案 -> 修改分装明细 -> 总量低于 1kg 时不能下单 -> 总量高于 1kg 时生成价格 -> 进入确认页 -> 提交订单 -> 订单详情显示分装明细
```

- [ ] **Step 7: Final commit if verification fixes were needed**

If verification required fixes, commit them:

```bash
git add backend miniapp
git commit -m "fix: stabilize order config phase one"
```

Expected: no uncommitted backend/miniapp source changes remain except intentionally generated preview output ignored by git.

## Implementation Notes

- Keep `packageCount` and `packageSpecG` as compatibility summary fields. Do not remove them in phase one.
- Use `packagePlan` as the source of truth for new orders.
- Keep `dailyIntakeG` as recommendation/reference data. It is not the hard order total.
- The hard order total is `sum(packageSpecG * packageCount)`.
- The only minimum-order constraint is `totalGrams >= 1000`.
- `ingredientSourcePlan` is customer-facing and must be stored in pricing snapshot params.
- Source plan is described as expected sourcing, not an absolute guarantee.
- Do not use `adminRemark` for special add-ons or special packaging.
- Do not rework procurement shortage, settlement adjustment, or production completion in this phase.

## Self-Review Checklist

- Spec coverage:
  - Customer sees plain feeding calculation: Task 7.
  - No quick meal adjustment: Task 7 regression test.
  - Three source plans affect pricing: Tasks 2 and 5.
  - Product intro image block: Task 7.
  - Fixed bottom price/action: Task 7 and Task 8.
  - Default 7/15/30 cycles: Task 6 and Task 7.
  - Custom package plan: Tasks 1, 3, 4, 6, 7, 8.
  - 1kg minimum: Tasks 4, 6, 7.
  - Snapshot persistence: Tasks 3 and 4.

- Placeholder scan:
  - No unresolved placeholder markers.
  - No empty “add tests” instructions without file names or commands.
  - No direct database operations; schema change uses Prisma migration SQL.

- Type consistency:
  - Backend uses `packagePlan`, `packageSpecG`, `packageCount`, `ingredientSourcePlan`.
  - Miniapp uses the same request field names.
  - Compatibility fields remain available for old screens.
