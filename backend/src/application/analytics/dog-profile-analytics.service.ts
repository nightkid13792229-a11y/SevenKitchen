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

    return {
      createFunnel: {
        started: rows.filter(
          (row) => row.eventName === 'dog_profile_create_started',
        ).length,
        basicCompleted: rows.filter(
          (row) =>
            row.eventName === 'dog_profile_step_completed' &&
            row.mode === 'create' &&
            row.stepName === 'basic_info',
        ).length,
        recommendationSucceeded: rows.filter(
          (row) =>
            row.eventName === 'dog_profile_calc_succeeded' &&
            row.mode === 'create',
        ).length,
        submitted: rows.filter(
          (row) =>
            row.eventName === 'dog_profile_submit_succeeded' &&
            row.mode === 'create',
        ).length,
      },
      editFunnel: {
        moduleOpened: rows.filter(
          (row) => row.eventName === 'dog_profile_edit_module_opened',
        ).length,
        calcSucceeded: rows.filter(
          (row) =>
            row.eventName === 'dog_profile_calc_succeeded' &&
            row.mode === 'edit',
        ).length,
        saved: rows.filter(
          (row) =>
            row.eventName === 'dog_profile_submit_succeeded' &&
            row.mode === 'edit',
        ).length,
      },
      riskSignals: {
        draftRestored: rows.filter(
          (row) => row.eventName === 'dog_profile_draft_restored',
        ).length,
        calcFailed: rows.filter(
          (row) => row.eventName === 'dog_profile_calc_failed',
        ).length,
        submitFailed: rows.filter(
          (row) => row.eventName === 'dog_profile_submit_failed',
        ).length,
        healthSkipped: rows.filter(
          (row) => row.eventName === 'dog_profile_health_skipped',
        ).length,
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
