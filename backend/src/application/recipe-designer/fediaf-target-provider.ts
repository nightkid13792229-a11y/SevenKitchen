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
const CALCIUM_PHOSPHORUS_RATIO_KEYS = new Set([
  'calciumPhosphorusRatio',
  'ca_p_ratio',
]);
const LATE_GROWTH_CA_P_RATIO_DEFAULT_MAX = 1.6;
const LATE_GROWTH_CA_P_RATIO_MAX_NOTE =
  'FEDIAF 2025 对 >=14周幼犬钙磷比给出两个上限：小/中型犬可参考 1.8:1；大型/巨型犬约6月龄前建议采用 1.6:1。当前未区分成年预期体重和月龄，默认按更保守的 1.6:1 评估。';
const SODIUM_REFERENCE_MAX_PER_1000_KCAL_ME = 3.75;
const SODIUM_REFERENCE_MAX_LABEL = '参考上限';
const SODIUM_REFERENCE_MAX_NOTE =
  'FEDIAF 2025 未设钠的正式最高限值。脚注 c 指出，健康犬钠水平至 1.5% DM（3.75g/1000kcal ME）有安全性数据支持；更高水平可能安全，但缺少科学数据。该值用于评估参考，不作为法定上限或正式营养上限。';
const CHLORIDE_REFERENCE_MAX_PER_1000_KCAL_ME = 5.87;
const CHLORIDE_REFERENCE_MAX_NOTE =
  'FEDIAF 2025 未设氯的正式最高限值。脚注 c 指出，健康犬氯水平至 2.35% DM（5.87g/1000kcal ME）有安全性数据支持；更高水平可能安全，但缺少科学数据。该值用于评估参考，不作为法定上限或正式营养上限。';
const EU_LEGAL_MAX_LABEL = '欧盟法定上限';
const VITAMIN_D_LEGAL_MAX_NOTE =
  'FEDIAF 对维生素 D 同时列出欧盟法定上限 (L) 和营养上限 (N)。欧盟法定上限为 227 IU/100g DM；按 FEDIAF 默认能量密度 400 kcal/100g DM 折算，约为 568 IU/1000kcal ME（约 136 IU/MJ ME）。表中另列营养上限 800 IU/1000kcal ME（等价于 320 IU/100g DM），但欧盟法定上限更严格，因此本页面采用 568 IU/1000kcal ME 作为默认评估上限。FEDIAF 说明，大丹幼犬研究中 435 IU/100g DM 的维生素 D 可能影响钙吸收，并刺激软骨内骨化异常；因此采用 320 IU/100g DM 作为生长期巨型犬的营养上限。';
const ADULT_PHOSPHORUS_MAX_NOTE =
  'FEDIAF 2025 成年犬磷上限带有脚注 h：高摄入无机磷化合物会影响犬的钙磷稳态。这里保留标准表中的营养上限，实际评估时仍建议结合磷来源一起判断。';
const LATE_GROWTH_CALCIUM_MIN_NOTE =
  'FEDIAF 2025 对 >=14周龄幼犬的钙下限按成年预期体重区分：成年预期体重 <=15kg 的幼犬为 2.00g/1000kcal ME；成年预期体重 >15kg 的幼犬，在约 6 月龄前为 2.50g/1000kcal ME。当前未设置成年预期体重，默认按 2.50g/1000kcal ME 保守评估；若确认成年预期体重 <=15kg，可人工参考 2.00g/1000kcal ME。';
const REPRODUCTION_PUPPY_ONLY_MAX_KEYS = new Set([
  'lysine',
  'linoleicAcid',
  'calcium',
]);

const TARGET_SELECTION: Record<
  FediafDogScenarioCode,
  { lifeStage: string; sourceTable: string }
> = {
  EARLY_GROWTH_REPRODUCTION: {
    lifeStage: 'EARLY_GROWTH_UNDER_14_WEEKS',
    sourceTable: 'VII-17a',
  },
  REPRODUCTION: {
    lifeStage: 'REPRODUCTION',
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
  recommendedValue?: number | null;
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
      .map((entry) => this.mapEntry(entry as StandardEntryLike, scenario))
      .filter((target): target is FediafAssessmentTarget => target !== null);
  }

  private mapEntry(
    entry: StandardEntryLike,
    scenario: FediafDogScenarioCode,
  ): FediafAssessmentTarget | null {
    const expressionBasis = this.mapBasis(entry.basis);
    if (!expressionBasis) {
      return null;
    }

    const parsedExpression = this.parseExpression(entry.nutrient.expression);
    const fieldPaths = this.resolveFieldPaths(entry, parsedExpression);
    if (fieldPaths.length === 0) {
      return null;
    }

    const category = this.resolveCategory(
      entry.nutrient.category,
      parsedExpression,
    );
    if (!category) {
      return null;
    }

    const calculation = this.resolveCalculation(parsedExpression);
    if (
      category !== 'RATIO' &&
      !this.canAssessFieldsInStandardUnit(fieldPaths, entry.unit)
    ) {
      return null;
    }
    const targetUnit = entry.unit;
    const minValue = this.resolveMinValue(entry, scenario, category, targetUnit);
    const maxValue = this.resolveMaxValue(entry, scenario, category, targetUnit);
    const minValueNote = this.resolveMinValueNote(entry, scenario);
    const maxValueNote = this.resolveMaxValueNote(entry, scenario);
    const maxValueLabel = this.resolveMaxValueLabel(entry, scenario);
    const excludeFromAttention = minValue === null && maxValue === null;

    return {
      nutrientKey: entry.nutrient.code,
      label: entry.nutrient.name,
      category,
      expressionBasis,
      unit: targetUnit,
      minValue,
      maxValue,
      ...(minValueNote ? { minValueNote } : {}),
      ...(maxValueNote ? { maxValueNote } : {}),
      ...(maxValueLabel ? { maxValueLabel } : {}),
      ...(excludeFromAttention ? { excludeFromAttention: true } : {}),
      fieldPaths,
      ...(calculation ? { calculation } : {}),
    };
  }

  private resolveMinValue(
    entry: StandardEntryLike,
    scenario: FediafDogScenarioCode,
    category: AssessmentCategory,
    targetUnit: string,
  ): number | null {
    if (
      this.isLateGrowthCalcium(entry, scenario) &&
      entry.recommendedValue !== null &&
      entry.recommendedValue !== undefined
    ) {
      return this.convertBound(
        entry.recommendedValue,
        entry.unit,
        targetUnit,
        category,
      );
    }

    return this.convertBound(entry.minValue, entry.unit, targetUnit, category);
  }

  private resolveMinValueNote(
    entry: StandardEntryLike,
    scenario: FediafDogScenarioCode,
  ): string | null {
    return this.isLateGrowthCalcium(entry, scenario)
      ? LATE_GROWTH_CALCIUM_MIN_NOTE
      : null;
  }

  private resolveMaxValue(
    entry: StandardEntryLike,
    scenario: FediafDogScenarioCode,
    category: AssessmentCategory,
    targetUnit: string,
  ): number | null {
    if (this.isLateGrowthCalciumPhosphorusRatio(entry, scenario)) {
      return LATE_GROWTH_CA_P_RATIO_DEFAULT_MAX;
    }

    if (this.isReproductionPuppyOnlyMaximum(entry, scenario)) {
      return null;
    }

    const referenceMax = this.resolveFootnoteCReferenceMax(entry);
    if (referenceMax !== null) {
      return referenceMax;
    }

    return this.convertBound(entry.maxValue, entry.unit, targetUnit, category);
  }

  private resolveMaxValueNote(
    entry: StandardEntryLike,
    scenario: FediafDogScenarioCode,
  ): string | null {
    if (this.isLateGrowthCalciumPhosphorusRatio(entry, scenario)) {
      return LATE_GROWTH_CA_P_RATIO_MAX_NOTE;
    }

    if (this.isReproductionPuppyOnlyMaximum(entry, scenario)) {
      return null;
    }

    if (this.isVitaminDPerEnergyLegalMax(entry)) {
      return VITAMIN_D_LEGAL_MAX_NOTE;
    }

    if (this.isAdultPhosphorusPerEnergyMaximum(entry, scenario)) {
      return ADULT_PHOSPHORUS_MAX_NOTE;
    }

    const referenceNote = this.resolveFootnoteCReferenceMaxNote(entry);
    if (referenceNote !== null) {
      return referenceNote;
    }

    return null;
  }

  private resolveMaxValueLabel(
    entry: StandardEntryLike,
    scenario: FediafDogScenarioCode,
  ): string | null {
    if (this.isLateGrowthCalciumPhosphorusRatio(entry, scenario)) {
      return null;
    }

    if (this.isReproductionPuppyOnlyMaximum(entry, scenario)) {
      return null;
    }

    if (this.isVitaminDPerEnergyLegalMax(entry)) {
      return EU_LEGAL_MAX_LABEL;
    }

    return this.resolveFootnoteCReferenceMax(entry) !== null
      ? SODIUM_REFERENCE_MAX_LABEL
      : null;
  }

  private isLateGrowthCalciumPhosphorusRatio(
    entry: StandardEntryLike,
    scenario: FediafDogScenarioCode,
  ): boolean {
    return (
      scenario === 'LATE_GROWTH' &&
      CALCIUM_PHOSPHORUS_RATIO_KEYS.has(entry.nutrient.code)
    );
  }

  private isVitaminDPerEnergyLegalMax(entry: StandardEntryLike): boolean {
    return (
      (entry.basis === 'PER_1000_KCAL_ME' || entry.basis === 'PER_MJ_ME') &&
      entry.nutrient.code === 'vitaminD'
    );
  }

  private isAdultPhosphorusPerEnergyMaximum(
    entry: StandardEntryLike,
    scenario: FediafDogScenarioCode,
  ): boolean {
    return (
      (scenario === 'ADULT_MER_95' || scenario === 'ADULT_MER_110') &&
      entry.basis === 'PER_1000_KCAL_ME' &&
      entry.maxValue !== null &&
      entry.nutrient.code === 'phosphorus'
    );
  }

  private isLateGrowthCalcium(
    entry: StandardEntryLike,
    scenario: FediafDogScenarioCode,
  ): boolean {
    return (
      scenario === 'LATE_GROWTH' &&
      (entry.basis === 'PER_1000_KCAL_ME' ||
        entry.basis === 'PER_MJ_ME' ||
        entry.basis === 'PER_100G_DRY_MATTER') &&
      entry.nutrient.code === 'calcium'
    );
  }

  private isReproductionPuppyOnlyMaximum(
    entry: StandardEntryLike,
    scenario: FediafDogScenarioCode,
  ): boolean {
    return (
      scenario === 'REPRODUCTION' &&
      entry.maxValue !== null &&
      REPRODUCTION_PUPPY_ONLY_MAX_KEYS.has(entry.nutrient.code)
    );
  }

  private resolveFootnoteCReferenceMax(
    entry: StandardEntryLike,
  ): number | null {
    if (entry.basis !== 'PER_1000_KCAL_ME' || entry.maxValue !== null) {
      return null;
    }

    switch (entry.nutrient.code) {
      case 'sodium':
        return SODIUM_REFERENCE_MAX_PER_1000_KCAL_ME;
      case 'chloride':
        return CHLORIDE_REFERENCE_MAX_PER_1000_KCAL_ME;
      default:
        return null;
    }
  }

  private resolveFootnoteCReferenceMaxNote(
    entry: StandardEntryLike,
  ): string | null {
    if (this.resolveFootnoteCReferenceMax(entry) === null) {
      return null;
    }

    switch (entry.nutrient.code) {
      case 'sodium':
        return SODIUM_REFERENCE_MAX_NOTE;
      case 'chloride':
        return CHLORIDE_REFERENCE_MAX_NOTE;
      default:
        return null;
    }
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

  private canAssessFieldsInStandardUnit(
    fieldPaths: readonly string[],
    standardUnit: string,
  ): boolean {
    const fieldUnits = fieldPaths.map((fieldPath) => {
      const field = findNutritionField(fieldPath);
      return field?.unit ?? null;
    });
    const firstUnit = fieldUnits[0];

    if (!firstUnit || !fieldUnits.every((unit) => unit === firstUnit)) {
      return false;
    }

    return (
      this.canConvertMass(firstUnit, standardUnit) ||
      normalizeUnit(firstUnit) === normalizeUnit(standardUnit)
    );
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
