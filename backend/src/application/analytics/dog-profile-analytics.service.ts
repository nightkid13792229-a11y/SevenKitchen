import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma.service';

export interface TrackDogProfileEventInput {
  customerId: string;
  dogId?: string | null;
  eventName: string;
  mode: 'create' | 'edit';
  entrySource?: string | null;
  stepName?: string | null;
  moduleName?: string | null;
  hasDraft?: boolean | null;
  calcStatus?: string | null;
  submitStatus?: string | null;
  properties?: Record<string, any> | null;
}

export interface GetDogProfileAnalyticsSummaryInput {
  from: string;
  to: string;
}

/**
 * 狗狗档案埋点汇总。
 *
 * 注意：2026-09-21 起，所有计数值都是「去重后的客户数」而不是「事件条数」。
 * 同一个用户反复进出建档页只会被计一次，否则漏斗各步的比例会失真。
 */
/**
 * 体况确认率（阶段 C10）。
 *
 * 与上面几组指标不同，这是**整库快照**而不是区间内的事件计数 ——
 * 要看的是「新问卷有没有撬动 99.98% 未确认这个存量问题」，
 * 所以分母是全部档案，分子是顾客亲自确认过的。
 * `confirmedInRange` 单独给区间新增，用来看趋势。
 *
 * 数据直接读 Dog 表，**不依赖埋点表**：埋点表缺失时这几项也要照常返回。
 */
export interface BcsConfirmationStats {
  /** 全部狗狗档案数 */
  totalDogs: number;
  /** 已由顾客亲自确认过体况的狗数 */
  confirmedDogs: number;
  /** 所选区间内新增的确认数 */
  confirmedInRange: number;
  /** 确认率（百分比，保留 1 位小数） */
  rate: number;
}

export interface DogProfileAnalyticsSummary {
  createFunnel: {
    started: number;
    basicCompleted: number;
    recommendationSucceeded: number;
    submitted: number;
  };
  editFunnel: {
    moduleOpened: number;
    calcSucceeded: number;
    saved: number;
  };
  riskSignals: {
    draftRestored: number;
    calcFailed: number;
    submitFailed: number;
    healthSkipped: number;
  };
  bcsConfirmation: BcsConfirmationStats;
}

@Injectable()
export class DogProfileAnalyticsService {
  private readonly logger = new Logger(DogProfileAnalyticsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async track(input: TrackDogProfileEventInput) {
    try {
      return await this.prisma.dogProfileEvent.create({
        data: {
          customerId: input.customerId,
          dogId: input.dogId ?? null,
          eventName: input.eventName,
          mode: input.mode,
          entrySource: input.entrySource ?? null,
          stepName: input.stepName ?? null,
          moduleName: input.moduleName ?? null,
          hasDraft: input.hasDraft ?? null,
          calcStatus: input.calcStatus ?? null,
          submitStatus: input.submitStatus ?? null,
          properties: input.properties ?? Prisma.JsonNull,
        },
      });
    } catch (error) {
      if (this.isMissingTableError(error)) {
        this.logger.warn(
          'dog_profile_event table is missing; skipping analytics tracking until migration is applied',
        );
        return null;
      }

      throw error;
    }
  }

  /**
   * 体况确认率（阶段 C10）。
   *
   * 读 Dog 表，与埋点表无关 —— 埋点表缺失（P2021）时也照常返回。
   * 「确认过」的判据是 `bcsScoreConfirmedAt` 非空，与顾客端门槛用的是同一个字段：
   * 建档时顾客亲自选过、或在定制页门槛里补确认过，才会写上时间。
   */
  async getBcsConfirmationStats({
    from,
    to,
  }: GetDogProfileAnalyticsSummaryInput): Promise<BcsConfirmationStats> {
    const [totalDogs, confirmedDogs, confirmedInRange] = await Promise.all([
      this.prisma.dog.count(),
      this.prisma.dog.count({
        where: { bcsScoreConfirmedAt: { not: null } },
      }),
      this.prisma.dog.count({
        where: {
          bcsScoreConfirmedAt: {
            gte: new Date(from),
            lte: new Date(to),
          },
        },
      }),
    ]);

    return {
      totalDogs,
      confirmedDogs,
      confirmedInRange,
      // 保留 1 位小数：运营看的是「0.02% → 8.3%」这种量级变化
      rate:
        totalDogs === 0
          ? 0
          : Math.round((confirmedDogs / totalDogs) * 1000) / 10,
    };
  }

  async getSummary({
    from,
    to,
  }: GetDogProfileAnalyticsSummaryInput): Promise<DogProfileAnalyticsSummary> {
    // 体况确认率先算：它不依赖埋点表，埋点表挂了也要能出数
    const bcsConfirmation = await this.getBcsConfirmationStats({ from, to });

    let rows: Array<{
      id: string;
      customerId: string | null;
      eventName: string;
      mode: string;
      stepName?: string | null;
    }> = [];

    try {
      rows = await this.prisma.dogProfileEvent.findMany({
        where: {
          createdAt: {
            gte: new Date(from),
            lte: new Date(to),
          },
        },
        orderBy: { createdAt: 'asc' },
      });
    } catch (error) {
      if (this.isMissingTableError(error)) {
        this.logger.warn(
          'dog_profile_event table is missing; returning empty analytics summary until migration is applied',
        );
        return this.buildEmptySummary(bcsConfirmation);
      }

      throw error;
    }

    /**
     * 统计「人数」而不是「事件条数」。
     *
     * 背景（2026-09-21 复盘）：原实现是 rows.filter(...).length，
     * 同一个用户反复进出建档页 5 次会被算成 5 个「开始建档」，
     * 漏斗各步的比例因此完全失真。这里改为按 customerId 去重。
     * 该上报接口本身需要登录，正常不会出现 customerId 为空的行；真有则跳过。
     */
    const countDistinctCustomers = (
      predicate: (row: (typeof rows)[number]) => boolean,
    ): number => {
      const customers = new Set<string>();
      for (const row of rows) {
        if (!predicate(row)) continue;
        if (!row.customerId) continue;
        customers.add(row.customerId);
      }
      return customers.size;
    };

    return {
      createFunnel: {
        started: countDistinctCustomers(
          (row) => row.eventName === 'dog_profile_create_started',
        ),
        basicCompleted: countDistinctCustomers(
          (row) =>
            row.eventName === 'dog_profile_step_completed' &&
            row.mode === 'create' &&
            row.stepName === 'basic_info',
        ),
        recommendationSucceeded: countDistinctCustomers(
          (row) =>
            row.eventName === 'dog_profile_calc_succeeded' &&
            row.mode === 'create',
        ),
        submitted: countDistinctCustomers(
          (row) =>
            row.eventName === 'dog_profile_submit_succeeded' &&
            row.mode === 'create',
        ),
      },
      editFunnel: {
        moduleOpened: countDistinctCustomers(
          (row) => row.eventName === 'dog_profile_edit_module_opened',
        ),
        calcSucceeded: countDistinctCustomers(
          (row) =>
            row.eventName === 'dog_profile_calc_succeeded' &&
            row.mode === 'edit',
        ),
        saved: countDistinctCustomers(
          (row) =>
            row.eventName === 'dog_profile_submit_succeeded' &&
            row.mode === 'edit',
        ),
      },
      riskSignals: {
        draftRestored: countDistinctCustomers(
          (row) => row.eventName === 'dog_profile_draft_restored',
        ),
        calcFailed: countDistinctCustomers(
          (row) => row.eventName === 'dog_profile_calc_failed',
        ),
        submitFailed: countDistinctCustomers(
          (row) => row.eventName === 'dog_profile_submit_failed',
        ),
        healthSkipped: countDistinctCustomers(
          (row) => row.eventName === 'dog_profile_health_skipped',
        ),
      },
      bcsConfirmation,
    };
  }

  private isMissingTableError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }

    const prismaError = error as {
      code?: string;
      meta?: { table?: string };
      message?: string;
    };

    return (
      prismaError.code === 'P2021' ||
      prismaError.meta?.table === 'public.dog_profile_event' ||
      prismaError.message?.includes('dog_profile_event') === true
    );
  }

  private buildEmptySummary(
    bcsConfirmation: BcsConfirmationStats = {
      totalDogs: 0,
      confirmedDogs: 0,
      confirmedInRange: 0,
      rate: 0,
    },
  ): DogProfileAnalyticsSummary {
    return {
      createFunnel: {
        started: 0,
        basicCompleted: 0,
        recommendationSucceeded: 0,
        submitted: 0,
      },
      editFunnel: {
        moduleOpened: 0,
        calcSucceeded: 0,
        saved: 0,
      },
      riskSignals: {
        draftRestored: 0,
        calcFailed: 0,
        submitFailed: 0,
        healthSkipped: 0,
      },
      bcsConfirmation,
    };
  }
}
