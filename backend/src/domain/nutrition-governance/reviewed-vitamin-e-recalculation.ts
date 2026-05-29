import {
  ensureProfileDefaults,
  isLegacyNutritionProfile,
} from '../ingredient/nutrition-profile.utils';
import type { NutritionProfileV2 } from '../ingredient/types';
import {
  buildVitaminESourceFormMetadata,
  calculateVitaminEActivityIu,
  type VitaminEActivityCalculation,
} from '../ingredient/vitamin-e-conversion';

const VITAMIN_E_FIELD_PATH = 'vitamins.vitaminE';
const USDA_ALPHA_TOCOPHEROL_ID = 1109;
const USDA_BETA_TOCOPHEROL_ID = 1125;
const USDA_GAMMA_TOCOPHEROL_ID = 1126;
const USDA_DELTA_TOCOPHEROL_ID = 1127;
const USDA_COUNTED_TOCOPHEROL_IDS = new Set([
  USDA_ALPHA_TOCOPHEROL_ID,
  USDA_BETA_TOCOPHEROL_ID,
  USDA_GAMMA_TOCOPHEROL_ID,
  USDA_DELTA_TOCOPHEROL_ID,
]);

export type ReviewedVitaminERecalculationAction =
  | 'UPDATE'
  | 'NO_CHANGE'
  | 'SKIP';

export type ReviewedVitaminERecalculationReasonCode =
  | 'COMPONENT_ACTIVITY_RECALCULATED'
  | 'ALPHA_ONLY_LOWER_BOUND'
  | 'ALREADY_CURRENT'
  | 'NOT_VERIFIED'
  | 'INVALID_PROFILE'
  | 'NO_TRACEABLE_VITAMIN_E_SOURCE';

export interface ReviewedVitaminESourceRecordInput {
  id?: string | null;
  sourceType?: string | null;
  sourceKey?: string | null;
  rawData?: unknown;
}

export interface ReviewedVitaminEFoodInput {
  id: string;
  name: string;
  displayNameZh?: string | null;
  dataSource: string;
  externalId?: string | null;
  status: string;
  nutritionData: unknown;
  sourceRecord?: ReviewedVitaminESourceRecordInput | null;
}

export interface ReviewedVitaminERecalculationDecision {
  foodId: string;
  displayName: string;
  dataSource: string;
  externalId: string | null;
  action: ReviewedVitaminERecalculationAction;
  reasonCode: ReviewedVitaminERecalculationReasonCode;
  reasonZh: string;
  currentValueIu: number | null;
  recalculatedValueIu: number | null;
  deltaIu: number | null;
  deltaPercent: number | null;
  evidence: string;
  updatedNutritionData: NutritionProfileV2 | null;
  sourceRecordId: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function finite(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function valueByPath(root: unknown, path: readonly string[]): unknown {
  let current = root;
  for (const key of path) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[key];
  }
  return current;
}

function readFoodNutrients(rawData: unknown): unknown[] {
  const direct = valueByPath(rawData, ['foodNutrients']);
  if (Array.isArray(direct)) {
    return direct;
  }
  const nested = valueByPath(rawData, ['food', 'foodNutrients']);
  return Array.isArray(nested) ? nested : [];
}

function findUsdaNutrientAmount(rawData: unknown, nutrientId: number): number | null {
  for (const item of readFoodNutrients(rawData)) {
    if (!isRecord(item)) {
      continue;
    }
    const id = finite(valueByPath(item, ['nutrient', 'id']));
    if (id === nutrientId) {
      return finite(item.amount);
    }
  }
  return null;
}

function cloneProfile(profile: NutritionProfileV2): NutritionProfileV2 {
  return JSON.parse(JSON.stringify(profile)) as NutritionProfileV2;
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function nearlyEqual(left: number | null, right: number | null): boolean {
  if (left === null || right === null) {
    return left === right;
  }
  return Math.abs(left - right) < 0.000001;
}

function deltaPercent(current: number | null, next: number | null): number | null {
  if (current === null || next === null || current === 0) {
    return null;
  }
  return round(((next - current) / current) * 100);
}

function getReasonCode(
  calculation: VitaminEActivityCalculation,
): ReviewedVitaminERecalculationReasonCode {
  return calculation.status === 'ALPHA_ONLY_LOWER_BOUND'
    ? 'ALPHA_ONLY_LOWER_BOUND'
    : 'COMPONENT_ACTIVITY_RECALCULATED';
}

function getReasonZh(
  reasonCode: ReviewedVitaminERecalculationReasonCode,
): string {
  switch (reasonCode) {
    case 'COMPONENT_ACTIVITY_RECALCULATED':
      return '已按 FEDIAF 2025 生育酚组件活性重算维生素 E。';
    case 'ALPHA_ONLY_LOWER_BOUND':
      return '来源仅提供 α-生育酚，已按 FEDIAF 2025 α-生育酚下限口径标注。';
    case 'ALREADY_CURRENT':
      return '当前数值和来源形态已经符合本次重算规则。';
    case 'NOT_VERIFIED':
      return '档案尚未验证，跳过批量重算。';
    case 'INVALID_PROFILE':
      return '营养档案结构无效，无法重算。';
    case 'NO_TRACEABLE_VITAMIN_E_SOURCE':
      return '没有可追溯的维生素 E 生育酚来源行，跳过。';
  }
}

function sourceFormAlreadyCurrent(
  profile: NutritionProfileV2,
  calculation: VitaminEActivityCalculation,
): boolean {
  const sourceForm = profile.meta.sourceForms?.[VITAMIN_E_FIELD_PATH];
  return (
    isRecord(sourceForm) &&
    sourceForm.vitaminEForm === calculation.vitaminEForm &&
    sourceForm.conversionStatus === calculation.status
  );
}

function removeCountedUsdaTocopherolCustomItems(
  profile: NutritionProfileV2,
): void {
  profile.customItems = profile.customItems.filter((item) => {
    const sourceNutrientId = finite(item.sourceNutrientId);
    return (
      sourceNutrientId === null ||
      !USDA_COUNTED_TOCOPHEROL_IDS.has(sourceNutrientId)
    );
  });
}

function applyVitaminECalculation(
  profile: NutritionProfileV2,
  calculation: VitaminEActivityCalculation,
): NutritionProfileV2 {
  const updatedProfile = cloneProfile(profile);
  updatedProfile.vitamins.vitaminE = calculation.valueIu;
  updatedProfile.meta.sourceForms ??= {};
  updatedProfile.meta.conversionNotes ??= {};
  updatedProfile.meta.sourceForms[VITAMIN_E_FIELD_PATH] = {
    sourceNutrientId:
      calculation.status === 'ALPHA_ONLY_LOWER_BOUND'
        ? USDA_ALPHA_TOCOPHEROL_ID
        : 'USDA:1109+1125+1126+1127',
    sourceNutrientName:
      calculation.status === 'ALPHA_ONLY_LOWER_BOUND'
        ? 'Vitamin E (alpha-tocopherol)'
        : 'Vitamin E tocopherol component activity',
    originalValue:
      calculation.status === 'ALPHA_ONLY_LOWER_BOUND'
        ? calculation.components.alphaTocopherolMg
        : null,
    originalUnit: 'mg',
    canonicalValue: calculation.valueIu,
    canonicalUnit: 'IU',
    basisType: updatedProfile.meta.rawBasisType,
    ...buildVitaminESourceFormMetadata(calculation),
  };
  updatedProfile.meta.conversionNotes[VITAMIN_E_FIELD_PATH] = calculation.note;
  removeCountedUsdaTocopherolCustomItems(updatedProfile);
  return updatedProfile;
}

function buildUsdaCalculation(
  sourceRecord: ReviewedVitaminESourceRecordInput | null | undefined,
): VitaminEActivityCalculation | null {
  if (sourceRecord?.sourceType !== 'USDA') {
    return null;
  }
  return calculateVitaminEActivityIu({
    alphaTocopherolMg: findUsdaNutrientAmount(
      sourceRecord.rawData,
      USDA_ALPHA_TOCOPHEROL_ID,
    ),
    betaTocopherolMg: findUsdaNutrientAmount(
      sourceRecord.rawData,
      USDA_BETA_TOCOPHEROL_ID,
    ),
    gammaTocopherolMg: findUsdaNutrientAmount(
      sourceRecord.rawData,
      USDA_GAMMA_TOCOPHEROL_ID,
    ),
    deltaTocopherolMg: findUsdaNutrientAmount(
      sourceRecord.rawData,
      USDA_DELTA_TOCOPHEROL_ID,
    ),
  });
}

function buildDecision(params: {
  food: ReviewedVitaminEFoodInput;
  action: ReviewedVitaminERecalculationAction;
  reasonCode: ReviewedVitaminERecalculationReasonCode;
  currentValueIu: number | null;
  recalculatedValueIu: number | null;
  evidence: string;
  updatedNutritionData: NutritionProfileV2 | null;
}): ReviewedVitaminERecalculationDecision {
  return {
    foodId: params.food.id,
    displayName: params.food.displayNameZh || params.food.name,
    dataSource: params.food.dataSource,
    externalId: params.food.externalId ?? null,
    action: params.action,
    reasonCode: params.reasonCode,
    reasonZh: getReasonZh(params.reasonCode),
    currentValueIu: params.currentValueIu,
    recalculatedValueIu: params.recalculatedValueIu,
    deltaIu:
      params.currentValueIu !== null && params.recalculatedValueIu !== null
        ? round(params.recalculatedValueIu - params.currentValueIu)
        : null,
    deltaPercent: deltaPercent(
      params.currentValueIu,
      params.recalculatedValueIu,
    ),
    evidence: params.evidence,
    updatedNutritionData: params.updatedNutritionData,
    sourceRecordId: params.food.sourceRecord?.id ?? null,
  };
}

export function recalculateReviewedVitaminE(
  food: ReviewedVitaminEFoodInput,
): ReviewedVitaminERecalculationDecision {
  if (food.status !== 'VERIFIED') {
    return buildDecision({
      food,
      action: 'SKIP',
      reasonCode: 'NOT_VERIFIED',
      currentValueIu: null,
      recalculatedValueIu: null,
      evidence: '',
      updatedNutritionData: null,
    });
  }

  if (!food.nutritionData || isLegacyNutritionProfile(food.nutritionData)) {
    return buildDecision({
      food,
      action: 'SKIP',
      reasonCode: 'INVALID_PROFILE',
      currentValueIu: null,
      recalculatedValueIu: null,
      evidence: '',
      updatedNutritionData: null,
    });
  }

  const profile = ensureProfileDefaults(food.nutritionData as NutritionProfileV2);
  const currentValueIu =
    typeof profile.vitamins.vitaminE === 'number' &&
    Number.isFinite(profile.vitamins.vitaminE)
      ? profile.vitamins.vitaminE
      : null;
  const calculation = buildUsdaCalculation(food.sourceRecord);
  if (!calculation) {
    return buildDecision({
      food,
      action: 'SKIP',
      reasonCode: 'NO_TRACEABLE_VITAMIN_E_SOURCE',
      currentValueIu,
      recalculatedValueIu: null,
      evidence: '',
      updatedNutritionData: null,
    });
  }

  const alreadyCurrent =
    nearlyEqual(currentValueIu, calculation.valueIu) &&
    sourceFormAlreadyCurrent(profile, calculation);
  if (alreadyCurrent) {
    return buildDecision({
      food,
      action: 'NO_CHANGE',
      reasonCode: 'ALREADY_CURRENT',
      currentValueIu,
      recalculatedValueIu: calculation.valueIu,
      evidence: calculation.note,
      updatedNutritionData: null,
    });
  }

  return buildDecision({
    food,
    action: 'UPDATE',
    reasonCode: getReasonCode(calculation),
    currentValueIu,
    recalculatedValueIu: calculation.valueIu,
    evidence: calculation.note,
    updatedNutritionData: applyVitaminECalculation(profile, calculation),
  });
}
