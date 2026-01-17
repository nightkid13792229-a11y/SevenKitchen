import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { RecipeRepository, Recipe, RecipeItem, FindRecipesOptions, FilterOptions } from '../../domain/recipe/recipe.repository';
import { PrismaService } from '../prisma.service';

// Type for Recipe with items included
type RecipeWithItems = Prisma.RecipeGetPayload<{
  include: {
    items: {
      include: {
        ingredient: true
      },
      orderBy: {
        sortOrder: 'asc' // 按照 sortOrder 升序排列
      }
    }
    healthTagAssignments: {
      include: {
        healthTag: true
      }
    }
  };
}>;

@Injectable()
export class PrismaRecipeRepository implements RecipeRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Recipe | null> {
    // Find latest version for the given recipe ID
    const record = await this.prisma.recipe.findFirst({
      where: { recipeId: id },
      orderBy: { version: 'desc' },
      include: {
        items: {
          include: {
            ingredient: true
          },
          orderBy: {
            sortOrder: 'asc' // 按照 sortOrder 升序排列
          }
        },
        healthTagAssignments: {
          include: {
            healthTag: true
          }
        }
      },
    });
    return record ? this.mapToDomain(record) : null;
  }

  async findByIdAndVersion(
    id: string,
    version: number,
  ): Promise<Recipe | null> {
    const record = await this.prisma.recipe.findUnique({
      where: {
        recipeId_version: {
          recipeId: id,
          version,
        },
      },
      include: {
        items: {
          include: {
            ingredient: true
          }
        },
        healthTagAssignments: {
          include: {
            healthTag: true
          }
        }
      },
    });
    return record ? this.mapToDomain(record) : null;
  }

  async findPublicRecipes(options?: FindRecipesOptions): Promise<Recipe[]> {
    // Build where clause
    const where: Prisma.RecipeWhereInput = { status: 'PUBLIC' };

    // Filter by life stage
    if (options?.lifeStage) {
      where.applicableLifeStages = {
        array_contains: options.lifeStage
      };
    }

    // Filter by health tags (any match) - using relationship table
    if (options?.healthTags && options.healthTags.length > 0) {
      where.healthTagAssignments = {
        some: {
          healthTagId: {
            in: options.healthTags
          }
        }
      };
    }

    // Get all recipes matching the basic criteria
    const allRecipes = await this.prisma.recipe.findMany({
      where,
      include: {
        items: {
          include: {
            ingredient: {
              include: {
                tags: true
              }
            }
          }
        },
        healthTagAssignments: {
          include: {
            healthTag: true
          }
        }
      },
      orderBy: [{ recipeId: 'asc' }, { version: 'desc' }],
    });

    // Filter out recipes that contain excluded ingredient tags
    let filteredRecipes = allRecipes;
    if (options?.excludeTags && options.excludeTags.length > 0) {
      filteredRecipes = allRecipes.filter(recipe => {
        // Get all ingredient tag IDs for this recipe
        const recipeTagIds = new Set<string>();
        recipe.items?.forEach(item => {
          item.ingredient?.tags?.forEach(tagAssignment => {
            recipeTagIds.add(tagAssignment.tagId);
          });
        });

        // Check if any excluded tag is present
        return !options.excludeTags!.some(excludeTag => recipeTagIds.has(excludeTag));
      });
    }

    // Group by recipeId and take latest version
    const latestByRecipeId = new Map<string, RecipeWithItems>();
    for (const recipe of filteredRecipes) {
      const existing = latestByRecipeId.get(recipe.recipeId);
      if (!existing || recipe.version > existing.version) {
        latestByRecipeId.set(recipe.recipeId, recipe);
      }
    }

    return Array.from(latestByRecipeId.values()).map((r) =>
      this.mapToDomain(r),
    );
  }

  async getFilterOptions(): Promise<FilterOptions> {
    // Get all public recipes with health tag assignments
    const allRecipes = await this.prisma.recipe.findMany({
      where: { status: 'PUBLIC' },
      select: {
        applicableLifeStages: true,
        healthTagAssignments: {
          select: {
            healthTagId: true,
          },
        },
      },
    });

    // Get all health tags
    const allHealthTags = await this.prisma.recipeHealthTag.findMany({
      select: {
        id: true,
        name: true,
      },
      orderBy: { sort: 'asc' },
    });

    // Get all ingredient tags
    const allTags = await this.prisma.ingredientTag.findMany({
      select: {
        id: true,
        name: true,
      },
      orderBy: { sort: 'asc' },
    });

    // Aggregate life stages
    const lifeStageMap = new Map<string, number>();
    allRecipes.forEach(recipe => {
      const stages = recipe.applicableLifeStages as string[] || [];
      stages.forEach(stage => {
        lifeStageMap.set(stage, (lifeStageMap.get(stage) || 0) + 1);
      });
    });

    const lifeStages = Array.from(lifeStageMap.entries()).map(([value, count]) => ({
      value,
      label: this.getLifeStageLabel(value),
      count,
    }));

    // Aggregate health tags from relationship table
    const healthTagMap = new Map<string, number>();
    allRecipes.forEach(recipe => {
      recipe.healthTagAssignments?.forEach(assignment => {
        healthTagMap.set(assignment.healthTagId, (healthTagMap.get(assignment.healthTagId) || 0) + 1);
      });
    });

    const healthTags = Array.from(healthTagMap.entries()).map(([value, count]) => {
      const healthTag = allHealthTags.find(tag => tag.id === value);
      return {
        value,
        label: healthTag?.name || value,
        count,
      };
    });

    // Ingredient tags (direct from database)
    const ingredientTags = allTags.map(tag => ({
      value: tag.id,
      label: tag.name,
      count: 0, // TODO: Count recipes containing this tag
    }));

    return {
      lifeStages,
      healthTags,
      ingredientTags,
      total: allRecipes.length,
    };
  }

  // Helper methods for label translation
  private getLifeStageLabel(stage: string): string {
    const labels: Record<string, string> = {
      'PUPPY': '幼犬',
      'ADULT': '成犬',
      'SENIOR': '老年犬',
      'PREGNANCY': '妊娠期',
      'LACTATION': '哺乳期',
    };
    return labels[stage] || stage;
  }

  private getHealthTagLabel(tag: string): string {
    const labels: Record<string, string> = {
      'HEALTHY': '健康',
      'PICKY_EATER': '挑食',
      'SENSITIVE_STOMACH': '敏感胃',
      'PANCREATITIS_SUPPORT': '胰腺炎友好',
      'LOW_FAT': '低脂',
      'SKIN_COAT_CARE': '护肤',
    };
    return labels[tag] || tag;
  }

  async save(recipe: Recipe): Promise<Recipe> {
    const existing = await this.prisma.recipe.findUnique({
      where: {
        recipeId_version: {
          recipeId: recipe.id,
          version: recipe.version,
        },
      },
      select: { id: true },
    });

    // Create recipe data without items first
    const recipeData = {
      recipeId: recipe.id,
      version: recipe.version,
      name: recipe.name,
      status: recipe.status as any,
      energyDensityKcalPerKg: recipe.energyDensityKcalPerKg,
      productionLossRate: recipe.productionLossRate,
      batchLaborHours: recipe.batchLaborHours,
    };

    if (!existing) {
      // Create recipe first
      await this.prisma.recipe.create({
        data: recipeData,
      });
      // Then create items separately
      if (recipe.items && recipe.items.length > 0) {
        await this.prisma.recipeItem.createMany({
          data: recipe.items.map((item) => ({
            recipeId: recipe.id,
            recipeVersion: recipe.version,
            ingredientId: item.ingredientId,
            preparationMethod: item.preparationMethod,
            exampleWeight: item.exampleWeight,
            ratioPercent: item.ratioPercent,
            nutrientTargetKey: item.nutrientTargetKey,
            nutrientTargetValue: item.nutrientTargetValue,
          })),
        });
      }
    } else {
      // Update recipe
      await this.prisma.recipe.update({
        where: {
          recipeId_version: {
            recipeId: recipe.id,
            version: recipe.version,
          },
        },
        data: recipeData,
      });
      // Delete existing items and create new ones
      await this.prisma.recipeItem.deleteMany({
        where: {
          recipeId: recipe.id,
          recipeVersion: recipe.version,
        },
      });
      if (recipe.items && recipe.items.length > 0) {
        await this.prisma.recipeItem.createMany({
          data: recipe.items.map((item) => ({
            recipeId: recipe.id,
            recipeVersion: recipe.version,
            ingredientId: item.ingredientId,
            preparationMethod: item.preparationMethod,
            exampleWeight: item.exampleWeight,
            ratioPercent: item.ratioPercent,
            nutrientTargetKey: item.nutrientTargetKey,
            nutrientTargetValue: item.nutrientTargetValue,
          })),
        });
      }
    }

    const saved = await this.prisma.recipe.findUnique({
      where: {
        recipeId_version: {
          recipeId: recipe.id,
          version: recipe.version,
        },
      },
      include: {
        items: {
          include: {
            ingredient: true
          }
        },
        healthTagAssignments: {
          include: {
            healthTag: true
          }
        }
      },
    });
    return saved ? this.mapToDomain(saved) : recipe;
  }

  private mapToDomain(record: RecipeWithItems): Recipe {
    return {
      id: record.recipeId,
      version: record.version,
      name: record.name,
      status: record.status,
      energyDensityKcalPerKg: Number(record.energyDensityKcalPerKg),
      productionLossRate: Number(record.productionLossRate),
      batchLaborHours: record.batchLaborHours
        ? Number(record.batchLaborHours)
        : undefined,
      coverImageUrl: record.coverImageUrl,
      targetHealthTags: record.healthTagAssignments?.map(assign => assign.healthTagId) || [],
      applicableLifeStages: record.applicableLifeStages as string[] || [],
      designSource: record.designSource,
      nutritionStandard: record.nutritionStandard,
      nutritionDetailedData: record.nutritionDetailedData,
      description: record.description,
      items: record.items.map((item): RecipeItem => ({
        id: item.id,
        ingredientId: item.ingredientId,
        preparationMethod: item.preparationMethod,
        exampleWeight: item.exampleWeight ? Number(item.exampleWeight) : null,
        ratioPercent: item.ratioPercent ? Number(item.ratioPercent) : null,
        sortOrder: item.sortOrder ? Number(item.sortOrder) : null,
        nutrientTargetKey: item.nutrientTargetKey,
        nutrientTargetValue: item.nutrientTargetValue
          ? Number(item.nutrientTargetValue)
          : null,
        ingredient: item.ingredient ? {
          id: item.ingredient.id,
          name: item.ingredient.name,
          type: item.ingredient.type,
          properties: item.ingredient.properties,
        } : undefined,
      })),
    };
  }
}

