import type {
  NutritionFieldSource,
  NutritionProfileV2,
} from '../ingredient/types';

export type SupplementalSourceCompatibility =
  | 'SAME_SPECIES'
  | 'APPROXIMATE_SPECIES'
  | 'PRODUCT_OR_EXTRACT'
  | 'REFERENCE_ONLY';

export type GreenLippedMusselSupplementAction =
  | 'REVIEW_DIRECT_SOURCE'
  | 'REVIEW_APPROXIMATE_SOURCE'
  | 'REFERENCE_ONLY'
  | 'NO_TRUSTED_SOURCE_FOUND';

export interface GreenLippedMusselProfileSnapshot {
  profileId: string;
  role: 'PRIMARY' | 'SECONDARY';
  stateLabel: string;
  foodName: string;
  values: Record<string, number | null | undefined>;
}

export interface SupplementalSourceSnapshot {
  sourceKey: string;
  sourceType: string;
  foodName: string;
  scientificName?: string | null;
  stateLabel: string;
  compatibility: SupplementalSourceCompatibility;
  values: Record<string, number | null | undefined>;
  fieldSources?: Record<string, Partial<NutritionFieldSource>>;
  sourceNote?: string | null;
}

export interface GreenLippedMusselSupplementPlanRow {
  profileId: string;
  role: GreenLippedMusselProfileSnapshot['role'];
  stateLabel: string;
  foodName: string;
  fieldPath: string;
  label: string;
  unit: string;
  recommendedAction: GreenLippedMusselSupplementAction;
  bestSourceKey: string | null;
  bestSourceType: string | null;
  bestSourceFoodName: string | null;
  bestSourceScientificName: string | null;
  bestSourceValue: number | null;
  compatibility: SupplementalSourceCompatibility | null;
  sourceForm: Partial<NutritionFieldSource> | null;
  reason: string;
}

export interface GreenLippedMusselSupplementPlan {
  rows: GreenLippedMusselSupplementPlanRow[];
  summary: {
    missingFieldCount: number;
    directCandidateCount: number;
    approximateCandidateCount: number;
    referenceOnlyCount: number;
    unresolvedCount: number;
  };
}

export interface ApplyGreenLippedMusselSupplementResult {
  profile: NutritionProfileV2;
  appliedRows: GreenLippedMusselSupplementPlanRow[];
}

export const GREEN_LIPPED_MUSSEL_SUPPLEMENT_TARGET_FIELDS = [
  { fieldPath: 'minerals.chloride', label: '氯', unit: 'mg' },
  { fieldPath: 'vitamins.vitaminB1', label: '维生素 B1', unit: 'mg' },
  { fieldPath: 'vitamins.vitaminB5', label: '维生素 B5', unit: 'mg' },
  { fieldPath: 'vitamins.vitaminB7', label: '维生素 B7', unit: 'μg' },
  { fieldPath: 'vitamins.choline', label: '胆碱', unit: 'mg' },
  { fieldPath: 'aminoAcids.arginine', label: '精氨酸', unit: 'g' },
  { fieldPath: 'aminoAcids.lysine', label: '赖氨酸', unit: 'g' },
  { fieldPath: 'aminoAcids.methionine', label: '蛋氨酸', unit: 'g' },
  { fieldPath: 'aminoAcids.cystine', label: '胱氨酸', unit: 'g' },
  { fieldPath: 'aminoAcids.taurine', label: '牛磺酸', unit: 'g' },
  { fieldPath: 'aminoAcids.tryptophan', label: '色氨酸', unit: 'g' },
  { fieldPath: 'aminoAcids.threonine', label: '苏氨酸', unit: 'g' },
  { fieldPath: 'aminoAcids.leucine', label: '亮氨酸', unit: 'g' },
  { fieldPath: 'aminoAcids.isoleucine', label: '异亮氨酸', unit: 'g' },
  { fieldPath: 'aminoAcids.valine', label: '缬氨酸', unit: 'g' },
  { fieldPath: 'aminoAcids.phenylalanine', label: '苯丙氨酸', unit: 'g' },
  { fieldPath: 'aminoAcids.tyrosine', label: '酪氨酸', unit: 'g' },
  { fieldPath: 'aminoAcids.histidine', label: '组氨酸', unit: 'g' },
  { fieldPath: 'aminoAcids.glutamicAcid', label: '谷氨酸', unit: 'g' },
  { fieldPath: 'aminoAcids.glycine', label: '甘氨酸', unit: 'g' },
  { fieldPath: 'aminoAcids.proline', label: '脯氨酸', unit: 'g' },
] as const;

const compatibilityRank: Record<SupplementalSourceCompatibility, number> = {
  SAME_SPECIES: 1,
  APPROXIMATE_SPECIES: 2,
  PRODUCT_OR_EXTRACT: 3,
  REFERENCE_ONLY: 4,
};

export function buildGreenLippedMusselSupplementPlan(params: {
  profiles: GreenLippedMusselProfileSnapshot[];
  supplementalSources: SupplementalSourceSnapshot[];
}): GreenLippedMusselSupplementPlan {
  const rows: GreenLippedMusselSupplementPlanRow[] = [];

  for (const profile of params.profiles) {
    const stateSources = params.supplementalSources.filter(
      (source) => source.stateLabel === profile.stateLabel,
    );

    for (const field of GREEN_LIPPED_MUSSEL_SUPPLEMENT_TARGET_FIELDS) {
      if (hasFiniteValue(profile.values[field.fieldPath])) {
        continue;
      }

      const bestSource = stateSources
        .filter((source) => hasFiniteValue(source.values[field.fieldPath]))
        .sort(
          (left, right) =>
            compatibilityRank[left.compatibility] -
            compatibilityRank[right.compatibility],
        )[0];

      rows.push(
        buildPlanRow({
          profile,
          field,
          bestSource,
        }),
      );
    }
  }

  return {
    rows,
    summary: {
      missingFieldCount: rows.length,
      directCandidateCount: rows.filter(
        (row) => row.recommendedAction === 'REVIEW_DIRECT_SOURCE',
      ).length,
      approximateCandidateCount: rows.filter(
        (row) => row.recommendedAction === 'REVIEW_APPROXIMATE_SOURCE',
      ).length,
      referenceOnlyCount: rows.filter(
        (row) => row.recommendedAction === 'REFERENCE_ONLY',
      ).length,
      unresolvedCount: rows.filter(
        (row) => row.recommendedAction === 'NO_TRUSTED_SOURCE_FOUND',
      ).length,
    },
  };
}

export function applyAcceptedGreenLippedMusselSupplements(params: {
  profile: NutritionProfileV2;
  rows: GreenLippedMusselSupplementPlanRow[];
  acceptedActions: GreenLippedMusselSupplementAction[];
  refreshExistingFieldSources?: boolean;
}): ApplyGreenLippedMusselSupplementResult {
  const profile = cloneProfile(params.profile);
  profile.meta.fieldSources = { ...(profile.meta.fieldSources ?? {}) };
  const acceptedActions = new Set(params.acceptedActions);
  const appliedRows: GreenLippedMusselSupplementPlanRow[] = [];

  for (const row of params.rows) {
    if (!acceptedActions.has(row.recommendedAction)) continue;
    const bestSourceValue = row.bestSourceValue;
    if (!hasFiniteValue(bestSourceValue)) continue;
    const existingValue = readProfileField(profile, row.fieldPath);
    if (hasFiniteValue(existingValue)) {
      if (
        params.refreshExistingFieldSources &&
        Math.abs(existingValue - bestSourceValue) < 1e-9 &&
        profile.meta.fieldSources[row.fieldPath]?.sourceRole ===
          'FIELD_SUPPLEMENT'
      ) {
        profile.meta.fieldSources[row.fieldPath] = buildFieldSource(row);
        appliedRows.push(row);
      }
      continue;
    }

    writeProfileField(profile, row.fieldPath, bestSourceValue);
    profile.meta.fieldSources[row.fieldPath] = buildFieldSource(row);
    appliedRows.push(row);
  }

  if (appliedRows.length > 0) {
    profile.meta.versionNote = buildVersionNote(
      profile.meta.versionNote,
      appliedRows,
    );
  }

  return { profile, appliedRows };
}

function buildPlanRow(params: {
  profile: GreenLippedMusselProfileSnapshot;
  field: (typeof GREEN_LIPPED_MUSSEL_SUPPLEMENT_TARGET_FIELDS)[number];
  bestSource?: SupplementalSourceSnapshot;
}): GreenLippedMusselSupplementPlanRow {
  const { profile, field, bestSource } = params;
  const recommendedAction = bestSource
    ? actionForCompatibility(bestSource.compatibility)
    : 'NO_TRUSTED_SOURCE_FOUND';

  return {
    profileId: profile.profileId,
    role: profile.role,
    stateLabel: profile.stateLabel,
    foodName: profile.foodName,
    fieldPath: field.fieldPath,
    label: field.label,
    unit: field.unit,
    recommendedAction,
    bestSourceKey: bestSource?.sourceKey ?? null,
    bestSourceType: bestSource?.sourceType ?? null,
    bestSourceFoodName: bestSource?.foodName ?? null,
    bestSourceScientificName: bestSource?.scientificName ?? null,
    bestSourceValue: bestSource
      ? Number(bestSource.values[field.fieldPath])
      : null,
    compatibility: bestSource?.compatibility ?? null,
    sourceForm: bestSource?.fieldSources?.[field.fieldPath] ?? null,
    reason: buildReason({ fieldLabel: field.label, bestSource }),
  };
}

function actionForCompatibility(
  compatibility: SupplementalSourceCompatibility,
): GreenLippedMusselSupplementAction {
  switch (compatibility) {
    case 'SAME_SPECIES':
      return 'REVIEW_DIRECT_SOURCE';
    case 'APPROXIMATE_SPECIES':
      return 'REVIEW_APPROXIMATE_SOURCE';
    case 'PRODUCT_OR_EXTRACT':
    case 'REFERENCE_ONLY':
      return 'REFERENCE_ONLY';
  }
}

function buildReason(params: {
  fieldLabel: string;
  bestSource?: SupplementalSourceSnapshot;
}): string {
  if (!params.bestSource) {
    return `${params.fieldLabel} 暂未在 NZFCD、USDA/CNF 近似贻贝候选中找到可用原始值。`;
  }

  if (params.bestSource.compatibility === 'SAME_SPECIES') {
    return `${params.fieldLabel} 找到同物种来源，可进入人工审核后补入。`;
  }

  if (params.bestSource.compatibility === 'APPROXIMATE_SPECIES') {
    return `${params.fieldLabel} 只有近似物种来源，不能自动并入青口贝主档案；如接受，需标记为近似补源。`;
  }

  return `${params.fieldLabel} 仅找到产品、提取物或参考型来源，不建议用于鲜/熟青口贝食材主计算。`;
}

function hasFiniteValue(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function cloneProfile(profile: NutritionProfileV2): NutritionProfileV2 {
  return JSON.parse(JSON.stringify(profile)) as NutritionProfileV2;
}

function readProfileField(
  profile: NutritionProfileV2,
  fieldPath: string,
): number | null {
  const [tabKey, fieldKey] = fieldPath.split('.');
  const tab = (profile as unknown as Record<string, Record<string, unknown>>)[
    tabKey
  ];
  const value = tab?.[fieldKey];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function writeProfileField(
  profile: NutritionProfileV2,
  fieldPath: string,
  value: number,
): void {
  const [tabKey, fieldKey] = fieldPath.split('.');
  const tab = (profile as unknown as Record<string, Record<string, unknown>>)[
    tabKey
  ];
  if (!tab || !(fieldKey in tab)) {
    throw new Error(`Unsupported nutrition field path: ${fieldPath}`);
  }
  tab[fieldKey] = value;
}

function buildFieldSource(
  row: GreenLippedMusselSupplementPlanRow,
): NutritionFieldSource {
  const sourceCode = sourceCodeForType(row.bestSourceType);
  const sourceForm = row.sourceForm ?? {};
  const originalValue =
    typeof sourceForm.originalValue === 'number'
      ? sourceForm.originalValue
      : row.bestSourceValue;
  const originalUnit =
    typeof sourceForm.originalUnit === 'string' && sourceForm.originalUnit
      ? sourceForm.originalUnit
      : row.unit;

  return {
    sourceRole: 'FIELD_SUPPLEMENT',
    sourceType: row.bestSourceType,
    sourceKind: sourceCode ? 'FOOD_DATABASE' : null,
    sourceCode,
    sourceKey: row.bestSourceKey,
    externalId: row.bestSourceKey?.split(':')[1] ?? row.bestSourceKey,
    sourceTitle: row.bestSourceFoodName,
    sourceProvider: sourceProviderForType(row.bestSourceType),
    compatibility: row.compatibility,
    sourceNutrientId: sourceForm.sourceNutrientId,
    sourceNutrientName: sourceForm.sourceNutrientName,
    originalValue,
    originalUnit,
    canonicalValue:
      typeof sourceForm.canonicalValue === 'number'
        ? sourceForm.canonicalValue
        : row.bestSourceValue,
    canonicalUnit:
      typeof sourceForm.canonicalUnit === 'string' && sourceForm.canonicalUnit
        ? sourceForm.canonicalUnit
        : row.unit,
    basisType: 'PER_100_G',
    confidenceLevel:
      row.compatibility === 'SAME_SPECIES'
        ? 'HIGH'
        : row.compatibility === 'APPROXIMATE_SPECIES'
          ? 'MEDIUM'
          : 'LOW',
    noteZh: buildFieldSourceNote(row),
  };
}

function sourceCodeForType(
  sourceType: string | null,
): NutritionFieldSource['sourceCode'] {
  switch (sourceType) {
    case 'USDA':
      return 'USDA_FDC';
    case 'CNF':
      return 'CNF';
    case 'NZFCD':
      return 'NZFCD_FOODFILES';
    case 'CFCT':
      return 'CFCT';
    default:
      return null;
  }
}

function sourceProviderForType(sourceType: string | null): string | null {
  switch (sourceType) {
    case 'USDA':
      return 'USDA FoodData Central';
    case 'CNF':
      return 'Canadian Nutrient File';
    case 'NZFCD':
      return 'New Zealand Food Composition Database';
    case 'CFCT':
      return 'China Food Composition Tables';
    default:
      return null;
  }
}

function buildFieldSourceNote(row: GreenLippedMusselSupplementPlanRow): string {
  const compactSourceKey =
    row.bestSourceKey?.replace(':', ' ') ?? row.bestSourceType ?? '外部来源';

  if (row.compatibility === 'APPROXIMATE_SPECIES') {
    return `近似补源：${compactSourceKey} blue/common mussel，非绿唇贻贝，仅供计算参考。`;
  }

  if (row.compatibility === 'SAME_SPECIES') {
    return `同物种补源：${compactSourceKey}，用于补充 NZFCD 缺失字段。`;
  }

  return row.reason;
}

function buildVersionNote(
  existingNote: string | null | undefined,
  appliedRows: GreenLippedMusselSupplementPlanRow[],
): string {
  void existingNote;
  const sourceLabels = Array.from(
    new Set(
      appliedRows
        .map((row) => row.bestSourceType)
        .filter((value): value is string => !!value),
    ),
  ).join('/');

  return `主体来源：NZFCD；缺失字段用 ${sourceLabels || '外部'} blue/common mussel 近似补源，详见字段来源标签；仅供配方计算参考。氯、B7、牛磺酸等仍为空。`;
}
