/**
 * `Recipe Agent` 的真实草稿端口（P0b-2a）。
 *
 * 每次运行绑定一份草稿（`draftId`）和当前员工身份（`actor`）：
 * - 读方法走现有 `RecipeDesignerService` + 只读 Prisma（四个读方法都已接真实数据）；
 * - 写方法必须在 P0b-2b 通过 `RecipeDesignerService` 落库（它负责
 *   `contentRevision` 与事务），本任务先统一抛错。
 *
 * 身份直接复用 `RecipeDesignerService.getDraft` 的第二个参数类型，
 * 避免依赖 service 里未导出的 `RecipeDesignerAccessInput`。
 */
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { DesignRecipeStatus } from '@prisma/client';

import { normalizeNutritionProfile } from '../../../domain/ingredient/nutrition-profile.utils';
import type { NutritionProfile } from '../../../domain/ingredient/types';
import {
  classifyFoodCategory,
  type FoodCategory,
} from '../../../domain/recipe-designer/food-category-map';
import {
  readProfileFieldAmount,
  readProfileValuePer100g,
} from '../../../domain/recipe-designer/nutrition-profile-reader';
import {
  PRODUCTION_STEP_LIMITS,
  readProductionSteps,
  type ProductionStep,
} from '../../../domain/recipe-designer/production-steps';
import type { PrismaService } from '../../../infrastructure/prisma.service';
import { nutritionDataToNutritionProfile } from '../../nutrition-standard/nutrient-value-resolver';
import { resolveNutritionProfileDisplayName } from '../../nutrition-food/nutrition-food-display-name';
import type { RecipeDesignerService } from '../recipe-designer.service';
import {
  RecipeAgentPortError,
  type AgentAssessmentEntry,
  type AgentAssessmentView,
  type AgentCatalogUsage,
  type AgentCatalogUsageRecipe,
  type AgentCopyPatch,
  type AgentDraftItem,
  type AgentDraftSnapshot,
  type AgentIngredientCandidate,
  type AgentIngredientDetail,
  type AgentIngredientKeyNutrients,
  type AgentIngredientNutritionBasis,
  type AgentIngredientNutritionProfile,
  type AgentIngredientProfileSummary,
  type AgentIngredientRecommendedProduct,
  type AgentIngredientTag,
  type AgentProductionStep,
  type AgentRecipeDetail,
  type AgentRecipeItemRead,
  type AgentRecipeSearchPage,
  type AgentRecipeSummary,
} from './agent-types';
import type { RecipeAgentDraftPort } from './recipe-agent.port';

/** 调工具的当前员工身份；与后台草稿接口的 access 入参保持一致。 */
export interface RecipeAgentActor {
  userId: string;
  role?: string | null;
  customerId?: string | null;
}

/** `getDraft` 的返回形状（service 的 `DesignRecipeWithItems` 未导出）。 */
type ServiceDraft = Awaited<ReturnType<RecipeDesignerService['getDraft']>>;

/** 三个原料写方法返回的明细（service 里共用同一 select）。 */
type ServiceWrittenItem = Awaited<ReturnType<RecipeDesignerService['addItem']>>;

/** 可写营养档案解析出的真实原料；`type` 供后续补剂目标解析使用。 */
interface WritableNutritionFood {
  ingredientId: string;
  type: 'FOOD' | 'SUPPLEMENT';
  baseUnit: 'G' | 'ML' | 'PCS';
  usageUnit: string | null;
  basisType: string | null;
  servingWeightG: number | null;
}

/**
 * 补剂数量统一按 0.1 粒度（一位小数，最小 0.1）。
 *
 * 注意：这是“按基准单位”的规则，不是所有补剂都按片/粒：
 *  · PCS：0.1 片/粒；
 *  · G：0.1g（谷粉等粉剂）；
 *  · ML：0.1ml。
 * 食材仍然按克，不受这条限制。
 */
const assertSupplementAmountPrecision = (
  type: 'FOOD' | 'SUPPLEMENT',
  baseUnit: 'G' | 'ML' | 'PCS',
  amount: number,
): void => {
  if (type !== 'SUPPLEMENT') return;
  if (!Number.isFinite(amount) || amount < 0.1) {
    throw new RecipeAgentPortError(
      'INVALID_ARGUMENT',
      `补剂数量不能小于 0.1（当前基准单位 ${baseUnit}）；请按 0.1 粒度填写。`,
    );
  }
  const scaled = amount * 10;
  if (Math.abs(scaled - Math.round(scaled)) > 1e-9) {
    throw new RecipeAgentPortError(
      'INVALID_ARGUMENT',
      `补剂数量必须按 0.1 粒度（一位小数，如 0.2、0.5、1.3；当前基准单位 ${baseUnit}）。`,
    );
  }
};

const ASSESSMENT_STATUSES: ReadonlySet<AgentAssessmentEntry['status']> =
  new Set(['COMPLIANT', 'DEFICIENT', 'EXCESS', 'MISSING_DATA', 'INFO']);

/**
 * 物种词表；长词 / 具体物种在前。
 * `火鸡` 必须先于 `鸡`，`蛙` 必须先于 `牛`（否则「牛蛙」会被判成牛）。
 * 只用于“单一动物蛋白”标签判断，命中即止。
 */
const ANIMAL_SPECIES_KEYWORDS = [
  '火鸡',
  '鹌鹑',
  '鸡',
  '鸭',
  '鹅',
  '鹿',
  '驴',
  '鸽',
  '蛙',
  '牛',
  '羊',
  '猪',
  '兔',
  '鱼',
  '虾',
  '蟹',
  '贝',
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toFiniteNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const roundTo1 = (value: number): number => Math.round(value * 10) / 10;

const readCfctClass = (properties: unknown): string | null => {
  if (!isRecord(properties)) {
    return null;
  }
  const value = properties.cfct_class;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
};

/**
 * 系列上的 designMode 在 service 类型里是 string（历史数据可能为空）。
 * 只把 CATALOG / ORDER 透给模型；其它值按“不知道”返回 null，让模型走产品线。
 */
const readDesignMode = (
  value: string | null | undefined,
): AgentDraftSnapshot['designMode'] =>
  value === 'CATALOG' || value === 'ORDER' ? value : null;

const readAssessmentStatus = (
  value: unknown,
): AgentAssessmentEntry['status'] | null => {
  if (typeof value !== 'string') {
    return null;
  }
  return ASSESSMENT_STATUSES.has(value as AgentAssessmentEntry['status'])
    ? (value as AgentAssessmentEntry['status'])
    : null;
};

type NutritionSummary = {
  fatWetPercent: number | null;
  moisturePercent: number | null;
};

const GROUPED_NUTRITION_PROFILE_KEYS = [
  'meta',
  'macros',
  'minerals',
  'vitamins',
  'fattyAcids',
  'aminoAcids',
  'items',
] as const;

/**
 * 与 `RecipeDesignerService.toNutritionProfile` 同一判定：
 * 分组 v2 档案走 normalizer，扁平旧数据走营养字段别名转换。
 */
const resolveNutritionProfile = (
  nutritionData: unknown,
): NutritionProfile | null => {
  if (!isRecord(nutritionData)) {
    return null;
  }
  if (GROUPED_NUTRITION_PROFILE_KEYS.some((key) => key in nutritionData)) {
    return normalizeNutritionProfile(
      nutritionData as unknown as NutritionProfile,
    );
  }
  return nutritionDataToNutritionProfile(nutritionData);
};

const emptyKeyNutrients = (): AgentIngredientKeyNutrients => ({
  proteinPer100g: null,
  fatPer100g: null,
  calciumMgPer100g: null,
  phosphorusMgPer100g: null,
});

/** 从营养档案读候选比较用的四个关键值（每 100g）。 */
const buildKeyNutrients = (
  profile: NutritionProfile | null,
): AgentIngredientKeyNutrients => {
  if (!profile) {
    return emptyKeyNutrients();
  }
  return {
    proteinPer100g: readProfileValuePer100g(
      profile,
      'macros.crudeProtein',
    ).valuePer100g,
    fatPer100g: readProfileValuePer100g(profile, 'macros.crudeFat')
      .valuePer100g,
    calciumMgPer100g: readProfileValuePer100g(profile, 'minerals.calcium')
      .valuePer100g,
    phosphorusMgPer100g: readProfileValuePer100g(
      profile,
      'minerals.phosphorus',
    ).valuePer100g,
  };
};

/**
 * 从 `calculatedNutrition` 读一个宏量的总克数（只作为 items 没有档案时的兜底）。
 *
 * 兼容分组形状（`macros.moisture`）与旧扁平形状（`crudeFat.total`）。
 */
const readCalculatedMacroTotalGrams = (
  calculatedNutrition: Record<string, unknown>,
  key: 'moisture' | 'crudeFat',
): number | null => {
  const macros = isRecord(calculatedNutrition.macros)
    ? calculatedNutrition.macros
    : null;
  const grouped = toFiniteNumber(macros?.[key]);
  if (grouped !== null) {
    return grouped;
  }
  const flat = calculatedNutrition[key];
  return isRecord(flat) ? toFiniteNumber(flat.total) : toFiniteNumber(flat);
};

const buildNutritionSummaryFromCalculated = (
  calculatedNutrition: unknown,
  totalWeightG: number,
): NutritionSummary => {
  const empty = { fatWetPercent: null, moisturePercent: null };
  if (!isRecord(calculatedNutrition) || totalWeightG <= 0) {
    return empty;
  }

  const moistureG = readCalculatedMacroTotalGrams(
    calculatedNutrition,
    'moisture',
  );
  const crudeFatG = readCalculatedMacroTotalGrams(
    calculatedNutrition,
    'crudeFat',
  );

  return {
    fatWetPercent: crudeFatG === null ? null : (crudeFatG / totalWeightG) * 100,
    moisturePercent:
      moistureG === null ? null : (moistureG / totalWeightG) * 100,
  };
};

/**
 * 从参与评估的 item 营养档案现算总克数。
 *
 * 任一条缺该字段 → null（保守，不用部分和）；0g 的 item 不参与，与评估口径一致。
 */
const sumProfileAmount = (
  items: ServiceDraft['items'],
  profiles: readonly (NutritionProfile | null)[],
  fieldPath: string,
): number | null => {
  let total = 0;
  let hasPositiveWeightItem = false;

  for (const [index, item] of items.entries()) {
    if (item.weightG === 0) {
      continue;
    }
    hasPositiveWeightItem = true;
    const read = readProfileFieldAmount(
      profiles[index],
      fieldPath,
      item.weightG,
    );
    if (read.missing || read.amount === null) {
      return null;
    }
    total += read.amount;
  }

  return hasPositiveWeightItem ? total : null;
};

/**
 * 湿基脂肪 / 水分百分比：优先从参与评估的食品 item 的
 * `nutritionFood.nutritionData` 现算，只有这些 item 都没有营养档案时，
 * 才回退到 `calculatedNutrition`。分母由调用方按同一口径给出。
 */
const buildNutritionSummary = (
  assessedItems: ServiceDraft['items'],
  totalWeightG: number,
  calculatedNutrition: unknown,
): NutritionSummary => {
  if (totalWeightG <= 0) {
    return { fatWetPercent: null, moisturePercent: null };
  }

  const profiles = assessedItems.map((item) =>
    resolveNutritionProfile(item.nutritionFood?.nutritionData),
  );

  if (profiles.every((profile) => profile === null)) {
    return buildNutritionSummaryFromCalculated(
      calculatedNutrition,
      totalWeightG,
    );
  }

  const moistureG = sumProfileAmount(
    assessedItems,
    profiles,
    'macros.moisture',
  );
  const crudeFatG = sumProfileAmount(
    assessedItems,
    profiles,
    'macros.crudeFat',
  );

  return {
    fatWetPercent: crudeFatG === null ? null : (crudeFatG / totalWeightG) * 100,
    moisturePercent:
      moistureG === null ? null : (moistureG / totalWeightG) * 100,
  };
};

/** 只有评估版本与当前内容版本一致时，才把旧报告当作“最近一次评估”。 */
const buildLastAssessment = (
  draft: ServiceDraft,
): AgentAssessmentView | null => {
  if (
    draft.assessmentContentRevision == null ||
    draft.assessmentContentRevision !== draft.contentRevision
  ) {
    return null;
  }

  const rawEntries = Array.isArray(draft.complianceStatus)
    ? draft.complianceStatus
    : [];
  const entries: AgentAssessmentEntry[] = [];

  for (const raw of rawEntries) {
    if (!isRecord(raw)) {
      continue;
    }
    const status = readAssessmentStatus(raw.status);
    if (!status) {
      continue;
    }
    entries.push({
      key: typeof raw.nutrientKey === 'string' ? raw.nutrientKey : '',
      label: typeof raw.label === 'string' ? raw.label : '',
      status,
      value: toFiniteNumber(raw.currentValue),
      min: toFiniteNumber(raw.minValue),
      max: toFiniteNumber(raw.maxValue),
      marginPercent: null,
      unit: typeof raw.unit === 'string' ? raw.unit : null,
      basis:
        typeof raw.expressionBasis === 'string'
          ? raw.expressionBasis
          : null,
    });
  }

  const energyDensityKcalPerKg = draft.energyDensityKcalPerKg ?? null;
  const totalEnergyKcal =
    energyDensityKcalPerKg !== null && draft.totalWeightG > 0
      ? (energyDensityKcalPerKg * draft.totalWeightG) / 1000
      : null;

  return {
    contentRevision: draft.contentRevision,
    compliant: entries.filter((entry) => entry.status === 'COMPLIANT').length,
    deficient: entries.filter((entry) => entry.status === 'DEFICIENT').length,
    excess: entries.filter((entry) => entry.status === 'EXCESS').length,
    missingData: entries.filter((entry) => entry.status === 'MISSING_DATA')
      .length,
    entries,
    basis: 'PER_1000_KCAL',
    totalEnergyKcal,
    energyDensityKcalPerKg,
    totalWeightG: draft.totalWeightG,
  };
};

/** 结构化步骤 → Agent 可读步骤（时间 / 温度转成展示字符串）。 */
const toAgentProductionSteps = (
  steps: readonly ProductionStep[] | null | undefined,
): AgentProductionStep[] =>
  (steps ?? []).map((step) => ({
    sortOrder: step.sortOrder,
    instruction: step.instruction,
    duration:
      step.durationMinutes == null ? null : `${step.durationMinutes} 分钟`,
    temperature: step.temperatureC == null ? null : `${step.temperatureC}℃`,
    equipment: step.equipment ?? null,
  }));

/** `"5 分钟"` / `"5分钟"` / `"5"`；分钟是最小单位，不接受秒/小时单位。 */
const STEP_DURATION_PATTERN = /^(\d+(?:\.\d+)?)\s*(?:分钟)?$/;

/** `"180℃"` / `"180°C"` / `"180"`；允许负温度（冷冻）。 */
const STEP_TEMPERATURE_PATTERN = /^(-?\d+(?:\.\d+)?)\s*(?:℃|°c)?$/i;

/** 步骤时长下限：0 分钟只可能是缺省值，显式写 0 视为越界。 */
const MIN_STEP_DURATION_MINUTES = 1;

const invalidStepDuration = (message: string): RecipeAgentPortError =>
  new RecipeAgentPortError('INVALID_ARGUMENT', message);

const invalidStepTemperature = (message: string): RecipeAgentPortError =>
  new RecipeAgentPortError('INVALID_ARGUMENT', message);

/**
 * 解析步骤时长字符串。
 *
 * 缺省 / 空白 → `undefined`（不写库）；格式不认识或越界 → `INVALID_ARGUMENT`，
 * 绝不能让 `NaN` 落到 Prisma。
 */
const parseStepDurationMinutes = (
  value: string | null | undefined,
): number | undefined => {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw invalidStepDuration('时长格式不正确');
  }
  const text = value.trim();
  if (!text) {
    return undefined;
  }
  const match = STEP_DURATION_PATTERN.exec(text);
  if (!match) {
    throw invalidStepDuration('时长格式不正确');
  }
  const minutes = Number(match[1]);
  if (
    !Number.isFinite(minutes) ||
    minutes < MIN_STEP_DURATION_MINUTES ||
    minutes > PRODUCTION_STEP_LIMITS.maxDurationMinutes
  ) {
    throw invalidStepDuration(
      `时长必须在 ${MIN_STEP_DURATION_MINUTES}-${PRODUCTION_STEP_LIMITS.maxDurationMinutes} 分钟之间`,
    );
  }
  return minutes;
};

/** 解析步骤温度字符串；缺省 / 空白 → `undefined`，格式/范围错误 → `INVALID_ARGUMENT`。 */
const parseStepTemperatureC = (
  value: string | null | undefined,
): number | undefined => {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw invalidStepTemperature('温度格式不正确');
  }
  const text = value.trim();
  if (!text) {
    return undefined;
  }
  const match = STEP_TEMPERATURE_PATTERN.exec(text);
  if (!match) {
    throw invalidStepTemperature('温度格式不正确');
  }
  const temperature = Number(match[1]);
  if (
    !Number.isFinite(temperature) ||
    temperature < PRODUCTION_STEP_LIMITS.minTemperatureC ||
    temperature > PRODUCTION_STEP_LIMITS.maxTemperatureC
  ) {
    throw invalidStepTemperature(
      `温度必须在 ${PRODUCTION_STEP_LIMITS.minTemperatureC} 到 ${PRODUCTION_STEP_LIMITS.maxTemperatureC} ℃ 之间`,
    );
  }
  return temperature;
};

type IngredientOption = Awaited<
  ReturnType<RecipeDesignerService['listIngredientOptions']>
>['data'][number];

type IngredientOptionProfile = IngredientOption['nutritionProfiles'][number];

const DEFAULT_SEARCH_LIMIT = 20;
const MAX_SEARCH_LIMIT = 50;
/** 翻页上限：20 × 50 = 1000 条，覆盖当前食材库并兜住异常数据。 */
const MAX_SEARCH_PAGES = 20;

/** `search_ingredients` 的 limit：默认 20，收敛到 1–50（工具层已校验，这里兜底）。 */
const resolveSearchLimit = (limit: number | undefined): number => {
  if (limit === undefined || !Number.isFinite(limit)) {
    return DEFAULT_SEARCH_LIMIT;
  }
  return Math.min(MAX_SEARCH_LIMIT, Math.max(1, Math.floor(limit)));
};

/**
 * 从 `listIngredientOptions` 的档案里挑默认项：`defaultNutritionFoodId` 对应项
 * → 主档案 → 第一个。挑不到返回 null。
 */
const pickIngredientProfile = (
  option: IngredientOption,
): IngredientOptionProfile | null => {
  const profiles = option.nutritionProfiles ?? [];
  const defaultProfile = option.defaultNutritionFoodId
    ? profiles.find(
        (profile) => profile.nutritionFoodId === option.defaultNutritionFoodId,
      )
    : undefined;

  return (
    defaultProfile ??
    profiles.find((profile) => profile.isPrimary) ??
    profiles[0] ??
    null
  );
};

/**
 * `listIngredientOptions` 的档案 → 搜索候选的全量档案摘要。
 *
 * 搜索必须让模型看到生/熟/蒸等所有做法，不能只给默认档案。
 */
const toProfileSummary = (
  profile: IngredientOptionProfile,
): AgentIngredientProfileSummary => ({
  nutritionFoodId: profile.nutritionFoodId,
  name: profile.name,
  displayNameZh: profile.displayNameZh ?? null,
  status: profile.status,
  category: profile.category ?? null,
  dataSource: profile.dataSource ?? null,
  isPrimary: profile.isPrimary,
  preparationState: profile.preparationState ?? null,
  preparationStateLabel: profile.preparationStateLabel ?? null,
  verified: profile.status === 'VERIFIED',
});

/**
 * 批量补 `cfct_class`：option 只带营养档案，没有 `Ingredient.properties`。
 *
 * 查不到的原料记 null，不阻断搜索。
 */
const loadCfctClasses = async (
  prisma: PrismaService,
  ingredientIds: string[],
): Promise<Map<string, string | null>> => {
  if (ingredientIds.length === 0) {
    return new Map();
  }

  const rows = await prisma.ingredient.findMany({
    where: { id: { in: ingredientIds } },
    select: { id: true, properties: true },
  });

  return new Map(rows.map((row) => [row.id, readCfctClass(row.properties)]));
};

/** 营养档案 `nutritionData.macros` → 只保留有限数值；缺失时返回空对象。 */
const NUTRITION_GROUPS = [
  'macros',
  'minerals',
  'vitamins',
  'aminoAcids',
  'fattyAcids',
] as const;

/**
 * 营养摘要。
 *
 * - 食物：只读 `macros`（水分/蛋白/脂肪/灰分/纤维），总量由评估算；
 * - 补剂：读全部组，矿物质/维生素等用 `minerals.calcium` 这种带组前缀的 key，
 *   因为补剂的价值就在这些组里，只给宏量等于什么都没给。
 */
const readNutritionSummary = (
  nutritionData: unknown,
  full = false,
): Record<string, number | null> => {
  if (!isRecord(nutritionData)) {
    return {};
  }

  const summary: Record<string, number | null> = {};
  const groups = full ? NUTRITION_GROUPS : (['macros'] as const);
  for (const group of groups) {
    const values = nutritionData[group];
    if (!isRecord(values)) {
      continue;
    }
    for (const [key, value] of Object.entries(values)) {
      const amount = toFiniteNumber(value);
      if (amount !== null) {
        summary[full && group !== 'macros' ? `${group}.${key}` : key] = amount;
      }
    }
  }
  return summary;
};

/**
 * 补剂的数量单位必须和营养档案的基准对得上：
 * - PCS（粒/片）→ 每份（PER_SERVING），或能按每份重量换算；
 * - G → 每克/每 100g，或能按每份重量换算；
 * - ML → 每毫升/每 100ml，或能按每份重量换算。
 *
 * 对不上就不允许 AI 写，避免“0.16g 海藻粉 = 几平勺”这种猜。
 */
const assertSupplementUnitMatches = (
  nutritionFoodId: string,
  baseUnit: 'G' | 'ML' | 'PCS',
  basisType: string | null,
  servingWeightG: number | null,
): void => {
  const perGram = basisType === 'PER_100_G' || basisType === 'PER_1_G';
  const perMl = basisType === 'PER_100_ML' || basisType === 'PER_1_ML';
  const perServing = basisType === 'PER_SERVING';
  const canConvertServing =
    perServing && servingWeightG !== null && servingWeightG > 0;
  const compatible =
    baseUnit === 'PCS'
      ? perServing || canConvertServing
      : baseUnit === 'G'
        ? perGram || canConvertServing
        : baseUnit === 'ML'
          ? perMl || canConvertServing
          : false;

  if (!compatible) {
    throw new RecipeAgentPortError(
      'INVALID_ARGUMENT',
      `补剂档案 ${nutritionFoodId} 的计量基准（${basisType ?? '未知'}）和基准单位（${baseUnit}）不一致；请补每份重量，或把营养数据改成按克/毫升/每粒记录，再让 AI 添加。`,
    );
  }
};

/** 补剂的营养值基准：每 100g / 每份 / 每粒，必须和数值一起给模型。 */
const readNutritionBasis = (
  nutritionData: unknown,
  usageUnit: string | null,
): AgentIngredientNutritionBasis => {
  const meta =
    isRecord(nutritionData) && isRecord(nutritionData.meta)
      ? nutritionData.meta
      : null;
  return {
    basisType:
      meta && typeof meta.rawBasisType === 'string'
        ? meta.rawBasisType
        : null,
    servingWeightG: toFiniteNumber(meta?.servingWeightG),
    usageUnit,
  };
};

/** 过敏原名去重（保持映射顺序）；空名字跳过。 */
const collectAllergenNames = (
  allergenTags: readonly { allergenTag: { name: string } | null }[] | undefined,
): string[] => {
  const names: string[] = [];
  for (const tag of allergenTags ?? []) {
    const name = tag.allergenTag?.name?.trim();
    if (name && !names.includes(name)) {
      names.push(name);
    }
  }
  return names;
};

/** Prisma Decimal（或测试里的 number）→ number；空值 / 非有限值 → null。 */
const toPriceNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) {
    return null;
  }
  const price = Number(value);
  return Number.isFinite(price) ? price : null;
};

/** 按克计量的单位（可换算成食物质量）。 */
const GRAM_UNITS: ReadonlySet<string> = new Set(['g', '克', 'ml', '毫升']);

/** 按粒/片/袋等计数的单位：克重不是食物质量。 */
const COUNT_UNITS: ReadonlySet<string> = new Set([
  '粒',
  '片',
  '袋',
  '包',
  '颗',
  '支',
  '瓶',
]);

type SupplementUnitBasis = 'GRAM' | 'COUNT' | 'UNKNOWN';

/**
 * 补剂的计量口径：展示单位优先，其次采购单位。
 *
 * 只认明确的白名单；识别不了返回 UNKNOWN，由调用方 fail closed。
 */
const resolveSupplementUnitBasis = (ingredient: {
  unitDisplayLabel?: string | null;
  purchaseUnit?: string | null;
}): SupplementUnitBasis => {
  const raw =
    ingredient.unitDisplayLabel?.trim() ||
    ingredient.purchaseUnit?.trim() ||
    '';
  if (!raw) {
    return 'UNKNOWN';
  }
  const unit = raw.toLowerCase();
  if (GRAM_UNITS.has(unit)) {
    return 'GRAM';
  }
  if (COUNT_UNITS.has(unit)) {
    return 'COUNT';
  }
  return 'UNKNOWN';
};

interface AnimalSpeciesScan {
  species: string[];
  unknownAnimalProtein: boolean;
}

/**
 * 扫描动物物种：只扫 `PROTEIN` / `ORGAN` / `AQUATIC` / `UNCLASSIFIED` 项。
 *
 * - 名称命中词表 → 记物种；`UNCLASSIFIED` 也记，避免漏掉未分类的鸡肉。
 * - `PROTEIN` / `ORGAN` / `AQUATIC` 命中不到 → `unknownAnimalProtein`，标签 fail closed。
 * - 果蔬菌（FRUIT / MUSHROOM / VEGETABLE 等）根本不进扫描。
 */
const collectAnimalSpecies = (
  items: readonly { name: string; category: FoodCategory }[],
): AnimalSpeciesScan => {
  const species: string[] = [];
  let unknownAnimalProtein = false;

  for (const item of items) {
    if (
      item.category !== 'PROTEIN' &&
      item.category !== 'ORGAN' &&
      item.category !== 'AQUATIC' &&
      item.category !== 'UNCLASSIFIED'
    ) {
      continue;
    }
    const matched = ANIMAL_SPECIES_KEYWORDS.find((keyword) =>
      item.name.includes(keyword),
    );
    if (matched) {
      if (!species.includes(matched)) {
        species.push(matched);
      }
    } else if (item.category !== 'UNCLASSIFIED') {
      unknownAnimalProtein = true;
    }
  }

  return { species, unknownAnimalProtein };
};

/** 一条食谱明细的展示名与分类；当前草稿与已发布食谱共用同一口径。 */
interface CatalogItemIdentity {
  name: string;
  category: FoodCategory;
}

/**
 * 明细 → `{ name, category }`。
 *
 * 名称优先取采购原料名，其次营养档案的中文名 / 英文名；
 * `nutritionFood` 可为 null，`ingredient.properties` 可能是任意 JSON。
 */
const toCatalogItemIdentity = (item: {
  ingredient?: {
    name?: string | null;
    type?: string | null;
    properties?: unknown;
  } | null;
  nutritionFood?: {
    name?: string | null;
    displayNameZh?: string | null;
    category?: string | null;
  } | null;
}): CatalogItemIdentity => {
  const ingredient = item.ingredient ?? null;
  const nutritionFood = item.nutritionFood ?? null;
  const name =
    ingredient?.name ??
    nutritionFood?.displayNameZh ??
    nutritionFood?.name ??
    '';

  return {
    name,
    category: classifyFoodCategory({
      name,
      cfctClass: readCfctClass(ingredient?.properties),
      nutritionCategory: nutritionFood?.category ?? null,
      ingredientType: ingredient?.type === 'SUPPLEMENT' ? 'SUPPLEMENT' : 'FOOD',
    }),
  };
};

/** 名称比对口径：去首尾空白 + 大小写不敏感（中文名不受影响）。 */
const normalizeCatalogName = (value: string): string =>
  value.trim().toLowerCase();

/** 按出现顺序去重。 */
const uniqueValues = <T>(values: readonly T[]): T[] => {
  const result: T[] = [];
  for (const value of values) {
    if (!result.includes(value)) {
      result.push(value);
    }
  }
  return result;
};

/** 主蛋白 = 克数最大的 `PROTEIN` / `AQUATIC` 项；没有则 null（并列取先出现的）。 */
const findMainProteinName = (
  items: readonly {
    identity: CatalogItemIdentity;
    exampleWeight?: unknown;
  }[],
): string | null => {
  let mainProtein: { name: string; weightG: number } | null = null;

  for (const item of items) {
    if (
      (item.identity.category !== 'PROTEIN' &&
        item.identity.category !== 'AQUATIC') ||
      !item.identity.name
    ) {
      continue;
    }
    const weightG = toFiniteNumber(item.exampleWeight) ?? 0;
    if (!mainProtein || weightG > mainProtein.weightG) {
      mainProtein = { name: item.identity.name, weightG };
    }
  }

  return mainProtein?.name ?? null;
};

// ---- 只读食谱库（全部正式食谱 + 全部设计草稿 + 当前草稿） ----

const DEFAULT_RECIPE_PAGE_SIZE = 20;
const MAX_RECIPE_PAGE_SIZE = 50;
const MAX_RECIPE_PAGE = 1000;

/** 工具层已校验，这里再收敛一次，防止绕过工具直接调端口。 */
const resolveRecipePage = (page: number | undefined): number => {
  if (page === undefined || !Number.isFinite(page)) return 1;
  return Math.min(MAX_RECIPE_PAGE, Math.max(1, Math.floor(page)));
};

const resolveRecipePageSize = (limit: number | undefined): number => {
  if (limit === undefined || !Number.isFinite(limit)) {
    return DEFAULT_RECIPE_PAGE_SIZE;
  }
  return Math.min(MAX_RECIPE_PAGE_SIZE, Math.max(1, Math.floor(limit)));
};

/** Prisma Json / 历史脏数据 → 去空白后的字符串数组。 */
const readStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return uniqueValues(
    value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter((item) => item.length > 0),
  );
};

interface RecipeHealthTagAssignmentRow {
  healthTag: { name: string } | null;
}

/** 健康标签：合并 targetHealthTags 与 assignments 的标签名并去重。 */
const readHealthTagNames = (
  assignments: readonly RecipeHealthTagAssignmentRow[] | undefined,
  targetHealthTags: unknown,
): string[] => {
  const assignmentNames = (assignments ?? [])
    .map((assignment) => assignment.healthTag?.name?.trim() ?? '')
    .filter((name) => name.length > 0);
  return uniqueValues([
    ...readStringArray(targetHealthTags),
    ...assignmentNames,
  ]);
};

interface PublishedRecipeItemRow {
  ingredientId: string | null;
  nutritionFoodId: string | null;
  exampleWeight: number | null;
  preparationMethod: string | null;
  preparationNote: string | null;
  ingredient: {
    name: string | null;
    type: string | null;
    properties: unknown;
  } | null;
  nutritionFood: {
    name: string;
    nameEn: string | null;
    displayNameZh: string | null;
    dataSource: string;
    category: string | null;
  } | null;
}

interface PublishedRecipeSummaryRow {
  id: string;
  recipeId: string;
  version: number;
  name: string;
  status: string;
  isCustomRecipe: boolean;
  applicableLifeStages: unknown;
  coverTitle: string | null;
  sellingPoint: string | null;
  targetHealthTags: unknown;
  updatedAt: Date;
  healthTagAssignments: RecipeHealthTagAssignmentRow[];
  items: PublishedRecipeItemRow[];
}

interface PublishedRecipeDetailRow extends PublishedRecipeSummaryRow {
  createdAt: Date;
  description: string | null;
  coverImageUrl: string | null;
  detailImages: unknown;
  videoUrl: string | null;
  energyDensityKcalPerKg: number;
  nutritionStandard: string;
  nutritionDetailedData: unknown;
  productionStepsJson: unknown;
  designSource: string | null;
  seriesId: string | null;
  seriesLifeStage: string | null;
}

interface DesignRecipeItemRow {
  ingredientId: string | null;
  nutritionFoodId: string | null;
  weightG: number;
  preparationMethod: string | null;
  preparationNote: string | null;
  ingredient: {
    name: string;
    type: string;
    properties: unknown;
  } | null;
  nutritionFood: {
    name: string;
    nameEn: string | null;
    displayNameZh: string | null;
    dataSource: string | null;
    category: string | null;
  } | null;
}

/**
 * 其他设计师的设计草稿只读行。
 *
 * 刻意不 select `customerDogId` / `createdBy` / `series`（series 上有参考犬），
 * 也不把 `orderDesign` 的 id 暴露给模型 —— 它只用于同一订单草稿的去重。
 */
interface DesignRecipeReadRow {
  id: string;
  name: string;
  version: number;
  status: string;
  applicableLifeStages: unknown;
  coverTitle: string | null;
  sellingPoint: string | null;
  targetHealthTags: unknown;
  description: string | null;
  coverImageUrl: string | null;
  detailImages: unknown;
  videoUrl: string | null;
  energyDensityKcalPerKg: number | null;
  nutritionStandard: string | null;
  nutritionDetailedData: unknown;
  productionStepsJson: unknown;
  seriesId: string | null;
  seriesLifeStage: string | null;
  createdAt: Date;
  updatedAt: Date;
  publishedRecipeId: string | null;
  orderDesign: { id: string } | null;
  items: DesignRecipeItemRow[];
}

const PUBLISHED_RECIPE_ITEM_SELECT = {
  ingredientId: true,
  nutritionFoodId: true,
  exampleWeight: true,
  preparationMethod: true,
  preparationNote: true,
  ingredient: {
    select: { name: true, type: true, properties: true },
  },
  nutritionFood: {
    select: {
      name: true,
      nameEn: true,
      displayNameZh: true,
      dataSource: true,
      category: true,
    },
  },
} as const;

const PUBLISHED_RECIPE_ITEMS_INCLUDE = {
  select: PUBLISHED_RECIPE_ITEM_SELECT,
  orderBy: [{ sortOrder: 'asc' as const }],
};

/** 搜索只需要菜名/原料/标签等轻字段，不拉营养报告和制作步骤。 */
const RECIPE_SEARCH_SELECT = {
  id: true,
  recipeId: true,
  version: true,
  name: true,
  status: true,
  isCustomRecipe: true,
  applicableLifeStages: true,
  coverTitle: true,
  sellingPoint: true,
  targetHealthTags: true,
  updatedAt: true,
  healthTagAssignments: {
    select: { healthTag: { select: { name: true } } },
  },
  items: PUBLISHED_RECIPE_ITEMS_INCLUDE,
} as const;

/** 详情在搜索字段基础上补文案、营养、制作步骤、图片与系列信息。 */
const RECIPE_DETAIL_SELECT = {
  ...RECIPE_SEARCH_SELECT,
  createdAt: true,
  description: true,
  coverImageUrl: true,
  detailImages: true,
  videoUrl: true,
  energyDensityKcalPerKg: true,
  nutritionStandard: true,
  nutritionDetailedData: true,
  productionStepsJson: true,
  designSource: true,
  seriesId: true,
  seriesLifeStage: true,
} as const;

const DESIGN_RECIPE_ITEM_SELECT = {
  ingredientId: true,
  nutritionFoodId: true,
  weightG: true,
  preparationMethod: true,
  preparationNote: true,
  ingredient: {
    select: { name: true, type: true, properties: true },
  },
  nutritionFood: {
    select: {
      name: true,
      nameEn: true,
      displayNameZh: true,
      dataSource: true,
      category: true,
    },
  },
} as const;

/** 设计草稿只读：不 select 客户/狗/订单字段，避免把 PII 带进模型上下文。 */
const DESIGN_RECIPE_ITEMS_ORDER = [{ sortOrder: 'asc' as const }];

const DESIGN_RECIPE_READ_SELECT = {
  id: true,
  name: true,
  version: true,
  status: true,
  applicableLifeStages: true,
  coverTitle: true,
  sellingPoint: true,
  targetHealthTags: true,
  description: true,
  coverImageUrl: true,
  detailImages: true,
  videoUrl: true,
  energyDensityKcalPerKg: true,
  nutritionStandard: true,
  nutritionDetailedData: true,
  productionStepsJson: true,
  seriesId: true,
  seriesLifeStage: true,
  createdAt: true,
  updatedAt: true,
  publishedRecipeId: true,
  orderDesign: { select: { id: true } },
  items: {
    select: DESIGN_RECIPE_ITEM_SELECT,
    orderBy: DESIGN_RECIPE_ITEMS_ORDER,
  },
} as const;

/**
 * 营养档案展示名需要的字段在 service/Prisma 的 include 里不一定有类型声明，
 * 这里统一补成 `NutritionFoodDisplayNameRecord` 的形状（缺 dataSource 用 UNKNOWN）。
 */
const toNutritionFoodDisplayRecord = (food: {
  name: string;
  nameEn?: string | null;
  displayNameZh?: string | null;
  dataSource?: string | null;
}): {
  name: string;
  nameEn: string | null;
  displayNameZh: string | null;
  dataSource: string;
} => ({
  name: food.name,
  nameEn: food.nameEn ?? null,
  displayNameZh: food.displayNameZh ?? null,
  dataSource: food.dataSource ?? 'UNKNOWN',
});

/** 一条已发布明细 → AgentRecipeItemRead（当前草稿与目录共用同一分类口径）。 */
const toPublishedRecipeItemRead = (
  item: PublishedRecipeItemRow,
): AgentRecipeItemRead => {
  const ingredient = item.ingredient ?? null;
  const nutritionFood = item.nutritionFood ?? null;
  const name =
    ingredient?.name ??
    nutritionFood?.displayNameZh ??
    nutritionFood?.name ??
    '';
  const ingredientType: 'FOOD' | 'SUPPLEMENT' =
    ingredient?.type === 'SUPPLEMENT' ? 'SUPPLEMENT' : 'FOOD';

  return {
    ingredientId: item.ingredientId ?? null,
    nutritionFoodId: item.nutritionFoodId ?? null,
    name,
    nutritionProfileName: nutritionFood
      ? resolveNutritionProfileDisplayName(
          ingredient?.name,
          toNutritionFoodDisplayRecord(nutritionFood),
        )
      : name,
    ingredientType,
    weightG: toFiniteNumber(item.exampleWeight) ?? 0,
    preparationMethod: item.preparationMethod ?? null,
    preparationNote: item.preparationNote ?? null,
    category: classifyFoodCategory({
      name,
      cfctClass: readCfctClass(ingredient?.properties),
      nutritionCategory: nutritionFood?.category ?? null,
      ingredientType,
    }),
  };
};

/** 其他设计师的设计草稿明细 → 同一只读形状（字段与已发布明细一致，只是克重列名不同）。 */
const toDesignRecipeItemRead = (
  item: DesignRecipeItemRow,
): AgentRecipeItemRead => {
  const ingredient = item.ingredient ?? null;
  const nutritionFood = item.nutritionFood ?? null;
  const name =
    ingredient?.name ??
    nutritionFood?.displayNameZh ??
    nutritionFood?.name ??
    '';
  const ingredientType: 'FOOD' | 'SUPPLEMENT' =
    ingredient?.type === 'SUPPLEMENT' ? 'SUPPLEMENT' : 'FOOD';

  return {
    ingredientId: item.ingredientId ?? null,
    nutritionFoodId: item.nutritionFoodId ?? null,
    name,
    nutritionProfileName: nutritionFood
      ? resolveNutritionProfileDisplayName(
          ingredient?.name,
          toNutritionFoodDisplayRecord(nutritionFood),
        )
      : name,
    ingredientType,
    weightG: toFiniteNumber(item.weightG) ?? 0,
    preparationMethod: item.preparationMethod ?? null,
    preparationNote: item.preparationNote ?? null,
    category: classifyFoodCategory({
      name,
      cfctClass: readCfctClass(ingredient?.properties),
      nutritionCategory: nutritionFood?.category ?? null,
      ingredientType,
    }),
  };
};

/** Recipe 行的只读来源：公开 / 定制 / 未公开的正式版本。 */
const resolveRecipeSource = (row: {
  status: string;
  isCustomRecipe: boolean;
}): AgentRecipeSummary['source'] =>
  row.isCustomRecipe || row.status === 'PRIVATE_CUSTOM'
    ? 'CUSTOM'
    : row.status === 'PUBLIC'
      ? 'PUBLISHED'
      : 'RECIPE_DRAFT';

/** 草稿明细 → 同一只读形状；不再额外查库。 */
const toDraftRecipeItemRead = (item: AgentDraftItem): AgentRecipeItemRead => ({
  ingredientId: item.ingredientId,
  nutritionFoodId: item.nutritionFoodId,
  name: item.name,
  nutritionProfileName: item.nutritionProfileName ?? item.name,
  ingredientType:
    item.ingredientType ??
    (item.category === 'SUPPLEMENT' ? 'SUPPLEMENT' : 'FOOD'),
  weightG: item.weightG,
  preparationMethod: item.preparationMethod,
  preparationNote: item.preparationNote,
  category: item.category,
});

const findMainProteinFromReadItems = (
  items: readonly AgentRecipeItemRead[],
): string | null =>
  findMainProteinName(
    items.map((item) => ({
      identity: { name: item.name, category: item.category },
      exampleWeight: item.weightG,
    })),
  );

interface RecipeFilterInput {
  search?: string;
  ingredientName?: string;
  lifeStage?: string;
}

/**
 * 搜索/筛选口径（对已发布和当前草稿完全相同）：
 * - search：菜名、原料名、营养档案名任一包含即命中；
 * - ingredientName：原料名或营养档案名包含；
 * - lifeStage：applicableLifeStages 精确匹配（大小写不敏感）。
 */
const matchesRecipeFilters = (
  input: RecipeFilterInput,
  recipe: {
    name: string;
    ingredientNames: string[];
    nutritionProfileNames: string[];
    applicableLifeStages: string[];
  },
): boolean => {
  const search = normalizeCatalogName(input.search ?? '');
  if (search) {
    const haystack = [
      recipe.name,
      ...recipe.ingredientNames,
      ...recipe.nutritionProfileNames,
    ]
      .map((value) => normalizeCatalogName(value))
      .join(' ');
    if (!haystack.includes(search)) return false;
  }

  const ingredientName = normalizeCatalogName(input.ingredientName ?? '');
  if (ingredientName) {
    const matched = [...recipe.ingredientNames, ...recipe.nutritionProfileNames]
      .map((value) => normalizeCatalogName(value))
      .some((value) => value.includes(ingredientName));
    if (!matched) return false;
  }

  const lifeStage = normalizeCatalogName(input.lifeStage ?? '');
  if (lifeStage) {
    const matched = recipe.applicableLifeStages
      .map((value) => normalizeCatalogName(value))
      .some((value) => value === lifeStage);
    if (!matched) return false;
  }

  return true;
};

/** Agent 草稿端口的真实实现；一个实例只服务一份草稿、一个调用者。 */
export class RecipeDesignerAgentAdapter implements RecipeAgentDraftPort {
  constructor(
    private readonly service: RecipeDesignerService,
    private readonly prisma: PrismaService,
    private readonly actor: RecipeAgentActor,
    private readonly draftId: string,
  ) {}

  /** 传给 `RecipeDesignerService` 的 access；类型跟 service 的入参保持一致。 */
  private get access(): Parameters<RecipeDesignerService['getDraft']>[1] {
    return {
      userId: this.actor.userId,
      role: this.actor.role,
      customerId: this.actor.customerId,
    };
  }

  // ---- 读方法：四个读方法都已接真实数据 ----

  async getDraft(draftId: string): Promise<AgentDraftSnapshot> {
    const [draft, productionSteps] = await Promise.all([
      this.service.getDraft(draftId, this.access),
      this.service.getDraftProductionSteps(draftId, this.access),
    ]);

    // 产品展示资料优先取系列（同一系列各生命阶段共用）；没有系列就回退草稿。
    const series = draft.seriesId
      ? await this.prisma.recipeSeries.findUnique({
          where: { id: draft.seriesId },
          select: {
            name: true,
            coverTitle: true,
            sellingPoint: true,
            targetHealthTags: true,
          },
        })
      : null;

    const items: AgentDraftItem[] = draft.items.map((item) => {
      // service 的本地类型没声明 category/status，但 Prisma include 里查了。
      const nutritionFood = item.nutritionFood as typeof item.nutritionFood & {
        category?: string | null;
      };
      const ingredient = item.ingredient ?? null;
      const name =
        ingredient?.name ?? nutritionFood.displayNameZh ?? nutritionFood.name;
      const cfctClass = readCfctClass(ingredient?.properties);
      const nutritionCategory = nutritionFood.category ?? null;

      return {
        id: item.id,
        ingredientId: item.ingredientId ?? null,
        nutritionFoodId: item.nutritionFoodId,
        name,
        nutritionProfileName: resolveNutritionProfileDisplayName(
          name,
          toNutritionFoodDisplayRecord(nutritionFood),
        ),
        ingredientType:
          ingredient?.type === 'SUPPLEMENT' ? 'SUPPLEMENT' : 'FOOD',
        cfctClass,
        nutritionCategory,
        category: classifyFoodCategory({
          name,
          cfctClass,
          nutritionCategory,
          ingredientType:
            ingredient?.type === 'SUPPLEMENT' ? 'SUPPLEMENT' : 'FOOD',
        }),
        weightG: item.weightG,
        ratioPercent: null,
        preparationMethod: item.preparationMethod ?? null,
        preparationNote: item.preparationNote ?? null,
      };
    });

    // 评估口径 = 参与评估的食品 + 按克计量的补剂。
    // 按粒/片等计数的补剂 weightG 不是食物质量，既不进总重也不进营养分母；
    // 补剂单位识别不了时营养摘要整体 fail closed（不能当成 0）。
    const assessedItems: ServiceDraft['items'] = [];
    let unknownSupplementUnit = false;
    for (const item of draft.items) {
      if (item.includeInAssessment === false) {
        continue;
      }
      if (item.ingredient?.type !== 'SUPPLEMENT') {
        assessedItems.push(item);
        continue;
      }
      const unitBasis = resolveSupplementUnitBasis(item.ingredient);
      if (unitBasis === 'GRAM') {
        assessedItems.push(item);
      } else if (unitBasis === 'UNKNOWN') {
        unknownSupplementUnit = true;
      }
    }
    const assessedItemIds = new Set(assessedItems.map((item) => item.id));

    // 总重与占比都从当前 items 现算，不信库里可能过期的 totalWeightG / ratioPercent。
    const totalWeightG = assessedItems.reduce(
      (sum, item) => sum + (Number.isFinite(item.weightG) ? item.weightG : 0),
      0,
    );
    const itemsWithRatios: AgentDraftItem[] = items.map((item) => ({
      ...item,
      ratioPercent:
        totalWeightG > 0 && assessedItemIds.has(item.id)
          ? roundTo1((item.weightG / totalWeightG) * 100)
          : null,
    }));

    const speciesScan = collectAnimalSpecies(
      itemsWithRatios.map((item) => ({
        name: item.name,
        category: item.category,
      })),
    );

    return {
      draftId,
      seriesId: draft.seriesId ?? null,
      // 设计上下文来自 service include 的 series；没有系列时一律 null。
      designMode: readDesignMode(draft.series?.designMode),
      orderId: draft.series?.orderId ?? null,
      orderQuantity: draft.series?.orderQuantity ?? null,
      name: series?.name ?? draft.name,
      scenario: draft.fediafDogScenario,
      contentRevision: draft.contentRevision,
      totalWeightG,
      items: itemsWithRatios,
      copy: {
        coverTitle: series?.coverTitle ?? draft.coverTitle ?? null,
        sellingPoint: series?.sellingPoint ?? draft.sellingPoint ?? null,
        description: draft.description ?? null,
        targetHealthTags:
          series?.targetHealthTags ?? draft.targetHealthTags ?? [],
      },
      productionSteps: toAgentProductionSteps(productionSteps?.productionSteps),
      lastAssessment: buildLastAssessment(draft),
      status: draft.status ?? 'DRAFT',
      applicableLifeStages: readStringArray(draft.applicableLifeStages),
      coverImageUrl: draft.coverImageUrl ?? null,
      detailImages: readStringArray(draft.detailImages),
      videoUrl: draft.videoUrl ?? null,
      energyDensityKcalPerKg: toFiniteNumber(draft.energyDensityKcalPerKg),
      nutritionStandard: draft.nutritionStandard ?? null,
      nutritionDetailedData: draft.nutritionReportJson ?? null,
      seriesLifeStage: draft.seriesLifeStage ?? null,
      createdAt: draft.createdAt ?? null,
      updatedAt: draft.updatedAt ?? null,
      nutritionSummary: unknownSupplementUnit
        ? { fatWetPercent: null, moisturePercent: null }
        : buildNutritionSummary(
            assessedItems,
            totalWeightG,
            draft.calculatedNutrition,
          ),
      animalSpecies: speciesScan.species,
      unknownAnimalProtein: speciesScan.unknownAnimalProtein,
    };
  }

  async searchIngredients(input: {
    search?: string;
    nutrientKey?: string;
    category?: FoodCategory;
    type?: 'FOOD' | 'SUPPLEMENT';
    limit?: number;
  }): Promise<AgentIngredientCandidate[]> {
    const scenario = input.nutrientKey
      ? (await this.service.getDraft(this.draftId, this.access))
          .fediafDogScenario
      : undefined;
    // 分类不是数据库字段，只能在本地过滤；必须先翻完整个候选集，
    // 否则某一类可能整类落在第 2 页之后（食材库 FOOD 约 118 条）。
    const options: IngredientOption[] = [];
    for (let page = 1; page <= MAX_SEARCH_PAGES; page += 1) {
      const pageResult = await this.service.listIngredientOptions({
        search: input.search,
        type: input.type,
        ...(input.nutrientKey
          ? { nutrientKey: input.nutrientKey, scenario }
          : {}),
        page,
        pageSize: MAX_SEARCH_LIMIT,
      });
      options.push(...(pageResult?.data ?? []));
      if (!pageResult?.hasMore) {
        break;
      }
    }

    // 只要有档案就返回；是否已验证由默认/主档案决定，不能因为默认档案
    // 未验证就丢掉同原料的熟制等其它档案。
    const picked: Array<{
      option: IngredientOption;
      profile: IngredientOptionProfile;
    }> = [];
    for (const option of options) {
      const profile = pickIngredientProfile(option);
      if (!profile) {
        continue;
      }
      picked.push({ option, profile });
    }

    const cfctClassById = await loadCfctClasses(
      this.prisma,
      picked.map(({ option }) => option.id),
    );
    const keyNutrientsByFoodId = await this.loadKeyNutrients(
      picked.map(({ profile }) => profile.nutritionFoodId),
    );

    const candidates = picked.map(({ option, profile }) => {
      const cfctClass = cfctClassById.get(option.id) ?? null;
      const nutritionCategory = profile.category ?? null;
      const type: 'FOOD' | 'SUPPLEMENT' =
        option.type === 'SUPPLEMENT' ? 'SUPPLEMENT' : 'FOOD';

      return {
        ingredientId: option.id,
        nutritionFoodId: profile.nutritionFoodId,
        name: option.name,
        nutritionProfileName: profile.name,
        type,
        cfctClass,
        nutritionCategory,
        verified: profile.status === 'VERIFIED',
        nutritionProfiles: (option.nutritionProfiles ?? []).map(
          toProfileSummary,
        ),
        keyNutrients:
          keyNutrientsByFoodId.get(profile.nutritionFoodId) ??
          emptyKeyNutrients(),
        nutrientMatch:
          (option as { nutrientMatch?: AgentIngredientCandidate['nutrientMatch'] })
            .nutrientMatch ?? null,
        category: classifyFoodCategory({
          name: option.name,
          cfctClass,
          nutritionCategory,
          ingredientType: type,
        }),
      };
    });

    const filtered = input.category
      ? candidates.filter((candidate) => candidate.category === input.category)
      : candidates;

    return filtered
      .slice(0, resolveSearchLimit(input.limit))
      .map((candidate) => ({
        ingredientId: candidate.ingredientId,
        nutritionFoodId: candidate.nutritionFoodId,
        name: candidate.name,
        nutritionProfileName: candidate.nutritionProfileName,
        type: candidate.type,
        cfctClass: candidate.cfctClass,
        nutritionCategory: candidate.nutritionCategory,
        verified: candidate.verified,
        nutritionProfiles: candidate.nutritionProfiles,
        keyNutrients: candidate.keyNutrients,
        nutrientMatch: candidate.nutrientMatch,
      }));
  }

  /**
   * 批量读候选的关键营养（每 100g）：蛋白、脂肪、钙、磷。
   *
   * 搜索阶段给模型一张可比较的表，避免它为了比一个数值就逐个查详情。
   * 任何一项取不到就是 null，不做猜测。
   */
  private async loadKeyNutrients(
    nutritionFoodIds: string[],
  ): Promise<Map<string, AgentIngredientKeyNutrients>> {
    const uniqueIds = [...new Set(nutritionFoodIds)];
    const result = new Map<string, AgentIngredientKeyNutrients>();
    if (uniqueIds.length === 0) {
      return result;
    }

    const rows = await this.prisma.nutritionFood.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, nutritionData: true },
    });

    for (const row of rows ?? []) {
      const profile = resolveNutritionProfile(row.nutritionData);
      result.set(row.id, buildKeyNutrients(profile));
    }
    return result;
  }

  async getIngredient(input: {
    nutritionFoodId?: string;
    ingredientId?: string;
  }): Promise<AgentIngredientDetail | null> {
    const nutritionFoodId = input.nutritionFoodId?.trim() || null;
    const ingredientId = input.ingredientId?.trim() || null;
    if (!nutritionFoodId && !ingredientId) {
      throw new RecipeAgentPortError(
        'INVALID_ARGUMENT',
        'nutritionFoodId 或 ingredientId 至少提供一个。',
      );
    }

    // 从原料侧读一次就拿到全部档案；按营养档案查时先定位到它所属的原料。
    const ingredient = await this.prisma.ingredient.findFirst({
      where: nutritionFoodId
        ? { nutritionFoodMappings: { some: { nutritionFoodId } } }
        : { id: ingredientId as string },
      select: {
        id: true,
        name: true,
        type: true,
        procurementStrategy: true,
        diyEnabled: true,
        procurementEnabled: true,
        brand: true,
        productModel: true,
        purchaseChannel: true,
        notes: true,
        baseUnit: true,
        unitDisplayLabel: true,
        nutritionProfile: true,
        purchaseUnit: true,
        purchaseToBaseRatio: true,
        currentPricePerPurchaseUnit: true,
        effectivePricePerPurchaseUnit: true,
        weightG: true,
        maxCapacityG: true,
        safetyStock: true,
        reorderPoint: true,
        targetStock: true,
        physicalForm: true,
        isOilBased: true,
        supplementRetailEnabled: true,
        shelfLifeMonths: true,
        storageCondition: true,
        openedShelfLifeDays: true,
        properties: true,
        createdAt: true,
        updatedAt: true,
        allergenTags: {
          select: { allergenTag: { select: { name: true } } },
        },
        tags: {
          select: {
            tag: {
              select: {
                id: true,
                name: true,
                description: true,
                parentId: true,
                sort: true,
                color: true,
              },
            },
          },
        },
        recommendedProducts: {
          select: {
            id: true,
            name: true,
            brand: true,
            productModel: true,
            purchaseChannel: true,
            purchaseLink: true,
            imageUrl: true,
            activeNutrients: true,
            displayUnit: true,
            isActive: true,
            sortOrder: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        nutritionFoodMappings: {
          select: {
            id: true,
            nutritionFoodId: true,
            yieldRate: true,
            isPrimary: true,
            notes: true,
            nutritionFood: {
              select: {
                id: true,
                name: true,
                nameEn: true,
                displayNameZh: true,
                category: true,
                dataSource: true,
                externalId: true,
                version: true,
                status: true,
                preparationState: true,
                preparationStateLabel: true,
                ediblePortionLabel: true,
                processingLabel: true,
                nutritionData: true,
                defaultSupplementTargets: true,
                notes: true,
                verifiedBy: true,
                verifiedAt: true,
                createdAt: true,
                updatedAt: true,
              },
            },
          },
        },
      },
    });

    // `get_ingredient` 只服务真实原料：没有采购原料映射的营养档案不算。
    const mappings = ingredient?.nutritionFoodMappings ?? [];
    if (!ingredient || mappings.length === 0) {
      return null;
    }

    // 传了 nutritionFoodId 就以它为准；否则主映射优先，再退第一条。
    const selectedMapping =
      (nutritionFoodId
        ? mappings.find(
            (mapping) => mapping.nutritionFoodId === nutritionFoodId,
          )
        : undefined) ??
      mappings.find((mapping) => mapping.isPrimary) ??
      mappings[0];
    const selectedFood = selectedMapping.nutritionFood;

    const nutritionProfiles: AgentIngredientNutritionProfile[] = [...mappings]
      .sort((left, right) => {
        if (left.isPrimary !== right.isPrimary) {
          return left.isPrimary ? -1 : 1;
        }
        return left.nutritionFoodId.localeCompare(right.nutritionFoodId);
      })
      .map((mapping) => {
        const food = mapping.nutritionFood;
        return {
          nutritionFoodId: food.id,
          mappingId: mapping.id,
          name: resolveNutritionProfileDisplayName(ingredient.name, food),
          displayNameZh: food.displayNameZh ?? null,
          status: food.status,
          category: food.category,
          dataSource: food.dataSource,
          externalId: food.externalId ?? null,
          version: food.version,
          preparationState: food.preparationState ?? null,
          preparationStateLabel: food.preparationStateLabel ?? null,
          ediblePortionLabel: food.ediblePortionLabel ?? null,
          processingLabel: food.processingLabel ?? null,
          nutritionData: food.nutritionData ?? null,
          defaultSupplementTargets: food.defaultSupplementTargets ?? null,
          notes: food.notes ?? null,
          verifiedBy: food.verifiedBy ?? null,
          verifiedAt: food.verifiedAt ?? null,
          createdAt: food.createdAt,
          updatedAt: food.updatedAt,
          isPrimary: mapping.isPrimary,
          verified: food.status === 'VERIFIED',
          yieldRate: mapping.yieldRate,
          mappingNotes: mapping.notes ?? null,
        };
      });

    const name = ingredient.name;
    const cfctClass = readCfctClass(ingredient.properties);
    const nutritionCategory = selectedFood.category ?? null;
    const type: 'FOOD' | 'SUPPLEMENT' =
      ingredient.type === 'SUPPLEMENT' ? 'SUPPLEMENT' : 'FOOD';
    const isSupplement = type === 'SUPPLEMENT';
    const tags: AgentIngredientTag[] = (ingredient.tags ?? []).map(
      ({ tag }) => ({
        id: tag.id,
        name: tag.name,
        description: tag.description,
        parentId: tag.parentId,
        sort: tag.sort,
        color: tag.color,
      }),
    );
    const recommendedProducts: AgentIngredientRecommendedProduct[] = (
      ingredient.recommendedProducts ?? []
    ).map((product) => ({ ...product }));

    return {
      ingredientId: ingredient.id,
      nutritionFoodId: selectedFood.id,
      name,
      nutritionProfileName: resolveNutritionProfileDisplayName(
        ingredient.name,
        selectedFood,
      ),
      type,
      baseUnit: ingredient.baseUnit,
      cfctClass,
      nutritionCategory,
      verified: selectedFood.status === 'VERIFIED',
      category: classifyFoodCategory({
        name,
        cfctClass,
        nutritionCategory,
        ingredientType: type,
      }),
      nutritionSummary: readNutritionSummary(
        selectedFood.nutritionData,
        isSupplement,
      ),
      ...(isSupplement
        ? {
            nutritionBasis: readNutritionBasis(
              selectedFood.nutritionData,
              ingredient.unitDisplayLabel ?? ingredient.purchaseUnit ?? null,
            ),
          }
        : {}),
      allergenNames: collectAllergenNames(ingredient.allergenTags),
      preparationMethods: [],
      pricePerPurchaseUnit: toPriceNumber(
        ingredient.currentPricePerPurchaseUnit,
      ),
      purchaseUnit: ingredient.purchaseUnit,
      unitDisplayLabel: ingredient.unitDisplayLabel ?? null,
      brand: ingredient.brand ?? null,
      productModel: ingredient.productModel ?? null,
      purchaseChannel: ingredient.purchaseChannel ?? null,
      notes: ingredient.notes ?? null,
      procurementStrategy: ingredient.procurementStrategy,
      diyEnabled: ingredient.diyEnabled,
      procurementEnabled: ingredient.procurementEnabled,
      nutritionProfile: ingredient.nutritionProfile ?? null,
      purchaseToBaseRatio: ingredient.purchaseToBaseRatio,
      currentPricePerPurchaseUnit: toPriceNumber(
        ingredient.currentPricePerPurchaseUnit,
      ),
      effectivePricePerPurchaseUnit: toPriceNumber(
        ingredient.effectivePricePerPurchaseUnit,
      ),
      weightG: ingredient.weightG ?? null,
      maxCapacityG: ingredient.maxCapacityG ?? null,
      safetyStock: ingredient.safetyStock ?? null,
      reorderPoint: ingredient.reorderPoint ?? null,
      targetStock: ingredient.targetStock ?? null,
      physicalForm: ingredient.physicalForm ?? null,
      isOilBased: ingredient.isOilBased,
      supplementRetailEnabled: ingredient.supplementRetailEnabled,
      shelfLifeMonths: ingredient.shelfLifeMonths ?? null,
      storageCondition: ingredient.storageCondition ?? null,
      openedShelfLifeDays: ingredient.openedShelfLifeDays ?? null,
      properties: ingredient.properties,
      tags,
      recommendedProducts,
      createdAt: ingredient.createdAt,
      updatedAt: ingredient.updatedAt,
      nutritionProfiles,
    };
  }

  async getCatalogUsage(input: {
    mainProteinName?: string;
    ingredientNames?: string[];
  }): Promise<AgentCatalogUsage> {
    const [draft, publishedRecipes] = await Promise.all([
      this.service.getDraft(this.draftId, this.access),
      // 只读已发布食谱；schema 的明细关系叫 items，单条克重字段是 exampleWeight。
      this.prisma.recipe.findMany({
        where: { status: 'PUBLIC' },
        select: {
          recipeId: true,
          version: true,
          name: true,
          items: {
            select: {
              ingredientId: true,
              exampleWeight: true,
              ingredient: {
                // `type` 决定补剂是否归 SUPPLEMENT；少查它会把补剂误判成 PROTEIN/ORGAN。
                select: { name: true, properties: true, type: true },
              },
              nutritionFood: {
                select: { name: true, displayNameZh: true, category: true },
              },
            },
          },
        },
      }),
    ]);

    // 同一道菜可能有多个 PUBLIC 版本（重新发布保留旧版本）；每个 recipeId 只取最高版本。
    const latestByRecipeId = new Map<
      string,
      (typeof publishedRecipes)[number]
    >();
    for (const recipe of publishedRecipes) {
      const latest = latestByRecipeId.get(recipe.recipeId);
      if (!latest || recipe.version > latest.version) {
        latestByRecipeId.set(recipe.recipeId, recipe);
      }
    }
    const catalogRecipes = [...latestByRecipeId.values()];

    const draftIdentities = draft.items.map((item) =>
      toCatalogItemIdentity(item),
    );
    const draftCategories = uniqueValues(
      draftIdentities.map((item) => item.category),
    );
    const targetMainProtein = normalizeCatalogName(input.mainProteinName ?? '');
    // 传了原料名就按名字过滤已发布菜；不传保持“分类交集或主蛋白相同”的原逻辑。
    const ingredientNameFilter = new Set(
      (input.ingredientNames ?? [])
        .map((name) => normalizeCatalogName(name))
        .filter((name) => name.length > 0),
    );

    let mainProteinCount = 0;
    const recipes: AgentCatalogUsageRecipe[] = [];

    for (const recipe of catalogRecipes) {
      const items = recipe.items.map((item) => ({
        identity: toCatalogItemIdentity(item),
        exampleWeight: item.exampleWeight,
      }));
      const recipeCategories = uniqueValues(
        items.map((item) => item.identity.category),
      );
      const mainProteinName = findMainProteinName(items);

      // 主蛋白比对：去空白 + 大小写不敏感。
      const mainProteinMatches =
        targetMainProtein.length > 0 &&
        mainProteinName !== null &&
        normalizeCatalogName(mainProteinName) === targetMainProtein;
      if (mainProteinMatches) {
        mainProteinCount += 1;
      }

      const overlappingCategories = draftCategories.filter((category) =>
        recipeCategories.includes(category),
      );

      if (ingredientNameFilter.size > 0) {
        const matchesIngredientFilter = items.some((item) =>
          ingredientNameFilter.has(normalizeCatalogName(item.identity.name)),
        );
        if (!matchesIngredientFilter) {
          continue;
        }
      } else if (overlappingCategories.length === 0 && !mainProteinMatches) {
        // 没传原料名时，只保留“分类有交集，或主蛋白相同”的菜。
        continue;
      }

      const recipeNameKeys = new Set(
        items
          .map((item) => normalizeCatalogName(item.identity.name))
          .filter((name) => name.length > 0),
      );
      const overlappingIngredientNames = uniqueValues(
        draftIdentities
          .filter((item) => {
            const key = normalizeCatalogName(item.name);
            return key.length > 0 && recipeNameKeys.has(key);
          })
          .map((item) => item.name),
      );

      recipes.push({
        recipeId: recipe.recipeId,
        name: recipe.name,
        mainProteinName,
        overlappingCategories,
        overlappingIngredientNames,
      });
    }

    return {
      totalPublishedRecipes: catalogRecipes.length,
      mainProteinCount,
      recipes,
    };
  }

  // ---- 只读食谱库：全部正式食谱 + 全部设计草稿 + 当前草稿 ----

  /**
   * 只读搜索全部食谱。
   *
   * - Recipe 行不再按 PUBLIC / 非定制过滤：公开、定制、未公开正式版本都可命中；
   * - 同一 recipeId 只返回最高版本（旧版本不单独列出）；
   * - 其他设计师的设计草稿（DesignRecipe，未归档）也纳入；当前草稿单独提供；
   * - 设计草稿按「订单 / 系列+生命阶段 / 单条」去重，已发布草稿由 Recipe 行代表；
   * - 结果绝不返回客户 / 订单 / 狗狗 / 主人字段。分页返回。
   */
  async searchRecipes(input: {
    search?: string;
    ingredientName?: string;
    lifeStage?: string;
    page: number;
    limit: number;
  }): Promise<AgentRecipeSearchPage> {
    const page = resolveRecipePage(input.page);
    const pageSize = resolveRecipePageSize(input.limit);
    const filters: RecipeFilterInput = {};
    const search = input.search?.trim();
    const ingredientName = input.ingredientName?.trim();
    const lifeStage = input.lifeStage?.trim();
    if (search) filters.search = search;
    if (ingredientName) filters.ingredientName = ingredientName;
    if (lifeStage) filters.lifeStage = lifeStage;

    const [rows, designRows, draft] = await Promise.all([
      this.prisma.recipe.findMany({
        // Postgres 侧先按 recipeId 去重（ORDER BY recipe_id, version DESC）；
        // 下面的 Map 再做一次兜底去重，兼容测试替身与未来换端口。
        distinct: ['recipeId'],
        orderBy: [{ recipeId: 'asc' }, { version: 'desc' }],
        select: RECIPE_SEARCH_SELECT,
      }),
      this.prisma.designRecipe.findMany({
        where: {
          status: { not: DesignRecipeStatus.ARCHIVED },
          id: { not: this.draftId },
        },
        orderBy: { updatedAt: 'desc' },
        select: DESIGN_RECIPE_READ_SELECT,
      }),
      this.getDraft(this.draftId),
    ]);

    const latestByRecipeId = new Map<string, PublishedRecipeSummaryRow>();
    for (const row of rows as unknown as PublishedRecipeSummaryRow[]) {
      const latest = latestByRecipeId.get(row.recipeId);
      if (!latest || row.version > latest.version) {
        latestByRecipeId.set(row.recipeId, row);
      }
    }

    const summaries: AgentRecipeSummary[] = [];
    for (const row of latestByRecipeId.values()) {
      const items = row.items.map(toPublishedRecipeItemRead);
      const summary = this.toPublishedRecipeSummary(row, items);
      if (
        matchesRecipeFilters(filters, {
          name: summary.name,
          ingredientNames: summary.ingredientNames,
          nutritionProfileNames: items.map((item) => item.nutritionProfileName),
          applicableLifeStages: summary.applicableLifeStages,
        })
      ) {
        summaries.push(summary);
      }
    }

    // 设计草稿：同一订单 / 同一系列同一生命阶段只保留最近更新的一份；
    // 已经发布过的草稿由 Recipe 行代表，避免同一道菜出现两次。
    const latestDesignByKey = new Map<string, DesignRecipeReadRow>();
    for (const row of designRows as unknown as DesignRecipeReadRow[]) {
      if (row.id === this.draftId) continue;
      // 只有「已经发布且没有后续修改」的草稿才由 Recipe 行代表；
      // 发布后的未发布修订版（status 仍是 DRAFT）必须保留，否则会漏掉最新改动。
      if (
        row.status === DesignRecipeStatus.PUBLISHED &&
        row.publishedRecipeId
      ) {
        continue;
      }
      const key = row.orderDesign?.id
        ? `order:${row.orderDesign.id}`
        : row.seriesId && row.seriesLifeStage
          ? `series:${row.seriesId}:${row.seriesLifeStage}`
          : `draft:${row.id}`;
      if (!latestDesignByKey.has(key)) {
        latestDesignByKey.set(key, row);
      }
    }

    for (const row of latestDesignByKey.values()) {
      const items = row.items.map(toDesignRecipeItemRead);
      const summary = this.toDesignRecipeSummary(row, items);
      if (
        matchesRecipeFilters(filters, {
          name: summary.name,
          ingredientNames: summary.ingredientNames,
          nutritionProfileNames: items.map((item) => item.nutritionProfileName),
          applicableLifeStages: summary.applicableLifeStages,
        })
      ) {
        summaries.push(summary);
      }
    }

    const draftItems = draft.items.map(toDraftRecipeItemRead);
    const draftSummary = this.toDraftRecipeSummary(draft, draftItems);
    if (
      matchesRecipeFilters(filters, {
        name: draftSummary.name,
        ingredientNames: draftSummary.ingredientNames,
        nutritionProfileNames: draftItems.map(
          (item) => item.nutritionProfileName,
        ),
        applicableLifeStages: draftSummary.applicableLifeStages,
      })
    ) {
      summaries.push(draftSummary);
    }

    // 最近更新的排前面；同时间按名字稳定排序，保证分页结果可重复。
    summaries.sort(
      (left, right) =>
        right.updatedAt.getTime() - left.updatedAt.getTime() ||
        left.name.localeCompare(right.name),
    );

    const total = summaries.length;
    const start = (page - 1) * pageSize;
    const data = summaries.slice(start, start + pageSize);
    return {
      data,
      page,
      pageSize,
      total,
      hasMore: start + data.length < total,
    };
  }

  /**
   * 只读一道食谱 / 草稿的完整详情。
   *
   * - `draftId` 优先：当前草稿走 service 快照；其他设计草稿直接按只读字段查，
   *   不加载客户 / 订单 / 狗信息；
   * - `recipeId`：任意 Recipe 行（公开 / 定制 / 未公开正式版本），取最高版本；
   * - 找不到 / 草稿已归档返回 null，由工具层转 `RECIPE_NOT_FOUND`。
   */
  async getRecipeDetail(input: {
    recipeId?: string;
    draftId?: string;
  }): Promise<AgentRecipeDetail | null> {
    const recipeId = input.recipeId?.trim() ?? '';
    const draftId = input.draftId?.trim() ?? '';
    if (!recipeId && !draftId) {
      throw new RecipeAgentPortError(
        'INVALID_ARGUMENT',
        'recipeId 或 draftId 至少提供一个。',
      );
    }

    if (draftId) {
      if (draftId === this.draftId) {
        return this.toDraftRecipeDetail(await this.getDraft(this.draftId));
      }
      const row = (await this.prisma.designRecipe.findFirst({
        where: {
          id: draftId,
          status: { not: DesignRecipeStatus.ARCHIVED },
        },
        select: DESIGN_RECIPE_READ_SELECT,
      })) as unknown as DesignRecipeReadRow | null;
      if (!row) return null;
      const items = row.items.map(toDesignRecipeItemRead);
      return this.toDesignRecipeDetail(row, items);
    }

    const byId = await this.prisma.recipe.findFirst({
      where: { id: recipeId },
      select: { recipeId: true },
    });
    const logicalRecipeId = byId?.recipeId ?? recipeId;
    const row = (await this.prisma.recipe.findFirst({
      where: { recipeId: logicalRecipeId },
      orderBy: { version: 'desc' },
      select: RECIPE_DETAIL_SELECT,
    })) as unknown as PublishedRecipeDetailRow | null;

    if (!row) return null;
    const items = row.items.map(toPublishedRecipeItemRead);
    return this.toPublishedRecipeDetail(row, items);
  }

  private toPublishedRecipeSummary(
    row: PublishedRecipeSummaryRow,
    items: AgentRecipeItemRead[],
  ): AgentRecipeSummary {
    return {
      source: resolveRecipeSource(row),
      id: row.id,
      recipeId: row.recipeId,
      version: row.version,
      name: row.name,
      status: row.status,
      applicableLifeStages: readStringArray(row.applicableLifeStages),
      coverTitle: row.coverTitle ?? null,
      sellingPoint: row.sellingPoint ?? null,
      targetHealthTags: readHealthTagNames(
        row.healthTagAssignments,
        row.targetHealthTags,
      ),
      ingredientNames: uniqueValues(
        items.map((item) => item.name).filter((name) => name.length > 0),
      ),
      mainProteinName: findMainProteinFromReadItems(items),
      updatedAt: row.updatedAt,
    };
  }

  private toPublishedRecipeDetail(
    row: PublishedRecipeDetailRow,
    items: AgentRecipeItemRead[],
  ): AgentRecipeDetail {
    return {
      ...this.toPublishedRecipeSummary(row, items),
      description: row.description ?? null,
      coverImageUrl: row.coverImageUrl ?? null,
      detailImages: readStringArray(row.detailImages),
      videoUrl: row.videoUrl ?? null,
      energyDensityKcalPerKg: toFiniteNumber(row.energyDensityKcalPerKg),
      nutritionStandard: row.nutritionStandard ?? null,
      nutritionDetailedData: row.nutritionDetailedData ?? null,
      productionSteps: toAgentProductionSteps(
        readProductionSteps(row.productionStepsJson),
      ),
      items,
      seriesId: row.seriesId ?? null,
      seriesLifeStage: row.seriesLifeStage ?? null,
      designSource: row.designSource ?? null,
      createdAt: row.createdAt,
    };
  }

  private toDraftRecipeSummary(
    draft: AgentDraftSnapshot,
    items: AgentRecipeItemRead[],
  ): AgentRecipeSummary {
    return {
      source: 'CURRENT_DRAFT',
      id: draft.draftId,
      recipeId: null,
      version: null,
      name: draft.name,
      status: draft.status ?? 'DRAFT',
      applicableLifeStages: draft.applicableLifeStages ?? [],
      coverTitle: draft.copy.coverTitle,
      sellingPoint: draft.copy.sellingPoint,
      targetHealthTags: readStringArray(draft.copy.targetHealthTags),
      ingredientNames: uniqueValues(
        items.map((item) => item.name).filter((name) => name.length > 0),
      ),
      mainProteinName: findMainProteinFromReadItems(items),
      updatedAt: draft.updatedAt ?? draft.createdAt ?? new Date(0),
    };
  }

  private toDraftRecipeDetail(draft: AgentDraftSnapshot): AgentRecipeDetail {
    const items = draft.items.map(toDraftRecipeItemRead);
    return {
      ...this.toDraftRecipeSummary(draft, items),
      description: draft.copy.description,
      coverImageUrl: draft.coverImageUrl ?? null,
      detailImages: draft.detailImages ?? [],
      videoUrl: draft.videoUrl ?? null,
      energyDensityKcalPerKg: draft.energyDensityKcalPerKg ?? null,
      nutritionStandard: draft.nutritionStandard ?? null,
      nutritionDetailedData: draft.nutritionDetailedData ?? null,
      productionSteps: draft.productionSteps,
      items,
      seriesId: draft.seriesId,
      seriesLifeStage: draft.seriesLifeStage ?? null,
      designSource: null,
      createdAt: draft.createdAt ?? new Date(0),
    };
  }

  private toDesignRecipeSummary(
    row: DesignRecipeReadRow,
    items: AgentRecipeItemRead[],
  ): AgentRecipeSummary {
    return {
      source: 'DESIGN_DRAFT',
      id: row.id,
      recipeId: null,
      version: row.version,
      name: row.name,
      status: row.status,
      applicableLifeStages: readStringArray(row.applicableLifeStages),
      coverTitle: row.coverTitle ?? null,
      sellingPoint: row.sellingPoint ?? null,
      targetHealthTags: readStringArray(row.targetHealthTags),
      ingredientNames: uniqueValues(
        items.map((item) => item.name).filter((name) => name.length > 0),
      ),
      mainProteinName: findMainProteinFromReadItems(items),
      updatedAt: row.updatedAt,
    };
  }

  private toDesignRecipeDetail(
    row: DesignRecipeReadRow,
    items: AgentRecipeItemRead[],
  ): AgentRecipeDetail {
    return {
      ...this.toDesignRecipeSummary(row, items),
      description: row.description ?? null,
      coverImageUrl: row.coverImageUrl ?? null,
      detailImages: readStringArray(row.detailImages),
      videoUrl: row.videoUrl ?? null,
      energyDensityKcalPerKg: toFiniteNumber(row.energyDensityKcalPerKg),
      nutritionStandard: row.nutritionStandard ?? null,
      nutritionDetailedData: row.nutritionDetailedData ?? null,
      productionSteps: toAgentProductionSteps(
        readProductionSteps(row.productionStepsJson),
      ),
      items,
      seriesId: row.seriesId ?? null,
      seriesLifeStage: row.seriesLifeStage ?? null,
      designSource: null,
      createdAt: row.createdAt,
    };
  }

  // ---- 写方法：只做前置校验，落库与 contentRevision 交给 service ----

  /**
   * 适配器只允许写绑定的这一份草稿。
   *
   * 运行时会绕过 TypeScript 类型，模型也可能传错 id，必须在查库前拦住。
   */
  private assertDraft(draftId: string): void {
    if (draftId !== this.draftId) {
      throw new RecipeAgentPortError(
        'INVALID_ARGUMENT',
        '只能修改当前这一份草稿',
      );
    }
  }

  /**
   * 解析可写的营养档案：必须存在、已验证、且有采购原料映射。
   *
   * 返回真实 `ingredientId`，否则 service 跳过了补剂目标解析；
   * 主映射优先，没有主映射取第一条（与 `get_ingredient` 同一口径）。
   */
  private async resolveWritableNutritionFood(
    nutritionFoodId: string,
  ): Promise<WritableNutritionFood> {
    const nutritionFood = await this.prisma.nutritionFood.findUnique({
      where: { id: nutritionFoodId },
      select: {
        id: true,
        status: true,
        category: true,
        nutritionData: true,
        mappings: {
          select: {
            ingredientId: true,
            isPrimary: true,
            ingredient: {
              select: {
                id: true,
                type: true,
                baseUnit: true,
                unitDisplayLabel: true,
              },
            },
          },
        },
      },
    });

    if (!nutritionFood) {
      throw new RecipeAgentPortError(
        'INGREDIENT_NOT_FOUND',
        '原料档案不存在，请重新搜索原料',
      );
    }
    if (nutritionFood.status !== 'VERIFIED') {
      throw new RecipeAgentPortError(
        'INVALID_ARGUMENT',
        '原料档案未验证，不能加入配方',
      );
    }

    const mappings = nutritionFood.mappings ?? [];
    if (mappings.length === 0) {
      throw new RecipeAgentPortError(
        'INVALID_ARGUMENT',
        '原料没有可用的营养档案映射',
      );
    }
    const mapping =
      mappings.find((candidate) => candidate.isPrimary) ?? mappings[0];
    const type: 'FOOD' | 'SUPPLEMENT' =
      mapping.ingredient?.type === 'SUPPLEMENT' ? 'SUPPLEMENT' : 'FOOD';
    const baseUnit = mapping.ingredient?.baseUnit ?? 'G';
    const usageUnit = mapping.ingredient?.unitDisplayLabel ?? null;
    const basis = readNutritionBasis(nutritionFood.nutritionData, usageUnit);

    if (type === 'SUPPLEMENT') {
      assertSupplementUnitMatches(
        nutritionFood.id,
        baseUnit,
        basis.basisType,
        basis.servingWeightG,
      );
    }

    return {
      ingredientId: mapping.ingredient?.id ?? mapping.ingredientId,
      type,
      baseUnit,
      usageUnit,
      basisType: basis.basisType,
      servingWeightG: basis.servingWeightG,
    };
  }

  /** 同一草稿里同一营养档案只能出现一次；替换时排除被替换的那条。 */
  private async assertNotDuplicate(
    draftId: string,
    nutritionFoodId: string,
    excludeItemId?: string,
  ): Promise<void> {
    const duplicate = await this.prisma.designRecipeItem.findFirst({
      where: {
        designRecipeId: draftId,
        nutritionFoodId,
        ...(excludeItemId ? { id: { not: excludeItemId } } : {}),
      },
    });
    if (duplicate) {
      throw new RecipeAgentPortError(
        'INVALID_ARGUMENT',
        '这个原料已经在配方里',
      );
    }
  }

  /**
   * `updateItem` / `removeItem` / `replaceItem` 只收 itemId，service 不校验归属，
   * 这里必须先确认这条明细属于当前草稿。
   */
  private async assertItemInDraft(itemId: string): Promise<void> {
    const item = await this.prisma.designRecipeItem.findUnique({
      where: { id: itemId },
      select: { designRecipeId: true },
    });
    if (!item || item.designRecipeId !== this.draftId) {
      throw new RecipeAgentPortError('INVALID_ARGUMENT', '原料不在当前草稿里');
    }
  }

  /**
   * service 的写入结果 → Agent 可读明细。
   *
   * 写方法只回一条明细，没有整份草稿的占比分母，所以 `ratioPercent` 置 null；
   * 下次 `getDraft` 会按当前 items 现算。
   */
  private toAgentItem(item: ServiceWrittenItem): AgentDraftItem {
    const nutritionFood = item.nutritionFood as typeof item.nutritionFood & {
      category?: string | null;
    };
    const ingredient = item.ingredient ?? null;
    const name =
      ingredient?.name ?? nutritionFood.displayNameZh ?? nutritionFood.name;
    const cfctClass = readCfctClass(ingredient?.properties);
    const nutritionCategory = nutritionFood.category ?? null;

    return {
      id: item.id,
      ingredientId: item.ingredientId ?? null,
      nutritionFoodId: item.nutritionFoodId,
      name,
      cfctClass,
      nutritionCategory,
      category: classifyFoodCategory({
        name,
        cfctClass,
        nutritionCategory,
        ingredientType:
          ingredient?.type === 'SUPPLEMENT' ? 'SUPPLEMENT' : 'FOOD',
      }),
      weightG: item.weightG,
      ratioPercent: null,
      preparationMethod: item.preparationMethod ?? null,
      preparationNote: item.preparationNote ?? null,
    };
  }

  async addItem(
    draftId: string,
    input: {
      nutritionFoodId: string;
      ingredientId?: string;
      weightG: number;
      preparationMethod?: string;
    },
  ): Promise<AgentDraftItem> {
    this.assertDraft(draftId);
    const writable = await this.resolveWritableNutritionFood(
      input.nutritionFoodId,
    );
    assertSupplementAmountPrecision(
      writable.type,
      writable.baseUnit,
      input.weightG,
    );
    const { ingredientId } = writable;
    await this.assertNotDuplicate(draftId, input.nutritionFoodId);

    const item = await this.service.addItem(
      draftId,
      {
        nutritionFoodId: input.nutritionFoodId,
        ingredientId,
        weightG: input.weightG,
        ...(input.preparationMethod
          ? { preparationMethod: input.preparationMethod }
          : {}),
      },
      this.access,
    );

    return this.toAgentItem(item);
  }

  async replaceItem(
    itemId: string,
    input: {
      nutritionFoodId: string;
      ingredientId?: string;
      weightG: number;
    },
  ): Promise<AgentDraftItem> {
    await this.assertItemInDraft(itemId);
    const writable = await this.resolveWritableNutritionFood(
      input.nutritionFoodId,
    );
    assertSupplementAmountPrecision(
      writable.type,
      writable.baseUnit,
      input.weightG,
    );
    const { ingredientId } = writable;
    await this.assertNotDuplicate(this.draftId, input.nutritionFoodId, itemId);

    const item = await this.service.replaceItem(
      itemId,
      {
        nutritionFoodId: input.nutritionFoodId,
        ingredientId,
        ...(input.weightG ? { weightG: input.weightG } : {}),
      },
      this.access,
    );

    return this.toAgentItem(item);
  }

  async updateWeight(itemId: string, weightG: number): Promise<AgentDraftItem> {
    const itemForUnits = await this.prisma.designRecipeItem.findUnique({
      where: { id: itemId },
      select: {
        designRecipeId: true,
        ingredient: { select: { type: true, baseUnit: true } },
      },
    });
    if (!itemForUnits || itemForUnits.designRecipeId !== this.draftId) {
      throw new RecipeAgentPortError('INVALID_ARGUMENT', '原料不在当前草稿里');
    }
    assertSupplementAmountPrecision(
      itemForUnits.ingredient?.type === 'SUPPLEMENT' ? 'SUPPLEMENT' : 'FOOD',
      itemForUnits.ingredient?.baseUnit ?? 'G',
      weightG,
    );

    const item = await this.service.updateItem(
      itemId,
      { weightG },
      this.access,
    );

    return this.toAgentItem(item);
  }

  async removeItem(itemId: string): Promise<void> {
    await this.assertItemInDraft(itemId);
    await this.service.removeItem(itemId, this.access);
  }

  async setPreparation(
    itemId: string,
    input: { method: string; note?: string | null },
  ): Promise<AgentDraftItem> {
    await this.assertItemInDraft(itemId);

    const patch: {
      preparationMethod: string;
      preparationNote?: string | null;
      preparationSource: 'MANUAL';
    } = {
      preparationMethod: input.method,
      preparationSource: 'MANUAL',
    };
    // 只有显式传了 note 才写；省略表示“保留原备注”，不能静默清空。
    if (input.note !== undefined) {
      patch.preparationNote = input.note;
    }

    const item = await this.service.updateItem(itemId, patch, this.access);

    return this.toAgentItem(item);
  }

  /**
   * 文案路由（P0b-2b Task 3）：
   * - 有系列：`name` → `renameSeries`（系列已发布时禁止 AI 改名），
   *   `coverTitle/sellingPoint/targetHealthTags` → 系列发布设置；
   * - 无系列：`name/targetHealthTags` → 草稿本身；
   * - `coverTitle/sellingPoint/description` 始终同步草稿展示字段，
   *   保证后台详情可见（系列值仍由 `getDraft` 优先读取）。
   */
  async setCopy(draftId: string, patch: AgentCopyPatch): Promise<void> {
    this.assertDraft(draftId);
    const draft = await this.service.getDraft(draftId, this.access);
    const seriesId = draft.seriesId ?? null;

    if (patch.name !== undefined) {
      if (seriesId) {
        // 改名会重写 recipe 表与历史版本，已发布系列只能人工确认。
        const publishedCount = await this.prisma.recipe.count({
          where: { seriesId, status: 'PUBLIC' },
        });
        if (publishedCount > 0) {
          throw new RecipeAgentPortError(
            'INVALID_ARGUMENT',
            '系列已有已发布食谱，改名需要人工确认',
          );
        }
        await this.service.renameSeries(
          seriesId,
          { name: patch.name },
          this.access,
        );
      } else {
        await this.service.updateDraft(
          draftId,
          { name: patch.name },
          this.access,
        );
      }
    }

    if (seriesId) {
      const releaseSettings = {
        ...(patch.coverTitle !== undefined
          ? { coverTitle: patch.coverTitle }
          : {}),
        ...(patch.sellingPoint !== undefined
          ? { sellingPoint: patch.sellingPoint }
          : {}),
        ...(patch.targetHealthTags !== undefined
          ? { targetHealthTags: patch.targetHealthTags }
          : {}),
      };
      if (Object.keys(releaseSettings).length > 0) {
        await this.service.updateSeriesReleaseSettings(
          seriesId,
          releaseSettings,
          this.access,
        );
      }
    } else if (patch.targetHealthTags !== undefined) {
      await this.service.updateDraft(
        draftId,
        { targetHealthTags: patch.targetHealthTags },
        this.access,
      );
    }

    const presentation = {
      ...(patch.coverTitle !== undefined
        ? { coverTitle: patch.coverTitle }
        : {}),
      ...(patch.sellingPoint !== undefined
        ? { sellingPoint: patch.sellingPoint }
        : {}),
      ...(patch.description !== undefined
        ? { description: patch.description }
        : {}),
    };
    if (Object.keys(presentation).length > 0) {
      await this.service.updateDraftPresentation(
        draftId,
        presentation,
        this.access,
      );
    }
  }

  /**
   * 写结构化步骤：展示字符串先转数字，`sortOrder` 按数组顺序 1..n 重排。
   *
   * 任何一条格式/范围不合法都在调用 service 前抛 `INVALID_ARGUMENT`，
   * 保证不会只写一半或把 `NaN` 落库。
   */
  async setProductionSteps(
    draftId: string,
    steps: AgentProductionStep[],
  ): Promise<void> {
    this.assertDraft(draftId);

    const parsed = steps.map((step, index) => {
      const instruction =
        typeof step.instruction === 'string' ? step.instruction.trim() : '';
      if (!instruction) {
        throw new RecipeAgentPortError(
          'INVALID_ARGUMENT',
          `第 ${index + 1} 步缺少操作说明`,
        );
      }

      const durationMinutes = parseStepDurationMinutes(step.duration);
      const temperatureC = parseStepTemperatureC(step.temperature);
      const equipment =
        typeof step.equipment === 'string' ? step.equipment.trim() : '';

      return {
        sortOrder: index + 1,
        instruction,
        ...(durationMinutes !== undefined ? { durationMinutes } : {}),
        ...(temperatureC !== undefined ? { temperatureC } : {}),
        ...(equipment ? { equipment } : {}),
      };
    });

    await this.service.updateDraftProductionSteps(
      draftId,
      { steps: parsed },
      this.access,
    );
  }

  /**
   * 在当前内容版本上跑现有评估引擎（P0b-2b Task 4）。
   *
   * `assessDraftForAgent` 用 `updateMany({ where: { contentRevision } })` 原子写回：
   * 评估期间草稿被改会返回 409，必须让模型重跑，不能把旧结果当成新鲜结果。
   * 已发布 / 空草稿等 400、草稿不存在等 404 是业务校验失败，统一转成
   * `INVALID_ARGUMENT` 交给模型改参数或问人；其余异常（DB 等）原样抛出。
   */
  async runAssessment(draftId: string): Promise<AgentAssessmentView> {
    this.assertDraft(draftId);

    try {
      const { contentRevision, assessment } =
        await this.service.assessDraftForAgent(draftId, this.access);

      const entries: AgentAssessmentEntry[] = assessment.groupedEntries.map(
        (entry) => ({
          key: entry.nutrientKey,
          label: entry.label,
          status: entry.status,
          value: entry.currentValue,
          min: entry.minValue,
          max: entry.maxValue,
          marginPercent: null,
          unit: entry.unit,
          basis: entry.expressionBasis,
        }),
      );

      return {
        contentRevision,
        compliant: entries.filter((entry) => entry.status === 'COMPLIANT')
          .length,
        deficient: entries.filter((entry) => entry.status === 'DEFICIENT')
          .length,
        excess: entries.filter((entry) => entry.status === 'EXCESS').length,
        missingData: entries.filter((entry) => entry.status === 'MISSING_DATA')
          .length,
        entries,
        basis: 'PER_1000_KCAL',
        totalEnergyKcal: assessment.totalEnergyKcal,
        energyDensityKcalPerKg: assessment.energyDensityKcalPerKg,
        totalWeightG: assessment.totalWeightG,
      };
    } catch (error) {
      if (error instanceof ConflictException) {
        throw new RecipeAgentPortError(
          'ASSESSMENT_STALE',
          '草稿在评估期间被修改，请重新评估',
        );
      }
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw new RecipeAgentPortError('INVALID_ARGUMENT', error.message);
      }
      throw error;
    }
  }
}
