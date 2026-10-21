/**
 * 订单绑定食谱设计 —— 模板搜索与生命阶段比较（2026-10-22 · Task 2）。
 *
 * 只做两件事：
 *  1. 从「已上架橱窗食谱（PUBLIC）」与「其他狗狗的私密定制食谱（PRIVATE_CUSTOM）」
 *     里找出可用于订单设计的模板，并整理成列表所需的展示字段；
 *  2. 把模板生命阶段与订单狗狗的**当前有效阶段**做比较。
 *
 * 边界（与设计文档 §5.2 / §5.3 / §9 一致）：
 *  · 每条版本链只返回最新版本；
 *  · 模板列表只给内部设计角色看，且**绝不返回顾客/订单隐私字段**；
 *  · 阶段不一致或模板没标阶段只提示，绝不抛错、绝不阻止后续操作。
 */
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { IngredientType, Prisma, RecipeStatus } from '@prisma/client';
import {
  SERIES_LIFE_STAGE_LABELS,
  mapDogProfileToSeriesLifeStage,
  type RecipeSeriesLifeStage,
} from '../../domain/recipe/recipe-series';
import type { RecipeTemplateKind } from '../../interfaces/dto/recipe-designer/recipe-designer.dto';
import { PrismaService } from '../../infrastructure/prisma.service';

/** 模板搜索来源：ALL 两种都查；CATALOG 只查橱窗；CUSTOM 只查私密定制。 */
export type OrderRecipeTemplateKind = RecipeTemplateKind;

/** 模板来源类型（返回给后台的展示口径，不含 ALL）。 */
export type RecipeTemplateSourceKind = 'CATALOG' | 'CUSTOM';

/** 单次模板搜索最多返回多少条（产品约定 50）。 */
export const RECIPE_TEMPLATE_SEARCH_LIMIT = 50;

/** 模板没有阶段信息时的提示（只提示，不阻断）。 */
export const TEMPLATE_STAGE_MISSING_WARNING = '模板未标注适用阶段，请自行核对';

/** 找不到狗狗有效阶段时的提示（只提示，不阻断）。 */
export const DOG_STAGE_MISSING_WARNING =
  '未找到当前爱犬的生命阶段信息，请自行核对';

export interface RecipeTemplateMacroRow {
  name: string;
  dryMatterLabel: string;
  energyPercentLabel: string;
  weightPercentLabel: string;
}

export interface RecipeTemplateSummary {
  /** `recipe.id` —— 具体版本行的主键，Task 3 复制模板时用它定位精确版本。 */
  recipeId: string;
  /** `recipe.version` */
  recipeVersion: number;
  name: string;
  sourceKind: RecipeTemplateSourceKind;
  lifeStage: string | null;
  primaryProtein: string | null;
  ingredientCount: number;
  macroSummary: RecipeTemplateMacroRow[];
  updatedAt: Date;
}

export interface SearchRecipeTemplatesInput {
  keyword?: string;
  kind?: OrderRecipeTemplateKind;
}

export interface RecipeTemplateStageComparison {
  matches: boolean;
  templateStage: string | null;
  dogStage: string | null;
  warning: string | null;
}

export interface OrderTemplateStageComparison extends RecipeTemplateStageComparison {
  orderId: string;
  recipeId: string;
  recipeVersion: number;
  templateName: string;
}

const TEMPLATE_VERSION_SELECT = {
  id: true,
  recipeId: true,
  version: true,
  status: true,
} satisfies Prisma.RecipeSelect;

const TEMPLATE_RECIPE_SELECT = {
  id: true,
  recipeId: true,
  version: true,
  name: true,
  description: true,
  status: true,
  seriesLifeStage: true,
  applicableLifeStages: true,
  nutritionDetailedData: true,
  updatedAt: true,
  items: {
    select: {
      ratioPercent: true,
      exampleWeight: true,
      ingredient: {
        select: {
          name: true,
          type: true,
        },
      },
    },
  },
} satisfies Prisma.RecipeSelect;

type TemplateVersionRow = Prisma.RecipeGetPayload<{
  select: typeof TEMPLATE_VERSION_SELECT;
}>;

type TemplateRecipeRow = Prisma.RecipeGetPayload<{
  select: typeof TEMPLATE_RECIPE_SELECT;
}>;

const DOG_STAGE_SELECT = {
  birthday: true,
  gender: true,
  lifeStageOverride: true,
  activityLevel: true,
  sizeClassOverride: true,
  breedId: true,
} satisfies Prisma.DogSelect;

const DOG_BREED_STAGE_SELECT = {
  sizeCategory: true,
  adultAgeMonths: true,
  seniorAgeYears: true,
} satisfies Prisma.DogBreedSelect;

@Injectable()
export class OrderRecipeTemplateService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 搜索可作为订单设计起点的模板食谱。
   *
   * 分两步查，避免把每条版本链的全部历史版本（含大体积营养 JSON）都读出来：
   *  1. 只取版本号等标量，算出每条 `recipeId` 的最新版本行；
   *  2. 只对最新版本行做关键词过滤并读取展示字段。
   */
  async searchTemplates(
    input: SearchRecipeTemplatesInput = {},
  ): Promise<RecipeTemplateSummary[]> {
    const statuses = resolveTemplateStatuses(input.kind ?? 'ALL');
    const latestRows = await this.findLatestVersionRows(statuses);
    if (latestRows.length === 0) {
      return [];
    }

    const latestIds = latestRows.map((row) => row.id);
    const keyword = normalizeText(input.keyword);
    const where: Prisma.RecipeWhereInput = { id: { in: latestIds } };
    if (keyword) {
      where.OR = buildKeywordFilter(keyword);
    }

    const rows = await this.prisma.recipe.findMany({
      where,
      select: TEMPLATE_RECIPE_SELECT,
      orderBy: { updatedAt: 'desc' },
      take: RECIPE_TEMPLATE_SEARCH_LIMIT,
    });

    // 数据库已经按最新版本行过滤并排过序；内存里再兜一遍，
    // 既保证语义不依赖查询实现的细节，也让单测可以只 mock 数据。
    const latestIdSet = new Set(latestIds);
    const matched = rows
      .filter((row) => latestIdSet.has(row.id))
      .filter((row) => (keyword ? matchesKeyword(row, keyword) : true))
      .sort((left, right) => toTime(right.updatedAt) - toTime(left.updatedAt))
      .slice(0, RECIPE_TEMPLATE_SEARCH_LIMIT);

    return matched.map((row) => mapTemplateSummary(row));
  }

  /**
   * 比较模板阶段与狗狗当前有效生命阶段。
   *
   * ⚠️ 只做提示：模板缺失阶段、狗狗缺失阶段、两边不一致都返回 warning，
   * 永远不抛错，调用方（创建/编辑/加入待提交/最终交付）不得据此阻断。
   */
  async compareStage(
    templateLifeStage: string | null,
    dogId: string,
  ): Promise<RecipeTemplateStageComparison> {
    const templateStage = normalizeText(templateLifeStage);
    const dogStage = await this.resolveDogLifeStage(dogId);

    if (!templateStage) {
      return {
        matches: false,
        templateStage: null,
        dogStage,
        warning: TEMPLATE_STAGE_MISSING_WARNING,
      };
    }

    if (!dogStage) {
      return {
        matches: false,
        templateStage,
        dogStage: null,
        warning: DOG_STAGE_MISSING_WARNING,
      };
    }

    const matches = templateStage === dogStage;
    return {
      matches,
      templateStage,
      dogStage,
      warning: matches
        ? null
        : buildStageMismatchWarning(templateStage, dogStage),
    };
  }

  /**
   * 后台核对「某订单的狗狗」与「某个模板食谱」的阶段是否一致。
   *
   * 供模板选择确认弹窗使用；真正的复制与订单状态校验在 Task 3。
   */
  async compareOrderTemplateStage(
    orderId: string,
    sourceRecipeId: string,
  ): Promise<OrderTemplateStageComparison> {
    const normalizedOrderId = normalizeText(orderId);
    if (!normalizedOrderId) {
      throw new BadRequestException('缺少订单号');
    }
    const normalizedRecipeId = normalizeText(sourceRecipeId);
    if (!normalizedRecipeId) {
      throw new BadRequestException('缺少模板食谱');
    }

    const order = await this.prisma.customRecipeOrder.findUnique({
      where: { orderId: normalizedOrderId },
      select: { orderId: true, dogId: true },
    });
    if (!order) {
      throw new NotFoundException('定制订单不存在');
    }

    const recipe = await this.prisma.recipe.findUnique({
      where: { id: normalizedRecipeId },
      select: {
        id: true,
        name: true,
        version: true,
        status: true,
        seriesLifeStage: true,
        applicableLifeStages: true,
      },
    });
    if (!recipe || !isTemplateStatus(recipe.status)) {
      throw new NotFoundException('模板食谱不存在');
    }

    const comparison = await this.compareStage(
      resolveTemplateLifeStage(recipe),
      order.dogId,
    );

    return {
      orderId: order.orderId,
      recipeId: recipe.id,
      recipeVersion: recipe.version,
      templateName: recipe.name,
      ...comparison,
    };
  }

  private async findLatestVersionRows(
    statuses: RecipeStatus[],
  ): Promise<TemplateVersionRow[]> {
    const rows = await this.prisma.recipe.findMany({
      where: { status: { in: statuses } },
      select: TEMPLATE_VERSION_SELECT,
      orderBy: [{ recipeId: 'asc' }, { version: 'desc' }],
    });

    const allowedStatuses = new Set<string>(statuses);
    const latestByRecipeId = new Map<string, TemplateVersionRow>();
    for (const row of rows) {
      if (!allowedStatuses.has(row.status)) {
        continue;
      }
      const current = latestByRecipeId.get(row.recipeId);
      if (!current || row.version > current.version) {
        latestByRecipeId.set(row.recipeId, row);
      }
    }

    return Array.from(latestByRecipeId.values());
  }

  private async resolveDogLifeStage(
    dogId: string | null | undefined,
  ): Promise<string | null> {
    const normalizedDogId = normalizeText(dogId);
    if (!normalizedDogId) {
      return null;
    }

    const dog = await this.prisma.dog.findUnique({
      where: { id: normalizedDogId },
      select: DOG_STAGE_SELECT,
    });
    if (!dog) {
      return null;
    }

    const breed = dog.breedId
      ? await this.prisma.dogBreed.findUnique({
          where: { id: dog.breedId },
          select: DOG_BREED_STAGE_SELECT,
        })
      : null;

    try {
      return mapDogProfileToSeriesLifeStage({ ...dog, breed });
    } catch {
      // 阶段只是提示信息；生日/品种数据异常时退化成「未知阶段」，不阻断主流程。
      return null;
    }
  }
}

export function buildStageMismatchWarning(
  templateStage: string,
  dogStage: string,
): string {
  return `模板阶段「${formatStageLabel(templateStage)}」与当前爱犬阶段「${formatStageLabel(dogStage)}」不一致，原料比例可能需要按当前阶段重新评估`;
}

function resolveTemplateStatuses(
  kind: OrderRecipeTemplateKind,
): RecipeStatus[] {
  switch (kind) {
    case 'CATALOG':
      return [RecipeStatus.PUBLIC];
    case 'CUSTOM':
      return [RecipeStatus.PRIVATE_CUSTOM];
    case 'ALL':
    default:
      return [RecipeStatus.PUBLIC, RecipeStatus.PRIVATE_CUSTOM];
  }
}

function isTemplateStatus(status: RecipeStatus): boolean {
  return (
    status === RecipeStatus.PUBLIC || status === RecipeStatus.PRIVATE_CUSTOM
  );
}

function buildKeywordFilter(keyword: string): Prisma.RecipeWhereInput[] {
  return [
    { name: { contains: keyword, mode: 'insensitive' } },
    { description: { contains: keyword, mode: 'insensitive' } },
    {
      items: {
        some: {
          ingredient: {
            name: { contains: keyword, mode: 'insensitive' },
          },
        },
      },
    },
  ];
}

function matchesKeyword(recipe: TemplateRecipeRow, keyword: string): boolean {
  const needle = keyword.toLowerCase();
  const candidates: Array<string | null | undefined> = [
    recipe.name,
    recipe.description,
    ...recipe.items.map((item) => item.ingredient?.name),
  ];

  return candidates.some(
    (candidate) =>
      typeof candidate === 'string' && candidate.toLowerCase().includes(needle),
  );
}

function mapTemplateSummary(recipe: TemplateRecipeRow): RecipeTemplateSummary {
  const sourceKind: RecipeTemplateSourceKind =
    recipe.status === RecipeStatus.PUBLIC ? 'CATALOG' : 'CUSTOM';

  return {
    recipeId: recipe.id,
    recipeVersion: recipe.version,
    name: recipe.name,
    sourceKind,
    lifeStage: resolveTemplateLifeStage(recipe),
    primaryProtein: resolvePrimaryProtein(recipe.items),
    ingredientCount: recipe.items.length,
    macroSummary: readMacroSummary(recipe.nutritionDetailedData),
    updatedAt: recipe.updatedAt,
  };
}

function resolveTemplateLifeStage(recipe: {
  seriesLifeStage: string | null;
  applicableLifeStages: Prisma.JsonValue;
}): string | null {
  const seriesStage = normalizeText(recipe.seriesLifeStage);
  if (seriesStage) {
    return seriesStage;
  }

  const stages = recipe.applicableLifeStages;
  if (Array.isArray(stages)) {
    for (const stage of stages) {
      const normalized = normalizeText(stage);
      if (normalized) {
        return normalized;
      }
    }
  }

  return null;
}

/**
 * 主蛋白 = 占比最大的 FOOD 类原料；没有占比时退回用量最大的那道。
 * 补剂/包装不计入（它们不是这道食谱的“主蛋白”）。
 */
function resolvePrimaryProtein(
  items: TemplateRecipeRow['items'],
): string | null {
  let bestName: string | null = null;
  let bestRatio = Number.NEGATIVE_INFINITY;
  let bestWeight = Number.NEGATIVE_INFINITY;

  for (const item of items) {
    const ingredient = item.ingredient;
    if (!ingredient || ingredient.type !== IngredientType.FOOD) {
      continue;
    }
    const name = normalizeText(ingredient.name);
    if (!name) {
      continue;
    }

    const ratio = toFiniteNumber(item.ratioPercent);
    const weight = toFiniteNumber(item.exampleWeight);
    const ratioValue = ratio ?? Number.NEGATIVE_INFINITY;
    const weightValue = weight ?? Number.NEGATIVE_INFINITY;

    if (bestName === null) {
      bestName = name;
      bestRatio = ratioValue;
      bestWeight = weightValue;
      continue;
    }

    const isBetter =
      ratioValue > bestRatio ||
      (ratioValue === bestRatio && weightValue > bestWeight) ||
      (ratioValue === bestRatio &&
        weightValue === bestWeight &&
        name.localeCompare(bestName) < 0);

    if (isBetter) {
      bestName = name;
      bestRatio = ratioValue;
      bestWeight = weightValue;
    }
  }

  return bestName;
}

function readMacroSummary(
  nutritionDetailedData: Prisma.JsonValue | null,
): RecipeTemplateMacroRow[] {
  if (!isJsonObject(nutritionDetailedData)) {
    return [];
  }

  const report = nutritionDetailedData.report;
  if (!isJsonObject(report)) {
    return [];
  }

  const macroRows = report.macroRows;
  if (!Array.isArray(macroRows)) {
    return [];
  }

  const summary: RecipeTemplateMacroRow[] = [];
  for (const row of macroRows) {
    if (!isJsonObject(row)) {
      continue;
    }
    const name = normalizeText(row.name);
    if (!name) {
      continue;
    }
    summary.push({
      name,
      dryMatterLabel: normalizeText(row.dryMatterLabel) ?? '-',
      energyPercentLabel: normalizeText(row.energyPercentLabel) ?? '-',
      weightPercentLabel: normalizeText(row.weightPercentLabel) ?? '-',
    });
  }

  return summary;
}

function formatStageLabel(stage: string): string {
  return SERIES_LIFE_STAGE_LABELS[stage as RecipeSeriesLifeStage] ?? stage;
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function toTime(value: Date | string | null | undefined): number {
  if (!value) {
    return 0;
  }
  const time =
    value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized || null;
}
