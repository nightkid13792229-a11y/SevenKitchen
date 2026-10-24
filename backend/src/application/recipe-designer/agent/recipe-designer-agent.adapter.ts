/**
 * `Recipe Agent` 的真实草稿端口（P0b-2a）。
 *
 * 每次运行绑定一份草稿（`draftId`）和当前员工身份（`actor`）：
 * - 读方法走现有 `RecipeDesignerService` + 只读 Prisma（本任务先留空壳，Task 2–4 实现）；
 * - 写方法必须在 P0b-2b 通过 `RecipeDesignerService` 落库（它负责
 *   `contentRevision` 与事务），本任务先统一抛错。
 *
 * 身份直接复用 `RecipeDesignerService.getDraft` 的第二个参数类型，
 * 避免依赖 service 里未导出的 `RecipeDesignerAccessInput`。
 */
import {
  classifyFoodCategory,
  type FoodCategory,
} from '../../../domain/recipe-designer/food-category-map';
import type { ProductionStep } from '../../../domain/recipe-designer/production-steps';
import type { PrismaService } from '../../../infrastructure/prisma.service';
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

/**
 * 从 `calculatedNutrition` 读一个宏量的总克数。
 *
 * 草稿持久化的是评估结果的分组形状：`macros.moisture` / `macros.crudeFat`；
 * 兼容旧数据里直接存 `nutrients` 的扁平形状（`crudeFat.total`）。
 */
const readMacroTotalGrams = (
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

/** 湿基脂肪 / 水分百分比；总重 <= 0 时两者都是 null。 */
const buildNutritionSummary = (
  calculatedNutrition: unknown,
  totalWeightG: number,
): { fatWetPercent: number | null; moisturePercent: number | null } => {
  const empty = { fatWetPercent: null, moisturePercent: null };
  if (!isRecord(calculatedNutrition) || totalWeightG <= 0) {
    return empty;
  }

  const moistureG = readMacroTotalGrams(calculatedNutrition, 'moisture');
  const crudeFatG = readMacroTotalGrams(calculatedNutrition, 'crudeFat');

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

  // ---- 读方法：getDraft 已接真实数据，其余在 Task 3–4 实现 ----

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
        draft.calculatedNutrition,
        totalWeightG,
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

  async searchIngredients(_input: {
    search?: string;
    category?: FoodCategory;
    type?: 'FOOD' | 'SUPPLEMENT';
    limit?: number;
  }): Promise<AgentIngredientCandidate[]> {
    return [];
  }

  async getIngredient(_input: {
    nutritionFoodId: string;
  }): Promise<AgentIngredientDetail | null> {
    return null;
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
