import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  IngredientType,
  NutritionCandidateStatus,
  NutritionFoodCategory,
  NutritionFoodStatus,
  Prisma,
  SupplementNutritionDraftStatus,
} from '@prisma/client';
import { normalizeNutritionProfile } from '../../domain/ingredient/nutrition-profile.utils';
import type {
  NutritionProfile,
  NutritionProfileV2,
} from '../../domain/ingredient/types';
import type {
  NutritionGovernanceSourceType,
  NutritionMatchConfidence,
  NutritionSourceInput,
} from '../../domain/nutrition-governance/nutrition-governance.types';
import {
  buildNutritionSourceKey,
  classifyMatchConfidence,
  getSourcePriority,
  scoreIngredientSourceNameMatch,
} from '../../domain/nutrition-governance/nutrition-governance.utils';
import { PrismaService } from '../../infrastructure/prisma.service';

const FOOD_SOURCE_TYPES = ['USDA', 'CFCT'] as const;
const MANAGED_INGREDIENT_TYPES = [
  IngredientType.FOOD,
  IngredientType.SUPPLEMENT,
];
const TERMINAL_CANDIDATE_STATUSES: ReadonlySet<NutritionCandidateStatus> =
  new Set([
  NutritionCandidateStatus.CONFIRMED,
  NutritionCandidateStatus.REJECTED,
  NutritionCandidateStatus.SKIPPED,
]);

type NutritionGovernanceTransaction = Pick<
  PrismaService,
  | 'ingredient'
  | 'ingredientNutritionCandidate'
  | 'nutritionFood'
  | 'nutritionFoodMapping'
>;

export interface NutritionGovernanceOverview {
  foodIngredientCount: number;
  supplementIngredientCount: number;
  confirmedNutritionProfileCount: number;
  incompleteProfileCount: number;
  candidateCount: number;
  supplementDraftCount: number;
}

export interface ListNutritionCandidatesParams {
  status?: NutritionCandidateStatus;
  confidence?: NutritionMatchConfidence;
}

@Injectable()
export class NutritionGovernanceService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(): Promise<NutritionGovernanceOverview> {
    const managedIngredientsWhere: Prisma.IngredientWhereInput = {
      type: { in: MANAGED_INGREDIENT_TYPES },
    };

    const [
      foodIngredientCount,
      supplementIngredientCount,
      confirmedNutritionProfileCount,
      incompleteProfileCount,
      candidateCount,
      supplementDraftCount,
    ] = await Promise.all([
      this.prisma.ingredient.count({
        where: { type: IngredientType.FOOD },
      }),
      this.prisma.ingredient.count({
        where: { type: IngredientType.SUPPLEMENT },
      }),
      this.prisma.ingredient.count({
        where: {
          ...managedIngredientsWhere,
          nutritionProfile: { not: Prisma.AnyNull },
        },
      }),
      this.prisma.ingredient.count({
        where: {
          ...managedIngredientsWhere,
          nutritionProfile: { equals: Prisma.AnyNull },
        },
      }),
      this.prisma.ingredientNutritionCandidate.count({
        where: { status: NutritionCandidateStatus.CANDIDATE },
      }),
      this.prisma.supplementNutritionDraft.count({
        where: { status: SupplementNutritionDraftStatus.DRAFT },
      }),
    ]);

    return {
      foodIngredientCount,
      supplementIngredientCount,
      confirmedNutritionProfileCount,
      incompleteProfileCount,
      candidateCount,
      supplementDraftCount,
    };
  }

  async upsertSourceRecord(input: NutritionSourceInput) {
    const sourceKey = buildNutritionSourceKey(
      input.sourceType,
      input.externalId,
    );
    const sourceDetail = toNullableJsonInput(input.sourceDetail);
    const rawData = toJsonInput(input.rawData);
    const normalizedNutrition = toNullableJsonInput(input.normalizedNutrition);
    const createData = {
      sourceType: input.sourceType,
      sourceKey,
      sourceTitle: input.sourceTitle,
      sourceDetail,
      foodName: input.foodName,
      foodNameEn: input.foodNameEn ?? null,
      dataType: input.dataType ?? null,
      category: input.category ?? null,
      rawData,
      normalizedNutrition,
      status: 'ACTIVE',
    } satisfies Prisma.NutritionSourceRecordUncheckedCreateInput;
    const updateData = {
      sourceTitle: input.sourceTitle,
      sourceDetail,
      foodName: input.foodName,
      foodNameEn: input.foodNameEn ?? null,
      dataType: input.dataType ?? null,
      category: input.category ?? null,
      rawData,
      normalizedNutrition,
    } satisfies Prisma.NutritionSourceRecordUncheckedUpdateInput;

    return this.prisma.nutritionSourceRecord.upsert({
      where: {
        sourceType_sourceKey: {
          sourceType: input.sourceType,
          sourceKey,
        },
      },
      create: createData,
      update: updateData,
    });
  }

  async generateFoodCandidatesForIngredient(ingredientId: string) {
    const ingredient = await this.prisma.ingredient.findUnique({
      where: { id: ingredientId },
      select: {
        id: true,
        name: true,
        type: true,
      },
    });

    if (!ingredient || ingredient.type !== IngredientType.FOOD) {
      throw new NotFoundException('食材原料不存在');
    }

    const sourceRecords = await this.prisma.nutritionSourceRecord.findMany({
      where: {
        status: 'ACTIVE',
        sourceType: { in: [...FOOD_SOURCE_TYPES] },
      },
      orderBy: [{ sourceType: 'asc' }, { foodName: 'asc' }],
    });

    const candidates = [];

    for (const sourceRecord of sourceRecords) {
      if (!sourceRecord.normalizedNutrition) continue;

      const sourceType =
        sourceRecord.sourceType as NutritionGovernanceSourceType;
      const { score, reasons } = scoreIngredientSourceNameMatch({
        ingredientName: ingredient.name,
        sourceFoodName: sourceRecord.foodName,
        sourceType,
      });

      if (score < 0.35) continue;

      const confidence = classifyMatchConfidence(score);
      const candidateWhere = {
        ingredientId_sourceRecordId: {
          ingredientId,
          sourceRecordId: sourceRecord.id,
        },
      };
      const existingCandidate =
        await this.prisma.ingredientNutritionCandidate.findUnique({
          where: candidateWhere,
          select: { id: true, status: true },
        });

      if (
        existingCandidate &&
        TERMINAL_CANDIDATE_STATUSES.has(existingCandidate.status)
      ) {
        continue;
      }

      const candidate = await this.prisma.ingredientNutritionCandidate.upsert({
        where: candidateWhere,
        create: {
          ingredientId,
          sourceRecordId: sourceRecord.id,
          sourcePriority: getSourcePriority(sourceType),
          confidence,
          score,
          matchReasons: toJsonInput(reasons),
          normalizedNutrition: toJsonInput(sourceRecord.normalizedNutrition),
          status: NutritionCandidateStatus.CANDIDATE,
        },
        update: {
          sourcePriority: getSourcePriority(sourceType),
          confidence,
          score,
          matchReasons: toJsonInput(reasons),
          normalizedNutrition: toJsonInput(sourceRecord.normalizedNutrition),
          status: NutritionCandidateStatus.CANDIDATE,
        },
      });

      candidates.push(candidate);
    }

    return candidates;
  }

  async listCandidates(params: ListNutritionCandidatesParams = {}) {
    return this.prisma.ingredientNutritionCandidate.findMany({
      where: {
        ...(params.status && { status: params.status }),
        ...(params.confidence && { confidence: params.confidence }),
      },
      include: {
        ingredient: {
          select: {
            id: true,
            name: true,
            type: true,
            nutritionProfile: true,
          },
        },
        sourceRecord: true,
      },
      orderBy: [{ sourcePriority: 'asc' }, { score: 'desc' }],
    });
  }

  async confirmCandidate(candidateId: string, userId: string) {
    const candidate = await this.prisma.ingredientNutritionCandidate.findUnique(
      {
        where: { id: candidateId },
        include: {
          ingredient: true,
          sourceRecord: true,
        },
      },
    );

    if (!candidate) {
      throw new NotFoundException('营养候选不存在');
    }

    if (candidate.status !== NutritionCandidateStatus.CANDIDATE) {
      throw new BadRequestException('仅待确认候选可以确认');
    }

    if (!candidate.normalizedNutrition) {
      throw new BadRequestException('候选缺少标准化营养数据');
    }

    const profile = normalizeNutritionProfile(
      candidate.normalizedNutrition as unknown as NutritionProfile,
    );

    if (!profile) {
      throw new BadRequestException('候选缺少标准化营养数据');
    }

    const confirmedAt = new Date();
    const confirmedProfile = withConfirmationMeta(profile, {
      sourceType: candidate.sourceRecord
        .sourceType as NutritionGovernanceSourceType,
      sourceTitle: candidate.sourceRecord.sourceTitle,
      sourceProvider: getSourceProvider(candidate.sourceRecord.sourceDetail),
      confidenceLevel: candidate.confidence as NutritionMatchConfidence,
      versionNote: `Confirmed from ${candidate.sourceRecord.sourceTitle}`,
    });

    return this.prisma.$transaction(async (tx) => {
      const client = tx as NutritionGovernanceTransaction;

      await client.ingredient.update({
        where: { id: candidate.ingredientId },
        data: {
          nutritionProfile: toJsonInput(confirmedProfile),
        },
      });

      const nutritionFood = await client.nutritionFood.upsert({
        where: {
          name_dataSource_version: {
            name: candidate.sourceRecord.foodName,
            dataSource: candidate.sourceRecord.sourceType,
            version: 1,
          },
        },
        create: {
          name: candidate.sourceRecord.foodName,
          nameEn: candidate.sourceRecord.foodNameEn,
          category: this.mapIngredientTypeToNutritionFoodCategory(
            candidate.ingredient.type,
          ),
          dataSource: candidate.sourceRecord.sourceType,
          externalId: candidate.sourceRecord.sourceKey,
          version: 1,
          status: NutritionFoodStatus.VERIFIED,
          nutritionData: toJsonInput(confirmedProfile),
          notes: candidate.sourceRecord.sourceTitle,
          verifiedBy: userId,
          verifiedAt: confirmedAt,
        },
        update: {
          nameEn: candidate.sourceRecord.foodNameEn,
          category: this.mapIngredientTypeToNutritionFoodCategory(
            candidate.ingredient.type,
          ),
          externalId: candidate.sourceRecord.sourceKey,
          status: NutritionFoodStatus.VERIFIED,
          nutritionData: toJsonInput(confirmedProfile),
          notes: candidate.sourceRecord.sourceTitle,
          verifiedBy: userId,
          verifiedAt: confirmedAt,
        },
      });

      await client.nutritionFoodMapping.upsert({
        where: {
          nutritionFoodId_ingredientId: {
            nutritionFoodId: nutritionFood.id,
            ingredientId: candidate.ingredientId,
          },
        },
        create: {
          nutritionFoodId: nutritionFood.id,
          ingredientId: candidate.ingredientId,
          yieldRate: 1,
          isPrimary: true,
          notes: candidate.sourceRecord.sourceTitle,
        },
        update: {
          isPrimary: true,
          notes: candidate.sourceRecord.sourceTitle,
        },
      });

      return client.ingredientNutritionCandidate.update({
        where: { id: candidateId },
        data: {
          status: NutritionCandidateStatus.CONFIRMED,
          confirmedBy: userId,
          confirmedAt,
          confirmationSnapshot: toJsonInput({
            ingredientId: candidate.ingredientId,
            sourceRecordId: candidate.sourceRecordId,
            sourceType: candidate.sourceRecord.sourceType,
            sourceTitle: candidate.sourceRecord.sourceTitle,
            confidence: candidate.confidence,
            score: candidate.score,
            confirmedBy: userId,
            confirmedAt: confirmedAt.toISOString(),
            nutritionProfile: confirmedProfile,
          }),
        },
      });
    });
  }

  async rejectCandidate(candidateId: string) {
    const candidate = await this.prisma.ingredientNutritionCandidate.findUnique(
      {
        where: { id: candidateId },
        select: { id: true, status: true },
      },
    );

    if (!candidate) {
      throw new NotFoundException('营养候选不存在');
    }

    if (candidate.status !== NutritionCandidateStatus.CANDIDATE) {
      throw new BadRequestException('仅待确认候选可以拒绝');
    }

    return this.prisma.ingredientNutritionCandidate.update({
      where: { id: candidateId },
      data: { status: NutritionCandidateStatus.REJECTED },
    });
  }

  private mapIngredientTypeToNutritionFoodCategory(
    type: IngredientType,
  ): NutritionFoodCategory {
    if (type === IngredientType.SUPPLEMENT) {
      return NutritionFoodCategory.SUPPLEMENT;
    }

    return NutritionFoodCategory.OTHER;
  }
}

function toJsonInput(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function toNullableJsonInput(
  value: unknown,
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
  if (value === null || value === undefined) {
    return Prisma.DbNull;
  }

  return toJsonInput(value);
}

function getSourceProvider(
  sourceDetail: Prisma.JsonValue | null,
): string | null {
  if (
    !sourceDetail ||
    typeof sourceDetail !== 'object' ||
    Array.isArray(sourceDetail)
  ) {
    return null;
  }

  const provider = sourceDetail.provider ?? sourceDetail.sourceProvider;

  return typeof provider === 'string' && provider.trim()
    ? provider.trim()
    : null;
}

function withConfirmationMeta(
  profile: NutritionProfileV2,
  meta: Pick<
    NutritionProfileV2['meta'],
    | 'sourceType'
    | 'sourceTitle'
    | 'sourceProvider'
    | 'confidenceLevel'
    | 'versionNote'
  >,
): NutritionProfileV2 {
  return {
    ...profile,
    meta: {
      ...profile.meta,
      ...meta,
    },
  };
}
