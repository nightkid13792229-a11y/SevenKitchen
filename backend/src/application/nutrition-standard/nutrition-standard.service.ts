import { Injectable, NotFoundException } from '@nestjs/common';
import { NutritionStandardReviewStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma.service';
import type { NutritionStandardEntryQueryDto } from '../../interfaces/dto/nutrition-standard/nutrition-standard.dto';

const FEDIAF_2025_DOG_CODE = 'FEDIAF_2025_DOG';

type ReviewEventLike = {
  id?: string;
  status: NutritionStandardReviewStatus;
  note: string | null;
  reviewedBy: string | null;
  reviewedAt: Date;
};

const REVIEW_EVENT_ORDER_BY: Prisma.NutritionStandardReviewEventOrderByWithRelationInput[] =
  [{ reviewedAt: 'desc' }, { id: 'desc' }];

@Injectable()
export class NutritionStandardService {
  constructor(private readonly prisma: PrismaService) {}

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

  private mapEntry(entry: any) {
    const latestReview = this.getLatestReview(entry.reviewEvents);

    return {
      id: entry.id,
      nutrientCode: entry.nutrient.code,
      nutrientName: entry.nutrient.name,
      nutrientNameEn: entry.nutrient.nameEn,
      fieldPath: entry.nutrient.fieldPath,
      fediafName: entry.fediafName,
      category: entry.category,
      sourceTable: entry.sourceTable,
      sourceType: entry.sourceType,
      pdfPage: entry.pdfPage,
      species: entry.species,
      lifeStage: entry.lifeStage,
      basis: entry.basis,
      unit: entry.unit,
      minValue: entry.minValue,
      maxValue: entry.maxValue,
      recommendedValue: entry.recommendedValue,
      maxType: entry.maxType,
      footnoteRefs: entry.footnoteRefs,
      notes: entry.notes,
      sortOrder: entry.sortOrder,
      reviewStatus:
        latestReview?.status ?? NutritionStandardReviewStatus.UNREVIEWED,
      reviewNote: latestReview?.note ?? null,
      reviewedBy: latestReview?.reviewedBy ?? null,
      reviewedAt: latestReview?.reviewedAt ?? null,
    };
  }

  async getFediaf2025DogOverview() {
    const version = await this.prisma.nutritionStandardVersion.findUnique({
      where: { code: FEDIAF_2025_DOG_CODE },
      include: {
        entries: {
          select: {
            id: true,
            sourceTable: true,
            category: true,
          },
        },
      },
    });

    if (!version) {
      throw new NotFoundException(
        'FEDIAF 2025 dog standard has not been imported',
      );
    }

    const reviewEvents =
      await this.prisma.nutritionStandardReviewEvent.findMany({
        where: {
          entry: {
            versionId: version.id,
          },
        },
        orderBy: REVIEW_EVENT_ORDER_BY,
      });

    const latestByEntry = new Map<string, NutritionStandardReviewStatus>();
    for (const event of reviewEvents) {
      if (!latestByEntry.has(event.entryId)) {
        latestByEntry.set(event.entryId, event.status);
      }
    }

    const reviewCounts: Record<NutritionStandardReviewStatus, number> = {
      UNREVIEWED: 0,
      REVIEWED: 0,
      QUESTION: 0,
      NEEDS_FIX: 0,
    };

    for (const entry of version.entries) {
      const status = latestByEntry.get(entry.id) ?? 'UNREVIEWED';
      reviewCounts[status] += 1;
    }

    const tableCounts = version.entries.reduce<Record<string, number>>(
      (result, entry) => {
        result[entry.sourceTable] = (result[entry.sourceTable] ?? 0) + 1;
        return result;
      },
      {},
    );

    return {
      version: {
        id: version.id,
        code: version.code,
        standardCode: version.standardCode,
        name: version.name,
        species: version.species,
        publicationMonth: version.publicationMonth,
        sourceTitle: version.sourceTitle,
        sourceUrl: version.sourceUrl,
        pdfUrl: version.pdfUrl,
        importBatch: version.importBatch,
        importStatus: version.importStatus,
        isActive: version.isActive,
        importedAt: version.importedAt,
      },
      totalEntries: version.entries.length,
      tableCounts,
      reviewCounts,
    };
  }

  async listFediaf2025DogEntries(query: NutritionStandardEntryQueryDto) {
    const where: Prisma.NutritionStandardEntryWhereInput = {
      version: { code: FEDIAF_2025_DOG_CODE },
      ...(query.sourceTable && { sourceTable: query.sourceTable }),
      ...(query.sourceType && { sourceType: query.sourceType }),
      ...(query.lifeStage && { lifeStage: query.lifeStage }),
      ...(query.category && { category: query.category }),
      ...(query.search && {
        OR: [
          { fediafName: { contains: query.search, mode: 'insensitive' } },
          {
            nutrient: {
              OR: [
                { code: { contains: query.search, mode: 'insensitive' } },
                { name: { contains: query.search, mode: 'insensitive' } },
                { nameEn: { contains: query.search, mode: 'insensitive' } },
              ],
            },
          },
        ],
      }),
    };

    const entries = await this.prisma.nutritionStandardEntry.findMany({
      where,
      include: {
        nutrient: true,
        reviewEvents: {
          orderBy: REVIEW_EVENT_ORDER_BY,
          take: 1,
        },
      },
      orderBy: [{ sourceTable: 'asc' }, { sortOrder: 'asc' }],
    });

    const mapped = entries.map((entry) => this.mapEntry(entry));
    if (!query.reviewStatus) {
      return mapped;
    }

    return mapped.filter((entry) => entry.reviewStatus === query.reviewStatus);
  }

  async getFediaf2025DogEntryDetail(id: string) {
    const entry = await this.prisma.nutritionStandardEntry.findFirst({
      where: {
        id,
        version: { code: FEDIAF_2025_DOG_CODE },
      },
      include: {
        nutrient: true,
        reviewEvents: {
          orderBy: REVIEW_EVENT_ORDER_BY,
        },
      },
    });

    if (!entry) {
      throw new NotFoundException(`Nutrition standard entry ${id} not found`);
    }

    return {
      ...this.mapEntry(entry),
      reviewEvents: entry.reviewEvents,
    };
  }

  async createReviewEvent(
    entryId: string,
    input: {
      status: NutritionStandardReviewStatus;
      note?: string;
      reviewedBy?: string;
    },
  ) {
    const entry = await this.prisma.nutritionStandardEntry.findFirst({
      where: {
        id: entryId,
        version: { code: FEDIAF_2025_DOG_CODE },
      },
      select: { id: true },
    });

    if (!entry) {
      throw new NotFoundException(
        `Nutrition standard entry ${entryId} not found`,
      );
    }

    return this.prisma.nutritionStandardReviewEvent.create({
      data: {
        entryId,
        status: input.status,
        note: input.note?.trim() || null,
        reviewedBy: input.reviewedBy,
      },
    });
  }
}
