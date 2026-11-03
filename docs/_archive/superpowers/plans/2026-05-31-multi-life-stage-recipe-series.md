# Multi-Life-Stage Recipe Series Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build recipe series with per-life-stage versions so users see one recipe series while operations can design, publish, switch, delete, and recover each life-stage version safely.

**Architecture:** Add an explicit `RecipeSeries` aggregate that groups formal `Recipe` rows and `DesignRecipe` drafts. Keep each published life-stage version on its own real `recipeId` so existing order, favorite, review, and production references remain stable; public listing groups recipes by series, and detail selection resolves to the best concrete recipe version for the current dog or manual life-stage choice.

**Tech Stack:** NestJS, Prisma, PostgreSQL migrations, Jest, Vue 3, UniApp miniapp, Element Plus admin web, Vitest source/regression tests.

---

## Scope Check

This is one integrated feature across backend, miniapp recipe designer, public miniapp recipe views, and admin web. The tasks below are sequenced so each layer is testable after its backend contract exists:

1. Backend data model and shared life-stage helpers.
2. Backend recipe designer series APIs.
3. Backend public recipe series selection APIs.
4. Miniapp recipe designer UI.
5. Miniapp public recipe detail and order flow.
6. Admin web recipe series visibility.
7. Backfill and end-to-end verification.

Do not modify unrelated order, production, inventory, or nutrition-calculation behavior except where they read a selected concrete recipe id.

## File Structure

### Backend

- Modify `backend/prisma/schema.prisma`
  - Add `RecipeSeries`.
  - Add `seriesId` and `seriesLifeStage` to `Recipe`.
  - Add `seriesId` and `seriesLifeStage` to `DesignRecipe`.
- Create `backend/prisma/migrations/202605310001_add_recipe_series_life_stage_versions/migration.sql`
  - Add the actual PostgreSQL tables, columns, indexes, and foreign keys.
- Create `backend/src/domain/recipe/recipe-series.ts`
  - Own all series life-stage ordering, labels, FEDIAF scenario mapping, dog profile matching, and stage status helpers.
- Create `backend/tests/domain/recipe/recipe-series.spec.ts`
  - Unit tests for mappings and matching rules.
- Modify `backend/src/interfaces/dto/recipe-designer/recipe-designer.dto.ts`
  - Add DTOs for series create, rename, delete, stage draft creation, and history lookup.
- Modify `backend/src/application/recipe-designer/recipe-designer.service.ts`
  - Add series card aggregation, safe delete, stage draft creation, stage history, and series-aware publish.
- Modify `backend/src/interfaces/controllers/recipe-designer.controller.ts`
  - Add series endpoints.
- Modify `backend/tests/application/recipe-designer/recipe-designer.service.spec.ts`
  - Add service tests for series cards, stage draft creation, safe delete, and series-aware publish.
- Modify `backend/tests/interfaces/controllers/recipe-designer.controller.spec.ts`
  - Add controller contract tests for new endpoints.
- Modify `backend/src/interfaces/dto/recipes/recipe-response.dto.ts`
  - Add series/detail response fields.
- Modify `backend/src/infrastructure/repositories/prisma-recipe.repository.ts`
  - Keep legacy methods working; add helpers to query concrete recipes by series and stage.
- Modify `backend/src/interfaces/controllers/recipes.controller.ts`
  - Group public list by series and resolve details to the selected concrete recipe id.
- Modify `backend/tests/interfaces/controllers/recipes.controller.spec.ts`
  - Add public list/detail tests for grouping, dog matching, fallback, and manual switching.
- Create `backend/scripts/backfill-recipe-series.ts`
  - Backfill existing formal recipes and design drafts into series records.
- Create `backend/tests/scripts/backfill-recipe-series.spec.ts`
  - Test backfill planning and apply behavior without touching a real database.

### Miniapp

- Modify `miniapp/src/api/recipe-designer.ts`
  - Add series API types and client methods.
- Modify `miniapp/src/api/recipe-designer.spec.ts`
  - Test new API endpoints and payloads.
- Modify `miniapp/src/pages/recipe-designer/list.vue`
  - Replace draft-card list with series cards showing five stage statuses and more menu.
- Modify `miniapp/src/pages/recipe-designer/editor.vue`
  - Keep the existing editor page; show current series/stage context, change the read-only CTA to “编辑”, and add stage switch/history entry points.
- Modify `miniapp/src/pages/recipe-designer/publish.vue`
  - Ensure publishing keeps the current series/stage context.
- Modify `miniapp/src/pages/recipe-designer.regression.spec.ts`
  - Add source-level regression tests for series card and editor text.
- Modify `miniapp/src/pages/home/index.vue`
  - Remove life-stage tags from recipe showcase cards.
- Modify `miniapp/src/pages/recipe-list/index.vue`
  - Consume grouped series cards from `/recipes`.
- Modify `miniapp/src/pages/recipe-detail/index.vue`
  - Load a series detail, auto-match dog life stage, show mismatch warning, and support manual switch.
- Modify `miniapp/src/pages/recipe-order/index.vue`
  - Carry the selected concrete recipe id and selected life stage into ordering.
- Modify `miniapp/src/pages/recipe-detail.regression.spec.ts`
  - Add detail matching and selector source tests.
- Modify `miniapp/src/pages/recipe-order.regression.spec.ts`
  - Add order handoff tests for selected concrete recipe id.

### Admin Web

- Modify `admin-web/src/types/recipe.ts`
  - Add series id and stage version status fields.
- Modify `admin-web/src/api/recipes.ts`
  - Add admin series endpoints or update list typing if backend returns series summaries.
- Modify `admin-web/src/views/Recipes/index.vue`
  - Show series-level rows with stage status chips, and avoid presenting each life stage as a separate recipe row.
- Modify `admin-web/src/views/Recipes/RecipeForm.vue`
  - Show current series and life-stage context when editing a concrete recipe.

---

## Task 1: Backend Life-Stage Series Foundation

**Files:**
- Create: `backend/src/domain/recipe/recipe-series.ts`
- Create: `backend/tests/domain/recipe/recipe-series.spec.ts`
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/202605310001_add_recipe_series_life_stage_versions/migration.sql`

- [ ] **Step 1: Write failing life-stage helper tests**

Add `backend/tests/domain/recipe/recipe-series.spec.ts`:

```ts
import {
  ORDERED_RECIPE_SERIES_LIFE_STAGES,
  mapDogProfileToSeriesLifeStage,
  mapScenarioToSeriesLifeStage,
  resolveDefaultSeriesLifeStage,
} from '../../../src/domain/recipe/recipe-series';

describe('recipe series life-stage helpers', () => {
  it('keeps the five configured stages in product order', () => {
    expect(ORDERED_RECIPE_SERIES_LIFE_STAGES).toEqual([
      'PUPPY_UNDER_14_WEEKS',
      'PUPPY_14_WEEKS_PLUS',
      'HIGH_ACTIVITY_ADULT',
      'LOW_ACTIVITY_ADULT_OR_SENIOR',
      'REPRODUCTION',
    ]);
  });

  it.each([
    ['EARLY_GROWTH_REPRODUCTION', 'PUPPY_UNDER_14_WEEKS'],
    ['LATE_GROWTH', 'PUPPY_14_WEEKS_PLUS'],
    ['ADULT_MER_110', 'HIGH_ACTIVITY_ADULT'],
    ['ADULT_MER_95', 'LOW_ACTIVITY_ADULT_OR_SENIOR'],
    ['REPRODUCTION', 'REPRODUCTION'],
  ] as const)('maps %s to %s', (scenario, expected) => {
    expect(mapScenarioToSeriesLifeStage(scenario)).toBe(expected);
  });

  it('maps reproduction overrides before age and activity rules', () => {
    expect(
      mapDogProfileToSeriesLifeStage({
        birthday: new Date('2024-01-01T00:00:00.000Z'),
        lifeStageOverride: 'LACTATION',
        activityLevel: 'LOW',
        now: new Date('2026-05-31T00:00:00.000Z'),
      }),
    ).toBe('REPRODUCTION');
  });

  it('splits puppies at fourteen weeks and adult activity into two adult stages', () => {
    expect(
      mapDogProfileToSeriesLifeStage({
        birthday: new Date('2026-03-10T00:00:00.000Z'),
        lifeStageOverride: 'NONE',
        activityLevel: 'NORMAL',
        now: new Date('2026-05-31T00:00:00.000Z'),
      }),
    ).toBe('PUPPY_UNDER_14_WEEKS');
    expect(
      mapDogProfileToSeriesLifeStage({
        birthday: new Date('2024-05-31T00:00:00.000Z'),
        lifeStageOverride: 'NONE',
        activityLevel: 'LOW',
        now: new Date('2026-05-31T00:00:00.000Z'),
      }),
    ).toBe('LOW_ACTIVITY_ADULT_OR_SENIOR');
    expect(
      mapDogProfileToSeriesLifeStage({
        birthday: new Date('2024-05-31T00:00:00.000Z'),
        lifeStageOverride: 'NONE',
        activityLevel: 'NORMAL',
        now: new Date('2026-05-31T00:00:00.000Z'),
      }),
    ).toBe('HIGH_ACTIVITY_ADULT');
  });

  it('falls back to adult then first configured stage', () => {
    expect(resolveDefaultSeriesLifeStage(['REPRODUCTION', 'HIGH_ACTIVITY_ADULT'])).toBe(
      'HIGH_ACTIVITY_ADULT',
    );
    expect(resolveDefaultSeriesLifeStage(['REPRODUCTION'])).toBe('REPRODUCTION');
  });
});
```

- [ ] **Step 2: Run the failing helper test**

Run:

```bash
cd backend && npm test -- tests/domain/recipe/recipe-series.spec.ts --runInBand
```

Expected: FAIL because `backend/src/domain/recipe/recipe-series.ts` does not exist.

- [ ] **Step 3: Implement shared life-stage helpers**

Create `backend/src/domain/recipe/recipe-series.ts`:

```ts
import { LifeStage as RecipeLifeStage } from './enums';

export type RecipeSeriesLifeStage =
  | 'PUPPY_UNDER_14_WEEKS'
  | 'PUPPY_14_WEEKS_PLUS'
  | 'HIGH_ACTIVITY_ADULT'
  | 'LOW_ACTIVITY_ADULT_OR_SENIOR'
  | 'REPRODUCTION';

export type RecipeSeriesStageStatus =
  | 'NOT_DESIGNED'
  | 'DRAFT'
  | 'IN_REVIEW'
  | 'PUBLISHED'
  | 'NEEDS_CHANGES';

export type FediafDogScenarioForSeries =
  | 'EARLY_GROWTH_REPRODUCTION'
  | 'REPRODUCTION'
  | 'LATE_GROWTH'
  | 'ADULT_MER_95'
  | 'ADULT_MER_110';

export const ORDERED_RECIPE_SERIES_LIFE_STAGES: RecipeSeriesLifeStage[] = [
  RecipeLifeStage.PUPPY_UNDER_14_WEEKS,
  RecipeLifeStage.PUPPY_14_WEEKS_PLUS,
  RecipeLifeStage.HIGH_ACTIVITY_ADULT,
  RecipeLifeStage.LOW_ACTIVITY_ADULT_OR_SENIOR,
  RecipeLifeStage.REPRODUCTION,
];

export const SERIES_LIFE_STAGE_LABELS: Record<RecipeSeriesLifeStage, string> = {
  PUPPY_UNDER_14_WEEKS: '小于 14 周幼犬',
  PUPPY_14_WEEKS_PLUS: '14 周以上幼犬',
  HIGH_ACTIVITY_ADULT: '普通成年犬',
  LOW_ACTIVITY_ADULT_OR_SENIOR: '低能量成年犬 / 老年犬',
  REPRODUCTION: '繁殖期',
};

export const SCENARIO_TO_SERIES_LIFE_STAGE: Record<
  FediafDogScenarioForSeries,
  RecipeSeriesLifeStage
> = {
  EARLY_GROWTH_REPRODUCTION: RecipeLifeStage.PUPPY_UNDER_14_WEEKS,
  REPRODUCTION: RecipeLifeStage.REPRODUCTION,
  LATE_GROWTH: RecipeLifeStage.PUPPY_14_WEEKS_PLUS,
  ADULT_MER_95: RecipeLifeStage.LOW_ACTIVITY_ADULT_OR_SENIOR,
  ADULT_MER_110: RecipeLifeStage.HIGH_ACTIVITY_ADULT,
};

export function mapScenarioToSeriesLifeStage(
  scenario: FediafDogScenarioForSeries,
): RecipeSeriesLifeStage {
  return SCENARIO_TO_SERIES_LIFE_STAGE[scenario];
}

export function mapSeriesLifeStageToScenario(
  lifeStage: RecipeSeriesLifeStage,
): FediafDogScenarioForSeries {
  const pair = Object.entries(SCENARIO_TO_SERIES_LIFE_STAGE).find(
    ([, candidate]) => candidate === lifeStage,
  );
  return (pair?.[0] ?? 'ADULT_MER_110') as FediafDogScenarioForSeries;
}

export function mapDogProfileToSeriesLifeStage(dog: {
  birthday?: Date | string | null;
  lifeStageOverride?: string | null;
  activityLevel?: string | null;
  now?: Date;
}): RecipeSeriesLifeStage {
  const override = dog.lifeStageOverride && dog.lifeStageOverride !== 'NONE'
    ? dog.lifeStageOverride
    : '';

  if (override === 'PREGNANCY' || override === 'LACTATION') {
    return RecipeLifeStage.REPRODUCTION;
  }
  if (override === 'SENIOR') {
    return RecipeLifeStage.LOW_ACTIVITY_ADULT_OR_SENIOR;
  }
  if (override === 'ADULT') {
    return isLowActivity(dog.activityLevel)
      ? RecipeLifeStage.LOW_ACTIVITY_ADULT_OR_SENIOR
      : RecipeLifeStage.HIGH_ACTIVITY_ADULT;
  }

  const ageWeeks = getAgeWeeks(dog.birthday, dog.now ?? new Date());
  if (override === 'PUPPY' || (ageWeeks !== null && ageWeeks < 52)) {
    return ageWeeks !== null && ageWeeks < 14
      ? RecipeLifeStage.PUPPY_UNDER_14_WEEKS
      : RecipeLifeStage.PUPPY_14_WEEKS_PLUS;
  }

  return isLowActivity(dog.activityLevel)
    ? RecipeLifeStage.LOW_ACTIVITY_ADULT_OR_SENIOR
    : RecipeLifeStage.HIGH_ACTIVITY_ADULT;
}

export function resolveDefaultSeriesLifeStage(
  configuredStages: string[],
): RecipeSeriesLifeStage | null {
  const configured = new Set(configuredStages);
  if (configured.has(RecipeLifeStage.HIGH_ACTIVITY_ADULT)) {
    return RecipeLifeStage.HIGH_ACTIVITY_ADULT;
  }
  return (
    ORDERED_RECIPE_SERIES_LIFE_STAGES.find((stage) => configured.has(stage)) ??
    null
  );
}

function isLowActivity(activityLevel?: string | null): boolean {
  return activityLevel === 'RESTING' || activityLevel === 'LOW';
}

function getAgeWeeks(
  birthday?: Date | string | null,
  now: Date = new Date(),
): number | null {
  if (!birthday) return null;
  const birthDate = birthday instanceof Date ? birthday : new Date(birthday);
  const birthTime = birthDate.getTime();
  if (!Number.isFinite(birthTime)) return null;
  return (now.getTime() - birthTime) / (1000 * 60 * 60 * 24 * 7);
}
```

- [ ] **Step 4: Add Prisma schema fields**

Modify `backend/prisma/schema.prisma`:

```prisma
enum RecipeSeriesStatus {
  ACTIVE
  DELETED
}

model RecipeSeries {
  id          String             @id @default(uuid()) @map("id")
  name        String             @map("name") @db.VarChar(200)
  status      RecipeSeriesStatus @default(ACTIVE) @map("status")
  deletedAt   DateTime?          @map("deleted_at")
  deletedBy   String?            @map("deleted_by")
  createdBy   String?            @map("created_by")
  createdAt   DateTime           @default(now()) @map("created_at")
  updatedAt   DateTime           @updatedAt @map("updated_at")
  recipes     Recipe[]
  designs     DesignRecipe[]

  @@index([status])
  @@index([updatedAt])
  @@map("recipe_series")
}
```

Add these fields inside `model Recipe`:

```prisma
  seriesId              String?                     @map("series_id")
  seriesLifeStage       String?                     @map("series_life_stage")
  series                RecipeSeries?               @relation(fields: [seriesId], references: [id])
```

Add these indexes inside `model Recipe`:

```prisma
  @@index([seriesId])
  @@index([seriesId, seriesLifeStage, status])
```

Add these fields inside `model DesignRecipe`:

```prisma
  seriesId              String?                       @map("series_id")
  seriesLifeStage       String?                       @map("series_life_stage")
  series                RecipeSeries?                 @relation(fields: [seriesId], references: [id])
```

Add these indexes inside `model DesignRecipe`:

```prisma
  @@index([seriesId])
  @@index([seriesId, seriesLifeStage])
```

- [ ] **Step 5: Add the Prisma migration**

Create `backend/prisma/migrations/202605310001_add_recipe_series_life_stage_versions/migration.sql`:

```sql
CREATE TYPE "RecipeSeriesStatus" AS ENUM ('ACTIVE', 'DELETED');

CREATE TABLE "recipe_series" (
  "id" UUID NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "status" "RecipeSeriesStatus" NOT NULL DEFAULT 'ACTIVE',
  "deleted_at" TIMESTAMP(3),
  "deleted_by" TEXT,
  "created_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "recipe_series_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "recipe_series_status_idx" ON "recipe_series"("status");
CREATE INDEX "recipe_series_updated_at_idx" ON "recipe_series"("updated_at");

ALTER TABLE "recipe"
  ADD COLUMN "series_id" UUID,
  ADD COLUMN "series_life_stage" TEXT;

ALTER TABLE "design_recipe"
  ADD COLUMN "series_id" UUID,
  ADD COLUMN "series_life_stage" TEXT;

CREATE INDEX "recipe_series_id_idx" ON "recipe"("series_id");
CREATE INDEX "recipe_series_id_series_life_stage_status_idx"
  ON "recipe"("series_id", "series_life_stage", "status");
CREATE INDEX "design_recipe_series_id_idx" ON "design_recipe"("series_id");
CREATE INDEX "design_recipe_series_id_series_life_stage_idx"
  ON "design_recipe"("series_id", "series_life_stage");

ALTER TABLE "recipe"
  ADD CONSTRAINT "recipe_series_id_fkey"
  FOREIGN KEY ("series_id") REFERENCES "recipe_series"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "design_recipe"
  ADD CONSTRAINT "design_recipe_series_id_fkey"
  FOREIGN KEY ("series_id") REFERENCES "recipe_series"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 6: Validate Prisma and helper tests**

Run:

```bash
cd backend && npx prisma validate
cd backend && npm test -- tests/domain/recipe/recipe-series.spec.ts --runInBand
```

Expected: Prisma schema validates and the helper test passes.

- [ ] **Step 7: Commit Task 1**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/202605310001_add_recipe_series_life_stage_versions/migration.sql backend/src/domain/recipe/recipe-series.ts backend/tests/domain/recipe/recipe-series.spec.ts
git commit -m "feat: add recipe series life-stage foundation"
```

---

## Task 2: Backend Recipe Designer Series APIs

**Files:**
- Modify: `backend/src/interfaces/dto/recipe-designer/recipe-designer.dto.ts`
- Modify: `backend/src/application/recipe-designer/recipe-designer.service.ts`
- Modify: `backend/src/interfaces/controllers/recipe-designer.controller.ts`
- Modify: `backend/tests/application/recipe-designer/recipe-designer.service.spec.ts`
- Modify: `backend/tests/interfaces/controllers/recipe-designer.controller.spec.ts`

- [ ] **Step 1: Write failing service tests for series cards**

Append tests to `backend/tests/application/recipe-designer/recipe-designer.service.spec.ts`:

```ts
describe('recipe designer series workbench', () => {
  it('returns one series card with five stage statuses', async () => {
    prisma.recipeSeries.findMany.mockResolvedValue([
      {
        id: 'series-1',
        name: '牛肉南瓜鲜食',
        status: 'ACTIVE',
        deletedAt: null,
        updatedAt: new Date('2026-05-31T14:32:00.000Z'),
        designs: [
          draft({
            id: 'adult-design',
            seriesId: 'series-1',
            seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
            status: 'PUBLISHED',
            publishedRecipeId: 'adult-recipe-id',
            updatedAt: new Date('2026-05-31T14:32:00.000Z'),
          }),
          draft({
            id: 'senior-design',
            seriesId: 'series-1',
            seriesLifeStage: 'LOW_ACTIVITY_ADULT_OR_SENIOR',
            status: 'DRAFT',
            updatedAt: new Date('2026-05-31T13:08:00.000Z'),
          }),
        ],
        recipes: [
          {
            recipeId: 'adult-recipe-id',
            seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
            status: 'PUBLIC',
            version: 1,
            updatedAt: new Date('2026-05-31T14:40:00.000Z'),
          },
        ],
      },
    ]);

    const cards = await service.listSeries('staff-1');

    expect(cards).toEqual([
      expect.objectContaining({
        id: 'series-1',
        name: '牛肉南瓜鲜食',
        publishedStageCount: 1,
        stages: [
          expect.objectContaining({ lifeStage: 'PUPPY_UNDER_14_WEEKS', status: 'NOT_DESIGNED' }),
          expect.objectContaining({ lifeStage: 'PUPPY_14_WEEKS_PLUS', status: 'NOT_DESIGNED' }),
          expect.objectContaining({ lifeStage: 'HIGH_ACTIVITY_ADULT', status: 'PUBLISHED' }),
          expect.objectContaining({ lifeStage: 'LOW_ACTIVITY_ADULT_OR_SENIOR', status: 'DRAFT' }),
          expect.objectContaining({ lifeStage: 'REPRODUCTION', status: 'NOT_DESIGNED' }),
        ],
      }),
    ]);
  });
});
```

- [ ] **Step 2: Run the failing series service test**

Run:

```bash
cd backend && npm test -- tests/application/recipe-designer/recipe-designer.service.spec.ts --runInBand
```

Expected: FAIL because `listSeries` is not implemented and the Prisma mock does not include `recipeSeries`.

- [ ] **Step 3: Add DTO classes**

Modify `backend/src/interfaces/dto/recipe-designer/recipe-designer.dto.ts`:

```ts
export class CreateRecipeSeriesDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsIn(RECIPE_DESIGNER_SCENARIOS)
  scenario?: RecipeDesignerScenario;
}

export class RenameRecipeSeriesDto {
  @IsString()
  name!: string;
}

export class DeleteRecipeSeriesDto {
  @IsString()
  confirmName!: string;

  @IsBoolean()
  confirmUserVisibleRemoval!: boolean;
}

export class CreateRecipeSeriesStageDraftDto {
  @IsIn(RECIPE_DESIGNER_SCENARIOS)
  scenario!: RecipeDesignerScenario;
}
```

- [ ] **Step 4: Implement series API methods in service**

Modify `backend/src/application/recipe-designer/recipe-designer.service.ts`.

Add imports:

```ts
import {
  ORDERED_RECIPE_SERIES_LIFE_STAGES,
  SERIES_LIFE_STAGE_LABELS,
  mapScenarioToSeriesLifeStage,
  mapSeriesLifeStageToScenario,
  type RecipeSeriesLifeStage,
  type RecipeSeriesStageStatus,
} from '../../domain/recipe/recipe-series';
```

Add methods inside `RecipeDesignerService`:

```ts
async listSeries(userId: string) {
  const seriesRows = await this.prisma.recipeSeries.findMany({
    where: { status: 'ACTIVE' },
    include: {
      designs: {
        include: DESIGN_RECIPE_INCLUDE,
        orderBy: { updatedAt: 'desc' },
      },
      recipes: {
        select: {
          recipeId: true,
          version: true,
          status: true,
          seriesLifeStage: true,
          updatedAt: true,
        },
        orderBy: [{ version: 'desc' }, { updatedAt: 'desc' }],
      },
    },
    orderBy: { updatedAt: 'desc' },
  });

  return seriesRows.map((series) => this.buildSeriesWorkbenchCard(series, userId));
}

async createSeries(dto: CreateRecipeSeriesDto, userId: string) {
  const scenario = dto.scenario ?? 'ADULT_MER_110';
  const lifeStage = mapScenarioToSeriesLifeStage(scenario);

  return this.prisma.$transaction(async (tx) => {
    const series = await tx.recipeSeries.create({
      data: {
        name: dto.name.trim(),
        createdBy: userId,
      },
    });

    const draft = await tx.designRecipe.create({
      data: {
        name: series.name,
        version: 1,
        fediafDogScenario: scenario,
        seriesId: series.id,
        seriesLifeStage: lifeStage,
        nutritionStandard: 'FEDIAF_2025',
        targetHealthTags: [],
        applicableLifeStages: [lifeStage],
        createdBy: userId,
      },
      include: DESIGN_RECIPE_INCLUDE,
    });

    return { series, draft };
  });
}

async createSeriesStageDraft(
  seriesId: string,
  dto: CreateRecipeSeriesStageDraftDto,
  userId: string,
) {
  const series = await this.prisma.recipeSeries.findFirst({
    where: { id: seriesId, status: 'ACTIVE' },
  });
  if (!series) {
    throw new NotFoundException(`Recipe series ${seriesId} not found`);
  }

  const lifeStage = mapScenarioToSeriesLifeStage(dto.scenario);
  const existing = await this.prisma.designRecipe.findFirst({
    where: {
      seriesId,
      seriesLifeStage: lifeStage,
      status: { not: DesignRecipeStatus.PUBLISHED },
      publishedRecipeId: null,
      publishedAt: null,
    },
    include: DESIGN_RECIPE_INCLUDE,
    orderBy: { updatedAt: 'desc' },
  });
  if (existing) return existing;

  return this.prisma.designRecipe.create({
    data: {
      name: series.name,
      version: 1,
      fediafDogScenario: dto.scenario,
      seriesId,
      seriesLifeStage: lifeStage,
      nutritionStandard: 'FEDIAF_2025',
      targetHealthTags: [],
      applicableLifeStages: [lifeStage],
      createdBy: userId,
    },
    include: DESIGN_RECIPE_INCLUDE,
  });
}

async renameSeries(seriesId: string, dto: RenameRecipeSeriesDto, userId: string) {
  const nextName = dto.name.trim();
  if (!nextName) {
    throw new BadRequestException('请填写食谱系列名称');
  }

  return this.prisma.recipeSeries.update({
    where: { id: seriesId },
    data: {
      name: nextName,
      updatedAt: new Date(),
    },
  });
}

async deleteSeries(seriesId: string, dto: DeleteRecipeSeriesDto, userId: string) {
  const series = await this.prisma.recipeSeries.findUnique({
    where: { id: seriesId },
    include: { designs: true, recipes: true },
  });
  if (!series || series.status === 'DELETED') {
    throw new NotFoundException(`Recipe series ${seriesId} not found`);
  }
  if (dto.confirmName.trim() !== series.name) {
    throw new BadRequestException('请输入完整食谱系列名称确认删除');
  }
  if (!dto.confirmUserVisibleRemoval) {
    throw new BadRequestException('请确认该系列会从用户端下架');
  }
  if (series.designs.some((design) => design.reviewStatus === 'REQUIRED')) {
    throw new BadRequestException('存在审核中版本，请先撤回审核再删除');
  }

  return this.prisma.$transaction(async (tx) => {
    await tx.designRecipe.deleteMany({
      where: {
        seriesId,
        status: { not: DesignRecipeStatus.PUBLISHED },
        publishedRecipeId: null,
      },
    });
    await tx.recipe.updateMany({
      where: { seriesId, status: RecipeStatus.PUBLIC },
      data: { status: RecipeStatus.DRAFT },
    });
    return tx.recipeSeries.update({
      where: { id: seriesId },
      data: {
        status: 'DELETED',
        deletedAt: new Date(),
        deletedBy: userId,
      },
    });
  });
}
```

Add helper methods:

```ts
private buildSeriesWorkbenchCard(series: any, userId: string) {
  const stages = ORDERED_RECIPE_SERIES_LIFE_STAGES.map((lifeStage) => {
    const stageDesigns = (series.designs || []).filter(
      (design: any) => design.seriesLifeStage === lifeStage,
    );
    const stageRecipes = (series.recipes || []).filter(
      (recipe: any) => recipe.seriesLifeStage === lifeStage,
    );
    const status = this.resolveSeriesStageStatus(stageDesigns, stageRecipes);
    const currentDesign = stageDesigns[0] ?? null;
    const publicRecipe = stageRecipes.find((recipe: any) => recipe.status === RecipeStatus.PUBLIC) ?? null;

    return {
      lifeStage,
      label: SERIES_LIFE_STAGE_LABELS[lifeStage],
      scenario: mapSeriesLifeStageToScenario(lifeStage),
      status,
      draftId: currentDesign?.id ?? null,
      recipeId: publicRecipe?.recipeId ?? currentDesign?.publishedRecipeId ?? null,
      updatedAt: currentDesign?.updatedAt ?? publicRecipe?.updatedAt ?? null,
    };
  });

  return {
    id: series.id,
    name: series.name,
    updatedAt: series.updatedAt,
    publishedStageCount: stages.filter((stage) => stage.status === 'PUBLISHED').length,
    stages,
  };
}

private resolveSeriesStageStatus(
  designs: any[],
  recipes: any[],
): RecipeSeriesStageStatus {
  if (recipes.some((recipe) => recipe.status === RecipeStatus.PUBLIC)) {
    return 'PUBLISHED';
  }
  if (designs.some((design) => design.reviewStatus === DesignRecipeReviewStatus.REQUIRED)) {
    return 'IN_REVIEW';
  }
  if (designs.some((design) => design.status === DesignRecipeStatus.NEEDS_REVIEW)) {
    return 'NEEDS_CHANGES';
  }
  if (designs.some((design) => !this.isPublishedDraft(design))) {
    return 'DRAFT';
  }
  return 'NOT_DESIGNED';
}
```

- [ ] **Step 5: Add controller endpoints**

Modify `backend/src/interfaces/controllers/recipe-designer.controller.ts`.

Import the new DTOs:

```ts
  CreateRecipeSeriesDto,
  CreateRecipeSeriesStageDraftDto,
  DeleteRecipeSeriesDto,
  RenameRecipeSeriesDto,
```

Add endpoints before `@Get('drafts')`:

```ts
  @Get('series')
  @ApiOperation({ summary: 'List recipe series workbench cards' })
  async listSeries(@CurrentUser() user: RequestUser): Promise<ApiResponseDto<any>> {
    const cards = await this.recipeDesignerService.listSeries(user.userId);
    return ApiResponseDto.success(cards);
  }

  @Post('series')
  @ApiOperation({ summary: 'Create a recipe series and initial stage draft' })
  async createSeries(
    @Body() dto: CreateRecipeSeriesDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    const result = await this.recipeDesignerService.createSeries(dto, user.userId);
    return ApiResponseDto.success(result);
  }

  @Patch('series/:seriesId')
  @ApiOperation({ summary: 'Rename a recipe series' })
  async renameSeries(
    @Param('seriesId') seriesId: string,
    @Body() dto: RenameRecipeSeriesDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    const result = await this.recipeDesignerService.renameSeries(seriesId, dto, user.userId);
    return ApiResponseDto.success(result);
  }

  @Delete('series/:seriesId')
  @ApiOperation({ summary: 'Safely delete a recipe series' })
  async deleteSeries(
    @Param('seriesId') seriesId: string,
    @Body() dto: DeleteRecipeSeriesDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    const result = await this.recipeDesignerService.deleteSeries(seriesId, dto, user.userId);
    return ApiResponseDto.success(result);
  }

  @Post('series/:seriesId/stage-drafts')
  @ApiOperation({ summary: 'Create or open a draft for one series life stage' })
  async createSeriesStageDraft(
    @Param('seriesId') seriesId: string,
    @Body() dto: CreateRecipeSeriesStageDraftDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    const result = await this.recipeDesignerService.createSeriesStageDraft(
      seriesId,
      dto,
      user.userId,
    );
    return ApiResponseDto.success(result);
  }
```

- [ ] **Step 6: Update mocks and run service/controller tests**

Run:

```bash
cd backend && npm test -- tests/application/recipe-designer/recipe-designer.service.spec.ts --runInBand
cd backend && npm test -- tests/interfaces/controllers/recipe-designer.controller.spec.ts --runInBand
```

Expected: PASS after updating test mocks with `recipeSeries.findMany`, `recipeSeries.create`, `recipeSeries.update`, and `recipe.updateMany`.

- [ ] **Step 7: Commit Task 2**

```bash
git add backend/src/interfaces/dto/recipe-designer/recipe-designer.dto.ts backend/src/application/recipe-designer/recipe-designer.service.ts backend/src/interfaces/controllers/recipe-designer.controller.ts backend/tests/application/recipe-designer/recipe-designer.service.spec.ts backend/tests/interfaces/controllers/recipe-designer.controller.spec.ts
git commit -m "feat: add recipe designer series APIs"
```

---

## Task 3: Backend Series-Aware Publish and Public Detail Selection

**Files:**
- Modify: `backend/src/application/recipe-designer/recipe-designer.service.ts`
- Modify: `backend/src/interfaces/dto/recipes/recipe-response.dto.ts`
- Modify: `backend/src/infrastructure/repositories/prisma-recipe.repository.ts`
- Modify: `backend/src/interfaces/controllers/recipes.controller.ts`
- Modify: `backend/tests/application/recipe-designer/recipe-designer.service.spec.ts`
- Modify: `backend/tests/interfaces/controllers/recipes.controller.spec.ts`

- [ ] **Step 1: Write failing publish tests for separate stage recipe ids**

Append to `backend/tests/application/recipe-designer/recipe-designer.service.spec.ts`:

```ts
it('publishes a new stage in an existing series with its own recipe id', async () => {
  prisma.designRecipe.findUnique.mockResolvedValue(
    draft({
      id: 'senior-design',
      name: '牛肉南瓜鲜食',
      seriesId: 'series-1',
      seriesLifeStage: 'LOW_ACTIVITY_ADULT_OR_SENIOR',
      fediafDogScenario: 'ADULT_MER_95',
      isCompliant: true,
      items: [item()],
    }),
  );
  targetProvider.getTargets.mockResolvedValue(compliantTargets());
  prisma.recipe.findFirst.mockResolvedValue(null);
  prisma.recipe.create.mockResolvedValue({
    id: 'senior-recipe-row',
    recipeId: 'senior-recipe-business-id',
    version: 1,
  });
  prisma.designRecipePublishSnapshot.create.mockResolvedValue({ id: 'snapshot-1' });
  prisma.designRecipe.update.mockResolvedValue(
    draft({
      id: 'senior-design',
      status: 'PUBLISHED',
      seriesId: 'series-1',
      seriesLifeStage: 'LOW_ACTIVITY_ADULT_OR_SENIOR',
      publishedRecipeId: 'senior-recipe-business-id',
      publishedRecipeVersion: 1,
    }),
  );

  await service.publishDraft('senior-design', { name: '牛肉南瓜鲜食' }, 'staff-1');

  expect(prisma.recipe.create).toHaveBeenCalledWith({
    data: expect.objectContaining({
      seriesId: 'series-1',
      seriesLifeStage: 'LOW_ACTIVITY_ADULT_OR_SENIOR',
      version: 1,
      applicableLifeStages: ['LOW_ACTIVITY_ADULT_OR_SENIOR'],
    }),
  });
});
```

- [ ] **Step 2: Write failing public detail tests for matching and fallback**

Append to `backend/tests/interfaces/controllers/recipes.controller.spec.ts`:

```ts
describe('GET /api/v1/recipes/:id series selection', () => {
  it('returns the dog-matched concrete recipe for a series id', async () => {
    mockPrismaService.dog.findFirst.mockResolvedValue({
      id: 'dog-1',
      ownerId: 'customer-1',
      name: '小七',
      birthday: new Date('2024-05-31T00:00:00.000Z'),
      lifeStageOverride: 'NONE',
      activityLevel: 'NORMAL',
    });
    mockPrismaService.recipe.findFirst.mockResolvedValue({
      recipeId: 'adult-recipe-id',
      version: 3,
      status: 'PUBLIC',
      seriesId: 'series-1',
      seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
      name: '牛肉南瓜鲜食',
      energyDensityKcalPerKg: 1260,
      productionLossRate: 1.05,
      nutritionStandard: 'FEDIAF_2025',
      targetHealthTags: [],
      applicableLifeStages: ['HIGH_ACTIVITY_ADULT'],
      items: [],
    });
    mockPrismaService.recipe.findMany.mockResolvedValue([
      {
        recipeId: 'adult-recipe-id',
        version: 3,
        status: 'PUBLIC',
        seriesId: 'series-1',
        seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
      },
    ]);

    const response = await request(app.getHttpServer())
      .get('/api/v1/recipes/series-1?dogId=dog-1')
      .set('Authorization', 'Bearer customer-token')
      .expect(200);

    expect(response.body.data.id).toBe('adult-recipe-id');
    expect(response.body.data.seriesId).toBe('series-1');
    expect(response.body.data.selectedLifeStage).toBe('HIGH_ACTIVITY_ADULT');
    expect(response.body.data.lifeStageMatch.matchType).toBe('MATCHED');
  });
});
```

- [ ] **Step 3: Update publish target resolution**

Modify `backend/src/application/recipe-designer/recipe-designer.service.ts`.

When creating a recipe in `publishDraft`, include:

```ts
          seriesId: draft.seriesId ?? null,
          seriesLifeStage:
            draft.seriesLifeStage ??
            mapScenarioToSeriesLifeStage(draft.fediafDogScenario),
```

Replace publish target selection with:

```ts
private async resolvePublishTarget(draft: DesignRecipeWithItems) {
  if (draft.revisionBaseRecipeId) {
    const latest = await this.prisma.recipe.findFirst({
      where: { recipeId: draft.revisionBaseRecipeId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    return {
      recipeId: draft.revisionBaseRecipeId,
      version: (latest?.version ?? 0) + 1,
    };
  }

  if (draft.seriesId) {
    const lifeStage =
      draft.seriesLifeStage ?? mapScenarioToSeriesLifeStage(draft.fediafDogScenario);
    const existingStageRecipe = await this.prisma.recipe.findFirst({
      where: {
        seriesId: draft.seriesId,
        seriesLifeStage: lifeStage,
      },
      orderBy: { version: 'desc' },
      select: { recipeId: true, version: true },
    });
    if (existingStageRecipe) {
      return {
        recipeId: existingStageRecipe.recipeId,
        version: existingStageRecipe.version + 1,
      };
    }
  }

  return {
    recipeId: draft.id,
    version: 1,
  };
}
```

- [ ] **Step 4: Add response fields for selected stage**

Modify `backend/src/interfaces/dto/recipes/recipe-response.dto.ts`:

```ts
export interface RecipeLifeStageVersionDto {
  lifeStage: string;
  label: string;
  recipeId: string;
  isCurrent: boolean;
}

export interface RecipeLifeStageMatchDto {
  requestedLifeStage?: string;
  selectedLifeStage?: string;
  matchType: 'MATCHED' | 'FALLBACK_ADULT' | 'FALLBACK_FIRST' | 'LEGACY';
  message?: string;
}
```

Add optional fields to `RecipeSummaryDto`:

```ts
  @ApiPropertyOptional()
  seriesId?: string;
```

Add optional fields to `RecipeDetailDto`:

```ts
  @ApiPropertyOptional()
  seriesId?: string;

  @ApiPropertyOptional()
  selectedLifeStage?: string;

  @ApiPropertyOptional()
  selectedLifeStageLabel?: string;

  @ApiPropertyOptional()
  selectedRecipeId?: string;

  @ApiPropertyOptional()
  lifeStageMatch?: RecipeLifeStageMatchDto;

  @ApiPropertyOptional()
  availableLifeStageVersions?: RecipeLifeStageVersionDto[];
```

- [ ] **Step 5: Implement public series selection in `RecipesController`**

Modify `backend/src/interfaces/controllers/recipes.controller.ts`.

Import:

```ts
import {
  SERIES_LIFE_STAGE_LABELS,
  mapDogProfileToSeriesLifeStage,
  resolveDefaultSeriesLifeStage,
} from '../../domain/recipe/recipe-series';
```

Add query parameters to `getRecipe`:

```ts
    @Query('dogId') dogId?: string,
    @Query('lifeStage') lifeStage?: string,
```

Before loading the detail payload, resolve the selected concrete recipe:

```ts
    const selection = await this.resolveRecipeDetailSelection({
      id,
      dogId,
      requestedLifeStage: lifeStage,
      shareToken,
      req,
    });
    const recipe = selection.recipe;
    if (!recipe) {
      return ApiResponseDto.error(404, 'Recipe not found');
    }
```

Add helper:

```ts
private async resolveRecipeDetailSelection(params: {
  id: string;
  dogId?: string;
  requestedLifeStage?: string;
  shareToken?: string;
  req?: any;
}) {
  const directRecipe = await this.getAccessibleRecipe(
    params.id,
    params.shareToken,
    params.req,
  );
  const seriesId = (directRecipe as any)?.seriesId || params.id;
  const publicStageRows = await this.prisma.recipe.findMany({
    where: {
      seriesId,
      status: 'PUBLIC',
      seriesLifeStage: { not: null },
    },
    orderBy: [{ seriesLifeStage: 'asc' }, { version: 'desc' }],
  });

  if (publicStageRows.length === 0) {
    return {
      recipe: directRecipe,
      seriesId: (directRecipe as any)?.seriesId,
      selectedLifeStage: (directRecipe as any)?.seriesLifeStage,
      matchType: 'LEGACY' as const,
      availableLifeStageVersions: [],
    };
  }

  const latestByStage = new Map<string, any>();
  for (const row of publicStageRows) {
    if (!row.seriesLifeStage) continue;
    if (!latestByStage.has(row.seriesLifeStage)) {
      latestByStage.set(row.seriesLifeStage, row);
    }
  }

  const configuredStages = Array.from(latestByStage.keys());
  const requestedLifeStage =
    params.requestedLifeStage ||
    (await this.resolveDogRequestedLifeStage(params.dogId, params.req));
  const selectedLifeStage =
    requestedLifeStage && latestByStage.has(requestedLifeStage)
      ? requestedLifeStage
      : resolveDefaultSeriesLifeStage(configuredStages);
  const selectedRow = selectedLifeStage ? latestByStage.get(selectedLifeStage) : null;

  return {
    recipe: selectedRow
      ? await this.getAccessibleRecipe(selectedRow.recipeId, params.shareToken, params.req)
      : directRecipe,
    seriesId,
    selectedLifeStage,
    requestedLifeStage,
    matchType:
      requestedLifeStage && selectedLifeStage === requestedLifeStage
        ? 'MATCHED'
        : selectedLifeStage === 'HIGH_ACTIVITY_ADULT'
          ? 'FALLBACK_ADULT'
          : 'FALLBACK_FIRST',
    availableLifeStageVersions: configuredStages.map((stage) => ({
      lifeStage: stage,
      label: SERIES_LIFE_STAGE_LABELS[stage],
      recipeId: latestByStage.get(stage).recipeId,
      isCurrent: stage === selectedLifeStage,
    })),
  };
}
```

Add helper:

```ts
private async resolveDogRequestedLifeStage(dogId?: string, req?: any) {
  if (!dogId) return '';
  const dog = await this.prisma.dog.findFirst({
    where: { id: dogId },
    select: {
      birthday: true,
      lifeStageOverride: true,
      activityLevel: true,
    },
  });
  return dog ? mapDogProfileToSeriesLifeStage(dog) : '';
}
```

Populate detail response:

```ts
      seriesId: selection.seriesId,
      selectedLifeStage: selection.selectedLifeStage,
      selectedLifeStageLabel: selection.selectedLifeStage
        ? SERIES_LIFE_STAGE_LABELS[selection.selectedLifeStage]
        : undefined,
      selectedRecipeId: recipe.id,
      lifeStageMatch: {
        requestedLifeStage: selection.requestedLifeStage,
        selectedLifeStage: selection.selectedLifeStage,
        matchType: selection.matchType,
        message:
          selection.matchType === 'MATCHED' || selection.matchType === 'LEGACY'
            ? undefined
            : '当前狗狗档案没有完全匹配版本，已展示可用替代版本。',
      },
      availableLifeStageVersions: selection.availableLifeStageVersions,
```

- [ ] **Step 6: Run backend tests**

Run:

```bash
cd backend && npm test -- tests/application/recipe-designer/recipe-designer.service.spec.ts --runInBand
cd backend && npm test -- tests/interfaces/controllers/recipes.controller.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 7: Commit Task 3**

```bash
git add backend/src/application/recipe-designer/recipe-designer.service.ts backend/src/interfaces/dto/recipes/recipe-response.dto.ts backend/src/infrastructure/repositories/prisma-recipe.repository.ts backend/src/interfaces/controllers/recipes.controller.ts backend/tests/application/recipe-designer/recipe-designer.service.spec.ts backend/tests/interfaces/controllers/recipes.controller.spec.ts
git commit -m "feat: resolve public recipe series life-stage versions"
```

---

## Task 4: Miniapp Recipe Designer Series UI

**Files:**
- Modify: `miniapp/src/api/recipe-designer.ts`
- Modify: `miniapp/src/api/recipe-designer.spec.ts`
- Modify: `miniapp/src/pages/recipe-designer/list.vue`
- Modify: `miniapp/src/pages/recipe-designer/editor.vue`
- Modify: `miniapp/src/pages/recipe-designer/publish.vue`
- Modify: `miniapp/src/pages/recipe-designer.regression.spec.ts`

- [ ] **Step 1: Write failing API tests**

Add to `miniapp/src/api/recipe-designer.spec.ts`:

```ts
it('requests recipe designer series cards', () => {
  recipeDesignerApi.listSeries()

  expect(mockedRequest).toHaveBeenCalledWith({
    url: '/recipe-designer/series',
    method: 'GET',
  })
})

it('creates a stage draft under a series', () => {
  recipeDesignerApi.createSeriesStageDraft('series-1', { scenario: 'ADULT_MER_110' })

  expect(mockedRequest).toHaveBeenCalledWith({
    url: '/recipe-designer/series/series-1/stage-drafts',
    method: 'POST',
    data: { scenario: 'ADULT_MER_110' },
  })
})
```

- [ ] **Step 2: Run failing miniapp API tests**

Run:

```bash
cd miniapp && npm test -- src/api/recipe-designer.spec.ts
```

Expected: FAIL because the API methods do not exist.

- [ ] **Step 3: Add recipe designer series API methods**

Modify `miniapp/src/api/recipe-designer.ts`:

```ts
export type RecipeSeriesStageStatus =
  | 'NOT_DESIGNED'
  | 'DRAFT'
  | 'IN_REVIEW'
  | 'PUBLISHED'
  | 'NEEDS_CHANGES'

export interface RecipeDesignerSeriesStage {
  lifeStage: string
  label: string
  scenario: FediafDogScenario
  status: RecipeSeriesStageStatus
  draftId?: string | null
  recipeId?: string | null
  updatedAt?: string | null
}

export interface RecipeDesignerSeriesCard {
  id: string
  name: string
  updatedAt?: string
  publishedStageCount: number
  stages: RecipeDesignerSeriesStage[]
}

export interface CreateRecipeSeriesPayload {
  name: string
  scenario?: FediafDogScenario
}

export interface DeleteRecipeSeriesPayload {
  confirmName: string
  confirmUserVisibleRemoval: boolean
}
```

Add methods:

```ts
  listSeries: () => request({ url: '/recipe-designer/series', method: 'GET' }),
  createSeries: (data: CreateRecipeSeriesPayload) =>
    request({ url: '/recipe-designer/series', method: 'POST', data }),
  renameSeries: (seriesId: string, data: { name: string }) =>
    request({ url: `/recipe-designer/series/${seriesId}`, method: 'PATCH', data }),
  deleteSeries: (seriesId: string, data: DeleteRecipeSeriesPayload) =>
    request({ url: `/recipe-designer/series/${seriesId}`, method: 'DELETE', data }),
  createSeriesStageDraft: (seriesId: string, data: { scenario: FediafDogScenario }) =>
    request({ url: `/recipe-designer/series/${seriesId}/stage-drafts`, method: 'POST', data }),
```

- [ ] **Step 4: Replace designer list with series cards**

Modify `miniapp/src/pages/recipe-designer/list.vue`:

- Replace `drafts` with `seriesCards`.
- Use `recipeDesignerApi.listSeries()`.
- Render series name, recently edited datetime, `publishedStageCount`, five `stages`, and an overflow menu with `重命名` and `删除`.
- Remove visible cover, series id, `修订`, `进入编辑`, and `系列设置` actions.
- Stage row tap behavior:

```ts
async function openSeriesStage(series: RecipeDesignerSeriesCard, stage: RecipeDesignerSeriesStage) {
  if (stage.draftId) {
    uni.navigateTo({ url: `/pages/recipe-designer/editor?id=${stage.draftId}` })
    return
  }

  const res: any = await recipeDesignerApi.createSeriesStageDraft(series.id, {
    scenario: stage.scenario,
  })
  const draft = res?.data ?? res
  if (draft?.id) {
    uni.navigateTo({ url: `/pages/recipe-designer/editor?id=${draft.id}` })
    return
  }
  uni.showToast({ title: '进入阶段失败', icon: 'none' })
}
```

Use status labels:

```ts
const seriesStageStatusLabels: Record<RecipeSeriesStageStatus, string> = {
  NOT_DESIGNED: '未设计',
  DRAFT: '草稿',
  IN_REVIEW: '审核中',
  PUBLISHED: '已发布',
  NEEDS_CHANGES: '需修改',
}
```

- [ ] **Step 5: Update editor read-only copy**

Modify `miniapp/src/pages/recipe-designer/editor.vue`.

Change the read-only button label:

```vue
{{ creatingRevision ? '进入中' : '编辑' }}
```

Change the banner copy:

```vue
<text class="readonly-title">已发布版本只读</text>
<text class="readonly-copy">点击编辑后进入草稿，不影响当前上架版本。</text>
```

Change failed toast text in `createRevisionFromPublishedDraft`:

```ts
uni.showToast({ title: '进入编辑失败', icon: 'none' })
```

- [ ] **Step 6: Add editor context and stage switch entry**

In `miniapp/src/pages/recipe-designer/editor.vue`, add context state:

```ts
const draftSeriesId = ref('')
const draftSeriesLifeStage = ref('')
const availableSeriesStages = ref<any[]>([])
```

Set them in `loadDraft()`:

```ts
draftSeriesId.value = String(draft.seriesId || '')
draftSeriesLifeStage.value = String(draft.seriesLifeStage || '')
availableSeriesStages.value = Array.isArray(draft.seriesStages) ? draft.seriesStages : []
```

Add a compact top context block above ingredients:

```vue
<view class="editor-context-card" v-if="draftSeriesLifeStage">
  <text class="editor-context-title">{{ draftName }} · {{ getLifeStageLabel(draftSeriesLifeStage) }}</text>
  <text class="editor-context-subtitle">{{ assessmentStandardContextLabel }}</text>
</view>
```

- [ ] **Step 7: Run miniapp designer tests**

Run:

```bash
cd miniapp && npm test -- src/api/recipe-designer.spec.ts src/pages/recipe-designer.regression.spec.ts
```

Expected: PASS.

- [ ] **Step 8: Commit Task 4**

```bash
git add miniapp/src/api/recipe-designer.ts miniapp/src/api/recipe-designer.spec.ts miniapp/src/pages/recipe-designer/list.vue miniapp/src/pages/recipe-designer/editor.vue miniapp/src/pages/recipe-designer/publish.vue miniapp/src/pages/recipe-designer.regression.spec.ts
git commit -m "feat: show recipe designer series stage cards"
```

---

## Task 5: Miniapp Public Recipe Showcase, Detail, and Order Handoff

**Files:**
- Modify: `miniapp/src/pages/home/index.vue`
- Modify: `miniapp/src/pages/recipe-list/index.vue`
- Modify: `miniapp/src/pages/recipe-detail/index.vue`
- Modify: `miniapp/src/pages/recipe-order/index.vue`
- Modify: `miniapp/src/pages/recipe-detail.regression.spec.ts`
- Modify: `miniapp/src/pages/recipe-order.regression.spec.ts`

- [ ] **Step 1: Write failing recipe-detail regression tests**

Add to `miniapp/src/pages/recipe-detail.regression.spec.ts`:

```ts
it('does not render the old life-stage tag loop in the recipe header', () => {
  const source = readFileSync(resolve(projectRoot, 'src/pages/recipe-detail/index.vue'), 'utf8')

  expect(source).not.toContain('v-for="stage in recipe.applicableLifeStages"')
  expect(source).toContain('availableLifeStageVersions')
  expect(source).toContain('lifeStageMatch')
})

it('orders with selectedRecipeId instead of the original series route id', () => {
  const source = readFileSync(resolve(projectRoot, 'src/pages/recipe-detail/index.vue'), 'utf8')

  expect(source).toContain('selectedRecipeIdForActions')
  expect(source).toContain('recipeId=${encodeURIComponent(selectedRecipeIdForActions.value)}')
})
```

- [ ] **Step 2: Run failing miniapp public tests**

Run:

```bash
cd miniapp && npm test -- src/pages/recipe-detail.regression.spec.ts src/pages/recipe-order.regression.spec.ts
```

Expected: FAIL because the old detail page still renders life-stage tags and routes with the original `recipeId`.

- [ ] **Step 3: Remove life-stage tags from showcase cards**

Modify `miniapp/src/pages/home/index.vue`:

- Remove the `v-for="stage in recipe.applicableLifeStages"` card chip block.
- Keep health tags and user-friendly cards.
- Keep `viewRecipe(recipeId)` navigation, because the backend list returns the default concrete recipe id for each series.

Modify `miniapp/src/pages/recipe-list/index.vue`:

- Add optional `seriesId` to the `Recipe` interface.
- Do not render `applicableLifeStages`.
- Continue navigating with `recipe.id`.

- [ ] **Step 4: Add detail fields and selector state**

Modify `miniapp/src/pages/recipe-detail/index.vue`.

Extend `RecipeDetail`:

```ts
interface RecipeLifeStageVersion {
  lifeStage: string
  label: string
  recipeId: string
  isCurrent: boolean
}

interface RecipeLifeStageMatch {
  requestedLifeStage?: string
  selectedLifeStage?: string
  matchType: 'MATCHED' | 'FALLBACK_ADULT' | 'FALLBACK_FIRST' | 'LEGACY'
  message?: string
}
```

Add fields:

```ts
  seriesId?: string
  selectedRecipeId?: string
  selectedLifeStage?: string
  selectedLifeStageLabel?: string
  lifeStageMatch?: RecipeLifeStageMatch
  availableLifeStageVersions?: RecipeLifeStageVersion[]
```

Add state:

```ts
const selectedManualLifeStage = ref('')
const lifeStageSelectorVisible = ref(false)

const selectedRecipeIdForActions = computed(() => {
  return recipe.value.selectedRecipeId || recipe.value.id || recipeId.value
})
```

- [ ] **Step 5: Load details with dog and manual stage context**

Modify `loadRecipeDetail()` request data:

```ts
  const data: any = {}
  if (shareToken.value) data.shareToken = shareToken.value
  if (selectedDogId.value) data.dogId = selectedDogId.value
  if (selectedManualLifeStage.value) data.lifeStage = selectedManualLifeStage.value
```

After setting `recipe.value = res.data`, update `recipeId.value` only for actions:

```ts
      recipe.value = res.data
      if (res.data.selectedRecipeId) {
        recipe.value.id = res.data.selectedRecipeId
      }
```

Update favorite, track, DIY, order, cart, review, and share calls to use `selectedRecipeIdForActions.value`.

- [ ] **Step 6: Add detail page stage card and selector**

Replace the old “适用于” tag section with:

```vue
<view class="life-stage-version-card" v-if="recipe.selectedLifeStageLabel">
  <view class="life-stage-version-main">
    <text>{{ lifeStageVersionTitle }}</text>
    <button class="life-stage-switch-btn" @tap="lifeStageSelectorVisible = true">切换</button>
  </view>
  <text class="life-stage-version-copy">{{ lifeStageVersionCopy }}</text>
</view>
```

Add computed labels:

```ts
const lifeStageVersionTitle = computed(() => {
  if (!recipe.value.selectedLifeStageLabel) return ''
  return recipe.value.lifeStageMatch?.matchType === 'MATCHED'
    ? `已匹配：${recipe.value.selectedLifeStageLabel}`
    : `当前展示：${recipe.value.selectedLifeStageLabel}`
})

const lifeStageVersionCopy = computed(() => {
  if (recipe.value.lifeStageMatch?.message) return recipe.value.lifeStageMatch.message
  return selectedDog.value
    ? `根据${selectedDog.value.name}的档案自动展示该生命阶段版本。`
    : '可切换查看该食谱已开放的生命阶段版本。'
})
```

Add selector sheet:

```vue
<view v-if="lifeStageSelectorVisible" class="life-stage-sheet-mask" @tap="lifeStageSelectorVisible = false">
  <view class="life-stage-sheet" @tap.stop>
    <view class="life-stage-sheet-title">选择生命阶段版本</view>
    <view
      v-for="stage in recipe.availableLifeStageVersions || []"
      :key="stage.lifeStage"
      :class="['life-stage-sheet-option', { active: stage.isCurrent }]"
      @tap="selectRecipeLifeStage(stage)"
    >
      <text>{{ stage.label }}</text>
      <text>{{ stage.isCurrent ? '当前' : '可切换' }}</text>
    </view>
  </view>
</view>
```

Add method:

```ts
function selectRecipeLifeStage(stage: RecipeLifeStageVersion) {
  selectedManualLifeStage.value = stage.lifeStage
  lifeStageSelectorVisible.value = false
  loadRecipeDetail()
}
```

- [ ] **Step 7: Carry selected concrete recipe into order**

Modify `goToOrder()`:

```ts
  const query = [`recipeId=${encodeURIComponent(selectedRecipeIdForActions.value)}`]
  if (recipe.value.selectedLifeStage) {
    query.push(`lifeStage=${encodeURIComponent(recipe.value.selectedLifeStage)}`)
  }
  uni.navigateTo({
    url: `/pages/recipe-order/index?${query.join('&')}`
  })
```

Modify `miniapp/src/pages/recipe-order/index.vue`:

- Read `lifeStage` from page options.
- Include `lifeStage` in display state.
- Remove old top `v-for="stage in recipe.applicableLifeStages"` block or move it below as a non-primary detail.

- [ ] **Step 8: Run miniapp tests and preview build**

Run:

```bash
cd miniapp && npm test -- src/pages/recipe-detail.regression.spec.ts src/pages/recipe-order.regression.spec.ts
cd miniapp && npm run preview
```

Expected: tests pass and preview output is generated under `miniapp/dist/dev/mp-weixin`.

- [ ] **Step 9: Commit Task 5**

```bash
git add miniapp/src/pages/home/index.vue miniapp/src/pages/recipe-list/index.vue miniapp/src/pages/recipe-detail/index.vue miniapp/src/pages/recipe-order/index.vue miniapp/src/pages/recipe-detail.regression.spec.ts miniapp/src/pages/recipe-order.regression.spec.ts
git commit -m "feat: match miniapp recipe detail by life stage"
```

---

## Task 6: Admin Web Recipe Series Visibility

**Files:**
- Modify: `backend/src/application/recipe/recipe.service.ts`
- Modify: `backend/src/interfaces/dto/recipes/admin-recipe.dto.ts`
- Modify: `admin-web/src/types/recipe.ts`
- Modify: `admin-web/src/api/recipes.ts`
- Modify: `admin-web/src/views/Recipes/index.vue`
- Modify: `admin-web/src/views/Recipes/RecipeForm.vue`

- [ ] **Step 1: Add backend admin list fields**

Modify `backend/src/interfaces/dto/recipes/admin-recipe.dto.ts` to include:

```ts
export interface RecipeSeriesStageSummaryDto {
  lifeStage: string;
  label: string;
  status: 'NOT_DESIGNED' | 'DRAFT' | 'PUBLIC' | 'PRIVATE_CUSTOM';
  recipeId?: string;
  version?: number;
  updatedAt?: string;
}
```

Add to `RecipeSummaryResponseDto`:

```ts
  seriesId?: string;
  seriesName?: string;
  seriesStages?: RecipeSeriesStageSummaryDto[];
```

- [ ] **Step 2: Group admin recipe list by series**

Modify `backend/src/application/recipe/recipe.service.ts` list response mapping:

- If recipes have `seriesId`, group them by `seriesId`.
- Use series name as display name.
- Include `seriesStages` for five stages.
- For legacy recipes without `seriesId`, keep current row behavior.

Use `ORDERED_RECIPE_SERIES_LIFE_STAGES` and `SERIES_LIFE_STAGE_LABELS` from `backend/src/domain/recipe/recipe-series.ts`.

- [ ] **Step 3: Add admin-web types**

Modify `admin-web/src/types/recipe.ts`:

```ts
export interface RecipeSeriesStageSummary {
  lifeStage: string;
  label: string;
  status: 'NOT_DESIGNED' | 'DRAFT' | 'PUBLIC' | 'PRIVATE_CUSTOM';
  recipeId?: string;
  version?: number;
  updatedAt?: string;
}
```

Add to `RecipeSummary`:

```ts
  seriesId?: string;
  seriesName?: string;
  seriesStages?: RecipeSeriesStageSummary[];
```

- [ ] **Step 4: Update admin recipe table**

Modify `admin-web/src/views/Recipes/index.vue`:

- Change the name column to display `row.seriesName || row.name`.
- Replace the life-stage tag column with five stage chips from `row.seriesStages`.
- Keep publish/unpublish/delete actions targeting the selected concrete row when `row.recipeId` exists.

Add status label helper:

```ts
const SeriesStageStatusLabels: Record<string, string> = {
  NOT_DESIGNED: '未设计',
  DRAFT: '草稿',
  PUBLIC: '已发布',
  PRIVATE_CUSTOM: '私密定制',
}
```

- [ ] **Step 5: Build admin web**

Run:

```bash
cd admin-web && npm run build
```

Expected: build succeeds.

- [ ] **Step 6: Commit Task 6**

```bash
git add backend/src/application/recipe/recipe.service.ts backend/src/interfaces/dto/recipes/admin-recipe.dto.ts admin-web/src/types/recipe.ts admin-web/src/api/recipes.ts admin-web/src/views/Recipes/index.vue admin-web/src/views/Recipes/RecipeForm.vue
git commit -m "feat: show admin recipes as life-stage series"
```

---

## Task 7: Backfill and Full Verification

**Files:**
- Create: `backend/scripts/backfill-recipe-series.ts`
- Create: `backend/tests/scripts/backfill-recipe-series.spec.ts`
- Modify: `docs/superpowers/plans/2026-05-31-multi-life-stage-recipe-series.md` only if command names change during implementation.

- [ ] **Step 1: Write failing backfill tests**

Create `backend/tests/scripts/backfill-recipe-series.spec.ts`:

```ts
import {
  buildRecipeSeriesBackfillPlan,
  inferSeriesLifeStageFromRecipe,
} from '../../scripts/backfill-recipe-series';

describe('recipe series backfill', () => {
  it('infers adult fallback when legacy recipe has no explicit stage', () => {
    expect(
      inferSeriesLifeStageFromRecipe({
        applicableLifeStages: [],
        nutritionDetailedData: null,
      }),
    ).toBe('HIGH_ACTIVITY_ADULT');
  });

  it('creates one series per legacy recipe family', () => {
    const plan = buildRecipeSeriesBackfillPlan([
      {
        recipeId: 'recipe-a',
        name: '牛肉南瓜鲜食',
        version: 1,
        seriesId: null,
        applicableLifeStages: ['HIGH_ACTIVITY_ADULT'],
      },
      {
        recipeId: 'recipe-a',
        name: '牛肉南瓜鲜食',
        version: 2,
        seriesId: null,
        applicableLifeStages: ['HIGH_ACTIVITY_ADULT'],
      },
    ]);

    expect(plan.seriesToCreate).toHaveLength(1);
    expect(plan.recipeUpdates).toHaveLength(2);
    expect(plan.recipeUpdates[0]).toEqual(
      expect.objectContaining({
        recipeId: 'recipe-a',
        seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
      }),
    );
  });
});
```

- [ ] **Step 2: Run failing backfill tests**

Run:

```bash
cd backend && npm test -- tests/scripts/backfill-recipe-series.spec.ts --runInBand
```

Expected: FAIL because the script does not exist.

- [ ] **Step 3: Implement dry-run backfill script**

Create `backend/scripts/backfill-recipe-series.ts`:

```ts
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import {
  ORDERED_RECIPE_SERIES_LIFE_STAGES,
  type RecipeSeriesLifeStage,
} from '../src/domain/recipe/recipe-series';

export function inferSeriesLifeStageFromRecipe(recipe: {
  applicableLifeStages?: string[] | null;
  nutritionDetailedData?: any;
}): RecipeSeriesLifeStage {
  const stages = Array.isArray(recipe.applicableLifeStages)
    ? recipe.applicableLifeStages
    : [];
  return (
    ORDERED_RECIPE_SERIES_LIFE_STAGES.find((stage) => stages.includes(stage)) ??
    'HIGH_ACTIVITY_ADULT'
  );
}

export function buildRecipeSeriesBackfillPlan(
  recipes: Array<{
    recipeId: string;
    name: string;
    version: number;
    seriesId?: string | null;
    applicableLifeStages?: string[] | null;
    nutritionDetailedData?: any;
  }>,
) {
  const seriesByRecipeId = new Map<string, { id: string; name: string }>();
  const seriesToCreate: Array<{ id: string; name: string }> = [];
  const recipeUpdates: Array<{
    recipeId: string;
    version: number;
    seriesId: string;
    seriesLifeStage: RecipeSeriesLifeStage;
  }> = [];

  for (const recipe of recipes) {
    if (recipe.seriesId) continue;
    let series = seriesByRecipeId.get(recipe.recipeId);
    if (!series) {
      series = { id: randomUUID(), name: recipe.name };
      seriesByRecipeId.set(recipe.recipeId, series);
      seriesToCreate.push(series);
    }
    recipeUpdates.push({
      recipeId: recipe.recipeId,
      version: recipe.version,
      seriesId: series.id,
      seriesLifeStage: inferSeriesLifeStageFromRecipe(recipe),
    });
  }

  return { seriesToCreate, recipeUpdates };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const prisma = new PrismaClient();
  const recipes = await prisma.recipe.findMany({
    where: { seriesId: null },
    select: {
      recipeId: true,
      name: true,
      version: true,
      seriesId: true,
      applicableLifeStages: true,
      nutritionDetailedData: true,
    },
    orderBy: [{ recipeId: 'asc' }, { version: 'asc' }],
  });
  const plan = buildRecipeSeriesBackfillPlan(recipes as any[]);
  console.log(JSON.stringify({
    apply,
    seriesToCreate: plan.seriesToCreate.length,
    recipeUpdates: plan.recipeUpdates.length,
  }, null, 2));

  if (!apply) {
    await prisma.$disconnect();
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const series of plan.seriesToCreate) {
      await tx.recipeSeries.create({ data: series });
    }
    for (const update of plan.recipeUpdates) {
      await tx.recipe.update({
        where: {
          recipeId_version: {
            recipeId: update.recipeId,
            version: update.version,
          },
        },
        data: {
          seriesId: update.seriesId,
          seriesLifeStage: update.seriesLifeStage,
        },
      });
    }
  });
  await prisma.$disconnect();
}

if (require.main === module) {
  void main();
}
```

- [ ] **Step 4: Run full backend verification**

Run:

```bash
cd backend && npm test -- tests/domain/recipe/recipe-series.spec.ts tests/application/recipe-designer/recipe-designer.service.spec.ts tests/interfaces/controllers/recipe-designer.controller.spec.ts tests/interfaces/controllers/recipes.controller.spec.ts tests/scripts/backfill-recipe-series.spec.ts --runInBand
cd backend && npm run build
```

Expected: all tests pass and backend builds.

- [ ] **Step 5: Run miniapp verification**

Run:

```bash
cd miniapp && npm test
cd miniapp && npm run preview
```

Expected: Vitest passes and preview output is generated under `miniapp/dist/dev/mp-weixin`.

- [ ] **Step 6: Run admin web verification**

Run:

```bash
cd admin-web && npm run build
```

Expected: build succeeds.

- [ ] **Step 7: Commit Task 7**

```bash
git add backend/scripts/backfill-recipe-series.ts backend/tests/scripts/backfill-recipe-series.spec.ts
git commit -m "feat: backfill recipe series metadata"
```

---

## Final Manual Acceptance

- [ ] Open the recipe designer list and confirm each series card shows five life-stage rows, no cover, no series id, and no visible “进入编辑 / 系列设置 / 修订” action.
- [ ] Tap a published stage and confirm the existing editor opens read-only with an “编辑” button.
- [ ] Tap “编辑” and confirm it opens an existing revision draft or creates one without exposing “创建修订草稿” wording.
- [ ] Tap an unconfigured stage and confirm it creates a new stage draft in the existing editor page.
- [ ] Publish one stage and confirm only that stage status changes.
- [ ] Open miniapp recipe showcase and confirm a series appears once, without life-stage tags.
- [ ] Open detail with an adult dog and confirm the adult version is auto-selected.
- [ ] Open detail with a reproduction-stage dog and no reproduction version, and confirm the mismatch warning appears.
- [ ] Manually switch a life-stage version and continue to order; confirm order uses the selected concrete recipe id.
- [ ] In admin web, confirm recipe list shows series-level stage status instead of duplicate rows per stage.

## Rollback Notes

- If the migration is applied but frontend work is not complete, public APIs still return concrete recipe ids because legacy recipe rows remain intact.
- If miniapp detail selection causes an ordering issue, temporarily route `goToOrder()` with `recipe.value.id` only after detail has loaded, because the backend detail response always resolves to a concrete recipe id.
- Do not delete `Recipe` rows for published versions during rollback. Set affected series status to `DELETED` or recipe status to `DRAFT` to hide user-facing content while preserving order and audit references.
