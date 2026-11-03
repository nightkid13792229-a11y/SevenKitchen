# Supplement Nutrition Targets V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace legacy supplement concentration and recipe target fields with structured `nutrition_profile` field paths and multi-target supplement dosing across backend, admin-web, and miniapp.

**Architecture:** Introduce a shared backend nutrition field catalog and supplement dosing module, persist `recipe_item.supplement_targets`, snapshot target/profile data at order creation, then migrate consumers from `nutrientTargetKey/nutrientTargetValue` and `properties.active_nutrients` to the new target list. Keep legacy fields only as temporary display compatibility while all calculation paths use the new model.

**Tech Stack:** NestJS + Prisma + Jest, Vue 3 + Element Plus admin-web, uni-app Vue 3 + Vitest

---

## Scope

This plan implements the approved design in `docs/superpowers/specs/2026-04-17-supplement-nutrition-targets-v2-design.md`.

It deliberately uses incremental commits:

1. Backend field catalog and dose calculation.
2. Schema and DTO support for `supplement_targets`.
3. Recipe/order/pricing snapshot migration.
4. Admin-web editor migration.
5. Miniapp display/calculation migration.
6. Data migration and verification.

## Current Baseline

Run from the worktree root:

```bash
cd backend && npm test -- tests/domain/ingredient/supplement-nutrition-resolver.spec.ts tests/domain/pricing/pricing-supplement-resolver.spec.ts
cd ../miniapp && npm test -- src/utils/supplement-nutrients.spec.ts src/pages/diy-sheet/supplement-alternatives.spec.ts src/utils/diy-sheet-format.spec.ts
cd ../admin-web && npm run build
```

Expected baseline:

- Backend: 2 test suites, 5 tests pass.
- Miniapp: 3 test files, 12 tests pass.
- Admin-web: build succeeds, chunk-size warnings are allowed.

## File Structure

### Backend domain and schema

- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260417190000_add_recipe_item_supplement_targets/migration.sql`
- Modify: `backend/src/domain/ingredient/nutrition-profile.constants.ts`
- Create: `backend/src/domain/ingredient/nutrition-field-catalog.ts`
- Create: `backend/src/domain/ingredient/supplement-targets.ts`
- Modify: `backend/src/domain/ingredient/types.ts`
- Modify: `backend/src/domain/recipe/types.ts`
- Modify: `backend/src/domain/recipe/recipe.repository.ts`

### Backend application and API

- Modify: `backend/src/interfaces/dto/recipes/admin-recipe.dto.ts`
- Modify: `backend/src/interfaces/dto/recipes/recipe-response.dto.ts`
- Modify: `backend/src/interfaces/dto/orders/pricing-preview.dto.ts`
- Modify: `backend/src/application/ingredient/ingredient.service.ts`
- Modify: `backend/src/application/recipe/recipe.service.ts`
- Modify: `backend/src/application/order/order.service.ts`
- Modify: `backend/src/domain/pricing/pricing.service.ts`
- Modify: `backend/src/interfaces/controllers/recipes.controller.ts`
- Modify: `backend/src/infrastructure/repositories/prisma-recipe.repository.ts`

### Backend migration scripts and tests

- Create: `backend/prisma/backfill-recipe-supplement-targets-v2.ts`
- Create: `backend/tests/domain/ingredient/nutrition-field-catalog.spec.ts`
- Create: `backend/tests/domain/ingredient/supplement-targets.spec.ts`
- Modify: `backend/tests/domain/ingredient/supplement-nutrition-resolver.spec.ts`
- Modify: `backend/tests/domain/pricing/pricing-supplement-resolver.spec.ts`
- Create: `backend/tests/prisma/backfill-recipe-supplement-targets-v2.spec.ts`

### Admin web

- Modify: `admin-web/src/constants/ingredientNutrition.ts`
- Modify: `admin-web/src/types/recipe.ts`
- Modify: `admin-web/src/types/ingredient.ts`
- Modify: `admin-web/src/views/Recipes/RecipeForm.vue`
- Modify: `admin-web/src/views/Ingredients/IngredientForm.vue`
- Modify: `admin-web/src/views/Ingredients/components/IngredientNutritionDialog.vue`
- Modify: `admin-web/src/utils/ingredientNutrition.ts`

### Miniapp

- Modify: `miniapp/src/utils/supplement-nutrients.ts`
- Modify: `miniapp/src/utils/supplement-nutrients.spec.ts`
- Modify: `miniapp/src/pages/diy-sheet/supplement-alternatives.ts`
- Modify: `miniapp/src/pages/diy-sheet/supplement-alternatives.spec.ts`
- Modify: `miniapp/src/pages/diy-sheet/index.vue`
- Modify: `miniapp/src/pages/recipe-detail/index.vue`
- Modify: `miniapp/src/pages/staff-production/detail.vue`
- Modify: `miniapp/src/pages/staff-production/print-task.vue`
- Modify: `miniapp/src/utils/canvas-printer.ts`
- Modify: `miniapp/src/utils/label-renderer.ts`

---

### Task 1: Build Nutrition Field Catalog and Supplement Dose Calculator

**Files:**
- Modify: `backend/src/domain/ingredient/nutrition-profile.constants.ts`
- Create: `backend/src/domain/ingredient/nutrition-field-catalog.ts`
- Create: `backend/src/domain/ingredient/supplement-targets.ts`
- Test: `backend/tests/domain/ingredient/nutrition-field-catalog.spec.ts`
- Test: `backend/tests/domain/ingredient/supplement-targets.spec.ts`

- [ ] **Step 1: Write failing catalog tests**

Create `backend/tests/domain/ingredient/nutrition-field-catalog.spec.ts`:

```ts
import {
  findNutritionField,
  getNutritionProfileFieldValue,
  listSupplementTargetFields,
} from '../../../src/domain/ingredient/nutrition-field-catalog';

describe('nutrition field catalog', () => {
  it('finds standard field definitions by field path', () => {
    expect(findNutritionField('minerals.iodine')).toMatchObject({
      fieldPath: 'minerals.iodine',
      label: '碘',
      unit: 'μg',
    });
    expect(findNutritionField('fattyAcids.epa')).toMatchObject({
      fieldPath: 'fattyAcids.epa',
      label: 'EPA',
      unit: 'mg',
    });
    expect(findNutritionField('vitamins.vitaminE')).toMatchObject({
      fieldPath: 'vitamins.vitaminE',
      label: '维生素 E',
      unit: 'IU',
    });
  });

  it('lists selectable fixed supplement target fields without custom items', () => {
    const paths = listSupplementTargetFields().map((field) => field.fieldPath);
    expect(paths).toContain('minerals.iodine');
    expect(paths).toContain('fattyAcids.epa');
    expect(paths).toContain('fattyAcids.dha');
    expect(paths).not.toContain('customItems.0');
  });

  it('reads values from structured nutrition profile paths', () => {
    const profile = {
      meta: { rawBasisType: 'PER_SERVING' },
      macros: {},
      minerals: { iodine: 150 },
      vitamins: { vitaminE: 200 },
      fattyAcids: { epa: 180, dha: 120 },
      aminoAcids: {},
      customItems: [],
    } as any;

    expect(getNutritionProfileFieldValue(profile, 'minerals.iodine')).toBe(150);
    expect(getNutritionProfileFieldValue(profile, 'fattyAcids.epa')).toBe(180);
    expect(getNutritionProfileFieldValue(profile, 'vitamins.vitaminE')).toBe(200);
    expect(getNutritionProfileFieldValue(profile, 'fattyAcids.unknown')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Write failing supplement dosing tests**

Create `backend/tests/domain/ingredient/supplement-targets.spec.ts`:

```ts
import {
  calculateSupplementDose,
  validateSupplementTargets,
} from '../../../src/domain/ingredient/supplement-targets';

describe('supplement targets v2 dosing', () => {
  const fishOilProfile = {
    meta: { rawBasisType: 'PER_SERVING' },
    macros: {},
    minerals: {},
    vitamins: {},
    fattyAcids: { epa: 180, dha: 120 },
    aminoAcids: {},
    customItems: [],
  } as any;

  it('calculates single-target supplements from nutrition_profile field path', () => {
    const result = calculateSupplementDose({
      nutritionProfile: {
        meta: { rawBasisType: 'PER_SERVING' },
        macros: {},
        minerals: { iodine: 150 },
        vitamins: {},
        fattyAcids: {},
        aminoAcids: {},
        customItems: [],
      } as any,
      targets: [
        { fieldPath: 'minerals.iodine', label: '碘', targetValuePerKg: 660, unit: 'μg' },
      ],
      basisWeightG: 1000,
      lossRate: 1,
    });

    expect(result.amount).toBeCloseTo(4.4, 6);
    expect(result.unit).toBe('份');
    expect(result.limitingTarget.fieldPath).toBe('minerals.iodine');
  });

  it('uses the maximum amount required across multiple targets', () => {
    const result = calculateSupplementDose({
      nutritionProfile: fishOilProfile,
      targets: [
        { fieldPath: 'fattyAcids.epa', label: 'EPA', targetValuePerKg: 360, unit: 'mg' },
        { fieldPath: 'fattyAcids.dha', label: 'DHA', targetValuePerKg: 360, unit: 'mg' },
      ],
      basisWeightG: 1000,
      displayUnit: '粒',
      lossRate: 1,
    });

    expect(result.targetBreakdown).toEqual([
      expect.objectContaining({ fieldPath: 'fattyAcids.epa', requiredAmount: 2 }),
      expect.objectContaining({ fieldPath: 'fattyAcids.dha', requiredAmount: 3 }),
    ]);
    expect(result.amount).toBe(3);
    expect(result.unit).toBe('粒');
    expect(result.limitingTarget.fieldPath).toBe('fattyAcids.dha');
  });

  it('applies loss rate only when requested by caller', () => {
    const result = calculateSupplementDose({
      nutritionProfile: fishOilProfile,
      targets: [
        { fieldPath: 'fattyAcids.epa', label: 'EPA', targetValuePerKg: 360, unit: 'mg' },
      ],
      basisWeightG: 1000,
      displayUnit: '粒',
      lossRate: 1.05,
    });

    expect(result.amount).toBeCloseTo(2.1, 6);
  });

  it('rejects EPA+DHA as a field path', () => {
    expect(() =>
      validateSupplementTargets([
        { fieldPath: 'EPA+DHA', label: 'EPA+DHA', targetValuePerKg: 600, unit: 'mg' },
      ]),
    ).toThrow('Unsupported supplement target fieldPath: EPA+DHA');
  });
});
```

- [ ] **Step 3: Run tests and verify they fail**

Run:

```bash
cd backend
npm test -- tests/domain/ingredient/nutrition-field-catalog.spec.ts tests/domain/ingredient/supplement-targets.spec.ts
```

Expected: FAIL because the new modules do not exist.

- [ ] **Step 4: Expand nutrition constants**

Modify `backend/src/domain/ingredient/nutrition-profile.constants.ts` so the missing standard tabs contain real keys:

```ts
export const VITAMIN_NUTRIENT_KEYS = [
  'vitaminA',
  'vitaminD',
  'vitaminE',
  'vitaminK',
  'vitaminB1',
  'vitaminB2',
  'vitaminB3',
  'vitaminB5',
  'vitaminB6',
  'vitaminB7',
  'vitaminB9',
  'vitaminB12',
  'choline',
  'vitaminC',
] as const;

export const FATTY_ACID_NUTRIENT_KEYS = [
  'saturatedFattyAcids',
  'monounsaturatedFattyAcids',
  'polyunsaturatedFattyAcids',
  'linoleicAcid',
  'alphaLinolenicAcid',
  'arachidonicAcid',
  'epa',
  'dpa',
  'dha',
] as const;

export const AMINO_ACID_NUTRIENT_KEYS = [
  'arginine',
  'lysine',
  'methionine',
  'cystine',
  'taurine',
  'tryptophan',
  'threonine',
  'leucine',
  'isoleucine',
  'valine',
  'phenylalanine',
  'tyrosine',
  'histidine',
  'glutamicAcid',
  'glycine',
  'proline',
] as const;
```

- [ ] **Step 5: Implement field catalog**

Create `backend/src/domain/ingredient/nutrition-field-catalog.ts`:

```ts
import { normalizeNutritionProfile } from './nutrition-profile.utils';
import type { NutritionProfile, NutritionProfileV2 } from './types';

export type NutritionFieldTab =
  | 'macros'
  | 'minerals'
  | 'vitamins'
  | 'fattyAcids'
  | 'aminoAcids';

export interface NutritionFieldDefinition {
  tabKey: NutritionFieldTab;
  fieldKey: string;
  fieldPath: `${NutritionFieldTab}.${string}`;
  label: string;
  unit: string;
}

const fields = <TTab extends NutritionFieldTab>(
  tabKey: TTab,
  entries: Array<{ fieldKey: string; label: string; unit: string }>,
): NutritionFieldDefinition[] =>
  entries.map((entry) => ({
    tabKey,
    fieldKey: entry.fieldKey,
    fieldPath: `${tabKey}.${entry.fieldKey}` as `${NutritionFieldTab}.${string}`,
    label: entry.label,
    unit: entry.unit,
  }));

export const NUTRITION_FIELD_CATALOG: readonly NutritionFieldDefinition[] = [
  ...fields('macros', [
    { fieldKey: 'energyKcal', label: '能量', unit: 'kcal' },
    { fieldKey: 'moisture', label: '水分', unit: 'g' },
    { fieldKey: 'crudeProtein', label: '粗蛋白', unit: 'g' },
    { fieldKey: 'crudeFat', label: '粗脂肪', unit: 'g' },
    { fieldKey: 'ash', label: '灰分', unit: 'g' },
    { fieldKey: 'carbohydrate', label: '碳水化合物', unit: 'g' },
    { fieldKey: 'fiber', label: '膳食纤维', unit: 'g' },
    { fieldKey: 'solubleFiber', label: '可溶性纤维', unit: 'g' },
    { fieldKey: 'insolubleFiber', label: '不可溶性纤维', unit: 'g' },
  ]),
  ...fields('minerals', [
    { fieldKey: 'calcium', label: '钙', unit: 'mg' },
    { fieldKey: 'phosphorus', label: '磷', unit: 'mg' },
    { fieldKey: 'potassium', label: '钾', unit: 'mg' },
    { fieldKey: 'sodium', label: '钠', unit: 'mg' },
    { fieldKey: 'magnesium', label: '镁', unit: 'mg' },
    { fieldKey: 'chloride', label: '氯', unit: 'mg' },
    { fieldKey: 'iron', label: '铁', unit: 'mg' },
    { fieldKey: 'zinc', label: '锌', unit: 'mg' },
    { fieldKey: 'copper', label: '铜', unit: 'mg' },
    { fieldKey: 'manganese', label: '锰', unit: 'mg' },
    { fieldKey: 'selenium', label: '硒', unit: 'μg' },
    { fieldKey: 'iodine', label: '碘', unit: 'μg' },
  ]),
  ...fields('vitamins', [
    { fieldKey: 'vitaminA', label: '维生素 A', unit: 'IU' },
    { fieldKey: 'vitaminD', label: '维生素 D', unit: 'IU' },
    { fieldKey: 'vitaminE', label: '维生素 E', unit: 'IU' },
    { fieldKey: 'vitaminK', label: '维生素 K', unit: 'μg' },
    { fieldKey: 'vitaminB1', label: '维生素 B1', unit: 'mg' },
    { fieldKey: 'vitaminB2', label: '维生素 B2', unit: 'mg' },
    { fieldKey: 'vitaminB3', label: '维生素 B3', unit: 'mg' },
    { fieldKey: 'vitaminB5', label: '维生素 B5', unit: 'mg' },
    { fieldKey: 'vitaminB6', label: '维生素 B6', unit: 'mg' },
    { fieldKey: 'vitaminB7', label: '维生素 B7', unit: 'μg' },
    { fieldKey: 'vitaminB9', label: '维生素 B9', unit: 'μg' },
    { fieldKey: 'vitaminB12', label: '维生素 B12', unit: 'μg' },
    { fieldKey: 'choline', label: '胆碱', unit: 'mg' },
    { fieldKey: 'vitaminC', label: '维生素 C', unit: 'mg' },
  ]),
  ...fields('fattyAcids', [
    { fieldKey: 'saturatedFattyAcids', label: '饱和脂肪酸', unit: 'g' },
    { fieldKey: 'monounsaturatedFattyAcids', label: '单不饱和脂肪酸', unit: 'g' },
    { fieldKey: 'polyunsaturatedFattyAcids', label: '多不饱和脂肪酸', unit: 'g' },
    { fieldKey: 'linoleicAcid', label: '亚油酸', unit: 'g' },
    { fieldKey: 'alphaLinolenicAcid', label: 'α-亚麻酸', unit: 'g' },
    { fieldKey: 'arachidonicAcid', label: '花生四烯酸', unit: 'g' },
    { fieldKey: 'epa', label: 'EPA', unit: 'mg' },
    { fieldKey: 'dpa', label: 'DPA', unit: 'mg' },
    { fieldKey: 'dha', label: 'DHA', unit: 'mg' },
  ]),
  ...fields('aminoAcids', [
    { fieldKey: 'arginine', label: '精氨酸', unit: 'g' },
    { fieldKey: 'lysine', label: '赖氨酸', unit: 'g' },
    { fieldKey: 'methionine', label: '蛋氨酸', unit: 'g' },
    { fieldKey: 'cystine', label: '胱氨酸', unit: 'g' },
    { fieldKey: 'taurine', label: '牛磺酸', unit: 'g' },
    { fieldKey: 'tryptophan', label: '色氨酸', unit: 'g' },
    { fieldKey: 'threonine', label: '苏氨酸', unit: 'g' },
    { fieldKey: 'leucine', label: '亮氨酸', unit: 'g' },
    { fieldKey: 'isoleucine', label: '异亮氨酸', unit: 'g' },
    { fieldKey: 'valine', label: '缬氨酸', unit: 'g' },
    { fieldKey: 'phenylalanine', label: '苯丙氨酸', unit: 'g' },
    { fieldKey: 'tyrosine', label: '酪氨酸', unit: 'g' },
    { fieldKey: 'histidine', label: '组氨酸', unit: 'g' },
    { fieldKey: 'glutamicAcid', label: '谷氨酸', unit: 'g' },
    { fieldKey: 'glycine', label: '甘氨酸', unit: 'g' },
    { fieldKey: 'proline', label: '脯氨酸', unit: 'g' },
  ]),
];

export function listSupplementTargetFields(): NutritionFieldDefinition[] {
  return [...NUTRITION_FIELD_CATALOG];
}

export function findNutritionField(
  fieldPath: string | null | undefined,
): NutritionFieldDefinition | undefined {
  return NUTRITION_FIELD_CATALOG.find((field) => field.fieldPath === fieldPath);
}

export function getNutritionProfileFieldValue(
  nutritionProfile: NutritionProfile | null | undefined,
  fieldPath: string,
): number | undefined {
  const field = findNutritionField(fieldPath);
  if (!field) return undefined;
  const normalized = normalizeNutritionProfile(nutritionProfile) as NutritionProfileV2 | null;
  const value = normalized?.[field.tabKey]?.[field.fieldKey as never];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
```

- [ ] **Step 6: Implement supplement target dosing module**

Create `backend/src/domain/ingredient/supplement-targets.ts`:

```ts
import {
  findNutritionField,
  getNutritionProfileFieldValue,
} from './nutrition-field-catalog';
import type { NutritionProfile } from './types';

export interface SupplementTarget {
  fieldPath: string;
  label: string;
  targetValuePerKg: number;
  unit: string;
}

export interface SupplementDoseTargetBreakdown {
  fieldPath: string;
  label: string;
  targetUnit: string;
  concentration: number;
  concentrationUnit: string;
  totalNutrientNeeded: number;
  requiredAmount: number;
}

export interface CalculateSupplementDoseInput {
  nutritionProfile: NutritionProfile | null | undefined;
  targets: SupplementTarget[];
  basisWeightG: number;
  displayUnit?: string | null;
  lossRate?: number;
}

export interface SupplementDoseResult {
  amount: number;
  unit: string;
  limitingTarget: SupplementDoseTargetBreakdown;
  targetBreakdown: SupplementDoseTargetBreakdown[];
}

export function validateSupplementTargets(targets: SupplementTarget[]): void {
  if (!Array.isArray(targets) || targets.length === 0) {
    throw new Error('Supplement targets are required');
  }

  const seen = new Set<string>();
  for (const target of targets) {
    const field = findNutritionField(target.fieldPath);
    if (!field) {
      throw new Error(`Unsupported supplement target fieldPath: ${target.fieldPath}`);
    }
    if (seen.has(target.fieldPath)) {
      throw new Error(`Duplicate supplement target fieldPath: ${target.fieldPath}`);
    }
    if (!(target.targetValuePerKg > 0)) {
      throw new Error(`Supplement target must be greater than zero: ${target.fieldPath}`);
    }
    seen.add(target.fieldPath);
  }
}

export function calculateSupplementDose(
  input: CalculateSupplementDoseInput,
): SupplementDoseResult {
  validateSupplementTargets(input.targets);
  const basisWeightKg = input.basisWeightG / 1000;
  const lossRate = input.lossRate ?? 1;

  const targetBreakdown = input.targets.map((target) => {
    const field = findNutritionField(target.fieldPath)!;
    const concentration = getNutritionProfileFieldValue(
      input.nutritionProfile,
      target.fieldPath,
    );

    if (!(concentration && concentration > 0)) {
      throw new Error(`Missing concentration for supplement target: ${target.fieldPath}`);
    }

    if (target.unit !== field.unit) {
      throw new Error(
        `Unit mismatch for ${target.fieldPath}: expected ${field.unit}, got ${target.unit}`,
      );
    }

    const totalNutrientNeeded = basisWeightKg * target.targetValuePerKg;
    const requiredAmount = (totalNutrientNeeded / concentration) * lossRate;

    return {
      fieldPath: target.fieldPath,
      label: target.label || field.label,
      targetUnit: target.unit,
      concentration,
      concentrationUnit: field.unit,
      totalNutrientNeeded,
      requiredAmount,
    };
  });

  const limitingTarget = targetBreakdown.reduce((max, current) =>
    current.requiredAmount > max.requiredAmount ? current : max,
  );

  return {
    amount: limitingTarget.requiredAmount,
    unit: input.displayUnit || '份',
    limitingTarget,
    targetBreakdown,
  };
}
```

- [ ] **Step 7: Verify Task 1 tests pass**

Run:

```bash
cd backend
npm test -- tests/domain/ingredient/nutrition-field-catalog.spec.ts tests/domain/ingredient/supplement-targets.spec.ts
```

Expected: PASS.

- [ ] **Step 8: Commit Task 1**

```bash
git add backend/src/domain/ingredient/nutrition-profile.constants.ts \
  backend/src/domain/ingredient/nutrition-field-catalog.ts \
  backend/src/domain/ingredient/supplement-targets.ts \
  backend/tests/domain/ingredient/nutrition-field-catalog.spec.ts \
  backend/tests/domain/ingredient/supplement-targets.spec.ts
git commit -m "feat: add supplement target field catalog"
```

### Task 2: Add Supplement Targets to Recipe Data Model

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260417190000_add_recipe_item_supplement_targets/migration.sql`
- Modify: `backend/src/domain/ingredient/types.ts`
- Modify: `backend/src/domain/recipe/types.ts`
- Modify: `backend/src/domain/recipe/recipe.repository.ts`
- Modify: `backend/src/interfaces/dto/recipes/admin-recipe.dto.ts`
- Modify: `backend/src/interfaces/dto/recipes/recipe-response.dto.ts`

- [ ] **Step 1: Add Prisma JSON field**

Modify `RecipeItem` in `backend/prisma/schema.prisma`:

```prisma
  supplementTargets     Json?                         @map("supplement_targets")
```

Create `backend/prisma/migrations/20260417190000_add_recipe_item_supplement_targets/migration.sql`:

```sql
ALTER TABLE "recipe_item"
  ADD COLUMN "supplement_targets" JSONB;
```

- [ ] **Step 2: Add shared TypeScript types**

In `backend/src/domain/ingredient/types.ts`, export the same shape used by the dosing module:

```ts
export interface SupplementTarget {
  fieldPath: string;
  label: string;
  targetValuePerKg: number;
  unit: string;
}
```

In `backend/src/domain/recipe/types.ts`, add:

```ts
import type { NutritionProfile, SupplementTarget } from '../ingredient/types';

export interface RecipeSnapshotItem {
  // existing fields remain during migration
  supplement_targets?: SupplementTarget[];
  nutrition_profile_snapshot?: NutritionProfile | null;
}
```

- [ ] **Step 3: Update DTOs**

In `backend/src/interfaces/dto/recipes/admin-recipe.dto.ts`, add nested DTOs:

```ts
export class SupplementTargetDto {
  @IsString()
  fieldPath!: string;

  @IsString()
  label!: string;

  @IsNumber()
  @Min(0)
  targetValuePerKg!: number;

  @IsString()
  unit!: string;
}
```

Then add to `RecipeItemDto`:

```ts
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SupplementTargetDto)
  supplementTargets?: SupplementTargetDto[];
```

In `backend/src/interfaces/dto/recipes/recipe-response.dto.ts`, add:

```ts
export interface SupplementTargetResponseDto {
  fieldPath: string;
  label: string;
  targetValuePerKg: number;
  unit: string;
}
```

Then add `supplementTargets?: SupplementTargetResponseDto[];` to recipe item response.

- [ ] **Step 4: Update repository interfaces**

Add `supplementTargets?: SupplementTarget[] | null;` to recipe repository item types in `backend/src/domain/recipe/recipe.repository.ts`.

- [ ] **Step 5: Run type/build checks**

Run:

```bash
cd backend
npm test -- tests/application/recipe/recipe.service.spec.ts tests/application/recipe/recipe-supplement-alternatives.spec.ts
```

Expected: existing tests compile and pass or fail only where implementation still ignores the new field.

- [ ] **Step 6: Commit Task 2**

```bash
git add backend/prisma/schema.prisma \
  backend/prisma/migrations/20260417190000_add_recipe_item_supplement_targets/migration.sql \
  backend/src/domain/ingredient/types.ts \
  backend/src/domain/recipe/types.ts \
  backend/src/domain/recipe/recipe.repository.ts \
  backend/src/interfaces/dto/recipes/admin-recipe.dto.ts \
  backend/src/interfaces/dto/recipes/recipe-response.dto.ts
git commit -m "feat: add recipe supplement target model"
```

### Task 3: Persist and Expose Recipe Supplement Targets

**Files:**
- Modify: `backend/src/application/recipe/recipe.service.ts`
- Modify: `backend/src/infrastructure/repositories/prisma-recipe.repository.ts`
- Modify: `backend/src/interfaces/controllers/recipes.controller.ts`
- Test: `backend/tests/application/recipe/recipe-supplement-targets.spec.ts`

- [ ] **Step 1: Write failing service test**

Create `backend/tests/application/recipe/recipe-supplement-targets.spec.ts` using the same mocked Prisma service shape as the supplement alternatives test:

```ts
import { RecipeService } from 'src/application/recipe/recipe.service';
import { RecipeStatus } from 'src/domain/recipe/enums';

describe('recipe supplement targets', () => {
  const mockPrismaService = {
    recipe: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    recipeItem: {
      deleteMany: jest.fn(),
    },
    ingredient: {
      findMany: jest.fn(),
    },
    recipeHealthTagAssignment: {
      createMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    preparationMethod: {
      findMany: jest.fn(),
    },
  };

  let service: RecipeService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new RecipeService(mockPrismaService as any);
    mockPrismaService.recipe.findFirst.mockResolvedValue(null);
    mockPrismaService.recipe.create.mockResolvedValue({ id: 'recipe-row-id' });
    mockPrismaService.recipeHealthTagAssignment.createMany.mockResolvedValue({ count: 0 });
    mockPrismaService.recipeHealthTagAssignment.deleteMany.mockResolvedValue({ count: 0 });
    mockPrismaService.recipeItem.deleteMany.mockResolvedValue({ count: 0 });
    mockPrismaService.preparationMethod.findMany.mockResolvedValue([]);
    mockPrismaService.ingredient.findMany.mockResolvedValue([
      { id: 'supp-1', type: 'SUPPLEMENT' },
    ]);
  });

  it('persists supplementTargets when creating a supplement recipe item', async () => {
    mockPrismaService.recipe.findUnique.mockResolvedValue({
      id: 'recipe-row-id',
      recipeId: 'recipe-1',
      version: 1,
      name: '新版补剂目标测试食谱',
      status: RecipeStatus.DRAFT,
      energyDensityKcalPerKg: 1500,
      productionLossRate: 1.07,
      batchLaborHours: 2,
      coverImageUrl: null,
      coverTitle: null,
      detailImages: [],
      videoUrl: null,
      description: null,
      designSource: null,
      nutritionStandard: 'FEDIAF_2021',
      nutritionDetailedData: null,
      applicableLifeStages: [],
      productionSteps: null,
      salesCount: 0,
      diyGenCount: 0,
      likeCount: 0,
      favoriteCount: 0,
      createdAt: new Date('2026-04-17T10:00:00.000Z'),
      updatedAt: new Date('2026-04-17T10:00:00.000Z'),
      healthTagAssignments: [],
      items: [
        {
          id: 'recipe-item-1',
          ingredientId: 'supp-1',
          preparationMethod: null,
          exampleWeight: null,
          ratioPercent: null,
          nutrientTargetKey: null,
          nutrientTargetValue: null,
          supplementTargets: [
            { fieldPath: 'minerals.iodine', label: '碘', targetValuePerKg: 660, unit: 'μg' },
          ],
          sortOrder: 0,
          ingredient: {
            id: 'supp-1',
            name: '海带片',
            type: 'SUPPLEMENT',
            properties: {},
          },
          supplementAlternatives: [],
        },
      ],
    });

    const result = await service.createRecipe({
      name: '新版补剂目标测试食谱',
      nutritionStandard: 'FEDIAF_2021',
      energyDensityKcalPerKg: 1500,
      items: [
        {
          ingredientId: 'supp-1',
          supplementTargets: [
            { fieldPath: 'minerals.iodine', label: '碘', targetValuePerKg: 660, unit: 'μg' },
          ],
        },
      ],
    });

    expect(mockPrismaService.recipe.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          items: {
            create: [
              expect.objectContaining({
                ingredientId: 'supp-1',
                supplementTargets: [
                  { fieldPath: 'minerals.iodine', label: '碘', targetValuePerKg: 660, unit: 'μg' },
                ],
              }),
            ],
          },
        }),
      }),
    );
    expect(result.items[0].supplementTargets).toEqual([
      { fieldPath: 'minerals.iodine', label: '碘', targetValuePerKg: 660, unit: 'μg' },
    ]);
  });
});
```

- [ ] **Step 2: Persist in create/update paths**

In `backend/src/application/recipe/recipe.service.ts`, when creating recipe items, pass:

```ts
supplementTargets: item.supplementTargets ?? null,
```

In update paths, preserve and replace `supplementTargets` together with other recipe item fields.

- [ ] **Step 3: Read/write in Prisma repository**

In `backend/src/infrastructure/repositories/prisma-recipe.repository.ts`, include `supplementTargets` in create/update/select mappings:

```ts
supplementTargets: item.supplementTargets ?? undefined,
```

and response mapping:

```ts
supplementTargets: (item.supplementTargets as any) ?? undefined,
```

- [ ] **Step 4: Public/staff recipe response exposes new targets**

In `backend/src/interfaces/controllers/recipes.controller.ts`, include:

```ts
supplementTargets: item.supplementTargets || undefined,
```

Keep `nutrientTargetKey` and `nutrientTargetValue` in the response during migration only.

- [ ] **Step 5: Verify recipe tests**

Run:

```bash
cd backend
npm test -- tests/application/recipe/recipe-supplement-targets.spec.ts tests/application/recipe/recipe-supplement-alternatives.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 3**

```bash
git add backend/src/application/recipe/recipe.service.ts \
  backend/src/infrastructure/repositories/prisma-recipe.repository.ts \
  backend/src/interfaces/controllers/recipes.controller.ts \
  backend/tests/application/recipe/recipe-supplement-targets.spec.ts
git commit -m "feat: persist recipe supplement targets"
```

### Task 4: Switch Pricing and Order Snapshots to V2 Targets

**Files:**
- Modify: `backend/src/domain/pricing/pricing.service.ts`
- Modify: `backend/src/application/order/order.service.ts`
- Modify: `backend/src/interfaces/dto/orders/pricing-preview.dto.ts`
- Test: `backend/tests/domain/pricing/pricing-supplement-resolver.spec.ts`

- [ ] **Step 1: Update pricing test to use only v2 targets and nutrition_profile**

Modify the supplement item in `backend/tests/domain/pricing/pricing-supplement-resolver.spec.ts`:

```ts
{
  id: 'recipe-item-supp-1',
  ingredientId: supplementIngredient.id,
  ingredient: supplementIngredient,
  supplementTargets: [
    { fieldPath: 'vitamins.vitaminE', label: '维生素 E', targetValuePerKg: 1000, unit: 'IU' },
  ],
}
```

Remove `active_nutrients` from the supplement ingredient properties in the same test.

- [ ] **Step 2: Add multi-target pricing test**

Add:

```ts
it('uses maximum required amount for multi-target supplements', async () => {
  // Build fish oil ingredient with fattyAcids: { epa: 180, dha: 120 }
  // Build recipe item with EPA 360mg/kg and DHA 360mg/kg
  // dailyG=1000, days=1, supplementLossRate=1
  // Expected supplement detail amount: 3
});
```

Use the same `PricingService` setup as the existing test.

- [ ] **Step 3: Switch pricing implementation**

In `backend/src/domain/pricing/pricing.service.ts`, replace the old supplement concentration lookup with:

```ts
const targets = item.supplementTargets ?? [];
const dose = calculateSupplementDose({
  nutritionProfile: ingredient.nutritionProfile,
  targets,
  basisWeightG: totalNetFoodWeightG,
  displayUnit: ingredient.unitDisplayLabel,
  lossRate: ingredient.getProductionLossRate() ?? globalConfig.supplementLossRate,
});
const unitsNeeded = dose.amount;
```

If `targets.length === 0`, throw:

```ts
throw new ValidationError(`supplementTargets are required for SUPPLEMENT ingredient: ${ingredient.name}`);
```

- [ ] **Step 4: Snapshot supplement targets and nutrition profile**

In both order creation paths in `backend/src/application/order/order.service.ts`, snapshot supplement items with:

```ts
supplement_targets: ri.supplementTargets ?? undefined,
nutrition_profile_snapshot:
  ingredient?.type === 'SUPPLEMENT' ? ingredient?.nutritionProfile ?? null : undefined,
```

Keep legacy `nutrient_target_key` and `nutrient_target_value` only for old miniapp compatibility during migration.

- [ ] **Step 5: Verify pricing tests**

Run:

```bash
cd backend
npm test -- tests/domain/pricing/pricing-supplement-resolver.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 4**

```bash
git add backend/src/domain/pricing/pricing.service.ts \
  backend/src/application/order/order.service.ts \
  backend/src/interfaces/dto/orders/pricing-preview.dto.ts \
  backend/tests/domain/pricing/pricing-supplement-resolver.spec.ts
git commit -m "feat: price supplements from v2 targets"
```

### Task 5: Stop Writing Legacy Supplement Concentration Fields

**Files:**
- Modify: `backend/src/application/ingredient/ingredient.service.ts`
- Modify: `backend/src/domain/ingredient/supplement-nutrition-resolver.ts`
- Modify: `backend/tests/domain/ingredient/supplement-nutrition-resolver.spec.ts`
- Modify: `backend/tests/application/ingredient/ingredient-service-nutrition-profile-compat.spec.ts`

- [ ] **Step 1: Update resolver tests**

Change `backend/tests/domain/ingredient/supplement-nutrition-resolver.spec.ts` so:

```ts
it('does not derive EPA+DHA combined nutrients', () => {
  const result = resolveSupplementNutrients({
    nutritionProfile: {
      meta: { rawBasisType: 'PER_SERVING' },
      macros: {},
      minerals: {},
      vitamins: {},
      fattyAcids: { epa: 0.3, dha: 0.4 },
      aminoAcids: {},
      customItems: [],
    } as any,
  });

  expect(result['EPA']).toEqual({ value: 0.3, unit: 'mg' });
  expect(result['DHA']).toEqual({ value: 0.4, unit: 'mg' });
  expect(result['EPA+DHA']).toBeUndefined();
});
```

- [ ] **Step 2: Remove legacy active_nutrients writes**

In `backend/src/application/ingredient/ingredient.service.ts`, remove the assignment:

```ts
supplementProperties.active_nutrients = resolveSupplementNutrients(...)
```

Return supplement properties without generated `active_nutrients`.

- [ ] **Step 3: Keep resolver only for temporary display compatibility**

In `backend/src/domain/ingredient/supplement-nutrition-resolver.ts`, remove `EPA+DHA` synthesis and mark the function as display compatibility only in a comment.

- [ ] **Step 4: Verify ingredient tests**

Run:

```bash
cd backend
npm test -- tests/domain/ingredient/supplement-nutrition-resolver.spec.ts tests/application/ingredient/ingredient-service-nutrition-profile-compat.spec.ts
```

Expected: PASS after test updates.

- [ ] **Step 5: Commit Task 5**

```bash
git add backend/src/application/ingredient/ingredient.service.ts \
  backend/src/domain/ingredient/supplement-nutrition-resolver.ts \
  backend/tests/domain/ingredient/supplement-nutrition-resolver.spec.ts \
  backend/tests/application/ingredient/ingredient-service-nutrition-profile-compat.spec.ts
git commit -m "refactor: stop writing legacy supplement nutrients"
```

### Task 6: Migrate Admin Recipe Editor to Target Field Picker

**Files:**
- Modify: `admin-web/src/constants/ingredientNutrition.ts`
- Modify: `admin-web/src/types/recipe.ts`
- Modify: `admin-web/src/views/Recipes/RecipeForm.vue`
- Modify: `admin-web/src/views/Ingredients/IngredientForm.vue`
- Modify: `admin-web/src/views/Ingredients/components/IngredientNutritionDialog.vue`

- [ ] **Step 1: Add admin target types**

In `admin-web/src/types/recipe.ts`:

```ts
export interface SupplementTarget {
  fieldPath: string
  label: string
  targetValuePerKg: number
  unit: string
}
```

Add `supplementTargets?: SupplementTarget[]` to `RecipeItem` and form item types.

- [ ] **Step 2: Export selectable field catalog**

In `admin-web/src/constants/ingredientNutrition.ts`, add a UI catalog matching backend field paths:

```ts
export const SUPPLEMENT_TARGET_FIELD_OPTIONS = [
  { group: '矿物质', fieldPath: 'minerals.iodine', label: '碘', unit: 'μg' },
  { group: '矿物质', fieldPath: 'minerals.calcium', label: '钙', unit: 'mg' },
  { group: '矿物质', fieldPath: 'minerals.zinc', label: '锌', unit: 'mg' },
  { group: '维生素', fieldPath: 'vitamins.vitaminD', label: '维生素 D', unit: 'IU' },
  { group: '维生素', fieldPath: 'vitamins.vitaminE', label: '维生素 E', unit: 'IU' },
  { group: '维生素', fieldPath: 'vitamins.choline', label: '胆碱', unit: 'mg' },
  { group: '脂肪酸', fieldPath: 'fattyAcids.epa', label: 'EPA', unit: 'mg' },
  { group: '脂肪酸', fieldPath: 'fattyAcids.dha', label: 'DHA', unit: 'mg' },
] as const
```

- [ ] **Step 3: Replace old recipe target controls**

In `admin-web/src/views/Recipes/RecipeForm.vue`, replace the single `nutrientTargetKey` select and `nutrientTargetValue` input with a repeatable table bound to:

```ts
ingredientForm.supplementTargets
```

Each row stores:

```ts
{
  fieldPath: selected.fieldPath,
  label: selected.label,
  targetValuePerKg: Number(row.targetValuePerKg),
  unit: selected.unit,
}
```

- [ ] **Step 4: Submit supplementTargets**

When adding/updating a supplement ingredient row, submit:

```ts
supplementTargets: ingredientForm.supplementTargets.map((target) => ({
  fieldPath: target.fieldPath,
  label: target.label,
  targetValuePerKg: Number(target.targetValuePerKg),
  unit: target.unit,
}))
```

Keep legacy `nutrientTargetKey` and `nutrientTargetValue` unset for new rows.

- [ ] **Step 5: Stop generating active_nutrients in ingredient edit forms**

Remove calls to `buildSupplementActiveNutrientsFromNutritionProfile` in:

- `admin-web/src/views/Ingredients/IngredientForm.vue`
- `admin-web/src/views/Ingredients/components/IngredientNutritionDialog.vue`

- [ ] **Step 6: Verify admin build**

Run:

```bash
cd admin-web
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit Task 6**

```bash
git add admin-web/src/constants/ingredientNutrition.ts \
  admin-web/src/types/recipe.ts \
  admin-web/src/views/Recipes/RecipeForm.vue \
  admin-web/src/views/Ingredients/IngredientForm.vue \
  admin-web/src/views/Ingredients/components/IngredientNutritionDialog.vue
git commit -m "feat: edit recipe supplement targets by nutrition field"
```

### Task 7: Migrate Miniapp Supplement Calculation and Display

**Files:**
- Modify: `miniapp/src/utils/supplement-nutrients.ts`
- Modify: `miniapp/src/utils/supplement-nutrients.spec.ts`
- Modify: `miniapp/src/pages/diy-sheet/supplement-alternatives.ts`
- Modify: `miniapp/src/pages/diy-sheet/supplement-alternatives.spec.ts`
- Modify: `miniapp/src/pages/diy-sheet/index.vue`
- Modify: `miniapp/src/pages/recipe-detail/index.vue`
- Modify: `miniapp/src/pages/staff-production/detail.vue`
- Modify: `miniapp/src/pages/staff-production/print-task.vue`
- Modify: `miniapp/src/utils/canvas-printer.ts`
- Modify: `miniapp/src/utils/label-renderer.ts`

- [ ] **Step 1: Update miniapp utility tests**

In `miniapp/src/utils/supplement-nutrients.spec.ts`, add:

```ts
it('calculates multi-target supplements from nutrition profile snapshots', () => {
  const item = {
    supplement_targets: [
      { fieldPath: 'fattyAcids.epa', label: 'EPA', targetValuePerKg: 360, unit: 'mg' },
      { fieldPath: 'fattyAcids.dha', label: 'DHA', targetValuePerKg: 360, unit: 'mg' },
    ],
    nutrition_profile_snapshot: {
      meta: { rawBasisType: 'PER_SERVING' },
      macros: {},
      minerals: {},
      vitamins: {},
      fattyAcids: { epa: 180, dha: 120 },
      aminoAcids: {},
      customItems: [],
    },
    unit_display_label: '粒',
  };

  expect(calculateSupplementAmountForProduction(item, 1000)).toEqual({
    amount: 3,
    unit: '粒',
  });
});
```

Remove tests that expect fallback to `properties.active_nutrients`.

- [ ] **Step 2: Implement miniapp v2 resolver**

In `miniapp/src/utils/supplement-nutrients.ts`, read:

```ts
const targets = item?.supplementTargets || item?.supplement_targets || []
const profile = item?.nutritionProfile || item?.nutrition_profile_snapshot || item?.ingredient?.nutritionProfile
```

Calculate each target from `fieldPath`, then return the maximum required amount.

- [ ] **Step 3: Update DIY alternatives**

In `miniapp/src/pages/diy-sheet/supplement-alternatives.ts`, replace `activeNutrients` logic with selected option `nutritionProfile` and base item `supplementTargets`.

- [ ] **Step 4: Update display labels**

Update recipe detail, DIY sheet, label renderer, production detail, print task, and canvas printer so supplement target labels render from:

```ts
item.supplementTargets || item.supplement_targets
```

Use a display string like:

```text
每kg添加 660μg 碘
```

For multiple targets, join with `、`.

- [ ] **Step 5: Verify miniapp tests and build**

Run:

```bash
cd miniapp
npm test -- src/utils/supplement-nutrients.spec.ts src/pages/diy-sheet/supplement-alternatives.spec.ts src/utils/diy-sheet-format.spec.ts
npm run build:mp-weixin
```

Expected: PASS. Sass legacy API warnings are allowed.

- [ ] **Step 6: Commit Task 7**

```bash
git add miniapp/src/utils/supplement-nutrients.ts \
  miniapp/src/utils/supplement-nutrients.spec.ts \
  miniapp/src/pages/diy-sheet/supplement-alternatives.ts \
  miniapp/src/pages/diy-sheet/supplement-alternatives.spec.ts \
  miniapp/src/pages/diy-sheet/index.vue \
  miniapp/src/pages/recipe-detail/index.vue \
  miniapp/src/pages/staff-production/detail.vue \
  miniapp/src/pages/staff-production/print-task.vue \
  miniapp/src/utils/canvas-printer.ts \
  miniapp/src/utils/label-renderer.ts
git commit -m "feat: calculate miniapp supplements from v2 targets"
```

### Task 8: Add Migration Script and Audit Report

**Files:**
- Create: `backend/prisma/backfill-recipe-supplement-targets-v2.ts`
- Create: `backend/tests/prisma/backfill-recipe-supplement-targets-v2.spec.ts`
- Modify: `backend/package.json`

- [ ] **Step 1: Write mapping test**

Create `backend/tests/prisma/backfill-recipe-supplement-targets-v2.spec.ts`:

```ts
import {
  mapLegacySupplementTarget,
} from '../../prisma/backfill-recipe-supplement-targets-v2';

describe('backfill recipe supplement targets v2', () => {
  it.each([
    ['碘', 660, { fieldPath: 'minerals.iodine', label: '碘', targetValuePerKg: 660, unit: 'μg' }],
    ['钙', 2160, { fieldPath: 'minerals.calcium', label: '钙', targetValuePerKg: 2160, unit: 'mg' }],
    ['锌', 17, { fieldPath: 'minerals.zinc', label: '锌', targetValuePerKg: 17, unit: 'mg' }],
    ['维生素E', 95, { fieldPath: 'vitamins.vitaminE', label: '维生素 E', targetValuePerKg: 95, unit: 'IU' }],
    ['维生素D', 125, { fieldPath: 'vitamins.vitaminD', label: '维生素 D', targetValuePerKg: 125, unit: 'IU' }],
    ['胆碱', 150, { fieldPath: 'vitamins.choline', label: '胆碱', targetValuePerKg: 150, unit: 'mg' }],
  ])('maps %s', (key, value, expected) => {
    expect(mapLegacySupplementTarget(key, value)).toEqual(expected);
  });

  it('requires manual review for EPA+DHA', () => {
    expect(mapLegacySupplementTarget('EPA+DHA', 600)).toBeNull();
  });
});
```

- [ ] **Step 2: Implement script**

Create `backend/prisma/backfill-recipe-supplement-targets-v2.ts` with:

```ts
export function mapLegacySupplementTarget(
  key: string | null | undefined,
  value: number | null | undefined,
) {
  if (!key || !(value && value > 0)) return null;
  const normalized = key.replace(/\s+/g, '');
  const mapping: Record<string, { fieldPath: string; label: string; unit: string }> = {
    碘: { fieldPath: 'minerals.iodine', label: '碘', unit: 'μg' },
    钙: { fieldPath: 'minerals.calcium', label: '钙', unit: 'mg' },
    锌: { fieldPath: 'minerals.zinc', label: '锌', unit: 'mg' },
    维生素E: { fieldPath: 'vitamins.vitaminE', label: '维生素 E', unit: 'IU' },
    维生素D: { fieldPath: 'vitamins.vitaminD', label: '维生素 D', unit: 'IU' },
    胆碱: { fieldPath: 'vitamins.choline', label: '胆碱', unit: 'mg' },
  };
  const mapped = mapping[normalized];
  return mapped ? { ...mapped, targetValuePerKg: value } : null;
}
```

The script should support dry-run by default and `--apply` for updates. It must print all `EPA+DHA` rows as manual-review items and not update them automatically.

- [ ] **Step 3: Add package scripts**

In `backend/package.json`:

```json
"backfill:recipe-supplement-targets-v2": "ts-node -r tsconfig-paths/register prisma/backfill-recipe-supplement-targets-v2.ts",
"backfill:recipe-supplement-targets-v2:apply": "ts-node -r tsconfig-paths/register prisma/backfill-recipe-supplement-targets-v2.ts --apply"
```

- [ ] **Step 4: Verify migration tests**

Run:

```bash
cd backend
npm test -- tests/prisma/backfill-recipe-supplement-targets-v2.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 8**

```bash
git add backend/prisma/backfill-recipe-supplement-targets-v2.ts \
  backend/tests/prisma/backfill-recipe-supplement-targets-v2.spec.ts \
  backend/package.json
git commit -m "chore: add supplement target v2 backfill"
```

### Task 9: Final Verification

**Files:** all changed files

- [ ] **Step 1: Backend tests**

Run:

```bash
cd backend
npm test -- tests/domain/ingredient/nutrition-field-catalog.spec.ts \
  tests/domain/ingredient/supplement-targets.spec.ts \
  tests/domain/ingredient/supplement-nutrition-resolver.spec.ts \
  tests/domain/pricing/pricing-supplement-resolver.spec.ts \
  tests/application/recipe/recipe-supplement-targets.spec.ts \
  tests/prisma/backfill-recipe-supplement-targets-v2.spec.ts
```

Expected: PASS.

- [ ] **Step 2: Backend build**

Run:

```bash
cd backend
npm run build
```

Expected: PASS.

- [ ] **Step 3: Admin build**

Run:

```bash
cd admin-web
npm run build
```

Expected: PASS. Existing chunk-size warnings are allowed.

- [ ] **Step 4: Miniapp tests and build**

Run:

```bash
cd miniapp
npm test -- src/utils/supplement-nutrients.spec.ts src/pages/diy-sheet/supplement-alternatives.spec.ts src/utils/diy-sheet-format.spec.ts
npm run build:mp-weixin
```

Expected: PASS. Sass legacy API warnings are allowed.

- [ ] **Step 5: Diff hygiene**

Run from worktree root:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors. Status only shows intended files.

- [ ] **Step 6: Push branch**

```bash
git push -u origin codex/supplement-nutrition-targets-v2
```

Expected: branch pushed.
