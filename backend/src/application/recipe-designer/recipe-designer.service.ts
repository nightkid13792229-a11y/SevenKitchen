import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DesignRecipeReviewStatus,
  DesignRecipeStatus,
  Prisma,
  RecipeStatus,
} from '@prisma/client';
import { nutritionDataToNutritionProfile } from '../nutrition-standard/nutrient-value-resolver';
import { normalizeNutritionProfile } from '../../domain/ingredient/nutrition-profile.utils';
import type { NutritionProfile } from '../../domain/ingredient/types';
import {
  assessRecipeDraft,
  type DesignRecipeAssessmentResult,
} from '../../domain/recipe-designer/recipe-assessment';
import type { FediafDogScenarioCode } from '../../domain/recipe-designer/types';
import { PrismaService } from '../../infrastructure/prisma.service';
import type {
  AddRecipeDesignItemDto,
  CreateRecipeDesignDraftDto,
  PublishRecipeDesignDraftDto,
  UpdateRecipeDesignDraftDto,
  UpdateRecipeDesignItemDto,
} from '../../interfaces/dto/recipe-designer/recipe-designer.dto';
import {
  FEDIAF_TARGET_PROVIDER,
  type FediafTargetProvider,
} from './fediaf-target-provider';

const DESIGN_RECIPE_INCLUDE = {
  items: {
    include: {
      nutritionFood: {
        include: {
          mappings: true,
        },
      },
    },
    orderBy: { sortOrder: 'asc' as const },
  },
};

type DesignRecipeWithItems = {
  id: string;
  name: string;
  version: number;
  status: string;
  fediafDogScenario: FediafDogScenarioCode;
  energyDensityKcalPerKg: number | null;
  totalWeightG: number;
  targetHealthTags: string[];
  applicableLifeStages: string[];
  notes: string | null;
  createdBy: string;
  isCompliant: boolean;
  reviewStatus: string;
  reviewNote: string | null;
  calculatedNutrition: unknown;
  complianceStatus: unknown;
  assessmentSummary: unknown;
  missingDataReport: unknown;
  items: DesignRecipeItemWithFood[];
};

type DesignRecipeItemWithFood = {
  id: string;
  nutritionFoodId: string;
  weightG: number;
  ratioPercent: number | null;
  preparationMethod: string | null;
  nutrientTargetKey: string | null;
  nutrientTargetValue: number | null;
  sortOrder: number;
  nutritionFood: {
    id: string;
    name: string;
    nutritionData: unknown;
    mappings?: Array<{
      ingredientId: string;
      isPrimary: boolean;
    }>;
  };
};

@Injectable()
export class RecipeDesignerService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(FEDIAF_TARGET_PROVIDER)
    private readonly targetProvider: FediafTargetProvider,
  ) {}

  async listDrafts(createdBy: string) {
    return this.prisma.designRecipe.findMany({
      where: { createdBy },
      include: DESIGN_RECIPE_INCLUDE,
      orderBy: { updatedAt: 'desc' },
    });
  }

  async createDraft(dto: CreateRecipeDesignDraftDto, userId: string) {
    return this.prisma.designRecipe.create({
      data: {
        name: dto.name,
        fediafDogScenario: dto.scenario,
        nutritionStandard: 'FEDIAF_2025',
        targetHealthTags: dto.targetHealthTags ?? [],
        applicableLifeStages: dto.applicableLifeStages ?? [],
        notes: dto.notes ?? null,
        createdBy: userId,
      },
      include: DESIGN_RECIPE_INCLUDE,
    });
  }

  async updateDraft(id: string, dto: UpdateRecipeDesignDraftDto) {
    return this.prisma.designRecipe.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.scenario !== undefined
          ? { fediafDogScenario: dto.scenario }
          : {}),
        ...(dto.targetHealthTags !== undefined
          ? { targetHealthTags: dto.targetHealthTags }
          : {}),
        ...(dto.applicableLifeStages !== undefined
          ? { applicableLifeStages: dto.applicableLifeStages }
          : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      },
      include: DESIGN_RECIPE_INCLUDE,
    });
  }

  async addItem(designRecipeId: string, dto: AddRecipeDesignItemDto) {
    return this.prisma.designRecipeItem.create({
      data: {
        designRecipeId,
        nutritionFoodId: dto.nutritionFoodId,
        weightG: dto.weightG,
        preparationMethod: dto.preparationMethod ?? null,
        nutrientTargetKey: dto.nutrientTargetKey ?? null,
        nutrientTargetValue: dto.nutrientTargetValue ?? null,
        sortOrder: dto.sortOrder ?? 0,
      },
      include: {
        nutritionFood: true,
      },
    });
  }

  async updateItem(itemId: string, dto: UpdateRecipeDesignItemDto) {
    return this.prisma.designRecipeItem.update({
      where: { id: itemId },
      data: {
        ...(dto.weightG !== undefined ? { weightG: dto.weightG } : {}),
        ...(dto.preparationMethod !== undefined
          ? { preparationMethod: dto.preparationMethod }
          : {}),
        ...(dto.nutrientTargetKey !== undefined
          ? { nutrientTargetKey: dto.nutrientTargetKey }
          : {}),
        ...(dto.nutrientTargetValue !== undefined
          ? { nutrientTargetValue: dto.nutrientTargetValue }
          : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      },
      include: {
        nutritionFood: true,
      },
    });
  }

  async removeItem(itemId: string) {
    return this.prisma.designRecipeItem.delete({
      where: { id: itemId },
    });
  }

  async assessDraft(id: string): Promise<DesignRecipeAssessmentResult> {
    const draft = await this.loadDraft(id);
    const targets = await this.targetProvider.getTargets(draft.fediafDogScenario);
    const result = assessRecipeDraft({
      scenario: draft.fediafDogScenario,
      targets,
      items: draft.items.map((item) => ({
        id: item.id,
        name: item.nutritionFood.name,
        weightG: item.weightG,
        nutritionProfile: this.toNutritionProfile(item.nutritionFood.nutritionData),
      })),
    });

    await this.prisma.designRecipe.update({
      where: { id },
      data: this.toAssessmentUpdateData(result),
    });

    return result;
  }

  async publishDraft(
    id: string,
    dto: PublishRecipeDesignDraftDto,
    userId: string,
  ) {
    const draft = await this.loadDraft(id);
    const assessment = await this.assessDraft(id);
    const reviewNote = dto.reviewNote?.trim() || null;

    if (assessment.energyDensityKcalPerKg === null) {
      throw new BadRequestException('缺少能量数据，无法发布正式食谱');
    }
    const energyDensityKcalPerKg = assessment.energyDensityKcalPerKg;

    if (assessment.overallStatus !== 'COMPLIANT' && !reviewNote) {
      throw new BadRequestException('需审核配方必须填写审核说明');
    }

    const ingredientItems = draft.items.map((item) => ({
      item,
      ingredientId: this.resolveIngredientId(item),
    }));

    return this.prisma.$transaction(async (tx) => {
      const recipe = await tx.recipe.create({
        data: {
          recipeId: draft.id,
          version: draft.version,
          name: draft.name,
          status: RecipeStatus.PUBLIC,
          energyDensityKcalPerKg,
          productionLossRate: 1,
          applicableLifeStages: draft.applicableLifeStages,
          targetHealthTags: draft.targetHealthTags,
          nutritionDetailedData: this.toJsonValue(assessment.nutrients),
          nutritionStandard: 'FEDIAF_2025',
          description: draft.notes,
          designSource: 'RECIPE_DESIGNER',
          isCustomRecipe: false,
          items: {
            create: ingredientItems.map(({ item, ingredientId }) => ({
              ingredientId,
              preparationMethod: item.preparationMethod,
              ratioPercent: this.findAssessedRatio(assessment, item.id),
              nutrientTargetKey: item.nutrientTargetKey,
              nutrientTargetValue: item.nutrientTargetValue,
              sortOrder: item.sortOrder,
              exampleWeight: item.weightG,
            })),
          },
        },
      });

      const reviewStatus =
        assessment.overallStatus === 'COMPLIANT'
          ? DesignRecipeReviewStatus.NONE
          : DesignRecipeReviewStatus.REQUIRED;
      const {
        status: _assessedStatus,
        reviewStatus: _assessedReviewStatus,
        ...assessmentUpdateData
      } = this.toAssessmentUpdateData(assessment);

      await tx.designRecipePublishSnapshot.create({
        data: {
          designRecipeId: draft.id,
          recipeId: recipe.recipeId,
          reviewStatus,
          reviewNote,
          publishedBy: userId,
          snapshotData: this.toJsonValue({
            designRecipe: draft,
            assessment,
            ingredientItems,
          }),
        },
      });

      return tx.designRecipe.update({
        where: { id: draft.id },
        data: {
          ...assessmentUpdateData,
          status: DesignRecipeStatus.PUBLISHED,
          publishedAt: new Date(),
          publishedRecipeId: recipe.recipeId,
          reviewStatus,
          reviewNote,
          reviewedBy:
            reviewStatus === DesignRecipeReviewStatus.REQUIRED ? userId : null,
          reviewedAt:
            reviewStatus === DesignRecipeReviewStatus.REQUIRED
              ? new Date()
              : null,
        },
        include: DESIGN_RECIPE_INCLUDE,
      });
    });
  }

  private async loadDraft(id: string): Promise<DesignRecipeWithItems> {
    const draft = await this.prisma.designRecipe.findUnique({
      where: { id },
      include: DESIGN_RECIPE_INCLUDE,
    });

    if (!draft) {
      throw new NotFoundException(`Design recipe ${id} not found`);
    }

    return draft as DesignRecipeWithItems;
  }

  private toNutritionProfile(nutritionData: unknown): NutritionProfile | null {
    if (!nutritionData || typeof nutritionData !== 'object') {
      return null;
    }

    if (this.isGroupedNutritionProfile(nutritionData)) {
      return normalizeNutritionProfile(nutritionData as NutritionProfile);
    }

    return nutritionDataToNutritionProfile(
      nutritionData as Record<string, unknown>,
    );
  }

  private isGroupedNutritionProfile(value: object): boolean {
    return (
      'meta' in value ||
      'macros' in value ||
      'minerals' in value ||
      'vitamins' in value ||
      'fattyAcids' in value ||
      'aminoAcids' in value ||
      'items' in value
    );
  }

  private toAssessmentUpdateData(result: DesignRecipeAssessmentResult) {
    const missingDataReport = result.entries
      .filter((entry) => entry.status === 'MISSING_DATA')
      .map((entry) => ({
        nutrientKey: entry.nutrientKey,
        label: entry.label,
        fieldStatus: entry.status,
      }));
    const isCompliant = result.overallStatus === 'COMPLIANT';

    return {
      totalWeightG: result.totalWeightG,
      energyDensityKcalPerKg: result.energyDensityKcalPerKg,
      calculatedNutrition: this.toJsonValue(result.nutrients),
      complianceStatus: this.toJsonValue(result.entries),
      assessmentSummary: this.toJsonValue({
        overallStatus: result.overallStatus,
        summary: result.summary,
      }),
      missingDataReport: this.toJsonValue(missingDataReport),
      isCompliant,
      status: isCompliant
        ? DesignRecipeStatus.COMPLIANT
        : DesignRecipeStatus.NEEDS_REVIEW,
      reviewStatus: isCompliant
        ? DesignRecipeReviewStatus.NONE
        : DesignRecipeReviewStatus.REQUIRED,
    };
  }

  private resolveIngredientId(item: DesignRecipeItemWithFood): string {
    const mappings = item.nutritionFood.mappings ?? [];
    const mapping =
      mappings.find((candidate) => candidate.isPrimary) ?? mappings[0];

    if (!mapping?.ingredientId) {
      throw new BadRequestException(
        `营养原料 ${item.nutritionFood.name} 未映射采购原料，无法发布正式食谱`,
      );
    }

    return mapping.ingredientId;
  }

  private findAssessedRatio(
    assessment: DesignRecipeAssessmentResult,
    itemId: string,
  ): number {
    return (
      assessment.items.find((item) => item.id === itemId)?.ratioPercent ?? 0
    );
  }

  private toJsonValue(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }
}
