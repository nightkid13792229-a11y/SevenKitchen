import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  IngredientType,
  NutritionCandidateStatus,
  NutritionFoodCategory,
  NutritionFoodStatus,
  NutritionSourceRecord,
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
  mapUsdaNutrientsToNutritionProfile,
  scoreIngredientSourceNameMatch,
} from '../../domain/nutrition-governance/nutrition-governance.utils';
import { PrismaService } from '../../infrastructure/prisma.service';
import {
  DisabledLabelRecognitionProvider,
  LABEL_RECOGNITION_PROVIDER,
  type LabelRecognitionProvider,
} from './label-recognition.provider';

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
  | 'nutritionSourceRecord'
  | 'supplementNutritionDraft'
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

export interface ListSupplementDraftsParams {
  status?: SupplementNutritionDraftStatus;
  ingredientId?: string;
}

export interface ImportUsdaSourceRecordOptions {
  ingredientId?: string;
}

export interface CreateSupplementDraftFromLabelImageInput {
  ingredientId: string;
  imageUrl: string;
  imageKey: string;
  createdBy?: string;
}

interface UsdaFoodData extends Record<string, unknown> {
  fdcId?: string | number;
  description?: string;
  dataType?: string;
  publicationDate?: string;
  foodCategory?: {
    description?: string;
  };
  foodNutrients?: Array<{
    nutrient?: { id?: number; name?: string; unitName?: string };
    amount?: number;
  }>;
}

@Injectable()
export class NutritionGovernanceService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    @Inject(LABEL_RECOGNITION_PROVIDER)
    private readonly labelRecognitionProvider?: LabelRecognitionProvider,
  ) {}

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

  async importUsdaSourceRecord(
    fdcId: string,
    options: ImportUsdaSourceRecordOptions = {},
  ) {
    const apiKey = process.env.USDA_API_KEY;

    if (!apiKey) {
      throw new BadRequestException('USDA API密钥未配置');
    }

    let linkedIngredient:
      | { id: string; name: string; type: IngredientType }
      | null = null;
    if (options.ingredientId) {
      linkedIngredient = await this.prisma.ingredient.findUnique({
        where: { id: options.ingredientId },
        select: { id: true, name: true, type: true },
      });

      if (!linkedIngredient || linkedIngredient.type !== IngredientType.FOOD) {
        throw new NotFoundException('食材原料不存在');
      }
    }

    let food: UsdaFoodData;
    try {
      const response = await fetch(
        `https://api.nal.usda.gov/fdc/v1/food/${encodeURIComponent(fdcId)}?api_key=${apiKey}`,
        {
          headers: {
            Accept: 'application/json',
          },
        },
      );

      if (!response.ok) {
        throw new BadRequestException('USDA API请求失败');
      }

      food = (await response.json()) as UsdaFoodData;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('USDA API请求失败');
    }

    const externalId = String(food.fdcId ?? fdcId);
    const description = food.description ?? '';
    const profile = mapUsdaNutrientsToNutritionProfile(
      food.foodNutrients || [],
    );
    if (!hasMappedNutritionValues(profile)) {
      throw new BadRequestException('USDA 营养数据为空');
    }

    const sourceRecord = await this.upsertSourceRecord({
      sourceType: 'USDA',
      externalId,
      sourceTitle: 'USDA FoodData Central',
      foodName: description,
      foodNameEn: description,
      dataType: food.dataType ?? null,
      category: food.foodCategory?.description ?? null,
      sourceDetail: {
        fdcId: externalId,
        provider: 'USDA FoodData Central',
        sourceProvider: 'USDA FoodData Central',
        publicationDate: food.publicationDate ?? null,
      },
      rawData: food,
      normalizedNutrition: profile,
    });

    if (linkedIngredient) {
      await this.upsertFoodCandidateFromSource(
        linkedIngredient,
        sourceRecord,
        {
          score: 0.95,
          reasons: [
            {
              code: 'MANUAL',
              label: '人工指定 USDA FDC ID',
              scoreDelta: 0.8,
            },
            {
              code: 'SOURCE_PRIORITY',
              label: 'USDA 优先来源',
              scoreDelta: 0.15,
            },
          ],
        },
      );
    }

    return sourceRecord;
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

      const sourceType = sourceRecord.sourceType as NutritionGovernanceSourceType;
      const { score, reasons } = scoreIngredientSourceNameMatch({
        ingredientName: ingredient.name,
        sourceFoodName: sourceRecord.foodName,
        sourceType,
      });

      if (score < 0.35) continue;

      const candidate = await this.upsertFoodCandidateFromSource(
        ingredient,
        sourceRecord,
        { score, reasons },
      );

      if (candidate) {
        candidates.push(candidate);
      }
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

  async createSupplementDraftFromLabelImage(
    input: CreateSupplementDraftFromLabelImageInput,
  ) {
    const ingredient = await this.prisma.ingredient.findUnique({
      where: { id: input.ingredientId },
      select: {
        id: true,
        name: true,
        type: true,
      },
    });

    if (!ingredient || ingredient.type !== IngredientType.SUPPLEMENT) {
      throw new NotFoundException('补剂原料不存在');
    }

    const extraction = await this.getLabelProvider().extractFromImage({
      imageUrl: input.imageUrl,
      ingredientName: ingredient.name,
    });

    return this.prisma.supplementNutritionDraft.create({
      data: {
        ingredientId: ingredient.id,
        imageUrl: input.imageUrl,
        imageKey: input.imageKey,
        ocrText: extraction.ocrText,
        aiExtraction: toJsonInput(extraction),
        normalizedNutrition: toNullableJsonInput(
          extraction.normalizedNutrition,
        ),
        missingFields: extraction.missingFields,
        status: SupplementNutritionDraftStatus.DRAFT,
        createdBy: input.createdBy ?? null,
      },
    });
  }

  async listSupplementDrafts(params: ListSupplementDraftsParams = {}) {
    return this.prisma.supplementNutritionDraft.findMany({
      where: {
        ...(params.status && { status: params.status }),
        ...(params.ingredientId && { ingredientId: params.ingredientId }),
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
      orderBy: [{ createdAt: 'desc' }],
    });
  }

  async confirmSupplementDraft(draftId: string, userId: string) {
    const draft = await this.prisma.supplementNutritionDraft.findUnique({
      where: { id: draftId },
      include: {
        ingredient: true,
        sourceRecord: true,
      },
    });

    if (!draft) {
      throw new NotFoundException('补剂草稿不存在');
    }

    if (draft.status !== SupplementNutritionDraftStatus.DRAFT) {
      throw new BadRequestException('仅草稿状态可以确认');
    }

    if (draft.ingredient.type !== IngredientType.SUPPLEMENT) {
      throw new BadRequestException('补剂草稿关联的原料类型无效');
    }

    if (!draft.normalizedNutrition) {
      throw new BadRequestException('草稿缺少标准化营养数据');
    }

    const profile = normalizeNutritionProfile(
      draft.normalizedNutrition as unknown as NutritionProfile,
    );

    if (!profile) {
      throw new BadRequestException('草稿缺少标准化营养数据');
    }

    const confirmedAt = new Date();
    const confirmedProfile = withConfirmationMeta(profile, {
      sourceType: 'SUPPLEMENT_LABEL',
      sourceTitle: `${draft.ingredient.name} 补剂标签`,
      sourceProvider: 'Product label',
      confidenceLevel: draft.missingFields.length > 0 ? 'MEDIUM' : 'HIGH',
      versionNote: `Confirmed from supplement label image: ${draft.imageKey}`,
    });

    return this.prisma.$transaction(async (tx) => {
      const client = tx as NutritionGovernanceTransaction;
      const sourceRecord = await client.nutritionSourceRecord.upsert({
        where: {
          sourceType_sourceKey: {
            sourceType: 'SUPPLEMENT_LABEL',
            sourceKey: buildNutritionSourceKey('SUPPLEMENT_LABEL', draft.id),
          },
        },
        create: {
          sourceType: 'SUPPLEMENT_LABEL',
          sourceKey: buildNutritionSourceKey('SUPPLEMENT_LABEL', draft.id),
          sourceTitle: `${draft.ingredient.name} 补剂标签`,
          sourceDetail: toJsonInput({
            provider: 'Product label',
            sourceProvider: 'Product label',
            imageUrl: draft.imageUrl,
            imageKey: draft.imageKey,
          }),
          foodName: draft.ingredient.name,
          foodNameEn: null,
          dataType: 'PRODUCT_LABEL',
          category: 'SUPPLEMENT',
          rawData: toJsonInput({
            draftId: draft.id,
            imageUrl: draft.imageUrl,
            imageKey: draft.imageKey,
            ocrText: draft.ocrText,
            aiExtraction: draft.aiExtraction,
          }),
          normalizedNutrition: toJsonInput(confirmedProfile),
          status: 'ACTIVE',
        },
        update: {
          sourceTitle: `${draft.ingredient.name} 补剂标签`,
          sourceDetail: toJsonInput({
            provider: 'Product label',
            sourceProvider: 'Product label',
            imageUrl: draft.imageUrl,
            imageKey: draft.imageKey,
          }),
          foodName: draft.ingredient.name,
          foodNameEn: null,
          dataType: 'PRODUCT_LABEL',
          category: 'SUPPLEMENT',
          rawData: toJsonInput({
            draftId: draft.id,
            imageUrl: draft.imageUrl,
            imageKey: draft.imageKey,
            ocrText: draft.ocrText,
            aiExtraction: draft.aiExtraction,
          }),
          normalizedNutrition: toJsonInput(confirmedProfile),
        },
      });

      await client.ingredient.update({
        where: { id: draft.ingredientId },
        data: {
          nutritionProfile: toJsonInput(confirmedProfile),
        },
      });

      return client.supplementNutritionDraft.update({
        where: { id: draft.id },
        data: {
          sourceRecordId: sourceRecord.id,
          normalizedNutrition: toJsonInput(confirmedProfile),
          status: SupplementNutritionDraftStatus.CONFIRMED,
          confirmedBy: userId,
          confirmedAt,
        },
      });
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

  async rejectSupplementDraft(draftId: string) {
    const draft = await this.prisma.supplementNutritionDraft.findUnique({
      where: { id: draftId },
      select: { id: true, status: true },
    });

    if (!draft) {
      throw new NotFoundException('补剂草稿不存在');
    }

    if (draft.status !== SupplementNutritionDraftStatus.DRAFT) {
      throw new BadRequestException('仅草稿状态可以拒绝');
    }

    return this.prisma.supplementNutritionDraft.update({
      where: { id: draftId },
      data: { status: SupplementNutritionDraftStatus.REJECTED },
    });
  }

  private async upsertFoodCandidateFromSource(
    ingredient: { id: string; name: string; type: IngredientType },
    sourceRecord: NutritionSourceRecord,
    match: { score: number; reasons: Array<{ code: string; label: string; scoreDelta: number }> },
  ) {
    if (!sourceRecord.normalizedNutrition) {
      return null;
    }

    const sourceType = sourceRecord.sourceType as NutritionGovernanceSourceType;
    const candidateWhere = {
      ingredientId_sourceRecordId: {
        ingredientId: ingredient.id,
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
      return null;
    }

    return this.prisma.ingredientNutritionCandidate.upsert({
      where: candidateWhere,
      create: {
        ingredientId: ingredient.id,
        sourceRecordId: sourceRecord.id,
        sourcePriority: getSourcePriority(sourceType),
        confidence: classifyMatchConfidence(match.score),
        score: match.score,
        matchReasons: toJsonInput(match.reasons),
        normalizedNutrition: toJsonInput(sourceRecord.normalizedNutrition),
        status: NutritionCandidateStatus.CANDIDATE,
      },
      update: {
        sourcePriority: getSourcePriority(sourceType),
        confidence: classifyMatchConfidence(match.score),
        score: match.score,
        matchReasons: toJsonInput(match.reasons),
        normalizedNutrition: toJsonInput(sourceRecord.normalizedNutrition),
        status: NutritionCandidateStatus.CANDIDATE,
      },
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

  private getLabelProvider(): LabelRecognitionProvider {
    return (
      this.labelRecognitionProvider ?? new DisabledLabelRecognitionProvider()
    );
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

function hasMappedNutritionValues(profile: NutritionProfileV2): boolean {
  const groupedTabs = [
    profile.macros,
    profile.minerals,
    profile.vitamins,
    profile.fattyAcids,
    profile.aminoAcids,
  ];

  return groupedTabs.some((tab) =>
    Object.values(tab).some((value) => typeof value === 'number'),
  );
}
