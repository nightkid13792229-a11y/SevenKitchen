import {
  ensureProfileDefaults,
  isLegacyNutritionProfile,
} from '../ingredient/nutrition-profile.utils';
import type { NutritionProfileV2, NutritionSourceForm } from '../ingredient/types';
import {
  buildVitaminASourceFormMetadata,
  calculateVitaminAActivityIu,
  type VitaminAActivityCalculation,
  type VitaminAForm,
} from '../ingredient/vitamin-a-conversion';

const VITAMIN_A_FIELD_PATH = 'vitamins.vitaminA';

export type ReviewedVitaminARecalculationAction =
  | 'UPDATE'
  | 'NO_CHANGE'
  | 'SKIP';

export type ReviewedVitaminARecalculationReasonCode =
  | 'COMPONENT_ACTIVITY_RECALCULATED'
  | 'SOURCE_DECLARED_IU_FALLBACK'
  | 'SOURCE_EQUIVALENT_FALLBACK'
  | 'ALREADY_CURRENT'
  | 'NOT_VERIFIED'
  | 'INVALID_PROFILE'
  | 'NO_TRACEABLE_VITAMIN_A_SOURCE';

export interface ReviewedVitaminASourceRecordInput {
  id?: string | null;
  sourceType?: string | null;
  sourceKey?: string | null;
  sourceDetail?: unknown;
  rawData?: unknown;
  normalizedNutrition?: unknown;
}

export interface ReviewedVitaminAFoodInput {
  id: string;
  name: string;
  displayNameZh?: string | null;
  dataSource: string;
  externalId?: string | null;
  status: string;
  nutritionData: unknown;
  sourceRecord?: ReviewedVitaminASourceRecordInput | null;
}

export interface ReviewedVitaminARecalculationDecision {
  foodId: string;
  displayName: string;
  dataSource: string;
  externalId: string | null;
  action: ReviewedVitaminARecalculationAction;
  reasonCode: ReviewedVitaminARecalculationReasonCode;
  reasonZh: string;
  currentValueIu: number | null;
  recalculatedValueIu: number | null;
  deltaIu: number | null;
  deltaPercent: number | null;
  evidence: string;
  updatedNutritionData: NutritionProfileV2 | null;
  sourceRecordId: string | null;
}

interface VitaminAEvidence {
  kind: 'COMPONENTS' | 'SOURCE_DECLARED_IU' | 'SOURCE_EQUIVALENT';
  sourceType: string;
  sourceNutrientId: string | number | null;
  sourceNutrientName: string;
  originalValue: number | null;
  originalUnit: string;
  retinolUg?: number | null;
  betaCaroteneUg?: number | null;
  form?: VitaminAForm;
  noteZh: string;
  extraMetadata?: Record<string, string | number | boolean | null>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function finite(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function firstFinite(...values: unknown[]): number | null {
  for (const value of values) {
    const numeric = finite(value);
    if (numeric !== null) {
      return numeric;
    }
  }
  return null;
}

function normalizeUnit(unit: unknown): string {
  return typeof unit === 'string'
    ? unit.trim().toLowerCase().replace('μ', 'µ')
    : '';
}

function isIuUnit(unit: unknown): boolean {
  const normalized = normalizeUnit(unit).replace(/\./g, '');
  return normalized === 'iu' || normalized === 'i u';
}

function isMicrogramUnit(unit: unknown): boolean {
  const normalized = normalizeUnit(unit);
  return normalized === 'µg' || normalized === 'ug' || normalized === 'mcg';
}

function valueByPath(root: unknown, path: readonly string[]): unknown {
  let current: unknown = root;
  for (const key of path) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[key];
  }
  return current;
}

function findUsdaNutrientAmount(rawData: unknown, nutrientId: number): number | null {
  const nutrients = valueByPath(rawData, ['foodNutrients']);
  if (!Array.isArray(nutrients)) {
    return null;
  }
  for (const item of nutrients) {
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

function findNzfcdComponentAmount(rawData: unknown, code: string): number | null {
  const components = valueByPath(rawData, ['components']);
  if (!Array.isArray(components)) {
    return null;
  }
  for (const component of components) {
    if (!isRecord(component) || component.component_code !== code) {
      continue;
    }
    return finite(component.num_value ?? component.amount ?? component.value);
  }
  return null;
}

function findNzfcdComponent(rawData: unknown, code: string): Record<string, unknown> | null {
  const components = valueByPath(rawData, ['components']);
  if (!Array.isArray(components)) {
    return null;
  }
  return (
    components.find(
      (component): component is Record<string, unknown> =>
        isRecord(component) && component.component_code === code,
    ) ?? null
  );
}

function unmappedFromSourceRecord(
  sourceRecord: ReviewedVitaminASourceRecordInput | null | undefined,
): Record<string, unknown> {
  const rawUnmapped = valueByPath(sourceRecord?.rawData, ['unmappedNutrients']);
  const detailUnmapped = valueByPath(sourceRecord?.sourceDetail, [
    'unmappedNutrients',
  ]);
  return {
    ...(isRecord(rawUnmapped) ? rawUnmapped : {}),
    ...(isRecord(detailUnmapped) ? detailUnmapped : {}),
  };
}

function buildComponentsEvidence(params: {
  sourceType: string;
  sourceNutrientId: string | number;
  sourceNutrientName: string;
  originalUnit: string;
  retinolUg: number | null;
  betaCaroteneUg: number | null;
  noteZh: string;
  extraMetadata?: Record<string, string | number | boolean | null>;
}): VitaminAEvidence | null {
  if (params.retinolUg === null || params.betaCaroteneUg === null) {
    return null;
  }
  return {
    kind: 'COMPONENTS',
    sourceType: params.sourceType,
    sourceNutrientId: params.sourceNutrientId,
    sourceNutrientName: params.sourceNutrientName,
    originalValue:
      params.retinolUg !== null && params.betaCaroteneUg === null
        ? params.retinolUg
        : params.betaCaroteneUg !== null && params.retinolUg === null
          ? params.betaCaroteneUg
          : null,
    originalUnit: params.originalUnit,
    retinolUg: params.retinolUg,
    betaCaroteneUg: params.betaCaroteneUg,
    noteZh: params.noteZh,
    extraMetadata: params.extraMetadata,
  };
}

function extractUsdaEvidence(
  food: ReviewedVitaminAFoodInput,
): VitaminAEvidence | null {
  const rawData = food.sourceRecord?.rawData;
  const retinolUg = findUsdaNutrientAmount(rawData, 1105);
  const betaCaroteneUg = findUsdaNutrientAmount(rawData, 1107);
  const componentEvidence = buildComponentsEvidence({
    sourceType: 'USDA',
    sourceNutrientId:
      retinolUg !== null && betaCaroteneUg !== null
        ? 'USDA:1105+1107'
        : retinolUg !== null
          ? 1105
          : 1107,
    sourceNutrientName:
      retinolUg !== null && betaCaroteneUg !== null
        ? 'Vitamin A activity from retinol and beta-carotene'
        : retinolUg !== null
          ? 'Retinol'
          : 'Carotene, beta',
    originalUnit: 'µg',
    retinolUg,
    betaCaroteneUg,
    noteZh: 'USDA Vitamin A, IU 仅在缺少视黄醇/β-胡萝卜素分项时作为 fallback。',
  });
  if (componentEvidence) {
    return componentEvidence;
  }

  const sourceDeclaredIu = findUsdaNutrientAmount(rawData, 1104);
  if (sourceDeclaredIu !== null) {
    return {
      kind: 'SOURCE_DECLARED_IU',
      sourceType: 'USDA',
      sourceNutrientId: 1104,
      sourceNutrientName: 'Vitamin A, IU',
      originalValue: sourceDeclaredIu,
      originalUnit: 'IU',
      form: 'SOURCE_DECLARED_IU',
      noteZh: 'USDA 仅提供 Vitamin A, IU；保留为来源声明 IU fallback。',
    };
  }

  return null;
}

function extractNzfcdEvidence(
  food: ReviewedVitaminAFoodInput,
): VitaminAEvidence | null {
  const rawData = food.sourceRecord?.rawData;
  const retinolUg = findNzfcdComponentAmount(rawData, 'RETOL');
  const betaCaroteneUg = findNzfcdComponentAmount(rawData, 'CARTB');
  const componentEvidence = buildComponentsEvidence({
    sourceType: 'NZFCD',
    sourceNutrientId:
      retinolUg !== null && betaCaroteneUg !== null
        ? 'NZFCD:RETOL+CARTB'
        : retinolUg !== null
          ? 'RETOL'
          : 'CARTB',
    sourceNutrientName:
      retinolUg !== null && betaCaroteneUg !== null
        ? 'Vitamin A activity from retinol and beta-carotene'
        : retinolUg !== null
          ? 'Retinol'
          : 'Beta-carotene',
    originalUnit: 'µg/100g',
    retinolUg,
    betaCaroteneUg,
    noteZh: 'NZFCD RAE/RE 仅在缺少 RETOL/CARTB 分项时作为 fallback。',
  });
  if (componentEvidence) {
    return componentEvidence;
  }

  const equivalent =
    findNzfcdComponent(rawData, 'VITA_RAE') ?? findNzfcdComponent(rawData, 'VITA');
  const equivalentAmount = finite(
    equivalent?.num_value ?? equivalent?.amount ?? equivalent?.value,
  );
  if (equivalent && equivalentAmount !== null) {
    return {
      kind: 'SOURCE_EQUIVALENT',
      sourceType: 'NZFCD',
      sourceNutrientId: `${equivalent.component_code ?? 'VITA_RAE'}`,
      sourceNutrientName: `${equivalent.component_displayname ?? 'Vitamin A equivalents'}`,
      originalValue: equivalentAmount,
      originalUnit: `${equivalent.unit_abbr ?? 'µg/100g'}`,
      form: 'SOURCE_RETINOL_ACTIVITY_EQUIVALENTS',
      noteZh: 'NZFCD 仅提供 RAE/RE，按视黄醇活性换算并标记 fallback。',
    };
  }

  return null;
}

function extractCfctEvidence(
  food: ReviewedVitaminAFoodInput,
): VitaminAEvidence | null {
  const unmapped = unmappedFromSourceRecord(food.sourceRecord);
  const retinolUg = firstFinite(
    unmapped.cfctVitaminARetinolUg,
    unmapped.cfctRetinolUg,
    unmapped.retinolUg,
  );
  const betaCaroteneUg = firstFinite(
    unmapped.cfctVitaminABetaCaroteneUg,
    unmapped.cfctCaroteneUg,
    unmapped.caroteneUg,
  );
  const componentEvidence = buildComponentsEvidence({
    sourceType: 'CFCT',
    sourceNutrientId: 'CFCT_VITAMIN_A_COMPONENTS',
    sourceNutrientName:
      retinolUg !== null && betaCaroteneUg !== null
        ? '视黄醇 / 胡萝卜素'
        : retinolUg !== null
          ? '视黄醇'
          : '胡萝卜素',
    originalUnit: 'µg/100g',
    retinolUg,
    betaCaroteneUg,
    noteZh:
      'CFCT 胡萝卜素列按 β-胡萝卜素活性处理；如后续来源拆分 α/β 胡萝卜素，应优先使用 β-胡萝卜素分项。',
    extraMetadata: {
      cfctCaroteneInterpretedAsBetaCarotene: betaCaroteneUg !== null,
    },
  });
  if (componentEvidence) {
    return componentEvidence;
  }

  const equivalentAmount = firstFinite(
    unmapped.cfctVitaminARaeUg,
    unmapped.vitaminARaeUg,
    unmapped.vitaminAReUg,
  );
  if (equivalentAmount !== null) {
    return {
      kind: 'SOURCE_EQUIVALENT',
      sourceType: 'CFCT',
      sourceNutrientId: 'CFCT_VITAMIN_A_EQUIVALENTS',
      sourceNutrientName: '维生素A / 视黄醇活性当量',
      originalValue: equivalentAmount,
      originalUnit: 'µg/100g',
      form: 'SOURCE_RETINOL_ACTIVITY_EQUIVALENTS',
      noteZh: 'CFCT 仅提供维生素 A 当量，按视黄醇活性换算并标记 fallback。',
    };
  }

  return null;
}

function extractSourceFormEvidence(profile: NutritionProfileV2): VitaminAEvidence | null {
  const sourceForm = profile.meta.sourceForms?.[VITAMIN_A_FIELD_PATH];
  if (!sourceForm) {
    return null;
  }
  const retinolUg = firstFinite(sourceForm.retinolUg);
  const betaCaroteneUg = firstFinite(sourceForm.betaCaroteneUg);
  if (retinolUg !== null || betaCaroteneUg !== null) {
    return buildComponentsEvidence({
      sourceType: `${sourceForm.sourceType ?? 'PROFILE'}`,
      sourceNutrientId: sourceForm.sourceNutrientId ?? 'PROFILE_VITAMIN_A_COMPONENTS',
      sourceNutrientName:
        sourceForm.sourceNutrientName ??
        'Vitamin A activity from stored source components',
      originalUnit: sourceForm.originalUnit ?? 'µg/100g',
      retinolUg,
      betaCaroteneUg,
      noteZh: '使用档案中已保存的维生素 A 分项来源重新计算。',
    });
  }

  const originalValue = finite(sourceForm.originalValue);
  if (originalValue !== null && isIuUnit(sourceForm.originalUnit)) {
    return {
      kind: 'SOURCE_DECLARED_IU',
      sourceType: `${sourceForm.sourceType ?? 'PROFILE'}`,
      sourceNutrientId: sourceForm.sourceNutrientId ?? null,
      sourceNutrientName: sourceForm.sourceNutrientName ?? 'Vitamin A, IU',
      originalValue,
      originalUnit: sourceForm.originalUnit ?? 'IU',
      form: 'SOURCE_DECLARED_IU',
      noteZh: '来源仅提供 IU，保留为来源声明 IU fallback。',
    };
  }

  const sourceAmount = firstFinite(sourceForm.sourceAmount, sourceForm.originalValue);
  const vitaminAForm = sourceForm.vitaminAForm;
  if (
    sourceAmount !== null &&
    (vitaminAForm === 'SOURCE_RETINOL_ACTIVITY_EQUIVALENTS' ||
      vitaminAForm === 'RAE' ||
      vitaminAForm === 'RETINOL_EQUIVALENTS' ||
      isMicrogramUnit(sourceForm.originalUnit))
  ) {
    return {
      kind: 'SOURCE_EQUIVALENT',
      sourceType: `${sourceForm.sourceType ?? 'PROFILE'}`,
      sourceNutrientId: sourceForm.sourceNutrientId ?? null,
      sourceNutrientName:
        sourceForm.sourceNutrientName ?? 'Vitamin A retinol activity equivalents',
      originalValue: sourceAmount,
      originalUnit: sourceForm.originalUnit ?? 'µg/100g',
      form: 'SOURCE_RETINOL_ACTIVITY_EQUIVALENTS',
      noteZh: '档案仅保存 RAE/RE 来源值，按视黄醇活性换算并标记 fallback。',
    };
  }

  return null;
}

function extractEvidence(
  food: ReviewedVitaminAFoodInput,
  profile: NutritionProfileV2,
): VitaminAEvidence | null {
  switch (food.dataSource) {
    case 'USDA':
      return extractUsdaEvidence(food) ?? extractSourceFormEvidence(profile);
    case 'NZFCD':
      return extractNzfcdEvidence(food) ?? extractSourceFormEvidence(profile);
    case 'CFCT':
      return extractCfctEvidence(food) ?? extractSourceFormEvidence(profile);
    default:
      return extractSourceFormEvidence(profile);
  }
}

function calculateFromEvidence(
  evidence: VitaminAEvidence,
): VitaminAActivityCalculation | null {
  if (evidence.kind === 'COMPONENTS') {
    return calculateVitaminAActivityIu({
      retinolUg: evidence.retinolUg,
      betaCaroteneUg: evidence.betaCaroteneUg,
    });
  }
  if (evidence.kind === 'SOURCE_DECLARED_IU') {
    return calculateVitaminAActivityIu({
      amount: evidence.originalValue,
      unit: evidence.originalUnit,
      form: 'SOURCE_DECLARED_IU',
    });
  }
  return calculateVitaminAActivityIu({
    amount: evidence.originalValue,
    unit: evidence.originalUnit,
    form: evidence.form ?? 'SOURCE_RETINOL_ACTIVITY_EQUIVALENTS',
  });
}

function buildSourceForm(
  profile: NutritionProfileV2,
  evidence: VitaminAEvidence,
  calculation: VitaminAActivityCalculation,
): NutritionSourceForm {
  return {
    sourceNutrientId: evidence.sourceNutrientId,
    sourceNutrientName: evidence.sourceNutrientName,
    originalValue: evidence.originalValue,
    originalUnit: evidence.originalUnit,
    canonicalValue: calculation.valueIu,
    canonicalUnit: 'IU',
    basisType: profile.meta.rawBasisType,
    ...buildVitaminASourceFormMetadata(calculation),
    ...(evidence.extraMetadata ?? {}),
  };
}

function cloneProfile(profile: NutritionProfileV2): NutritionProfileV2 {
  return JSON.parse(JSON.stringify(profile)) as NutritionProfileV2;
}

function roundedDeltaPercent(current: number | null, next: number): number | null {
  if (current === null || current === 0) {
    return null;
  }
  return Math.round(((next - current) / current) * 100 * 1_000_000) / 1_000_000;
}

function valuesClose(left: number | null, right: number | null): boolean {
  if (left === null || right === null) {
    return left === right;
  }
  return Math.abs(left - right) < 0.000001;
}

function sourceFormIsCurrent(
  sourceForm: NutritionSourceForm | undefined,
  calculation: VitaminAActivityCalculation,
): boolean {
  return (
    sourceForm?.vitaminAForm === calculation.vitaminAForm &&
    sourceForm?.conversionStatus === calculation.status &&
    sourceForm?.conversionFactorSource === 'FEDIAF_2025_TABLE_VII_14'
  );
}

function reasonForCalculation(
  evidence: VitaminAEvidence,
  changed: boolean,
): ReviewedVitaminARecalculationReasonCode {
  if (!changed) {
    return 'ALREADY_CURRENT';
  }
  if (evidence.kind === 'COMPONENTS') {
    return 'COMPONENT_ACTIVITY_RECALCULATED';
  }
  if (evidence.kind === 'SOURCE_DECLARED_IU') {
    return 'SOURCE_DECLARED_IU_FALLBACK';
  }
  return 'SOURCE_EQUIVALENT_FALLBACK';
}

function reasonZh(reasonCode: ReviewedVitaminARecalculationReasonCode): string {
  switch (reasonCode) {
    case 'COMPONENT_ACTIVITY_RECALCULATED':
      return '已根据视黄醇/β-胡萝卜素分项按 FEDIAF 2025 犬用规则重算。';
    case 'SOURCE_DECLARED_IU_FALLBACK':
      return '来源只给出维生素 A IU，数值保留并标记为来源声明 IU fallback。';
    case 'SOURCE_EQUIVALENT_FALLBACK':
      return '来源只给出 RAE/RE，按视黄醇活性换算并标记为 fallback。';
    case 'ALREADY_CURRENT':
      return '当前数值和来源形态已经符合本次重算规则。';
    case 'NOT_VERIFIED':
      return '档案尚未审核通过，本次不处理。';
    case 'INVALID_PROFILE':
      return '营养档案不是可安全处理的 NutritionProfileV2。';
    case 'NO_TRACEABLE_VITAMIN_A_SOURCE':
      return '缺少可追溯的维生素 A 来源形态或分项，未自动修改。';
  }
}

export function recalculateReviewedVitaminA(
  food: ReviewedVitaminAFoodInput,
): ReviewedVitaminARecalculationDecision {
  const displayName = food.displayNameZh || food.name;
  const baseDecision = {
    foodId: food.id,
    displayName,
    dataSource: food.dataSource,
    externalId: food.externalId ?? null,
    currentValueIu: null,
    recalculatedValueIu: null,
    deltaIu: null,
    deltaPercent: null,
    evidence: '',
    updatedNutritionData: null,
    sourceRecordId: food.sourceRecord?.id ?? null,
  };

  if (food.status !== 'VERIFIED') {
    return {
      ...baseDecision,
      action: 'SKIP',
      reasonCode: 'NOT_VERIFIED',
      reasonZh: reasonZh('NOT_VERIFIED'),
    };
  }

  if (
    !isRecord(food.nutritionData) ||
    isLegacyNutritionProfile(food.nutritionData)
  ) {
    return {
      ...baseDecision,
      action: 'SKIP',
      reasonCode: 'INVALID_PROFILE',
      reasonZh: reasonZh('INVALID_PROFILE'),
    };
  }

  const profile = ensureProfileDefaults(
    food.nutritionData as unknown as NutritionProfileV2,
  );
  const currentValueIu = finite(profile.vitamins.vitaminA);
  const evidence = extractEvidence(food, profile);
  if (!evidence) {
    return {
      ...baseDecision,
      currentValueIu,
      action: 'SKIP',
      reasonCode: 'NO_TRACEABLE_VITAMIN_A_SOURCE',
      reasonZh: reasonZh('NO_TRACEABLE_VITAMIN_A_SOURCE'),
    };
  }

  const calculation = calculateFromEvidence(evidence);
  if (!calculation) {
    return {
      ...baseDecision,
      currentValueIu,
      action: 'SKIP',
      reasonCode: 'NO_TRACEABLE_VITAMIN_A_SOURCE',
      reasonZh: reasonZh('NO_TRACEABLE_VITAMIN_A_SOURCE'),
      evidence: evidence.noteZh,
    };
  }

  const nextValue = calculation.valueIu;
  const existingSourceForm = profile.meta.sourceForms?.[VITAMIN_A_FIELD_PATH];
  const changed =
    !valuesClose(currentValueIu, nextValue) ||
    !sourceFormIsCurrent(existingSourceForm, calculation);
  const reasonCode = reasonForCalculation(evidence, changed);
  const updatedProfile = cloneProfile(profile);
  updatedProfile.vitamins.vitaminA = nextValue;
  updatedProfile.meta.sourceForms ??= {};
  updatedProfile.meta.conversionNotes ??= {};
  const sourceForm = buildSourceForm(updatedProfile, evidence, calculation);
  updatedProfile.meta.sourceForms[VITAMIN_A_FIELD_PATH] = sourceForm;
  if (updatedProfile.meta.fieldSources?.[VITAMIN_A_FIELD_PATH]) {
    updatedProfile.meta.fieldSources[VITAMIN_A_FIELD_PATH] = {
      ...updatedProfile.meta.fieldSources[VITAMIN_A_FIELD_PATH],
      ...sourceForm,
    };
  }
  updatedProfile.meta.conversionNotes[VITAMIN_A_FIELD_PATH] =
    `${calculation.note} ${evidence.noteZh}`;

  return {
    ...baseDecision,
    currentValueIu,
    recalculatedValueIu: nextValue,
    deltaIu:
      currentValueIu === null
        ? null
        : Math.round((nextValue - currentValueIu) * 1_000_000) / 1_000_000,
    deltaPercent: roundedDeltaPercent(currentValueIu, nextValue),
    evidence: evidence.noteZh,
    updatedNutritionData: changed ? updatedProfile : null,
    action: changed ? 'UPDATE' : 'NO_CHANGE',
    reasonCode,
    reasonZh: reasonZh(reasonCode),
  };
}
