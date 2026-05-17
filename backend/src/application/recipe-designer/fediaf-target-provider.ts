import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma.service';
import { findNutritionField } from '../../domain/ingredient/nutrition-field-catalog';
import type {
  AssessmentCategory,
  AssessmentExpressionBasis,
  FediafAssessmentTarget,
  FediafDogScenarioCode,
  NutrientCalculation,
} from '../../domain/recipe-designer/types';

export const FEDIAF_TARGET_PROVIDER = 'FediafTargetProvider';

export interface FediafTargetProvider {
  getTargets(
    scenario: FediafDogScenarioCode,
  ): Promise<FediafAssessmentTarget[]>;
}

const FEDIAF_2025_DOG_CODE = 'FEDIAF_2025_DOG';
const ANNEX_7_8_SOURCE_TYPE = 'ANNEX_7_8';

const TARGET_SELECTION: Record<
  FediafDogScenarioCode,
  { lifeStage: string; sourceTable: string }
> = {
  EARLY_GROWTH_REPRODUCTION: {
    lifeStage: 'EARLY_GROWTH_UNDER_14_WEEKS',
    sourceTable: 'VII-17a',
  },
  LATE_GROWTH: {
    lifeStage: 'LATE_GROWTH_FROM_14_WEEKS',
    sourceTable: 'VII-17b',
  },
  ADULT_MER_110: {
    lifeStage: 'ADULT_MER_110',
    sourceTable: 'VII-17c',
  },
  ADULT_MER_95: {
    lifeStage: 'ADULT_MER_95',
    sourceTable: 'VII-17d',
  },
};

type StandardEntryLike = {
  id: string;
  basis: string;
  unit: string;
  minValue: number | null;
  maxValue: number | null;
  nutrient: {
    code: string;
    name: string;
    category: string;
    fieldPath: string | null;
    expression: unknown;
  };
};

type ParsedExpression =
  | {
      op: 'sum';
      fieldPaths: string[];
      category: 'COMBINATION';
      calculation: 'SUM';
    }
  | {
      op: 'divide';
      fieldPaths: [string, string];
      category: 'RATIO';
      calculation: 'RATIO';
    };

@Injectable()
export class PrismaFediafTargetProvider implements FediafTargetProvider {
  constructor(private readonly prisma: PrismaService) {}

  async getTargets(
    scenario: FediafDogScenarioCode,
  ): Promise<FediafAssessmentTarget[]> {
    const selection = TARGET_SELECTION[scenario];
    if (!selection) {
      throw new BadRequestException(
        `Unsupported FEDIAF dog scenario: ${scenario}`,
      );
    }

    const entries = await this.prisma.nutritionStandardEntry.findMany({
      where: {
        version: { code: FEDIAF_2025_DOG_CODE },
        sourceType: ANNEX_7_8_SOURCE_TYPE,
        sourceTable: selection.sourceTable,
        lifeStage: selection.lifeStage,
      },
      include: { nutrient: true },
      orderBy: { sortOrder: 'asc' },
    });

    if (entries.length === 0) {
      throw new NotFoundException(
        `FEDIAF 2025 dog Annex 7.8 targets not found for ${scenario}`,
      );
    }

    return entries
      .map((entry) => this.mapEntry(entry as StandardEntryLike))
      .filter((target): target is FediafAssessmentTarget => target !== null);
  }

  private mapEntry(entry: StandardEntryLike): FediafAssessmentTarget | null {
    if (entry.minValue === null && entry.maxValue === null) {
      return null;
    }

    const expressionBasis = this.mapBasis(entry.basis);
    if (!expressionBasis) {
      return null;
    }

    const parsedExpression = this.parseExpression(entry.nutrient.expression);
    const fieldPaths = this.resolveFieldPaths(entry, parsedExpression);
    if (fieldPaths.length === 0) {
      return null;
    }

    const category = this.resolveCategory(entry.nutrient.category, parsedExpression);
    if (!category) {
      return null;
    }

    const calculation = this.resolveCalculation(parsedExpression);
    const targetUnit =
      category === 'RATIO'
        ? entry.unit
        : this.resolveTargetFieldUnit(fieldPaths, entry.unit);
    if (!targetUnit) {
      return null;
    }

    return {
      nutrientKey: entry.nutrient.code,
      label: entry.nutrient.name,
      category,
      expressionBasis,
      unit: targetUnit,
      minValue: this.convertBound(entry.minValue, entry.unit, targetUnit, category),
      maxValue: this.convertBound(entry.maxValue, entry.unit, targetUnit, category),
      fieldPaths,
      ...(calculation ? { calculation } : {}),
    };
  }

  private resolveFieldPaths(
    entry: StandardEntryLike,
    parsedExpression: ParsedExpression | null,
  ): string[] {
    if (parsedExpression) {
      return parsedExpression.fieldPaths;
    }

    return typeof entry.nutrient.fieldPath === 'string' &&
      entry.nutrient.fieldPath.trim().length > 0
      ? [entry.nutrient.fieldPath]
      : [];
  }

  private resolveCategory(
    nutrientCategory: string,
    parsedExpression: ParsedExpression | null,
  ): AssessmentCategory | null {
    if (parsedExpression) {
      return parsedExpression.category;
    }

    switch (nutrientCategory) {
      case 'MACRONUTRIENT':
        return 'MACRO';
      case 'MINERAL':
      case 'TRACE_ELEMENT':
        return 'MINERAL';
      case 'VITAMIN':
        return 'VITAMIN';
      case 'FATTY_ACID':
        return 'FATTY_ACID';
      case 'AMINO_ACID':
        return 'AMINO_ACID';
      case 'DERIVED_RATIO':
        return 'RATIO';
      default:
        return null;
    }
  }

  private resolveCalculation(
    parsedExpression: ParsedExpression | null,
  ): NutrientCalculation | undefined {
    return parsedExpression?.calculation;
  }

  private parseExpression(value: unknown): ParsedExpression | null {
    if (!isRecord(value)) {
      return null;
    }

    if (value.op === 'sum' && Array.isArray(value.fields)) {
      const fieldPaths = value.fields.filter(
        (field): field is string => typeof field === 'string',
      );
      return fieldPaths.length > 0
        ? { op: 'sum', fieldPaths, category: 'COMBINATION', calculation: 'SUM' }
        : null;
    }

    if (
      value.op === 'divide' &&
      typeof value.numerator === 'string' &&
      typeof value.denominator === 'string'
    ) {
      return {
        op: 'divide',
        fieldPaths: [value.numerator, value.denominator],
        category: 'RATIO',
        calculation: 'RATIO',
      };
    }

    return null;
  }

  private mapBasis(value: string): AssessmentExpressionBasis | null {
    return value === 'PER_1000_KCAL_ME' ||
      value === 'PER_MJ_ME' ||
      value === 'PER_100G_DRY_MATTER' ||
      value === 'RATIO'
      ? value
      : null;
  }

  private resolveTargetFieldUnit(
    fieldPaths: readonly string[],
    sourceUnit: string,
  ): string | null {
    const fieldUnits = fieldPaths.map((fieldPath) => {
      const field = findNutritionField(fieldPath);
      return field?.unit ?? null;
    });
    const firstUnit = fieldUnits[0];

    if (!firstUnit || !fieldUnits.every((unit) => unit === firstUnit)) {
      return null;
    }

    return this.canConvertMass(sourceUnit, firstUnit) ||
      normalizeUnit(sourceUnit) === normalizeUnit(firstUnit)
      ? firstUnit
      : null;
  }

  private convertBound(
    value: number | null,
    fromUnit: string,
    toUnit: string,
    category: AssessmentCategory,
  ): number | null {
    if (value === null || category === 'RATIO') {
      return value;
    }

    if (normalizeUnit(fromUnit) === normalizeUnit(toUnit)) {
      return value;
    }

    const converted = convertMassUnit(value, fromUnit, toUnit);
    return converted === null ? value : converted;
  }

  private canConvertMass(fromUnit: string, toUnit: string): boolean {
    return convertMassUnit(1, fromUnit, toUnit) !== null;
  }
}

function normalizeUnit(unit: string | null | undefined): string {
  const normalized = (unit ?? '').trim().toLowerCase();
  if (normalized === 'μg' || normalized === 'ug' || normalized === 'mcg') {
    return 'ug';
  }
  return normalized;
}

function massUnitFactor(unit: string): number | null {
  switch (normalizeUnit(unit)) {
    case 'g':
      return 1;
    case 'mg':
      return 1 / 1000;
    case 'ug':
      return 1 / 1_000_000;
    default:
      return null;
  }
}

function convertMassUnit(
  value: number,
  fromUnit: string,
  toUnit: string,
): number | null {
  const fromFactor = massUnitFactor(fromUnit);
  const toFactor = massUnitFactor(toUnit);

  if (fromFactor === null || toFactor === null) {
    return null;
  }

  return roundNutrientValue((value * fromFactor) / toFactor);
}

function roundNutrientValue(value: number): number {
  return Number(value.toPrecision(12));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}
