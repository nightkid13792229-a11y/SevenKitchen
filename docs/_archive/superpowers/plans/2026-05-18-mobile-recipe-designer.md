# Mobile Recipe Designer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first mobile recipe designer MVP: staff can create design drafts, edit free-total ingredient grams, evaluate against FEDIAF 2025 dog scenarios, and publish safe or reviewed drafts into the existing Recipe system.

**Architecture:** Backend owns all nutrition math, FEDIAF target lookup, draft persistence, review gating, and publish snapshots. The miniapp only edits draft state and displays grouped assessment results returned by the backend. Existing Recipe records remain separate from design drafts until an explicit publish action creates a formal recipe version.

**Tech Stack:** NestJS, Prisma, PostgreSQL, Jest, Vue 3, uni-app, Vitest.

---

## Scope And Preconditions

This plan implements the mobile designer described in `docs/superpowers/specs/2026-05-18-mobile-recipe-designer-design.md`.

Before Task 1, verify the FEDIAF 2025 standard-library work exists in the current implementation branch. The plan expects a backend-readable source that can return targets for these scenario codes:

- `EARLY_GROWTH_REPRODUCTION`
- `LATE_GROWTH`
- `ADULT_MER_95`
- `ADULT_MER_110`

If the branch only has the historical `NutritionStandardFediaf` single table, implement the FEDIAF 2025 standard-library plan first, then resume this plan. Do not collapse the four scenarios into adult/puppy shortcuts.

## File Structure

Backend files:

- Modify `backend/prisma/schema.prisma`: add mobile-draft fields, free-total weights, publish snapshots, review fields, and FEDIAF scenario enum.
- Create `backend/tests/prisma/mobile-recipe-designer-schema.spec.ts`: schema guard tests for fields and defaults.
- Create `backend/src/domain/recipe-designer/types.ts`: shared calculation and DTO-independent domain types.
- Create `backend/src/domain/recipe-designer/nutrition-profile-reader.ts`: reads structured `Ingredient.nutritionProfile` and `NutritionFood.nutritionData` values.
- Create `backend/src/domain/recipe-designer/recipe-assessment.ts`: pure FEDIAF assessment math.
- Create `backend/tests/domain/recipe-designer/recipe-assessment.spec.ts`: free-total, missing-data, combination, ratio, and scenario tests.
- Create `backend/src/application/recipe-designer/recipe-designer.service.ts`: draft CRUD, assessment orchestration, and publish gating.
- Create `backend/tests/application/recipe-designer/recipe-designer.service.spec.ts`: service tests with mocked Prisma and mocked standard targets.
- Create `backend/src/interfaces/dto/recipe-designer/recipe-designer.dto.ts`: request and response DTOs.
- Create `backend/src/interfaces/controllers/recipe-designer.controller.ts`: authenticated staff endpoints.
- Create `backend/tests/interfaces/controllers/recipe-designer.controller.spec.ts`: endpoint contract tests.
- Modify `backend/src/app.module.ts`: register controller and service.
- Modify `backend/src/domain/recipe/enums.ts`: add `FEDIAF_2025` to `NutritionStandard`.

Miniapp files:

- Create `miniapp/src/api/recipe-designer.ts`: typed API helper methods.
- Create `miniapp/src/api/recipe-designer.spec.ts`: request-path regression tests.
- Create `miniapp/src/pages/recipe-designer/list.vue`: mobile draft list.
- Create `miniapp/src/pages/recipe-designer/editor.vue`: mobile editor with bottom assessment summary.
- Create `miniapp/src/pages/recipe-designer/publish.vue`: publish and review confirmation page.
- Create `miniapp/src/pages/recipe-designer/assessment.ts`: display helpers for assessment statuses and scenario labels.
- Create `miniapp/src/pages/recipe-designer.regression.spec.ts`: static UI and behavior guard tests.
- Modify `miniapp/src/pages/staff-workbench/index.vue`: add entry to recipe designer.
- Modify `miniapp/src/pages.json`: add recipe-designer pages if this branch uses the full pages manifest; otherwise mirror the current manifest strategy used by the branch owner.

Docs and verification:

- Add this plan only. Do not modify the approved spec unless the user asks for a design change.

## Task 1: Schema Guards And Prisma Model Updates

**Files:**

- Create: `backend/tests/prisma/mobile-recipe-designer-schema.spec.ts`
- Modify: `backend/prisma/schema.prisma`

- [ ] **Step 1: Write schema guard tests**

Create `backend/tests/prisma/mobile-recipe-designer-schema.spec.ts`:

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const schema = readFileSync(
  resolve(process.cwd(), 'prisma/schema.prisma'),
  'utf8',
);

describe('mobile recipe designer schema', () => {
  it('keeps FEDIAF 2025 dog scenarios explicit', () => {
    expect(schema).toContain('enum FediafDogScenario');
    expect(schema).toContain('EARLY_GROWTH_REPRODUCTION');
    expect(schema).toContain('LATE_GROWTH');
    expect(schema).toContain('ADULT_MER_95');
    expect(schema).toContain('ADULT_MER_110');
  });

  it('stores design recipe free-total fields without 1kg wording', () => {
    expect(schema).toContain('fediafDogScenario');
    expect(schema).toContain('@map("fediaf_dog_scenario")');
    expect(schema).toContain('totalWeightG');
    expect(schema).toContain('@map("total_weight_g")');
    expect(schema).toContain('assessmentSummary');
    expect(schema).toContain('@map("assessment_summary")');
    expect(schema).toContain('missingDataReport');
    expect(schema).toContain('@map("missing_data_report")');
    expect(schema).not.toContain('weight_per_kg_g Float');
  });

  it('stores review and publish snapshot records separately from recipes', () => {
    expect(schema).toContain('enum DesignRecipeReviewStatus');
    expect(schema).toContain('model DesignRecipePublishSnapshot');
    expect(schema).toContain('reviewStatus');
    expect(schema).toContain('@map("review_status")');
    expect(schema).toContain('snapshotData');
    expect(schema).toContain('@map("snapshot_data")');
  });
});
```

- [ ] **Step 2: Run schema guard tests and verify failure**

Run:

```bash
cd backend && npm test -- --runInBand tests/prisma/mobile-recipe-designer-schema.spec.ts
```

Expected: fail because `FediafDogScenario`, free-total fields, review fields, and publish snapshots are not in `schema.prisma`.

- [ ] **Step 3: Update Prisma schema**

In `backend/prisma/schema.prisma`, replace the existing recipe-designer enum and models with this shape. Keep historical migration files untouched.

```prisma
enum DesignRecipeStatus {
  DRAFT
  COMPLIANT
  NEEDS_REVIEW
  PUBLISHED
  ARCHIVED
}

enum DesignRecipeReviewStatus {
  NONE
  REQUIRED
  APPROVED
}

enum FediafDogScenario {
  EARLY_GROWTH_REPRODUCTION
  LATE_GROWTH
  ADULT_MER_95
  ADULT_MER_110
}

model DesignRecipe {
  id                     String                        @id @default(uuid()) @map("id")
  name                   String                        @map("name") @db.VarChar(200)
  version                Int                           @default(1) @map("version")
  status                 DesignRecipeStatus            @default(DRAFT) @map("status")
  fediafDogScenario      FediafDogScenario             @default(ADULT_MER_110) @map("fediaf_dog_scenario")
  energyDensityKcalPerKg Float                         @default(0) @map("energy_density_kcal_per_kg")
  totalWeightG           Float                         @default(0) @map("total_weight_g")
  nutritionStandard      String                        @default("FEDIAF_2025") @map("nutrition_standard")
  calculatedNutrition    Json                          @default("{}") @map("calculated_nutrition")
  complianceStatus       Json                          @default("{}") @map("compliance_status")
  assessmentSummary      Json                          @default("{}") @map("assessment_summary")
  missingDataReport      Json                          @default("[]") @map("missing_data_report")
  complianceScore        Float                         @default(0) @map("compliance_score")
  isCompliant            Boolean                       @default(false) @map("is_compliant")
  reviewStatus           DesignRecipeReviewStatus      @default(NONE) @map("review_status")
  reviewNote             String?                       @map("review_note")
  reviewedBy             String?                       @map("reviewed_by")
  reviewedAt             DateTime?                     @map("reviewed_at")
  targetHealthTags       String[]                      @default([]) @map("target_health_tags")
  applicableLifeStages   String[]                      @default([]) @map("applicable_life_stages")
  notes                  String?                       @map("notes")
  createdBy              String                        @map("created_by")
  publishedAt            DateTime?                     @map("published_at")
  publishedRecipeId      String?                       @map("published_recipe_id")
  createdAt              DateTime                      @default(now()) @map("created_at")
  updatedAt              DateTime                      @updatedAt @map("updated_at")
  items                  DesignRecipeItem[]
  publishSnapshots       DesignRecipePublishSnapshot[]

  @@unique([name, version])
  @@index([status])
  @@index([createdBy])
  @@index([isCompliant])
  @@index([fediafDogScenario])
  @@map("design_recipe")
}

model DesignRecipeItem {
  id                  String        @id @default(uuid()) @map("id")
  designRecipeId      String        @map("design_recipe_id")
  nutritionFoodId     String        @map("nutrition_food_id")
  weightG             Float         @map("weight_g")
  ratioPercent        Float?        @map("ratio_percent")
  preparationMethod   String?       @map("preparation_method") @db.VarChar(100)
  nutrientTargetKey   String?       @map("nutrient_target_key")
  nutrientTargetValue Float?        @map("nutrient_target_value")
  sortOrder           Int           @default(0) @map("sort_order")
  createdAt           DateTime      @default(now()) @map("created_at")
  updatedAt           DateTime      @updatedAt @map("updated_at")
  designRecipe        DesignRecipe  @relation(fields: [designRecipeId], references: [id], onDelete: Cascade)
  nutritionFood       NutritionFood @relation(fields: [nutritionFoodId], references: [id])

  @@index([designRecipeId])
  @@index([nutritionFoodId])
  @@map("design_recipe_item")
}

model DesignRecipePublishSnapshot {
  id              String       @id @default(uuid()) @map("id")
  designRecipeId  String       @map("design_recipe_id")
  recipeId        String       @map("recipe_id")
  snapshotData    Json         @map("snapshot_data")
  reviewStatus    DesignRecipeReviewStatus @map("review_status")
  reviewNote      String?      @map("review_note")
  publishedBy     String       @map("published_by")
  publishedAt     DateTime     @default(now()) @map("published_at")
  designRecipe    DesignRecipe @relation(fields: [designRecipeId], references: [id], onDelete: Cascade)

  @@index([designRecipeId])
  @@index([recipeId])
  @@map("design_recipe_publish_snapshot")
}
```

- [ ] **Step 4: Add migration**

Run:

```bash
cd backend && npx prisma migrate dev --name mobile_recipe_designer_free_total
```

Expected: Prisma creates a new migration under `backend/prisma/migrations/<timestamp>_mobile_recipe_designer_free_total/migration.sql`.

- [ ] **Step 5: Generate Prisma client**

Run:

```bash
cd backend && npx prisma generate
```

Expected: command exits with code 0 and generated Prisma client includes `FediafDogScenario`, `DesignRecipeReviewStatus`, and `DesignRecipePublishSnapshot`.

- [ ] **Step 6: Run schema tests**

Run:

```bash
cd backend && npm test -- --runInBand tests/prisma/mobile-recipe-designer-schema.spec.ts
```

Expected: pass.

- [ ] **Step 7: Commit Task 1**

Run:

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations backend/tests/prisma/mobile-recipe-designer-schema.spec.ts
git commit -m "feat: add mobile recipe designer schema"
```

## Task 2: Pure Assessment Domain

**Files:**

- Create: `backend/src/domain/recipe-designer/types.ts`
- Create: `backend/src/domain/recipe-designer/nutrition-profile-reader.ts`
- Create: `backend/src/domain/recipe-designer/recipe-assessment.ts`
- Create: `backend/tests/domain/recipe-designer/recipe-assessment.spec.ts`

- [ ] **Step 1: Write domain tests**

Create `backend/tests/domain/recipe-designer/recipe-assessment.spec.ts`:

```ts
import {
  assessRecipeDraft,
  type DesignRecipeAssessmentInput,
} from '../../../src/domain/recipe-designer/recipe-assessment';

const adultProteinTarget = {
  nutrientKey: 'crudeProtein',
  label: '粗蛋白',
  category: 'MACRO',
  expressionBasis: 'PER_1000_KCAL_ME',
  unit: 'g',
  minValue: 45,
  maxValue: null,
  fieldPaths: ['macros.crudeProtein'],
};

function makeInput(weightMultiplier = 1): DesignRecipeAssessmentInput {
  return {
    scenario: 'ADULT_MER_95',
    items: [
      {
        id: 'item-beef',
        name: '牛肉',
        weightG: 400 * weightMultiplier,
        nutritionProfile: {
          meta: { rawBasisType: 'PER_100_G' },
          macros: {
            energyKcal: 200,
            moisture: 65,
            crudeProtein: 20,
            crudeFat: 10,
            ash: 1,
            carbohydrate: 0,
            fiber: 0,
            solubleFiber: null,
            insolubleFiber: null,
          },
          minerals: {
            calcium: 10,
            phosphorus: 180,
            potassium: null,
            sodium: null,
            magnesium: null,
            chloride: null,
            iron: null,
            zinc: null,
            copper: null,
            manganese: null,
            selenium: null,
            iodine: null,
          },
          vitamins: {},
          fattyAcids: {},
          aminoAcids: {},
          customItems: [],
        },
      },
      {
        id: 'item-rice',
        name: '米饭',
        weightG: 500 * weightMultiplier,
        nutritionProfile: {
          meta: { rawBasisType: 'PER_100_G' },
          macros: {
            energyKcal: 130,
            moisture: 70,
            crudeProtein: 2.5,
            crudeFat: 0.3,
            ash: 0.2,
            carbohydrate: 28,
            fiber: 0.4,
            solubleFiber: null,
            insolubleFiber: null,
          },
          minerals: {},
          vitamins: {},
          fattyAcids: {},
          aminoAcids: {},
          customItems: [],
        },
      },
    ],
    targets: [adultProteinTarget],
  };
}

describe('recipe designer assessment', () => {
  it('uses free total grams and does not require a 1kg recipe', () => {
    const result = assessRecipeDraft(makeInput());

    expect(result.totalWeightG).toBe(900);
    expect(result.energyDensityKcalPerKg).toBeCloseTo(1611.111, 3);
    expect(result.items).toEqual([
      expect.objectContaining({ id: 'item-beef', ratioPercent: 44.44444444444444 }),
      expect.objectContaining({ id: 'item-rice', ratioPercent: 55.55555555555556 }),
    ]);
    expect(result.normalizedToKg).toBe(false);
  });

  it('keeps per-energy assessment stable when the same recipe is doubled', () => {
    const base = assessRecipeDraft(makeInput(1));
    const doubled = assessRecipeDraft(makeInput(2));

    expect(base.totalWeightG).toBe(900);
    expect(doubled.totalWeightG).toBe(1800);
    expect(doubled.nutrients.crudeProtein.per1000Kcal).toBeCloseTo(
      base.nutrients.crudeProtein.per1000Kcal,
      8,
    );
  });

  it('marks missing data without treating it as zero', () => {
    const input = makeInput();
    input.targets = [
      {
        nutrientKey: 'iodine',
        label: '碘',
        category: 'MINERAL',
        expressionBasis: 'PER_1000_KCAL_ME',
        unit: 'μg',
        minValue: 220,
        maxValue: null,
        fieldPaths: ['minerals.iodine'],
      },
    ];

    const result = assessRecipeDraft(input);

    expect(result.overallStatus).toBe('INCOMPLETE');
    expect(result.entries[0]).toMatchObject({
      nutrientKey: 'iodine',
      status: 'MISSING_DATA',
      currentValue: null,
    });
  });

  it('calculates calcium phosphorus ratio as a ratio entry', () => {
    const input = makeInput();
    input.targets = [
      {
        nutrientKey: 'ca_p_ratio',
        label: '钙磷比',
        category: 'RATIO',
        expressionBasis: 'RATIO',
        unit: ':1',
        minValue: 1,
        maxValue: 2,
        fieldPaths: ['minerals.calcium', 'minerals.phosphorus'],
        calculation: 'RATIO',
      },
    ];

    const result = assessRecipeDraft(input);

    expect(result.entries[0].status).toBe('DEFICIENT');
    expect(result.entries[0].currentValue).toBeCloseTo(10 / 180, 4);
  });
});
```

- [ ] **Step 2: Run domain tests and verify failure**

Run:

```bash
cd backend && npm test -- --runInBand tests/domain/recipe-designer/recipe-assessment.spec.ts
```

Expected: fail because the `recipe-designer` domain files do not exist.

- [ ] **Step 3: Add shared domain types**

Create `backend/src/domain/recipe-designer/types.ts`:

```ts
import type { NutritionProfile } from '../ingredient/types';

export type FediafDogScenarioCode =
  | 'EARLY_GROWTH_REPRODUCTION'
  | 'LATE_GROWTH'
  | 'ADULT_MER_95'
  | 'ADULT_MER_110';

export type AssessmentExpressionBasis =
  | 'PER_1000_KCAL_ME'
  | 'PER_MJ_ME'
  | 'PER_100G_DRY_MATTER'
  | 'RATIO';

export type AssessmentCategory =
  | 'MACRO'
  | 'MINERAL'
  | 'VITAMIN'
  | 'FATTY_ACID'
  | 'AMINO_ACID'
  | 'COMBINATION'
  | 'RATIO';

export type NutrientCalculation = 'SUM' | 'RATIO';

export interface FediafAssessmentTarget {
  nutrientKey: string;
  label: string;
  category: AssessmentCategory;
  expressionBasis: AssessmentExpressionBasis;
  unit: string;
  minValue: number | null;
  maxValue: number | null;
  fieldPaths: string[];
  calculation?: NutrientCalculation;
}

export interface DesignRecipeAssessmentItemInput {
  id: string;
  name: string;
  weightG: number;
  nutritionProfile: NutritionProfile | null;
}

export type AssessmentEntryStatus =
  | 'COMPLIANT'
  | 'DEFICIENT'
  | 'EXCESS'
  | 'MISSING_DATA';

export type AssessmentOverallStatus =
  | 'COMPLIANT'
  | 'NON_COMPLIANT'
  | 'INCOMPLETE';

export interface AssessmentEntry {
  nutrientKey: string;
  label: string;
  category: AssessmentCategory;
  expressionBasis: AssessmentExpressionBasis;
  unit: string;
  currentValue: number | null;
  minValue: number | null;
  maxValue: number | null;
  gapPercent: number | null;
  status: AssessmentEntryStatus;
  contributingItems: Array<{ itemId: string; name: string; value: number }>;
  missingItems: Array<{ itemId: string; name: string; fieldPath: string }>;
}
```

- [ ] **Step 4: Add nutrition profile reader**

Create `backend/src/domain/recipe-designer/nutrition-profile-reader.ts`:

```ts
import {
  getNutritionProfileFieldValue,
} from '../ingredient/nutrition-field-catalog';
import type { NutritionProfile } from '../ingredient/types';

export interface ProfileValueResult {
  valuePer100g: number | null;
  missing: boolean;
}

export function readProfileValuePer100g(
  profile: NutritionProfile | null,
  fieldPath: string,
): ProfileValueResult {
  const value = getNutritionProfileFieldValue(profile, fieldPath);
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return { valuePer100g: null, missing: true };
  }
  return { valuePer100g: value, missing: false };
}
```

- [ ] **Step 5: Add assessment implementation**

Create `backend/src/domain/recipe-designer/recipe-assessment.ts`:

```ts
import {
  readProfileValuePer100g,
} from './nutrition-profile-reader';
import type {
  AssessmentEntry,
  AssessmentOverallStatus,
  DesignRecipeAssessmentItemInput,
  FediafAssessmentTarget,
  FediafDogScenarioCode,
} from './types';

export interface DesignRecipeAssessmentInput {
  scenario: FediafDogScenarioCode;
  items: DesignRecipeAssessmentItemInput[];
  targets: FediafAssessmentTarget[];
}

export interface DesignRecipeAssessmentResult {
  scenario: FediafDogScenarioCode;
  totalWeightG: number;
  totalEnergyKcal: number;
  energyDensityKcalPerKg: number;
  dryMatterG: number;
  normalizedToKg: false;
  overallStatus: AssessmentOverallStatus;
  items: Array<{ id: string; name: string; weightG: number; ratioPercent: number }>;
  nutrients: Record<string, { total: number; per1000Kcal: number | null }>;
  entries: AssessmentEntry[];
  summary: {
    compliantCount: number;
    deficientCount: number;
    excessCount: number;
    missingDataCount: number;
  };
}

function sumField(
  items: DesignRecipeAssessmentItemInput[],
  fieldPath: string,
) {
  let total = 0;
  const missingItems: Array<{ itemId: string; name: string; fieldPath: string }> = [];
  const contributingItems: Array<{ itemId: string; name: string; value: number }> = [];

  for (const item of items) {
    const read = readProfileValuePer100g(item.nutritionProfile, fieldPath);
    if (read.missing || read.valuePer100g === null) {
      missingItems.push({ itemId: item.id, name: item.name, fieldPath });
      continue;
    }
    const contribution = (read.valuePer100g * item.weightG) / 100;
    total += contribution;
    if (contribution > 0) {
      contributingItems.push({ itemId: item.id, name: item.name, value: contribution });
    }
  }

  return { total, missingItems, contributingItems };
}

function entryStatus(
  currentValue: number | null,
  minValue: number | null,
  maxValue: number | null,
  hasMissingData: boolean,
) {
  if (hasMissingData || currentValue === null || !Number.isFinite(currentValue)) {
    return 'MISSING_DATA' as const;
  }
  if (minValue !== null && currentValue < minValue) {
    return 'DEFICIENT' as const;
  }
  if (maxValue !== null && currentValue > maxValue) {
    return 'EXCESS' as const;
  }
  return 'COMPLIANT' as const;
}

function gapPercent(
  currentValue: number | null,
  minValue: number | null,
  maxValue: number | null,
) {
  if (currentValue === null) return null;
  if (minValue !== null && currentValue < minValue) {
    return ((minValue - currentValue) / minValue) * 100;
  }
  if (maxValue !== null && currentValue > maxValue) {
    return ((currentValue - maxValue) / maxValue) * 100;
  }
  return 0;
}

function toTargetBasisValue(
  total: number,
  dryMatterG: number,
  totalEnergyKcal: number,
  expressionBasis: FediafAssessmentTarget['expressionBasis'],
) {
  if (expressionBasis === 'PER_1000_KCAL_ME') {
    return totalEnergyKcal > 0 ? (total / totalEnergyKcal) * 1000 : null;
  }
  if (expressionBasis === 'PER_MJ_ME') {
    const totalEnergyMj = totalEnergyKcal * 0.004184;
    return totalEnergyMj > 0 ? total / totalEnergyMj : null;
  }
  if (expressionBasis === 'PER_100G_DRY_MATTER') {
    return dryMatterG > 0 ? (total / dryMatterG) * 100 : null;
  }
  return total;
}

export function assessRecipeDraft(
  input: DesignRecipeAssessmentInput,
): DesignRecipeAssessmentResult {
  const totalWeightG = input.items.reduce((sum, item) => sum + item.weightG, 0);
  const energy = sumField(input.items, 'macros.energyKcal');
  const moisture = sumField(input.items, 'macros.moisture');
  const totalEnergyKcal = energy.total;
  const dryMatterG = totalWeightG - moisture.total;
  const energyDensityKcalPerKg =
    totalWeightG > 0 ? (totalEnergyKcal / totalWeightG) * 1000 : 0;

  const nutrientTotals: Record<string, { total: number; per1000Kcal: number | null }> = {};
  const entries = input.targets.map((target): AssessmentEntry => {
    if (target.calculation === 'RATIO') {
      const numerator = sumField(input.items, target.fieldPaths[0]);
      const denominator = sumField(input.items, target.fieldPaths[1]);
      const missingItems = [...numerator.missingItems, ...denominator.missingItems];
      const currentValue = denominator.total > 0 ? numerator.total / denominator.total : null;
      const status = entryStatus(
        currentValue,
        target.minValue,
        target.maxValue,
        missingItems.length > 0,
      );
      return {
        nutrientKey: target.nutrientKey,
        label: target.label,
        category: target.category,
        expressionBasis: target.expressionBasis,
        unit: target.unit,
        currentValue,
        minValue: target.minValue,
        maxValue: target.maxValue,
        gapPercent: gapPercent(currentValue, target.minValue, target.maxValue),
        status,
        contributingItems: numerator.contributingItems,
        missingItems,
      };
    }

    const fieldResults = target.fieldPaths.map((fieldPath) => sumField(input.items, fieldPath));
    const total = fieldResults.reduce((sum, result) => sum + result.total, 0);
    const missingItems = fieldResults.flatMap((result) => result.missingItems);
    const contributingItems = fieldResults.flatMap((result) => result.contributingItems);
    const currentValue = toTargetBasisValue(
      total,
      dryMatterG,
      totalEnergyKcal,
      target.expressionBasis,
    );
    nutrientTotals[target.nutrientKey] = {
      total,
      per1000Kcal:
        totalEnergyKcal > 0 ? (total / totalEnergyKcal) * 1000 : null,
    };
    const status = entryStatus(
      currentValue,
      target.minValue,
      target.maxValue,
      missingItems.length > 0,
    );
    return {
      nutrientKey: target.nutrientKey,
      label: target.label,
      category: target.category,
      expressionBasis: target.expressionBasis,
      unit: target.unit,
      currentValue,
      minValue: target.minValue,
      maxValue: target.maxValue,
      gapPercent: gapPercent(currentValue, target.minValue, target.maxValue),
      status,
      contributingItems,
      missingItems,
    };
  });

  const summary = {
    compliantCount: entries.filter((entry) => entry.status === 'COMPLIANT').length,
    deficientCount: entries.filter((entry) => entry.status === 'DEFICIENT').length,
    excessCount: entries.filter((entry) => entry.status === 'EXCESS').length,
    missingDataCount: entries.filter((entry) => entry.status === 'MISSING_DATA').length,
  };

  const overallStatus: AssessmentOverallStatus =
    summary.missingDataCount > 0
      ? 'INCOMPLETE'
      : summary.deficientCount > 0 || summary.excessCount > 0
        ? 'NON_COMPLIANT'
        : 'COMPLIANT';

  return {
    scenario: input.scenario,
    totalWeightG,
    totalEnergyKcal,
    energyDensityKcalPerKg,
    dryMatterG,
    normalizedToKg: false,
    overallStatus,
    items: input.items.map((item) => ({
      id: item.id,
      name: item.name,
      weightG: item.weightG,
      ratioPercent: totalWeightG > 0 ? (item.weightG / totalWeightG) * 100 : 0,
    })),
    nutrients: nutrientTotals,
    entries,
    summary,
  };
}
```

- [ ] **Step 6: Run domain tests**

Run:

```bash
cd backend && npm test -- --runInBand tests/domain/recipe-designer/recipe-assessment.spec.ts
```

Expected: pass.

- [ ] **Step 7: Commit Task 2**

Run:

```bash
git add backend/src/domain/recipe-designer backend/tests/domain/recipe-designer
git commit -m "feat: add recipe designer assessment domain"
```

## Task 3: Backend Service And Controller

**Files:**

- Create: `backend/src/application/recipe-designer/recipe-designer.service.ts`
- Create: `backend/src/interfaces/dto/recipe-designer/recipe-designer.dto.ts`
- Create: `backend/src/interfaces/controllers/recipe-designer.controller.ts`
- Create: `backend/tests/application/recipe-designer/recipe-designer.service.spec.ts`
- Create: `backend/tests/interfaces/controllers/recipe-designer.controller.spec.ts`
- Modify: `backend/src/app.module.ts`
- Modify: `backend/src/domain/recipe/enums.ts`

- [ ] **Step 1: Write service tests**

Create `backend/tests/application/recipe-designer/recipe-designer.service.spec.ts` with tests that assert:

```ts
import { RecipeDesignerService } from '../../../src/application/recipe-designer/recipe-designer.service';

describe('RecipeDesignerService', () => {
  const prisma = {
    designRecipe: {
      findMany: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    designRecipeItem: {
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    nutritionFood: {
      findMany: jest.fn(),
    },
    recipe: {
      create: jest.fn(),
    },
    designRecipePublishSnapshot: {
      create: jest.fn(),
    },
    $transaction: jest.fn((callback) => callback(prisma)),
  };

  const standardTargets = {
    getTargetsForScenario: jest.fn(),
  };

  let service: RecipeDesignerService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new RecipeDesignerService(prisma as any, standardTargets as any);
  });

  it('creates a FEDIAF 2025 draft using the selected scenario', async () => {
    prisma.designRecipe.create.mockResolvedValue({
      id: 'draft-1',
      name: '成犬牛肉配方',
      fediafDogScenario: 'ADULT_MER_95',
      nutritionStandard: 'FEDIAF_2025',
      status: 'DRAFT',
      items: [],
    });

    const result = await service.createDraft(
      {
        name: '成犬牛肉配方',
        fediafDogScenario: 'ADULT_MER_95',
      },
      'staff-1',
    );

    expect(prisma.designRecipe.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: '成犬牛肉配方',
          fediafDogScenario: 'ADULT_MER_95',
          nutritionStandard: 'FEDIAF_2025',
          createdBy: 'staff-1',
        }),
      }),
    );
    expect(result.id).toBe('draft-1');
  });

  it('assesses a draft with free-total weights', async () => {
    standardTargets.getTargetsForScenario.mockResolvedValue([
      {
        nutrientKey: 'crudeProtein',
        label: '粗蛋白',
        category: 'MACRO',
        expressionBasis: 'PER_1000_KCAL_ME',
        unit: 'g',
        minValue: 45,
        maxValue: null,
        fieldPaths: ['macros.crudeProtein'],
      },
    ]);
    prisma.designRecipe.findUnique.mockResolvedValue({
      id: 'draft-1',
      fediafDogScenario: 'ADULT_MER_95',
      items: [
        {
          id: 'item-1',
          weightG: 900,
          nutritionFood: {
            name: '牛肉',
            nutritionData: {
              meta: { rawBasisType: 'PER_100_G' },
              macros: { energyKcal: 200, moisture: 65, crudeProtein: 20 },
              minerals: {},
              vitamins: {},
              fattyAcids: {},
              aminoAcids: {},
              customItems: [],
            },
          },
        },
      ],
    });

    const result = await service.assessDraft('draft-1');

    expect(result.totalWeightG).toBe(900);
    expect(result.normalizedToKg).toBe(false);
  });

  it('requires review notes before publishing incomplete drafts', async () => {
    prisma.designRecipe.findUnique.mockResolvedValue({
      id: 'draft-1',
      name: '缺数据配方',
      fediafDogScenario: 'ADULT_MER_95',
      isCompliant: false,
      assessmentSummary: { overallStatus: 'INCOMPLETE' },
      items: [],
    });

    await expect(
      service.publishDraft('draft-1', { reviewNote: '' }, 'staff-1'),
    ).rejects.toThrow('需审核配方必须填写审核说明');
  });
});
```

- [ ] **Step 2: Run service tests and verify failure**

Run:

```bash
cd backend && npm test -- --runInBand tests/application/recipe-designer/recipe-designer.service.spec.ts
```

Expected: fail because `RecipeDesignerService` does not exist.

- [ ] **Step 3: Create DTOs**

Create `backend/src/interfaces/dto/recipe-designer/recipe-designer.dto.ts`:

```ts
import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export enum FediafDogScenarioDto {
  EARLY_GROWTH_REPRODUCTION = 'EARLY_GROWTH_REPRODUCTION',
  LATE_GROWTH = 'LATE_GROWTH',
  ADULT_MER_95 = 'ADULT_MER_95',
  ADULT_MER_110 = 'ADULT_MER_110',
}

export class CreateDesignRecipeDto {
  @IsString()
  name!: string;

  @IsEnum(FediafDogScenarioDto)
  fediafDogScenario!: FediafDogScenarioDto;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateDesignRecipeDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(FediafDogScenarioDto)
  fediafDogScenario?: FediafDogScenarioDto;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpsertDesignRecipeItemDto {
  @IsString()
  nutritionFoodId!: string;

  @IsNumber()
  @Min(0)
  weightG!: number;

  @IsOptional()
  @IsString()
  preparationMethod?: string;
}

export class PublishDesignRecipeDto {
  @IsOptional()
  @IsString()
  reviewNote?: string;
}

export class ReorderDesignRecipeItemsDto {
  @IsArray()
  itemIds!: string[];
}
```

- [ ] **Step 4: Implement service skeleton and assessment orchestration**

Create `backend/src/application/recipe-designer/recipe-designer.service.ts`:

```ts
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma.service';
import {
  assessRecipeDraft,
} from '../../domain/recipe-designer/recipe-assessment';
import type {
  FediafAssessmentTarget,
  FediafDogScenarioCode,
} from '../../domain/recipe-designer/types';
import type {
  CreateDesignRecipeDto,
  PublishDesignRecipeDto,
  UpdateDesignRecipeDto,
  UpsertDesignRecipeItemDto,
} from '../../interfaces/dto/recipe-designer/recipe-designer.dto';

export interface FediafTargetProvider {
  getTargetsForScenario(
    scenario: FediafDogScenarioCode,
  ): Promise<FediafAssessmentTarget[]>;
}

@Injectable()
export class RecipeDesignerService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject('FediafTargetProvider')
    private readonly fediafTargets: FediafTargetProvider,
  ) {}

  async listDrafts(createdBy: string) {
    return this.prisma.designRecipe.findMany({
      where: { createdBy },
      orderBy: { updatedAt: 'desc' },
      include: { items: true },
    });
  }

  async createDraft(dto: CreateDesignRecipeDto, userId: string) {
    return this.prisma.designRecipe.create({
      data: {
        name: dto.name,
        fediafDogScenario: dto.fediafDogScenario,
        nutritionStandard: 'FEDIAF_2025',
        notes: dto.notes,
        createdBy: userId,
      },
      include: { items: true },
    });
  }

  async updateDraft(id: string, dto: UpdateDesignRecipeDto) {
    await this.ensureDraft(id);
    return this.prisma.designRecipe.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.fediafDogScenario !== undefined
          ? { fediafDogScenario: dto.fediafDogScenario }
          : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      },
      include: { items: true },
    });
  }

  async addItem(designRecipeId: string, dto: UpsertDesignRecipeItemDto) {
    await this.ensureDraft(designRecipeId);
    return this.prisma.designRecipeItem.create({
      data: {
        designRecipeId,
        nutritionFoodId: dto.nutritionFoodId,
        weightG: dto.weightG,
        preparationMethod: dto.preparationMethod,
      },
    });
  }

  async updateItem(itemId: string, dto: UpsertDesignRecipeItemDto) {
    return this.prisma.designRecipeItem.update({
      where: { id: itemId },
      data: {
        nutritionFoodId: dto.nutritionFoodId,
        weightG: dto.weightG,
        preparationMethod: dto.preparationMethod,
      },
    });
  }

  async removeItem(itemId: string) {
    await this.prisma.designRecipeItem.delete({ where: { id: itemId } });
    return { ok: true };
  }

  async assessDraft(id: string) {
    const draft = await this.prisma.designRecipe.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            nutritionFood: true,
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
    if (!draft) {
      throw new NotFoundException('设计草稿不存在');
    }
    const targets = await this.fediafTargets.getTargetsForScenario(
      draft.fediafDogScenario as FediafDogScenarioCode,
    );
    const result = assessRecipeDraft({
      scenario: draft.fediafDogScenario as FediafDogScenarioCode,
      items: draft.items.map((item) => ({
        id: item.id,
        name: item.nutritionFood.name,
        weightG: item.weightG,
        nutritionProfile: item.nutritionFood.nutritionData as any,
      })),
      targets,
    });
    await this.prisma.designRecipe.update({
      where: { id },
      data: {
        totalWeightG: result.totalWeightG,
        energyDensityKcalPerKg: result.energyDensityKcalPerKg,
        calculatedNutrition: result.nutrients,
        complianceStatus: result.entries,
        assessmentSummary: result.summary,
        missingDataReport: result.entries.filter(
          (entry) => entry.status === 'MISSING_DATA',
        ),
        isCompliant: result.overallStatus === 'COMPLIANT',
        status:
          result.overallStatus === 'COMPLIANT'
            ? 'COMPLIANT'
            : result.overallStatus === 'INCOMPLETE'
              ? 'NEEDS_REVIEW'
              : 'NEEDS_REVIEW',
        reviewStatus:
          result.overallStatus === 'COMPLIANT' ? 'NONE' : 'REQUIRED',
      },
    });
    return result;
  }

  async publishDraft(
    id: string,
    dto: PublishDesignRecipeDto,
    userId: string,
  ) {
    const draft = await this.prisma.designRecipe.findUnique({
      where: { id },
      include: { items: { include: { nutritionFood: true } } },
    });
    if (!draft) {
      throw new NotFoundException('设计草稿不存在');
    }
    const needsReview = !draft.isCompliant;
    if (needsReview && !dto.reviewNote?.trim()) {
      throw new BadRequestException('需审核配方必须填写审核说明');
    }
    return this.prisma.$transaction(async (tx) => {
      const recipe = await tx.recipe.create({
        data: {
          recipeId: draft.id,
          version: draft.version,
          name: draft.name,
          status: 'DRAFT',
          energyDensityKcalPerKg: draft.energyDensityKcalPerKg,
          productionLossRate: 1,
          nutritionStandard: 'FEDIAF_2025',
          nutritionDetailedData: draft.calculatedNutrition,
          applicableLifeStages: draft.applicableLifeStages,
          targetHealthTags: draft.targetHealthTags,
          designSource: 'MOBILE_RECIPE_DESIGNER',
          items: {
            create: draft.items.map((item, index) => ({
              ingredientId: item.nutritionFoodId,
              exampleWeight: item.weightG,
              ratioPercent: item.ratioPercent,
              preparationMethod: item.preparationMethod,
              sortOrder: index,
            })),
          },
        },
      });
      const snapshot = await tx.designRecipePublishSnapshot.create({
        data: {
          designRecipeId: draft.id,
          recipeId: recipe.id,
          snapshotData: {
            draft,
            assessmentSummary: draft.assessmentSummary,
            missingDataReport: draft.missingDataReport,
          },
          reviewStatus: needsReview ? 'APPROVED' : 'NONE',
          reviewNote: dto.reviewNote,
          publishedBy: userId,
        },
      });
      await tx.designRecipe.update({
        where: { id },
        data: {
          status: 'PUBLISHED',
          publishedAt: new Date(),
          publishedRecipeId: recipe.id,
          reviewStatus: needsReview ? 'APPROVED' : 'NONE',
          reviewNote: dto.reviewNote,
          reviewedBy: needsReview ? userId : null,
          reviewedAt: needsReview ? new Date() : null,
        },
      });
      return { recipe, snapshot };
    });
  }

  private async ensureDraft(id: string) {
    const draft = await this.prisma.designRecipe.findUnique({ where: { id } });
    if (!draft) {
      throw new NotFoundException('设计草稿不存在');
    }
    if (draft.status === 'PUBLISHED' || draft.status === 'ARCHIVED') {
      throw new BadRequestException('已发布或已归档草稿不可编辑');
    }
    return draft;
  }
}
```

- [ ] **Step 5: Add a Prisma-backed FEDIAF target provider**

In the same service folder, create `backend/src/application/recipe-designer/fediaf-target-provider.ts`. This implementation expects the FEDIAF 2025 standard-library work to expose a Prisma delegate named `nutritionStandardTarget` with `standardCode`, `species`, `scenario`, `isActive`, `category`, `sortOrder`, `nutrientKey`, `nutrientName`, `expressionBasis`, `unit`, `minValue`, `maxValue`, `fieldPaths`, and `calculation`. If that delegate is absent, stop and complete the FEDIAF 2025 standard-library implementation before continuing Task 3.

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma.service';
import type {
  FediafAssessmentTarget,
  FediafDogScenarioCode,
} from '../../domain/recipe-designer/types';
import type { FediafTargetProvider } from './recipe-designer.service';

@Injectable()
export class PrismaFediafTargetProvider implements FediafTargetProvider {
  constructor(private readonly prisma: PrismaService) {}

  async getTargetsForScenario(
    scenario: FediafDogScenarioCode,
  ): Promise<FediafAssessmentTarget[]> {
    const rows = await (this.prisma as any).nutritionStandardTarget.findMany({
      where: {
        standardCode: 'FEDIAF_2025',
        species: 'DOG',
        scenario,
        isActive: true,
      },
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }],
    });

    return rows.map((row: any) => ({
      nutrientKey: row.nutrientKey,
      label: row.nutrientName,
      category: row.category,
      expressionBasis: row.expressionBasis,
      unit: row.unit,
      minValue: row.minValue,
      maxValue: row.maxValue,
      fieldPaths: row.fieldPaths,
      calculation: row.calculation || 'SUM',
    }));
  }
}
```

- [ ] **Step 6: Create controller**

Create `backend/src/interfaces/controllers/recipe-designer.controller.ts`:

```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { RecipeDesignerService } from '../../application/recipe-designer/recipe-designer.service';
import { AuthGuard, CurrentUser } from '../auth';
import type { RequestUser } from '../auth';
import { ApiResponseDto } from '../dto/common/response.dto';
import {
  CreateDesignRecipeDto,
  PublishDesignRecipeDto,
  UpdateDesignRecipeDto,
  UpsertDesignRecipeItemDto,
} from '../dto/recipe-designer/recipe-designer.dto';

@Controller('api/v1/recipe-designer')
@UseGuards(AuthGuard)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class RecipeDesignerController {
  constructor(private readonly service: RecipeDesignerService) {}

  @Get('drafts')
  async listDrafts(@CurrentUser() user: RequestUser) {
    return new ApiResponseDto(
      0,
      'Success',
      await this.service.listDrafts(user.userId),
    );
  }

  @Post('drafts')
  async createDraft(
    @Body() dto: CreateDesignRecipeDto,
    @CurrentUser() user: RequestUser,
  ) {
    return new ApiResponseDto(
      0,
      '创建成功',
      await this.service.createDraft(dto, user.userId),
    );
  }

  @Patch('drafts/:id')
  async updateDraft(
    @Param('id') id: string,
    @Body() dto: UpdateDesignRecipeDto,
  ) {
    return new ApiResponseDto(0, '保存成功', await this.service.updateDraft(id, dto));
  }

  @Post('drafts/:id/items')
  async addItem(
    @Param('id') id: string,
    @Body() dto: UpsertDesignRecipeItemDto,
  ) {
    return new ApiResponseDto(0, '添加成功', await this.service.addItem(id, dto));
  }

  @Patch('items/:itemId')
  async updateItem(
    @Param('itemId') itemId: string,
    @Body() dto: UpsertDesignRecipeItemDto,
  ) {
    return new ApiResponseDto(0, '保存成功', await this.service.updateItem(itemId, dto));
  }

  @Delete('items/:itemId')
  async removeItem(@Param('itemId') itemId: string) {
    return new ApiResponseDto(0, '删除成功', await this.service.removeItem(itemId));
  }

  @Post('drafts/:id/assess')
  async assessDraft(@Param('id') id: string) {
    return new ApiResponseDto(0, '评估成功', await this.service.assessDraft(id));
  }

  @Post('drafts/:id/publish')
  async publishDraft(
    @Param('id') id: string,
    @Body() dto: PublishDesignRecipeDto,
    @CurrentUser() user: RequestUser,
  ) {
    return new ApiResponseDto(
      0,
      '发布成功',
      await this.service.publishDraft(id, dto, user.userId),
    );
  }
}
```

- [ ] **Step 7: Register backend providers**

Modify `backend/src/app.module.ts`:

```ts
import { RecipeDesignerController } from './interfaces/controllers/recipe-designer.controller';
import { RecipeDesignerService } from './application/recipe-designer/recipe-designer.service';
import { PrismaFediafTargetProvider } from './application/recipe-designer/fediaf-target-provider';
```

Add `RecipeDesignerController` to `controllers`. Add these providers:

```ts
RecipeDesignerService,
PrismaFediafTargetProvider,
{
  provide: 'FediafTargetProvider',
  useExisting: PrismaFediafTargetProvider,
},
```

- [ ] **Step 8: Add `FEDIAF_2025` enum label**

Modify `backend/src/domain/recipe/enums.ts`:

```ts
export enum NutritionStandard {
  NRC_2006 = 'NRC_2006',
  FEDIAF_2021 = 'FEDIAF_2021',
  FEDIAF_2024 = 'FEDIAF_2024',
  FEDIAF_2025 = 'FEDIAF_2025',
  AAFCO_2022 = 'AAFCO_2022',
}
```

- [ ] **Step 9: Run backend tests**

Run:

```bash
cd backend && npm test -- --runInBand tests/application/recipe-designer/recipe-designer.service.spec.ts tests/domain/recipe-designer/recipe-assessment.spec.ts
```

Expected: pass.

- [ ] **Step 10: Run backend build**

Run:

```bash
cd backend && npm run build
```

Expected: Nest build exits with code 0.

- [ ] **Step 11: Commit Task 3**

Run:

```bash
git add backend/src/application/recipe-designer backend/src/interfaces/controllers/recipe-designer.controller.ts backend/src/interfaces/dto/recipe-designer backend/src/app.module.ts backend/src/domain/recipe/enums.ts backend/tests/application/recipe-designer backend/tests/interfaces/controllers/recipe-designer.controller.spec.ts
git commit -m "feat: add recipe designer api"
```

## Task 4: Miniapp API Helpers

**Files:**

- Create: `miniapp/src/api/recipe-designer.ts`
- Create: `miniapp/src/api/recipe-designer.spec.ts`

- [ ] **Step 1: Write API helper tests**

Create `miniapp/src/api/recipe-designer.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve(__dirname, 'recipe-designer.ts'), 'utf8');

describe('recipe designer api helpers', () => {
  it('uses the mobile recipe designer endpoints', () => {
    expect(source).toContain("url: '/recipe-designer/drafts'");
    expect(source).toContain("url: `/recipe-designer/drafts/${draftId}`");
    expect(source).toContain("url: `/recipe-designer/drafts/${draftId}/items`");
    expect(source).toContain("url: `/recipe-designer/items/${itemId}`");
    expect(source).toContain("url: `/recipe-designer/drafts/${draftId}/assess`");
    expect(source).toContain("url: `/recipe-designer/drafts/${draftId}/publish`");
  });

  it('exposes explicit scenario labels without merging scenarios', () => {
    expect(source).toContain('EARLY_GROWTH_REPRODUCTION');
    expect(source).toContain('LATE_GROWTH');
    expect(source).toContain('ADULT_MER_95');
    expect(source).toContain('ADULT_MER_110');
    expect(source).not.toContain('PUPPY_ONLY');
    expect(source).not.toContain('ADULT_ONLY');
  });
});
```

- [ ] **Step 2: Run API helper tests and verify failure**

Run:

```bash
cd miniapp && npm test -- src/api/recipe-designer.spec.ts
```

Expected: fail because `recipe-designer.ts` does not exist.

- [ ] **Step 3: Create API helper**

Create `miniapp/src/api/recipe-designer.ts`:

```ts
import { request } from '../utils/api';

export type FediafDogScenario =
  | 'EARLY_GROWTH_REPRODUCTION'
  | 'LATE_GROWTH'
  | 'ADULT_MER_95'
  | 'ADULT_MER_110';

export const FEDIAF_DOG_SCENARIO_LABELS: Record<FediafDogScenario, string> = {
  EARLY_GROWTH_REPRODUCTION: '<14周幼犬 / 繁殖期',
  LATE_GROWTH: '>=14周幼犬',
  ADULT_MER_95: '成年犬 MER 95',
  ADULT_MER_110: '成年犬 MER 110',
};

export interface DesignRecipeDraftPayload {
  name: string;
  fediafDogScenario: FediafDogScenario;
  notes?: string;
}

export interface DesignRecipeItemPayload {
  nutritionFoodId: string;
  weightG: number;
  preparationMethod?: string;
}

export interface PublishDesignRecipePayload {
  reviewNote?: string;
}

export const recipeDesignerApi = {
  listDrafts: () =>
    request({
      url: '/recipe-designer/drafts',
      method: 'GET',
    }),

  createDraft: (data: DesignRecipeDraftPayload) =>
    request({
      url: '/recipe-designer/drafts',
      method: 'POST',
      data,
    }),

  updateDraft: (draftId: string, data: Partial<DesignRecipeDraftPayload>) =>
    request({
      url: `/recipe-designer/drafts/${draftId}`,
      method: 'PATCH',
      data,
    }),

  addItem: (draftId: string, data: DesignRecipeItemPayload) =>
    request({
      url: `/recipe-designer/drafts/${draftId}/items`,
      method: 'POST',
      data,
    }),

  updateItem: (itemId: string, data: DesignRecipeItemPayload) =>
    request({
      url: `/recipe-designer/items/${itemId}`,
      method: 'PATCH',
      data,
    }),

  removeItem: (itemId: string) =>
    request({
      url: `/recipe-designer/items/${itemId}`,
      method: 'DELETE',
    }),

  assessDraft: (draftId: string) =>
    request({
      url: `/recipe-designer/drafts/${draftId}/assess`,
      method: 'POST',
    }),

  publishDraft: (draftId: string, data: PublishDesignRecipePayload) =>
    request({
      url: `/recipe-designer/drafts/${draftId}/publish`,
      method: 'POST',
      data,
    }),
};
```

- [ ] **Step 4: Run API helper tests**

Run:

```bash
cd miniapp && npm test -- src/api/recipe-designer.spec.ts
```

Expected: pass.

- [ ] **Step 5: Commit Task 4**

Run:

```bash
git add miniapp/src/api/recipe-designer.ts miniapp/src/api/recipe-designer.spec.ts
git commit -m "feat: add recipe designer miniapp api"
```

## Task 5: Mobile Pages And Staff Entry

**Files:**

- Create: `miniapp/src/pages/recipe-designer/list.vue`
- Create: `miniapp/src/pages/recipe-designer/editor.vue`
- Create: `miniapp/src/pages/recipe-designer/publish.vue`
- Create: `miniapp/src/pages/recipe-designer/assessment.ts`
- Create: `miniapp/src/pages/recipe-designer.regression.spec.ts`
- Modify: `miniapp/src/pages/staff-workbench/index.vue`
- Modify: `miniapp/src/pages.json`

- [ ] **Step 1: Write page regression tests**

Create `miniapp/src/pages/recipe-designer.regression.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const listSource = readFileSync(
  resolve(__dirname, 'recipe-designer/list.vue'),
  'utf8',
);
const editorSource = readFileSync(
  resolve(__dirname, 'recipe-designer/editor.vue'),
  'utf8',
);
const publishSource = readFileSync(
  resolve(__dirname, 'recipe-designer/publish.vue'),
  'utf8',
);
const helperSource = readFileSync(
  resolve(__dirname, 'recipe-designer/assessment.ts'),
  'utf8',
);
const workbenchSource = readFileSync(
  resolve(__dirname, 'staff-workbench/index.vue'),
  'utf8',
);
const pagesJson = readFileSync(resolve(process.cwd(), 'src/pages.json'), 'utf8');

describe('mobile recipe designer pages', () => {
  it('adds a staff workbench entry', () => {
    expect(workbenchSource).toContain('食谱设计器');
    expect(workbenchSource).toContain('goToRecipeDesigner');
    expect(workbenchSource).toContain('/pages/recipe-designer/list');
  });

  it('registers list, editor, and publish pages', () => {
    expect(pagesJson).toContain('pages/recipe-designer/list');
    expect(pagesJson).toContain('pages/recipe-designer/editor');
    expect(pagesJson).toContain('pages/recipe-designer/publish');
  });

  it('keeps four FEDIAF scenarios visible and unmerged', () => {
    expect(editorSource).toContain('<14周幼犬 / 繁殖期');
    expect(editorSource).toContain('>=14周幼犬');
    expect(editorSource).toContain('成年犬 MER 95');
    expect(editorSource).toContain('成年犬 MER 110');
    expect(editorSource).not.toContain('幼犬统一');
    expect(editorSource).not.toContain('成年犬统一');
  });

  it('uses free total grams and does not expose scaling controls', () => {
    expect(editorSource).toContain('当前总量');
    expect(editorSource).toContain('weightG');
    expect(editorSource).not.toContain('一键归一');
    expect(editorSource).not.toContain('缩放到');
    expect(editorSource).not.toContain('1kg');
  });

  it('shows bottom assessment drawer statuses', () => {
    expect(editorSource).toContain('assessment-drawer');
    expect(helperSource).toContain('MISSING_DATA');
    expect(helperSource).toContain('DEFICIENT');
    expect(helperSource).toContain('EXCESS');
    expect(helperSource).toContain('COMPLIANT');
  });

  it('requires review note on risky publish', () => {
    expect(publishSource).toContain('reviewNote');
    expect(publishSource).toContain('需审核配方必须填写审核说明');
    expect(publishSource).toContain('publishDraft');
  });
});
```

- [ ] **Step 2: Run page tests and verify failure**

Run:

```bash
cd miniapp && npm test -- src/pages/recipe-designer.regression.spec.ts
```

Expected: fail because the recipe-designer pages do not exist.

- [ ] **Step 3: Create assessment display helper**

Create `miniapp/src/pages/recipe-designer/assessment.ts`:

```ts
export type AssessmentStatus =
  | 'COMPLIANT'
  | 'DEFICIENT'
  | 'EXCESS'
  | 'MISSING_DATA';

export function getAssessmentStatusLabel(status: AssessmentStatus): string {
  const labels: Record<AssessmentStatus, string> = {
    COMPLIANT: '达标',
    DEFICIENT: '缺口',
    EXCESS: '超标',
    MISSING_DATA: '缺数据',
  };
  return labels[status];
}

export function getAssessmentStatusClass(status: AssessmentStatus): string {
  const classes: Record<AssessmentStatus, string> = {
    COMPLIANT: 'status-compliant',
    DEFICIENT: 'status-deficient',
    EXCESS: 'status-excess',
    MISSING_DATA: 'status-missing',
  };
  return classes[status];
}
```

- [ ] **Step 4: Create draft list page**

Create `miniapp/src/pages/recipe-designer/list.vue`:

```vue
<template>
  <view class="recipe-designer-list">
    <view class="page-header">
      <text class="title">食谱设计器</text>
      <button class="new-btn" @tap="createDraft">新建草稿</button>
    </view>
    <view v-if="loading" class="state">加载中...</view>
    <view v-else-if="drafts.length === 0" class="state">暂无设计草稿</view>
    <view v-else class="draft-list">
      <view
        v-for="draft in drafts"
        :key="draft.id"
        class="draft-card"
        @tap="openDraft(draft.id)"
      >
        <view class="draft-main">
          <text class="draft-name">{{ draft.name }}</text>
          <text class="draft-scenario">{{ scenarioLabel(draft.fediafDogScenario) }}</text>
        </view>
        <text class="draft-status">{{ draft.status }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import {
  FEDIAF_DOG_SCENARIO_LABELS,
  recipeDesignerApi,
  type FediafDogScenario,
} from '../../api/recipe-designer';

const loading = ref(false);
const drafts = ref<any[]>([]);

onMounted(loadDrafts);

function scenarioLabel(scenario: FediafDogScenario) {
  return FEDIAF_DOG_SCENARIO_LABELS[scenario] || scenario;
}

async function loadDrafts() {
  loading.value = true;
  try {
    const res = await recipeDesignerApi.listDrafts();
    drafts.value = (res.data as any[]) || [];
  } finally {
    loading.value = false;
  }
}

async function createDraft() {
  const res = await recipeDesignerApi.createDraft({
    name: '新设计草稿',
    fediafDogScenario: 'ADULT_MER_110',
  });
  const draft = res.data as any;
  uni.navigateTo({ url: `/pages/recipe-designer/editor?id=${draft.id}` });
}

function openDraft(id: string) {
  uni.navigateTo({ url: `/pages/recipe-designer/editor?id=${id}` });
}
</script>
```

- [ ] **Step 5: Create editor page**

Create `miniapp/src/pages/recipe-designer/editor.vue` with this structure. Style can be added in the same file after behavior is passing.

```vue
<template>
  <view class="recipe-designer-editor">
    <view class="editor-header">
      <input v-model="draftName" class="name-input" placeholder="食谱名称" @blur="saveDraft" />
      <picker :range="scenarioOptions" range-key="label" @change="changeScenario">
        <view class="scenario-picker">{{ currentScenarioLabel }}</view>
      </picker>
      <text class="summary">当前总量 {{ totalWeightG }}g · {{ energyDensityText }}</text>
    </view>

    <view class="ingredient-list">
      <view v-for="item in items" :key="item.id" class="ingredient-row">
        <view class="ingredient-info">
          <text class="ingredient-name">{{ item.nutritionFood?.name || item.name }}</text>
          <text v-if="item.hasMissingData" class="missing-tag">缺数据</text>
        </view>
        <input
          class="weight-input"
          type="digit"
          :value="item.weightG"
          @blur="updateWeight(item, $event)"
        />
        <text class="unit">g</text>
      </view>
    </view>

    <button class="add-btn" @tap="addIngredient">添加原料</button>

    <view class="assessment-drawer" @tap="drawerOpen = !drawerOpen">
      <view class="drawer-handle"></view>
      <view class="drawer-summary">
        <text>{{ overallStatusText }}</text>
        <text>达标 {{ summary.compliantCount }} · 缺口 {{ summary.deficientCount }} · 超标 {{ summary.excessCount }} · 缺数据 {{ summary.missingDataCount }}</text>
      </view>
      <view v-if="drawerOpen" class="drawer-detail">
        <view v-for="entry in assessmentEntries" :key="entry.nutrientKey" class="assessment-entry">
          <text>{{ entry.label }}</text>
          <text>{{ entry.currentValue ?? '-' }} {{ entry.unit }}</text>
          <text :class="getAssessmentStatusClass(entry.status)">
            {{ getAssessmentStatusLabel(entry.status) }}
          </text>
        </view>
      </view>
    </view>

    <button class="publish-btn" @tap="goPublish">发布确认</button>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import {
  FEDIAF_DOG_SCENARIO_LABELS,
  recipeDesignerApi,
  type FediafDogScenario,
} from '../../api/recipe-designer';
import {
  getAssessmentStatusClass,
  getAssessmentStatusLabel,
} from './assessment';

const draftId = ref('');
const draftName = ref('');
const scenario = ref<FediafDogScenario>('ADULT_MER_110');
const items = ref<any[]>([]);
const assessmentEntries = ref<any[]>([]);
const drawerOpen = ref(false);
const summary = ref({
  compliantCount: 0,
  deficientCount: 0,
  excessCount: 0,
  missingDataCount: 0,
});
const totalWeightG = ref(0);
const energyDensityKcalPerKg = ref(0);
const overallStatus = ref('INCOMPLETE');

const scenarioOptions = Object.entries(FEDIAF_DOG_SCENARIO_LABELS).map(
  ([value, label]) => ({ value, label }),
);
const currentScenarioLabel = computed(
  () => FEDIAF_DOG_SCENARIO_LABELS[scenario.value],
);
const energyDensityText = computed(
  () => `${Math.round(energyDensityKcalPerKg.value)} kcal/kg`,
);
const overallStatusText = computed(() => {
  if (overallStatus.value === 'COMPLIANT') return '完全达标';
  if (overallStatus.value === 'NON_COMPLIANT') return '未达标';
  return '不完整，需审核';
});

onLoad((params: any) => {
  draftId.value = params.id;
  loadAssessment();
});

async function saveDraft() {
  await recipeDesignerApi.updateDraft(draftId.value, {
    name: draftName.value,
    fediafDogScenario: scenario.value,
  });
}

async function changeScenario(event: any) {
  const selected = scenarioOptions[Number(event.detail.value)];
  scenario.value = selected.value as FediafDogScenario;
  await saveDraft();
  await loadAssessment();
}

async function updateWeight(item: any, event: any) {
  const weightG = Number(event.detail.value);
  await recipeDesignerApi.updateItem(item.id, {
    nutritionFoodId: item.nutritionFoodId,
    weightG,
    preparationMethod: item.preparationMethod,
  });
  await loadAssessment();
}

async function loadAssessment() {
  const res = await recipeDesignerApi.assessDraft(draftId.value);
  const data: any = res.data;
  totalWeightG.value = data.totalWeightG || 0;
  energyDensityKcalPerKg.value = data.energyDensityKcalPerKg || 0;
  overallStatus.value = data.overallStatus || 'INCOMPLETE';
  assessmentEntries.value = data.entries || [];
  summary.value = data.summary || summary.value;
  items.value = data.items || [];
}

function addIngredient() {
  uni.showToast({ title: '原料选择下一步接入', icon: 'none' });
}

function goPublish() {
  uni.navigateTo({ url: `/pages/recipe-designer/publish?id=${draftId.value}` });
}
</script>
```

- [ ] **Step 6: Create publish page**

Create `miniapp/src/pages/recipe-designer/publish.vue`:

```vue
<template>
  <view class="recipe-designer-publish">
    <view class="summary-card">
      <text class="title">发布确认</text>
      <text>{{ statusText }}</text>
    </view>
    <view v-if="needsReview" class="review-card">
      <text>该配方不完整或未达标，发布前需要人工审核。</text>
      <textarea
        v-model="reviewNote"
        placeholder="请输入审核说明"
        class="review-note"
      />
    </view>
    <button class="publish-btn" @tap="publishDraft">确认发布</button>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { recipeDesignerApi } from '../../api/recipe-designer';

const draftId = ref('');
const reviewNote = ref('');
const overallStatus = ref('INCOMPLETE');

const needsReview = computed(() => overallStatus.value !== 'COMPLIANT');
const statusText = computed(() =>
  needsReview.value ? '需审核发布' : '完全达标，可直接发布',
);

onLoad(async (params: any) => {
  draftId.value = params.id;
  const res = await recipeDesignerApi.assessDraft(draftId.value);
  overallStatus.value = (res.data as any).overallStatus || 'INCOMPLETE';
});

async function publishDraft() {
  if (needsReview.value && !reviewNote.value.trim()) {
    uni.showToast({ title: '需审核配方必须填写审核说明', icon: 'none' });
    return;
  }
  await recipeDesignerApi.publishDraft(draftId.value, {
    reviewNote: reviewNote.value,
  });
  uni.showToast({ title: '发布成功', icon: 'success' });
  uni.navigateBack();
}
</script>
```

- [ ] **Step 7: Add staff workbench entry**

Modify `miniapp/src/pages/staff-workbench/index.vue`:

Add a module card after “食谱管理”:

```vue
<view class="module" @tap="goToRecipeDesigner">
  <view class="module-icon recipes">
    <text style="font-size: 48rpx;">🧪</text>
  </view>
  <view class="module-content">
    <text class="module-title">食谱设计器</text>
    <text class="module-desc">移动端设计草稿与 FEDIAF 评估</text>
  </view>
  <text class="module-arrow">›</text>
</view>
```

Add script function:

```ts
const goToRecipeDesigner = () => {
  if (!canUseWorkbenchFeature.value) return;
  uni.navigateTo({ url: '/pages/recipe-designer/list' });
};
```

- [ ] **Step 8: Register pages**

Modify `miniapp/src/pages.json`:

```json
{
  "path": "pages/recipe-designer/list",
  "style": {
    "navigationBarTitleText": "食谱设计器"
  }
},
{
  "path": "pages/recipe-designer/editor",
  "style": {
    "navigationBarTitleText": "设计草稿"
  }
},
{
  "path": "pages/recipe-designer/publish",
  "style": {
    "navigationBarTitleText": "发布确认"
  }
}
```

- [ ] **Step 9: Run miniapp regression tests**

Run:

```bash
cd miniapp && npm test -- src/api/recipe-designer.spec.ts src/pages/recipe-designer.regression.spec.ts
```

Expected: pass.

- [ ] **Step 10: Run miniapp preview build**

Run:

```bash
cd miniapp && npm run preview
```

Expected: preview build exits with code 0. Open this directory in WeChat DevTools: `miniapp/dist/dev/mp-weixin`.

- [ ] **Step 11: Commit Task 5**

Run:

```bash
git add miniapp/src/api/recipe-designer.ts miniapp/src/api/recipe-designer.spec.ts miniapp/src/pages/recipe-designer miniapp/src/pages/recipe-designer.regression.spec.ts miniapp/src/pages/staff-workbench/index.vue miniapp/src/pages.json
git commit -m "feat: add mobile recipe designer pages"
```

## Task 6: End-To-End Verification And Guardrails

**Files:**

- Modify: no source files unless verification exposes a defect.

- [ ] **Step 1: Run backend designer tests**

Run:

```bash
cd backend && npm test -- --runInBand tests/prisma/mobile-recipe-designer-schema.spec.ts tests/domain/recipe-designer/recipe-assessment.spec.ts tests/application/recipe-designer/recipe-designer.service.spec.ts
```

Expected: pass.

- [ ] **Step 2: Run backend build**

Run:

```bash
cd backend && npm run build
```

Expected: pass.

- [ ] **Step 3: Run miniapp tests**

Run:

```bash
cd miniapp && npm test -- src/api/recipe-designer.spec.ts src/pages/recipe-designer.regression.spec.ts
```

Expected: pass.

- [ ] **Step 4: Run miniapp preview build**

Run:

```bash
cd miniapp && npm run preview
```

Expected: pass. WeChat DevTools directory: `miniapp/dist/dev/mp-weixin`.

- [ ] **Step 5: Manual smoke flow**

Use the local backend if available:

```bash
cd backend && npm run start:check
```

If not healthy, start it:

```bash
cd backend && npm run start:dev
```

Then in WeChat DevTools:

1. Open `miniapp/dist/dev/mp-weixin`.
2. Enter employee workbench.
3. Tap “食谱设计器”.
4. Create a draft.
5. Confirm all four scenario options are visible.
6. Confirm no “1kg”, “归一”, or “缩放” action is visible.
7. Add or mock an ingredient through the API flow available in this branch.
8. Confirm bottom assessment summary shows compliant, deficient, excess, and missing counts from backend response.
9. Try to publish an incomplete draft with an empty review note.
10. Confirm the app shows “需审核配方必须填写审核说明”.
11. Enter a review note and confirm publish succeeds.

- [ ] **Step 6: Final status check**

Run:

```bash
git status --short
```

Expected: only intentional changes are present.

- [ ] **Step 7: Commit verification fixes**

If Step 5 exposed fixes, commit them:

```bash
git add backend miniapp
git commit -m "fix: stabilize mobile recipe designer flow"
```

If no fixes were needed, do not create an empty commit.

## Self-Review Notes

Spec coverage:

- Mobile-first editor is covered by Task 5.
- Free-total calculation without 1kg normalization is covered by Task 2 and Task 5 tests.
- Four unmerged FEDIAF scenarios are covered by Task 1, Task 4, and Task 5 tests.
- Missing-data handling is covered by Task 2 tests and publish gating in Task 3.
- Draft and formal Recipe separation is covered by Task 3 publish service and snapshot table.
- No AI generation, no auto-balancing, and no scaling tools are guarded by Task 5 tests.

Known dependency:

- `PrismaFediafTargetProvider` expects the FEDIAF 2025 standard-library delegate `nutritionStandardTarget`. If the delegate is absent, execute the FEDIAF 2025 standard-library implementation before this plan.
