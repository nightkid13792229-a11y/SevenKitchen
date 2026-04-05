import { Injectable } from '@nestjs/common';
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
  constructor(private readonly prisma: PrismaService) {}

  async track(input: TrackDogProfileEventInput) {
    return this.prisma.dogProfileEvent.create({
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
        properties: input.properties ?? Prisma.DbNull,
      },
    });
  }

  async getSummary({
    from,
    to,
  }: {
    from: string;
    to: string;
  }): Promise<DogProfileAnalyticsSummary> {
    const rows = await this.prisma.dogProfileEvent.findMany({
      where: {
        createdAt: {
          gte: new Date(from),
          lte: new Date(to),
        },
      },
      orderBy: { createdAt: 'asc' },
    });

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
}
