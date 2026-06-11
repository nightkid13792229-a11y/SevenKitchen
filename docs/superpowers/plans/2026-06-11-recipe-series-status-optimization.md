# Recipe Series Status Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move public/private/draft business status to recipe series, introduce stable per-life-stage status, and add editor revert-to-official behavior.

**Architecture:** Add `RecipeSeries.businessStatus` as the source of truth for series-level business visibility while keeping `Recipe.status` as version-level compatibility data. Centralize life-stage status derivation in backend services, then consume those stable fields in the miniapp and admin web UI.

**Tech Stack:** NestJS, Prisma, PostgreSQL, Jest, Vue 3, Element Plus, Uni-app, Vitest.

---

## File Structure

### Backend Schema And Domain

- Modify: `backend/prisma/schema.prisma`
  - Add `RecipeSeriesBusinessStatus`.
  - Add `businessStatus` to `RecipeSeries`.
- Create: `backend/prisma/migrations/20260611090000_add_recipe_series_business_status/migration.sql`
  - Add enum and column.
  - Backfill from existing `recipe.status`.
- Modify: `backend/src/domain/recipe/recipe-series.ts`
  - Add `SUBMITTED` to `RecipeSeriesStageStatus`.
  - Export label maps for series business status if useful.
- Modify: `backend/src/interfaces/dto/recipe-designer/recipe-designer.dto.ts`
  - Add API-level type support for `SUBMITTED` and series business status filters.
- Modify: `backend/src/interfaces/dto/recipes/admin-recipe.dto.ts`
  - Add `seriesBusinessStatus`, `seriesBusinessStatusLabel`, and `SUBMITTED`.

### Backend Services And Controllers

- Modify: `backend/src/application/recipe-designer/recipe-designer.service.ts`
  - Return `businessStatus`.
  - Derive `NOT_DESIGNED / MODIFIED / SUBMITTED / PUBLISHED / PRIVATE_CUSTOM`.
  - Add `revertDraftToLatestOfficial`.
- Modify: `backend/src/interfaces/controllers/recipe-designer.controller.ts`
  - Add `POST /api/v1/recipe-designer/drafts/:id/revert-to-latest-official`.
- Modify: `backend/src/application/recipe/recipe.service.ts`
  - Return series business status for admin recipes.
  - Sync `RecipeSeries.businessStatus` when publishing, unpublishing, or saving a private custom stage.
  - Derive admin stage `SUBMITTED`.
- Modify: `backend/src/infrastructure/repositories/prisma-recipe.repository.ts`
  - Exclude recipes from non-public series in public list/filter/ingredient source queries.
- Modify: `backend/src/interfaces/controllers/recipes.controller.ts`
  - Exclude non-public series from recommendation and public series detail queries that bypass the repository.
- Modify: `backend/src/interfaces/controllers/admin.controller.ts`
  - Keep existing recipe routes working.
  - Add explicit series-level actions only if they can reuse the same service logic cleanly.

### Tests

- Modify: `backend/tests/application/recipe-designer/recipe-designer.service.spec.ts`
  - Cover empty draft, modified draft, submitted backend draft, published stage, private custom stage, and revert.
- Create or modify: `backend/tests/application/recipe/recipe.service.spec.ts`
  - Cover admin list/status derivation and series business status sync.
- Modify: `backend/tests/infrastructure/repositories/prisma-recipe.repository.spec.ts`
  - Cover public recipe query visibility for standalone recipes and `PUBLIC` series only.
- Modify: `backend/tests/interfaces/controllers/recipes.controller.spec.ts`
  - Cover public recommendation and series detail queries excluding `DRAFT` and `PRIVATE_CUSTOM` series.
- Modify: `miniapp/src/api/recipe-designer.spec.ts`
  - Cover new status type fields and revert endpoint.
- Modify: `miniapp/src/pages/recipe-designer.regression.spec.ts`
  - Cover labels and editor revert affordance.

### Miniapp

- Modify: `miniapp/src/api/recipe-designer.ts`
  - Add `SUBMITTED`.
  - Add `businessStatus` fields.
  - Add `revertToLatestOfficial`.
- Modify: `miniapp/src/pages/recipe-designer/list.vue`
  - Show series overall status.
  - Rename private label to “私密定制”.
  - Show `SUBMITTED` as “已提交”.
- Modify: `miniapp/src/pages/recipe-designer/editor.vue`
  - Add explicit “撤回修改” action separate from history undo.
  - Call revert endpoint and reload editor state.

### Admin Web

- Modify: `admin-web/src/types/recipe.ts`
  - Add `RecipeSeriesBusinessStatus`.
  - Add `SUBMITTED` stage status.
- Modify: `admin-web/src/views/Recipes/index.vue`
  - Show series business status for series rows.
  - Show stage `SUBMITTED` as “已提交”.
  - Keep publish/unpublish actions targeting concrete recipe versions.
- Modify: `admin-web/src/views/Recipes/RecipeForm.vue`
  - Show series business status in the series context block.
  - Keep current stage status editable for compatibility.

---

### Task 1: Add Series Business Status To Prisma Schema

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260611090000_add_recipe_series_business_status/migration.sql`

- [ ] **Step 1: Write the migration SQL**

Create `backend/prisma/migrations/20260611090000_add_recipe_series_business_status/migration.sql`:

```sql
CREATE TYPE "RecipeSeriesBusinessStatus" AS ENUM ('DRAFT', 'PUBLIC', 'PRIVATE_CUSTOM');

ALTER TABLE "recipe_series"
  ADD COLUMN "business_status" "RecipeSeriesBusinessStatus" NOT NULL DEFAULT 'DRAFT';

UPDATE "recipe_series" AS series
SET "business_status" = 'PRIVATE_CUSTOM'
WHERE EXISTS (
  SELECT 1
  FROM "recipe" AS recipe
  WHERE recipe."series_id" = series."id"
    AND recipe."status" = 'PRIVATE_CUSTOM'
);

UPDATE "recipe_series" AS series
SET "business_status" = 'PUBLIC'
WHERE series."business_status" = 'DRAFT'
  AND EXISTS (
    SELECT 1
    FROM "recipe" AS recipe
    WHERE recipe."series_id" = series."id"
      AND recipe."status" = 'PUBLIC'
  );

CREATE INDEX "recipe_series_business_status_idx"
  ON "recipe_series"("business_status");
```

- [ ] **Step 2: Update Prisma schema**

In `backend/prisma/schema.prisma`, update `RecipeSeries`:

```prisma
model RecipeSeries {
  id             String                     @id @default(uuid()) @map("id")
  name           String                     @map("name") @db.VarChar(200)
  status         RecipeSeriesStatus         @default(ACTIVE) @map("status")
  businessStatus RecipeSeriesBusinessStatus @default(DRAFT) @map("business_status")
  deletedAt      DateTime?                  @map("deleted_at")
  deletedBy      String?                    @map("deleted_by")
  createdBy      String?                    @map("created_by")
  createdAt      DateTime                   @default(now()) @map("created_at")
  updatedAt      DateTime                   @updatedAt @map("updated_at")
  recipes        Recipe[]
  designs        DesignRecipe[]

  @@index([status])
  @@index([businessStatus])
  @@index([updatedAt])
  @@map("recipe_series")
}
```

Add the enum near `RecipeSeriesStatus`:

```prisma
enum RecipeSeriesBusinessStatus {
  DRAFT
  PUBLIC
  PRIVATE_CUSTOM
}
```

- [ ] **Step 3: Validate Prisma schema**

Run:

```bash
cd backend && npx prisma validate
```

Expected: Prisma schema validation succeeds.

- [ ] **Step 4: Generate Prisma client**

Run:

```bash
cd backend && npx prisma generate
```

Expected: Prisma Client generation succeeds and `RecipeSeriesBusinessStatus` is available from `@prisma/client`.

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260611090000_add_recipe_series_business_status/migration.sql
git commit -m "feat: add recipe series business status"
```

---

### Task 2: Update Shared Backend Types And DTOs

**Files:**
- Modify: `backend/src/domain/recipe/recipe-series.ts`
- Modify: `backend/src/interfaces/dto/recipe-designer/recipe-designer.dto.ts`
- Modify: `backend/src/interfaces/dto/recipes/admin-recipe.dto.ts`

- [ ] **Step 1: Add `SUBMITTED` to domain stage status**

In `backend/src/domain/recipe/recipe-series.ts`, update `RecipeSeriesStageStatus`:

```ts
export type RecipeSeriesStageStatus =
  | 'NOT_DESIGNED'
  | 'MODIFIED'
  | 'SUBMITTED'
  | 'PUBLISHED'
  | 'PRIVATE_CUSTOM';
```

Keep `IN_REVIEW` and `NEEDS_CHANGES` out of the externally displayed stage status. Assessment review state can remain inside `DesignRecipe.status` and `DesignRecipe.reviewStatus`.

- [ ] **Step 2: Add business status labels**

In the same file, export a small label map:

```ts
export const RECIPE_SERIES_BUSINESS_STATUS_LABELS: Record<string, string> = {
  DRAFT: '草稿',
  PUBLIC: '已发布',
  PRIVATE_CUSTOM: '私密定制',
};
```

- [ ] **Step 3: Update recipe-designer DTO filters**

In `backend/src/interfaces/dto/recipe-designer/recipe-designer.dto.ts`, keep the filter values aligned with series business status:

```ts
export const RECIPE_DESIGNER_SERIES_STATUS_FILTERS = [
  'DRAFT',
  'PUBLIC',
  'PRIVATE_CUSTOM',
] as const;
```

Add exported response helper types if this DTO file already hosts response types in the final code shape:

```ts
export const RECIPE_DESIGNER_SERIES_STAGE_STATUSES = [
  'NOT_DESIGNED',
  'MODIFIED',
  'SUBMITTED',
  'PUBLISHED',
  'PRIVATE_CUSTOM',
] as const;

export type RecipeDesignerSeriesStageStatus =
  (typeof RECIPE_DESIGNER_SERIES_STAGE_STATUSES)[number];
```

- [ ] **Step 4: Update admin recipe DTOs**

In `backend/src/interfaces/dto/recipes/admin-recipe.dto.ts`, change `RecipeSeriesStageSummaryDto.status`:

```ts
export interface RecipeSeriesStageSummaryDto {
  lifeStage: string;
  label: string;
  status:
    | 'NOT_DESIGNED'
    | 'MODIFIED'
    | 'SUBMITTED'
    | 'PUBLISHED'
    | 'PRIVATE_CUSTOM';
  recipeVersionId?: string;
  recipeId?: string;
  version?: number;
  updatedAt?: string;
}
```

Add series business fields to `RecipeSummaryResponseDto`:

```ts
export interface RecipeSummaryResponseDto {
  id: string;
  recipeId?: string;
  seriesId?: string;
  seriesName?: string;
  seriesBusinessStatus?: 'DRAFT' | 'PUBLIC' | 'PRIVATE_CUSTOM';
  seriesBusinessStatusLabel?: string;
  seriesLifeStage?: string;
  seriesLifeStageLabel?: string;
  name: string;
  version: number;
  status: RecipeStatus;
  coverImageUrl?: string;
  coverTitle?: string;
  energyDensityKcalPerKg: number;
  applicableLifeStages: LifeStage[];
  targetHealthTags: RecipeHealthTag[];
  salesCount: number;
  diyGenCount: number;
  likeCount: number;
  favoriteCount: number;
  designSource?: string;
  createdAt: string;
  updatedAt: string;
  currentPublicVersion?: RecipeVersionSummaryDto;
  pendingDraftVersion?: RecipeVersionSummaryDto;
  versionHistory?: RecipeVersionSummaryDto[];
  seriesStages?: RecipeSeriesStageSummaryDto[];
}
```

- [ ] **Step 5: Run backend type-focused tests**

Run:

```bash
cd backend && npm test -- --runInBand tests/application/recipe-designer/recipe-designer.service.spec.ts
```

Expected before implementation tasks: tests may still fail if they reference service behavior not yet updated. TypeScript should compile far enough to show real behavior failures, not missing exported type errors.

- [ ] **Step 6: Commit**

```bash
git add backend/src/domain/recipe/recipe-series.ts backend/src/interfaces/dto/recipe-designer/recipe-designer.dto.ts backend/src/interfaces/dto/recipes/admin-recipe.dto.ts
git commit -m "feat: define recipe series status contracts"
```

---

### Task 3: Implement Recipe Designer Series Status Derivation

**Files:**
- Modify: `backend/src/application/recipe-designer/recipe-designer.service.ts`
- Modify: `backend/tests/application/recipe-designer/recipe-designer.service.spec.ts`

- [ ] **Step 1: Write failing tests for stage status derivation**

In `backend/tests/application/recipe-designer/recipe-designer.service.spec.ts`, add a describe block that calls `listSeries` with mocked `recipeSeries.findMany`.

Use this shape:

```ts
describe('recipe series business and stage statuses', () => {
  it('returns NOT_DESIGNED for an empty default design draft', async () => {
    prisma.recipeSeries.findMany.mockResolvedValue([
      {
        id: 'series-1',
        name: '鸡肉系列',
        status: 'ACTIVE',
        businessStatus: 'DRAFT',
        deletedAt: null,
        deletedBy: null,
        createdBy: 'staff-1',
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
        updatedAt: new Date('2026-06-02T00:00:00.000Z'),
        designs: [
          {
            id: 'design-empty',
            name: '鸡肉系列',
            status: 'DRAFT',
            reviewStatus: 'NONE',
            publishedRecipeId: null,
            publishedAt: null,
            seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
            fediafDogScenario: 'ADULT_MER_110',
            updatedAt: new Date('2026-06-02T00:00:00.000Z'),
            items: [],
          },
        ],
        recipes: [],
      },
    ]);

    const result = await service.listSeries({ userId: 'staff-1', role: 'STAFF' });

    expect(result[0]).toMatchObject({
      businessStatus: 'DRAFT',
      businessStatusLabel: '草稿',
    });
    expect(
      result[0].stages.find((stage: any) => stage.lifeStage === 'HIGH_ACTIVITY_ADULT'),
    ).toMatchObject({
      status: 'NOT_DESIGNED',
      recipeStatusCategory: 'DRAFT',
    });
  });

  it('returns MODIFIED for a design draft with at least one item and no backend recipe draft', async () => {
    prisma.recipeSeries.findMany.mockResolvedValue([
      buildSeriesRecord({
        businessStatus: 'DRAFT',
        designs: [
          buildDesignRecord({
            id: 'design-modified',
            seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
            items: [{ id: 'item-1' }],
          }),
        ],
        recipes: [],
      }),
    ]);

    const result = await service.listSeries({ userId: 'staff-1', role: 'STAFF' });

    expect(
      result[0].stages.find((stage: any) => stage.lifeStage === 'HIGH_ACTIVITY_ADULT'),
    ).toMatchObject({ status: 'MODIFIED' });
  });

  it('returns SUBMITTED for a stage with a backend recipe DRAFT version', async () => {
    prisma.recipeSeries.findMany.mockResolvedValue([
      buildSeriesRecord({
        businessStatus: 'DRAFT',
        designs: [],
        recipes: [
          buildRecipeRecord({
            id: 'recipe-draft-row',
            recipeId: 'recipe-business-id',
            status: 'DRAFT',
            seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
          }),
        ],
      }),
    ]);

    const result = await service.listSeries({ userId: 'staff-1', role: 'STAFF' });

    expect(
      result[0].stages.find((stage: any) => stage.lifeStage === 'HIGH_ACTIVITY_ADULT'),
    ).toMatchObject({ status: 'SUBMITTED' });
  });

  it('prioritizes PRIVATE_CUSTOM over public or submitted stage versions', async () => {
    prisma.recipeSeries.findMany.mockResolvedValue([
      buildSeriesRecord({
        businessStatus: 'PRIVATE_CUSTOM',
        designs: [],
        recipes: [
          buildRecipeRecord({ status: 'PUBLIC', seriesLifeStage: 'HIGH_ACTIVITY_ADULT' }),
          buildRecipeRecord({ status: 'PRIVATE_CUSTOM', seriesLifeStage: 'HIGH_ACTIVITY_ADULT' }),
        ],
      }),
    ]);

    const result = await service.listSeries({ userId: 'staff-1', role: 'STAFF' });

    expect(result[0]).toMatchObject({
      businessStatus: 'PRIVATE_CUSTOM',
      businessStatusLabel: '私密定制',
    });
    expect(
      result[0].stages.find((stage: any) => stage.lifeStage === 'HIGH_ACTIVITY_ADULT'),
    ).toMatchObject({ status: 'PRIVATE_CUSTOM' });
  });
});
```

Add helpers in the same spec file if equivalent helpers do not already exist:

```ts
function buildSeriesRecord(overrides: Record<string, any> = {}) {
  return {
    id: 'series-1',
    name: '鸡肉系列',
    status: 'ACTIVE',
    businessStatus: 'DRAFT',
    deletedAt: null,
    deletedBy: null,
    createdBy: 'staff-1',
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    updatedAt: new Date('2026-06-02T00:00:00.000Z'),
    designs: [],
    recipes: [],
    ...overrides,
  };
}

function buildDesignRecord(overrides: Record<string, any> = {}) {
  return {
    id: 'design-1',
    name: '鸡肉系列',
    status: 'DRAFT',
    reviewStatus: 'NONE',
    publishedRecipeId: null,
    publishedAt: null,
    seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
    fediafDogScenario: 'ADULT_MER_110',
    updatedAt: new Date('2026-06-02T00:00:00.000Z'),
    items: [{ id: 'item-1' }],
    ...overrides,
  };
}

function buildRecipeRecord(overrides: Record<string, any> = {}) {
  return {
    id: 'recipe-row-1',
    recipeId: 'recipe-business-id',
    name: '鸡肉系列',
    version: 1,
    status: 'DRAFT',
    seriesId: 'series-1',
    seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
    applicableLifeStages: ['HIGH_ACTIVITY_ADULT'],
    updatedAt: new Date('2026-06-03T00:00:00.000Z'),
    createdAt: new Date('2026-06-03T00:00:00.000Z'),
    ...overrides,
  };
}
```

- [ ] **Step 2: Run tests and confirm failure**

Run:

```bash
cd backend && npm test -- --runInBand tests/application/recipe-designer/recipe-designer.service.spec.ts
```

Expected: tests fail because `businessStatus` is absent from response, empty drafts still count as modified, and `Recipe.status = DRAFT` maps to `DRAFT` rather than `SUBMITTED`.

- [ ] **Step 3: Update service imports**

In `backend/src/application/recipe-designer/recipe-designer.service.ts`, import the new enum and labels:

```ts
import {
  DesignRecipeReviewStatus,
  DesignRecipeStatus,
  FediafDogScenario,
  IngredientType,
  NutritionFoodStatus,
  Prisma,
  RecipeSeriesBusinessStatus,
  RecipeSeriesStatus,
  RecipeStatus,
  UserRole,
} from '@prisma/client';
```

Add `RECIPE_SERIES_BUSINESS_STATUS_LABELS` to the existing recipe-series import:

```ts
import {
  ORDERED_RECIPE_SERIES_LIFE_STAGES,
  RECIPE_SERIES_BUSINESS_STATUS_LABELS,
  SERIES_LIFE_STAGE_LABELS,
  mapScenarioToSeriesLifeStage,
  mapSeriesLifeStageToScenario,
} from '../../domain/recipe/recipe-series';
```

- [ ] **Step 4: Include business status in card response**

In `buildSeriesWorkbenchCard`, add:

```ts
const businessStatus =
  series.businessStatus ?? RecipeSeriesBusinessStatus.DRAFT;

return {
  id: series.id,
  name: series.name,
  businessStatus,
  businessStatusLabel:
    RECIPE_SERIES_BUSINESS_STATUS_LABELS[businessStatus] ?? businessStatus,
  updatedAt: series.updatedAt,
  publishedStageCount,
  stages,
};
```

- [ ] **Step 5: Derive effective stage status**

Replace `resolveSeriesStageStatus` with this business derivation:

```ts
private resolveSeriesStageStatus(
  effectiveDesigns: RecipeSeriesWorkbenchRecord['designs'],
  recipes: RecipeSeriesWorkbenchRecord['recipes'],
): RecipeSeriesStageStatus {
  if (recipes.some((recipe) => recipe.status === RecipeStatus.PRIVATE_CUSTOM)) {
    return 'PRIVATE_CUSTOM';
  }
  if (recipes.some((recipe) => recipe.status === RecipeStatus.PUBLIC)) {
    return 'PUBLISHED';
  }
  if (recipes.some((recipe) => recipe.status === RecipeStatus.DRAFT)) {
    return 'SUBMITTED';
  }
  if (effectiveDesigns.some((design) => this.hasDesignRecipeItems(design))) {
    return 'MODIFIED';
  }
  return 'NOT_DESIGNED';
}
```

Add the helper:

```ts
private hasDesignRecipeItems(
  design: Pick<DesignRecipeWithItems, 'items'> | { items?: unknown[] },
): boolean {
  return Array.isArray(design.items) && design.items.length > 0;
}
```

- [ ] **Step 6: Align status category filters with series business status**

Replace `filterSeriesWorkbenchCards` to filter by `businessStatus`:

```ts
private filterSeriesWorkbenchCards<
  T extends { businessStatus?: RecipeDesignerSeriesStatusFilter },
>(cards: T[], status?: ListRecipeDesignerSeriesDto['status']): T[] {
  if (!status) {
    return cards;
  }

  return cards.filter((card) => card.businessStatus === status);
}
```

Keep `recipeStatusCategory` in stage objects during migration. Populate it from the stage status:

```ts
const recipeStatusCategory =
  status === 'PRIVATE_CUSTOM'
    ? 'PRIVATE_CUSTOM'
    : status === 'PUBLISHED'
      ? 'PUBLIC'
      : status === 'NOT_DESIGNED'
        ? 'NOT_DESIGNED'
        : 'DRAFT';
```

- [ ] **Step 7: Run focused backend tests**

Run:

```bash
cd backend && npm test -- --runInBand tests/application/recipe-designer/recipe-designer.service.spec.ts
```

Expected: recipe designer service tests pass.

- [ ] **Step 8: Commit**

```bash
git add backend/src/application/recipe-designer/recipe-designer.service.ts backend/tests/application/recipe-designer/recipe-designer.service.spec.ts
git commit -m "feat: derive recipe designer series statuses"
```

---

### Task 4: Implement Admin Recipe Series Status Sync

**Files:**
- Modify: `backend/src/application/recipe/recipe.service.ts`
- Create or modify: `backend/tests/application/recipe/recipe.service.spec.ts`

- [ ] **Step 1: Write failing tests for admin series rows**

Create or extend `backend/tests/application/recipe/recipe.service.spec.ts`:

```ts
describe('RecipeService series business status', () => {
  it('maps series business status onto admin list rows', async () => {
    prisma.recipe.findMany.mockResolvedValue([
      buildRecipe({
        id: 'recipe-1',
        status: 'DRAFT',
        series: {
          id: 'series-1',
          name: '鸡肉系列',
          businessStatus: 'DRAFT',
        },
      }),
    ]);

    const result = await service.getAllRecipes({ page: 1, pageSize: 20 });

    expect(result.data[0]).toMatchObject({
      seriesBusinessStatus: 'DRAFT',
      seriesBusinessStatusLabel: '草稿',
    });
  });

  it('marks recipe DRAFT stage as SUBMITTED in admin series stages', async () => {
    prisma.recipe.findMany.mockResolvedValue([
      buildRecipe({
        id: 'recipe-1',
        status: 'DRAFT',
        seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
      }),
    ]);

    const result = await service.getAllRecipes({ page: 1, pageSize: 20 });

    expect(
      result.data[0].seriesStages?.find(
        (stage) => stage.lifeStage === 'HIGH_ACTIVITY_ADULT',
      ),
    ).toMatchObject({ status: 'SUBMITTED' });
  });
});
```

Use the existing mock setup pattern in the file. If this spec file does not exist, instantiate `RecipeService` with a mocked Prisma object:

```ts
const prisma = {
  recipe: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  recipeSeries: {
    update: jest.fn(),
  },
  recipeHealthTagAssignment: {
    createMany: jest.fn(),
    deleteMany: jest.fn(),
  },
  recipeItem: {
    deleteMany: jest.fn(),
    findMany: jest.fn(),
  },
  preparationMethod: {
    findMany: jest.fn(),
  },
} as any;
```

- [ ] **Step 2: Run tests and confirm failure**

Run:

```bash
cd backend && npm test -- --runInBand tests/application/recipe/recipe.service.spec.ts
```

Expected: tests fail because admin rows do not expose `seriesBusinessStatus`, and DRAFT stage rows still show `DRAFT`.

- [ ] **Step 3: Add labels and mapping to RecipeService**

In `backend/src/application/recipe/recipe.service.ts`, import:

```ts
import { RecipeSeriesBusinessStatus } from '@prisma/client';
import {
  ORDERED_RECIPE_SERIES_LIFE_STAGES,
  RECIPE_SERIES_BUSINESS_STATUS_LABELS,
  SERIES_LIFE_STAGE_LABELS,
} from '../../domain/recipe/recipe-series';
```

In `mapToSummaryDto`, add:

```ts
const seriesBusinessStatus =
  recipe.series?.businessStatus ?? undefined;

return {
  id: recipe.id,
  recipeId: recipe.recipeId,
  seriesId: recipe.seriesId || undefined,
  seriesName: recipe.series?.name || undefined,
  seriesBusinessStatus,
  seriesBusinessStatusLabel: seriesBusinessStatus
    ? RECIPE_SERIES_BUSINESS_STATUS_LABELS[seriesBusinessStatus] ??
      seriesBusinessStatus
    : undefined,
  seriesLifeStage: recipe.seriesLifeStage || undefined,
  seriesLifeStageLabel: recipe.seriesLifeStage
    ? SERIES_LIFE_STAGE_LABELS[
        recipe.seriesLifeStage as keyof typeof SERIES_LIFE_STAGE_LABELS
      ] || recipe.seriesLifeStage
    : undefined,
  ...
};
```

- [ ] **Step 4: Update admin stage status derivation**

Replace the `stageRecipe` selection in `buildRecipeSeriesStageSummaries` with explicit priority:

```ts
const privateCustomRecipe = this.findNewestRecipeByStatus(
  stageRecipes,
  RecipeStatus.PRIVATE_CUSTOM,
);
const publicRecipe = this.findNewestRecipeByStatus(
  stageRecipes,
  RecipeStatus.PUBLIC,
);
const submittedRecipe = this.findNewestRecipeByStatus(
  stageRecipes,
  RecipeStatus.DRAFT,
);
const stageRecipe =
  privateCustomRecipe ??
  publicRecipe ??
  submittedRecipe ??
  [...stageRecipes].sort((left, right) =>
    this.compareRecipeVersionThenUpdatedAt(right, left),
  )[0];
```

Map `RecipeStatus.DRAFT` to `SUBMITTED`:

```ts
const stageStatus =
  stageRecipe.status === RecipeStatus.PRIVATE_CUSTOM
    ? 'PRIVATE_CUSTOM'
    : stageRecipe.status === RecipeStatus.PUBLIC
      ? 'PUBLISHED'
      : stageRecipe.status === RecipeStatus.DRAFT
        ? 'SUBMITTED'
        : 'NOT_DESIGNED';
```

Return:

```ts
return {
  lifeStage,
  label: SERIES_LIFE_STAGE_LABELS[lifeStage],
  status: stageStatus as RecipeSeriesStageSummaryDto['status'],
  recipeVersionId: stageRecipe.id,
  recipeId: stageRecipe.recipeId,
  version: stageRecipe.version,
  updatedAt: stageRecipe.updatedAt.toISOString(),
};
```

- [ ] **Step 5: Sync series business status on recipe status changes**

Add helper methods to `RecipeService`:

```ts
private async syncSeriesBusinessStatus(seriesId?: string | null): Promise<void> {
  if (!seriesId) {
    return;
  }

  const recipes = await this.prisma.recipe.findMany({
    where: { seriesId },
    select: { status: true },
  });

  const businessStatus = recipes.some(
    (recipe) => recipe.status === RecipeStatus.PRIVATE_CUSTOM,
  )
    ? RecipeSeriesBusinessStatus.PRIVATE_CUSTOM
    : recipes.some((recipe) => recipe.status === RecipeStatus.PUBLIC)
      ? RecipeSeriesBusinessStatus.PUBLIC
      : RecipeSeriesBusinessStatus.DRAFT;

  await this.prisma.recipeSeries.update({
    where: { id: seriesId },
    data: { businessStatus },
  });
}
```

Call it after:

- `updateRecipe` when `dto.status` changes a recipe in a series.
- `publishRecipe` after updating status to `PUBLIC`.
- `unpublishRecipe` after updating status to `DRAFT`.
- `deleteRecipe` after deleting a recipe from a series.

Use this pattern:

```ts
await this.syncSeriesBusinessStatus(updated.seriesId);
```

- [ ] **Step 6: Run focused admin backend tests**

Run:

```bash
cd backend && npm test -- --runInBand tests/application/recipe/recipe.service.spec.ts
```

Expected: recipe service tests pass.

- [ ] **Step 7: Run combined backend status tests**

Run:

```bash
cd backend && npm test -- --runInBand tests/application/recipe-designer/recipe-designer.service.spec.ts tests/application/recipe/recipe.service.spec.ts
```

Expected: both suites pass.

- [ ] **Step 8: Commit**

```bash
git add backend/src/application/recipe/recipe.service.ts backend/tests/application/recipe/recipe.service.spec.ts
git commit -m "feat: sync admin recipe series statuses"
```

---

### Task 5: Filter Public Recipe Surfaces By Series Business Status

**Files:**
- Modify: `backend/src/infrastructure/repositories/prisma-recipe.repository.ts`
- Modify: `backend/src/interfaces/controllers/recipes.controller.ts`
- Modify: `backend/tests/infrastructure/repositories/prisma-recipe.repository.spec.ts`
- Modify: `backend/tests/interfaces/controllers/recipes.controller.spec.ts`

- [ ] **Step 1: Write failing repository visibility test**

In `backend/tests/infrastructure/repositories/prisma-recipe.repository.spec.ts`, add:

```ts
it('queries public showcase recipes only from standalone recipes or PUBLIC series', async () => {
  const prisma = {
    recipe: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  const repository = new PrismaRecipeRepository(prisma as any);

  await repository.findPublicRecipesPaginated({
    page: 1,
    pageSize: 10,
  });

  expect(prisma.recipe.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        status: 'PUBLIC',
        AND: expect.arrayContaining([
          {
            OR: [
              { seriesId: null },
              { series: { is: { businessStatus: 'PUBLIC' } } },
            ],
          },
        ]),
      }),
    }),
  );
});
```

Add the same expectation for `findPublicRecipes` and `getFilterOptions`, because all three feed user-facing public recipe discovery.

- [ ] **Step 2: Write failing controller visibility tests**

In `backend/tests/interfaces/controllers/recipes.controller.spec.ts`, add focused tests around the direct Prisma public queries:

```ts
it('filters recommendation source recipes to standalone recipes or PUBLIC series', async () => {
  await controller.getRecommendationsForDog('dog-1', mockUser);

  expect(prisma.recipe.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        status: 'PUBLIC',
        AND: expect.arrayContaining([
          {
            OR: [
              { seriesId: null },
              { series: { is: { businessStatus: 'PUBLIC' } } },
            ],
          },
        ]),
      }),
    }),
  );
});
```

Add a second test for `loadPublicSeriesRecipes` through the public detail endpoint. The assertion should confirm that the first candidate query applies both the requested series/recipe selector and the series business-status visibility guard:

```ts
expect(prisma.recipe.findMany).toHaveBeenCalledWith(
  expect.objectContaining({
    where: expect.objectContaining({
      status: 'PUBLIC',
      OR: [{ seriesId: 'series-1' }, { recipeId: 'series-1' }],
      AND: expect.arrayContaining([
        {
          OR: [
            { seriesId: null },
            { series: { is: { businessStatus: 'PUBLIC' } } },
          ],
        },
      ]),
    }),
  }),
);
```

- [ ] **Step 3: Add repository public visibility helper**

In `backend/src/infrastructure/repositories/prisma-recipe.repository.ts`, update the import:

```ts
import {
  Prisma,
  RecipeSeriesBusinessStatus,
  RecipeStatus,
} from '@prisma/client';
```

Add helper methods to `PrismaRecipeRepository`:

```ts
private buildPublicRecipeWhere(
  extra: Prisma.RecipeWhereInput = {},
): Prisma.RecipeWhereInput {
  const extraAnd = Array.isArray(extra.AND)
    ? extra.AND
    : extra.AND
      ? [extra.AND]
      : [];

  return {
    ...extra,
    status: RecipeStatus.PUBLIC,
    AND: [
      ...extraAnd,
      this.buildPublicSeriesVisibilityWhere(),
    ],
  };
}

private buildPublicSeriesVisibilityWhere(): Prisma.RecipeWhereInput {
  return {
    OR: [
      { seriesId: null },
      {
        series: {
          is: {
            businessStatus: RecipeSeriesBusinessStatus.PUBLIC,
          },
        },
      },
    ],
  };
}
```

Use `this.buildPublicRecipeWhere()` in:

- `findPublicRecipes`
- `findPublicRecipesPaginated`
- `getFilterOptions`
- `buildIngredientGroups`, inside `recipeItems.some.recipe`

For example:

```ts
const where = this.buildPublicRecipeWhere();
```

And for ingredient groups:

```ts
recipeItems: {
  some: {
    recipe: this.buildPublicRecipeWhere(),
  },
},
```

- [ ] **Step 4: Add controller public visibility helper**

In `backend/src/interfaces/controllers/recipes.controller.ts`, add:

```ts
import { Prisma, RecipeSeriesBusinessStatus } from '@prisma/client';
```

Add a private helper to `RecipesController`:

```ts
private buildPublicRecipeWhere(
  extra: Prisma.RecipeWhereInput = {},
): Prisma.RecipeWhereInput {
  const extraAnd = Array.isArray(extra.AND)
    ? extra.AND
    : extra.AND
      ? [extra.AND]
      : [];

  return {
    ...extra,
    status: RecipeStatus.PUBLIC,
    AND: [
      ...extraAnd,
      {
        OR: [
          { seriesId: null },
          {
            series: {
              is: {
                businessStatus: RecipeSeriesBusinessStatus.PUBLIC,
              },
            },
          },
        ],
      },
    ],
  };
}
```

Replace direct public queries:

```ts
where: { status: 'PUBLIC' },
```

with:

```ts
where: this.buildPublicRecipeWhere(),
```

Replace series-specific public queries:

```ts
where: {
  status: 'PUBLIC',
  seriesId: { in: seriesIds },
},
```

with:

```ts
where: this.buildPublicRecipeWhere({
  seriesId: { in: seriesIds },
}),
```

Replace `loadPublicSeriesRecipes` candidate query:

```ts
where: {
  status: 'PUBLIC',
  OR: [{ seriesId: id }, { recipeId: id }],
},
```

with:

```ts
where: this.buildPublicRecipeWhere({
  OR: [{ seriesId: id }, { recipeId: id }],
}),
```

Replace the follow-up series query:

```ts
where: {
  status: 'PUBLIC',
  seriesId,
},
```

with:

```ts
where: this.buildPublicRecipeWhere({ seriesId }),
```

- [ ] **Step 5: Run focused public visibility tests**

Run:

```bash
cd backend && npm test -- --runInBand tests/infrastructure/repositories/prisma-recipe.repository.spec.ts tests/interfaces/controllers/recipes.controller.spec.ts
```

Expected: public list, public filter options, ingredient grouping, recommendations, and public series details only include standalone public recipes or recipes whose `RecipeSeries.businessStatus = PUBLIC`.

- [ ] **Step 6: Commit**

```bash
git add backend/src/infrastructure/repositories/prisma-recipe.repository.ts backend/src/interfaces/controllers/recipes.controller.ts backend/tests/infrastructure/repositories/prisma-recipe.repository.spec.ts backend/tests/interfaces/controllers/recipes.controller.spec.ts
git commit -m "feat: filter public recipes by series status"
```

---

### Task 6: Add Revert-To-Latest-Official Backend API

**Files:**
- Modify: `backend/src/application/recipe-designer/recipe-designer.service.ts`
- Modify: `backend/src/interfaces/controllers/recipe-designer.controller.ts`
- Modify: `backend/tests/application/recipe-designer/recipe-designer.service.spec.ts`

- [ ] **Step 1: Write failing service test for revert**

In `backend/tests/application/recipe-designer/recipe-designer.service.spec.ts`, add:

```ts
describe('revertDraftToLatestOfficial', () => {
  it('resets an active revision draft back to the latest published design snapshot', async () => {
    prisma.designRecipe.findUnique.mockResolvedValueOnce(
      buildDesignRecord({
        id: 'revision-draft',
        createdBy: 'staff-1',
        revisionBaseRecipeId: 'recipe-business-id',
        seriesId: 'series-1',
        seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
        publishedRecipeId: null,
        publishedAt: null,
        items: [{ id: 'changed-item', weightG: 999 }],
      }),
    );
    prisma.designRecipe.findFirst.mockResolvedValueOnce(
      buildDesignRecord({
        id: 'published-design',
        status: 'PUBLISHED',
        publishedRecipeId: 'recipe-business-id',
        publishedRecipeVersion: 2,
        seriesId: 'series-1',
        seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
        items: [
          {
            id: 'baseline-item',
            ingredientId: 'ingredient-1',
            nutritionFoodId: 'nutrition-food-1',
            weightG: 80,
            includeInAssessment: true,
            ratioPercent: 80,
            preparationMethod: '熟制',
            nutrientTargetKey: null,
            nutrientTargetValue: null,
            sortOrder: 0,
          },
        ],
      }),
    );
    prisma.$transaction.mockImplementation(async (callback: any) =>
      callback({
        designRecipeItem: {
          deleteMany: jest.fn(),
        },
        designRecipe: {
          update: jest.fn().mockResolvedValue(
            buildDesignRecord({
              id: 'revision-draft',
              items: [{ id: 'new-baseline-item', weightG: 80 }],
            }),
          ),
        },
      }),
    );

    const result = await service.revertDraftToLatestOfficial('revision-draft', {
      userId: 'staff-1',
      role: 'STAFF',
    });

    expect(result).toMatchObject({
      id: 'revision-draft',
      items: [{ weightG: 80 }],
    });
  });
});
```

- [ ] **Step 2: Run test and confirm failure**

Run:

```bash
cd backend && npm test -- --runInBand tests/application/recipe-designer/recipe-designer.service.spec.ts
```

Expected: fails because `revertDraftToLatestOfficial` is not implemented.

- [ ] **Step 3: Implement service method**

In `backend/src/application/recipe-designer/recipe-designer.service.ts`, add:

```ts
async revertDraftToLatestOfficial(
  id: string,
  access: RecipeDesignerAccessInput,
) {
  const context = normalizeRecipeDesignerAccessContext(access);
  const draft = await this.loadDraft(id);

  if (draft.createdBy !== context.userId) {
    throw new NotFoundException(`Design recipe ${id} not found`);
  }
  if (!draft.seriesId || !draft.seriesLifeStage) {
    throw new BadRequestException('只有系列生命阶段草稿可以撤回修改');
  }
  if (this.isPublishedDraft(draft)) {
    throw new BadRequestException('正式版本无需撤回修改');
  }

  const baseline = await this.prisma.designRecipe.findFirst({
    where: {
      seriesId: draft.seriesId,
      seriesLifeStage: draft.seriesLifeStage,
      OR: [
        { status: DesignRecipeStatus.PUBLISHED },
        { publishedRecipeId: { not: null } },
        { publishedAt: { not: null } },
      ],
    },
    include: DESIGN_RECIPE_INCLUDE,
    orderBy: [{ publishedRecipeVersion: 'desc' }, { updatedAt: 'desc' }],
  });

  if (!baseline) {
    throw new BadRequestException('没有可撤回到的正式版本');
  }

  return this.prisma.$transaction(async (tx) => {
    await tx.designRecipeItem.deleteMany({
      where: { designRecipeId: draft.id },
    });

    return tx.designRecipe.update({
      where: { id: draft.id },
      data: {
        name: baseline.name,
        fediafDogScenario: baseline.fediafDogScenario,
        nutritionStandard: baseline.nutritionStandard,
        targetHealthTags: baseline.targetHealthTags,
        applicableLifeStages: baseline.applicableLifeStages,
        notes: baseline.notes,
        totalWeightG: baseline.totalWeightG,
        energyDensityKcalPerKg: baseline.energyDensityKcalPerKg,
        calculatedNutrition: baseline.calculatedNutrition as Prisma.InputJsonValue,
        complianceStatus: baseline.complianceStatus as Prisma.InputJsonValue,
        assessmentSummary: baseline.assessmentSummary as Prisma.InputJsonValue,
        missingDataReport: baseline.missingDataReport as Prisma.InputJsonValue,
        complianceScore: baseline.complianceScore,
        isCompliant: baseline.isCompliant,
        reviewStatus: DesignRecipeReviewStatus.NONE,
        reviewNote: null,
        reviewedBy: null,
        reviewedAt: null,
        items: {
          create: baseline.items.map((item) => ({
            ingredientId: item.ingredientId,
            nutritionFoodId: item.nutritionFoodId,
            weightG: item.weightG,
            includeInAssessment: item.includeInAssessment,
            ratioPercent: item.ratioPercent,
            preparationMethod: item.preparationMethod,
            nutrientTargetKey: item.nutrientTargetKey,
            nutrientTargetValue: item.nutrientTargetValue,
            sortOrder: item.sortOrder,
          })),
        },
      },
      include: DESIGN_RECIPE_INCLUDE,
    });
  });
}
```

- [ ] **Step 4: Add controller route**

In `backend/src/interfaces/controllers/recipe-designer.controller.ts`, add before `publishDraft`:

```ts
@Post('drafts/:id/revert-to-latest-official')
@UseGuards(StaffGuard)
@ApiOperation({
  summary: 'Revert an editable revision draft to the latest official version',
})
async revertDraftToLatestOfficial(
  @Param('id') id: string,
  @CurrentUser() user: RequestUser,
): Promise<ApiResponseDto<any>> {
  const result = await this.recipeDesignerService.revertDraftToLatestOfficial(
    id,
    toRecipeDesignerAccessContext(user),
  );
  return ApiResponseDto.success(result);
}
```

- [ ] **Step 5: Run focused backend tests**

Run:

```bash
cd backend && npm test -- --runInBand tests/application/recipe-designer/recipe-designer.service.spec.ts
```

Expected: recipe designer service tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/src/application/recipe-designer/recipe-designer.service.ts backend/src/interfaces/controllers/recipe-designer.controller.ts backend/tests/application/recipe-designer/recipe-designer.service.spec.ts
git commit -m "feat: revert recipe designer drafts to official version"
```

---

### Task 7: Update Miniapp API And Designer List

**Files:**
- Modify: `miniapp/src/api/recipe-designer.ts`
- Modify: `miniapp/src/api/recipe-designer.spec.ts`
- Modify: `miniapp/src/pages/recipe-designer/list.vue`
- Modify: `miniapp/src/pages/recipe-designer.regression.spec.ts`

- [ ] **Step 1: Write failing miniapp API test**

In `miniapp/src/api/recipe-designer.spec.ts`, add:

```ts
it('calls revert-to-latest-official for recipe designer drafts', () => {
  recipeDesignerApi.revertToLatestOfficial('draft-1');

  expect(mockedRequest).toHaveBeenCalledWith({
    url: '/recipe-designer/drafts/draft-1/revert-to-latest-official',
    method: 'POST',
  });
});
```

- [ ] **Step 2: Write failing regression assertions for labels**

In `miniapp/src/pages/recipe-designer.regression.spec.ts`, add expectations:

```ts
it('uses submitted and private custom labels for recipe designer statuses', () => {
  expect(apiSource).toContain("| 'SUBMITTED'");
  expect(apiSource).toContain("businessStatus: RecipeDesignerSeriesStatusFilter");
  expect(listSource).toContain("SUBMITTED: '已提交'");
  expect(listSource).toContain("PRIVATE_CUSTOM: '私密定制'");
  expect(listSource).toContain('series-business-status');
});
```

- [ ] **Step 3: Run tests and confirm failure**

Run:

```bash
cd miniapp && npm test -- src/api/recipe-designer.spec.ts src/pages/recipe-designer.regression.spec.ts
```

Expected: tests fail because API method and labels are missing.

- [ ] **Step 4: Update API types and method**

In `miniapp/src/api/recipe-designer.ts`, update `RecipeSeriesStageStatus`:

```ts
export type RecipeSeriesStageStatus =
  | 'NOT_DESIGNED'
  | 'MODIFIED'
  | 'SUBMITTED'
  | 'PUBLISHED'
  | 'PRIVATE_CUSTOM'
```

Update `RecipeDesignerSeriesCard`:

```ts
export interface RecipeDesignerSeriesCard {
  id: string
  name: string
  businessStatus: RecipeDesignerSeriesStatusFilter
  businessStatusLabel?: string
  updatedAt?: string
  publishedStageCount: number
  stages: RecipeDesignerSeriesStage[]
}
```

Add API method:

```ts
revertToLatestOfficial: (draftId: string) =>
  request({
    url: `/recipe-designer/drafts/${draftId}/revert-to-latest-official`,
    method: 'POST',
  }),
```

- [ ] **Step 5: Update list labels and card display**

In `miniapp/src/pages/recipe-designer/list.vue`, update labels:

```ts
const seriesStageStatusLabels: Record<RecipeSeriesStageStatus, string> = {
  NOT_DESIGNED: '未设计',
  MODIFIED: '已修改',
  SUBMITTED: '已提交',
  PUBLISHED: '已发布',
  PRIVATE_CUSTOM: '私密定制',
}
```

Update filter label:

```ts
{ label: '私密定制', value: 'PRIVATE_CUSTOM' },
```

Add a series status badge in the card header near the series title:

```vue
<text
  v-if="!isCustomerMode"
  class="series-business-status"
  :class="`series-business-status-${seriesItem.businessStatus || 'DRAFT'}`"
>
  {{ seriesItem.businessStatusLabel || getSeriesBusinessStatusLabel(seriesItem.businessStatus) }}
</text>
```

Add helper:

```ts
function getSeriesBusinessStatusLabel(status?: RecipeDesignerSeriesStatusFilter) {
  if (status === 'PUBLIC') return '已发布'
  if (status === 'PRIVATE_CUSTOM') return '私密定制'
  return '草稿'
}
```

Add compact styles:

```css
.series-business-status {
  display: inline-flex;
  margin-left: 12rpx;
  padding: 4rpx 10rpx;
  border-radius: 8rpx;
  background: #f5f5f5;
  color: #666;
  font-size: 21rpx;
  line-height: 1.3;
}

.series-business-status-PUBLIC {
  background: #f6ffed;
  color: #389e0d;
}

.series-business-status-PRIVATE_CUSTOM {
  background: #fff1f0;
  color: #cf1322;
}
```

- [ ] **Step 6: Run miniapp focused tests**

Run:

```bash
cd miniapp && npm test -- src/api/recipe-designer.spec.ts src/pages/recipe-designer.regression.spec.ts
```

Expected: focused miniapp tests pass.

- [ ] **Step 7: Commit**

```bash
git add miniapp/src/api/recipe-designer.ts miniapp/src/api/recipe-designer.spec.ts miniapp/src/pages/recipe-designer/list.vue miniapp/src/pages/recipe-designer.regression.spec.ts
git commit -m "feat: show recipe series and submitted statuses in miniapp"
```

---

### Task 8: Add Miniapp Editor Revert Action

**Files:**
- Modify: `miniapp/src/pages/recipe-designer/editor.vue`
- Modify: `miniapp/src/pages/recipe-designer.regression.spec.ts`

- [ ] **Step 1: Write failing regression assertions**

In `miniapp/src/pages/recipe-designer.regression.spec.ts`, add:

```ts
it('separates history undo from reverting a revision draft to the official version', () => {
  expect(editorSource).toContain('revertToLatestOfficialDraft');
  expect(editorSource).toContain('recipeDesignerApi.revertToLatestOfficial(draftId.value)');
  expect(editorSource).toContain('撤回修改');
  expect(editorSource).toContain('当前修改将回到最新正式版本');
});
```

- [ ] **Step 2: Run test and confirm failure**

Run:

```bash
cd miniapp && npm test -- src/pages/recipe-designer.regression.spec.ts
```

Expected: regression spec fails because editor revert action is missing.

- [ ] **Step 3: Add editor state**

In `miniapp/src/pages/recipe-designer/editor.vue`, add state near existing loading flags:

```ts
const revertingToOfficial = ref(false)
const canRevertToOfficial = computed(() => {
  return Boolean(draftId.value && draftRevisionBaseRecipeId.value && !redirectingToEditableDraft.value)
})
```

If `draftRevisionBaseRecipeId` does not exist, add it:

```ts
const draftRevisionBaseRecipeId = ref('')
```

In `loadDraft`, after assigning series fields:

```ts
draftRevisionBaseRecipeId.value = String(draft.revisionBaseRecipeId || '')
```

- [ ] **Step 4: Add button separate from history undo**

In the editor header area, add a text action after the history controls:

```vue
<button
  v-if="canRevertToOfficial"
  class="link-btn revert-official-btn"
  :disabled="revertingToOfficial"
  @tap.stop="revertToLatestOfficialDraft"
>
  {{ revertingToOfficial ? '撤回中' : '撤回修改' }}
</button>
```

- [ ] **Step 5: Add revert method**

In `editor.vue`, add:

```ts
async function revertToLatestOfficialDraft() {
  if (!canRevertToOfficial.value || revertingToOfficial.value) return

  uni.showModal({
    title: '撤回修改',
    content: '当前修改将回到最新正式版本，未提交的编辑内容不会保留。',
    confirmText: '确认撤回',
    cancelText: '继续编辑',
    success: async (result: any) => {
      if (!result.confirm) return

      revertingToOfficial.value = true
      beginAutoSave()
      try {
        const res: any = await recipeDesignerApi.revertToLatestOfficial(draftId.value)
        const reverted = res?.data ?? res
        if (!reverted?.id) {
          throw new Error('missing reverted draft id')
        }
        uni.showToast({ title: '已回到正式版本', icon: 'success' })
        await loadDraft()
        resetRecipeDesignerHistory()
        finishAutoSave()
      } catch (error) {
        console.error('[RecipeDesignerEditor] Failed to revert to official version:', error)
        failAutoSave()
        uni.showToast({ title: '撤回修改失败', icon: 'none' })
      } finally {
        revertingToOfficial.value = false
      }
    },
  })
}
```

If no `resetRecipeDesignerHistory` helper exists, add:

```ts
function resetRecipeDesignerHistory() {
  historyState.value = createRecipeDesignerHistoryState()
}
```

- [ ] **Step 6: Add button style**

Add:

```css
.revert-official-btn {
  flex-shrink: 0;
  color: #d46b08;
}
```

- [ ] **Step 7: Run miniapp focused tests**

Run:

```bash
cd miniapp && npm test -- src/pages/recipe-designer.regression.spec.ts
```

Expected: regression spec passes.

- [ ] **Step 8: Commit**

```bash
git add miniapp/src/pages/recipe-designer/editor.vue miniapp/src/pages/recipe-designer.regression.spec.ts
git commit -m "feat: revert recipe designer edits to official version"
```

---

### Task 9: Update Admin Web Status Display

**Files:**
- Modify: `admin-web/src/types/recipe.ts`
- Modify: `admin-web/src/views/Recipes/index.vue`
- Modify: `admin-web/src/views/Recipes/RecipeForm.vue`

- [ ] **Step 1: Update admin web types**

In `admin-web/src/types/recipe.ts`, add:

```ts
export enum RecipeSeriesBusinessStatus {
  DRAFT = 'DRAFT',
  PUBLIC = 'PUBLIC',
  PRIVATE_CUSTOM = 'PRIVATE_CUSTOM',
}

export type RecipeSeriesStageStatus =
  | 'NOT_DESIGNED'
  | 'MODIFIED'
  | 'SUBMITTED'
  | 'PUBLISHED'
  | 'PRIVATE_CUSTOM';
```

Update `RecipeSeriesStageSummary.status`:

```ts
export interface RecipeSeriesStageSummary {
  lifeStage: string;
  label: string;
  status: RecipeSeriesStageStatus;
  recipeVersionId?: string;
  recipeId?: string;
  version?: number;
  updatedAt?: string;
}
```

Update `RecipeSummary`:

```ts
seriesBusinessStatus?: RecipeSeriesBusinessStatus;
seriesBusinessStatusLabel?: string;
```

- [ ] **Step 2: Update admin list labels**

In `admin-web/src/views/Recipes/index.vue`, import the new enum:

```ts
import {
  RecipeStatus,
  RecipeSeriesBusinessStatus,
  type RecipeSummary,
  type RecipeQuery,
  type RecipeVersionSummary,
  type RecipeSeriesStageSummary,
} from '@/types/recipe';
```

Add label maps:

```ts
const RecipeSeriesBusinessStatusLabels: Record<RecipeSeriesBusinessStatus, string> = {
  [RecipeSeriesBusinessStatus.DRAFT]: '草稿',
  [RecipeSeriesBusinessStatus.PUBLIC]: '已发布',
  [RecipeSeriesBusinessStatus.PRIVATE_CUSTOM]: '私密定制',
};

const RecipeSeriesBusinessStatusTagTypes: Record<RecipeSeriesBusinessStatus, string> = {
  [RecipeSeriesBusinessStatus.DRAFT]: 'info',
  [RecipeSeriesBusinessStatus.PUBLIC]: 'success',
  [RecipeSeriesBusinessStatus.PRIVATE_CUSTOM]: 'warning',
};
```

Update stage labels:

```ts
const SeriesStageStatusLabels: Record<string, string> = {
  NOT_DESIGNED: '未设计',
  MODIFIED: '已修改',
  SUBMITTED: '已提交',
  PUBLISHED: '已发布',
  PRIVATE_CUSTOM: '私密定制',
};
```

Update `getSeriesStageStatusType`:

```ts
const getSeriesStageStatusType = (status: string) => {
  if (status === 'PUBLISHED') return 'success';
  if (status === 'SUBMITTED') return 'warning';
  if (status === 'MODIFIED') return 'warning';
  if (status === 'PRIVATE_CUSTOM') return 'danger';
  return 'info';
};
```

- [ ] **Step 3: Show series business status in admin list**

Update `getRecipeSeriesStatusLabel`:

```ts
const getRecipeSeriesStatusLabel = (row: RecipeSummary) => {
  if (row.seriesBusinessStatus) {
    return (
      row.seriesBusinessStatusLabel ||
      RecipeSeriesBusinessStatusLabels[row.seriesBusinessStatus] ||
      row.seriesBusinessStatus
    );
  }
  if (row.pendingDraftVersion) {
    return '待发布修订';
  }
  return RecipeStatusLabels[row.status as RecipeStatus];
};
```

Update `getRecipeSeriesStatusType`:

```ts
const getRecipeSeriesStatusType = (row: RecipeSummary) => {
  if (row.seriesBusinessStatus) {
    return RecipeSeriesBusinessStatusTagTypes[row.seriesBusinessStatus] || 'info';
  }
  if (row.pendingDraftVersion) {
    return 'warning';
  }
  return RecipeStatusTagTypes[row.status as RecipeStatus];
};
```

- [ ] **Step 4: Update RecipeForm series context**

In `admin-web/src/views/Recipes/RecipeForm.vue`, add the enum import and labels using the same maps as the list page.

In the series context tags, add:

```vue
<el-tag
  v-if="currentRecipe?.seriesBusinessStatus"
  :type="getSeriesBusinessStatusTagType(currentRecipe.seriesBusinessStatus)"
>
  {{ getSeriesBusinessStatusLabel(currentRecipe.seriesBusinessStatus) }}
</el-tag>
```

Add helpers:

```ts
const getSeriesBusinessStatusLabel = (status?: RecipeSeriesBusinessStatus) => {
  return status ? RecipeSeriesBusinessStatusLabels[status] || status : '-';
};

const getSeriesBusinessStatusTagType = (status?: RecipeSeriesBusinessStatus) => {
  return status ? RecipeSeriesBusinessStatusTagTypes[status] || 'info' : 'info';
};
```

- [ ] **Step 5: Build admin web**

Run:

```bash
cd admin-web && npm run build
```

Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add admin-web/src/types/recipe.ts admin-web/src/views/Recipes/index.vue admin-web/src/views/Recipes/RecipeForm.vue
git commit -m "feat: show recipe series statuses in admin"
```

---

### Task 10: Final Verification And Regression Pass

**Files:**
- No planned code changes.

- [ ] **Step 1: Run backend status tests**

Run:

```bash
cd backend && npm test -- --runInBand tests/application/recipe-designer/recipe-designer.service.spec.ts tests/application/recipe/recipe.service.spec.ts
```

Expected: all targeted backend status tests pass.

- [ ] **Step 2: Run backend Prisma validation**

Run:

```bash
cd backend && npx prisma validate
```

Expected: schema validation succeeds.

- [ ] **Step 3: Run miniapp tests**

Run:

```bash
cd miniapp && npm test -- src/api/recipe-designer.spec.ts src/pages/recipe-designer.regression.spec.ts
```

Expected: focused miniapp tests pass.

- [ ] **Step 4: Run miniapp build**

Run:

```bash
cd miniapp && npm run build:mp-weixin
```

Expected: build succeeds. Tell the user to open `miniapp/dist/build/mp-weixin` in WeChat DevTools.

- [ ] **Step 5: Run admin web build**

Run:

```bash
cd admin-web && npm run build
```

Expected: build succeeds.

- [ ] **Step 6: Check git status**

Run:

```bash
git status --short
```

Expected: only intentionally uncommitted files remain. If unrelated user changes existed before implementation, they should still be uncommitted and untouched unless a task explicitly incorporated them.

- [ ] **Step 7: Commit final verification note if needed**

If verification required small test expectation updates, commit them:

```bash
git add backend miniapp admin-web
git commit -m "test: verify recipe series status flow"
```

If no files changed during final verification, skip this commit.

---

## Self-Review Notes

Spec coverage:

- Series-level `DRAFT / PUBLIC / PRIVATE_CUSTOM`: Task 1, Task 3, Task 4, Task 9.
- Stage-level `NOT_DESIGNED / MODIFIED / SUBMITTED / PUBLISHED / PRIVATE_CUSTOM`: Task 2, Task 3, Task 4, Task 7, Task 9.
- Submitted backend draft state: Task 3 and Task 4.
- Miniapp one-click revert: Task 6 and Task 8.
- Public showcase only for `PUBLIC` series: Task 5.
- Private custom excluded from public showcase: Task 5.
- Migration compatibility: Task 1.

Placeholder scan:

- The plan avoids unresolved placeholder markers and gives concrete paths, code shapes, commands, and expected results.

Type consistency:

- Backend uses `RecipeSeriesBusinessStatus` from Prisma.
- Miniapp and admin web use `RecipeDesignerSeriesStatusFilter` / `RecipeSeriesBusinessStatus` for `DRAFT | PUBLIC | PRIVATE_CUSTOM`.
- Stage status uses the same five strings across backend, miniapp, and admin web.
