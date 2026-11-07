import { RecipeCoverImageService } from '../../application/recipe-designer/recipe-cover-image.service';
/**
 * Recipes Controller
 * Handles recipe related endpoints
 */

import { BadRequestException,
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  UsePipes,
  ValidationPipe,
  NotFoundException,
  ForbiddenException,
  Inject,
  UseGuards,
  Req,
} from '@nestjs/common';
import {
  Prisma,
  RecipeSeriesBusinessStatus,
  RecipeSeriesStatus,
  RecipeStatus as PrismaRecipeStatus,
} from '@prisma/client';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
  ApiSecurity,
  ApiQuery,
} from '@nestjs/swagger';
import type {
  Recipe,
  RecipeRepository,
} from '../../domain/recipe/recipe.repository';
import {
  RecipeSummaryDto,
  RecipeDetailDto,
  RecipeLifeStageMatchDto,
  RecipeLifeStageVersionDto,
} from '../dto/recipes/recipe-response.dto';
import { ApiResponseDto } from '../dto/common/response.dto';
import { RecipeStatus, NutritionStandard } from '../../domain/recipe/enums';
import {
  mapDogProfileToSeriesLifeStage,
  ORDERED_RECIPE_SERIES_LIFE_STAGES,
  RecipeSeriesLifeStage,
  resolveDefaultSeriesLifeStage,
  resolveSeriesLifeStageRisk,
  selectLatestPublishedSeriesLifeStageVersions,
  SERIES_LIFE_STAGE_LABELS,
} from '../../domain/recipe/recipe-series';
import { resolveDogProfileStage } from '../../domain/dog/dog-stage.service';
import { splitAllergyKeywords } from '../../domain/dog/allergy-keywords';
import {
  collectHitAllergenNames,
  type AllergenHit,
} from '../../domain/dog/allergen-vocabulary';
import { AllergenVocabularyService } from '../../application/health/allergen-vocabulary.service';
import { pickCoverBadgeNames } from '../../domain/recipe-designer/cover-badge-policy';
import { DiySheetService } from '../../application/recipe/diy-sheet.service';
import { RecipeService } from '../../application/recipe/recipe.service';
import { CustomRecipeDeliveryService } from '../../application/custom-recipe/custom-recipe-delivery.service';
import { SupplementCandidateService } from '../../application/supplement-shop/supplement-candidate.service';
import { computeSheetTotalWeightG } from '../../application/supplement-shop/supplement-sheet-weight.util';
import { OrderService } from '../../application/order/order.service';
import {
  GenerateDiySheetDto,
  DiySheetResponseDto,
} from '../dto/recipes/diy-sheet.dto';
import { FilterOptionsDto } from '../dto/recipes/filter-options.dto';
import { PrismaService } from '../../infrastructure/prisma.service';
import { AuthGuard, CurrentUser } from '../auth';
import { LifeStageAcknowledgementDto } from '../dto/recipes/life-stage-acknowledgement.dto';
import { AdminGuard, StaffGuard } from '../guards/role.guard';
import type { RequestUser } from '../auth/request-user.interface';
import { JwtAuthService } from '../auth/jwt.service';
import {
  extractLegacyPreparationMethodIds,
  resolvePreparationMethodText,
} from '../../application/recipe/preparation-method-text.util';
import { resolveSupplementNutrients } from '../../domain/ingredient/supplement-nutrition-resolver';
import { resolveSupplementAddTimingLabel } from '../../domain/ingredient/supplement-add-timing';

// Create a symbol for recipe repository token
export const RECIPE_REPOSITORY_TOKEN = Symbol('RecipeRepository');

function generateToken(length: number = 32): string {
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

const SERIES_FALLBACK_MESSAGE =
  '当前狗狗档案没有完全匹配版本，已展示可用替代版本。';

type ResolvedSeriesLifeStageRequest = {
  requestedLifeStage?: string;
  manualLifeStage?: string;
  hasDog: boolean;
  dogId?: string;
  dogLifeStage?: RecipeSeriesLifeStage;
  dogName?: string;
};

@ApiTags('Recipes')
@Controller('api/v1/recipes')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class RecipesController {
  constructor(
    @Inject(RECIPE_REPOSITORY_TOKEN)
    private readonly recipeRepository: RecipeRepository,
    private readonly diySheetService: DiySheetService,
    private readonly prisma: PrismaService,
    private readonly jwtAuthService: JwtAuthService,
    private readonly orderService: OrderService,
    private readonly allergenVocabulary: AllergenVocabularyService,
    private readonly deliveryService: CustomRecipeDeliveryService,
    private readonly supplementCandidateService: SupplementCandidateService,
    private readonly recipeCoverImageService: RecipeCoverImageService,
    private readonly recipeService: RecipeService,
  ) {}

  private buildPublicRecipeWhere(
    extra: Prisma.RecipeWhereInput = {},
  ): Prisma.RecipeWhereInput {
    const extraAnd = Array.isArray(extra.AND)
      ? extra.AND
      : extra.AND
        ? [extra.AND]
        : [];

    return {
      ...extra,
      status: PrismaRecipeStatus.PUBLIC,
      AND: [
        ...extraAnd,
        {
          OR: [
            { seriesId: null },
            {
              series: {
                is: {
                  businessStatus: RecipeSeriesBusinessStatus.PUBLIC,
                  status: RecipeSeriesStatus.ACTIVE,
                  deletedAt: null,
                },
              },
            },
          ],
        },
      ],
    };
  }

  /**
   * 员工食谱管理「公开」的可见口径 = 顾客食谱橱窗的可见口径：
   * 已发布 + 非定制 + 系列已上线（独立食谱也按橱窗口径展示）。
   */
  private buildShowcaseRecipeWhere(): Prisma.RecipeWhereInput {
    return this.buildPublicRecipeWhere({ isCustomRecipe: false });
  }

  /**
   * 与 buildShowcaseRecipeWhere 同一口径的内存兜底：
   * 数据库条件之外再挡一次，避免旧数据/漏选字段把没上橱窗的公开食谱带出来。
   */
  private isShowcasePublicRecipe(recipe: {
    status: string;
    isCustomRecipe: boolean;
    seriesId: string | null;
    series?: {
      businessStatus: string;
      status: string;
      deletedAt: Date | null;
    } | null;
  }): boolean {
    if (recipe.status !== RecipeStatus.PUBLIC || recipe.isCustomRecipe) {
      return false;
    }
    if (!recipe.seriesId) {
      return true;
    }
    return Boolean(
      recipe.series &&
        recipe.series.businessStatus === RecipeSeriesBusinessStatus.PUBLIC &&
        recipe.series.status === RecipeSeriesStatus.ACTIVE &&
        !recipe.series.deletedAt,
    );
  }

  private async isPublicRecipeVisible(recipe: Recipe): Promise<boolean> {
    if (recipe.status !== RecipeStatus.PUBLIC) {
      return false;
    }
    if (!recipe.seriesId) {
      return true;
    }

    const visibleRecipe = await this.prisma.recipe.findFirst({
      where: this.buildPublicRecipeWhere({ recipeId: recipe.id }),
      select: { id: true },
    });
    return Boolean(visibleRecipe);
  }

  private async hasRestrictedRecipeAccess(
    id: string,
    shareToken?: string,
    req?: any,
  ): Promise<boolean> {
    const user = this.getRequestUser(req);
    if (user && (user.role === 'STAFF' || user.role === 'ADMIN')) {
      return true;
    }

    if (!shareToken) {
      return false;
    }

    const tokenRecord = await this.prisma.recipeShareToken.findFirst({
      where: {
        recipe: { recipeId: id },
        token: shareToken,
        expiresAt: { gt: new Date() },
      },
    });
    return Boolean(tokenRecord);
  }

  private normalizeKeywordList(value?: string | null): string[] {
    // 分词规则统一收敛到 domain/dog/allergy-keywords：
    // 过敏避雷要用同一套分词，分两处写迟早会漂移。
    return splitAllergyKeywords(value);
  }

  /**
   * 该狗狗的「档案层」生命阶段（幼犬 / 成犬 / 老年 / 繁殖期）。
   *
   * 2026-09-19：原先这里写死了「12 个月成犬、84 个月老年」，**不看品种也不看体型** ——
   * 于是同一只 8 个月的小型犬，首页推荐判它是幼犬、而按品种算的配餐标准判它是成犬，
   * 推荐语与实际给的饭对不上。
   * 现在统一走领域层的权威实现（按品种/体型的成犬与老年阈值）。
   */
  private resolveDogLifeStage(dog: {
    birthday: Date;
    lifeStageOverride?: string | null;
    activityLevel?: string | null;
    sizeClassOverride?: string | null;
    gender?: string | null;
    breed?: any;
  }): string {
    return resolveDogProfileStage({
      birthday: dog.birthday,
      lifeStageOverride: dog.lifeStageOverride as any,
      activityLevel: dog.activityLevel as any,
      sizeClassOverride: dog.sizeClassOverride as any,
      gender: dog.gender as any,
      breed: dog.breed ?? null,
    }).effectiveLifeStage;
  }

  private resolveRecipeSeriesLifeStage(
    recipe: any,
  ): RecipeSeriesLifeStage | null {
    const explicitStage = recipe.seriesLifeStage;
    if (
      explicitStage &&
      ORDERED_RECIPE_SERIES_LIFE_STAGES.includes(explicitStage)
    ) {
      return explicitStage;
    }

    const recipeLifeStages = Array.isArray(recipe.applicableLifeStages)
      ? recipe.applicableLifeStages
      : [];
    const seriesStage = ORDERED_RECIPE_SERIES_LIFE_STAGES.find((stage) =>
      recipeLifeStages.includes(stage),
    );
    if (seriesStage) {
      return seriesStage;
    }

    if (recipeLifeStages.includes('SENIOR')) {
      return 'LOW_ACTIVITY_ADULT_OR_SENIOR';
    }
    if (
      recipeLifeStages.includes('PREGNANCY') ||
      recipeLifeStages.includes('LACTATION')
    ) {
      return 'REPRODUCTION';
    }
    if (recipeLifeStages.includes('PUPPY')) {
      return 'PUPPY_14_WEEKS_PLUS';
    }
    if (recipeLifeStages.includes('ADULT')) {
      return 'HIGH_ACTIVITY_ADULT';
    }

    return null;
  }

  private getRecommendationGroupKey(recipe: any): string {
    if (recipe.seriesId) {
      return `series:${recipe.seriesId}`;
    }
    return `recipe:${recipe.recipeId || recipe.id}`;
  }

  /**
   * 这只狗的过敏档案，按"要不要硬拦"分成两档。
   *
   * 老板 2026-10-04 确认：「确诊过敏的食谱从推荐里彻底拿掉」。
   *
   *   · CONFIRMED（确诊）          → **直接不进推荐候选**（blocking）
   *   · SUSPECTED / TO_VERIFY      → 保留，但重罚并标注（warning）
   *   · RULED_OUT（已排除）        → 不再避开
   *
   * 旧文本字段 `dog.allergyFoods` 没有可信度信息（它是员工在设计备注里
   * 手写的），按"可疑"处理 —— 不做硬拦，但会被重罚。
   */
  private buildDogAllergenProfile(dog: any): {
    blocking: string[];
    warning: string[];
    all: string[];
  } {
    const records: Array<{ allergen?: string | null; certainty?: string | null }> =
      Array.isArray(dog?.allergyRecords) ? dog.allergyRecords : [];

    const blockingTerms: string[] = [];
    const warningTerms: string[] = [];

    for (const record of records) {
      const certainty = String(record?.certainty || 'SUSPECTED').toUpperCase();
      if (certainty === 'RULED_OUT') {
        continue;
      }
      const terms = splitAllergyKeywords(record?.allergen);
      if (certainty === 'CONFIRMED') {
        blockingTerms.push(...terms);
      } else {
        warningTerms.push(...terms);
      }
    }

    // 旧文本字段：员工手写的，没有可信度信息 → 按可疑处理
    warningTerms.push(...splitAllergyKeywords(dog?.allergyFoods));

    const blocking = Array.from(new Set(blockingTerms.filter(Boolean)));
    const blockingSet = new Set(blocking);
    const warning = Array.from(
      new Set(warningTerms.filter((term) => term && !blockingSet.has(term))),
    );

    return { blocking, warning, all: [...blocking, ...warning] };
  }

  /** 一份食谱用到的全部食材名 */
  private getRecipeIngredientNames(recipe: any): string[] {
    return (recipe?.items || [])
      .map(
        (item: any) =>
          item?.ingredient?.name || item?.ingredient?.nameEn || '',
      )
      .map((name: string) => String(name || '').trim())
      .filter(Boolean);
  }

  /**
   * 预先算出每份食谱命中了哪些过敏原。
   *
   * 必须**在挑代表之前**算好 —— 改造前是先在每个系列里按生命阶段挑一个、
   * 再拿去打分，于是同一个系列里"不含过敏原"的那个版本
   * 在过敏信息被读到之前就已经被丢掉了。
   */
  private async evaluateRecipeAllergens(
    recipes: any[],
    profile: { blocking: string[]; warning: string[]; all: string[] },
  ): Promise<Map<string, { blocking: AllergenHit[]; warning: AllergenHit[] }>> {
    const result = new Map<
      string,
      { blocking: AllergenHit[]; warning: AllergenHit[] }
    >();

    if (profile.all.length === 0) {
      return result;
    }

    for (const recipe of recipes) {
      const ingredientNames = this.getRecipeIngredientNames(recipe);
      const [blocking, warning] = await Promise.all([
        this.allergenVocabulary.matchIngredients({
          dogAllergens: profile.blocking,
          ingredientNames,
        }),
        this.allergenVocabulary.matchIngredients({
          dogAllergens: profile.warning,
          ingredientNames,
        }),
      ]);
      result.set(this.getRecommendationRecipeKey(recipe), { blocking, warning });
    }

    return result;
  }

  private chooseRecommendedRecipeForDog(recipes: any[], dog: any): any {
    const dogSeriesLifeStage = mapDogProfileToSeriesLifeStage(dog);
    const configuredStages = recipes
      .map((recipe) => this.resolveRecipeSeriesLifeStage(recipe))
      .filter((stage): stage is RecipeSeriesLifeStage => Boolean(stage));
    const defaultStage = resolveDefaultSeriesLifeStage(configuredStages);

    return (
      recipes.find(
        (recipe) =>
          this.resolveRecipeSeriesLifeStage(recipe) === dogSeriesLifeStage,
      ) ??
      (defaultStage
        ? recipes.find(
            (recipe) =>
              this.resolveRecipeSeriesLifeStage(recipe) === defaultStage,
          )
        : undefined) ??
      recipes[0]
    );
  }

  private selectRecommendationRecipesForDog(
    recipes: any[],
    dog: any,
    allergyByRecipeKey?: Map<
      string,
      { blocking: AllergenHit[]; warning: AllergenHit[] }
    >,
  ): any[] {
    // ── 过敏闸门（2026-10-04 第一期）──────────────────────────
    //
    // 「确诊过敏」的版本在这里就被剔除，**在按生命阶段挑代表之前**。
    // 顺序很关键：改造前是先挑代表再打分，同一系列里
    // 不含过敏原的那个版本会在打分之前被丢掉，于是
    // "扣 40 分"这个惩罚根本轮不到生效。
    const eligible = allergyByRecipeKey
      ? recipes.filter((recipe) => {
          const hits = allergyByRecipeKey.get(
            this.getRecommendationRecipeKey(recipe),
          );
          return !hits || hits.blocking.length === 0;
        })
      : recipes;

    // 全被挡住了（例如整个系列都含鸡肉）时，退回原集合会让确诊过敏原漏出去，
    // 所以宁可返回空 —— 页面那边会给出"可选食谱较少"的提示。
    const groupedRecipes = new Map<string, any[]>();
    for (const recipe of eligible) {
      const key = this.getRecommendationGroupKey(recipe);
      const group = groupedRecipes.get(key) ?? [];
      group.push(recipe);
      groupedRecipes.set(key, group);
    }

    return Array.from(groupedRecipes.values()).map((group) =>
      this.chooseRecommendedRecipeForDog(group, dog),
    );
  }

  private getRecommendationRecipeKey(recipe: any): string {
    if (recipe.id) {
      return `row:${recipe.id}`;
    }
    return `recipe:${recipe.recipeId || 'unknown'}:${recipe.version || 0}`;
  }

  private mergeRecommendationRecipeCandidates(
    primaryRecipes: any[],
    seriesRecipes: any[],
  ): any[] {
    const mergedRecipes = new Map<string, any>();
    for (const recipe of [...primaryRecipes, ...seriesRecipes]) {
      mergedRecipes.set(this.getRecommendationRecipeKey(recipe), recipe);
    }
    return Array.from(mergedRecipes.values());
  }

  private scoreRecipeForDog(
    recipe: any,
    dog: any,
    allergyHits?: { blocking: AllergenHit[]; warning: AllergenHit[] },
  ): {
    matchScore: number;
    matchStars: number;
    matchReasons: string[];
    dailyIntakeG: number | null;
    section: 'exclusive' | 'general';
    containsAllergen: boolean;
    allergenNames: string[];
  } {
    const dogLifeStage = this.resolveDogLifeStage(dog);
    const dogSeriesLifeStage = mapDogProfileToSeriesLifeStage(dog);
    const recipeSeriesLifeStage = this.resolveRecipeSeriesLifeStage(recipe);
    const recipeLifeStages = Array.isArray(recipe.applicableLifeStages)
      ? recipe.applicableLifeStages
      : [];
    const pickyFoods = this.normalizeKeywordList(dog.pickyFoods);
    const ingredientNames = this.getRecipeIngredientNames(recipe);
    const ingredientSearchText = ingredientNames.join(' ').toLowerCase();

    let score = 50;
    const matchReasons: string[] = [];

    if (recipeSeriesLifeStage === dogSeriesLifeStage) {
      score += 25;
      matchReasons.push('生命阶段匹配');
    } else if (
      !recipeSeriesLifeStage &&
      recipeLifeStages.includes(dogLifeStage)
    ) {
      score += 25;
      matchReasons.push('生命阶段匹配');
    } else if (recipeLifeStages.length === 0) {
      score += 8;
      matchReasons.push('通用阶段食谱');
    } else {
      score -= 10;
    }

    if (dog.cachedTargetFoodKcal && recipe.energyDensityKcalPerKg) {
      const dailyIntakeG =
        (Number(dog.cachedTargetFoodKcal) /
          Number(recipe.energyDensityKcalPerKg)) *
        1000;
      if (dailyIntakeG >= 80 && dailyIntakeG <= 900) {
        score += 10;
        matchReasons.push('热量密度适合日常喂食');
      }
    }

    // ── 过敏避雷（2026-10-04 第一期改造）────────────────────
    //
    // 改造前这里是**纯文字包含**：
    //     allergyFoods.filter((k) => ingredientSearchText.includes(k))
    // 而顾客填的过敏原与原料库里的食材名不是一套词：
    //     顾客点「鸡肉」 → 原料库叫「鸡胸」「鸡腿肉」「鸡心」「鸡肝」「鸡胗」
    //     "鸡胸".includes("鸡肉") === false
    // 实测 12 个常见标签里 8 个匹配不到任何真实食材。
    //
    // 现在改为走**过敏原词表**（allergen_tag × ingredient_allergen_tag），
    // 查表而不是猜名字；词表没收录的词仍然退回文字包含兜底。
    //
    // 确诊（CONFIRMED）的命中在 selectRecommendationRecipesForDog 里
    // 就已经被整条剔除了，正常走不到这里；这里再罚一次是兜底，
    // 防止将来有人绕过筛选直接调用打分。
    const blockingNames = collectHitAllergenNames(allergyHits?.blocking ?? []);
    const warningNames = collectHitAllergenNames(allergyHits?.warning ?? []);

    if (blockingNames.length > 0) {
      score -= 100;
      matchReasons.push(`含确诊过敏原：${blockingNames.slice(0, 2).join('、')}`);
    } else if (warningNames.length > 0) {
      score -= 60;
      matchReasons.push(`含需谨慎原料：${warningNames.slice(0, 2).join('、')}`);
    }

    const pickyHits = pickyFoods.filter((keyword) =>
      ingredientSearchText.includes(keyword),
    );
    if (pickyHits.length > 0) {
      score -= 12;
      matchReasons.push(
        `可能不是最偏好的口味：${pickyHits.slice(0, 2).join('、')}`,
      );
    }

    if (recipe.favoriteCount > 0 || recipe.diyGenCount > 0) {
      score += Math.min(
        10,
        Math.floor((recipe.favoriteCount + recipe.diyGenCount) / 5),
      );
      matchReasons.push('用户反馈较稳定');
    }

    const boundedScore = Math.max(0, Math.min(100, Math.round(score)));
    const matchStars = Math.max(3, Math.min(5, Math.round(boundedScore / 22)));
    const dailyIntakeG =
      dog.cachedTargetFoodKcal && recipe.energyDensityKcalPerKg
        ? Math.round(
            (Number(dog.cachedTargetFoodKcal) /
              Number(recipe.energyDensityKcalPerKg)) *
              1000,
          )
        : null;

    const allergenNames = [...blockingNames, ...warningNames];

    return {
      matchScore: boundedScore,
      matchStars,
      matchReasons: matchReasons.length
        ? matchReasons.slice(0, 3)
        : ['适合作为日常鲜食候选'],
      dailyIntakeG,
      section: boundedScore >= 70 ? 'exclusive' : 'general',
      containsAllergen: allergenNames.length > 0,
      allergenNames,
    };
  }

  private mapRecommendedRecipe(
    recipe: any,
    dog: any,
    allergyHits?: { blocking: AllergenHit[]; warning: AllergenHit[] },
  ) {
    const score = this.scoreRecipeForDog(recipe, dog, allergyHits);
    const seriesLifeStage = this.resolveRecipeSeriesLifeStage(recipe);
    const topIngredients = (recipe.items || [])
      .filter(
        (item: any) =>
          item.ingredient?.type === 'FOOD' && item.ratioPercent != null,
      )
      .sort((a: any, b: any) => (b.ratioPercent || 0) - (a.ratioPercent || 0))
      .slice(0, 6)
      .map((item: any) => ({
        ingredientId: item.ingredientId,
        name: item.ingredient?.name || item.ingredient?.nameEn || 'Unknown',
        nameEn: item.ingredient?.nameEn,
        ratio: item.ratioPercent || 0,
      }));

    return {
      id: recipe.recipeId || recipe.id,
      version: recipe.version,
      name: recipe.name,
      status: recipe.status,
      energyDensityKcalPerKg: recipe.energyDensityKcalPerKg,
      coverImageUrl: recipe.coverImageUrl?.replace('http://', 'https://'),
      coverTitle: recipe.coverTitle || undefined,
      seriesId: recipe.seriesId || undefined,
      selectedLifeStage: seriesLifeStage || undefined,
      targetHealthTags: recipe.targetHealthTags || [],
      applicableLifeStages: recipe.applicableLifeStages || [],
      items: topIngredients,
      viewCount: recipe.viewCount ?? 0,
      favoriteCount: recipe.favoriteCount ?? 0,
      diyGenCount: recipe.diyGenCount ?? 0,
      ...score,
    };
  }

  private async getAccessibleRecipe(
    id: string,
    shareToken?: string,
    req?: any,
    orderNo?: string | null,
  ): Promise<Recipe | null> {
    /**
     * 交付版本锁定（2026-10-24 · 定制交付页重构）。
     *
     * 带 `orderId` 时，只认**交付记录里冻结的那一版**：
     *   · 订单不属于当前用户 → null（连"有没有交付"都不泄露）；
     *   · 交付记录里查不到这道食谱 → null；
     *   · 按指定版本取不到 → null。
     * **绝不回退最新版** —— 否则顾客会看到没交付给他的配方。
     */
    const pinnedOrderNo = String(orderNo ?? '').trim();
    if (pinnedOrderNo) {
      const user = this.getRequestUser(req);
      const customerId = user?.customerId || user?.userId;
      if (!user || !customerId) return null;

      const delivered =
        await this.deliveryService.resolveDeliveredRecipeVersion(
          {
            orderNo: pinnedOrderNo,
            recipeBusinessId: id,
            customerId,
          },
          /**
           * 员工从后台「订单中心」点进来时，他不是这张单的顾客，
           * 归属校验必然失败。只对 STAFF/ADMIN 放开（2026-10-30）。
           */
          {
            staffBypass: user.role === 'STAFF' || user.role === 'ADMIN',
          },
        );
      if (!delivered) return null;

      return this.recipeRepository.findByIdAndVersion(
        id,
        delivered.version,
      );
    }

    const recipe = await this.recipeRepository.findById(id);
    if (!recipe) {
      return null;
    }

    if (await this.isPublicRecipeVisible(recipe)) {
      return recipe;
    }

    if (recipe.status === RecipeStatus.PRIVATE_CUSTOM) {
      const user = this.getRequestUser(req);
      if (
        user &&
        (user.role === 'STAFF' ||
          user.role === 'ADMIN' ||
          recipe.customerOwnerId === (user.customerId || user.userId))
      ) {
        return recipe;
      }
    }

    return (await this.hasRestrictedRecipeAccess(id, shareToken, req))
      ? recipe
      : null;
  }

  private async incrementRecipeViewCount(id: string): Promise<void> {
    const latestRecipe = await this.prisma.recipe.findFirst({
      where: { recipeId: id },
      orderBy: { version: 'desc' },
      select: { id: true },
    });

    if (!latestRecipe) {
      return;
    }

    await this.prisma.recipe.update({
      where: { id: latestRecipe.id },
      data: { viewCount: { increment: 1 } },
    });
  }

  private mapPublicIngredient(ingredient: any): any {
    if (!ingredient) {
      return undefined;
    }

    const purchaseLink = ingredient.properties?.purchase_link;
    const activeNutrients =
      ingredient.type === 'SUPPLEMENT'
        ? resolveSupplementNutrients({
            nutritionProfile: ingredient.nutritionProfile,
            fallback: ingredient.properties?.active_nutrients,
          })
        : ingredient.properties?.active_nutrients || undefined;
    const addTimingLabel =
      ingredient.type === 'SUPPLEMENT'
        ? resolveSupplementAddTimingLabel(ingredient.properties?.add_timing)
        : undefined;

    return {
      id: ingredient.id,
      name: ingredient.name,
      type: ingredient.type,
      diyEnabled: ingredient.diyEnabled,
      brand: ingredient.brand || undefined,
      productModel: ingredient.productModel || undefined,
      purchaseChannel: ingredient.purchaseChannel || undefined,
      displayUnit: ingredient.unitDisplayLabel || undefined,
      imageUrl: ingredient.properties?.image_url || undefined,
      purchaseLink: purchaseLink || undefined,
      addTimingLabel,
      activeNutrients:
        activeNutrients && Object.keys(activeNutrients).length > 0
          ? activeNutrients
          : undefined,
      properties: ingredient.properties || undefined,
    };
  }

  @Get('filter-options')
  @ApiOperation({ summary: 'Get available filter options' })
  @ApiResponse({
    status: 200,
    description: 'Filter options',
    type: FilterOptionsDto,
  })
  async getFilterOptions(): Promise<ApiResponseDto<FilterOptionsDto>> {
    const options = await this.recipeRepository.getFilterOptions();
    return ApiResponseDto.success(options);
  }

  @Get('staff/all')
  @UseGuards(AuthGuard, StaffGuard)
  @ApiSecurity('bearer')
  @ApiOperation({ summary: 'List recipes for staff (drafts excluded)' })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Filter by status; drafts are no longer listed',
  })
  async listStaffRecipes(
    @Query('status') status?: string,
  ): Promise<ApiResponseDto<any>> {
    /**
     * 2026-11-07：食谱管理页不再展示草稿。
     * 旧客户端如果还带着 status=DRAFT，也直接给空列表，避免把草稿又放出来。
     */
    if (status === RecipeStatus.DRAFT) {
      return ApiResponseDto.success([]);
    }

    /**
     * 2026-11-07：
     *  · 「公开」只取真正上架到食谱橱窗的食谱；
     *  · 「全部」= 调整后的公开 + 私密定制，不再把其它状态混进来；
     *  · 「私密定制」保持原口径。
     */
    let where: any;
    if (status === RecipeStatus.PUBLIC) {
      where = this.buildShowcaseRecipeWhere();
    } else if (status === RecipeStatus.PRIVATE_CUSTOM) {
      where = { status: RecipeStatus.PRIVATE_CUSTOM };
    } else if (status) {
      // 保留未知状态的原行为，交给数据库校验。
      where = { status };
    } else {
      where = {
        OR: [
          this.buildShowcaseRecipeWhere(),
          { status: RecipeStatus.PRIVATE_CUSTOM },
        ],
      };
    }

    // Get all versions; the latest one per recipe (series stage) wins below.
    const recipes = await this.prisma.recipe.findMany({
      where,
      orderBy: [{ recipeId: 'asc' }, { version: 'desc' }],
      select: {
        id: true,
        recipeId: true,
        seriesId: true,
        seriesLifeStage: true,
        name: true,
        status: true,
        coverImageUrl: true,
        version: true,
        createdAt: true,
        updatedAt: true,
        applicableLifeStages: true,
        targetHealthTags: true,
        isCustomRecipe: true,
        customOrderId: true,
        customerOwnerId: true,
        sourceDesignRecipeId: true,
        series: {
          select: {
            businessStatus: true,
            status: true,
            deletedAt: true,
          },
        },
      },
    });

    // 双保险：即使旧查询条件漏了，草稿也不进入食谱管理页。
    const nonDraftRecipes = recipes.filter(
      (recipe) => recipe.status !== RecipeStatus.DRAFT,
    );

    // 同样兜一层：公开只留橱窗可见的；私密定制全部保留。
    const scopedRecipes = nonDraftRecipes.filter(
      (recipe) =>
        recipe.status === RecipeStatus.PRIVATE_CUSTOM ||
        this.isShowcasePublicRecipe(recipe),
    );

    /**
     * 顾客自己用食谱设计器做的食谱不进入员工食谱管理页。
     * 与后台「用户的食谱」分类共用同一套判断（看设计稿是谁建的），
     * 不是看有没有绑定顾客 —— 我们给顾客做的私密定制也绑定顾客。
     */
    const visibleRecipes =
      await this.recipeService.filterOutUserRecipes(scopedRecipes);

    /**
     * 只展示最新版本：
     *  · 同一系列 + 同一生命阶段 = 同一道菜，只保留最新的一版；
     *  · 正常版本链（recipeId 相同）按 version 取最新；
     *  · 历史数据里同一阶段可能换过 recipeId，此时以最新创建的那条为准；
     *  · 不在系列里的独立食谱（老数据）按 recipeId 去重。
     */
    const latestBySeriesStage = new Map<
      string,
      (typeof visibleRecipes)[number]
    >();
    for (const recipe of visibleRecipes) {
      const key =
        recipe.seriesId && recipe.seriesLifeStage
          ? `series:${recipe.seriesId}:${recipe.seriesLifeStage}`
          : `recipe:${recipe.recipeId}`;
      const current = latestBySeriesStage.get(key);

      if (!current) {
        latestBySeriesStage.set(key, recipe);
        continue;
      }

      if (current.recipeId === recipe.recipeId) {
        // orderBy 已保证同一 recipeId 的第一条是最高版本；这里再兜一层。
        if (recipe.version > current.version) {
          latestBySeriesStage.set(key, recipe);
        }
        continue;
      }

      if (
        new Date(recipe.createdAt).getTime() >
        new Date(current.createdAt).getTime()
      ) {
        latestBySeriesStage.set(key, recipe);
      }
    }

    const summaries = [...latestBySeriesStage.values()].map((r: any) => ({
      id: r.recipeId,
      version: r.version,
      name: r.name,
      status: r.status,
      coverImageUrl: r.coverImageUrl?.replace('http://', 'https://'),
      applicableLifeStages: r.applicableLifeStages || [],
      targetHealthTags: r.targetHealthTags || [],
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));

    // 所有标签页统一按最后更新时间倒序；时间相同再按创建时间 / id 稳定排序。
    const timestamp = (value: Date | string | null | undefined): number => {
      if (!value) return 0;
      const time = new Date(value).getTime();
      return Number.isFinite(time) ? time : 0;
    };
    summaries.sort((left: any, right: any) => {
      const byUpdatedAt =
        timestamp(right.updatedAt || right.createdAt) -
        timestamp(left.updatedAt || left.createdAt);
      if (byUpdatedAt !== 0) return byUpdatedAt;

      const byCreatedAt =
        timestamp(right.createdAt) - timestamp(left.createdAt);
      if (byCreatedAt !== 0) return byCreatedAt;

      return String(right.id).localeCompare(String(left.id));
    });

    return ApiResponseDto.success(summaries);
  }

  @Get()
  @ApiOperation({ summary: 'List public recipes (paginated)' })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of recipes',
  })
  async listRecipes(
    @Query('lifeStages') lifeStages?: string,
    @Query('healthTags') healthTags?: string,
    @Query('excludeTags') excludeTags?: string,
    @Query('excludeIngredients') excludeIngredients?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<ApiResponseDto<any>> {
    // Parse pagination parameters
    const parsedPage = page ? parseInt(page, 10) : 1;
    const parsedPageSize = pageSize ? parseInt(pageSize, 10) : 10;

    // Parse filter parameters
    const lifeStageArray = lifeStages ? lifeStages.split(',') : [];
    const healthTagArray = healthTags ? healthTags.split(',') : [];
    const excludeTagArray = excludeTags ? excludeTags.split(',') : [];
    const excludeIngredientArray = excludeIngredients
      ? excludeIngredients.split(',')
      : [];

    // Get paginated recipes
    const paginatedResult =
      await this.recipeRepository.findPublicRecipesPaginated({
        lifeStages: lifeStageArray,
        healthTags: healthTagArray,
        excludeTags: excludeTagArray,
        excludeIngredients: excludeIngredientArray,
        page: parsedPage,
        pageSize: parsedPageSize,
      });

    // DEBUG: Log recipe count (development only)
    if (
      process.env.NODE_ENV === 'development' ||
      process.env.DEBUG === 'true'
    ) {
      console.log(
        `[RecipesController] GET /recipes: page ${parsedPage}, pageSize ${parsedPageSize}, lifeStages: [${lifeStageArray.join(',') || 'all'}], healthTags: [${healthTagArray.join(',') || 'all'}], excludeTags: [${excludeTagArray.join(',') || 'none'}], excludeIngredients: [${excludeIngredientArray.join(',') || 'none'}], found ${paginatedResult.data.length} PUBLIC recipe(s) (total: ${paginatedResult.total})`,
      );
      if (paginatedResult.data.length === 0) {
        console.warn(
          `[RecipesController] WARNING: No PUBLIC recipes found for page ${parsedPage}. Check seeding logic.`,
        );
      }
    }

    const summaries: RecipeSummaryDto[] = paginatedResult.data.map(
      (recipe: any) => {
        // Parse JSON fields
        const applicableLifeStages = recipe.applicableLifeStages || [];
        const targetHealthTags = recipe.targetHealthTags || [];

        // Get top 6 ingredients by ratio (only FOOD type)
        const topIngredients = (recipe.items || [])
          .filter(
            (item: any) =>
              item.ingredient?.type === 'FOOD' && item.ratioPercent != null,
          )
          .sort(
            (a: any, b: any) => (b.ratioPercent || 0) - (a.ratioPercent || 0),
          )
          .slice(0, 6)
          .map((item: any) => ({
            ingredientId: item.ingredientId,
            name: item.ingredient?.name || item.ingredient?.nameEn || 'Unknown',
            nameEn: item.ingredient?.nameEn,
            ratio: item.ratioPercent || 0,
          }));

        return {
          id: recipe.id,
          version: recipe.version,
          name: recipe.name,
          status: recipe.status as RecipeStatus,
          energyDensityKcalPerKg: recipe.energyDensityKcalPerKg,
          coverImageUrl: recipe.coverImageUrl?.replace('http://', 'https://'),
          coverTitle: recipe.coverTitle || undefined,
          // 系列级封面角标（合规词表引用，已上移到系列层级）。
          // 小程序优先用它，为空时才回退到 coverTitle，保证迁移期间不会出现角标消失。
          coverBadges: recipe.coverBadges || [],
          seriesId: recipe.seriesId || undefined,
          targetHealthTags: targetHealthTags,
          applicableLifeStages: applicableLifeStages,
          items: topIngredients,
          viewCount: recipe.viewCount ?? 0,
          favoriteCount: recipe.favoriteCount ?? 0,
          diyGenCount: recipe.diyGenCount ?? 0,
        };
      },
    );

    // Return paginated result
    return ApiResponseDto.success({
      data: summaries,
      total: paginatedResult.total,
      page: paginatedResult.page,
      pageSize: paginatedResult.pageSize,
      hasMore: paginatedResult.hasMore,
    });
  }

  @Get('recommendations/:dogId')
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: 'List personalized recipe recommendations for a dog',
  })
  @ApiSecurity('X-Customer-Id')
  @ApiParam({ name: 'dogId', description: 'Dog ID' })
  async listRecommendationsForDog(
    @Param('dogId') dogId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    const dog = await this.prisma.dog.findFirst({
      where: {
        id: dogId,
        ownerId: user.customerId,
      },
      select: {
        id: true,
        name: true,
        birthday: true,
        currentWeightKg: true,
        mealsPerDay: true,
        lifeStageOverride: true,
        activityLevel: true,
        cachedTargetFoodKcal: true,
        allergyFoods: true,
        // 顾客在健康档案里填的结构化过敏记录 —— 推荐打分的过敏避雷要与旧文本字段合并使用。
        // 2026-10-04 起还要带上 certainty：确诊的食谱直接不进推荐，
        // 可疑/待排查的保留但重罚（见 buildDogAllergenProfile）。
        allergyRecords: { select: { allergen: true, certainty: true } },
        pickyFoods: true,
        avatarUrl: true,
        // 2026-09-19：生命阶段判定需要品种阈值与体型。
        // 缺这些字段时权威实现会回落成"中型犬 / 12 个月 / 10 岁"，
        // 于是首页推荐又会和实际配餐标准对不上。
        gender: true,
        sizeClassOverride: true,
        breedId: true,
      },
    });

    if (!dog) {
      return ApiResponseDto.error(404, 'Dog not found');
    }

    // 品种单独查：Dog 模型上没有品种关联字段。
    // 生命阶段判定需要它的成犬/老年阈值与体型分类。
    const dogBreed = dog.breedId
      ? await this.prisma.dogBreed.findUnique({
          where: { id: dog.breedId },
          select: {
            adultAgeMonths: true,
            seniorAgeYears: true,
            sizeCategory: true,
          },
        })
      : null;
    const dogWithBreed = { ...dog, breed: dogBreed };

    const recommendationRecipeInclude = {
      items: {
        include: { ingredient: true },
      },
    };
    const recommendationRecipeOrderBy = [
      { favoriteCount: 'desc' as const },
      { diyGenCount: 'desc' as const },
      { createdAt: 'desc' as const },
    ];

    const recipes = await this.prisma.recipe.findMany({
      where: this.buildPublicRecipeWhere(),
      include: recommendationRecipeInclude,
      orderBy: recommendationRecipeOrderBy,
      take: 60,
    });
    const seriesIds = Array.from(
      new Set(
        recipes
          .map((recipe) => recipe.seriesId)
          .filter((seriesId): seriesId is string => Boolean(seriesId)),
      ),
    );
    const seriesRecipes =
      seriesIds.length > 0
        ? await this.prisma.recipe.findMany({
            where: this.buildPublicRecipeWhere({
              seriesId: { in: seriesIds },
            }),
            include: recommendationRecipeInclude,
            orderBy: recommendationRecipeOrderBy,
          })
        : [];
    const recommendationCandidates = this.mergeRecommendationRecipeCandidates(
      recipes,
      seriesRecipes,
    );

    const allergenProfile = this.buildDogAllergenProfile(dogWithBreed);
    const allergyByRecipeKey = await this.evaluateRecipeAllergens(
      recommendationCandidates,
      allergenProfile,
    );

    const ranked = this.selectRecommendationRecipesForDog(
      recommendationCandidates,
      dogWithBreed,
      allergyByRecipeKey,
    )
      .map((recipe) =>
        this.mapRecommendedRecipe(
          recipe,
          dogWithBreed,
          allergyByRecipeKey.get(this.getRecommendationRecipeKey(recipe)),
        ),
      )
      .sort((left, right) => {
        return (
          right.matchScore - left.matchScore ||
          (right.favoriteCount || 0) - (left.favoriteCount || 0)
        );
      });

    const exclusive = ranked
      .filter((recipe) => recipe.section === 'exclusive')
      .slice(0, 12);
    const exclusiveIds = new Set(exclusive.map((recipe) => recipe.id));
    const general = ranked
      .filter((recipe) => !exclusiveIds.has(recipe.id))
      .slice(0, 12);

    return ApiResponseDto.success({
      dog: {
        id: dog.id,
        name: dog.name,
        avatarUrl: dog.avatarUrl,
        currentWeightKg: dog.currentWeightKg,
        mealsPerDay: dog.mealsPerDay,
        lifeStage: this.resolveDogLifeStage(dogWithBreed),
        targetFoodKcal: dog.cachedTargetFoodKcal || null,
      },
      exclusive,
      general,
      /**
       * 过敏信息回给页面，让顾客看得见"系统按什么在避开"。
       *
       * 2026-10-04 第一期新增：老板确认「确诊过敏的食谱从推荐里彻底拿掉」，
       * 拿掉之后页面上必须**说清楚为什么少了**——
       * 否则顾客只会以为食谱变少了，而不是"系统在保护我的狗"。
       */
      allergyPolicy: {
        /** 确诊：含这些的食谱已从推荐中移除 */
        excluded: allergenProfile.blocking,
        /** 可疑 / 待排查：保留但已标注 */
        cautioned: allergenProfile.warning,
        /** 避开之后还剩多少可选 */
        remainingCount: ranked.length,
        /** 避到没有可选时，页面要给安抚与出口，而不是一个空列表 */
        emptyAfterExclusion:
          ranked.length === 0 && allergenProfile.all.length > 0,
      },
    });
  }

  private async loadPreparationMethodNameMap(
    values: Array<string | null | undefined>,
  ): Promise<Map<string, string>> {
    const ids = extractLegacyPreparationMethodIds(values);
    if (ids.length === 0) {
      return new Map();
    }

    const methods = await this.prisma.preparationMethod.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });

    return new Map(
      methods.map((method: { id: string; name: string }) => [
        method.id,
        method.name,
      ]),
    );
  }

  /**
   * Map nutrition detailed data fields from DB format to API format
   * DB fields use snake_case (e.g., ash_dm_pct)
   * API expects camelCase (e.g., ashPercent)
   */
  private mapNutritionDetailedData(dbData: any): any {
    if (!dbData) return undefined;
    const summary = dbData.summary ?? dbData;

    return {
      source: dbData.source,
      schemaVersion: dbData.schemaVersion,
      standard: dbData.standard,
      scenario: dbData.scenario,
      generatedAt: dbData.generatedAt,
      report: dbData.report,
      summary: dbData.summary,
      energyDensityKcalPerKg: summary.energy_density_kcal_per_kg,
      proteinPercent: summary.protein_dm_pct,
      fatPercent: summary.fat_dm_pct,
      ashPercent: summary.ash_dm_pct,
      moisturePercent: summary.moisture_pct,
      crudeFiberPercent: summary.fiber_dm_pct,
      carbohydratePercent: summary.carbs_dm_pct,
      calciumPhosphorusRatio: summary.ca_p_ratio,
    };
  }

  private getRequestUser(req?: any): RequestUser | null {
    if (req?.user) {
      return req.user as RequestUser;
    }

    try {
      const authHeader = req?.headers?.authorization;
      if (authHeader && typeof authHeader === 'string') {
        const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
        if (bearerMatch?.[1]) {
          return this.jwtAuthService.validateToken(bearerMatch[1]);
        }
      }
    } catch {
      return null;
    }

    return null;
  }

  private async loadPublicSeriesRecipes(id: string): Promise<any[]> {
    const candidates = await this.prisma.recipe.findMany({
      where: this.buildPublicRecipeWhere({
        OR: [{ seriesId: id }, { recipeId: id }],
      }),
      include: {
        items: {
          include: {
            ingredient: true,
            nutritionFood: true,
            supplementAlternatives: {
              include: {
                alternativeIngredient: true,
              },
              orderBy: {
                sortOrder: 'asc',
              },
            },
          },
          orderBy: {
            sortOrder: 'asc',
          },
        },
        healthTagAssignments: {
          include: {
            healthTag: true,
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { version: 'desc' }],
    });

    const seriesId = candidates.find((recipe) => recipe.seriesId)?.seriesId;
    if (!seriesId || seriesId === id) {
      return candidates;
    }

    return this.prisma.recipe.findMany({
      where: this.buildPublicRecipeWhere({ seriesId }),
      include: {
        items: {
          include: {
            ingredient: true,
            nutritionFood: true,
            supplementAlternatives: {
              include: {
                alternativeIngredient: true,
              },
              orderBy: {
                sortOrder: 'asc',
              },
            },
          },
          orderBy: {
            sortOrder: 'asc',
          },
        },
        healthTagAssignments: {
          include: {
            healthTag: true,
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { version: 'desc' }],
    });
  }

  private latestPublicVersionBySeriesStage(recipes: any[]): any[] {
    return selectLatestPublishedSeriesLifeStageVersions(recipes);
  }

  private getSeriesLifeStageLabel(
    lifeStage?: string | null,
  ): string | undefined {
    if (!lifeStage) {
      return undefined;
    }
    return (
      SERIES_LIFE_STAGE_LABELS[lifeStage as RecipeSeriesLifeStage] ?? lifeStage
    );
  }

  private async resolveRequestedSeriesLifeStage(
    manualLifeStage?: string,
    dogId?: string,
    req?: any,
    manual = false,
  ): Promise<ResolvedSeriesLifeStageRequest> {
    const result: ResolvedSeriesLifeStageRequest = {
      requestedLifeStage: manualLifeStage || undefined,
      ...(manual && manualLifeStage ? { manualLifeStage } : {}),
      hasDog: false,
    };

    if (!dogId) {
      return result;
    }

    const user = this.getRequestUser(req);
    const ownerId = user?.customerId || user?.userId;
    if (!ownerId) {
      return result;
    }

    const dog = await this.prisma.dog.findFirst({
      where: {
        id: dogId,
        ownerId,
      },
      select: {
        id: true,
        name: true,
        breedId: true,
        birthday: true,
        lifeStageOverride: true,
        activityLevel: true,
        // 生命阶段判定需要体型：混血犬没有品种行，只能靠 sizeClassOverride
        sizeClassOverride: true,
      },
    });

    if (!dog) {
      return result;
    }

    const breed = dog.breedId
      ? await this.prisma.dogBreed.findUnique({
          where: { id: dog.breedId },
          select: {
            adultAgeMonths: true,
            seniorAgeYears: true,
            // 品种自带的体型分类，是 sizeClassOverride 之外的体型来源
            sizeCategory: true,
          },
        })
      : null;
    const dogLifeStage = mapDogProfileToSeriesLifeStage({
      ...dog,
      breed,
    });
    const requestedLifeStage =
      manual && manualLifeStage ? manualLifeStage : dogLifeStage;
    return {
      requestedLifeStage,
      hasDog: true,
      dogId: dog.id,
      dogLifeStage,
      dogName: dog.name,
      ...(manual && manualLifeStage && manualLifeStage !== dogLifeStage
        ? { manualLifeStage }
        : {}),
    };
  }

  private async resolvePublicSeriesSelection(
    id: string,
    manualLifeStage?: string,
    dogId?: string,
    req?: any,
    manual = false,
  ): Promise<{
    recipe: Recipe;
    lifeStageMatch: RecipeLifeStageMatchDto;
    availableLifeStageVersions: RecipeLifeStageVersionDto[];
  } | null> {
    const seriesRecipes = this.latestPublicVersionBySeriesStage(
      await this.loadPublicSeriesRecipes(id),
    );
    if (seriesRecipes.length === 0) {
      return null;
    }

    const lifeStageRequest = await this.resolveRequestedSeriesLifeStage(
      manualLifeStage,
      dogId,
      req,
      manual,
    );
    const requestedLifeStage = lifeStageRequest.requestedLifeStage;
    const configuredStages = seriesRecipes.map(
      (recipe) => recipe.seriesLifeStage,
    );
    const exactMatch = requestedLifeStage
      ? seriesRecipes.find(
          (recipe) => recipe.seriesLifeStage === requestedLifeStage,
        )
      : null;
    const concreteRecipeMatch = !requestedLifeStage
      ? seriesRecipes.find(
          (recipe) =>
            recipe.recipeId === id && recipe.seriesId && recipe.seriesId !== id,
        )
      : null;
    const fallbackLifeStage = resolveDefaultSeriesLifeStage(configuredStages);
    const selectedRecipe =
      exactMatch ??
      concreteRecipeMatch ??
      seriesRecipes.find(
        (recipe) => recipe.seriesLifeStage === fallbackLifeStage,
      ) ??
      seriesRecipes[0];
    const selectedLifeStage = selectedRecipe.seriesLifeStage;
    const hasDog = lifeStageRequest.hasDog;
    const dogLifeStage = lifeStageRequest.dogLifeStage;
    const matchedManually = Boolean(lifeStageRequest.manualLifeStage && exactMatch);
    const matchType: RecipeLifeStageMatchDto['matchType'] =
      !hasDog
        ? 'NO_DOG'
        : matchedManually
          ? 'MANUAL_MISMATCH'
          : selectedLifeStage === dogLifeStage
            ? 'MATCHED'
            : concreteRecipeMatch
              ? 'MATCHED'
              : selectedLifeStage === 'HIGH_ACTIVITY_ADULT'
                ? 'FALLBACK_ADULT'
                : 'FALLBACK_FIRST';
    const riskLevel = hasDog
      ? resolveSeriesLifeStageRisk(dogLifeStage, selectedLifeStage)
      : 'NONE';
    const message =
      matchType === 'MANUAL_MISMATCH'
        ? this.buildManualLifeStageMismatchMessage(
            lifeStageRequest.dogName,
            lifeStageRequest.dogLifeStage,
            selectedLifeStage,
          )
        : matchType === 'FALLBACK_ADULT' || matchType === 'FALLBACK_FIRST'
          ? SERIES_FALLBACK_MESSAGE
          : undefined;

    const availableLifeStageVersions = seriesRecipes.map((recipe) => ({
      lifeStage: recipe.seriesLifeStage,
      label:
        this.getSeriesLifeStageLabel(recipe.seriesLifeStage) ??
        recipe.seriesLifeStage,
      recipeId: recipe.recipeId,
      isCurrent: recipe.recipeId === selectedRecipe.recipeId,
    }));

    return {
      recipe: this.mapPrismaRecipeToControllerRecipe(selectedRecipe),
      lifeStageMatch: {
        requestedLifeStage,
        ...(lifeStageRequest.dogId
          ? {
              dogId: lifeStageRequest.dogId,
              dogName: lifeStageRequest.dogName,
            }
          : {}),
        ...(lifeStageRequest.dogLifeStage
          ? {
              dogLifeStage: lifeStageRequest.dogLifeStage,
              dogLifeStageLabel: this.getSeriesLifeStageLabel(
                lifeStageRequest.dogLifeStage,
              ),
            }
          : {}),
        selectedLifeStage,
        matchType,
        riskLevel,
        ...(lifeStageRequest.manualLifeStage
          ? { manualLifeStage: lifeStageRequest.manualLifeStage }
          : {}),
        ...(message ? { message } : {}),
      },
      availableLifeStageVersions,
    };
  }

  private buildManualLifeStageMismatchMessage(
    dogName: string | undefined,
    dogLifeStage: string | undefined,
    selectedLifeStage: string | undefined,
  ): string {
    const dogLabel = this.getSeriesLifeStageLabel(dogLifeStage) ?? '未知阶段';
    const selectedLabel =
      this.getSeriesLifeStageLabel(selectedLifeStage) ?? '当前阶段';
    return `${dogName || '当前狗狗'}的档案对应${dogLabel}，当前手动展示${selectedLabel}版本，请确认是否适合。`;
  }

  private mapPrismaRecipeToControllerRecipe(recipe: any): Recipe {
    return {
      id: recipe.recipeId,
      version: recipe.version,
      name: recipe.name,
      status: recipe.status,
      energyDensityKcalPerKg: recipe.energyDensityKcalPerKg,
      productionLossRate: recipe.productionLossRate,
      coverImageUrl: recipe.coverImageUrl,
      coverTitle: recipe.coverTitle,
      targetHealthTags:
        recipe.healthTagAssignments?.map(
          (assignment: any) => assignment.healthTagId,
        ) ??
        recipe.targetHealthTags ??
        [],
      applicableLifeStages: recipe.applicableLifeStages ?? [],
      items:
        recipe.items?.map((item: any) => ({
          ...item,
          supplementAlternatives: item.supplementAlternatives?.map(
            (alternative: any) => ({
              ingredientId:
                alternative.ingredientId ?? alternative.alternativeIngredientId,
              ingredientName:
                alternative.ingredientName ??
                alternative.alternativeIngredient?.name,
              ingredient:
                alternative.ingredient ?? alternative.alternativeIngredient,
            }),
          ),
        })) ?? [],
      designSource: recipe.designSource,
      nutritionStandard: recipe.nutritionStandard,
      nutritionDetailedData: recipe.nutritionDetailedData,
      description: recipe.description,
      sellingPoint: (recipe as any).sellingPoint,
      viewCount: recipe.viewCount ?? 0,
      favoriteCount: recipe.favoriteCount ?? 0,
      diyGenCount: recipe.diyGenCount ?? 0,
      seriesId: recipe.seriesId,
      seriesLifeStage: recipe.seriesLifeStage,
    };
  }

  /**
   * 读取系列级封面角标（合规词表词名，按 sortOrder 排序）。
   *
   * 角标已上移到系列层级：一次设置，全系列生命阶段版本共用；
   * 且只允许引用合规词表，从结构上杜绝违规词出现在商品橱窗上。
   */
  private async resolveSeriesCoverBadges(
    seriesId?: string | null,
  ): Promise<string[]> {
    if (!seriesId) return [];
    const rows = await this.prisma.recipeSeriesCoverBadge.findMany({
      where: { seriesId },
      include: { healthTag: { select: { name: true } } },
      orderBy: { sortOrder: 'asc' },
    });
    return pickCoverBadgeNames(rows.map((row) => row.healthTag?.name));
  }

  /**
   * W3：客户自己用设计器做的食谱**不能买成品**（想要成品必须走定制流程）。
   *
   * 判定方式与后台一致：**该食谱所在的系列由 CUSTOMER 角色创建**。
   * 生产实测：221 条客户自建系列 100% 由客户创建，标准公开与员工代做无一是 —— 零误判。
   */
  private async resolveCanBuyFinishedFood(recipe: {
    seriesId?: string | null;
  }): Promise<boolean> {
    if (!recipe.seriesId) {
      return true; // 无系列的独立/历史食谱不受限
    }

    const series = await this.prisma.recipeSeries.findUnique({
      where: { id: recipe.seriesId },
      select: { createdBy: true },
    });
    if (!series?.createdBy) {
      return true;
    }

    const creator = await this.prisma.user.findUnique({
      where: { id: series.createdBy },
      select: { role: true },
    });
    return creator?.role !== 'CUSTOMER';
  }

  /** 组装详情，并附上"能不能买成品"这个开关（W3） */
  private async buildRecipeDetailWithOrderability(
    recipe: Recipe,
    seriesSelection?: {
      lifeStageMatch: RecipeLifeStageMatchDto;
      availableLifeStageVersions: RecipeLifeStageVersionDto[];
    },
  ): Promise<RecipeDetailDto> {
    const [detail, canBuyFinishedFood] = await Promise.all([
      this.buildRecipeDetail(recipe, seriesSelection),
      this.resolveCanBuyFinishedFood(recipe),
    ]);
    return { ...detail, canBuyFinishedFood };
  }

  private async buildRecipeDetail(
    recipe: Recipe,
    seriesSelection?: {
      lifeStageMatch: RecipeLifeStageMatchDto;
      availableLifeStageVersions: RecipeLifeStageVersionDto[];
    },
  ): Promise<RecipeDetailDto> {
    const methodMap = await this.loadPreparationMethodNameMap(
      (recipe.items || []).map((item: any) => item.preparationMethod),
    );

    const allIngredients = await Promise.all(
      (recipe.items || [])
        .sort((a: any, b: any) => (a.sortOrder || 0) - (b.sortOrder || 0))
        .map(async (item: any) => {
          const ingredientType = item.ingredient?.type;

          const result: any = {
            id: item.id,
            ingredientId: item.ingredientId,
            ingredientName: item.ingredient?.name || 'Unknown',
            name: item.ingredient?.name || 'Unknown',
            nutritionFoodId: item.nutritionFoodId || undefined,
            nutritionState: item.nutritionState || undefined,
            nutritionStateLabel: item.nutritionStateLabel || undefined,
            nutritionFood: item.nutritionFood || undefined,
            preparationMethod:
              resolvePreparationMethodText(item.preparationMethod, methodMap, {
                preserveUnresolvedLegacy: false,
              }) || undefined,
            sortOrder: item.sortOrder || 0,
            ingredientType: ingredientType || undefined,
            exampleWeight:
              item.exampleWeight != null ? item.exampleWeight : undefined,
            ratioPercent:
              item.ratioPercent != null ? item.ratioPercent : undefined,
            nutrientTargetKey: item.nutrientTargetKey || undefined,
            nutrientTargetValue: item.nutrientTargetValue || undefined,
            supplementTargets: item.supplementTargets || undefined,
            ingredient: this.mapPublicIngredient(item.ingredient),
            supplementAlternativeIngredientIds:
              item.supplementAlternativeIngredientIds || undefined,
            supplementAlternatives:
              item.supplementAlternatives?.map((alternative: any) => ({
                ingredientId: alternative.ingredientId,
                ingredientName: alternative.ingredientName,
                ingredient: this.mapPublicIngredient(alternative.ingredient),
              })) || undefined,
          };

          if (ingredientType === 'FOOD') {
            result.ratio = item.ratioPercent != null ? item.ratioPercent : 0;
          }

          return result;
        }),
    );

    const nutritionDetailedData = this.mapNutritionDetailedData(
      (recipe as any).nutritionDetailedData,
    );

    const selectedLifeStage =
      seriesSelection?.lifeStageMatch.selectedLifeStage ??
      recipe.seriesLifeStage ??
      undefined;

    // 系列级封面角标（合规词表词名）。角标已上移到系列层级，
    // 领域映射不带 series，因此这里单独取一次（按 seriesId 走索引，开销很小）。
    const coverBadges = await this.resolveSeriesCoverBadges(recipe.seriesId);

    return {
      id: recipe.id,
      version: recipe.version,
      name: recipe.name,
      status: recipe.status as RecipeStatus,
      energyDensityKcalPerKg: recipe.energyDensityKcalPerKg,
      coverImageUrl: (recipe as any).coverImageUrl?.replace(
        'http://',
        'https://',
      ),
      coverTitle: (recipe as any).coverTitle || undefined,
      coverBadges,
      seriesId: recipe.seriesId || undefined,
      selectedLifeStage,
      selectedLifeStageLabel: this.getSeriesLifeStageLabel(selectedLifeStage),
      selectedRecipeId: recipe.id,
      lifeStageMatch: seriesSelection?.lifeStageMatch ?? {
        selectedLifeStage,
        matchType: 'LEGACY',
      },
      availableLifeStageVersions:
        seriesSelection?.availableLifeStageVersions ?? undefined,
      productionLossRate: recipe.productionLossRate,
      nutritionStandard: (recipe.nutritionStandard ||
        NutritionStandard.FEDIAF_2021) as NutritionStandard,
      designSource: (recipe as any).designSource || undefined,
      targetHealthTags: (recipe as any).targetHealthTags || [],
      applicableLifeStages: (recipe as any).applicableLifeStages || [],
      nutritionDetailedData,
      items: allIngredients,
      description: (recipe as any).description,
      sellingPoint: (recipe as any).sellingPoint,
    };
  }

  /**
   * Resolve the life-stage version recipe IDs for a recipe (or series) id.
   * Returns [{ recipeId, lifeStage }] for the latest public version per stage,
   * or a single entry (lifeStage null) for standalone recipes.
   */
  private async resolveReferencePriceLifeStageVersions(
    id: string,
  ): Promise<
    Array<{ recipeId: string; version: number | null; lifeStage: string | null }>
  > {
    const candidates = await this.loadPublicSeriesRecipes(id);
    const seriesRecipes = this.latestPublicVersionBySeriesStage(candidates);

    if (seriesRecipes.length > 0) {
      return seriesRecipes.map((recipe) => ({
        recipeId: recipe.recipeId,
        version: recipe.version ?? null,
        lifeStage: recipe.seriesLifeStage ?? null,
      }));
    }

    /**
     * 没有生命阶段的老/独立食谱：取**最新已发布**版本。
     * 以前这里只回 recipeId，算价会按"版本号最大"取 —— 可能是草稿。
     */
    // 只在"同一个 recipeId"里挑版本：candidates 可能包含同系列的别的食谱，
    // 跨 recipeId 比版本号会把别的菜的价拿过来（仓库里已有这个坑的注释）。
    const latestPublic = candidates
      .filter((candidate) => candidate.recipeId === id)
      .sort((left, right) => (right.version ?? 0) - (left.version ?? 0))[0];
    if (latestPublic) {
      return [
        {
          recipeId: latestPublic.recipeId,
          version: latestPublic.version ?? null,
          lifeStage: null,
        },
      ];
    }

    // 非公开食谱（员工预览 / 顾客自建）：仍按最新版本算，用于内部参考
    return [{ recipeId: id, version: null, lifeStage: null }];
  }

  @Get('reference-prices')
  @ApiOperation({
    summary: 'Get reference prices (per 100g, shipping included) for recipes',
  })
  @ApiQuery({
    name: 'ids',
    required: true,
    description: 'Comma-separated recipe IDs',
  })
  async getReferencePrices(
    @Query('ids') ids?: string,
  ): Promise<ApiResponseDto<any>> {
    // 去重 + 上限：这是公开、免登录接口，一次最多算 30 个（首页一页只有 10 个）。
    // 没有上限的话，有人拿几百个 id 就能把连接池占满、拖慢结账。
    const idList = [
      ...new Set(
        (ids || '')
          .split(',')
          .map((id) => id.trim())
          .filter((id) => Boolean(id)),
      ),
    ].slice(0, 30);

    /**
     * 并行算：首页一次要 10 张卡片、约 24 个生命阶段，串行在生产实测 1.3 秒+。
     * 每个版本之间互不依赖，Promise.all 之后耗时主要看最慢的一次。
     */
    const results = await Promise.all(
      idList.map(async (id) => {
        try {
          const versions = await this.resolveReferencePriceLifeStageVersions(id);
          const lifeStagePrices = await Promise.all(
            versions.map(async (version) => {
              const price = await this.orderService.computeRecipeReferencePrice(
                version.recipeId,
                version.version ?? undefined,
              );
              return {
                recipeId: version.recipeId,
                lifeStage: version.lifeStage,
                pricePer100g: price.pricePer100g,
              };
            }),
          );

          const prices = lifeStagePrices.map((item) => item.pricePer100g);
          const minPricePer100g =
            prices.length > 0 ? Math.min(...prices) : null;

          return { recipeId: id, minPricePer100g, lifeStagePrices };
        } catch (error) {
          // 无法计算参考价（缺系统配置/原料等）时跳过，前端静默不展示
          console.warn(
            `[Recipes] Skip reference price for recipe ${id}:`,
            (error as Error)?.message,
          );
          return null;
        }
      }),
    );

    const items = results.filter(
      (item): item is NonNullable<typeof item> => item !== null,
    );

    return ApiResponseDto.success({ items });
  }

  @Get(':id/reference-price')
  @ApiOperation({
    summary: 'Get reference price (per 100g, shipping included) for a recipe',
  })
  @ApiParam({ name: 'id', description: 'Recipe ID' })
  async getReferencePrice(
    @Param('id') id: string,
  ): Promise<ApiResponseDto<any>> {
    const versions = await this.resolveReferencePriceLifeStageVersions(id);
    const lifeStagePrices = await Promise.all(
      versions.map(async (version) => {
        const price = await this.orderService.computeRecipeReferencePrice(
          version.recipeId,
          version.version ?? undefined,
        );
        return {
          recipeId: version.recipeId,
          lifeStage: version.lifeStage,
          pricePer100g: price.pricePer100g,
        };
      }),
    );

    const prices = lifeStagePrices.map((item) => item.pricePer100g);
    const minPricePer100g = prices.length > 0 ? Math.min(...prices) : null;

    return ApiResponseDto.success({ minPricePer100g, lifeStagePrices });
  }

  /**
   * 生命阶段匹配结论（按食谱 + 狗狗）
   *
   * 小程序的生命阶段提醒统一走这里，不再在客户端自己重算 ——
   * 客户端重算存在三个问题：
   *   1) 口径与后端不一致（体型、品种阈值、默认值都不同）；
   *   2) 认不出混血犬的体型，算不出阶段；
   *   3) 算不出来时被当成"匹配"，直接静默放行（不提示、不拦截）。
   *
   * 复用详情页同一条选择逻辑（resolvePublicSeriesSelection），保证两处结论一致。
   */
  /**
   * 记录顾客「已知晓生命阶段不匹配、仍继续」的确认。
   *
   * 留痕的意义：弹出提醒如果不落库，将来狗狗因吃错生命阶段的粮出问题，
   * 我们拿不出"已经明确告知过顾客"的任何凭据。
   *
   * 每次确认都会记一条（不去重）—— 顾客可能多次下单、多次确认，
   * 每次都是一次独立的告知行为，留全比留一条更有说服力。
   */
  @Post(':id/life-stage-acknowledgement')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: 'Record that the customer acknowledged a life-stage mismatch',
  })
  @ApiParam({ name: 'id', description: 'Recipe ID or series ID' })
  @ApiBody({ type: LifeStageAcknowledgementDto })
  @ApiResponse({ status: 201, description: 'Acknowledgement recorded' })
  async recordLifeStageAcknowledgement(
    @Param('id') id: string,
    @Body() dto: LifeStageAcknowledgementDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<{ id: string }>> {
    const record = await this.prisma.lifeStageAcknowledgement.create({
      data: {
        customerId: user.customerId,
        dogId: dto.dogId,
        recipeId: id,
        matchType: dto.matchType,
        dogLifeStage: dto.dogLifeStage ?? null,
        recipeLifeStage: dto.recipeLifeStage ?? null,
        source: dto.source,
      },
      select: { id: true },
    });

    return ApiResponseDto.success(record);
  }

  @Get(':id/life-stage-match')
  @ApiOperation({ summary: 'Get life stage match verdict for a recipe and a dog' })
  @ApiParam({ name: 'id', description: 'Recipe ID or series ID' })
  @ApiQuery({
    name: 'dogId',
    required: false,
    description: 'Dog ID used to resolve the expected life stage',
  })
  @ApiQuery({
    name: 'lifeStage',
    required: false,
    description: 'Manually selected series life stage',
  })
  @ApiQuery({
    name: 'manual',
    required: false,
    description: 'true 表示顾客主动选的版本；缺省时按是否传 lifeStage 兼容旧版',
  })
  @ApiResponse({ status: 200, description: 'Life stage match verdict' })
  async getLifeStageMatch(
    @Param('id') id: string,
    @Query('dogId') dogId?: string,
    @Query('lifeStage') lifeStage?: string,
    @Query('manual') manual?: string,
    @Req() req?: any,
  ): Promise<ApiResponseDto<RecipeLifeStageMatchDto>> {
    const manualSelection =
      manual === undefined ? Boolean(lifeStage) : manual === 'true';
    const selection = await this.resolvePublicSeriesSelection(
      id,
      lifeStage,
      dogId,
      req,
      manualSelection,
    );

    // 非公开系列 / 没有任何生命阶段版本：结论为 LEGACY，
    // 前端据此不显示任何生命阶段提醒（本来也只有一个版本）。
    return ApiResponseDto.success(
      selection?.lifeStageMatch ?? {
        matchType: 'LEGACY',
        selectedLifeStage: '',
      },
    );
  }

    @Get(':id/supplement-candidates')
  @ApiOperation({ summary: '补剂可替代候选（服务端计算用量）' })
  @ApiQuery({
    name: 'totalWeightG',
    required: false,
    description: '这批食物总重（g）；没有制作单时必填',
  })
  @ApiQuery({
    name: 'diySheetId',
    required: false,
    description: '制作单 ID：优先用制作单的包规/天数算总重',
  })
  @ApiQuery({ name: 'orderId', required: false, description: '定制订单号（锁定交付版本）' })
  @ApiQuery({ name: 'shareToken', required: false })
  async getSupplementCandidates(
    @Param('id') id: string,
    @Query('totalWeightG') totalWeightGRaw?: string,
    @Query('diySheetId') diySheetId?: string,
    @Query('orderId') orderId?: string,
    @Query('shareToken') shareToken?: string,
    @Req() req?: any,
  ): Promise<ApiResponseDto<unknown>> {
    const recipe = await this.getAccessibleRecipe(id, shareToken, req, orderId);
    if (!recipe) {
      throw new NotFoundException('Recipe not found');
    }

    let totalWeightG = Number(totalWeightGRaw);
    let weightSource: 'DIY_SHEET' | 'QUERY' = 'QUERY';

    if (diySheetId) {
      const user = this.getRequestUser(req);
      const userId = user?.customerId || user?.userId;
      const sheet = await this.prisma.dIYSheet.findUnique({
        where: { id: diySheetId },
        select: {
          userId: true,
          packagePlan: true,
          dailyIntakeG: true,
          cycleDays: true,
        },
      });
      if (sheet && userId && sheet.userId === userId) {
        const fromSheet = computeSheetTotalWeightG(sheet);
        if (fromSheet > 0) {
          totalWeightG = fromSheet;
          weightSource = 'DIY_SHEET';
        }
      }
    }

    if (!Number.isFinite(totalWeightG) || totalWeightG <= 0) {
      throw new BadRequestException('缺少这批食物的总重，无法计算补剂用量');
    }

    return ApiResponseDto.success(
      await this.supplementCandidateService.resolveForRecipe({
        recipeBusinessId: id,
        recipeVersion: recipe.version,
        totalWeightG,
        weightSource,
        audience: 'CUSTOMER',
      }),
    );
  }

  @Get('ai-cover-availability')
  @UseGuards(AuthGuard, StaffGuard)
  @ApiSecurity('bearer')
  @ApiOperation({ summary: 'AI 封面图是否可用（未配置时按钮置灰）' })
  async getAiCoverAvailability(): Promise<
    ApiResponseDto<{ available: boolean }>
  > {
    return ApiResponseDto.success({
      available: await this.recipeCoverImageService.isAvailable(),
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get recipe detail' })
  @ApiParam({ name: 'id', description: 'Recipe ID' })
  @ApiQuery({
    name: 'shareToken',
    required: false,
    description: 'Share token for non-public recipes',
  })
  @ApiQuery({
    name: 'dogId',
    required: false,
    description: 'Dog ID for series life-stage selection',
  })
  @ApiQuery({
    name: 'lifeStage',
    required: false,
    description: 'Manual series life stage',
  })
  @ApiQuery({
    name: 'orderId',
    required: false,
    description:
      '定制订单号：带上则按交付记录冻结的那一版取食谱（不带取最新版）',
  })
  @ApiResponse({
    status: 200,
    description: 'Recipe detail',
    type: RecipeDetailDto,
  })
  @ApiResponse({ status: 404, description: 'Recipe not found' })
  async getRecipe(
    @Param('id') id: string,
    @Query('shareToken') shareToken?: string,
    @Query('dogId') dogId?: string,
    @Query('lifeStage') lifeStage?: string,
    @Query('manual') manual?: string,
    @Query('orderId') orderId?: string,
    @Req() req?: any,
  ): Promise<ApiResponseDto<RecipeDetailDto> | ApiResponseDto<null>> {
    const pinnedOrderId = String(orderId ?? '').trim();
    const manualSelection =
      manual === undefined ? Boolean(lifeStage) : manual === 'true';
    const accessibleRecipe = await this.getAccessibleRecipe(
      id,
      shareToken,
      req,
      pinnedOrderId || null,
    );

    /**
     * 交付版本锁定：带 orderId 时只走这一版，**不落到下面的公开系列选择**
     * （那条路会取最新版，正好是我们要避免的）。
     */
    if (pinnedOrderId) {
      if (!accessibleRecipe) {
        return ApiResponseDto.error(404, 'Recipe not found');
      }
      return ApiResponseDto.success(
        await this.buildRecipeDetailWithOrderability(accessibleRecipe),
      );
    }

    if (accessibleRecipe && accessibleRecipe.status !== 'PUBLIC') {
      return ApiResponseDto.success(
        await this.buildRecipeDetailWithOrderability(accessibleRecipe),
      );
    }

    const seriesSelection = await this.resolvePublicSeriesSelection(
      id,
      lifeStage,
      dogId,
      req,
      manualSelection,
    );
    if (seriesSelection) {
      return ApiResponseDto.success(
        await this.buildRecipeDetailWithOrderability(seriesSelection.recipe, {
          lifeStageMatch: seriesSelection.lifeStageMatch,
          availableLifeStageVersions:
            seriesSelection.availableLifeStageVersions,
        }),
      );
    }

    const recipe = accessibleRecipe;
    const hasRestrictedAccess =
      recipe?.status === RecipeStatus.PUBLIC && Boolean(recipe.seriesId)
        ? await this.hasRestrictedRecipeAccess(id, shareToken, req)
        : false;
    if (
      !recipe ||
      (recipe.status === RecipeStatus.PUBLIC &&
        Boolean(recipe.seriesId) &&
        !hasRestrictedAccess)
    ) {
      return ApiResponseDto.error(404, 'Recipe not found');
    }

    return ApiResponseDto.success(
      await this.buildRecipeDetailWithOrderability(recipe),
    );
  }

  @Post(':id/view')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Track recipe detail view' })
  @ApiParam({ name: 'id', description: 'Recipe ID' })
  async trackRecipeView(
    @Param('id') id: string,
    @Body('shareToken') shareToken?: string,
    @Req() req?: any,
  ): Promise<ApiResponseDto<null>> {
    const recipe = await this.getAccessibleRecipe(id, shareToken, req);
    if (!recipe) {
      return ApiResponseDto.error(404, 'Recipe not found');
    }

    await this.incrementRecipeViewCount(id);
    return ApiResponseDto.success(null);
  }

    @Post(':id/share-token')
  @UseGuards(AuthGuard, StaffGuard)
  @ApiSecurity('bearer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate share token for a recipe' })
  @ApiParam({ name: 'id', description: 'Recipe ID' })
  async createShareToken(
    @Param('id') id: string,
    @Req() req: any,
  ): Promise<ApiResponseDto<{ token: string; expiresAt: string }>> {
    const user: RequestUser = req.user;

    // Verify recipe exists (any status)
    const recipe = await this.prisma.recipe.findFirst({
      where: { recipeId: id },
      orderBy: { version: 'desc' },
    });

    if (!recipe) {
      throw new NotFoundException('Recipe not found');
    }

    const token = generateToken(32);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    await this.prisma.recipeShareToken.create({
      data: {
        recipeId: recipe.id,
        token,
        createdBy: user.userId,
        expiresAt,
      },
    });

    return ApiResponseDto.success({
      token,
      expiresAt: expiresAt.toISOString(),
    });
  }

  @Post(':id/diy-sheet')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate DIY process sheet for recipe' })
  @ApiParam({ name: 'id', description: 'Recipe ID' })
  @ApiBody({ type: GenerateDiySheetDto })
  @ApiResponse({
    status: 200,
    description: 'DIY process sheet generated successfully',
    type: DiySheetResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Recipe not found' })
  @ApiResponse({ status: 400, description: 'Invalid request body' })
  async generateDiySheet(
    @Param('id') recipeId: string,
    @Body() dto: GenerateDiySheetDto,
    @Req() req?: any,
  ): Promise<ApiResponseDto<DiySheetResponseDto> | ApiResponseDto<null>> {
    try {
      const pinnedOrderId = String(dto.orderId ?? '').trim();
      const accessibleRecipe = await this.getAccessibleRecipe(
        recipeId,
        dto.shareToken,
        req,
        pinnedOrderId || null,
      );
      if (!accessibleRecipe) {
        return ApiResponseDto.error(404, `Recipe not found: ${recipeId}`);
      }

      const sheetData = await this.diySheetService.generateDiySheet(
        recipeId,
        dto.dogId,
        pinnedOrderId ? accessibleRecipe.version : undefined,
      );

      /**
       * 计数落在**实际取用的那一版**上：带 orderId 时是交付版本，
       * 不带时才是最新版。计数错了不影响顾客，但运营看到的「生成次数」
       * 会跑到一个没被用过的版本上。
       */
      const countedRecipe = await this.prisma.recipe.findFirst({
        where: {
          recipeId,
          ...(pinnedOrderId ? { version: accessibleRecipe.version } : {}),
        },
        orderBy: { version: 'desc' },
        select: { id: true },
      });
      if (countedRecipe) {
        await this.prisma.recipe.update({
          where: { id: countedRecipe.id },
          data: { diyGenCount: { increment: 1 } },
        });
      }

      const response: DiySheetResponseDto = {
        recipeId: sheetData.recipeId,
        recipeName: sheetData.recipeName,
        steps: sheetData.steps,
        recommendedDailyIntakeG: sheetData.recommendedDailyIntakeG,
      };

      return ApiResponseDto.success(response);
    } catch (error) {
      if (error instanceof NotFoundException) {
        return ApiResponseDto.error(404, error.message);
      }
      throw error;
    }
  }
}
