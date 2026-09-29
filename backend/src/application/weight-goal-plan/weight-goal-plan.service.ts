import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma.service';
import { DOG_BREED_REPOSITORY, DOG_REPOSITORY } from '../dog/dog.service';
import type { DogRepository } from '../../domain/dog/dog.repository';
import type { DogBreedRepository } from '../../domain/dog/dog-breed.repository';
import {
  WeightGoalAdjustmentReason,
  WeightGoalDirection,
  WeightGoalPlanStatus,
} from '../../domain/dog/enums';
import {
  MAINTENANCE_UPLIFT_FACTOR,
  applyManualTargetWeight,
  calculateRatePercentPerWeek,
  calculateRerForWeight,
  evaluateWeightGainScreening,
  isGoalReached,
  resolveCorrection,
  resolveEstimatedGoalDate,
  resolveIntensityKcal,
  resolveIntensityLevels,
  resolveNextReviewDate,
  resolvePlanSafeguards,
  resolveProgressRate,
  resolveSuggestedPlan,
  shouldCompleteMaintenance,
  shouldPauseForInactivity,
} from '../../domain/dog/weight-goal-plan';
import { calculateDailyEnergyV2ForDog } from '../../domain/dog/energy-v2';
import type { Dog } from '../../domain/dog/dog.entity';
import type { DogBreed } from '../../domain/dog/dog-breed.entity';
import type {
  CreateWeightGoalPlanDto,
  UpdateWeightGoalIntensityDto,
  UpdateWeightGoalTargetDto,
} from '../../interfaces/dto/weight-goal-plan/weight-goal-plan.dto';

/**
 * 体重管理计划服务（2026-09-29，阶段 B）
 *
 * 老板原话：不只是给用户一个记录体重的工具，而是真真正正能指导用户
 * **通过饮食增减重的可执行方案**。
 *
 * 全部业务规则都在 `domain/dog/weight-goal-plan.ts`（纯函数、单独测试）。
 * 本服务只负责：取数据 → 调纯函数 → 落库 / 组装返回。
 *
 * 与能量算法的关系（B1-4）：计划处于 ACTIVE / MAINTENANCE 时，
 * 该狗的每日能量目标改用 `plan.currentKcal`；PAUSED 与终态则回落到算法默认输出。
 */

const DAY = 1000 * 60 * 60 * 24;

export interface WeightGoalPlanView {
  id: string;
  dogId: string;
  direction: WeightGoalDirection;
  status: WeightGoalPlanStatus;
  startWeightKg: number;
  startBcsScore: number;
  targetWeightKg: number;
  suggestedTargetWeightKg: number;
  currentKcal: number;
  floorKcal: number;
  ceilingKcal: number;
  targetRatePercentPerWeek: number;
  startDate: string;
  estimatedGoalDate: string | null;
  nextReviewDate: string | null;
  lastWeighInDate: string | null;
  lastRatePercentPerWeek: number | null;
  pausedReason: string | null;
  maintenanceStartedAt: string | null;

  /** 当下体重（来自档案，不是计划建立时的快照） */
  currentWeightKg: number;
  /** 朝目标已经走完的量（公斤，正数） */
  changedKg: number;
  /** 距离目标还差多少（公斤，正数） */
  remainingKg: number;
  /** 进度百分比 0-100 */
  progressPercent: number;
  /** 目标是否已达成 */
  goalReached: boolean;

  intensity: { key: string; label: string; factor: number };
  /** 可选力度档位（顾客只能选其中「不比现在更激进」的） */
  availableIntensities: Array<{ key: string; label: string; kcal: number; allowed: boolean }>;
  /** 给顾客看的提示（不拦截，只是说明） */
  notes: string[];
}

export interface WeightGoalSuggestionView {
  direction: WeightGoalDirection;
  currentWeightKg: number;
  bcsScore: number;
  targetWeightKg: number;
  suggestedTargetWeightKg: number;
  currentKcal: number;
  floorKcal: number;
  ceilingKcal: number;
  targetRatePercentPerWeek: number;
  estimatedGoalDate: string | null;
  /** 增重方向才需要先做排查 */
  requiresScreening: boolean;
  screeningQuestions: Array<{ key: string; title: string }>;
  notes: string[];
}

@Injectable()
export class WeightGoalPlanService {
  private readonly logger = new Logger(WeightGoalPlanService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(DOG_REPOSITORY)
    private readonly dogRepository: DogRepository,
    @Inject(DOG_BREED_REPOSITORY)
    private readonly dogBreedRepository: DogBreedRepository,
  ) {}

  // ==================== 数据准备 ====================

  private async loadDog(
    dogId: string,
    customerId?: string,
  ): Promise<{ dog: Dog; breed: DogBreed | null; maintenanceKcal: number }> {
    const dog = await this.dogRepository.findById(dogId);
    if (!dog) {
      throw new NotFoundException('Dog not found');
    }
    if (customerId && dog.ownerId !== customerId) {
      throw new ForbiddenException('Access denied');
    }

    const breed = await this.dogBreedRepository.findById(dog.breedId);
    // 计划以 v2 算法为基准 —— 计划本来就是 v2 上线批次的一部分
    const energy = calculateDailyEnergyV2ForDog(dog, breed);

    return { dog, breed, maintenanceKcal: energy.dailyEnergyKcal };
  }

  /** 当前未结束的计划（ACTIVE / PAUSED / MAINTENANCE） */
  private async findOpenPlan(dogId: string) {
    return this.prisma.weightGoalPlan.findFirst({
      where: {
        dogId,
        status: {
          in: [
            WeightGoalPlanStatus.ACTIVE,
            WeightGoalPlanStatus.PAUSED,
            WeightGoalPlanStatus.MAINTENANCE,
          ],
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ==================== 系统建议（不落库） ====================

  async getSuggestion(
    customerId: string,
    dogId: string,
  ): Promise<WeightGoalSuggestionView | null> {
    const { dog, maintenanceKcal } = await this.loadDog(dogId, customerId);

    const suggestion = resolveSuggestedPlan({
      currentWeightKg: dog.currentWeightKg,
      bcsScore: dog.bcsScore,
      ownerIdealWeightKg: null,
      maintenanceKcal,
    });

    if (!suggestion) {
      return null;
    }

    const levels = resolveIntensityLevels(suggestion.direction);
    const standard = levels.find((l) => l.key === 'STANDARD')!;

    return {
      direction: suggestion.direction,
      currentWeightKg: dog.currentWeightKg,
      bcsScore: dog.bcsScore,
      targetWeightKg: suggestion.targetWeightKg,
      suggestedTargetWeightKg: suggestion.targetWeightKg,
      currentKcal: suggestion.startKcal,
      floorKcal: suggestion.floorKcal,
      ceilingKcal: suggestion.ceilingKcal,
      targetRatePercentPerWeek: suggestion.targetRatePercentPerWeek,
      estimatedGoalDate: suggestion.estimatedGoalDate
        ? suggestion.estimatedGoalDate.toISOString()
        : null,
      requiresScreening: suggestion.direction === WeightGoalDirection.GAIN,
      screeningQuestions: [],
      notes: [
        ...suggestion.notes,
        `起步力度：${standard.label}（RER(目标体重) × ${standard.factor}）`,
      ],
    };
  }

  // ==================== 建计划 ====================

  async createPlan(
    customerId: string,
    dogId: string,
    dto: CreateWeightGoalPlanDto,
  ): Promise<WeightGoalPlanView> {
    const { dog, maintenanceKcal } = await this.loadDog(dogId, customerId);

    const existing = await this.findOpenPlan(dogId);
    if (existing) {
      throw new ConflictException('这只狗狗已经有一个进行中的计划了');
    }

    const suggestion = resolveSuggestedPlan({
      currentWeightKg: dog.currentWeightKg,
      bcsScore: dog.bcsScore,
      ownerIdealWeightKg: null,
      maintenanceKcal,
    });

    if (!suggestion) {
      throw new BadRequestException(
        '当前体况属于理想区间，不需要建立增减重计划',
      );
    }

    // 增重必须先过排查：前 3 项任一为「是」→ 先就医，不进方案
    if (suggestion.direction === WeightGoalDirection.GAIN) {
      const screening = evaluateWeightGainScreening(dto.screening ?? {});
      if (screening.needsVet) {
        throw new BadRequestException(
          `出现需要先就医的情况：${screening.dangerReasons.join('；')}。` +
            '请先带狗狗去兽医排查，确认健康后再回来制定增重计划。',
        );
      }
    }

    // 目标体重：顾客传了就用顾客的（完全自由），否则用系统建议
    const target =
      typeof dto.targetWeightKg === 'number' && dto.targetWeightKg > 0
        ? dto.targetWeightKg
        : suggestion.targetWeightKg;

    const manual = applyManualTargetWeight({
      direction: suggestion.direction,
      newTargetWeightKg: target,
      suggestedTargetWeightKg: suggestion.targetWeightKg,
      currentWeightKg: dog.currentWeightKg,
      maintenanceKcal,
    });
    if (!manual) {
      throw new BadRequestException('目标体重不合法');
    }

    const intensity = resolveIntensityKcal({
      direction: suggestion.direction,
      intensity: dto.intensity,
      targetWeightKg: manual.targetWeightKg,
      maintenanceKcal,
    });

    // 起步能量夹进安全区间（顾客选的档位理论上都在区间内，夹一次兜底）
    const startKcal = Math.min(
      Math.max(intensity.kcal, manual.floorKcal),
      manual.ceilingKcal,
    );

    const now = new Date();

    try {
      const plan = await this.prisma.weightGoalPlan.create({
        data: {
          dogId,
          direction: suggestion.direction,
          status: WeightGoalPlanStatus.ACTIVE,
          startWeightKg: dog.currentWeightKg,
          startBcsScore: dog.bcsScore,
          targetWeightKg: manual.targetWeightKg,
          suggestedTargetWeightKg: suggestion.targetWeightKg,
          currentKcal: startKcal,
          floorKcal: manual.floorKcal,
          ceilingKcal: manual.ceilingKcal,
          targetRatePercentPerWeek: suggestion.targetRatePercentPerWeek,
          startDate: now,
          estimatedGoalDate: resolveEstimatedGoalDate({
            currentWeightKg: dog.currentWeightKg,
            targetWeightKg: manual.targetWeightKg,
            targetRatePercentPerWeek: suggestion.targetRatePercentPerWeek,
            startDate: now,
          }),
          nextReviewDate: resolveNextReviewDate({ from: now, onTrack: false }),
          lastWeighInDate: null,
        },
      });

      return this.toView(plan, dog.currentWeightKg, [
        ...suggestion.notes,
        ...manual.notes,
      ]);
    } catch (error: any) {
      // 部分唯一索引兜底：并发建计划时第二个请求会撞 P2002
      if (error?.code === 'P2002') {
        throw new ConflictException('这只狗狗已经有一个进行中的计划了');
      }
      throw error;
    }
  }

  // ==================== 查当前计划 ====================

  async getCurrentPlan(
    customerId: string,
    dogId: string,
  ): Promise<WeightGoalPlanView | null> {
    const { dog } = await this.loadDog(dogId, customerId);
    const plan = await this.findOpenPlan(dogId);
    if (!plan) {
      return null;
    }
    return this.toView(plan, dog.currentWeightKg, []);
  }

  /** 调整历史（供后台与「计划调整记录」展示） */
  async getAdjustments(customerId: string, dogId: string) {
    await this.loadDog(dogId, customerId);
    const plan = await this.findOpenPlan(dogId);
    if (!plan) {
      return [];
    }

    const rows = await this.prisma.weightGoalPlanAdjustment.findMany({
      where: { planId: plan.id },
      orderBy: { createdAt: 'desc' },
    });

    return rows.map((row) => ({
      id: row.id,
      reason: row.reason,
      energyBefore: row.energyBefore,
      energyAfter: row.energyAfter,
      ratePercentPerWeek: row.ratePercentPerWeek,
      weightKg: row.weightKg,
      note: row.note,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  // ==================== 改目标体重 ====================

  async updateTargetWeight(
    customerId: string,
    dogId: string,
    dto: UpdateWeightGoalTargetDto,
  ): Promise<WeightGoalPlanView> {
    const { dog, maintenanceKcal } = await this.loadDog(dogId, customerId);
    const plan = await this.requireOpenPlan(dogId);

    const manual = applyManualTargetWeight({
      direction: plan.direction as WeightGoalDirection,
      newTargetWeightKg: dto.targetWeightKg,
      suggestedTargetWeightKg: plan.suggestedTargetWeightKg,
      currentWeightKg: dog.currentWeightKg,
      maintenanceKcal,
    });
    if (!manual) {
      throw new BadRequestException('目标体重不合法');
    }

    // 改目标后能量按同一口径重算，但**不能比现在更激进** ——
    // 顾客可以改「减到多少」，不可以顺手把每天的饭量也调低
    const nextKcal = Math.max(manual.kcal, plan.currentKcal);

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.weightGoalPlanAdjustment.create({
        data: {
          planId: plan.id,
          reason: WeightGoalAdjustmentReason.MANUAL,
          energyBefore: plan.currentKcal,
          energyAfter: nextKcal,
          weightKg: dog.currentWeightKg,
          note: `顾客把目标体重从 ${plan.targetWeightKg}kg 改为 ${manual.targetWeightKg}kg`,
        },
      });

      return tx.weightGoalPlan.update({
        where: { id: plan.id },
        data: {
          targetWeightKg: manual.targetWeightKg,
          currentKcal: nextKcal,
          floorKcal: manual.floorKcal,
          ceilingKcal: manual.ceilingKcal,
          estimatedGoalDate: resolveEstimatedGoalDate({
            currentWeightKg: dog.currentWeightKg,
            targetWeightKg: manual.targetWeightKg,
            targetRatePercentPerWeek: plan.targetRatePercentPerWeek,
            startDate: new Date(),
          }),
        },
      });
    });

    return this.toView(updated, dog.currentWeightKg, manual.notes);
  }

  // ==================== 改力度（只能更温和） ====================

  async updateIntensity(
    customerId: string,
    dogId: string,
    dto: UpdateWeightGoalIntensityDto,
  ): Promise<WeightGoalPlanView> {
    const { dog, maintenanceKcal } = await this.loadDog(dogId, customerId);
    const plan = await this.requireOpenPlan(dogId);

    const next = resolveIntensityKcal({
      direction: plan.direction as WeightGoalDirection,
      intensity: dto.intensity,
      targetWeightKg: plan.targetWeightKg,
      maintenanceKcal,
    });

    // 「只能往更温和方向调」（老板定的护栏）：
    // 更激进的方向留给自动校正 —— 它有实测速率作依据，顾客没有。
    if (next.kcal < plan.currentKcal) {
      throw new BadRequestException(
        '只能往更温和的方向调整。想让力度更大，请等系统根据实际减重速度自动调整。',
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.weightGoalPlanAdjustment.create({
        data: {
          planId: plan.id,
          reason: WeightGoalAdjustmentReason.MANUAL,
          energyBefore: plan.currentKcal,
          energyAfter: next.kcal,
          weightKg: dog.currentWeightKg,
          note: `顾客把力度调整为「${next.label}」`,
        },
      });

      return tx.weightGoalPlan.update({
        where: { id: plan.id },
        data: { currentKcal: next.kcal },
      });
    });

    return this.toView(updated, dog.currentWeightKg, []);
  }

  // ==================== 结束 / 取消 / 暂停 / 恢复 ====================

  async finishPlan(
    customerId: string,
    dogId: string,
    mode: 'END' | 'CANCEL',
  ): Promise<void> {
    await this.loadDog(dogId, customerId);
    const plan = await this.requireOpenPlan(dogId);

    await this.prisma.weightGoalPlan.update({
      where: { id: plan.id },
      data:
        mode === 'CANCEL'
          ? { status: WeightGoalPlanStatus.CANCELLED, cancelledAt: new Date() }
          : { status: WeightGoalPlanStatus.COMPLETED, completedAt: new Date() },
    });
    // 能量目标随状态自动回落到算法默认输出 —— 不需要额外清理
  }

  /**
   * 计划期间怀孕 → 自动暂停（与阶段 A 联动）。
   *
   * 暂停而不是结束：产后再回来时还能接着用同一个计划。
   * 期间能量回落到算法默认输出（孕哺口径），不会被计划的低热量压着。
   */
  async pauseForReproduction(dogId: string, reason: string): Promise<void> {
    const plan = await this.findOpenPlan(dogId);
    if (!plan || plan.status === WeightGoalPlanStatus.PAUSED) {
      return;
    }

    await this.prisma.weightGoalPlan.update({
      where: { id: plan.id },
      data: {
        status: WeightGoalPlanStatus.PAUSED,
        pausedAt: new Date(),
        pausedReason: reason,
      },
    });
  }

  /** 暂停后恢复（孕哺结束、或顾客补称了体重） */
  async resumePlan(customerId: string, dogId: string): Promise<WeightGoalPlanView> {
    const { dog } = await this.loadDog(dogId, customerId);
    const plan = await this.requireOpenPlan(dogId);

    if (plan.status !== WeightGoalPlanStatus.PAUSED) {
      return this.toView(plan, dog.currentWeightKg, []);
    }

    const updated = await this.prisma.weightGoalPlan.update({
      where: { id: plan.id },
      data: {
        status: WeightGoalPlanStatus.ACTIVE,
        pausedAt: null,
        pausedReason: null,
        nextReviewDate: resolveNextReviewDate({
          from: new Date(),
          onTrack: false,
        }),
      },
    });

    return this.toView(updated, dog.currentWeightKg, []);
  }

  // ==================== 能量接入（B1-4） ====================

  /**
   * 计划生效时的每日能量目标。没有生效中的计划则返回 null（调用方回落到算法默认）。
   *
   * 只有 ACTIVE 与 MAINTENANCE 生效：
   *   · PAUSED —— 通常是怀孕或长期未称重，此时该用算法默认/孕哺口径
   *   · COMPLETED / CANCELLED —— 立即恢复默认维持量（验收 B-15）
   */
  async resolveActivePlanKcal(dogId: string): Promise<number | null> {
    const plan = await this.prisma.weightGoalPlan.findFirst({
      where: {
        dogId,
        status: {
          in: [WeightGoalPlanStatus.ACTIVE, WeightGoalPlanStatus.MAINTENANCE],
        },
      },
      orderBy: { createdAt: 'desc' },
      select: { currentKcal: true },
    });

    return plan?.currentKcal ?? null;
  }

  /**
   * 把算法算出的能量替换成计划值（B1-4）。
   *
   * 所有「该狗每天该吃多少能量」的出口都该走这里，而不是各自去查计划 ——
   * 否则迟早会漏掉某一处，出现「档案页显示 812、定制页按 1100 算」这种自相矛盾。
   *
   * ⚠️ 口径：计划的 `currentKcal` 是从 RER 推导的**毛值**（与算法的 gross 同一层，
   * 见需求文档 §3.2 的对比表），所以这里替换的是毛值，**零食仍要照常扣减**。
   * 直接覆盖 finalFoodKcal 会让吃零食的狗被多喂一个零食的量。
   *
   * 算法侧两版都满足 `gross = finalFoodKcal + treatDeduction`，调用方据此传入。
   */
  async applyActivePlanOverride(
    dogId: string,
    algorithmGrossKcal: number,
    treatDeduction: number,
  ): Promise<{
    /** 最终食物能量（毛值扣掉零食） */
    finalFoodKcal: number;
    /** 生效的毛值（计划值或算法值） */
    grossKcal: number;
    source: 'PLAN' | 'ALGORITHM';
    planKcal: number | null;
  }> {
    const planKcal = await this.resolveActivePlanKcal(dogId);

    if (planKcal === null || !Number.isFinite(planKcal)) {
      return {
        finalFoodKcal: algorithmGrossKcal - treatDeduction,
        grossKcal: algorithmGrossKcal,
        source: 'ALGORITHM',
        planKcal: null,
      };
    }

    return {
      finalFoodKcal: Math.max(0, planKcal - treatDeduction),
      grossKcal: planKcal,
      source: 'PLAN',
      planKcal,
    };
  }

  // ==================== 称重后自动校正（B1-5 / B1-6 / B1-7） ====================

  /**
   * 顾客记录体重后调用。**不抛错** —— 计划调整失败绝不能影响体重记录本身。
   *
   * 做四件事：
   *   1. 算速率（与上一条体重记录比）
   *   2. 状态流转（达标 → 维持期；连续 8 周未称重 → 暂停；维持期满 3 个月 → 结束）
   *   3. 自动校正（太慢加力度 / 太快退力度），撞到安全边界就停
   *   4. 每一步都写一条调整历史
   */
  async applyWeighIn(
    dogId: string,
    weightKg: number,
    recordDate: Date,
  ): Promise<void> {
    try {
      const plan = await this.findOpenPlan(dogId);
      if (!plan) {
        return;
      }

      const direction = plan.direction as WeightGoalDirection;
      const now = new Date();

      // ---- 连续 8 周未称重 → 暂停 ----
      if (
        plan.status === WeightGoalPlanStatus.ACTIVE &&
        shouldPauseForInactivity({ lastWeighInDate: plan.lastWeighInDate, asOf: now })
      ) {
        await this.prisma.weightGoalPlan.update({
          where: { id: plan.id },
          data: {
            status: WeightGoalPlanStatus.PAUSED,
            pausedAt: now,
            pausedReason: '连续 8 周没有称重',
          },
        });
        return;
      }

      // ---- 维持期满 3 个月 → 结束 ----
      if (
        plan.status === WeightGoalPlanStatus.MAINTENANCE &&
        shouldCompleteMaintenance({
          maintenanceStartedAt: plan.maintenanceStartedAt,
          asOf: now,
        })
      ) {
        await this.prisma.weightGoalPlan.update({
          where: { id: plan.id },
          data: { status: WeightGoalPlanStatus.COMPLETED, completedAt: now },
        });
        return;
      }

      // 暂停中的计划只更新称重日，不调热量
      if (plan.status === WeightGoalPlanStatus.PAUSED) {
        await this.prisma.weightGoalPlan.update({
          where: { id: plan.id },
          data: { lastWeighInDate: recordDate },
        });
        return;
      }

      // ---- 算速率：与上一条体重记录比 ----
      const previous = await this.prisma.weightRecord.findFirst({
        where: { dogId, recordDate: { lt: recordDate } },
        orderBy: { recordDate: 'desc' },
      });

      const rate = previous
        ? calculateRatePercentPerWeek({
            previousWeightKg: previous.weightKg,
            currentWeightKg: weightKg,
            elapsedDays:
              (recordDate.getTime() - previous.recordDate.getTime()) / DAY,
          })
        : null;

      // ---- 达标 → 转维持期，热量上浮 10% ----
      if (
        plan.status === WeightGoalPlanStatus.ACTIVE &&
        isGoalReached({
          direction,
          currentWeightKg: weightKg,
          targetWeightKg: plan.targetWeightKg,
        })
      ) {
        const maintenanceKcal = Math.round(
          plan.currentKcal * MAINTENANCE_UPLIFT_FACTOR,
        );

        await this.prisma.$transaction(async (tx) => {
          await tx.weightGoalPlanAdjustment.create({
            data: {
              planId: plan.id,
              reason: WeightGoalAdjustmentReason.GOAL_REACHED,
              energyBefore: plan.currentKcal,
              energyAfter: maintenanceKcal,
              ratePercentPerWeek: rate,
              weightKg,
              note: `已达目标体重 ${plan.targetWeightKg}kg，转维持期，热量上浮 10%`,
            },
          });
          await tx.weightGoalPlan.update({
            where: { id: plan.id },
            data: {
              status: WeightGoalPlanStatus.MAINTENANCE,
              maintenanceStartedAt: now,
              currentKcal: maintenanceKcal,
              lastWeighInDate: recordDate,
              lastRatePercentPerWeek: rate,
              nextReviewDate: resolveNextReviewDate({ from: now, onTrack: true }),
            },
          });
        });
        return;
      }

      // ---- 维持期：还在继续掉重 → 再加 10% ----
      if (plan.status === WeightGoalPlanStatus.MAINTENANCE) {
        const stillLosing =
          direction === WeightGoalDirection.LOSS && rate !== null && rate < 0;

        if (stillLosing) {
          const bumped = Math.round(plan.currentKcal * MAINTENANCE_UPLIFT_FACTOR);
          await this.prisma.$transaction(async (tx) => {
            await tx.weightGoalPlanAdjustment.create({
              data: {
                planId: plan.id,
                reason: WeightGoalAdjustmentReason.MAINTENANCE_UNDERSHOOT,
                energyBefore: plan.currentKcal,
                energyAfter: bumped,
                ratePercentPerWeek: rate,
                weightKg,
                note: '已达理想体重但仍在掉重，热量再加 10%',
              },
            });
            await tx.weightGoalPlan.update({
              where: { id: plan.id },
              data: {
                currentKcal: bumped,
                lastWeighInDate: recordDate,
                lastRatePercentPerWeek: rate,
                nextReviewDate: resolveNextReviewDate({ from: now, onTrack: true }),
              },
            });
          });
          return;
        }

        await this.prisma.weightGoalPlan.update({
          where: { id: plan.id },
          data: {
            lastWeighInDate: recordDate,
            lastRatePercentPerWeek: rate,
            nextReviewDate: resolveNextReviewDate({ from: now, onTrack: true }),
          },
        });
        return;
      }

      // ---- 进行中：自动校正 ----
      if (rate === null) {
        // 没有上一条记录可比（第一次称重）→ 只更新称重日
        await this.prisma.weightGoalPlan.update({
          where: { id: plan.id },
          data: { lastWeighInDate: recordDate },
        });
        return;
      }

      const progress = resolveProgressRate(direction, rate);
      const correction = resolveCorrection({
        direction,
        progressRatePercentPerWeek: progress,
        currentKcal: plan.currentKcal,
        floorKcal: plan.floorKcal,
        ceilingKcal: plan.ceilingKcal,
      });

      const onTrack = correction.action === 'HOLD';

      await this.prisma.$transaction(async (tx) => {
        if (correction.reason && correction.nextKcal !== plan.currentKcal) {
          await tx.weightGoalPlanAdjustment.create({
            data: {
              planId: plan.id,
              reason: correction.reason,
              energyBefore: plan.currentKcal,
              energyAfter: correction.nextKcal,
              ratePercentPerWeek: rate,
              weightKg,
              note: correction.note,
            },
          });
        } else if (correction.action === 'BLOCKED') {
          // 撞到边界也要留痕，否则后台看不出「为什么这个月没调整」
          await tx.weightGoalPlanAdjustment.create({
            data: {
              planId: plan.id,
              reason: correction.reason ?? WeightGoalAdjustmentReason.FLOOR_REACHED,
              energyBefore: plan.currentKcal,
              energyAfter: plan.currentKcal,
              ratePercentPerWeek: rate,
              weightKg,
              note: correction.note,
            },
          });
        }

        await tx.weightGoalPlan.update({
          where: { id: plan.id },
          data: {
            currentKcal: correction.nextKcal,
            lastWeighInDate: recordDate,
            lastRatePercentPerWeek: rate,
            nextReviewDate: resolveNextReviewDate({ from: now, onTrack }),
          },
        });
      });
    } catch (error) {
      // 计划调整绝不能影响体重记录本身
      this.logger.error(
        `称重后调整体重管理计划失败（dogId=${dogId}）：${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  // ==================== 组装返回 ====================

  private async requireOpenPlan(dogId: string) {
    const plan = await this.findOpenPlan(dogId);
    if (!plan) {
      throw new NotFoundException('这只狗狗还没有体重管理计划');
    }
    return plan;
  }

  private toView(
    plan: any,
    currentWeightKg: number,
    notes: string[],
  ): WeightGoalPlanView {
    const direction = plan.direction as WeightGoalDirection;
    const isLoss = direction === WeightGoalDirection.LOSS;

    const changedKg = isLoss
      ? plan.startWeightKg - currentWeightKg
      : currentWeightKg - plan.startWeightKg;
    const totalNeeded = Math.abs(plan.startWeightKg - plan.targetWeightKg);
    const remainingKg = Math.max(0, totalNeeded - changedKg);
    const progressPercent =
      totalNeeded <= 0
        ? 100
        : Math.min(100, Math.max(0, (changedKg / totalNeeded) * 100));

    // 当前力度档位：取「能量不低于当前值」里最激进的一档 —— 自动校正会连续微调，
    // 能量未必正好落在某个档位上，所以取最接近且不更激进的那个作为显示基准。
    const levels = resolveIntensityLevels(direction);
    // 反推维持量的基准：减重时是上限、增重时是下限（两者都是「维持需求」）
    const maintenanceKcal = isLoss ? plan.ceilingKcal : plan.floorKcal;

    const availableIntensities = levels.map((level) => {
      const kcal = resolveIntensityKcal({
        direction,
        intensity: level.key,
        targetWeightKg: plan.targetWeightKg,
        maintenanceKcal,
      }).kcal;
      return {
        key: level.key,
        label: level.label,
        kcal,
        // 只能往更温和方向调
        allowed: kcal >= plan.currentKcal,
      };
    });

    const currentLevel =
      levels.find((l) => {
        const kcal = resolveIntensityKcal({
          direction,
          intensity: l.key,
          targetWeightKg: plan.targetWeightKg,
          maintenanceKcal,
        }).kcal;
        return kcal >= plan.currentKcal;
      }) ?? levels[0];

    return {
      id: plan.id,
      dogId: plan.dogId,
      direction,
      status: plan.status as WeightGoalPlanStatus,
      startWeightKg: plan.startWeightKg,
      startBcsScore: plan.startBcsScore,
      targetWeightKg: plan.targetWeightKg,
      suggestedTargetWeightKg: plan.suggestedTargetWeightKg,
      currentKcal: plan.currentKcal,
      floorKcal: plan.floorKcal,
      ceilingKcal: plan.ceilingKcal,
      targetRatePercentPerWeek: plan.targetRatePercentPerWeek,
      startDate: plan.startDate.toISOString(),
      estimatedGoalDate: plan.estimatedGoalDate
        ? plan.estimatedGoalDate.toISOString()
        : null,
      nextReviewDate: plan.nextReviewDate
        ? plan.nextReviewDate.toISOString()
        : null,
      lastWeighInDate: plan.lastWeighInDate
        ? plan.lastWeighInDate.toISOString()
        : null,
      lastRatePercentPerWeek: plan.lastRatePercentPerWeek ?? null,
      pausedReason: plan.pausedReason ?? null,
      maintenanceStartedAt: plan.maintenanceStartedAt
        ? plan.maintenanceStartedAt.toISOString()
        : null,
      currentWeightKg,
      changedKg: Math.round(changedKg * 100) / 100,
      remainingKg: Math.round(remainingKg * 100) / 100,
      progressPercent: Math.round(progressPercent),
      goalReached: isGoalReached({
        direction,
        currentWeightKg,
        targetWeightKg: plan.targetWeightKg,
      }),
      intensity: {
        key: currentLevel.key,
        label: currentLevel.label,
        factor: currentLevel.factor,
      },
      availableIntensities,
      notes,
    };
  }
}
