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

/** 提示词里最多带几个食材（多了模型会画乱） */
const MAX_FOOD_NAMES = 5;
/** 最多往回翻多少份草稿找「有原料的那一份」（只是上限保护） */
const MAX_DRAFT_SCAN = 20;

/** 和单食谱入口保持同一句配置指引，运营看到的是同一个去处 */
const AI_COVER_NOT_CONFIGURED_MESSAGE =
  'AI 生图还没配置：请到后台「AI / Agent 配置」的「智谱封面图」填 Key 并启用';

export interface SeriesCoverGenerationResult {
  /** 一定是 COS 地址（已转存），不是智谱临时链接 */
  url: string;
  provider: string;
  model: string;
  /** true = 已写入系列；false = 只返回预览 */
  saved: boolean;
  /** 实际喂给提示词的食材（最多 5 个） */
  foodNames: string[];
}

/**
 * 产品线系列封面（2026-10-27）
 *
 * ## 它只做三件事
 *
 * ```
 * ① 校验：CATALOG / ACTIVE / 正式名 / AI 已配置
 * ② 取素材：系列名 + 最近一份「有原料」的草稿的食材名（不传生命阶段）
 * ③ 生图 → 转存 COS → 按 save 决定要不要写系列
 * ```
 *
 * ## 为什么 save 要后端再兜一层
 *
 * 前端按「封面为空 + 系列未上线」传 `save=true`，但它看到的状态可能过期
 * （另一个标签页刚发布了这条系列）。已上线的门面只能由人点「保存发布设置」
 * 同步线上；这里如果直接写库，会出现「系列有新封面、线上还是旧图、
 * 保存按钮又不变脏」的死角。所以已上线一律按预览返回 `saved=false`。
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
    options: { save?: boolean } = {},
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

    // 临时名会原样进提示词，画出来必然是一张莫名其妙的图 —— 先改名，别花这笔钱
    const recipeName = String(series.name ?? '').trim();
    if (!recipeName || recipeName.startsWith('未命名')) {
      throw new BadRequestException(
        '系列名称还是临时名称，先改成正式名称再生成封面',
      );
    }

    if (!(await this.coverImageService.isAvailable())) {
      throw new BadRequestException(AI_COVER_NOT_CONFIGURED_MESSAGE);
    }

    const saveRequested = options.save === true;
    const foodNames = await this.loadFoodNames(seriesId);

    // 不传 lifeStageLabels：系列封面是整条产品线的门面，不属于某个阶段
    const result = await this.coverImageService.generate({
      recipeName,
      foodNames,
      layout: 'COVER_16_9',
    });

    /**
     * 写库前再判一次「是否已上线」（不是生成前）。
     *
     * 生图要 20–40 秒，这期间另一个标签页可能刚好把系列发布了；
     * 生成前的结论放到这时用，就会造出「系列有新封面、线上还是旧图、
     * 保存按钮又不变脏」的死角。多一次 count 换掉这个窗口。
     */
    const shouldSave = saveRequested && !(await this.isSeriesLive(series));

    if (shouldSave) {
      // 只写系列这一列；线上同步交给「保存发布设置」
      await this.prisma.recipeSeries.update({
        where: { id: seriesId },
        data: { coverImageUrl: result.url },
      });
    }

    this.logger.log(
      `[series-cover] ${seriesId} saved=${shouldSave} foods=${foodNames.join('/') || '(none)'}`,
    );

    return { ...result, saved: shouldSave, foodNames };
  }

  /**
   * 系列算不算「已上线」：系列状态 PUBLIC，或已经存在 PUBLIC 食谱行。
   *
   * 两者取或：老数据里可能系列还是 DRAFT 但已有 PUBLISHED 阶段，
   * 和 `updateSeriesReleaseSettings` 的判断口径保持一致。
   */
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
   * 最近一份「有原料」的草稿里的食材名。
   *
   * - 按 `updatedAt desc` 往回翻，跳过没有可用食材的草稿；
   * - 优先原料名，没关联原料时退回营养食物名；
   * - 排除补剂（它不是这道菜的组成部分）、去重、最多 5 个；
   * - 一份都没有就返回空数组：只用系列名生成，不阻断。
   */
  private async loadFoodNames(seriesId: string): Promise<string[]> {
    const drafts = await this.prisma.designRecipe.findMany({
      where: { seriesId },
      orderBy: { updatedAt: 'desc' },
      take: MAX_DRAFT_SCAN,
      select: {
        items: {
          orderBy: { sortOrder: 'asc' },
          select: {
            ingredient: { select: { name: true, type: true } },
            nutritionFood: { select: { name: true } },
          },
        },
      },
    });

    for (const draft of drafts) {
      const names: string[] = [];
      for (const item of draft.items) {
        if (item.ingredient?.type === IngredientType.SUPPLEMENT) continue;
        const name = String(
          item.ingredient?.name ?? item.nutritionFood?.name ?? '',
        ).trim();
        if (!name || names.includes(name)) continue;
        names.push(name);
        if (names.length >= MAX_FOOD_NAMES) break;
      }
      if (names.length > 0) return names;
    }

    return [];
  }
}
