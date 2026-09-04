/**
 * 已发布食谱营养报告构建（共享模块）。
 *
 * 从 recipe-designer.service.ts 的发布报告逻辑原样抽取：
 * summary（宏量干物质% / 能量密度 / 钙磷比 / 水分） + report
 * （原料清单 / 宏量营养分析 / 能量密度 / 四类营养素分区）。
 *
 * 供两处使用：
 *  1. 食谱设计器发布（SETAR_RECIPE_DESIGNER）
 *  2. 原料批量替换后的营养报告重算（BATCH_INGREDIENT_REPLACE）
 *
 * 注意：与 admin-web 端 publishReport.ts 保持同一报告结构约定。
 */
import type { NutritionDetailedData } from '../recipe/types';
import type {
  AssessmentEntry,
  FediafDogScenarioCode,
} from './types';
import type { DesignRecipeAssessmentResult } from './recipe-assessment';

export interface PublishedReportItemInput {
  /** 与评估项 id 对齐（设计器 item id / recipe_item id） */
  id: string;
  /** 营养库显示名（优先）或原料名 */
  name: string;
  isSupplement: boolean;
  /** 每份食谱用量（食材克数；补剂为理论添加量份数/克数/毫升） */
  weightG: number;
  ratioPercent: number | null;
  brand?: string | null;
  productModel?: string | null;
  unitDisplayLabel?: string | null;
  purchaseUnit?: string | null;
  properties?: unknown;
}

export interface BuildPublishedNutritionReportInput {
  items: PublishedReportItemInput[];
  assessment: DesignRecipeAssessmentResult;
  scenario: FediafDogScenarioCode;
  standard: string;
  source: string;
  schemaVersion?: number;
  generatedAt?: string;
}

const MACRO_ROW_DEFINITIONS = [
  { key: 'crudeProtein', name: '蛋白质', energyFactor: 3.5 },
  { key: 'crudeFat', name: '脂肪', energyFactor: 8.5 },
  { key: 'ash', name: '灰分', energyFactor: 0 },
  { key: 'moisture', name: '水分', energyFactor: 0 },
  { key: 'fiber', name: '膳食纤维', energyFactor: 0 },
  { key: 'carbohydrate', name: '碳水', energyFactor: 3.5 },
] as const;

const NUTRIENT_SECTION_DEFINITIONS = [
  { key: 'minerals', title: '微量元素' },
  { key: 'vitamins', title: '维生素' },
  { key: 'aminoAcids', title: '氨基酸' },
  { key: 'fattyAcids', title: '脂肪酸' },
] as const;

type NutrientSectionKey = (typeof NUTRIENT_SECTION_DEFINITIONS)[number]['key'];

export function buildPublishedNutritionDetailedData(
  input: BuildPublishedNutritionReportInput,
): NutritionDetailedData {
  const { assessment } = input;
  const summary: NonNullable<NutritionDetailedData['summary']> = {
    moisture_pct: roundNullable(calculateMoisturePercent(assessment), 2),
    protein_dm_pct: roundNullable(
      assessment.macroMetrics.crudeProtein.dryMatterPercent,
      2,
    ),
    fat_dm_pct: roundNullable(
      assessment.macroMetrics.crudeFat.dryMatterPercent,
      2,
    ),
    fiber_dm_pct: roundNullable(
      assessment.macroMetrics.fiber.dryMatterPercent,
      2,
    ),
    ash_dm_pct: roundNullable(
      assessment.macroMetrics.ash.dryMatterPercent,
      2,
    ),
    carbs_dm_pct: roundNullable(
      assessment.macroMetrics.carbohydrate.dryMatterPercent,
      2,
    ),
    ca_p_ratio: roundNullable(
      calculateCalciumPhosphorusRatio(assessment),
      2,
    ),
    energy_density_kcal_per_kg: roundNullable(
      assessment.energyDensityKcalPerKg,
      0,
    ),
  };

  return {
    ...summary,
    source: input.source,
    schemaVersion: input.schemaVersion ?? 1,
    standard: input.standard,
    scenario: input.scenario,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    summary,
    report: buildPublishedNutritionReport(input),
  };
}

export function buildPublishedNutritionReport(input: {
  items: PublishedReportItemInput[];
  assessment: DesignRecipeAssessmentResult;
}): NutritionDetailedData['report'] {
  const { items, assessment } = input;
  return {
    ingredientRows: buildIngredientReportRows(items, assessment),
    macroRows: buildMacroReportRows(assessment),
    energyDensityRows: buildEnergyDensityRows(assessment),
    nutrientSections: buildNutrientSections(assessment),
  };
}

function buildIngredientReportRows(
  items: PublishedReportItemInput[],
  assessment: DesignRecipeAssessmentResult,
) {
  const itemById = new Map(items.map((item) => [String(item.id), item]));

  return assessment.items.map((assessedItem) => {
    const item = itemById.get(String(assessedItem.id));
    const isSupplement = Boolean(item?.isSupplement);
    const baseName =
      assessedItem.name || item?.name || '未命名原料';

    return {
      ingredientName: formatIngredientReportName(item, baseName, isSupplement),
      amountLabel: formatReportAmount(
        assessedItem.weightG,
        isSupplement ? resolveSupplementUnit(item) : 'g',
      ),
      weightPercentLabel: isSupplement
        ? '-'
        : formatReportPercent(assessedItem.ratioPercent),
    };
  });
}

function formatIngredientReportName(
  item: PublishedReportItemInput | undefined,
  baseName: string,
  isSupplement: boolean,
): string {
  if (!isSupplement) {
    return baseName;
  }

  const detailLabel = resolveSupplementBrandSpecLabel(item);
  if (detailLabel && baseName.includes(detailLabel)) {
    return baseName;
  }
  return detailLabel ? `${baseName}（${detailLabel}）` : baseName;
}

function resolveSupplementBrandSpecLabel(
  item?: PublishedReportItemInput | null,
): string | null {
  if (!item) {
    return null;
  }
  const parts = [
    normalizeOptionalText(item.brand),
    normalizeOptionalText(item.productModel),
  ].filter((part): part is string => Boolean(part));
  return [...new Set(parts)].join(' · ') || null;
}

function resolveSupplementUnit(
  item?: PublishedReportItemInput | null,
): string {
  if (!item) {
    return 'g';
  }
  return (
    normalizeOptionalText(item.unitDisplayLabel) ||
    readSupplementDisplayUnit(item.properties) ||
    normalizeOptionalText(item.purchaseUnit) ||
    'g'
  );
}

function buildMacroReportRows(assessment: DesignRecipeAssessmentResult) {
  return MACRO_ROW_DEFINITIONS.map((definition) => {
    const metric = assessment.macroMetrics[definition.key];
    const total = metric?.total ?? null;
    const energyPercent =
      total !== null &&
      Number.isFinite(total) &&
      assessment.totalEnergyKcal !== null &&
      assessment.totalEnergyKcal > 0 &&
      definition.energyFactor > 0
        ? (total * definition.energyFactor * 100) / assessment.totalEnergyKcal
        : null;

    return {
      key: definition.key,
      name: definition.name,
      weightPercentLabel:
        total !== null &&
        Number.isFinite(total) &&
        assessment.totalWeightG > 0
          ? formatReportPercent((total * 100) / assessment.totalWeightG)
          : '-',
      dryMatterLabel: formatReportPercent(metric?.dryMatterPercent ?? null),
      energyPercentLabel: formatReportPercent(energyPercent),
    };
  });
}

function buildEnergyDensityRows(assessment: DesignRecipeAssessmentResult) {
  const dryMatterEnergyDensity =
    assessment.dryMatterEnergyKcalPer100g !== null
      ? assessment.dryMatterEnergyKcalPer100g * 10
      : assessment.totalEnergyKcal !== null &&
          assessment.dryMatterG !== null &&
          assessment.dryMatterG > 0
        ? (assessment.totalEnergyKcal / assessment.dryMatterG) * 1000
        : null;

  return [
    {
      label: '每公斤配方',
      value: formatEnergyDensity(
        assessment.energyDensityKcalPerKg,
        'kcal/kg',
      ),
    },
    {
      label: '每公斤干物质',
      value: formatEnergyDensity(dryMatterEnergyDensity, 'kcal/kg DM'),
    },
  ];
}

function buildNutrientSections(assessment: DesignRecipeAssessmentResult) {
  return NUTRIENT_SECTION_DEFINITIONS.reduce(
    (sections, definition) => {
      sections[definition.key] = {
        key: definition.key,
        title: definition.title,
        dryMatterHeader: '/100gDM',
        rows: assessment.groupedEntries
          .filter(
            (entry) => resolveNutrientSectionKey(entry) === definition.key,
          )
          .map((entry) => buildNutrientReportRow(entry)),
      };
      return sections;
    },
    {} as Record<
      NutrientSectionKey,
      {
        key: string;
        title: string;
        dryMatterHeader: string;
        rows: Array<Record<string, unknown>>;
      }
    >,
  );
}

function resolveNutrientSectionKey(entry: AssessmentEntry): NutrientSectionKey | null {
  if (entry.category === 'MINERAL' || entry.category === 'RATIO') {
    return 'minerals';
  }
  if (entry.category === 'VITAMIN') {
    return 'vitamins';
  }
  if (entry.category === 'AMINO_ACID') {
    return 'aminoAcids';
  }
  if (entry.category === 'FATTY_ACID') {
    return 'fattyAcids';
  }

  const signature =
    `${entry.nutrientKey ?? ''} ${entry.label ?? ''}`.toLowerCase();
  if (
    /epa|dha|omega|linoleic|linolenic|arachidonic|脂肪酸|亚油酸|花生四烯酸/.test(
      signature,
    )
  ) {
    return 'fattyAcids';
  }
  if (
    /arginine|histidine|isoleucine|leucine|lysine|methionine|cystine|phenylalanine|tyrosine|threonine|tryptophan|valine|氨酸|赖氨酸|精氨酸|组氨酸|蛋氨酸|胱氨酸|苯丙氨酸|酪氨酸/.test(
      signature,
    )
  ) {
    return 'aminoAcids';
  }
  if (
    /calcium|phosphorus|potassium|sodium|chloride|magnesium|zinc|copper|manganese|selenium|iodine|iron|钙|磷|钾|钠|氯|镁|锌|铜|锰|硒|碘|铁/.test(
      signature,
    )
  ) {
    return 'minerals';
  }
  if (/vitamin|维生素/.test(signature)) {
    return 'vitamins';
  }

  return null;
}

function buildNutrientReportRow(
  entry: AssessmentEntry & { details?: AssessmentEntry[] },
) {
  const ratio = isRatioEntry(entry);
  const dryMatterEntry =
    entry.details?.find(
      (detail) => detail.expressionBasis === 'PER_100G_DRY_MATTER',
    ) ?? (entry.expressionBasis === 'PER_100G_DRY_MATTER' ? entry : null);

  return {
    key: entry.nutrientKey,
    name: entry.label,
    unit: ratio ? '比例' : entry.unit,
    minLabel: formatNutrientValue(entry.minValue, ratio),
    maxLabel: formatNutrientValue(entry.maxValue, ratio),
    currentLabel: formatNutrientValue(entry.currentValue, ratio),
    dryMatterLabel: ratio
      ? ''
      : formatReportNumber(dryMatterEntry?.currentValue ?? null),
    status: entry.status,
  };
}

function isRatioEntry(entry: AssessmentEntry): boolean {
  return entry.expressionBasis === 'RATIO';
}

function formatReportAmount(value: number | null, unit: string): string {
  if (value === null || !Number.isFinite(value)) {
    return '-';
  }
  return `${formatReportNumber(value)}${unit}`;
}

function formatEnergyDensity(value: number | null, unit: string): string {
  if (value === null || !Number.isFinite(value)) {
    return '-';
  }
  return `${Math.round(value)} ${unit}`;
}

function formatReportPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return '-';
  }
  return `${formatReportNumber(value)}%`;
}

function formatNutrientValue(value: number | null, ratio: boolean): string {
  if (value === null || !Number.isFinite(value)) {
    return '-';
  }
  const formatted = formatReportNumber(value);
  return ratio ? `${formatted}:1` : formatted;
}

function formatReportNumber(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return '-';
  }
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded)
    ? String(rounded)
    : String(rounded).replace(/0+$/, '').replace(/\.$/, '');
}

function calculateCalciumPhosphorusRatio(
  assessment: DesignRecipeAssessmentResult,
): number | null {
  const explicitRatio = findAssessmentCurrentValue(assessment, 'ca_p_ratio');
  const fallbackRatio =
    calculateRatioFromNutrientTotals(assessment, 'calcium', 'phosphorus') ??
    calculateRatioFromCurrentValues(assessment, 'calcium', 'phosphorus');

  if (
    fallbackRatio !== null &&
    Number.isFinite(fallbackRatio) &&
    (explicitRatio === null || explicitRatio <= 0)
  ) {
    return fallbackRatio;
  }

  return explicitRatio;
}

function calculateRatioFromNutrientTotals(
  assessment: DesignRecipeAssessmentResult,
  numeratorKey: string,
  denominatorKey: string,
): number | null {
  const numerator = assessment.nutrients[numeratorKey]?.total ?? null;
  const denominator = assessment.nutrients[denominatorKey]?.total ?? null;
  return dividePositiveRatio(numerator, denominator);
}

function calculateRatioFromCurrentValues(
  assessment: DesignRecipeAssessmentResult,
  numeratorKey: string,
  denominatorKey: string,
): number | null {
  return dividePositiveRatio(
    findAssessmentCurrentValue(assessment, numeratorKey),
    findAssessmentCurrentValue(assessment, denominatorKey),
  );
}

function dividePositiveRatio(
  numerator: number | null,
  denominator: number | null,
): number | null {
  if (
    numerator === null ||
    denominator === null ||
    !Number.isFinite(numerator) ||
    !Number.isFinite(denominator) ||
    denominator <= 0
  ) {
    return null;
  }

  return numerator / denominator;
}

function calculateMoisturePercent(
  assessment: DesignRecipeAssessmentResult,
): number | null {
  const moistureTotal = assessment.macroMetrics.moisture.total;
  if (
    moistureTotal !== null &&
    Number.isFinite(moistureTotal) &&
    assessment.totalWeightG > 0
  ) {
    return (moistureTotal / assessment.totalWeightG) * 100;
  }

  if (
    assessment.dryMatterG !== null &&
    Number.isFinite(assessment.dryMatterG) &&
    assessment.totalWeightG > 0
  ) {
    return (
      ((assessment.totalWeightG - assessment.dryMatterG) /
        assessment.totalWeightG) *
      100
    );
  }

  return null;
}

function findAssessmentCurrentValue(
  assessment: DesignRecipeAssessmentResult,
  nutrientKey: string,
): number | null {
  return (
    assessment.groupedEntries.find(
      (entry) => entry.nutrientKey === nutrientKey,
    )?.currentValue ??
    assessment.entries.find((entry) => entry.nutrientKey === nutrientKey)
      ?.currentValue ??
    null
  );
}

function roundNullable(value: number | null, digits: number): number | null {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function normalizeOptionalText(value: unknown): string | null {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized || null;
}

function readSupplementDisplayUnit(properties: unknown): string | null {
  if (
    !properties ||
    typeof properties !== 'object' ||
    Array.isArray(properties)
  ) {
    return null;
  }
  return normalizeOptionalText(
    (properties as Record<string, unknown>).display_unit,
  );
}
