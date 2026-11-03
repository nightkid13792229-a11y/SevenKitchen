# Nutrition Calculation Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the pre-calculator foundation that connects reviewed FEDIAF 2025 dog standards, ingredient nutrition profiles, unit normalization, ingredient readiness, target selection, calculation contracts, and AI Agent constraints.

**Architecture:** Add a focused `nutrition-calculation` backend application slice that reuses existing FEDIAF standard data and ingredient nutrition profile utilities. Keep the current standard review page intact, expose new admin-only read APIs, and add two read-only admin views: ingredient readiness and FEDIAF target preview. Do not implement full recipe balancing or Agent generation in this plan.

**Tech Stack:** NestJS, Prisma, Jest, Vue 3, Element Plus, TypeScript, Vite.

---

## File Structure

Backend files:

- Create `backend/src/application/nutrition-calculation/nutrition-calculation.types.ts` for shared domain enums and response shapes.
- Create `backend/src/application/nutrition-calculation/nutrient-mapping-audit.service.ts` for FEDIAF nutrient mapping audits.
- Create `backend/src/application/nutrition-calculation/nutrition-unit-normalizer.service.ts` for unit and basis conversion helpers.
- Create `backend/src/application/nutrition-calculation/fediaf-target-selector.service.ts` for Annex 7.8 target selection.
- Create `backend/src/application/nutrition-calculation/ingredient-readiness.service.ts` for ingredient readiness evaluation.
- Create `backend/src/interfaces/dto/nutrition-calculation/nutrition-calculation.dto.ts` for admin query DTOs and future calculator/Agent contracts.
- Create `backend/src/interfaces/controllers/nutrition-calculation.controller.ts` for new admin read endpoints.
- Modify `backend/src/app.module.ts` to register the controller and services.
- Modify `backend/src/application/nutrition-standard/nutrient-value-resolver.ts` only if tests reveal a missing export needed by the new services.

Backend tests:

- Create `backend/tests/application/nutrition-calculation/nutrient-mapping-audit.service.spec.ts`.
- Create `backend/tests/application/nutrition-calculation/nutrition-unit-normalizer.service.spec.ts`.
- Create `backend/tests/application/nutrition-calculation/fediaf-target-selector.service.spec.ts`.
- Create `backend/tests/application/nutrition-calculation/ingredient-readiness.service.spec.ts`.
- Create `backend/tests/interfaces/controllers/nutrition-calculation.controller.spec.ts`.
- Create `backend/tests/interfaces/dto/nutrition-calculation-contracts.spec.ts`.

Admin web files:

- Create `admin-web/src/types/nutritionCalculation.ts`.
- Create `admin-web/src/api/nutritionCalculation.ts`.
- Create `admin-web/src/views/NutritionStandards/IngredientReadiness.vue`.
- Create `admin-web/src/views/NutritionStandards/FediafTargetPreview.vue`.
- Modify `admin-web/src/router/index.ts` to add routes.
- Modify `admin-web/src/layouts/MainLayout.vue` to add menu items under `营养标准`.

Docs:

- Create `docs/testing/nutrition-calculation-foundation-acceptance.md`.
- Create `docs/reports/2026-05-17-nutrition-calculation-foundation-acceptance-run.md` after verification.

---

### Task 1: Mapping Audit Service

**Files:**
- Create: `backend/src/application/nutrition-calculation/nutrition-calculation.types.ts`
- Create: `backend/src/application/nutrition-calculation/nutrient-mapping-audit.service.ts`
- Create: `backend/tests/application/nutrition-calculation/nutrient-mapping-audit.service.spec.ts`

- [ ] **Step 1: Write the failing mapping audit tests**

Create `backend/tests/application/nutrition-calculation/nutrient-mapping-audit.service.spec.ts`:

```ts
import { NutrientMappingAuditService } from '../../../src/application/nutrition-calculation/nutrient-mapping-audit.service';

describe('NutrientMappingAuditService', () => {
  const prisma = {
    nutritionStandardVersion: {
      findUnique: jest.fn(),
    },
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('audits FEDIAF nutrient mappings and reports reviewed coverage', async () => {
    prisma.nutritionStandardVersion.findUnique.mockResolvedValue({
      id: 'version-1',
      code: 'FEDIAF_2025_DOG',
      entries: [
        {
          id: 'entry-calcium',
          nutrient: {
            code: 'calcium',
            fieldPath: 'minerals.calcium',
            defaultStandardUnit: 'g',
            isDirect: true,
            isDerived: false,
            expression: null,
          },
          reviewEvents: [{ id: 'review-1', status: 'REVIEWED', reviewedAt: new Date('2026-05-17T00:00:00.000Z') }],
        },
        {
          id: 'entry-epa-dha',
          nutrient: {
            code: 'epaDha',
            fieldPath: null,
            defaultStandardUnit: 'g',
            isDirect: false,
            isDerived: true,
            expression: { op: 'sum', fields: ['fattyAcids.epa', 'fattyAcids.dha'] },
          },
          reviewEvents: [{ id: 'review-2', status: 'REVIEWED', reviewedAt: new Date('2026-05-17T00:00:00.000Z') }],
        },
      ],
    });

    const service = new NutrientMappingAuditService(prisma);
    const result = await service.auditFediaf2025DogMappings();

    expect(result.summary).toEqual({
      totalNutrients: 2,
      reviewedNutrients: 2,
      resolvedMappings: 2,
      missingMappings: 0,
      unsupportedMappings: 0,
    });
    expect(result.items).toEqual([
      expect.objectContaining({
        nutrientCode: 'calcium',
        mappingStatus: 'RESOLVED',
        mappingType: 'DIRECT',
        sourceFieldPaths: ['minerals.calcium'],
      }),
      expect.objectContaining({
        nutrientCode: 'epaDha',
        mappingStatus: 'RESOLVED',
        mappingType: 'COMBINATION',
        sourceFieldPaths: ['fattyAcids.epa', 'fattyAcids.dha'],
      }),
    ]);
  });

  it('marks unreviewed nutrients and missing field paths explicitly', async () => {
    prisma.nutritionStandardVersion.findUnique.mockResolvedValue({
      id: 'version-1',
      code: 'FEDIAF_2025_DOG',
      entries: [
        {
          id: 'entry-unknown',
          nutrient: {
            code: 'unknownNutrient',
            fieldPath: null,
            defaultStandardUnit: 'mg',
            isDirect: true,
            isDerived: false,
            expression: null,
          },
          reviewEvents: [],
        },
      ],
    });

    const service = new NutrientMappingAuditService(prisma);
    const result = await service.auditFediaf2025DogMappings();

    expect(result.summary).toEqual({
      totalNutrients: 1,
      reviewedNutrients: 0,
      resolvedMappings: 0,
      missingMappings: 1,
      unsupportedMappings: 0,
    });
    expect(result.items[0]).toMatchObject({
      nutrientCode: 'unknownNutrient',
      reviewStatus: 'UNREVIEWED',
      mappingStatus: 'MISSING_MAPPING',
      sourceFieldPaths: [],
    });
  });
});
```

- [ ] **Step 2: Run the failing mapping audit tests**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/fediaf-2025-dog-standard/backend
npm test -- --runInBand tests/application/nutrition-calculation/nutrient-mapping-audit.service.spec.ts
```

Expected: fail because `NutrientMappingAuditService` and `nutrition-calculation.types.ts` do not exist.

- [ ] **Step 3: Add shared nutrition calculation types**

Create `backend/src/application/nutrition-calculation/nutrition-calculation.types.ts` with these exports:

```ts
import type { NutritionStandardReviewStatus } from '@prisma/client';

export type MappingType = 'DIRECT' | 'COMBINATION' | 'RATIO' | 'UNSUPPORTED';

export type MappingStatus =
  | 'RESOLVED'
  | 'MISSING_MAPPING'
  | 'UNSUPPORTED_EXPRESSION';

export interface NutrientMappingAuditItem {
  nutrientCode: string;
  fieldPath: string | null;
  defaultStandardUnit: string;
  reviewStatus: NutritionStandardReviewStatus | 'UNREVIEWED';
  mappingStatus: MappingStatus;
  mappingType: MappingType;
  sourceFieldPaths: string[];
  missingReasons: string[];
}

export interface NutrientMappingAuditSummary {
  totalNutrients: number;
  reviewedNutrients: number;
  resolvedMappings: number;
  missingMappings: number;
  unsupportedMappings: number;
}

export interface NutrientMappingAuditResult {
  versionCode: 'FEDIAF_2025_DOG';
  summary: NutrientMappingAuditSummary;
  items: NutrientMappingAuditItem[];
}

export type UnitNormalizationStatus =
  | 'RESOLVED'
  | 'MISSING_INPUT'
  | 'MISSING_BASIS'
  | 'UNSUPPORTED_UNIT'
  | 'UNSUPPORTED_EXPRESSION';

export interface NormalizedNutrientValue {
  status: UnitNormalizationStatus;
  value: number | null;
  unit: string;
  basis: string;
  reasons: string[];
}

export type IngredientReadinessLevel =
  | 'READY_FULL'
  | 'READY_BASIC'
  | 'PARTIAL'
  | 'NOT_READY';

export interface IngredientReadinessItem {
  ingredientId: string;
  ingredientName: string;
  ingredientType: string;
  readinessLevel: IngredientReadinessLevel;
  coverageRatio: number;
  resolvedNutrientCount: number;
  totalRequiredNutrientCount: number;
  missingNutrients: string[];
  hasEnergy: boolean;
  hasMoisture: boolean;
  hasNutritionFoodMapping: boolean;
}

export interface IngredientReadinessSummary {
  totalIngredients: number;
  readyFull: number;
  readyBasic: number;
  partial: number;
  notReady: number;
}

export interface IngredientReadinessResult {
  summary: IngredientReadinessSummary;
  items: IngredientReadinessItem[];
  missingNutrientRanking: Array<{ nutrientCode: string; count: number }>;
}

export type FediafTargetLifeStage =
  | 'EARLY_GROWTH_UNDER_14_WEEKS'
  | 'LATE_GROWTH_FROM_14_WEEKS'
  | 'REPRODUCTION'
  | 'ADULT_MER_95'
  | 'ADULT_MER_110';

export interface FediafTargetEntry {
  nutrientCode: string;
  nutrientName: string;
  sourceTable: string;
  pdfPage: number;
  lifeStage: FediafTargetLifeStage;
  basis: string;
  unit: string;
  minValue: number | null;
  maxValue: number | null;
  recommendedValue: number | null;
  reviewStatus: NutritionStandardReviewStatus | 'UNREVIEWED';
}

export interface FediafTargetSelectionResult {
  versionCode: 'FEDIAF_2025_DOG';
  lifeStage: FediafTargetLifeStage;
  sourceType: 'ANNEX_7_8';
  entries: FediafTargetEntry[];
}
```

- [ ] **Step 4: Implement the mapping audit service**

Create `backend/src/application/nutrition-calculation/nutrient-mapping-audit.service.ts`:

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { NutritionStandardReviewStatus } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma.service';
import { findNutritionField } from '../../domain/ingredient/nutrition-field-catalog';
import type {
  MappingStatus,
  MappingType,
  NutrientMappingAuditItem,
  NutrientMappingAuditResult,
} from './nutrition-calculation.types';

const FEDIAF_2025_DOG_CODE = 'FEDIAF_2025_DOG';

type Expression = Record<string, unknown> | null;

function latestReviewStatus(reviewEvents: Array<{ id?: string; status: NutritionStandardReviewStatus; reviewedAt: Date }>) {
  const [latest] = [...reviewEvents].sort((a, b) => {
    const timeDiff = b.reviewedAt.getTime() - a.reviewedAt.getTime();
    return timeDiff !== 0 ? timeDiff : (b.id ?? '').localeCompare(a.id ?? '');
  });
  return latest?.status ?? 'UNREVIEWED';
}

function expressionFields(expression: Expression): string[] {
  if (!expression) return [];
  if (Array.isArray(expression.fields)) {
    return expression.fields.filter((field): field is string => typeof field === 'string');
  }
  return [expression.numerator, expression.denominator].filter(
    (field): field is string => typeof field === 'string',
  );
}

function mappingType(fieldPath: string | null, expression: Expression): MappingType {
  if (fieldPath) return 'DIRECT';
  if (!expression) return 'UNSUPPORTED';
  if (expression.op === 'sum') return 'COMBINATION';
  if (expression.op === 'ratio') return 'RATIO';
  return 'UNSUPPORTED';
}

@Injectable()
export class NutrientMappingAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async auditFediaf2025DogMappings(): Promise<NutrientMappingAuditResult> {
    const version = await this.prisma.nutritionStandardVersion.findUnique({
      where: { code: FEDIAF_2025_DOG_CODE },
      include: {
        entries: {
          include: {
            nutrient: true,
            reviewEvents: {
              orderBy: [{ reviewedAt: 'desc' }, { id: 'desc' }],
            },
          },
          orderBy: [{ sortOrder: 'asc' }],
        },
      },
    });

    if (!version) {
      throw new NotFoundException('FEDIAF 2025 dog standard has not been imported');
    }

    const byNutrient = new Map<string, (typeof version.entries)[number]>();
    for (const entry of version.entries) {
      if (!byNutrient.has(entry.nutrient.code)) {
        byNutrient.set(entry.nutrient.code, entry);
      }
    }

    const items = [...byNutrient.values()].map((entry): NutrientMappingAuditItem => {
      const expression = entry.nutrient.expression as Expression;
      const fields = entry.nutrient.fieldPath ? [entry.nutrient.fieldPath] : expressionFields(expression);
      const missingReasons: string[] = [];

      for (const field of fields) {
        if (!findNutritionField(field)) {
          missingReasons.push(`Unknown nutrition field path: ${field}`);
        }
      }

      const type = mappingType(entry.nutrient.fieldPath, expression);
      let status: MappingStatus = 'RESOLVED';
      if (type === 'UNSUPPORTED' && fields.length === 0) {
        status = 'MISSING_MAPPING';
      } else if (type === 'UNSUPPORTED') {
        status = 'UNSUPPORTED_EXPRESSION';
      } else if (missingReasons.length > 0) {
        status = 'MISSING_MAPPING';
      }

      return {
        nutrientCode: entry.nutrient.code,
        fieldPath: entry.nutrient.fieldPath,
        defaultStandardUnit: entry.nutrient.defaultStandardUnit,
        reviewStatus: latestReviewStatus(entry.reviewEvents),
        mappingStatus: status,
        mappingType: type,
        sourceFieldPaths: fields,
        missingReasons,
      };
    });

    return {
      versionCode: FEDIAF_2025_DOG_CODE,
      summary: {
        totalNutrients: items.length,
        reviewedNutrients: items.filter((item) => item.reviewStatus === 'REVIEWED').length,
        resolvedMappings: items.filter((item) => item.mappingStatus === 'RESOLVED').length,
        missingMappings: items.filter((item) => item.mappingStatus === 'MISSING_MAPPING').length,
        unsupportedMappings: items.filter((item) => item.mappingStatus === 'UNSUPPORTED_EXPRESSION').length,
      },
      items,
    };
  }
}
```

- [ ] **Step 5: Run mapping audit tests**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/fediaf-2025-dog-standard/backend
npm test -- --runInBand tests/application/nutrition-calculation/nutrient-mapping-audit.service.spec.ts
```

Expected: pass.

- [ ] **Step 6: Commit Task 1**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/fediaf-2025-dog-standard
git add backend/src/application/nutrition-calculation backend/tests/application/nutrition-calculation/nutrient-mapping-audit.service.spec.ts
git commit -m "feat: add nutrition mapping audit service"
```

---

### Task 2: Unit and Basis Normalizer

**Files:**
- Create: `backend/src/application/nutrition-calculation/nutrition-unit-normalizer.service.ts`
- Create: `backend/tests/application/nutrition-calculation/nutrition-unit-normalizer.service.spec.ts`

- [ ] **Step 1: Write the failing normalizer tests**

Create `backend/tests/application/nutrition-calculation/nutrition-unit-normalizer.service.spec.ts`:

```ts
import { NutritionUnitNormalizerService } from '../../../src/application/nutrition-calculation/nutrition-unit-normalizer.service';

describe('NutritionUnitNormalizerService', () => {
  const service = new NutritionUnitNormalizerService();

  it('converts mass units between g, mg, and ug', () => {
    expect(service.convertUnit(1000, 'mg', 'g')).toEqual({
      status: 'RESOLVED',
      value: 1,
      unit: 'g',
      reasons: [],
    });
    expect(service.convertUnit(250, 'ug', 'mg')).toEqual({
      status: 'RESOLVED',
      value: 0.25,
      unit: 'mg',
      reasons: [],
    });
  });

  it('converts kcal to MJ', () => {
    expect(service.convertUnit(1000, 'kcal', 'MJ')).toEqual({
      status: 'RESOLVED',
      value: 4.184,
      unit: 'MJ',
      reasons: [],
    });
  });

  it('normalizes nutrient totals to dry matter and energy bases', () => {
    expect(
      service.toBasis({
        nutrientTotal: 2,
        nutrientUnit: 'g',
        basis: 'PER_100G_DRY_MATTER',
        totalWeightG: 1000,
        dryMatterG: 400,
        totalEnergyKcal: 1200,
      }),
    ).toEqual({
      status: 'RESOLVED',
      value: 0.5,
      unit: 'g',
      basis: 'PER_100G_DRY_MATTER',
      reasons: [],
    });

    expect(
      service.toBasis({
        nutrientTotal: 2,
        nutrientUnit: 'g',
        basis: 'PER_1000_KCAL_ME',
        totalWeightG: 1000,
        dryMatterG: 400,
        totalEnergyKcal: 1200,
      }),
    ).toEqual({
      status: 'RESOLVED',
      value: 1.6666666666666667,
      unit: 'g',
      basis: 'PER_1000_KCAL_ME',
      reasons: [],
    });
  });

  it('returns MISSING_BASIS when dry matter or energy is absent', () => {
    expect(
      service.toBasis({
        nutrientTotal: 2,
        nutrientUnit: 'g',
        basis: 'PER_100G_DRY_MATTER',
        totalWeightG: 1000,
        dryMatterG: 0,
        totalEnergyKcal: 1200,
      }),
    ).toMatchObject({
      status: 'MISSING_BASIS',
      value: null,
      reasons: ['dryMatterG must be greater than 0'],
    });

    expect(
      service.toBasis({
        nutrientTotal: 2,
        nutrientUnit: 'g',
        basis: 'PER_1000_KCAL_ME',
        totalWeightG: 1000,
        dryMatterG: 400,
        totalEnergyKcal: 0,
      }),
    ).toMatchObject({
      status: 'MISSING_BASIS',
      value: null,
      reasons: ['totalEnergyKcal must be greater than 0'],
    });
  });
});
```

- [ ] **Step 2: Run the failing normalizer tests**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/fediaf-2025-dog-standard/backend
npm test -- --runInBand tests/application/nutrition-calculation/nutrition-unit-normalizer.service.spec.ts
```

Expected: fail because `NutritionUnitNormalizerService` does not exist.

- [ ] **Step 3: Implement the normalizer**

Create `backend/src/application/nutrition-calculation/nutrition-unit-normalizer.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import type { NormalizedNutrientValue, UnitNormalizationStatus } from './nutrition-calculation.types';

interface UnitConversionResult {
  status: UnitNormalizationStatus;
  value: number | null;
  unit: string;
  reasons: string[];
}

interface BasisInput {
  nutrientTotal: number;
  nutrientUnit: string;
  basis: 'PER_100G_AS_FED' | 'PER_100G_DRY_MATTER' | 'PER_1000_KCAL_ME' | 'PER_MJ_ME';
  totalWeightG: number;
  dryMatterG: number;
  totalEnergyKcal: number;
}

function normalizeUnit(unit: string): string {
  const normalized = unit.trim().toLowerCase();
  if (normalized === 'μg' || normalized === 'mcg') return 'ug';
  if (normalized === 'kilocalorie' || normalized === 'kilocalories') return 'kcal';
  return normalized;
}

function massFactorToGram(unit: string): number | null {
  switch (normalizeUnit(unit)) {
    case 'g':
      return 1;
    case 'mg':
      return 0.001;
    case 'ug':
      return 0.000001;
    default:
      return null;
  }
}

@Injectable()
export class NutritionUnitNormalizerService {
  convertUnit(value: number, fromUnit: string, toUnit: string): UnitConversionResult {
    const normalizedFrom = normalizeUnit(fromUnit);
    const normalizedTo = normalizeUnit(toUnit);
    if (normalizedFrom === normalizedTo) {
      return { status: 'RESOLVED', value, unit: toUnit, reasons: [] };
    }

    const fromMass = massFactorToGram(normalizedFrom);
    const toMass = massFactorToGram(normalizedTo);
    if (fromMass !== null && toMass !== null) {
      return {
        status: 'RESOLVED',
        value: (value * fromMass) / toMass,
        unit: toUnit,
        reasons: [],
      };
    }

    if (normalizedFrom === 'kcal' && normalizedTo === 'MJ'.toLowerCase()) {
      return { status: 'RESOLVED', value: value * 0.004184, unit: toUnit, reasons: [] };
    }

    if (normalizedFrom === 'mj' && normalizedTo === 'kcal') {
      return { status: 'RESOLVED', value: value / 0.004184, unit: toUnit, reasons: [] };
    }

    return {
      status: 'UNSUPPORTED_UNIT',
      value: null,
      unit: toUnit,
      reasons: [`Unsupported unit conversion: ${fromUnit} to ${toUnit}`],
    };
  }

  toBasis(input: BasisInput): NormalizedNutrientValue {
    if (input.basis === 'PER_100G_AS_FED') {
      if (input.totalWeightG <= 0) {
        return {
          status: 'MISSING_BASIS',
          value: null,
          unit: input.nutrientUnit,
          basis: input.basis,
          reasons: ['totalWeightG must be greater than 0'],
        };
      }
      return {
        status: 'RESOLVED',
        value: (input.nutrientTotal / input.totalWeightG) * 100,
        unit: input.nutrientUnit,
        basis: input.basis,
        reasons: [],
      };
    }

    if (input.basis === 'PER_100G_DRY_MATTER') {
      if (input.dryMatterG <= 0) {
        return {
          status: 'MISSING_BASIS',
          value: null,
          unit: input.nutrientUnit,
          basis: input.basis,
          reasons: ['dryMatterG must be greater than 0'],
        };
      }
      return {
        status: 'RESOLVED',
        value: (input.nutrientTotal / input.dryMatterG) * 100,
        unit: input.nutrientUnit,
        basis: input.basis,
        reasons: [],
      };
    }

    if (input.totalEnergyKcal <= 0) {
      return {
        status: 'MISSING_BASIS',
        value: null,
        unit: input.nutrientUnit,
        basis: input.basis,
        reasons: ['totalEnergyKcal must be greater than 0'],
      };
    }

    if (input.basis === 'PER_1000_KCAL_ME') {
      return {
        status: 'RESOLVED',
        value: (input.nutrientTotal / input.totalEnergyKcal) * 1000,
        unit: input.nutrientUnit,
        basis: input.basis,
        reasons: [],
      };
    }

    const totalEnergyMj = input.totalEnergyKcal * 0.004184;
    return {
      status: 'RESOLVED',
      value: input.nutrientTotal / totalEnergyMj,
      unit: input.nutrientUnit,
      basis: input.basis,
      reasons: [],
    };
  }
}
```

- [ ] **Step 4: Run normalizer tests**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/fediaf-2025-dog-standard/backend
npm test -- --runInBand tests/application/nutrition-calculation/nutrition-unit-normalizer.service.spec.ts
```

Expected: pass.

- [ ] **Step 5: Commit Task 2**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/fediaf-2025-dog-standard
git add backend/src/application/nutrition-calculation/nutrition-unit-normalizer.service.ts backend/tests/application/nutrition-calculation/nutrition-unit-normalizer.service.spec.ts
git commit -m "feat: add nutrition unit normalizer"
```

---

### Task 3: FEDIAF Target Selector

**Files:**
- Create: `backend/src/application/nutrition-calculation/fediaf-target-selector.service.ts`
- Create: `backend/tests/application/nutrition-calculation/fediaf-target-selector.service.spec.ts`

- [ ] **Step 1: Write failing target selector tests**

Create `backend/tests/application/nutrition-calculation/fediaf-target-selector.service.spec.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import { FediafTargetSelectorService } from '../../../src/application/nutrition-calculation/fediaf-target-selector.service';

describe('FediafTargetSelectorService', () => {
  const prisma = {
    nutritionStandardEntry: {
      findMany: jest.fn(),
    },
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('selects reviewed adult MER 110 Annex 7.8 targets', async () => {
    prisma.nutritionStandardEntry.findMany.mockResolvedValue([
      {
        nutrient: { code: 'calcium', name: '钙' },
        sourceTable: 'VII-17c',
        pdfPage: 75,
        lifeStage: 'ADULT_MER_110',
        basis: 'PER_1000_KCAL_ME',
        unit: 'g',
        minValue: 0.5,
        maxValue: 7.1,
        recommendedValue: null,
        reviewEvents: [{ id: 'review-1', status: 'REVIEWED', reviewedAt: new Date('2026-05-17T00:00:00.000Z') }],
      },
    ]);

    const service = new FediafTargetSelectorService(prisma);
    const result = await service.selectFediaf2025DogTarget({ lifeStage: 'ADULT_MER_110' });

    expect(result).toEqual({
      versionCode: 'FEDIAF_2025_DOG',
      lifeStage: 'ADULT_MER_110',
      sourceType: 'ANNEX_7_8',
      entries: [
        {
          nutrientCode: 'calcium',
          nutrientName: '钙',
          sourceTable: 'VII-17c',
          pdfPage: 75,
          lifeStage: 'ADULT_MER_110',
          basis: 'PER_1000_KCAL_ME',
          unit: 'g',
          minValue: 0.5,
          maxValue: 7.1,
          recommendedValue: null,
          reviewStatus: 'REVIEWED',
        },
      ],
    });
  });

  it('rejects ambiguous adult target selection', async () => {
    const service = new FediafTargetSelectorService(prisma);
    await expect(service.selectFediaf2025DogTarget({ lifeStage: 'ADULT' as any })).rejects.toBeInstanceOf(BadRequestException);
  });
});
```

- [ ] **Step 2: Run failing target selector tests**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/fediaf-2025-dog-standard/backend
npm test -- --runInBand tests/application/nutrition-calculation/fediaf-target-selector.service.spec.ts
```

Expected: fail because `FediafTargetSelectorService` does not exist.

- [ ] **Step 3: Implement target selector service**

Create `backend/src/application/nutrition-calculation/fediaf-target-selector.service.ts`:

```ts
import { BadRequestException, Injectable } from '@nestjs/common';
import type { NutritionStandardReviewStatus } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma.service';
import type {
  FediafTargetLifeStage,
  FediafTargetSelectionResult,
} from './nutrition-calculation.types';

const TABLE_BY_LIFE_STAGE: Record<FediafTargetLifeStage, string> = {
  EARLY_GROWTH_UNDER_14_WEEKS: 'VII-17a',
  REPRODUCTION: 'VII-17a',
  LATE_GROWTH_FROM_14_WEEKS: 'VII-17b',
  ADULT_MER_110: 'VII-17c',
  ADULT_MER_95: 'VII-17d',
};

function latestStatus(events: Array<{ id?: string; status: NutritionStandardReviewStatus; reviewedAt: Date }>) {
  const [latest] = [...events].sort((a, b) => {
    const timeDiff = b.reviewedAt.getTime() - a.reviewedAt.getTime();
    return timeDiff !== 0 ? timeDiff : (b.id ?? '').localeCompare(a.id ?? '');
  });
  return latest?.status ?? 'UNREVIEWED';
}

@Injectable()
export class FediafTargetSelectorService {
  constructor(private readonly prisma: PrismaService) {}

  async selectFediaf2025DogTarget(input: {
    lifeStage: FediafTargetLifeStage;
  }): Promise<FediafTargetSelectionResult> {
    if ((input.lifeStage as string) === 'ADULT') {
      throw new BadRequestException('Adult target requires ADULT_MER_95 or ADULT_MER_110');
    }

    const sourceTable = TABLE_BY_LIFE_STAGE[input.lifeStage];
    if (!sourceTable) {
      throw new BadRequestException(`Unsupported FEDIAF dog target life stage: ${input.lifeStage}`);
    }

    const entries = await this.prisma.nutritionStandardEntry.findMany({
      where: {
        version: { code: 'FEDIAF_2025_DOG' },
        sourceType: 'ANNEX_7_8',
        sourceTable,
        lifeStage: input.lifeStage,
      },
      include: {
        nutrient: true,
        reviewEvents: {
          orderBy: [{ reviewedAt: 'desc' }, { id: 'desc' }],
          take: 1,
        },
      },
      orderBy: [{ sortOrder: 'asc' }],
    });

    return {
      versionCode: 'FEDIAF_2025_DOG',
      lifeStage: input.lifeStage,
      sourceType: 'ANNEX_7_8',
      entries: entries.map((entry) => ({
        nutrientCode: entry.nutrient.code,
        nutrientName: entry.nutrient.name,
        sourceTable: entry.sourceTable,
        pdfPage: entry.pdfPage,
        lifeStage: entry.lifeStage as FediafTargetLifeStage,
        basis: entry.basis,
        unit: entry.unit,
        minValue: entry.minValue,
        maxValue: entry.maxValue,
        recommendedValue: entry.recommendedValue,
        reviewStatus: latestStatus(entry.reviewEvents),
      })),
    };
  }
}
```

- [ ] **Step 4: Run target selector tests**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/fediaf-2025-dog-standard/backend
npm test -- --runInBand tests/application/nutrition-calculation/fediaf-target-selector.service.spec.ts
```

Expected: pass.

- [ ] **Step 5: Commit Task 3**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/fediaf-2025-dog-standard
git add backend/src/application/nutrition-calculation/fediaf-target-selector.service.ts backend/tests/application/nutrition-calculation/fediaf-target-selector.service.spec.ts
git commit -m "feat: add fediaf target selector"
```

---

### Task 4: Ingredient Readiness Service

**Files:**
- Create: `backend/src/application/nutrition-calculation/ingredient-readiness.service.ts`
- Create: `backend/tests/application/nutrition-calculation/ingredient-readiness.service.spec.ts`

- [ ] **Step 1: Write failing ingredient readiness tests**

Create `backend/tests/application/nutrition-calculation/ingredient-readiness.service.spec.ts`:

```ts
import { IngredientReadinessService } from '../../../src/application/nutrition-calculation/ingredient-readiness.service';

describe('IngredientReadinessService', () => {
  const prisma = {
    ingredient: {
      findMany: jest.fn(),
    },
    nutritionStandardVersion: {
      findUnique: jest.fn(),
    },
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('classifies ingredients by FEDIAF nutrient coverage', async () => {
    prisma.nutritionStandardVersion.findUnique.mockResolvedValue({
      entries: [
        { nutrient: { code: 'crudeProtein', fieldPath: 'macros.crudeProtein', defaultStandardUnit: 'g', expression: null } },
        { nutrient: { code: 'calcium', fieldPath: 'minerals.calcium', defaultStandardUnit: 'g', expression: null } },
      ],
    });
    prisma.ingredient.findMany.mockResolvedValue([
      {
        id: 'ingredient-1',
        name: '鸡胸肉',
        type: 'FOOD',
        nutritionProfile: {
          meta: { rawBasisType: 'PER_100_G' },
          macros: { energyKcal: 120, moisture: 70, crudeProtein: 22 },
          minerals: { calcium: 12 },
          vitamins: {},
          fattyAcids: {},
          aminoAcids: {},
          customItems: [],
        },
        nutritionFoodMappings: [{ id: 'mapping-1' }],
      },
      {
        id: 'ingredient-2',
        name: '缺数据原料',
        type: 'FOOD',
        nutritionProfile: null,
        nutritionFoodMappings: [],
      },
    ]);

    const service = new IngredientReadinessService(prisma);
    const result = await service.listIngredientReadiness();

    expect(result.summary).toEqual({
      totalIngredients: 2,
      readyFull: 1,
      readyBasic: 0,
      partial: 0,
      notReady: 1,
    });
    expect(result.items[0]).toMatchObject({
      ingredientId: 'ingredient-1',
      ingredientName: '鸡胸肉',
      readinessLevel: 'READY_FULL',
      coverageRatio: 1,
      hasEnergy: true,
      hasMoisture: true,
      hasNutritionFoodMapping: true,
    });
    expect(result.items[1]).toMatchObject({
      ingredientId: 'ingredient-2',
      readinessLevel: 'NOT_READY',
      missingNutrients: ['crudeProtein', 'calcium'],
    });
  });
});
```

- [ ] **Step 2: Run failing ingredient readiness tests**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/fediaf-2025-dog-standard/backend
npm test -- --runInBand tests/application/nutrition-calculation/ingredient-readiness.service.spec.ts
```

Expected: fail because `IngredientReadinessService` does not exist.

- [ ] **Step 3: Implement ingredient readiness service**

Create `backend/src/application/nutrition-calculation/ingredient-readiness.service.ts`:

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma.service';
import { normalizeNutritionProfile } from '../../domain/ingredient/nutrition-profile.utils';
import { getNutritionProfileFieldValue } from '../../domain/ingredient/nutrition-field-catalog';
import type {
  IngredientReadinessItem,
  IngredientReadinessLevel,
  IngredientReadinessResult,
} from './nutrition-calculation.types';

function expressionFields(expression: Record<string, unknown> | null): string[] {
  if (!expression) return [];
  if (Array.isArray(expression.fields)) {
    return expression.fields.filter((field): field is string => typeof field === 'string');
  }
  return [expression.numerator, expression.denominator].filter(
    (field): field is string => typeof field === 'string',
  );
}

function readinessLevel(coverageRatio: number, hasEnergy: boolean, hasMoisture: boolean): IngredientReadinessLevel {
  if (coverageRatio >= 0.95 && hasEnergy && hasMoisture) return 'READY_FULL';
  if (coverageRatio >= 0.5 && hasEnergy && hasMoisture) return 'READY_BASIC';
  if (coverageRatio > 0) return 'PARTIAL';
  return 'NOT_READY';
}

@Injectable()
export class IngredientReadinessService {
  constructor(private readonly prisma: PrismaService) {}

  async listIngredientReadiness(): Promise<IngredientReadinessResult> {
    const version = await this.prisma.nutritionStandardVersion.findUnique({
      where: { code: 'FEDIAF_2025_DOG' },
      include: {
        entries: {
          include: { nutrient: true },
        },
      },
    });

    if (!version) {
      throw new NotFoundException('FEDIAF 2025 dog standard has not been imported');
    }

    const required = new Map<string, string[]>();
    for (const entry of version.entries) {
      if (required.has(entry.nutrient.code)) continue;
      const expression = entry.nutrient.expression as Record<string, unknown> | null;
      const fields = entry.nutrient.fieldPath ? [entry.nutrient.fieldPath] : expressionFields(expression);
      required.set(entry.nutrient.code, fields);
    }

    const ingredients = await this.prisma.ingredient.findMany({
      where: { type: { in: ['FOOD', 'SUPPLEMENT'] } },
      select: {
        id: true,
        name: true,
        type: true,
        nutritionProfile: true,
        nutritionFoodMappings: { select: { id: true } },
      },
      orderBy: [{ name: 'asc' }],
    });

    const items: IngredientReadinessItem[] = ingredients.map((ingredient) => {
      const profile = normalizeNutritionProfile(ingredient.nutritionProfile as any);
      const missingNutrients: string[] = [];
      let resolved = 0;

      for (const [nutrientCode, fieldPaths] of required.entries()) {
        const hasAllFields = fieldPaths.length > 0 && fieldPaths.every((fieldPath) => {
          const value = getNutritionProfileFieldValue(profile, fieldPath);
          return typeof value === 'number' && Number.isFinite(value);
        });
        if (hasAllFields) {
          resolved += 1;
        } else {
          missingNutrients.push(nutrientCode);
        }
      }

      const hasEnergy = typeof getNutritionProfileFieldValue(profile, 'macros.energyKcal') === 'number';
      const hasMoisture = typeof getNutritionProfileFieldValue(profile, 'macros.moisture') === 'number';
      const total = required.size;
      const coverageRatio = total === 0 ? 0 : resolved / total;

      return {
        ingredientId: ingredient.id,
        ingredientName: ingredient.name,
        ingredientType: ingredient.type,
        readinessLevel: readinessLevel(coverageRatio, hasEnergy, hasMoisture),
        coverageRatio,
        resolvedNutrientCount: resolved,
        totalRequiredNutrientCount: total,
        missingNutrients,
        hasEnergy,
        hasMoisture,
        hasNutritionFoodMapping: ingredient.nutritionFoodMappings.length > 0,
      };
    });

    const missingCounts = new Map<string, number>();
    for (const item of items) {
      for (const nutrient of item.missingNutrients) {
        missingCounts.set(nutrient, (missingCounts.get(nutrient) ?? 0) + 1);
      }
    }

    return {
      summary: {
        totalIngredients: items.length,
        readyFull: items.filter((item) => item.readinessLevel === 'READY_FULL').length,
        readyBasic: items.filter((item) => item.readinessLevel === 'READY_BASIC').length,
        partial: items.filter((item) => item.readinessLevel === 'PARTIAL').length,
        notReady: items.filter((item) => item.readinessLevel === 'NOT_READY').length,
      },
      items,
      missingNutrientRanking: [...missingCounts.entries()]
        .map(([nutrientCode, count]) => ({ nutrientCode, count }))
        .sort((a, b) => b.count - a.count || a.nutrientCode.localeCompare(b.nutrientCode)),
    };
  }
}
```

- [ ] **Step 4: Run ingredient readiness tests**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/fediaf-2025-dog-standard/backend
npm test -- --runInBand tests/application/nutrition-calculation/ingredient-readiness.service.spec.ts
```

Expected: pass.

- [ ] **Step 5: Commit Task 4**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/fediaf-2025-dog-standard
git add backend/src/application/nutrition-calculation/ingredient-readiness.service.ts backend/tests/application/nutrition-calculation/ingredient-readiness.service.spec.ts
git commit -m "feat: add ingredient nutrition readiness service"
```

---

### Task 5: Admin API and Contracts

**Files:**
- Create: `backend/src/interfaces/dto/nutrition-calculation/nutrition-calculation.dto.ts`
- Create: `backend/src/interfaces/controllers/nutrition-calculation.controller.ts`
- Create: `backend/tests/interfaces/controllers/nutrition-calculation.controller.spec.ts`
- Create: `backend/tests/interfaces/dto/nutrition-calculation-contracts.spec.ts`
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: Write failing controller and contract tests**

Create `backend/tests/interfaces/controllers/nutrition-calculation.controller.spec.ts`:

```ts
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { NutritionCalculationController } from '../../../src/interfaces/controllers/nutrition-calculation.controller';
import { AuthGuard } from '../../../src/interfaces/auth';
import { AdminGuard } from '../../../src/interfaces/guards/role.guard';

describe('NutritionCalculationController authorization', () => {
  it('requires authentication and admin guards', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, NutritionCalculationController);
    expect(guards).toEqual([AuthGuard, AdminGuard]);
  });
});
```

Create `backend/tests/interfaces/dto/nutrition-calculation-contracts.spec.ts`:

```ts
import { validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  FediafTargetQueryDto,
  RecipeNutritionCalculationRequestDto,
  AgentRecipeConstraintDto,
} from '../../../src/interfaces/dto/nutrition-calculation/nutrition-calculation.dto';

describe('nutrition calculation DTO contracts', () => {
  it('validates FEDIAF target query life stage', () => {
    const dto = plainToInstance(FediafTargetQueryDto, { lifeStage: 'ADULT_MER_110' });
    expect(validateSync(dto)).toHaveLength(0);
  });

  it('validates future calculator request shape', () => {
    const dto = plainToInstance(RecipeNutritionCalculationRequestDto, {
      species: 'DOG',
      standardVersionCode: 'FEDIAF_2025_DOG',
      targetProfile: { lifeStage: 'ADULT_MER_110' },
      items: [{ ingredientId: 'ingredient-1', amountG: 100, asFed: true, processingYield: 1 }],
      options: { includeIncompleteNutrients: true, basis: ['PER_100G_DRY_MATTER', 'PER_1000_KCAL_ME'] },
    });
    expect(validateSync(dto)).toHaveLength(0);
  });

  it('validates Agent constraints without allowing publish authority', () => {
    const dto = plainToInstance(AgentRecipeConstraintDto, {
      standardVersionCode: 'FEDIAF_2025_DOG',
      targetLifeStage: 'ADULT_MER_110',
      allowedIngredientIds: ['ingredient-1'],
      excludedIngredientIds: ['ingredient-2'],
      supplementStrategy: { allowedNutrientCodes: ['calcium'] },
      maxDailyCostCny: 30,
      requireHumanReview: true,
    });
    expect(validateSync(dto)).toHaveLength(0);
    expect(dto.requireHumanReview).toBe(true);
  });
});
```

- [ ] **Step 2: Run failing API tests**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/fediaf-2025-dog-standard/backend
npm test -- --runInBand tests/interfaces/controllers/nutrition-calculation.controller.spec.ts tests/interfaces/dto/nutrition-calculation-contracts.spec.ts
```

Expected: fail because DTO and controller files do not exist.

- [ ] **Step 3: Add DTOs**

Create `backend/src/interfaces/dto/nutrition-calculation/nutrition-calculation.dto.ts`:

```ts
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

const targetLifeStages = [
  'EARLY_GROWTH_UNDER_14_WEEKS',
  'LATE_GROWTH_FROM_14_WEEKS',
  'REPRODUCTION',
  'ADULT_MER_95',
  'ADULT_MER_110',
] as const;

const calculationBases = [
  'PER_100G_AS_FED',
  'PER_100G_DRY_MATTER',
  'PER_1000_KCAL_ME',
  'PER_MJ_ME',
] as const;

export class FediafTargetQueryDto {
  @IsIn(targetLifeStages)
  lifeStage!: (typeof targetLifeStages)[number];
}

class RecipeTargetProfileDto {
  @IsIn(targetLifeStages)
  lifeStage!: (typeof targetLifeStages)[number];
}

class RecipeCalculationItemDto {
  @IsString()
  ingredientId!: string;

  @IsNumber()
  @Min(0)
  amountG!: number;

  @IsBoolean()
  asFed!: boolean;

  @IsNumber()
  @Min(0)
  processingYield!: number;
}

class RecipeCalculationOptionsDto {
  @IsBoolean()
  includeIncompleteNutrients!: boolean;

  @IsArray()
  @IsIn(calculationBases, { each: true })
  basis!: Array<(typeof calculationBases)[number]>;
}

export class RecipeNutritionCalculationRequestDto {
  @IsIn(['DOG'])
  species!: 'DOG';

  @IsIn(['FEDIAF_2025_DOG'])
  standardVersionCode!: 'FEDIAF_2025_DOG';

  @ValidateNested()
  @Type(() => RecipeTargetProfileDto)
  targetProfile!: RecipeTargetProfileDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecipeCalculationItemDto)
  items!: RecipeCalculationItemDto[];

  @ValidateNested()
  @Type(() => RecipeCalculationOptionsDto)
  options!: RecipeCalculationOptionsDto;
}

class SupplementStrategyDto {
  @IsArray()
  @IsString({ each: true })
  allowedNutrientCodes!: string[];
}

export class AgentRecipeConstraintDto {
  @IsIn(['FEDIAF_2025_DOG'])
  standardVersionCode!: 'FEDIAF_2025_DOG';

  @IsIn(targetLifeStages)
  targetLifeStage!: (typeof targetLifeStages)[number];

  @IsArray()
  @IsString({ each: true })
  allowedIngredientIds!: string[];

  @IsArray()
  @IsString({ each: true })
  excludedIngredientIds!: string[];

  @ValidateNested()
  @Type(() => SupplementStrategyDto)
  supplementStrategy!: SupplementStrategyDto;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxDailyCostCny?: number;

  @IsBoolean()
  requireHumanReview!: true;
}
```

- [ ] **Step 4: Add controller**

Create `backend/src/interfaces/controllers/nutrition-calculation.controller.ts`:

```ts
import { Controller, Get, Query, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth';
import { AdminGuard } from '../guards/role.guard';
import { ApiResponseDto } from '../dto/common/response.dto';
import { NutrientMappingAuditService } from '../../application/nutrition-calculation/nutrient-mapping-audit.service';
import { IngredientReadinessService } from '../../application/nutrition-calculation/ingredient-readiness.service';
import { FediafTargetSelectorService } from '../../application/nutrition-calculation/fediaf-target-selector.service';
import { FediafTargetQueryDto } from '../dto/nutrition-calculation/nutrition-calculation.dto';

@ApiTags('Nutrition Calculation')
@ApiBearerAuth()
@ApiSecurity('wechat-auth')
@Controller('api/v1/admin/nutrition-calculation')
@UseGuards(AuthGuard, AdminGuard)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class NutritionCalculationController {
  constructor(
    private readonly mappingAuditService: NutrientMappingAuditService,
    private readonly ingredientReadinessService: IngredientReadinessService,
    private readonly targetSelectorService: FediafTargetSelectorService,
  ) {}

  @Get('fediaf-2025-dog/mapping-audit')
  @ApiOperation({ summary: 'Audit FEDIAF 2025 dog nutrient mappings' })
  async getMappingAudit(): Promise<ApiResponseDto<any>> {
    return ApiResponseDto.success(await this.mappingAuditService.auditFediaf2025DogMappings());
  }

  @Get('ingredients/readiness')
  @ApiOperation({ summary: 'List ingredient nutrition calculation readiness' })
  async listIngredientReadiness(): Promise<ApiResponseDto<any>> {
    return ApiResponseDto.success(await this.ingredientReadinessService.listIngredientReadiness());
  }

  @Get('fediaf-2025-dog/target')
  @ApiOperation({ summary: 'Preview selected FEDIAF 2025 dog target' })
  async previewFediafTarget(@Query() query: FediafTargetQueryDto): Promise<ApiResponseDto<any>> {
    return ApiResponseDto.success(
      await this.targetSelectorService.selectFediaf2025DogTarget({ lifeStage: query.lifeStage }),
    );
  }
}
```

- [ ] **Step 5: Register controller and services in AppModule**

Modify `backend/src/app.module.ts`:

```ts
import { NutritionCalculationController } from './interfaces/controllers/nutrition-calculation.controller';
import { NutrientMappingAuditService } from './application/nutrition-calculation/nutrient-mapping-audit.service';
import { IngredientReadinessService } from './application/nutrition-calculation/ingredient-readiness.service';
import { FediafTargetSelectorService } from './application/nutrition-calculation/fediaf-target-selector.service';
import { NutritionUnitNormalizerService } from './application/nutrition-calculation/nutrition-unit-normalizer.service';
```

Add `NutritionCalculationController` to the `controllers` array next to `NutritionStandardController`.

Add these providers next to `NutritionStandardService`:

```ts
NutrientMappingAuditService,
IngredientReadinessService,
FediafTargetSelectorService,
NutritionUnitNormalizerService,
```

- [ ] **Step 6: Run API tests and focused backend tests**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/fediaf-2025-dog-standard/backend
npm test -- --runInBand tests/interfaces/controllers/nutrition-calculation.controller.spec.ts tests/interfaces/dto/nutrition-calculation-contracts.spec.ts tests/application/nutrition-calculation
```

Expected: pass.

- [ ] **Step 7: Commit Task 5**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/fediaf-2025-dog-standard
git add backend/src/app.module.ts backend/src/interfaces/controllers/nutrition-calculation.controller.ts backend/src/interfaces/dto/nutrition-calculation backend/tests/interfaces/controllers/nutrition-calculation.controller.spec.ts backend/tests/interfaces/dto/nutrition-calculation-contracts.spec.ts
git commit -m "feat: expose nutrition calculation foundation APIs"
```

---

### Task 6: Admin Web API and Types

**Files:**
- Create: `admin-web/src/types/nutritionCalculation.ts`
- Create: `admin-web/src/api/nutritionCalculation.ts`

- [ ] **Step 1: Add admin web nutrition calculation types**

Create `admin-web/src/types/nutritionCalculation.ts`:

```ts
export type IngredientReadinessLevel =
  | 'READY_FULL'
  | 'READY_BASIC'
  | 'PARTIAL'
  | 'NOT_READY'

export interface IngredientReadinessSummary {
  totalIngredients: number
  readyFull: number
  readyBasic: number
  partial: number
  notReady: number
}

export interface IngredientReadinessItem {
  ingredientId: string
  ingredientName: string
  ingredientType: string
  readinessLevel: IngredientReadinessLevel
  coverageRatio: number
  resolvedNutrientCount: number
  totalRequiredNutrientCount: number
  missingNutrients: string[]
  hasEnergy: boolean
  hasMoisture: boolean
  hasNutritionFoodMapping: boolean
}

export interface IngredientReadinessResult {
  summary: IngredientReadinessSummary
  items: IngredientReadinessItem[]
  missingNutrientRanking: Array<{ nutrientCode: string; count: number }>
}

export type FediafTargetLifeStage =
  | 'EARLY_GROWTH_UNDER_14_WEEKS'
  | 'LATE_GROWTH_FROM_14_WEEKS'
  | 'REPRODUCTION'
  | 'ADULT_MER_95'
  | 'ADULT_MER_110'

export interface FediafTargetEntry {
  nutrientCode: string
  nutrientName: string
  sourceTable: string
  pdfPage: number
  lifeStage: FediafTargetLifeStage
  basis: string
  unit: string
  minValue: number | null
  maxValue: number | null
  recommendedValue: number | null
  reviewStatus: string
}

export interface FediafTargetSelectionResult {
  versionCode: 'FEDIAF_2025_DOG'
  lifeStage: FediafTargetLifeStage
  sourceType: 'ANNEX_7_8'
  entries: FediafTargetEntry[]
}

export interface NutrientMappingAuditResult {
  versionCode: 'FEDIAF_2025_DOG'
  summary: {
    totalNutrients: number
    reviewedNutrients: number
    resolvedMappings: number
    missingMappings: number
    unsupportedMappings: number
  }
  items: Array<{
    nutrientCode: string
    fieldPath: string | null
    defaultStandardUnit: string
    reviewStatus: string
    mappingStatus: string
    mappingType: string
    sourceFieldPaths: string[]
    missingReasons: string[]
  }>
}
```

- [ ] **Step 2: Add admin web API client**

Create `admin-web/src/api/nutritionCalculation.ts`:

```ts
import api from './index'
import type {
  FediafTargetLifeStage,
  FediafTargetSelectionResult,
  IngredientReadinessResult,
  NutrientMappingAuditResult
} from '@/types/nutritionCalculation'

export const nutritionCalculationApi = {
  getMappingAudit: (): Promise<NutrientMappingAuditResult> =>
    api.get('/admin/nutrition-calculation/fediaf-2025-dog/mapping-audit'),

  listIngredientReadiness: (): Promise<IngredientReadinessResult> =>
    api.get('/admin/nutrition-calculation/ingredients/readiness'),

  previewFediafTarget: (
    lifeStage: FediafTargetLifeStage
  ): Promise<FediafTargetSelectionResult> =>
    api.get('/admin/nutrition-calculation/fediaf-2025-dog/target', {
      params: { lifeStage }
    })
}
```

- [ ] **Step 3: Run admin type build**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/fediaf-2025-dog-standard/admin-web
npm run build
```

Expected: pass.

- [ ] **Step 4: Commit Task 6**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/fediaf-2025-dog-standard
git add admin-web/src/types/nutritionCalculation.ts admin-web/src/api/nutritionCalculation.ts
git commit -m "feat: add nutrition calculation admin client"
```

---

### Task 7: Ingredient Readiness Admin View

**Files:**
- Create: `admin-web/src/views/NutritionStandards/IngredientReadiness.vue`
- Modify: `admin-web/src/router/index.ts`
- Modify: `admin-web/src/layouts/MainLayout.vue`

- [ ] **Step 1: Add ingredient readiness route**

Modify `admin-web/src/router/index.ts` inside the authenticated children, directly after `FediafDogStandard`:

```ts
{
  path: "nutrition-standards/ingredient-readiness",
  name: "IngredientNutritionReadiness",
  component: () =>
    import("@/views/NutritionStandards/IngredientReadiness.vue"),
  meta: { title: "原料计算就绪度" },
},
```

- [ ] **Step 2: Add menu item**

Modify `admin-web/src/layouts/MainLayout.vue` inside the `nutrition-standards` submenu:

```vue
<el-menu-item index="/nutrition-standards/ingredient-readiness"
  >原料计算就绪度</el-menu-item
>
```

- [ ] **Step 3: Create the read-only page**

Create `admin-web/src/views/NutritionStandards/IngredientReadiness.vue`:

```vue
<template>
  <div class="ingredient-readiness-page">
    <div class="page-header">
      <div>
        <h2>原料计算就绪度</h2>
        <p>检查原料营养档案是否足够支持 FEDIAF 计算。</p>
      </div>
      <el-button :loading="loading" @click="loadData">刷新</el-button>
    </div>

    <el-row v-if="data" :gutter="12">
      <el-col :span="5">
        <el-card shadow="never"><div class="metric-label">原料总数</div><div class="metric-value">{{ data.summary.totalIngredients }}</div></el-card>
      </el-col>
      <el-col :span="5">
        <el-card shadow="never"><div class="metric-label">完整就绪</div><div class="metric-value success">{{ data.summary.readyFull }}</div></el-card>
      </el-col>
      <el-col :span="5">
        <el-card shadow="never"><div class="metric-label">基础就绪</div><div class="metric-value primary">{{ data.summary.readyBasic }}</div></el-card>
      </el-col>
      <el-col :span="5">
        <el-card shadow="never"><div class="metric-label">部分就绪</div><div class="metric-value warning">{{ data.summary.partial }}</div></el-card>
      </el-col>
      <el-col :span="4">
        <el-card shadow="never"><div class="metric-label">未就绪</div><div class="metric-value danger">{{ data.summary.notReady }}</div></el-card>
      </el-col>
    </el-row>

    <el-card v-if="data" shadow="never">
      <template #header>高频缺失营养素</template>
      <el-tag
        v-for="item in data.missingNutrientRanking.slice(0, 20)"
        :key="item.nutrientCode"
        class="missing-tag"
        type="warning"
      >
        {{ item.nutrientCode }}：{{ item.count }}
      </el-tag>
    </el-card>

    <el-card shadow="never">
      <el-table :data="filteredItems" v-loading="loading" border>
        <el-table-column prop="ingredientName" label="原料" min-width="180" />
        <el-table-column prop="ingredientType" label="类型" width="110" />
        <el-table-column label="就绪度" width="120">
          <template #default="{ row }">
            <el-tag :type="readinessTagType(row.readinessLevel)">
              {{ readinessLabel(row.readinessLevel) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="覆盖率" width="100">
          <template #default="{ row }">{{ formatPercent(row.coverageRatio) }}</template>
        </el-table-column>
        <el-table-column label="能量" width="80">
          <template #default="{ row }">{{ row.hasEnergy ? "有" : "缺" }}</template>
        </el-table-column>
        <el-table-column label="水分" width="80">
          <template #default="{ row }">{{ row.hasMoisture ? "有" : "缺" }}</template>
        </el-table-column>
        <el-table-column label="营养库映射" width="110">
          <template #default="{ row }">{{ row.hasNutritionFoodMapping ? "有" : "缺" }}</template>
        </el-table-column>
        <el-table-column label="缺失营养素" min-width="260">
          <template #default="{ row }">
            <span>{{ row.missingNutrients.slice(0, 8).join(", ") }}</span>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { nutritionCalculationApi } from "@/api/nutritionCalculation";
import type {
  IngredientReadinessItem,
  IngredientReadinessLevel,
  IngredientReadinessResult,
} from "@/types/nutritionCalculation";

const data = ref<IngredientReadinessResult | null>(null);
const loading = ref(false);

const filteredItems = computed<IngredientReadinessItem[]>(() => data.value?.items ?? []);

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function readinessLabel(level: IngredientReadinessLevel): string {
  const labels: Record<IngredientReadinessLevel, string> = {
    READY_FULL: "完整就绪",
    READY_BASIC: "基础就绪",
    PARTIAL: "部分就绪",
    NOT_READY: "未就绪",
  };
  return labels[level];
}

function readinessTagType(level: IngredientReadinessLevel) {
  if (level === "READY_FULL") return "success";
  if (level === "READY_BASIC") return "primary";
  if (level === "PARTIAL") return "warning";
  return "danger";
}

async function loadData() {
  loading.value = true;
  try {
    data.value = await nutritionCalculationApi.listIngredientReadiness();
  } finally {
    loading.value = false;
  }
}

onMounted(loadData);
</script>

<style scoped>
.ingredient-readiness-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.page-header h2 {
  margin: 0;
}
.page-header p {
  margin: 6px 0 0;
  color: #667085;
}
.metric-label {
  color: #667085;
  font-size: 13px;
}
.metric-value {
  margin-top: 6px;
  font-size: 24px;
  font-weight: 700;
}
.success {
  color: #67c23a;
}
.primary {
  color: #409eff;
}
.warning {
  color: #e6a23c;
}
.danger {
  color: #f56c6c;
}
.missing-tag {
  margin: 0 8px 8px 0;
}
</style>
```

- [ ] **Step 4: Run admin build**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/fediaf-2025-dog-standard/admin-web
npm run build
```

Expected: pass.

- [ ] **Step 5: Commit Task 7**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/fediaf-2025-dog-standard
git add admin-web/src/views/NutritionStandards/IngredientReadiness.vue admin-web/src/router/index.ts admin-web/src/layouts/MainLayout.vue
git commit -m "feat: add ingredient readiness admin view"
```

---

### Task 8: FEDIAF Target Preview Admin View

**Files:**
- Create: `admin-web/src/views/NutritionStandards/FediafTargetPreview.vue`
- Modify: `admin-web/src/router/index.ts`
- Modify: `admin-web/src/layouts/MainLayout.vue`

- [ ] **Step 1: Add target preview route**

Modify `admin-web/src/router/index.ts` inside authenticated children:

```ts
{
  path: "nutrition-standards/fediaf-target-preview",
  name: "FediafTargetPreview",
  component: () =>
    import("@/views/NutritionStandards/FediafTargetPreview.vue"),
  meta: { title: "FEDIAF 目标预览" },
},
```

- [ ] **Step 2: Add target preview menu item**

Modify `admin-web/src/layouts/MainLayout.vue` inside the `nutrition-standards` submenu:

```vue
<el-menu-item index="/nutrition-standards/fediaf-target-preview"
  >FEDIAF 目标预览</el-menu-item
>
```

- [ ] **Step 3: Create target preview page**

Create `admin-web/src/views/NutritionStandards/FediafTargetPreview.vue`:

```vue
<template>
  <div class="fediaf-target-page">
    <div class="page-header">
      <div>
        <h2>FEDIAF 目标预览</h2>
        <p>按生命阶段和 MER 口径查看实际计算目标。</p>
      </div>
      <el-button :loading="loading" @click="loadTarget">刷新</el-button>
    </div>

    <el-card shadow="never">
      <el-form :inline="true">
        <el-form-item label="目标">
          <el-select v-model="lifeStage" style="width: 260px" @change="loadTarget">
            <el-option label="成年犬 MER 110" value="ADULT_MER_110" />
            <el-option label="成年犬 MER 95" value="ADULT_MER_95" />
            <el-option label="幼犬 14 周前" value="EARLY_GROWTH_UNDER_14_WEEKS" />
            <el-option label="幼犬 14 周后" value="LATE_GROWTH_FROM_14_WEEKS" />
            <el-option label="繁殖期" value="REPRODUCTION" />
          </el-select>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card v-if="target" shadow="never">
      <el-descriptions :column="3" border>
        <el-descriptions-item label="标准版本">{{ target.versionCode }}</el-descriptions-item>
        <el-descriptions-item label="目标">{{ target.lifeStage }}</el-descriptions-item>
        <el-descriptions-item label="来源">{{ target.sourceType }}</el-descriptions-item>
      </el-descriptions>
    </el-card>

    <el-card shadow="never">
      <el-table :data="target?.entries ?? []" v-loading="loading" border>
        <el-table-column prop="sourceTable" label="来源表" width="90" />
        <el-table-column prop="pdfPage" label="页码" width="70" />
        <el-table-column prop="nutrientName" label="营养素" min-width="130" />
        <el-table-column prop="nutrientCode" label="内部代码" min-width="150" />
        <el-table-column prop="basis" label="口径" min-width="170" />
        <el-table-column prop="unit" label="单位" width="100" />
        <el-table-column label="最小值" width="100">
          <template #default="{ row }">{{ formatValue(row.minValue) }}</template>
        </el-table-column>
        <el-table-column label="最大值" width="100">
          <template #default="{ row }">{{ formatValue(row.maxValue) }}</template>
        </el-table-column>
        <el-table-column label="推荐值" width="100">
          <template #default="{ row }">{{ formatValue(row.recommendedValue) }}</template>
        </el-table-column>
        <el-table-column prop="reviewStatus" label="审核" width="100" />
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { nutritionCalculationApi } from "@/api/nutritionCalculation";
import type {
  FediafTargetLifeStage,
  FediafTargetSelectionResult,
} from "@/types/nutritionCalculation";

const lifeStage = ref<FediafTargetLifeStage>("ADULT_MER_110");
const target = ref<FediafTargetSelectionResult | null>(null);
const loading = ref(false);

function formatValue(value: number | null): string {
  return value === null || value === undefined ? "-" : String(value);
}

async function loadTarget() {
  loading.value = true;
  try {
    target.value = await nutritionCalculationApi.previewFediafTarget(lifeStage.value);
  } finally {
    loading.value = false;
  }
}

onMounted(loadTarget);
</script>

<style scoped>
.fediaf-target-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.page-header h2 {
  margin: 0;
}
.page-header p {
  margin: 6px 0 0;
  color: #667085;
}
</style>
```

- [ ] **Step 4: Run admin build**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/fediaf-2025-dog-standard/admin-web
npm run build
```

Expected: pass.

- [ ] **Step 5: Commit Task 8**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/fediaf-2025-dog-standard
git add admin-web/src/views/NutritionStandards/FediafTargetPreview.vue admin-web/src/router/index.ts admin-web/src/layouts/MainLayout.vue
git commit -m "feat: add fediaf target preview admin view"
```

---

### Task 9: Acceptance Checks and Documentation

**Files:**
- Create: `docs/testing/nutrition-calculation-foundation-acceptance.md`
- Create: `docs/reports/2026-05-17-nutrition-calculation-foundation-acceptance-run.md`

- [ ] **Step 1: Add acceptance checklist**

Create `docs/testing/nutrition-calculation-foundation-acceptance.md`:

```md
# Nutrition Calculation Foundation Acceptance

## Scope

This checklist verifies the pre-calculator foundation only. It does not verify full recipe balancing or AI recipe generation.

## Backend

- Mapping audit endpoint returns FEDIAF 2025 dog mapping summary.
- Ingredient readiness endpoint returns summary, row list, and missing nutrient ranking.
- Target preview endpoint returns Annex 7.8 entries for:
  - ADULT_MER_110
  - ADULT_MER_95
  - EARLY_GROWTH_UNDER_14_WEEKS
  - LATE_GROWTH_FROM_14_WEEKS
  - REPRODUCTION
- Future calculator DTO accepts the documented request shape.
- Agent constraint DTO requires human review.

## Admin Web

- Left menu shows:
  - FEDIAF 2025 犬标准
  - 原料计算就绪度
  - FEDIAF 目标预览
- 原料计算就绪度 page loads without console errors from nutrition calculation APIs.
- FEDIAF 目标预览 page switches all five target life stages.

## Commands

```bash
cd backend
npm test -- --runInBand tests/application/nutrition-calculation tests/interfaces/controllers/nutrition-calculation.controller.spec.ts tests/interfaces/dto/nutrition-calculation-contracts.spec.ts

cd ../admin-web
npm run build
```
```

- [ ] **Step 2: Run backend focused tests**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/fediaf-2025-dog-standard/backend
npm test -- --runInBand tests/application/nutrition-calculation tests/interfaces/controllers/nutrition-calculation.controller.spec.ts tests/interfaces/dto/nutrition-calculation-contracts.spec.ts tests/application/nutrition-standard
```

Expected: pass.

- [ ] **Step 3: Run admin build**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/fediaf-2025-dog-standard/admin-web
npm run build
```

Expected: pass.

- [ ] **Step 4: Smoke test local APIs against the reviewed FEDIAF database**

Run:

```bash
TOKEN=$(curl -sS -X POST http://localhost:3002/api/v1/auth/admin-login -H 'Content-Type: application/json' -d '{"username":"admin","password":"admin123"}' | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>process.stdout.write(JSON.parse(s).data.token))')
curl -sS -H "Authorization: Bearer $TOKEN" http://localhost:3002/api/v1/admin/nutrition-calculation/fediaf-2025-dog/mapping-audit
curl -sS -H "Authorization: Bearer $TOKEN" http://localhost:3002/api/v1/admin/nutrition-calculation/ingredients/readiness
curl -sS -H "Authorization: Bearer $TOKEN" "http://localhost:3002/api/v1/admin/nutrition-calculation/fediaf-2025-dog/target?lifeStage=ADULT_MER_110"
```

Expected: each response has `"code":0`.

- [ ] **Step 5: Record acceptance results**

Create `docs/reports/2026-05-17-nutrition-calculation-foundation-acceptance-run.md`:

```md
# Nutrition Calculation Foundation Acceptance Run

## Date

2026-05-17

## Results

- Backend focused tests: PASS
- Admin web build: PASS
- Mapping audit API smoke: PASS
- Ingredient readiness API smoke: PASS
- FEDIAF target preview API smoke: PASS

## Notes

This run verifies the pre-calculator foundation. Full recipe nutrient aggregation and AI recipe generation are outside this run.
```

- [ ] **Step 6: Commit Task 9**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/fediaf-2025-dog-standard
git add docs/testing/nutrition-calculation-foundation-acceptance.md docs/reports/2026-05-17-nutrition-calculation-foundation-acceptance-run.md
git commit -m "docs: add nutrition calculation foundation acceptance"
```

---

### Task 10: Final Verification

**Files:**
- No new files expected.

- [ ] **Step 1: Run full focused backend verification**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/fediaf-2025-dog-standard/backend
npm test -- --runInBand tests/application/nutrition-calculation tests/application/nutrition-standard tests/interfaces/controllers/nutrition-calculation.controller.spec.ts tests/interfaces/dto/nutrition-calculation-contracts.spec.ts
```

Expected: pass.

- [ ] **Step 2: Run admin web build verification**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/fediaf-2025-dog-standard/admin-web
npm run build
```

Expected: pass.

- [ ] **Step 3: Run git diff check**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/fediaf-2025-dog-standard
git diff --check
```

Expected: no output.

- [ ] **Step 4: Review final git status**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/fediaf-2025-dog-standard
git status --short
```

Expected: no unstaged or uncommitted files.

- [ ] **Step 5: Provide final implementation summary**

Final response should mention:

- Backend APIs added.
- Admin pages added.
- Tests and build commands run.
- Any known limitations, especially that full recipe nutrient aggregation and AI generation are still intentionally out of scope.

