import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NutritionStandardReviewStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma.service';
import type {
  FediafTargetEntry,
  FediafTargetLifeStage,
  FediafTargetSelectionResult,
} from './nutrition-calculation.types';

const FEDIAF_2025_DOG_CODE = 'FEDIAF_2025_DOG';
const ANNEX_7_8_SOURCE_TYPE = 'ANNEX_7_8';

const REVIEW_EVENT_ORDER_BY: Prisma.NutritionStandardReviewEventOrderByWithRelationInput[] =
  [{ reviewedAt: 'desc' }, { id: 'desc' }];

const ANNEX_TABLE_BY_LIFE_STAGE: Record<FediafTargetLifeStage, string> = {
  EARLY_GROWTH_UNDER_14_WEEKS: 'VII-17a',
  REPRODUCTION: 'VII-17a',
  LATE_GROWTH_FROM_14_WEEKS: 'VII-17b',
  ADULT_MER_110: 'VII-17c',
  ADULT_MER_95: 'VII-17d',
};

type ReviewEventLike = {
  id?: string;
  status: NutritionStandardReviewStatus;
  reviewedAt: Date;
};

type StandardEntryLike = {
  id: string;
  nutrient: {
    code: string;
    name: string;
  };
  sourceTable: string;
  pdfPage: number;
  lifeStage: FediafTargetLifeStage;
  basis: string;
  unit: string;
  minValue: number | null;
  maxValue: number | null;
  recommendedValue: number | null;
  reviewEvents?: ReviewEventLike[];
};

@Injectable()
export class FediafTargetSelectorService {
  constructor(private readonly prisma: PrismaService) {}

  async selectFediaf2025DogTarget(input: {
    lifeStage: FediafTargetLifeStage;
  }): Promise<FediafTargetSelectionResult> {
    const sourceTable = this.resolveSourceTable(input.lifeStage);

    const entries = await this.prisma.nutritionStandardEntry.findMany({
      where: {
        version: { code: FEDIAF_2025_DOG_CODE },
        sourceType: ANNEX_7_8_SOURCE_TYPE,
        sourceTable,
        lifeStage: input.lifeStage,
      },
      include: {
        nutrient: true,
        reviewEvents: {
          orderBy: REVIEW_EVENT_ORDER_BY,
          take: 1,
        },
      },
      orderBy: [{ sortOrder: 'asc' }],
    });

    if (entries.length === 0) {
      throw new NotFoundException(
        `FEDIAF 2025 dog Annex 7.8 targets not found for ${input.lifeStage}`,
      );
    }

    return {
      versionCode: FEDIAF_2025_DOG_CODE,
      lifeStage: input.lifeStage,
      sourceType: ANNEX_7_8_SOURCE_TYPE,
      entries: entries.map((entry) =>
        this.mapEntry(entry as StandardEntryLike),
      ),
    };
  }

  private resolveSourceTable(lifeStage: string): string {
    if (lifeStage === 'ADULT') {
      throw new BadRequestException(
        'Adult target requires ADULT_MER_95 or ADULT_MER_110',
      );
    }

    const sourceTable =
      ANNEX_TABLE_BY_LIFE_STAGE[lifeStage as FediafTargetLifeStage];
    if (!sourceTable) {
      throw new BadRequestException(
        `Unsupported FEDIAF target lifeStage: ${lifeStage}`,
      );
    }

    return sourceTable;
  }

  private getLatestReview(
    events: ReviewEventLike[] | undefined,
  ): ReviewEventLike | null {
    if (!events || events.length === 0) {
      return null;
    }

    return [...events].sort((a, b) => {
      const reviewedAtDiff = b.reviewedAt.getTime() - a.reviewedAt.getTime();
      if (reviewedAtDiff !== 0) {
        return reviewedAtDiff;
      }

      return (b.id ?? '').localeCompare(a.id ?? '');
    })[0];
  }

  private mapEntry(entry: StandardEntryLike): FediafTargetEntry {
    const latestReview = this.getLatestReview(entry.reviewEvents);

    return {
      entryId: entry.id,
      nutrientCode: entry.nutrient.code,
      nutrientName: entry.nutrient.name,
      sourceTable: entry.sourceTable,
      pdfPage: entry.pdfPage,
      lifeStage: entry.lifeStage,
      basis: entry.basis,
      unit: entry.unit,
      minValue: entry.minValue,
      maxValue: entry.maxValue,
      recommendedValue: entry.recommendedValue,
      reviewStatus:
        latestReview?.status ?? NutritionStandardReviewStatus.UNREVIEWED,
    };
  }
}
