/**
 * `Recipe Agent` 的真实草稿端口（P0b-2a）。
 *
 * 每次运行绑定一份草稿（`draftId`）和当前员工身份（`actor`）：
 * - 读方法走现有 `RecipeDesignerService` + 只读 Prisma（`getDraft` /
 *   `searchIngredients` / `getIngredient` 已接真实数据，`getCatalogUsage` 在 Task 4 实现）；
 * - 写方法必须在 P0b-2b 通过 `RecipeDesignerService` 落库（它负责
 *   `contentRevision` 与事务），本任务先统一抛错。
 *
 * 身份直接复用 `RecipeDesignerService.getDraft` 的第二个参数类型，
 * 避免依赖 service 里未导出的 `RecipeDesignerAccessInput`。
 */
import { normalizeNutritionProfile } from '../../../domain/ingredient/nutrition-profile.utils';
import type { NutritionProfile } from '../../../domain/ingredient/types';
import {
  classifyFoodCategory,
  type FoodCategory,
} from '../../../domain/recipe-designer/food-category-map';
import { readProfileFieldAmount } from '../../../domain/recipe-designer/nutrition-profile-reader';
import type { ProductionStep } from '../../../domain/recipe-designer/production-steps';
import type { PrismaService } from '../../../infrastructure/prisma.service';
import { nutritionDataToNutritionProfile } from '../../nutrition-standard/nutrient-value-resolver';
import type { RecipeDesignerService } from '../recipe-designer.service';
import type {
  AgentAssessmentEntry,
  AgentAssessmentView,
  AgentCatalogUsage,
  AgentCopyPatch,
  AgentDraftItem,
  AgentDraftSnapshot,
  AgentIngredientCandidate,
  AgentIngredientDetail,
  AgentProductionStep,
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

const ASSESSMENT_STATUSES: ReadonlySet<AgentAssessmentEntry['status']> =
  new Set(['COMPLIANT', 'DEFICIENT', 'EXCESS', 'MISSING_DATA', 'INFO']);

/**
 * 物种词表；`火鸡` 必须排在 `鸡` 前面，否则会被拆成两个物种。
 * 只用于“单一动物蛋白”标签判断，命中即止。
 */
const ANIMAL_SPECIES_KEYWORDS = [
  '火鸡',
  '鸡',
  '鸭',
  '鹅',
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
 * 湿基脂肪 / 水分百分比：优先从当前 items 的 `nutritionFood.nutritionData` 现算，
 * 只有所有参与评估的 item 都没有营养档案时，才回退到 `calculatedNutrition`。
 */
const buildNutritionSummary = (
  items: ServiceDraft['items'],
  totalWeightG: number,
  calculatedNutrition: unknown,
): NutritionSummary => {
  if (totalWeightG <= 0) {
    return { fatWetPercent: null, moisturePercent: null };
  }

  const includedItems = items.filter(
    (item) => item.includeInAssessment !== false,
  );
  const profiles = includedItems.map((item) =>
    resolveNutritionProfile(item.nutritionFood?.nutritionData),
  );

  if (profiles.every((profile) => profile === null)) {
    return buildNutritionSummaryFromCalculated(
      calculatedNutrition,
      totalWeightG,
    );
  }

  const moistureG = sumProfileAmount(
    includedItems,
    profiles,
    'macros.moisture',
  );
  const crudeFatG = sumProfileAmount(
    includedItems,
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
    });
  }

  return {
    contentRevision: draft.contentRevision,
    compliant: entries.filter((entry) => entry.status === 'COMPLIANT').length,
    deficient: entries.filter((entry) => entry.status === 'DEFICIENT').length,
    excess: entries.filter((entry) => entry.status === 'EXCESS').length,
    missingData: entries.filter((entry) => entry.status === 'MISSING_DATA')
      .length,
    entries,
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

type IngredientOption = Awaited<
  ReturnType<RecipeDesignerService['listIngredientOptions']>
>['data'][number];

type IngredientOptionProfile = IngredientOption['nutritionProfiles'][number];

const DEFAULT_SEARCH_LIMIT = 20;
const MAX_SEARCH_LIMIT = 50;

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
const readNutritionSummary = (
  nutritionData: unknown,
): Record<string, number | null> => {
  if (!isRecord(nutritionData) || !isRecord(nutritionData.macros)) {
    return {};
  }

  const summary: Record<string, number | null> = {};
  for (const [key, value] of Object.entries(nutritionData.macros)) {
    const amount = toFiniteNumber(value);
    if (amount !== null) {
      summary[key] = amount;
    }
  }
  return summary;
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

/**
 * `AgentIngredientDetail` 没声明 `category`，但 `get_ingredient` 要回答
 * “这份原料属于七类里的哪一类”；在适配器内扩展返回类型，不动 P0a 的公共类型。
 */
export type RecipeAgentIngredientDetail = AgentIngredientDetail & {
  category: FoodCategory;
};

/** 按 item 名称收集动物物种；一条原料只记第一个命中的物种。 */
const collectAnimalSpecies = (names: readonly string[]): string[] => {
  const species: string[] = [];
  for (const name of names) {
    const matched = ANIMAL_SPECIES_KEYWORDS.find((keyword) =>
      name.includes(keyword),
    );
    if (matched && !species.includes(matched)) {
      species.push(matched);
    }
  }
  return species;
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

  // ---- 读方法：getDraft / searchIngredients / getIngredient 已接真实数据 ----

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

    // 总重与占比都从当前 items 现算，不信库里可能过期的 totalWeightG / ratioPercent。
    const totalWeightG = items.reduce(
      (sum, item) => sum + (Number.isFinite(item.weightG) ? item.weightG : 0),
      0,
    );
    const itemsWithRatios: AgentDraftItem[] = items.map((item) => ({
      ...item,
      ratioPercent:
        totalWeightG > 0 ? roundTo1((item.weightG / totalWeightG) * 100) : null,
    }));

    return {
      draftId,
      seriesId: draft.seriesId ?? null,
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
      nutritionSummary: buildNutritionSummary(
        draft.items,
        totalWeightG,
        draft.calculatedNutrition,
      ),
      animalSpecies: collectAnimalSpecies(
        // 鱼油算油脂、补剂不进七类，都不能算“动物蛋白”。
        itemsWithRatios
          .filter(
            (item) => item.category !== 'OIL' && item.category !== 'SUPPLEMENT',
          )
          .map((item) => item.name),
      ),
    };
  }

  async searchIngredients(input: {
    search?: string;
    category?: FoodCategory;
    type?: 'FOOD' | 'SUPPLEMENT';
    limit?: number;
  }): Promise<AgentIngredientCandidate[]> {
    // 一次多取（50 条上限），分类过滤/截断在本地做：七类分类不是数据库字段。
    const optionsResult = await this.service.listIngredientOptions({
      search: input.search,
      type: input.type,
      pageSize: MAX_SEARCH_LIMIT,
    });

    // 只有默认/主档案已验证的原料才算候选。
    const picked: Array<{
      option: IngredientOption;
      profile: IngredientOptionProfile;
    }> = [];
    for (const option of optionsResult?.data ?? []) {
      const profile = pickIngredientProfile(option);
      if (!profile || profile.status !== 'VERIFIED') {
        continue;
      }
      picked.push({ option, profile });
    }

    const cfctClassById = await loadCfctClasses(
      this.prisma,
      picked.map(({ option }) => option.id),
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
        verified: true,
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
      }));
  }

  async getIngredient(input: {
    nutritionFoodId: string;
  }): Promise<RecipeAgentIngredientDetail | null> {
    const nutritionFood = await this.prisma.nutritionFood.findUnique({
      where: { id: input.nutritionFoodId },
      select: {
        id: true,
        name: true,
        displayNameZh: true,
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
                name: true,
                type: true,
                properties: true,
                currentPricePerPurchaseUnit: true,
                purchaseUnit: true,
                allergenTags: {
                  select: { allergenTag: { select: { name: true } } },
                },
              },
            },
          },
        },
      },
    });

    if (!nutritionFood) {
      return null;
    }

    // 主映射优先；没有主映射取第一条。营养档案可能还没关联采购原料。
    const mappings = nutritionFood.mappings ?? [];
    const mapping =
      mappings.find((candidate) => candidate.isPrimary) ?? mappings[0] ?? null;
    const ingredient = mapping?.ingredient ?? null;

    const name =
      ingredient?.name ?? nutritionFood.displayNameZh ?? nutritionFood.name;
    const cfctClass = readCfctClass(ingredient?.properties);
    const nutritionCategory = nutritionFood.category ?? null;
    const type: 'FOOD' | 'SUPPLEMENT' =
      ingredient?.type === 'SUPPLEMENT' ||
      (!ingredient && nutritionFood.category === 'SUPPLEMENT')
        ? 'SUPPLEMENT'
        : 'FOOD';

    return {
      ingredientId: mapping?.ingredientId ?? '',
      nutritionFoodId: nutritionFood.id,
      name,
      nutritionProfileName: nutritionFood.displayNameZh ?? nutritionFood.name,
      type,
      cfctClass,
      nutritionCategory,
      verified: nutritionFood.status === 'VERIFIED',
      category: classifyFoodCategory({
        name,
        cfctClass,
        nutritionCategory,
        ingredientType: type,
      }),
      nutritionSummary: readNutritionSummary(nutritionFood.nutritionData),
      allergenNames: collectAllergenNames(ingredient?.allergenTags),
      preparationMethods: [],
      pricePerPurchaseUnit: toPriceNumber(
        ingredient?.currentPricePerPurchaseUnit,
      ),
      purchaseUnit: ingredient?.purchaseUnit ?? null,
    };
  }

  async getCatalogUsage(_input: {
    mainProteinName?: string;
    ingredientNames?: string[];
  }): Promise<AgentCatalogUsage> {
    return { totalPublishedRecipes: 0, mainProteinCount: 0, recipes: [] };
  }

  // ---- 写方法：P0b-2b 实现（届时用 service 保证 contentRevision 与事务） ----

  async addItem(
    _draftId: string,
    _input: {
      nutritionFoodId: string;
      ingredientId?: string;
      weightG: number;
      preparationMethod?: string;
    },
  ): Promise<AgentDraftItem> {
    throw new Error('P0b-2b: write not implemented');
  }

  async replaceItem(
    _itemId: string,
    _input: {
      nutritionFoodId: string;
      ingredientId?: string;
      weightG: number;
    },
  ): Promise<AgentDraftItem> {
    throw new Error('P0b-2b: write not implemented');
  }

  async updateWeight(
    _itemId: string,
    _weightG: number,
  ): Promise<AgentDraftItem> {
    throw new Error('P0b-2b: write not implemented');
  }

  async removeItem(_itemId: string): Promise<void> {
    throw new Error('P0b-2b: write not implemented');
  }

  async setPreparation(
    _itemId: string,
    _input: { method: string; note?: string | null },
  ): Promise<AgentDraftItem> {
    throw new Error('P0b-2b: write not implemented');
  }

  async setCopy(_draftId: string, _patch: AgentCopyPatch): Promise<void> {
    throw new Error('P0b-2b: write not implemented');
  }

  async setProductionSteps(
    _draftId: string,
    _steps: AgentProductionStep[],
  ): Promise<void> {
    throw new Error('P0b-2b: write not implemented');
  }

  async runAssessment(_draftId: string): Promise<AgentAssessmentView> {
    throw new Error('P0b-2b: write not implemented');
  }
}
