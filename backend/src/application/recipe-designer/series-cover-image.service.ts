import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  IngredientType,
  RecipeDesignMode,
  RecipeSeriesBusinessStatus,
  RecipeSeriesStatus,
  RecipeStatus,
} from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma.service';
import { RecipeCoverImageService } from './recipe-cover-image.service';
import type { RecipeCoverIngredient } from './recipe-cover-prompt';

/**
 * 阶段优先级（老板 2026-10-27 定）：
 *   普通成年犬 → 14 周以上幼犬 → 低能量成犬/老年犬 → 繁殖期
 *
 * 系统里没有单独的「老年犬」「哺乳期」食谱阶段：
 *  · 老年犬 = LOW_ACTIVITY_ADULT_OR_SENIOR（低运动量成犬或老年犬，合并阶段）
 *  · 哺乳期 = REPRODUCTION（繁殖期）
 */
const STAGE_PRIORITY = [
  'HIGH_ACTIVITY_ADULT',
  'PUPPY_14_WEEKS_PLUS',
  'LOW_ACTIVITY_ADULT_OR_SENIOR',
  'REPRODUCTION',
] as const;

/** 水不是「看得见」的食材，不放进画面 */
const INVISIBLE_INGREDIENT_NAMES = new Set([
  '水',
  '饮用水',
  '纯净水',
  '温水',
]);

/** 和单食谱入口保持同一句配置指引，运营看到的是同一个去处 */
const AI_COVER_NOT_CONFIGURED_MESSAGE =
  'AI 生图还没配置：请到后台「AI / Agent 配置」的「AI 食谱封面」配置 DeepSeek 与 Seedream';

export interface SeriesCoverGenerationResult {
  /** 一定是 COS 地址（已转存），不是智谱临时链接 */
  url: string;
  provider: string;
  model: string;
  /** 实际喂给提示词的食材名（用于前端 / 排错） */
  foodNames: string[];
  /** 本次用了哪个生命阶段的配方（回退时可能是非优先阶段） */
  stageCode: string | null;
}

type CoverItemLike = {
  /** 设计草稿的重量字段 */
  weightG?: number | null;
  /** 已发布食谱的重量字段（RecipeItem 没有 weightG） */
  exampleWeight?: number | null;
  ratioPercent?: number | null;
  preparationMethod?: string | null;
  ingredient?: { name?: string | null; type?: string | null } | null;
  nutritionFood?: { name?: string | null } | null;
};

/**
 * 产品线系列封面（2026-10-27）
 *
 * ## 取数规则（老板 2026-10-27 定）
 *
 * 1. 按阶段优先级找「这个阶段最新一份有食材的设计草稿」；
 * 2. 该阶段没有草稿，再退回该阶段已发布 / 草稿状态的食谱；
 * 3. 四个优先阶段都没有，退回最近一份有食材的草稿（任何阶段）；
 * 4. 抽「名字 + 用量占比 + 部位/状态/预处理整串」，排除补剂/包材/零重量/水；
 *    占比按剩下的食材归一化；同名同预处理的合并。
 *
 * ## 保存语义
 *
 * 前端按「封面为空 + 系列未上线」传 `save=true`；写库前会再判一次是否已上线，
 * 已上线一律按预览返回 `saved=false`，门面只能由人点「保存发布设置」同步线上。
 *
 * ## 它绝不做什么
 *
 * 不写 `Recipe` 行、不传 `applyToLive`、不碰角标、不碰配方与营养数据。
 */
@Injectable()
export class SeriesCoverImageService {
  private readonly logger = new Logger(SeriesCoverImageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly coverImageService: RecipeCoverImageService,
  ) {}

  async generateForSeries(
    seriesId: string,
  ): Promise<SeriesCoverGenerationResult> {
    const series = await this.prisma.recipeSeries.findUnique({
      where: { id: seriesId },
      select: {
        id: true,
        name: true,
        status: true,
        deletedAt: true,
        designMode: true,
        businessStatus: true,
      },
    });
    if (
      !series ||
      series.status !== RecipeSeriesStatus.ACTIVE ||
      series.deletedAt
    ) {
      throw new NotFoundException('食谱系列不存在');
    }

    if (series.designMode === RecipeDesignMode.ORDER) {
      throw new BadRequestException('订单定制系列不支持 AI 封面生成');
    }

    // 临时名通常意味着系列还没准备好；提示词不再用系列名，但这条门槛仍然保留
    const recipeName = String(series.name ?? '').trim();
    if (!recipeName || recipeName.startsWith('未命名')) {
      throw new BadRequestException(
        '系列名称还是临时名称，先改成正式名称再生成封面',
      );
    }

    if (!(await this.coverImageService.isAvailable())) {
      throw new BadRequestException(AI_COVER_NOT_CONFIGURED_MESSAGE);
    }

    const source = await this.loadCoverIngredients(seriesId);
    if (source.ingredients.length === 0) {
      throw new BadRequestException(
        '这个系列还没有可用于生成封面的食材（至少需要一个食品类原料）',
      );
    }

    const foodNames = source.ingredients.map((item) => item.name);

    // 不传 lifeStageLabels：系列封面是整条产品线的门面，不属于某个阶段
    const result = await this.coverImageService.generate({
      recipeName,
      foodNames,
      ingredients: source.ingredients,
      layout: 'COVER_16_9',
    });

    this.logger.log(
      `[series-cover] ${seriesId} stage=${source.stageCode ?? '-'} ingredients=${foodNames.join('/') || '(none)'}`,
    );

    // 只返回预览；落库 / 同步线上由「保存发布设置」负责
    return {
      ...result,
      foodNames,
      stageCode: source.stageCode,
    };
  }


  private async isSeriesLive(series: {
    id: string;
    businessStatus: RecipeSeriesBusinessStatus;
  }): Promise<boolean> {
    if (series.businessStatus === RecipeSeriesBusinessStatus.PUBLIC) {
      return true;
    }
    const publishedCount = await this.prisma.recipe.count({
      where: { seriesId: series.id, status: RecipeStatus.PUBLIC },
    });
    return publishedCount > 0;
  }

  /**
   * 按阶段优先级取食材。
   *
   * 设计草稿优先于已发布食谱：草稿才是当前设计，且带最新的
   * 「部位/状态/预处理」和占比。
   */
  private async loadCoverIngredients(seriesId: string): Promise<{
    stageCode: string | null;
    ingredients: RecipeCoverIngredient[];
  }> {
    const drafts = await this.prisma.designRecipe.findMany({
      where: { seriesId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        seriesLifeStage: true,
        updatedAt: true,
        items: {
          orderBy: { sortOrder: 'asc' },
          select: {
            weightG: true,
            ratioPercent: true,
            preparationMethod: true,
            ingredient: { select: { name: true, type: true } },
            nutritionFood: { select: { name: true } },
          },
        },
      },
    });

    const draftsByStage = new Map<string, Array<(typeof drafts)[number]>>();
    for (const draft of drafts) {
      const stage = String(draft.seriesLifeStage ?? '').trim();
      if (!stage) continue;
      const list = draftsByStage.get(stage) ?? [];
      list.push(draft);
      draftsByStage.set(stage, list);
    }

    // 1) 阶段优先级：设计草稿（同一阶段多份时按 updatedAt desc）
    for (const stage of STAGE_PRIORITY) {
      for (const draft of draftsByStage.get(stage) ?? []) {
        const ingredients = this.extractIngredients(draft.items);
        if (ingredients.length > 0) {
          return { stageCode: stage, ingredients };
        }
      }
    }

    // 2) 阶段优先级：已发布 / 草稿状态的食谱（老系列可能没有设计草稿）
    for (const stage of STAGE_PRIORITY) {
      const ingredients = await this.loadStageRecipeIngredients(
        seriesId,
        stage,
      );
      if (ingredients.length > 0) {
        return { stageCode: stage, ingredients };
      }
    }

    // 3) 四个优先阶段都没有：退回最近一份有食材的草稿（任何阶段）
    for (const draft of drafts) {
      const ingredients = this.extractIngredients(draft.items);
      if (ingredients.length > 0) {
        const stage = String(draft.seriesLifeStage ?? '').trim();
        return { stageCode: stage || null, ingredients };
      }
    }

    // 4) 最后退回最近一份食谱（任何阶段）
    const recipe = await this.prisma.recipe.findFirst({
      where: {
        seriesId,
        status: { in: [RecipeStatus.DRAFT, RecipeStatus.PUBLIC] },
      },
      orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
      select: {
        seriesLifeStage: true,
        items: {
          orderBy: { sortOrder: 'asc' },
          select: {
            exampleWeight: true,
            ratioPercent: true,
            preparationMethod: true,
            ingredient: { select: { name: true, type: true } },
          },
        },
      },
    });
    if (recipe) {
      const ingredients = this.extractIngredients(recipe.items);
      if (ingredients.length > 0) {
        return {
          stageCode: String(recipe.seriesLifeStage ?? '').trim() || null,
          ingredients,
        };
      }
    }

    return { stageCode: null, ingredients: [] };
  }

  private async loadStageRecipeIngredients(
    seriesId: string,
    stage: string,
  ): Promise<RecipeCoverIngredient[]> {
    const recipe = await this.prisma.recipe.findFirst({
      where: {
        seriesId,
        seriesLifeStage: stage,
        status: { in: [RecipeStatus.DRAFT, RecipeStatus.PUBLIC] },
      },
      orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
      select: {
        items: {
          orderBy: { sortOrder: 'asc' },
          select: {
            exampleWeight: true,
            ratioPercent: true,
            preparationMethod: true,
            ingredient: { select: { name: true, type: true } },
          },
        },
      },
    });
    return recipe ? this.extractIngredients(recipe.items) : [];
  }

  /**
   * 抽出「名字 + 占比 + 部位/状态/预处理整串」。
   *
   * - 排除补剂 / 包材 / 零重量 / 水；
   * - 优先用保存时的 ratioPercent；没有就按 weightG 算；
   * - 排除补剂后总占比可能不足 100，按剩下的食材归一化；
   * - 同一名字 + 同一预处理的合并占比（模型不需要看两遍同一个东西）。
   */
  private extractIngredients(items: CoverItemLike[]): RecipeCoverIngredient[] {
    const rows = items
      .map((item) => {
        const type = item.ingredient?.type;
        if (
          type === IngredientType.SUPPLEMENT ||
          type === IngredientType.PACKAGING
        ) {
          return null;
        }
        const name = String(
          item.ingredient?.name ?? item.nutritionFood?.name ?? '',
        ).trim();
        if (!name || INVISIBLE_INGREDIENT_NAMES.has(name)) return null;
        const weightG =
          Number(item.weightG ?? item.exampleWeight) || 0;
        if (weightG <= 0) return null;
        return {
          name,
          preparationMethod: String(item.preparationMethod ?? '').trim() || null,
          weightG,
          ratioPercent: Number(item.ratioPercent) || 0,
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row));

    if (rows.length === 0) return [];

    const useSavedRatios = rows.every((row) => row.ratioPercent > 0);
    const base = rows.map((row) =>
      useSavedRatios ? row.ratioPercent : row.weightG,
    );
    const total = base.reduce((sum, value) => sum + value, 0);
    if (total <= 0) return [];

    const merged = new Map<string, RecipeCoverIngredient>();
    rows.forEach((row, index) => {
      const ratioPercent = Math.round((base[index] / total) * 100);
      const key = `${row.name}|${row.preparationMethod ?? ''}`;
      const existing = merged.get(key);
      if (existing) {
        existing.ratioPercent =
          (existing.ratioPercent ?? 0) + ratioPercent;
        return;
      }
      merged.set(key, {
        name: row.name,
        preparationMethod: row.preparationMethod,
        ratioPercent,
      });
    });

    return [...merged.values()]
      .filter((ingredient) => (ingredient.ratioPercent ?? 0) > 0)
      .sort((a, b) => (b.ratioPercent ?? 0) - (a.ratioPercent ?? 0));
  }
}
