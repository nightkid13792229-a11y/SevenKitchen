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

  async getSummary({
    from,
    to,
  }: GetDogProfileAnalyticsSummaryInput): Promise<DogProfileAnalyticsSummary> {
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
        return this.buildEmptySummary();
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

  private buildEmptySummary(): DogProfileAnalyticsSummary {
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
    };
  }
}
