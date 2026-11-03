# Nutrition Data Contract V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stabilize the nutrition profile data contract before bulk-confirming USDA candidates into `Ingredient.nutritionProfile`.

**Architecture:** Keep `NutritionProfileV2` as the internal canonical profile. Add richer field, source, conversion, and supplement-basis contracts around it without immediately migrating production data or widening the database source enum. Source-specific values remain traceable through `meta`, `sourceDetail`, and `rawData`; standards matching remains a later compliance layer.

**Tech Stack:** NestJS + Prisma + PostgreSQL + Jest, Vue 3 + Element Plus + TypeScript, Uni-app/Vitest for miniapp supplement calculations.

---

## Scope Check

This plan implements the first contract-hardening phase from `docs/reports/2026-05-11-nutrition-profile-structure-audit.md`.

In scope:

- Field contract metadata for canonical units, quantity kinds, source aliases, conversion policies, and derived expressions.
- Source metadata contract using `sourceKind`, `sourceCode`, `sourceVersion`, `externalId`, and source forms.
- USDA mapping cleanup and extension, including iodine and conversion notes.
- A guard against using the old flat `NutritionFoodService.parseUSDANutrients()` path for new USDA imports.
- Supplement concentration resolution that respects `PER_1_G`, `PER_100_G`, and `PER_SERVING`.
- Contract audit updates so future USDA confirmation uses the hardened structure.

Out of scope:

- Bulk writing the 50 approved USDA candidates into `Ingredient.nutritionProfile`.
- Full AAFCO/FEDIAF/NRC standard tables and compliance calculator.
- Full OCR/AI label extraction implementation.
- Prisma migration from `NutritionGovernanceSourceType` enum to a source registry table.
- WeChat miniapp governance UI.

## File Structure

### Backend Domain

- Modify: `backend/src/domain/ingredient/types.ts`
  - Add source metadata, source form, and conversion-note types to `NutritionMeta`.
- Modify: `backend/src/domain/ingredient/nutrition-field-catalog.ts`
  - Expand field definitions into a canonical field contract.
  - Add derived expression definitions.
  - Preserve existing `findNutritionField`, `listSupplementTargetFields`, and `getNutritionProfileFieldValue` behavior.
- Create: `backend/src/domain/ingredient/nutrition-source-contract.ts`
  - Define `NutritionSourceKind`, `NutritionSourceCode`, known source definitions, and legacy source mapping helpers.
- Create: `backend/src/domain/ingredient/supplement-concentration-resolver.ts`
  - Resolve canonical concentration per gram or per serving from `NutritionProfileV2`.
- Modify: `backend/src/domain/ingredient/supplement-targets.ts`
  - Use the resolver when calculating supplement dose.
- Modify: `backend/src/domain/nutrition-governance/usda-nutrient-map.ts`
  - Add source units, conversion notes, iodine, and more canonical nutrients.
- Modify: `backend/src/domain/nutrition-governance/nutrition-governance.utils.ts`
  - Populate USDA source metadata and conversion notes when building normalized profiles.
- Modify: `backend/src/domain/nutrition-governance/nutrition-profile-contract.ts`
  - Validate source metadata and activity-vitamin conversion evidence where applicable.
- Modify: `backend/src/application/nutrition-food/nutrition-food.service.ts`
  - Stop treating the old flat USDA parser as the primary import path.

### Backend Tests

- Modify: `backend/tests/domain/ingredient/nutrition-field-catalog.spec.ts`
- Create: `backend/tests/domain/ingredient/nutrition-source-contract.spec.ts`
- Create: `backend/tests/domain/ingredient/supplement-concentration-resolver.spec.ts`
- Create: `backend/tests/domain/nutrition-governance/usda-nutrient-map.spec.ts`
- Modify: `backend/tests/domain/nutrition-governance/nutrition-profile-contract.spec.ts`
- Modify or create: `backend/tests/application/nutrition-food/nutrition-food.service.spec.ts`

### Admin Web

- Modify: `admin-web/src/types/ingredient.ts`
  - Mirror the backend `NutritionMeta` source contract fields.
- Modify: `admin-web/src/constants/ingredientNutrition.ts`
  - Align source options with source kind/code terminology while preserving existing labels.
- Modify: `admin-web/src/utils/ingredientNutrition.ts`
  - Preserve source metadata and source forms through edit/save.
- Modify: `admin-web/src/utils/ingredientNutritionUnits.ts`
  - Keep vitamin A/D/E conversion helpers, but avoid persisting ambiguous generic IU.
- Modify: `admin-web/tests/ingredientNutritionUnits.test.ts`
  - Add conversion/source-form assertions.

### Miniapp

- Modify: `miniapp/src/utils/supplement-nutrients.ts`
  - Resolve supplement concentration using profile basis instead of treating raw value as concentration.
- Modify: `miniapp/src/utils/supplement-nutrients.spec.ts`
  - Add per-1g, per-100g, and per-serving supplement cases.

---

### Task 1: Field Contract Metadata

**Files:**
- Modify: `backend/src/domain/ingredient/nutrition-field-catalog.ts`
- Modify: `backend/tests/domain/ingredient/nutrition-field-catalog.spec.ts`

- [ ] **Step 1: Write the field-contract tests**

Append tests to `backend/tests/domain/ingredient/nutrition-field-catalog.spec.ts`:

```ts
it('exposes canonical unit metadata for activity vitamins', () => {
  expect(findNutritionField('vitamins.vitaminD')).toMatchObject({
    fieldPath: 'vitamins.vitaminD',
    unit: 'IU',
    quantityKind: 'ACTIVITY',
    canonicalUnitBasis: 'vitamin_d_activity_iu',
    conversionPolicy: 'SOURCE_FORM_REQUIRED_FOR_LABELS',
  });
  expect(findNutritionField('vitamins.vitaminK')).toMatchObject({
    fieldPath: 'vitamins.vitaminK',
    unit: 'μg',
    quantityKind: 'MASS',
    canonicalUnitBasis: 'vitamin_k_activity_ug',
  });
});

it('keeps standard supplement target fields free of derived expressions', () => {
  const paths = listSupplementTargetFields().map((field) => field.fieldPath);
  expect(paths).toContain('fattyAcids.epa');
  expect(paths).toContain('fattyAcids.dha');
  expect(paths).not.toContain('derived.epaDha');
  expect(paths).not.toContain('derived.caP');
});

it('lists derived expressions needed by standards without storing them as profile tabs', () => {
  expect(listDerivedNutritionFields()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        fieldPath: 'derived.epaDha',
        sourceFieldPaths: ['fattyAcids.epa', 'fattyAcids.dha'],
        unit: 'mg',
      }),
      expect.objectContaining({
        fieldPath: 'derived.caP',
        sourceFieldPaths: ['minerals.calcium', 'minerals.phosphorus'],
        unit: 'ratio',
      }),
    ]),
  );
});
```

- [ ] **Step 2: Run the failing tests**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/ingredient-nutrition-governance/backend
npm test -- tests/domain/ingredient/nutrition-field-catalog.spec.ts --runInBand
```

Expected: FAIL because `quantityKind`, `canonicalUnitBasis`, `conversionPolicy`, and `listDerivedNutritionFields` do not exist.

- [ ] **Step 3: Implement the field contract**

Update `NutritionFieldDefinition`:

```ts
export type NutritionQuantityKind =
  | 'ENERGY'
  | 'MASS'
  | 'ACTIVITY'
  | 'RATIO';

export type NutritionConversionPolicy =
  | 'DIRECT'
  | 'UNIT_CONVERSION'
  | 'SOURCE_FORM_REQUIRED_FOR_LABELS'
  | 'DERIVED';

export interface NutritionSourceAlias {
  sourceCode: string;
  sourceNutrientId?: number;
  sourceFieldName: string;
  sourceUnit?: string;
}

export interface NutritionFieldDefinition {
  tabKey: NutritionFieldTab;
  fieldKey: string;
  fieldPath: `${NutritionFieldTab}.${string}`;
  label: string;
  unit: string;
  quantityKind: NutritionQuantityKind;
  canonicalUnitBasis: string;
  conversionPolicy: NutritionConversionPolicy;
  sourceAliases?: NutritionSourceAlias[];
}
```

Add derived contracts:

```ts
export interface DerivedNutritionFieldDefinition {
  fieldPath: `derived.${string}`;
  label: string;
  unit: string;
  quantityKind: 'MASS' | 'RATIO';
  sourceFieldPaths: string[];
  formula: 'SUM' | 'RATIO';
}

export const DERIVED_NUTRITION_FIELD_CATALOG = [
  {
    fieldPath: 'derived.epaDha',
    label: 'EPA + DHA',
    unit: 'mg',
    quantityKind: 'MASS',
    sourceFieldPaths: ['fattyAcids.epa', 'fattyAcids.dha'],
    formula: 'SUM',
  },
  {
    fieldPath: 'derived.caP',
    label: '钙磷比',
    unit: 'ratio',
    quantityKind: 'RATIO',
    sourceFieldPaths: ['minerals.calcium', 'minerals.phosphorus'],
    formula: 'RATIO',
  },
] as const satisfies readonly DerivedNutritionFieldDefinition[];

export function listDerivedNutritionFields(): DerivedNutritionFieldDefinition[] {
  return [...DERIVED_NUTRITION_FIELD_CATALOG];
}
```

- [ ] **Step 4: Run the field tests again**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/ingredient-nutrition-governance/backend
npm test -- tests/domain/ingredient/nutrition-field-catalog.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/ingredient-nutrition-governance
git add backend/src/domain/ingredient/nutrition-field-catalog.ts backend/tests/domain/ingredient/nutrition-field-catalog.spec.ts
git commit -m "feat: define nutrition field contract metadata"
```

---

### Task 2: Source Metadata Contract

**Files:**
- Create: `backend/src/domain/ingredient/nutrition-source-contract.ts`
- Create: `backend/tests/domain/ingredient/nutrition-source-contract.spec.ts`
- Modify: `backend/src/domain/ingredient/types.ts`
- Modify: `admin-web/src/types/ingredient.ts`

- [ ] **Step 1: Write source-contract tests**

Create `backend/tests/domain/ingredient/nutrition-source-contract.spec.ts`:

```ts
import {
  getNutritionSourceDefinition,
  normalizeLegacyNutritionSourceType,
} from '../../../src/domain/ingredient/nutrition-source-contract';

describe('nutrition source contract', () => {
  it('maps legacy USDA source type to registered USDA FoodData Central source metadata', () => {
    expect(normalizeLegacyNutritionSourceType('USDA')).toEqual({
      sourceKind: 'FOOD_DATABASE',
      sourceCode: 'USDA_FDC',
      sourceProvider: 'USDA FoodData Central',
    });
  });

  it('keeps supplement labels distinct from food databases', () => {
    expect(normalizeLegacyNutritionSourceType('SUPPLEMENT_LABEL')).toEqual({
      sourceKind: 'PRODUCT_LABEL',
      sourceCode: 'SUPPLEMENT_LABEL',
      sourceProvider: 'Product label',
    });
  });

  it('registers future food database codes without requiring a Prisma enum change', () => {
    expect(getNutritionSourceDefinition('CNF')).toMatchObject({
      sourceKind: 'FOOD_DATABASE',
      sourceCode: 'CNF',
    });
    expect(getNutritionSourceDefinition('AUSNUT')).toMatchObject({
      sourceKind: 'FOOD_DATABASE',
      sourceCode: 'AUSNUT',
    });
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/ingredient-nutrition-governance/backend
npm test -- tests/domain/ingredient/nutrition-source-contract.spec.ts --runInBand
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the source contract**

Create `backend/src/domain/ingredient/nutrition-source-contract.ts`:

```ts
export type NutritionSourceKind =
  | 'FOOD_DATABASE'
  | 'PRODUCT_LABEL'
  | 'LAB_REPORT'
  | 'SUPPLIER_SPEC'
  | 'LITERATURE'
  | 'MANUAL_ESTIMATE';

export type NutritionSourceCode =
  | 'USDA_FDC'
  | 'CFCT'
  | 'CNF'
  | 'AUSNUT'
  | 'NEVO'
  | 'JP_FOOD_TABLE'
  | 'SUPPLEMENT_LABEL'
  | 'LAB_REPORT'
  | 'SUPPLIER_SPEC'
  | 'LITERATURE'
  | 'MANUAL_ESTIMATE';

export interface NutritionSourceDefinition {
  sourceKind: NutritionSourceKind;
  sourceCode: NutritionSourceCode;
  sourceProvider: string;
}

export const NUTRITION_SOURCE_DEFINITIONS: readonly NutritionSourceDefinition[] =
  [
    { sourceKind: 'FOOD_DATABASE', sourceCode: 'USDA_FDC', sourceProvider: 'USDA FoodData Central' },
    { sourceKind: 'FOOD_DATABASE', sourceCode: 'CFCT', sourceProvider: 'China Food Composition Tables' },
    { sourceKind: 'FOOD_DATABASE', sourceCode: 'CNF', sourceProvider: 'Canadian Nutrient File' },
    { sourceKind: 'FOOD_DATABASE', sourceCode: 'AUSNUT', sourceProvider: 'AUSNUT' },
    { sourceKind: 'FOOD_DATABASE', sourceCode: 'NEVO', sourceProvider: 'NEVO' },
    { sourceKind: 'FOOD_DATABASE', sourceCode: 'JP_FOOD_TABLE', sourceProvider: 'Standard Tables of Food Composition in Japan' },
    { sourceKind: 'PRODUCT_LABEL', sourceCode: 'SUPPLEMENT_LABEL', sourceProvider: 'Product label' },
    { sourceKind: 'LAB_REPORT', sourceCode: 'LAB_REPORT', sourceProvider: 'Laboratory report' },
    { sourceKind: 'SUPPLIER_SPEC', sourceCode: 'SUPPLIER_SPEC', sourceProvider: 'Supplier specification' },
    { sourceKind: 'LITERATURE', sourceCode: 'LITERATURE', sourceProvider: 'Literature' },
    { sourceKind: 'MANUAL_ESTIMATE', sourceCode: 'MANUAL_ESTIMATE', sourceProvider: 'Manual estimate' },
  ] as const;

export function getNutritionSourceDefinition(
  sourceCode: string | null | undefined,
): NutritionSourceDefinition | undefined {
  return NUTRITION_SOURCE_DEFINITIONS.find(
    (item) => item.sourceCode === sourceCode,
  );
}

export function normalizeLegacyNutritionSourceType(
  sourceType: string | null | undefined,
): NutritionSourceDefinition | undefined {
  switch (sourceType) {
    case 'USDA':
      return getNutritionSourceDefinition('USDA_FDC');
    case 'CFCT':
      return getNutritionSourceDefinition('CFCT');
    case 'SUPPLEMENT_LABEL':
    case 'LABEL':
      return getNutritionSourceDefinition('SUPPLEMENT_LABEL');
    case 'LAB_REPORT':
      return getNutritionSourceDefinition('LAB_REPORT');
    case 'SUPPLIER':
      return getNutritionSourceDefinition('SUPPLIER_SPEC');
    case 'LITERATURE':
      return getNutritionSourceDefinition('LITERATURE');
    case 'MANUAL':
    case 'MANUAL_ESTIMATE':
      return getNutritionSourceDefinition('MANUAL_ESTIMATE');
    default:
      return undefined;
  }
}
```

Add optional metadata to backend and admin `NutritionMeta`:

```ts
sourceKind?: NutritionSourceKind | string | null;
sourceCode?: NutritionSourceCode | string | null;
sourceVersion?: string | null;
externalId?: string | null;
sourceRecordId?: string | null;
sourceForms?: Record<string, NutritionSourceForm>;
conversionNotes?: Record<string, string>;
```

- [ ] **Step 4: Run source-contract tests**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/ingredient-nutrition-governance/backend
npm test -- tests/domain/ingredient/nutrition-source-contract.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/ingredient-nutrition-governance
git add backend/src/domain/ingredient/nutrition-source-contract.ts backend/tests/domain/ingredient/nutrition-source-contract.spec.ts backend/src/domain/ingredient/types.ts admin-web/src/types/ingredient.ts
git commit -m "feat: add nutrition source metadata contract"
```

---

### Task 3: USDA Mapping Cleanup

**Files:**
- Modify: `backend/src/domain/nutrition-governance/usda-nutrient-map.ts`
- Modify: `backend/src/domain/nutrition-governance/nutrition-governance.utils.ts`
- Create: `backend/tests/domain/nutrition-governance/usda-nutrient-map.spec.ts`
- Modify: `backend/src/application/nutrition-food/nutrition-food.service.ts`
- Create or modify: `backend/tests/application/nutrition-food/nutrition-food.service.spec.ts`

- [ ] **Step 1: Write USDA mapping tests**

Create `backend/tests/domain/nutrition-governance/usda-nutrient-map.spec.ts`:

```ts
import { USDA_NUTRIENT_MAP } from '../../../src/domain/nutrition-governance/usda-nutrient-map';
import { mapUsdaNutrientsToNutritionProfile } from '../../../src/domain/nutrition-governance/nutrition-governance.utils';

describe('USDA nutrient mapping', () => {
  it('maps iodine with the correct USDA nutrient id', () => {
    expect(USDA_NUTRIENT_MAP).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          nutrientId: 1100,
          fieldPath: 'minerals.iodine',
          sourceUnit: 'µg',
        }),
      ]),
    );
    expect(USDA_NUTRIENT_MAP).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          nutrientId: 1103,
          fieldPath: 'minerals.iodine',
        }),
      ]),
    );
  });

  it('stores vitamin D activity as IU with source conversion evidence', () => {
    const profile = mapUsdaNutrientsToNutritionProfile([
      { nutrient: { id: 1114, name: 'Vitamin D (D2 + D3)', unitName: 'µg' }, amount: 2.5 },
    ]);

    expect(profile.vitamins.vitaminD).toBe(100);
    expect(profile.meta.sourceForms?.['vitamins.vitaminD']).toMatchObject({
      sourceNutrientId: 1114,
      originalUnit: 'µg',
      canonicalUnit: 'IU',
    });
    expect(profile.meta.conversionNotes?.['vitamins.vitaminD']).toContain('1 µg vitamin D = 40 IU');
  });

  it('stores USDA vitamin E alpha-tocopherol conversion evidence', () => {
    const profile = mapUsdaNutrientsToNutritionProfile([
      { nutrient: { id: 1109, name: 'Vitamin E (alpha-tocopherol)', unitName: 'mg' }, amount: 1 },
    ]);

    expect(profile.vitamins.vitaminE).toBeCloseTo(1 / 0.67, 6);
    expect(profile.meta.sourceForms?.['vitamins.vitaminE']).toMatchObject({
      sourceNutrientId: 1109,
      originalUnit: 'mg',
      canonicalUnit: 'IU',
    });
  });
});
```

- [ ] **Step 2: Run the failing tests**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/ingredient-nutrition-governance/backend
npm test -- tests/domain/nutrition-governance/usda-nutrient-map.spec.ts --runInBand
```

Expected: FAIL because iodine and conversion evidence are missing.

- [ ] **Step 3: Implement USDA mapping metadata**

Extend `UsdaNutrientMapping`:

```ts
export interface UsdaNutrientMapping {
  nutrientId: number;
  tabKey: NutritionFieldTab;
  fieldKey: string;
  fieldPath: NutritionFieldPath;
  sourceUnit?: string;
  amountMultiplier?: number;
  conversionNote?: string;
}
```

Add or correct these mappings:

```ts
usdaField(1100, 'minerals', 'iodine', { sourceUnit: 'µg' }),
usdaField(1103, 'minerals', 'selenium', { sourceUnit: 'µg' }),
usdaField(1114, 'vitamins', 'vitaminD', {
  sourceUnit: 'µg',
  amountMultiplier: 40,
  conversionNote: '1 µg vitamin D = 40 IU',
}),
usdaField(1109, 'vitamins', 'vitaminE', {
  sourceUnit: 'mg',
  amountMultiplier: 1 / 0.67,
  conversionNote: '1 IU natural vitamin E activity = 0.67 mg d-alpha-tocopherol',
}),
```

Update `mapUsdaNutrientsToNutritionProfile()` to populate:

```ts
profile.meta.sourceKind = 'FOOD_DATABASE';
profile.meta.sourceCode = 'USDA_FDC';
profile.meta.sourceProvider = 'USDA FoodData Central';
profile.meta.sourceForms[fieldPath] = {
  sourceNutrientId: nutrientId,
  sourceName: nutrient.nutrient?.name ?? null,
  originalValue: amount,
  originalUnit: nutrient.nutrient?.unitName ?? mapping.sourceUnit ?? null,
  canonicalValue: amount * (mapping.amountMultiplier ?? 1),
  canonicalUnit: findNutritionField(mapping.fieldPath)?.unit ?? null,
};
profile.meta.conversionNotes[fieldPath] = mapping.conversionNote;
```

- [ ] **Step 4: Guard the old flat USDA parser**

Add a test asserting `NutritionFoodService.importFromUSDA()` does not silently create new flat USDA payloads for governance flows. The minimal implementation is to add a warning comment and route admin governance imports through `mapUsdaNutrientsToNutritionProfile()`. If the existing endpoint must remain for backwards compatibility, mark `parseUSDANutrients()` private legacy and add a test that its known-wrong IDs are no longer present in any new governance mapping.

- [ ] **Step 5: Run USDA-related tests**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/ingredient-nutrition-governance/backend
npm test -- tests/domain/nutrition-governance/usda-nutrient-map.spec.ts tests/domain/nutrition-governance/nutrition-profile-contract.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/ingredient-nutrition-governance
git add backend/src/domain/nutrition-governance/usda-nutrient-map.ts backend/src/domain/nutrition-governance/nutrition-governance.utils.ts backend/src/application/nutrition-food/nutrition-food.service.ts backend/tests/domain/nutrition-governance/usda-nutrient-map.spec.ts backend/tests/application/nutrition-food/nutrition-food.service.spec.ts backend/tests/domain/nutrition-governance/nutrition-profile-contract.spec.ts
git commit -m "fix: harden usda nutrient mapping contract"
```

---

### Task 4: Supplement Basis-Aware Dose Calculation

**Files:**
- Create: `backend/src/domain/ingredient/supplement-concentration-resolver.ts`
- Create: `backend/tests/domain/ingredient/supplement-concentration-resolver.spec.ts`
- Modify: `backend/src/domain/ingredient/supplement-targets.ts`
- Modify: `backend/tests/domain/ingredient/supplement-targets.spec.ts`
- Modify: `miniapp/src/utils/supplement-nutrients.ts`
- Modify: `miniapp/src/utils/supplement-nutrients.spec.ts`

- [ ] **Step 1: Write backend resolver tests**

Create `backend/tests/domain/ingredient/supplement-concentration-resolver.spec.ts`:

```ts
import { resolveSupplementConcentration } from '../../../src/domain/ingredient/supplement-concentration-resolver';

describe('supplement concentration resolver', () => {
  it('returns per gram concentration for PER_1_G profiles', () => {
    expect(
      resolveSupplementConcentration({
        meta: { rawBasisType: 'PER_1_G' },
        vitamins: { vitaminE: 200 },
      } as any, 'vitamins.vitaminE'),
    ).toMatchObject({ concentrationPerUnit: 200, doseUnit: 'g' });
  });

  it('converts PER_100_G profiles to per gram concentration', () => {
    expect(
      resolveSupplementConcentration({
        meta: { rawBasisType: 'PER_100_G' },
        vitamins: { vitaminE: 2000 },
      } as any, 'vitamins.vitaminE'),
    ).toMatchObject({ concentrationPerUnit: 20, doseUnit: 'g' });
  });

  it('uses serving weight to expose per serving and per gram concentration', () => {
    expect(
      resolveSupplementConcentration({
        meta: { rawBasisType: 'PER_SERVING', servingWeightG: 0.5 },
        vitamins: { vitaminE: 100 },
      } as any, 'vitamins.vitaminE'),
    ).toMatchObject({
      concentrationPerUnit: 100,
      doseUnit: 'serving',
      servingWeightG: 0.5,
      concentrationPerG: 200,
    });
  });
});
```

- [ ] **Step 2: Run failing backend tests**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/ingredient-nutrition-governance/backend
npm test -- tests/domain/ingredient/supplement-concentration-resolver.spec.ts --runInBand
```

Expected: FAIL because the resolver does not exist.

- [ ] **Step 3: Implement backend resolver**

Create `backend/src/domain/ingredient/supplement-concentration-resolver.ts`:

```ts
import { getNutritionProfileFieldValue } from './nutrition-field-catalog';
import { normalizeNutritionProfile } from './nutrition-profile.utils';
import type { NutritionProfile } from './types';

export interface SupplementConcentrationResolution {
  concentrationPerUnit: number;
  doseUnit: 'g' | 'ml' | 'serving';
  concentrationPerG?: number;
  servingWeightG?: number;
}

export function resolveSupplementConcentration(
  nutritionProfile: NutritionProfile | null | undefined,
  fieldPath: string,
): SupplementConcentrationResolution | undefined {
  const profile = normalizeNutritionProfile(nutritionProfile);
  const value = getNutritionProfileFieldValue(profile, fieldPath);
  if (!(value && value > 0)) return undefined;

  switch (profile?.meta.rawBasisType) {
    case 'PER_1_G':
      return { concentrationPerUnit: value, doseUnit: 'g', concentrationPerG: value };
    case 'PER_100_G':
      return { concentrationPerUnit: value / 100, doseUnit: 'g', concentrationPerG: value / 100 };
    case 'PER_SERVING':
      return {
        concentrationPerUnit: value,
        doseUnit: 'serving',
        servingWeightG: profile.meta.servingWeightG ?? undefined,
        concentrationPerG:
          profile.meta.servingWeightG && profile.meta.servingWeightG > 0
            ? value / profile.meta.servingWeightG
            : undefined,
      };
    case 'PER_1_ML':
      return { concentrationPerUnit: value, doseUnit: 'ml' };
    case 'PER_100_ML':
      return { concentrationPerUnit: value / 100, doseUnit: 'ml' };
    default:
      return undefined;
  }
}
```

- [ ] **Step 4: Update backend dose calculation**

In `backend/src/domain/ingredient/supplement-targets.ts`, replace direct concentration reads with the resolver. `requiredAmount` must use `resolution.concentrationPerUnit`, and returned `unit` should use `displayUnit || resolution.doseUnit`.

- [ ] **Step 5: Mirror basis handling in miniapp**

Update `miniapp/src/utils/supplement-nutrients.ts` so `getSupplementConcentration()` resolves `rawBasisType` the same way. Add Vitest cases in `miniapp/src/utils/supplement-nutrients.spec.ts` for per-1g, per-100g, and per-serving.

- [ ] **Step 6: Run backend and miniapp tests**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/ingredient-nutrition-governance/backend
npm test -- tests/domain/ingredient/supplement-concentration-resolver.spec.ts tests/domain/ingredient/supplement-targets.spec.ts --runInBand

cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/ingredient-nutrition-governance/miniapp
npm test -- src/utils/supplement-nutrients.spec.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/ingredient-nutrition-governance
git add backend/src/domain/ingredient/supplement-concentration-resolver.ts backend/src/domain/ingredient/supplement-targets.ts backend/tests/domain/ingredient/supplement-concentration-resolver.spec.ts backend/tests/domain/ingredient/supplement-targets.spec.ts miniapp/src/utils/supplement-nutrients.ts miniapp/src/utils/supplement-nutrients.spec.ts
git commit -m "fix: calculate supplement doses from nutrition basis"
```

---

### Task 5: Admin Web Metadata Preservation

**Files:**
- Modify: `admin-web/src/types/ingredient.ts`
- Modify: `admin-web/src/constants/ingredientNutrition.ts`
- Modify: `admin-web/src/utils/ingredientNutrition.ts`
- Modify: `admin-web/tests/ingredientNutritionUnits.test.ts`

- [ ] **Step 1: Add admin serialization tests**

Add tests to an admin-web utility test file or create `admin-web/tests/ingredientNutritionProfile.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildIngredientNutritionPayload,
  normalizeIngredientNutritionProfileToForm,
} from '../src/utils/ingredientNutrition.ts';

test('nutrition profile editing preserves source metadata and source forms', () => {
  const profile = {
    meta: {
      rawBasisType: 'PER_100_G',
      sourceType: 'USDA',
      sourceKind: 'FOOD_DATABASE',
      sourceCode: 'USDA_FDC',
      sourceVersion: 'USDA_FDC_2026_04',
      externalId: '173904',
      sourceProvider: 'USDA FoodData Central',
      sourceForms: {
        'vitamins.vitaminD': {
          sourceNutrientId: 1114,
          originalValue: 2.5,
          originalUnit: 'µg',
          canonicalValue: 100,
          canonicalUnit: 'IU',
        },
      },
      conversionNotes: {
        'vitamins.vitaminD': '1 µg vitamin D = 40 IU',
      },
    },
    macros: {},
    minerals: {},
    vitamins: { vitaminD: 100 },
    fattyAcids: {},
    aminoAcids: {},
    customItems: [],
  };

  const form = normalizeIngredientNutritionProfileToForm(profile as any);
  const payload = buildIngredientNutritionPayload(form);

  assert.equal(payload?.meta.sourceCode, 'USDA_FDC');
  assert.equal(payload?.meta.sourceForms?.['vitamins.vitaminD']?.canonicalUnit, 'IU');
});
```

- [ ] **Step 2: Run failing admin tests**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/ingredient-nutrition-governance/admin-web
node --test tests/ingredientNutritionProfile.test.ts
```

Expected: FAIL until metadata is preserved.

- [ ] **Step 3: Preserve metadata in form normalization**

Update `createEmptyIngredientNutritionFormValue()`, `normalizeIngredientNutritionProfileToForm()`, and `buildIngredientNutritionPayload()` to carry:

```ts
sourceKind
sourceCode
sourceVersion
externalId
sourceTitle
sourceProvider
confidenceLevel
sourceForms
conversionNotes
```

Keep the visual editor simple. Do not add a complex source registry UI in this task; preserve fields and show existing source type controls.

- [ ] **Step 4: Align source options**

Update `INGREDIENT_NUTRITION_SOURCE_TYPE_OPTIONS` labels so legacy `USDA` still works, but new `sourceCode` can represent `USDA_FDC`, `CFCT`, label, lab report, supplier spec, literature, and manual estimate.

- [ ] **Step 5: Run admin tests/build**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/ingredient-nutrition-governance/admin-web
node --test tests/ingredientNutritionProfile.test.ts
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/ingredient-nutrition-governance
git add admin-web/src/types/ingredient.ts admin-web/src/constants/ingredientNutrition.ts admin-web/src/utils/ingredientNutrition.ts admin-web/tests/ingredientNutritionProfile.test.ts
git commit -m "feat: preserve nutrition source metadata in admin editor"
```

---

### Task 6: Contract Audit Update

**Files:**
- Modify: `backend/src/domain/nutrition-governance/nutrition-profile-contract.ts`
- Modify: `backend/tests/domain/nutrition-governance/nutrition-profile-contract.spec.ts`
- Modify: `backend/scripts/audit-nutrition-profile-contract.ts`

- [ ] **Step 1: Write contract audit tests**

Extend `backend/tests/domain/nutrition-governance/nutrition-profile-contract.spec.ts`:

```ts
it('requires registered source metadata for source records before confirmation', () => {
  const profile = createEmptyNutritionProfile();
  profile.meta.sourceType = 'USDA';
  profile.meta.sourceCode = 'USDA_FDC';
  profile.meta.sourceKind = 'FOOD_DATABASE';
  profile.meta.sourceProvider = 'USDA FoodData Central';
  profile.meta.sourceVersion = 'USDA_FDC_2026_04';
  profile.meta.externalId = '173904';
  profile.meta.confidenceLevel = 'HIGH';
  profile.macros.energyKcal = 379;
  profile.macros.moisture = 10.84;
  profile.macros.crudeProtein = 13.15;
  profile.macros.crudeFat = 6.52;
  profile.minerals.calcium = 52;
  profile.minerals.phosphorus = 410;

  expect(
    validateNutritionProfileContract(profile, {
      requiredFieldPaths: FOOD_CONFIRMATION_REQUIRED_FIELD_PATHS,
      allowedRawBasisTypes: ['PER_100_G'],
      requireSourceMeta: true,
    }),
  ).toEqual([]);
});

it('flags activity vitamins with no conversion evidence on label-derived profiles', () => {
  const profile = createEmptyNutritionProfile();
  profile.meta.sourceKind = 'PRODUCT_LABEL';
  profile.meta.sourceCode = 'SUPPLEMENT_LABEL';
  profile.vitamins.vitaminD = 400;

  const issues = validateNutritionProfileContract(profile, {
    requireSourceMeta: false,
  });

  expect(issues).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        code: 'MISSING_CONVERSION_EVIDENCE',
        fieldPath: 'vitamins.vitaminD',
      }),
    ]),
  );
});
```

- [ ] **Step 2: Run failing tests**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/ingredient-nutrition-governance/backend
npm test -- tests/domain/nutrition-governance/nutrition-profile-contract.spec.ts --runInBand
```

Expected: FAIL because the issue code and new source metadata checks do not exist.

- [ ] **Step 3: Implement contract checks**

Add issue code:

```ts
| 'MISSING_CONVERSION_EVIDENCE'
```

Add meta keys:

```ts
'sourceKind',
'sourceCode',
'sourceVersion',
'externalId',
'sourceRecordId',
'sourceForms',
'conversionNotes',
```

When `requireSourceMeta` is true, require:

```text
meta.sourceKind
meta.sourceCode
meta.sourceProvider
meta.sourceVersion
meta.externalId
meta.confidenceLevel
```

For label-derived `vitamins.vitaminA`, `vitamins.vitaminD`, or `vitamins.vitaminE`, warn or error when no `sourceForms[fieldPath]` and no `conversionNotes[fieldPath]` exist. Use ERROR for `PRODUCT_LABEL`, WARNING for `FOOD_DATABASE`.

- [ ] **Step 4: Update audit script output**

Update `backend/scripts/audit-nutrition-profile-contract.ts` so `MISSING_CONVERSION_EVIDENCE` gets a remediation note:

```text
补充原始来源形式和单位换算说明后再确认
```

- [ ] **Step 5: Run audit and focused tests**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/ingredient-nutrition-governance/backend
npm test -- tests/domain/nutrition-governance/nutrition-profile-contract.spec.ts --runInBand
npm run audit:nutrition-profile-contract
```

Expected: tests PASS; audit completes and writes reports.

- [ ] **Step 6: Commit**

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/ingredient-nutrition-governance
git add backend/src/domain/nutrition-governance/nutrition-profile-contract.ts backend/tests/domain/nutrition-governance/nutrition-profile-contract.spec.ts backend/scripts/audit-nutrition-profile-contract.ts
git commit -m "feat: validate nutrition source conversion evidence"
```

---

### Task 7: Final Verification

**Files:**
- No new files expected.

- [ ] **Step 1: Run backend focused suites**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/ingredient-nutrition-governance/backend
npm test -- tests/domain/ingredient/nutrition-field-catalog.spec.ts tests/domain/ingredient/nutrition-source-contract.spec.ts tests/domain/ingredient/supplement-concentration-resolver.spec.ts tests/domain/ingredient/supplement-targets.spec.ts tests/domain/nutrition-governance/usda-nutrient-map.spec.ts tests/domain/nutrition-governance/nutrition-profile-contract.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 2: Run backend type/build verification**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/ingredient-nutrition-governance/backend
npm run build
```

Expected: PASS.

- [ ] **Step 3: Run admin-web verification**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/ingredient-nutrition-governance/admin-web
npm run build
```

Expected: PASS.

- [ ] **Step 4: Run miniapp focused verification**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/ingredient-nutrition-governance/miniapp
npm test -- src/utils/supplement-nutrients.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Run contract audit**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/ingredient-nutrition-governance/backend
npm run audit:nutrition-profile-contract
```

Expected: completes successfully. Any new warnings must be intentional and listed in the final summary.

- [ ] **Step 6: Confirm no candidate bulk write happened**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/ingredient-nutrition-governance
git diff --stat HEAD~6..HEAD
```

Expected: only contract, mapping, dose, UI metadata, and audit files changed. No script should have applied candidate confirmations to the database.

---

## Self-Review

- The plan covers the approved audit report’s immediate recommendations: field contract, source contract, USDA mapping cleanup, supplement basis, admin metadata preservation, and contract audit.
- The plan deliberately defers bulk USDA confirmation and standard-table redesign so each increment remains testable and reversible.
- No step asks an implementer to invent missing behavior without tests. Each task has a focused failing test, implementation target, verification command, and commit boundary.
