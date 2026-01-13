/**
 * Recipe Service
 * Business logic for recipe management in admin panel
 */

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma.service';
import { Prisma } from '@prisma/client';
import { RecipeStatus, RecipeHealthTag, LifeStage, NutritionStandard } from '../../domain/recipe/enums';
import type {
  RecipeQueryDto,
} from '../../interfaces/dto/recipes/admin-recipe.dto';
import type {
  RecipeSummaryResponseDto,
  RecipeDetailResponseDto,
  RecipeListResponseDto,
} from '../../interfaces/dto/recipes/admin-recipe.dto';

@Injectable()
export class RecipeService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get all recipes with filters and pagination
   */
  async getAllRecipes(query: RecipeQueryDto): Promise<RecipeListResponseDto> {
    const {
      status,
      lifeStage,
      healthTag,
      search,
      page = 1,
      pageSize = 20,
    } = query;

    const where: any = {};

    // Status filter
    if (status) {
      where.status = status;
    }

    // Search by name or ID
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { recipeId: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Life stage filter (JSON array contains)
    if (lifeStage) {
      where.applicableLifeStages = {
        path: '$',
        string_contains: lifeStage,
      };
    }

    // Health tag filter (using relationship table)
    if (healthTag) {
      where.healthTagAssignments = {
        some: {
          healthTagId: healthTag,
        },
      };
    }

    const [recipes, total] = await Promise.all([
      this.prisma.recipe.findMany({
        where,
        include: {
          healthTagAssignments: {
            include: {
              healthTag: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.recipe.count({ where }),
    ]);

    const data: RecipeSummaryResponseDto[] = recipes.map((recipe) =>
      this.mapToSummaryDto(recipe),
    );

    return {
      data,
      total,
      page,
      pageSize,
    };
  }

  /**
   * Get recipe by ID with full details
   */
  async getRecipeById(id: string): Promise<RecipeDetailResponseDto> {
    const recipe = await this.prisma.recipe.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            ingredient: true,
          },
          orderBy: {
            sortOrder: 'asc',
          },
        },
        healthTagAssignments: {
          include: {
            healthTag: true,
          },
        },
      },
    });

    if (!recipe) {
      throw new NotFoundException(`Recipe not found: ${id}`);
    }

    return this.mapToDetailDto(recipe);
  }

  /**
   * Create new recipe
   */
  async createRecipe(dto: Record<string, any>): Promise<RecipeDetailResponseDto> {
    // Check if recipe with same name exists
    const existing = await this.prisma.recipe.findFirst({
      where: { name: dto.name },
    });

    if (existing) {
      throw new BadRequestException(`Recipe with name "${dto.name}" already exists`);
    }

    // Generate recipe ID and set initial version
    const recipeId = crypto.randomUUID();
    const version = 1;
    const targetHealthTags = dto.targetHealthTags || [];

    // Create recipe with items
    const recipe = await this.prisma.recipe.create({
      data: {
        recipeId,
        version,
        name: dto.name,
        status: (dto.status || RecipeStatus.DRAFT) as any,
        energyDensityKcalPerKg: dto.energyDensityKcalPerKg,
        productionLossRate: dto.productionLossRate ?? 1.07,
        batchLaborHours: dto.batchLaborHours ?? 2.0,
        coverImageUrl: dto.coverImageUrl,
        detailImages: dto.detailImages || [],
        videoUrl: dto.videoUrl,
        description: dto.description,
        designSource: dto.designSource,
        nutritionStandard: dto.nutritionStandard as any,
        nutritionDetailedData: ((dto.nutritionDetailedData || Prisma.JsonNull) as unknown) as Prisma.InputJsonValue,
        targetHealthTags: [] as any, // Keep empty for now, will be migrated
        applicableLifeStages: (dto.applicableLifeStages || []) as any,
        productionSteps: dto.productionSteps,
        items: dto.items ? {
          create: dto.items.map((item: any, index: number) => ({
            ingredientId: item.ingredientId,
            preparationMethod: item.preparationMethod,
            exampleWeight: item.exampleWeight,
            ratioPercent: item.ratioPercent,
            nutrientTargetKey: item.nutrientTargetKey,
            nutrientTargetValue: item.nutrientTargetValue,
            sortOrder: index,
          })),
        } : undefined,
      },
      include: {
        items: true,
      },
    });

    // Create health tag assignments
    if (targetHealthTags.length > 0) {
      await this.prisma.recipeHealthTagAssignment.createMany({
        data: targetHealthTags.map((healthTagId: string) => ({
          recipeId: recipe.id,
          healthTagId,
        })),
        skipDuplicates: true,
      });
    }

    // Fetch the recipe with health tag assignments
    const recipeWithTags = await this.prisma.recipe.findUnique({
      where: { id: recipe.id },
      include: {
        items: {
          include: {
            ingredient: true,
          },
          orderBy: {
            sortOrder: 'asc',
          },
        },
        healthTagAssignments: {
          include: {
            healthTag: true,
          },
        },
      },
    });

    return this.mapToDetailDto(recipeWithTags!);
  }

  /**
   * Update recipe (creates new version)
   */
  async updateRecipe(
    id: string,
    dto: Record<string, any>,
  ): Promise<RecipeDetailResponseDto> {
    // Get existing recipe
    const existing = await this.prisma.recipe.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException(`Recipe not found: ${id}`);
    }

    // Increment version
    const newVersion = existing.version + 1;
    const targetHealthTags = dto.targetHealthTags ?? undefined;

    // Delete old items
    await this.prisma.recipeItem.deleteMany({
      where: { recipeId: existing.recipeId, recipeVersion: existing.version },
    });

    // Update recipe (creates new version)
    const recipe = await this.prisma.recipe.update({
      where: { id },
      data: {
        version: newVersion,
        name: dto.name,
        status: (dto.status ?? existing.status) as any,
        energyDensityKcalPerKg: dto.energyDensityKcalPerKg ?? existing.energyDensityKcalPerKg,
        productionLossRate: dto.productionLossRate ?? existing.productionLossRate,
        batchLaborHours: dto.batchLaborHours ?? existing.batchLaborHours,
        coverImageUrl: dto.coverImageUrl,
        detailImages: dto.detailImages,
        videoUrl: dto.videoUrl,
        description: dto.description,
        designSource: dto.designSource,
        nutritionStandard: dto.nutritionStandard as any,
        nutritionDetailedData: ((dto.nutritionDetailedData ?? Prisma.JsonNull) as unknown) as Prisma.InputJsonValue,
        targetHealthTags: [] as any, // Keep empty for now
        applicableLifeStages: (dto.applicableLifeStages ?? undefined) as any,
        productionSteps: dto.productionSteps,
        items: dto.items ? {
          create: dto.items.map((item: any, index: number) => ({
            ingredientId: item.ingredientId,
            preparationMethod: item.preparationMethod,
            exampleWeight: item.exampleWeight,
            ratioPercent: item.ratioPercent,
            nutrientTargetKey: item.nutrientTargetKey,
            nutrientTargetValue: item.nutrientTargetValue,
            sortOrder: index,
          })),
        } : undefined,
      },
      include: {
        items: true,
      },
    });

    // Update health tag assignments if provided
    if (targetHealthTags !== undefined) {
      // Delete old assignments
      await this.prisma.recipeHealthTagAssignment.deleteMany({
        where: { recipeId: recipe.id },
      });

      // Create new assignments
      if (targetHealthTags.length > 0) {
        await this.prisma.recipeHealthTagAssignment.createMany({
          data: targetHealthTags.map((healthTagId: string) => ({
            recipeId: recipe.id,
            healthTagId,
          })),
          skipDuplicates: true,
        });
      }
    }

    // Fetch the recipe with health tag assignments
    const recipeWithTags = await this.prisma.recipe.findUnique({
      where: { id: recipe.id },
      include: {
        items: {
          include: {
            ingredient: true,
          },
          orderBy: {
            sortOrder: 'asc',
          },
        },
        healthTagAssignments: {
          include: {
            healthTag: true,
          },
        },
      },
    });

    return this.mapToDetailDto(recipeWithTags!);
  }

  /**
   * Delete recipe (any status, will unpublish if PUBLIC)
   */
  async deleteRecipe(id: string): Promise<void> {
    const recipe = await this.prisma.recipe.findUnique({
      where: { id },
    });

    if (!recipe) {
      throw new NotFoundException(`Recipe not found: ${id}`);
    }

    // If recipe is PUBLIC, unpublish it first
    if (recipe.status === RecipeStatus.PUBLIC) {
      await this.prisma.recipe.update({
        where: { id },
        data: { status: RecipeStatus.DRAFT },
      });
    }

    await this.prisma.recipe.delete({
      where: { id },
    });
  }

  /**
   * Publish recipe (DRAFT -> PUBLIC)
   */
  async publishRecipe(id: string): Promise<RecipeDetailResponseDto> {
    const recipe = await this.prisma.recipe.findUnique({
      where: { id },
      include: {
        items: true,
        healthTagAssignments: {
          include: {
            healthTag: true,
          },
        },
      },
    });

    if (!recipe) {
      throw new NotFoundException(`Recipe not found: ${id}`);
    }

    if (recipe.status !== RecipeStatus.DRAFT) {
      throw new BadRequestException(
        `Can only publish DRAFT recipes. Current status: ${recipe.status}`,
      );
    }

    const updated = await this.prisma.recipe.update({
      where: { id },
      data: { status: RecipeStatus.PUBLIC },
      include: {
        items: true,
        healthTagAssignments: {
          include: {
            healthTag: true,
          },
        },
      },
    });

    return this.mapToDetailDto(updated);
  }

  /**
   * Unpublish recipe (PUBLIC -> DRAFT)
   */
  async unpublishRecipe(id: string): Promise<RecipeDetailResponseDto> {
    const recipe = await this.prisma.recipe.findUnique({
      where: { id },
      include: {
        items: true,
        healthTagAssignments: {
          include: {
            healthTag: true,
          },
        },
      },
    });

    if (!recipe) {
      throw new NotFoundException(`Recipe not found: ${id}`);
    }

    if (recipe.status !== RecipeStatus.PUBLIC) {
      throw new BadRequestException(
        `Can only unpublish PUBLIC recipes. Current status: ${recipe.status}`,
      );
    }

    const updated = await this.prisma.recipe.update({
      where: { id },
      data: { status: RecipeStatus.DRAFT },
      include: {
        items: true,
        healthTagAssignments: {
          include: {
            healthTag: true,
          },
        },
      },
    });

    return this.mapToDetailDto(updated);
  }

  /**
   * Duplicate recipe (create new recipe with new ID)
   */
  async duplicateRecipe(id: string): Promise<RecipeDetailResponseDto> {
    const recipe = await this.prisma.recipe.findUnique({
      where: { id },
      include: {
        items: true,
        healthTagAssignments: {
          include: {
            healthTag: true,
          },
        },
      },
    });

    if (!recipe) {
      throw new NotFoundException(`Recipe not found: ${id}`);
    }

    // Create new recipe with same data but new ID
    const newRecipeId = crypto.randomUUID();
    const newVersion = 1;

    const duplicated = await this.prisma.recipe.create({
      data: {
        recipeId: newRecipeId,
        version: newVersion,
        name: `${recipe.name} (副本)`,
        status: RecipeStatus.DRAFT,
        energyDensityKcalPerKg: recipe.energyDensityKcalPerKg,
        productionLossRate: recipe.productionLossRate,
        batchLaborHours: recipe.batchLaborHours,
        coverImageUrl: recipe.coverImageUrl,
        detailImages: recipe.detailImages as Prisma.InputJsonValue,
        videoUrl: recipe.videoUrl,
        description: recipe.description,
        nutritionStandard: recipe.nutritionStandard,
        nutritionDetailedData: recipe.nutritionDetailedData as Prisma.InputJsonValue,
        targetHealthTags: [] as any, // Keep empty for now
        applicableLifeStages: recipe.applicableLifeStages as Prisma.InputJsonValue,
        productionSteps: recipe.productionSteps,
        items: {
          create: recipe.items.map(item => ({
            ingredientId: item.ingredientId,
            preparationMethod: item.preparationMethod,
            ratioPercent: item.ratioPercent,
            nutrientTargetKey: item.nutrientTargetKey,
            nutrientTargetValue: item.nutrientTargetValue,
            sortOrder: item.sortOrder,
          })),
        },
      },
      include: {
        items: true,
      },
    });

    // Duplicate health tag assignments
    if (recipe.healthTagAssignments && recipe.healthTagAssignments.length > 0) {
      await this.prisma.recipeHealthTagAssignment.createMany({
        data: recipe.healthTagAssignments.map(assignment => ({
          recipeId: duplicated.id,
          healthTagId: assignment.healthTagId,
        })),
        skipDuplicates: true,
      });
    }

    // Fetch with health tag assignments
    const duplicatedWithTags = await this.prisma.recipe.findUnique({
      where: { id: duplicated.id },
      include: {
        items: {
          include: {
            ingredient: true,
          },
          orderBy: {
            sortOrder: 'asc',
          },
        },
        healthTagAssignments: {
          include: {
            healthTag: true,
          },
        },
      },
    });

    return this.mapToDetailDto(duplicatedWithTags!);
  }

  /**
   * Get recipe version history
   */
  async getRecipeVersions(recipeId: string): Promise<RecipeSummaryResponseDto[]> {
    const recipes = await this.prisma.recipe.findMany({
      where: { recipeId },
      orderBy: { version: 'desc' },
    });

    return recipes.map(recipe => this.mapToSummaryDto(recipe));
  }

  /**
   * Get recipe sales statistics
   */
  async getRecipeSalesStats(id: string): Promise<{
    salesCount: number;
    diyGenCount: number;
    likeCount: number;
    favoriteCount: number;
  }> {
    const recipe = await this.prisma.recipe.findUnique({
      where: { id },
    });

    if (!recipe) {
      throw new NotFoundException(`Recipe not found: ${id}`);
    }

    return {
      salesCount: recipe.salesCount,
      diyGenCount: recipe.diyGenCount,
      likeCount: recipe.likeCount,
      favoriteCount: recipe.favoriteCount,
    };
  }

  /**
   * Map Recipe entity to Summary DTO
   */
  private mapToSummaryDto(recipe: any): RecipeSummaryResponseDto {
    return {
      id: recipe.id,
      name: recipe.name,
      version: recipe.version,
      status: recipe.status as RecipeStatus,
      coverImageUrl: recipe.coverImageUrl,
      energyDensityKcalPerKg: recipe.energyDensityKcalPerKg,
      applicableLifeStages: (recipe.applicableLifeStages as LifeStage[]) || [],
      targetHealthTags: recipe.healthTagAssignments?.map((a: any) => a.healthTagId) || [],
      salesCount: recipe.salesCount,
      diyGenCount: recipe.diyGenCount,
      likeCount: recipe.likeCount,
      favoriteCount: recipe.favoriteCount,
      createdAt: recipe.createdAt.toISOString(),
      updatedAt: recipe.updatedAt.toISOString(),
    };
  }

  /**
   * Map Recipe entity to Detail DTO
   */
  private mapToDetailDto(recipe: any): RecipeDetailResponseDto {
    return {
      ...this.mapToSummaryDto(recipe),
      detailImages: (recipe.detailImages as string[]) || undefined,
      videoUrl: recipe.videoUrl || undefined,
      description: recipe.description || undefined,
      designSource: recipe.designSource || undefined,
      nutritionStandard: recipe.nutritionStandard as NutritionStandard,
      nutritionDetailedData: recipe.nutritionDetailedData || undefined,
      productionSteps: recipe.productionSteps || undefined,
      productionLossRate: recipe.productionLossRate,
      batchLaborHours: recipe.batchLaborHours || undefined,
      items: recipe.items?.map((item: any) => ({
        id: item.id,
        ingredientId: item.ingredientId,
        ingredientName: item.ingredient?.name,
        ingredientType: item.ingredient?.type,
        ingredient: item.ingredient ? {
          id: item.ingredient.id,
          name: item.ingredient.name,
          type: item.ingredient.type,
          properties: item.ingredient.properties,
        } : undefined,
        preparationMethod: item.preparationMethod || undefined,
        exampleWeight: item.exampleWeight || undefined,
        ratioPercent: item.ratioPercent || undefined,
        nutrientTargetKey: item.nutrientTargetKey || undefined,
        nutrientTargetValue: item.nutrientTargetValue || undefined,
      })) || [],
    };
  }
}
