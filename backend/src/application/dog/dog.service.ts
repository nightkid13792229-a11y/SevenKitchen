/**
 * Dog Application Service
 * Application layer service for Dog domain operations
 */

import {
  Injectable,
  Inject,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { DogRepository } from '../../domain/dog/dog.repository';
import type { DogBreedRepository } from '../../domain/dog/dog-breed.repository';
import type { RecipeRepository } from '../../domain/recipe/recipe.repository';
import { PrismaService } from '../../infrastructure/prisma.service';
import { Dog } from '../../domain/dog/dog.entity';
import {
  DogGender,
  ActivityLevel,
  LifeStageOverride,
  DogSizeCategory,
  TreatInputMode,
  TreatLevel,
  MIXED_BREED_VIRTUAL_ID,
  calculateDogEnergy,
} from '../../domain';
import { DogBreed } from '../../domain/dog/dog-breed.entity';
import { GrowthCurveType } from '../../domain/dog/enums';
import { SearchGovernanceService } from '../search-governance/search-governance.service';
import { WeightGoalPlanService } from '../weight-goal-plan/weight-goal-plan.service';

export interface CreateDogProfileDto {
  ownerId: string;
  name: string;
  breedId: string;
  customBreedName?: string | null;
  birthday: Date;
  gender: DogGender;
  isNeutered: boolean;
  currentWeightKg: number;
  bcsScore: number;
  activityLevel: ActivityLevel;
  lifeStageOverride: LifeStageOverride;
  sizeClassOverride?: DogSizeCategory | null;
  mealsPerDay?: number;
  treatInputMode?: TreatInputMode;
  treatLevel?: TreatLevel;
  manualTreatKcal?: number | null;
  medicalHistory?: string | null;
  allergyFoods?: string | null;
  pickyFoods?: string | null;
  /**
   * 「这一项是顾客亲自选的」标记。
   * 体况评分/活动量/每日餐数都有默认值，不区分确认的话定制门槛就形同虚设。
   */
  bcsScoreConfirmed?: boolean;
  activityLevelConfirmed?: boolean;
  mealsPerDayConfirmed?: boolean;
  /** 喜欢的食材（决策 7）：顾客端可写，配方设计器与 AI 会读 */
  preferredFoods?: string | null;
  /** 繁殖期信息（2026-09-29，阶段 A）：切到怀孕/哺乳时填写 */
  matingDate?: Date | string | null;
  expectedDueDate?: Date | string | null;
  deliveryDate?: Date | string | null;
  litterSize?: number | null;
}

export interface UpdateDogProfileDto {
  name?: string;
  breedId?: string;
  customBreedName?: string | null;
  birthday?: Date;
  gender?: DogGender;
  isNeutered?: boolean;
  currentWeightKg?: number;
  bcsScore?: number;
  activityLevel?: ActivityLevel;
  lifeStageOverride?: LifeStageOverride;
  sizeClassOverride?: DogSizeCategory | null;
  mealsPerDay?: number;
  treatInputMode?: TreatInputMode;
  treatLevel?: TreatLevel;
  manualTreatKcal?: number | null;
  medicalHistory?: string | null;
  allergyFoods?: string | null;
  pickyFoods?: string | null;
  /** 同 CreateDogProfileDto：只认 true，不传/false 都不清掉已有确认时间 */
  bcsScoreConfirmed?: boolean;
  activityLevelConfirmed?: boolean;
  mealsPerDayConfirmed?: boolean;
  preferredFoods?: string | null;
  /** 繁殖期信息（2026-09-29，阶段 A）：切到怀孕/哺乳时填写 */
  matingDate?: Date | string | null;
  expectedDueDate?: Date | string | null;
  deliveryDate?: Date | string | null;
  litterSize?: number | null;
}

/** 把 DTO 里的日期字符串转成 Date；空值/非法值一律返回 null */
function toNullableDate(value: Date | string | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export interface CalcPreviewResult {
  rer: number;
  totalDer: number;
  finalFoodKcal: number;
  treatDeduction: number;
  isTreatCapped: boolean;
  dailyIntakeG?: number;
  /** 这个能量是哪来的：计划生效期间为 'PLAN'，否则是算法默认输出（阶段 D1） */
  energySource?: 'PLAN' | 'ALGORITHM';
  /** 计划值（仅 energySource === 'PLAN' 时有） */
  planKcal?: number | null;
  /**
   * 没有食谱时用于估算克数的能量密度（已上架食谱的中位数）。
   * 只作展示，不参与计价或制作单。
   */
  estimatedEnergyDensityKcalPerKg?: number;
  /** 按上面那个密度估算的每日克数（约数，页面要带「约」字） */
  estimatedDailyIntakeG?: number;
  calcDetails?: Record<string, any>;
}

export interface CalcForRecipeResult {
  rer: number;
  totalDer: number;
  finalFoodKcal: number;
  treatDeduction: number;
  isTreatCapped: boolean;
  dailyIntakeG: number;
  perMealIntakeG: number;
  mealsPerDay: number;
}

/**
 * 仓储令牌。
 *
 * `DOG_REPOSITORY` / `DOG_BREED_REPOSITORY` 定义在 `./repository-tokens`
 * 而不是这里 —— 本文件要注入 WeightGoalPlanService，而它又要用这两个令牌，
 * 定义在这里会形成循环 import（详见那个文件的说明）。
 * 这里 import 后再 re-export，本文件自己能用，既有
 * `from '../dog/dog.service'` 的写法也继续可用。
 */
import {
  DOG_REPOSITORY,
  DOG_BREED_REPOSITORY,
} from './repository-tokens';

export { DOG_REPOSITORY, DOG_BREED_REPOSITORY };

export const RECIPE_REPOSITORY = Symbol('RecipeRepository');
export const PRISMA_SERVICE = Symbol('PrismaService');
const MAX_BREED_SEARCH_EXPANSION_TERMS = 8;
const BREED_DESCRIPTOR_PATTERN = /(小型|中型|大型|巨型|标准|迷你|玩具|微型)/g;
type BreedTokenSource = 'name' | 'derived' | 'alias';

interface BreedSearchToken {
  value: string;
  source: BreedTokenSource;
}

@Injectable()
export class DogService {
  private readonly logger = new Logger(DogService.name);

  constructor(
    @Inject(DOG_REPOSITORY)
    private readonly dogRepository: DogRepository,
    @Inject(DOG_BREED_REPOSITORY)
    private readonly dogBreedRepository: DogBreedRepository,
    @Inject(RECIPE_REPOSITORY)
    private readonly recipeRepository: RecipeRepository, // TODO: Will be used for recipe-based calculations
    @Inject(PRISMA_SERVICE)
    private readonly prisma: PrismaService,
    /**
     * 体重管理计划（阶段 D1/D2）。
     *
     * 注入它是为了让 `calcPreview` 输出的能量**反映计划**——
     * 计划生效时该狗的每日能量目标就是计划值，而不是算法默认维持量。
     * 狗狗详情的三个出口都走 calcPreview，改这一处就全覆盖了。
     *
     * 不会成环：WeightGoalPlanService 依赖的是 DOG_REPOSITORY 这个**工厂 provider**，
     * 不是 DogService 本身。
     */
    private readonly weightGoalPlanService: WeightGoalPlanService,
    @Optional()
    private readonly searchGovernanceService?: SearchGovernanceService,
  ) {
    // Suppress unused warning - will be used in future implementations
    void this.recipeRepository;
  }

  async searchBreeds(keyword?: string | null): Promise<DogBreed[]> {
    const trimmed = keyword?.trim() ?? '';
    const breeds = await this.dogBreedRepository.findAll();
    if (!trimmed) {
      return breeds;
    }

    const searchTerms = await this.expandBreedSearchTerms(trimmed);

    const results = breeds
      .map((breed) => ({
        breed,
        score: this.getBreedSearchScore(breed, searchTerms),
      }))
      .filter((item) => item.score > 0)
      .sort((left, right) => {
        const scoreDiff = right.score - left.score;
        if (scoreDiff !== 0) {
          return scoreDiff;
        }

        if (Boolean(right.breed.isCommon) !== Boolean(left.breed.isCommon)) {
          return Number(Boolean(right.breed.isCommon)) - Number(Boolean(left.breed.isCommon));
        }

        if (left.breed.name.length !== right.breed.name.length) {
          return left.breed.name.length - right.breed.name.length;
        }

        return left.breed.name.localeCompare(right.breed.name, 'zh-Hans-CN');
      })
      .map((item) => item.breed);

    await this.recordBreedSearch(trimmed, results.length);

    return results;
  }

  private async recordBreedSearch(rawQuery: string, resultCount: number) {
    if (!rawQuery.trim()) {
      return;
    }

    try {
      await this.searchGovernanceService?.recordSearchEvent({
        domain: 'BREED',
        source: 'DOG_BREED_SEARCH',
        rawQuery,
        resultCount,
      });
    } catch {
      this.logger.warn('Breed search logging failed');
    }
  }

  private async expandBreedSearchTerms(keyword: string): Promise<string[]> {
    let expanded: string[] = [];
    try {
      expanded =
        (await this.searchGovernanceService?.expandQuery('BREED', keyword)) ?? [];
    } catch {
      this.logger.warn(
        'Breed search governance expansion failed; falling back to original query',
      );
    }

    const seen = new Set<string>();
    return [keyword, ...expanded]
      .map((term) => term.trim())
      .filter((term) => {
        const normalized = this.normalizeBreedSearchText(term);
        if (!normalized || seen.has(normalized)) {
          return false;
        }
        seen.add(normalized);
        return true;
      })
      .slice(0, MAX_BREED_SEARCH_EXPANSION_TERMS);
  }

  private getBreedSearchScore(breed: DogBreed, searchTerms: string[]): number {
    const breedTokens = this.getBreedSearchTokens(breed);

    return searchTerms.reduce((bestScore, term, termIndex) => {
      const termScore = this.getTermSearchScore(breedTokens, term);
      if (termScore <= 0) {
        return bestScore;
      }

      return Math.max(
        bestScore,
        (MAX_BREED_SEARCH_EXPANSION_TERMS - termIndex) * 1000 + termScore,
      );
    }, 0);
  }

  private getTermSearchScore(breedTokens: BreedSearchToken[], term: string): number {
    const termVariants = this.buildBreedTokenVariants(term);
    return breedTokens.reduce((bestScore, token) => {
      const tokenScore = termVariants.reduce((bestVariantScore, variant) => {
        if (token.value === variant) {
          return Math.max(bestVariantScore, this.getExactBreedTokenScore(token.source));
        }

        if (token.value.startsWith(variant) || variant.startsWith(token.value)) {
          return Math.max(bestVariantScore, this.getPrefixBreedTokenScore(token.source));
        }

        if (token.value.includes(variant) || variant.includes(token.value)) {
          return Math.max(bestVariantScore, this.getContainsBreedTokenScore(token.source));
        }

        return bestVariantScore;
      }, 0);

      return Math.max(bestScore, tokenScore);
    }, 0);
  }

  private getExactBreedTokenScore(source: BreedTokenSource): number {
    if (source === 'name') {
      return 120;
    }

    if (source === 'derived') {
      return 115;
    }

    return 110;
  }

  private getPrefixBreedTokenScore(source: BreedTokenSource): number {
    if (source === 'alias') {
      return 95;
    }

    return source === 'name' ? 100 : 98;
  }

  private getContainsBreedTokenScore(source: BreedTokenSource): number {
    if (source === 'alias') {
      return 85;
    }

    return source === 'name' ? 90 : 88;
  }

  private getBreedSearchTokens(breed: DogBreed): BreedSearchToken[] {
    const seen = new Set<string>();
    const tokens: BreedSearchToken[] = [];
    const addTokens = (values: string[], source: BreedTokenSource) => {
      values.forEach((value) => {
        if (!value) {
          return;
        }

        const dedupeKey = `${source}:${value}`;
        if (seen.has(dedupeKey)) {
          return;
        }

        seen.add(dedupeKey);
        tokens.push({ value, source });
      });
    };

    addTokens(this.buildBreedTokenVariants(breed.name), 'name');
    addTokens(
      this.buildBreedTokenVariants(breed.name.split(/[（(]/)[0] || ''),
      'derived',
    );
    (breed.aliases ?? []).forEach((alias) => {
      addTokens(this.buildBreedTokenVariants(alias), 'alias');
    });

    return tokens;
  }

  private buildBreedTokenVariants(value: string): string[] {
    const normalized = this.normalizeBreedSearchText(value);
    if (!normalized) {
      return [];
    }

    const withoutDescriptors = normalized.replace(BREED_DESCRIPTOR_PATTERN, '');
    const withoutSuffix = normalized.replace(/[犬狗]/g, '');
    const withoutDescriptorsAndSuffix = withoutDescriptors.replace(/[犬狗]/g, '');

    return Array.from(
      new Set([
        normalized,
        withoutDescriptors,
        withoutSuffix,
        withoutDescriptorsAndSuffix,
      ]),
    ).filter((token) => token.length > 0);
  }

  private normalizeBreedSearchText(value: string): string {
    return value
      .normalize('NFKC')
      .trim()
      .toLocaleLowerCase()
      .replace(/\s+/g, '')
      .replace(/[()（）【】[\]{}_\-\\/·•.,，。:：;；'"`]/g, '');
  }

  /**
   * Create a new dog profile
   */
  async createDogProfile(dto: CreateDogProfileDto): Promise<Dog> {
    const id = randomUUID();

    const dog = new Dog(
      id,
      dto.ownerId,
      dto.name,
      dto.breedId,
      dto.customBreedName ?? null,
      dto.birthday,
      dto.gender,
      dto.isNeutered,
      dto.currentWeightKg,
      dto.bcsScore,
      dto.activityLevel,
      dto.lifeStageOverride,
      dto.sizeClassOverride ?? null,
      dto.mealsPerDay ?? 2,
      dto.treatInputMode ?? TreatInputMode.ESTIMATE_LEVEL,
      dto.treatLevel ?? TreatLevel.LOW,
      dto.manualTreatKcal ?? null,
      dto.medicalHistory ?? null,
      dto.allergyFoods ?? null,
      dto.pickyFoods ?? null,
      0, // 下面算完再填
      null, // avatarUrl：建档流程不设置头像
      new Date(), // weightUpdatedAt：建档时的体重就是当下录的
      // 确认状态：只有前端明确说"顾客点过这一项"才记确认时间。
      // 体况评分/活动量/每日餐数都有默认值，不区分确认的话，门槛就永远拦不住人。
      dto.bcsScoreConfirmed ? new Date() : null,
      dto.bcsScoreConfirmed ? dto.currentWeightKg : null,
      dto.activityLevelConfirmed ? new Date() : null,
      dto.mealsPerDayConfirmed ? new Date() : null,
      dto.preferredFoods ?? null,
      // 繁殖期信息（2026-09-29，阶段 A）
      toNullableDate(dto.matingDate),
      toNullableDate(dto.expectedDueDate),
      toNullableDate(dto.deliveryDate),
      dto.litterSize ?? null,
    );

    // 先把「会抛错的部分」全部做完，最后才落库。
    //
    // 2026-09-21 复盘：原实现是先 save 再计算。计算一旦失败（最典型的是混血犬
    // 没有选体型，dog-calc 会直接抛错），用户收到的是「创建失败」，
    // 但那条狗已经写进数据库了 —— 用户重试就会多出一条重复档案。
    // 现在任何校验/计算异常都发生在写库之前，失败就是真的什么都没留下。
    const breed = await this.loadBreedForCalculation(dog.breedId);
    const calcResult = calculateDogEnergy(dog, undefined, breed);
    dog.cachedTargetFoodKcal = Math.round(calcResult.finalFoodKcal);

    return this.dogRepository.save(dog);
  }

  /**
   * 载入品种用于能量计算。
   *
   * 品种必须真实存在 —— 混血犬使用虚拟品种 ID，不查库。
   * 原先品种查不到时会静默按「中型犬」继续算，档案里的体型判断会悄悄失真；
   * 这里改为明确报错，让前端提示用户重新选择品种。
   */
  private async loadBreedForCalculation(breedId: string): Promise<DogBreed | null> {
    const breed = await this.dogBreedRepository.findById(breedId);

    if (!breed && breedId !== MIXED_BREED_VIRTUAL_ID) {
      throw new BadRequestException('品种不存在，请重新选择品种');
    }

    return breed;
  }

  /**
   * Update dog profile
   * Recalculates cachedTargetFoodKcal if relevant fields changed
   */
  async updateDogProfile(
    dogId: string,
    dto: UpdateDogProfileDto,
  ): Promise<Dog> {
    const dog = await this.dogRepository.findById(dogId);
    if (!dog) {
      throw new Error(`Dog not found: ${dogId}`);
    }

    // Fields that require recalculation
    const fieldsRequiringRecalc = [
      'breedId',
      'birthday',
      'currentWeightKg',
      'bcsScore',
      'activityLevel',
      'lifeStageOverride',
      'sizeClassOverride',
      'isNeutered',
      'treatInputMode',
      'treatLevel',
      'manualTreatKcal',
    ];

    // Check if any relevant field changed
    const needsRecalc = fieldsRequiringRecalc.some(
      (field) => dto[field as keyof UpdateDogProfileDto] !== undefined,
    );

    // Apply updates
    dog.updateProfile(dto as Partial<Dog>);

    // 繁殖期日期：DTO 传进来是字符串，实体要 Date。
    // 单独转换而不是依赖 `as Partial<Dog>` —— 那个断言会绕过类型检查，
    // 字符串直接赋给 Date 字段不会报错，但会在下游悄悄出错。
    if (dto.matingDate !== undefined) {
      dog.matingDate = toNullableDate(dto.matingDate);
    }
    if (dto.expectedDueDate !== undefined) {
      dog.expectedDueDate = toNullableDate(dto.expectedDueDate);
    }
    if (dto.deliveryDate !== undefined) {
      dog.deliveryDate = toNullableDate(dto.deliveryDate);
    }
    if (dto.litterSize !== undefined) {
      dog.litterSize = dto.litterSize ?? null;
    }

    // 确认状态：只有顾客这次真的点了那一项，才刷新确认时间。
    // 只认 true —— 不传或传 false 都不清掉已有确认（改个名字不该让确认状态失效）。
    if (dto.bcsScoreConfirmed) {
      dog.bcsScoreConfirmedAt = new Date();
      // 阶段 C8：同时记下确认时的体重，供「体重变化 ≥5% 提醒重评」使用
      dog.bcsConfirmedWeightKg = dog.currentWeightKg;
    }
    if (dto.activityLevelConfirmed) {
      dog.activityLevelConfirmedAt = new Date();
    }
    if (dto.mealsPerDayConfirmed) {
      dog.mealsPerDayConfirmedAt = new Date();
    }

    // Recalculate if needed (use updated breedId)
    if (needsRecalc) {
      const breed = await this.dogBreedRepository.findById(dog.breedId);
      const calcResult = calculateDogEnergy(dog, undefined, breed);
      dog.cachedTargetFoodKcal = Math.round(calcResult.finalFoodKcal);
    }

    return this.dogRepository.save(dog);
  }

  async deleteDogProfile(customerId: string, dogId: string): Promise<void> {
    const dog = await this.dogRepository.findById(dogId);

    if (!dog) {
      throw new NotFoundException('Dog not found');
    }

    if (dog.ownerId !== customerId) {
      throw new ForbiddenException('Access denied');
    }

    const orderCount = await this.prisma.order.count({
      where: {
        dogId,
      },
    });

    if (orderCount > 0) {
      // 文案与 dogs.controller 里客户可见的删除拦截保持一致（中文），
      // 避免一旦这个方法被接到对外链路就把英文报错弹给用户。
      throw new BadRequestException(
        `当前宠物存在 ${orderCount} 条关联订单，档案需保留用于订单记录，暂不支持删除`,
      );
    }

    await this.dogRepository.delete(dogId);
  }

  /**
   * Calculate energy requirement preview
   * Pure calculation function - no database writes
   */
  async calcPreview(dogId: string): Promise<CalcPreviewResult> {
    const dog = await this.dogRepository.findById(dogId);
    if (!dog) {
      throw new Error(`Dog not found: ${dogId}`);
    }

    // Load breed for calculation
    const breed = await this.dogBreedRepository.findById(dog.breedId);

    // Calculate with detailed breakdown for UI display
    const calcResult = calculateDogEnergy(dog, undefined, breed, true);

    /**
     * 计划生效时改用计划值（阶段 D1/D2）。
     *
     * ⚠️ 口径：计划的 currentKcal 是从 RER 推导的**毛值**，与算法的 gross 同一层，
     * 所以替换的是毛值，**零食仍要照常扣减**。
     * 两版算法都满足 `gross = finalFoodKcal + treatDeduction`。
     */
    const override = await this.weightGoalPlanService.applyActivePlanOverride(
      dogId,
      calcResult.finalFoodKcal + calcResult.treatDeduction,
      calcResult.treatDeduction,
    );

    const finalFoodKcal = override.finalFoodKcal;

    /**
     * 克数按同一比例缩放。
     *
     * 原来的 `dailyIntakeG / finalFoodKcal` 就是能量密度的倒数，
     * 所以换了能量之后 `新克数 = 新能量 × 旧克数 ÷ 旧能量`，
     * 不需要把密度再反解出来。
     */
    const dailyIntakeG =
      calcResult.dailyIntakeG === undefined ||
      calcResult.finalFoodKcal <= 0
        ? calcResult.dailyIntakeG
        : (finalFoodKcal * calcResult.dailyIntakeG) /
          calcResult.finalFoodKcal;

    /**
     * 没有食谱时的估算克数（阶段 D2）。
     *
     * 定制页在**还没有食谱**的时候就要给顾客一个「每天约多少克」的概念，
     * 而克数必须要有能量密度。原先这里没有密度，页面显示的是「约 0 克」。
     *
     * 用**已上架食谱的中位数**而不是拍一个常数 —— 菜谱结构变了它跟着变，
     * 不会悄悄失真。明确标成 estimate，页面也带「约」字。
     */
    const estimatedDensity = await this.resolveEstimatedEnergyDensity();
    const estimatedDailyIntakeG =
      estimatedDensity && estimatedDensity > 0
        ? (finalFoodKcal / estimatedDensity) * 1000
        : undefined;

    return {
      rer: calcResult.rer,
      totalDer: override.grossKcal,
      finalFoodKcal,
      treatDeduction: calcResult.treatDeduction,
      isTreatCapped: calcResult.isTreatCapped,
      dailyIntakeG,
      energySource: override.source,
      planKcal: override.planKcal,
      estimatedEnergyDensityKcalPerKg: estimatedDensity ?? undefined,
      estimatedDailyIntakeG,
      calcDetails: calcResult.calcDetails,
    };
  }

  /** 估算密度的缓存（食谱目录变动不频繁，5 分钟足够，避免每次详情都聚合一遍） */
  private estimatedDensityCache: { value: number | null; at: number } | null =
    null;

  /**
   * 估算用的能量密度：**已上架食谱的中位数**（kcal/kg）。
   *
   * 只用于「还没有食谱时」给顾客一个量级概念，不参与任何计价或制作单。
   * 没有已上架食谱时返回 null，页面就不显示克数（而不是显示 0）。
   */
  private async resolveEstimatedEnergyDensity(): Promise<number | null> {
    const TTL_MS = 5 * 60 * 1000;
    if (
      this.estimatedDensityCache &&
      Date.now() - this.estimatedDensityCache.at < TTL_MS
    ) {
      return this.estimatedDensityCache.value;
    }

    let value: number | null = null;
    try {
      const rows = await this.prisma.recipe.findMany({
        where: { status: 'PUBLIC' },
        select: { energyDensityKcalPerKg: true },
      });
      const values = rows
        .map((r) => r.energyDensityKcalPerKg)
        .filter((v) => typeof v === 'number' && v > 0)
        .sort((a, b) => a - b);

      if (values.length > 0) {
        const mid = Math.floor(values.length / 2);
        value =
          values.length % 2 === 1
            ? values[mid]
            : (values[mid - 1] + values[mid]) / 2;
      }
    } catch {
      // 估算失败不该连累详情接口 —— 克数不显示即可
      value = null;
    }

    this.estimatedDensityCache = { value, at: Date.now() };
    return value;
  }

  /**
   * CalcForRecipe - Calculate dog energy needs for a specific recipe
   * This version includes the recipe's energy density to calculate daily intake in grams
   * Used in cart and checkout flows
   */
  async calcForRecipe(
    dogId: string,
    recipeId: string,
  ): Promise<CalcForRecipeResult> {
    const dog = await this.dogRepository.findById(dogId);
    if (!dog) {
      throw new Error(`Dog not found: ${dogId}`);
    }

    // Load recipe to get energy density
    const recipe = await this.recipeRepository.findById(recipeId);
    if (!recipe) {
      throw new Error(`Recipe not found: ${recipeId}`);
    }

    // Load breed for calculation
    const breed = await this.dogBreedRepository.findById(dog.breedId);

    // Calculate with recipe energy density
    const calcResult = calculateDogEnergy(
      dog,
      recipe.energyDensityKcalPerKg,
      breed,
      true,
    );

    // ========== 详细计算日志 ==========
    console.log('========== calcForRecipe 详细计算日志 ==========');
    console.log('[输入] dogId:', dogId);
    console.log('[输入] recipeId:', recipeId);
    console.log('[狗狗数据]', {
      id: dog.id,
      name: dog.name,
      weightKg: dog.currentWeightKg,
      mealsPerDay: dog.mealsPerDay,
      bcsScore: dog.bcsScore,
      activityLevel: dog.activityLevel,
      isNeutered: dog.isNeutered,
      lifeStageOverride: dog.lifeStageOverride,
      sizeClassOverride: dog.sizeClassOverride,
      treatInputMode: dog.treatInputMode,
      treatLevel: dog.treatLevel,
      manualTreatKcal: dog.manualTreatKcal,
      breedId: dog.breedId,
    });
    console.log('[食谱数据]', {
      id: recipe.id,
      name: recipe.name,
      energyDensityKcalPerKg: recipe.energyDensityKcalPerKg,
      productionLossRate: recipe.productionLossRate,
    });
    console.log(
      '[品种数据]',
      breed
        ? {
            id: breed.id,
            name: breed.name,
            sizeCategory: breed.sizeCategory,
            growthCurveType: breed.growthCurveType,
            adultAgeMonths: breed.adultAgeMonths,
            seniorAgeYears: breed.seniorAgeYears,
            averageAdultWeightKg: breed.averageAdultWeightKg,
          }
        : 'breed is null',
    );
    console.log('[能量计算结果]', {
      rer: calcResult.rer,
      der: calcResult.der,
      finalFoodKcal: calcResult.finalFoodKcal,
      treatDeduction: calcResult.treatDeduction,
      isTreatCapped: calcResult.isTreatCapped,
      dailyIntakeG: calcResult.dailyIntakeG,
      calcDetails: calcResult.calcDetails,
    });
    const perMealG = calcResult.dailyIntakeG
      ? Math.round(calcResult.dailyIntakeG / dog.mealsPerDay)
      : 0;
    console.log('[最终返回值]', {
      rer: calcResult.rer,
      totalDer: calcResult.der,
      finalFoodKcal: calcResult.finalFoodKcal,
      treatDeduction: calcResult.treatDeduction,
      isTreatCapped: calcResult.isTreatCapped,
      dailyIntakeG: calcResult.dailyIntakeG || 0,
      perMealIntakeG: perMealG,
      mealsPerDay: dog.mealsPerDay,
    });
    console.log('===========================================');

    return {
      rer: calcResult.rer,
      totalDer: calcResult.der,
      finalFoodKcal: calcResult.finalFoodKcal,
      treatDeduction: calcResult.treatDeduction,
      isTreatCapped: calcResult.isTreatCapped,
      dailyIntakeG: calcResult.dailyIntakeG || 0,
      perMealIntakeG: perMealG,
      mealsPerDay: dog.mealsPerDay,
    };
  }

  // ==================== Breed Management Methods ====================

  /**
   * Create new breed
   */
  async createBreed(dto: CreateBreedDto): Promise<DogBreed> {
    const exists = await this.dogBreedRepository.existsByName(dto.name);
    if (exists) {
      throw new Error(`Breed with name "${dto.name}" already exists`);
    }

    const breed = new DogBreed(
      randomUUID(),
      dto.name,
      this.normalizeBreedAliases(dto.name, dto.aliases),
      dto.sizeCategory,
      dto.growthCurveType,
      dto.adultAgeMonths,
      dto.seniorAgeYears,
      dto.averageAdultWeightKg ?? null,
      dto.isCommon ?? false,
      // 体况分下限（深胸细腰型犬，如灵缇 = 4）；不传则不做修正
      dto.bcsScoreFloor ?? null,
    );

    return this.dogBreedRepository.save(breed);
  }

  /**
   * Update breed
   */
  async updateBreed(id: string, dto: UpdateBreedDto): Promise<DogBreed> {
    const existing = await this.dogBreedRepository.findById(id);
    if (!existing) {
      throw new Error(`Breed not found: ${id}`);
    }

    if (dto.name) {
      const exists = await this.dogBreedRepository.existsByName(dto.name, id);
      if (exists) {
        throw new Error(`Breed with name "${dto.name}" already exists`);
      }
    }

    const updated = new DogBreed(
      id,
      dto.name ?? existing.name,
      this.normalizeBreedAliases(
        dto.name ?? existing.name,
        dto.aliases ?? existing.aliases,
      ),
      dto.sizeCategory ?? existing.sizeCategory,
      dto.growthCurveType ?? existing.growthCurveType,
      dto.adultAgeMonths ?? existing.adultAgeMonths,
      dto.seniorAgeYears ?? existing.seniorAgeYears,
      dto.averageAdultWeightKg !== undefined
        ? dto.averageAdultWeightKg
        : existing.averageAdultWeightKg,
      dto.isCommon ?? existing.isCommon,
      dto.bcsScoreFloor !== undefined
        ? dto.bcsScoreFloor
        : existing.bcsScoreFloor,
    );

    const result = await this.dogBreedRepository.update(id, updated);
    if (!result) {
      throw new Error(`Failed to update breed: ${id}`);
    }
    return result;
  }

  /**
   * Delete breed
   */
  async deleteBreed(id: string): Promise<void> {
    const exists = await this.dogBreedRepository.findById(id);
    if (!exists) {
      throw new Error(`Breed not found: ${id}`);
    }

    await this.dogBreedRepository.delete(id);
  }

  /**
   * Check breed usage
   */
  async checkBreedUsage(id: string): Promise<{
    count: number;
    dogs: Array<{ id: string; name: string; ownerId: string }>;
  }> {
    const count = await this.dogBreedRepository.countUsage(id);
    const dogs = await this.dogBreedRepository.findUsage(id, 10);
    return { count, dogs };
  }

  /**
   * Get custom breed statistics
   */
  async getCustomBreedStats(): Promise<
    Array<{
      breedName: string;
      usageCount: number;
      firstUsedAt: Date;
      avgWeight: number;
      estimatedSizeCategory: DogSizeCategory;
    }>
  > {
    const stats = await this.prisma.$queryRaw<
      Array<{
        breed_name: string;
        usage_count: bigint;
        first_used_at: Date;
        avg_weight: number;
      }>
    >`
      SELECT
        custom_breed_name as "breed_name",
        COUNT(*) as "usage_count",
        MIN(created_at) as "first_used_at",
        AVG(current_weight_kg) as "avg_weight"
      FROM dog
      WHERE custom_breed_name IS NOT NULL
      GROUP BY custom_breed_name
      ORDER BY "usage_count" DESC
    `;

    return stats.map((stat: any) => ({
      breedName: stat.breed_name,
      usageCount: Number(stat.usage_count),
      firstUsedAt: stat.first_used_at,
      avgWeight: stat.avg_weight,
      estimatedSizeCategory: this.estimateSizeCategory(stat.avg_weight),
    }));
  }

  /**
   * Estimate size category from weight
   */
  private estimateSizeCategory(weightKg: number): DogSizeCategory {
    if (weightKg < 10) return DogSizeCategory.SMALL;
    if (weightKg < 25) return DogSizeCategory.MEDIUM;
    if (weightKg < 45) return DogSizeCategory.LARGE;
    return DogSizeCategory.GIANT;
  }

  private normalizeBreedAliases(
    breedName: string,
    aliases: string[] | undefined,
  ): string[] {
    if (!aliases || aliases.length === 0) {
      return [];
    }

    const normalizedBreedName = breedName.trim();
    const seen = new Set<string>();

    return aliases
      .map((alias) => alias.trim())
      .filter((alias) => alias.length > 0 && alias !== normalizedBreedName)
      .filter((alias) => {
        const dedupeKey = alias.toLocaleLowerCase();
        if (seen.has(dedupeKey)) {
          return false;
        }
        seen.add(dedupeKey);
        return true;
      });
  }
}

// DTOs for breed management
export interface CreateBreedDto {
  name: string;
  aliases?: string[];
  sizeCategory: DogSizeCategory;
  growthCurveType: GrowthCurveType;
  adultAgeMonths: number;
  seniorAgeYears: number;
  averageAdultWeightKg?: number;
  isCommon?: boolean;
  /**
   * 体况分下限（深胸细腰型犬，如灵缇 = 4）；其余犬种留空。
   * 传 null 可清空（例如发现某个犬种不该设下限）。
   */
  bcsScoreFloor?: number | null;
}

export interface UpdateBreedDto {
  name?: string;
  aliases?: string[];
  sizeCategory?: DogSizeCategory;
  growthCurveType?: GrowthCurveType;
  adultAgeMonths?: number;
  seniorAgeYears?: number;
  averageAdultWeightKg?: number;
  isCommon?: boolean;
  /** 体况分下限（深胸细腰型犬，如灵缇 = 4）；传 null 可清空 */
  bcsScoreFloor?: number | null;
}
