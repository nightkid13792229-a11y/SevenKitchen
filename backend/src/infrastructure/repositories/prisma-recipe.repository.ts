import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  RecipeRepository,
  Recipe,
  RecipeItem,
  FindRecipesOptions,
  FilterOptions,
  IngredientGroup,
} from '../../domain/recipe/recipe.repository';
import { PrismaService } from '../prisma.service';

// Type for Recipe with items included
type RecipeWithItems = Prisma.RecipeGetPayload<{
  include: {
    items: {
      include: {
        ingredient: true;
        supplementAlternatives: {
          include: {
            alternativeIngredient: true;
          };
          orderBy: {
            sortOrder: 'asc';
          };
        };
      };
      orderBy: {
        sortOrder: 'asc'; // 按照 sortOrder 升序排列
      };
    };
    healthTagAssignments: {
      include: {
        healthTag: true;
      };
    };
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
            ingredient: true,
            supplementAlternatives: {
              include: {
                alternativeIngredient: true,
              },
              orderBy: {
                sortOrder: 'asc',
              },
            },
          },
          orderBy: {
            sortOrder: 'asc', // 按照 sortOrder 升序排列
          },
        },
        healthTagAssignments: {
          include: {
            healthTag: true,
          },
        },
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
            ingredient: true,
            supplementAlternatives: {
              include: {
                alternativeIngredient: true,
              },
              orderBy: {
                sortOrder: 'asc',
              },
            },
          },
        },
        healthTagAssignments: {
          include: {
            healthTag: true,
          },
        },
      },
    });
    return record ? this.mapToDomain(record) : null;
  }

  async findPublicRecipes(options?: FindRecipesOptions): Promise<Recipe[]> {
    // Build where clause
    const where: Prisma.RecipeWhereInput = { status: 'PUBLIC' };

    // Filter by health tags (any match) - using relationship table
    if (options?.healthTags && options.healthTags.length > 0) {
      where.healthTagAssignments = {
        some: {
          healthTagId: {
            in: options.healthTags,
          },
        },
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
                tags: true,
              },
            },
            supplementAlternatives: {
              include: {
                alternativeIngredient: true,
              },
              orderBy: {
                sortOrder: 'asc',
              },
            },
          },
        },
        healthTagAssignments: {
          include: {
            healthTag: true,
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }],
    });

    // Filter by life stages (any match) - in-memory filtering for JSON field
    let filteredRecipes = allRecipes;
    if (options?.lifeStages && options.lifeStages.length > 0) {
      filteredRecipes = allRecipes.filter((recipe) => {
        const stages = (recipe.applicableLifeStages as string[]) || [];
        // Check if recipe has ANY of the selected life stages
        return options.lifeStages!.some((selectedStage) =>
          stages.includes(selectedStage),
        );
      });
    }

    // Filter out recipes that contain excluded ingredient tags
    if (options?.excludeTags && options.excludeTags.length > 0) {
      filteredRecipes = filteredRecipes.filter((recipe) => {
        // Get all ingredient tag IDs for this recipe
        const recipeTagIds = new Set<string>();
        recipe.items?.forEach((item) => {
          item.ingredient?.tags?.forEach((tagAssignment) => {
            recipeTagIds.add(tagAssignment.tagId);
          });
        });

        // Check if any excluded tag is present
        return !options.excludeTags!.some((excludeTag) =>
          recipeTagIds.has(excludeTag),
        );
      });
    }

    // Filter out recipes that contain excluded ingredients
    if (options?.excludeIngredients && options.excludeIngredients.length > 0) {
      const excludeSet = new Set(options.excludeIngredients);
      filteredRecipes = filteredRecipes.filter((recipe) => {
        return !recipe.items?.some(
          (item) => item.ingredientId && excludeSet.has(item.ingredientId),
        );
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

    // Sort by createdAt descending AFTER grouping
    return Array.from(latestByRecipeId.values())
      .sort((a, b) => {
        const aTime =
          a.createdAt instanceof Date
            ? a.createdAt.getTime()
            : new Date(a.createdAt).getTime();
        const bTime =
          b.createdAt instanceof Date
            ? b.createdAt.getTime()
            : new Date(b.createdAt).getTime();
        return bTime - aTime;
      })
      .map((r) => this.mapToDomain(r));
  }

  async findPublicRecipesPaginated(options?: FindRecipesOptions): Promise<{
    data: Recipe[];
    total: number;
    page: number;
    pageSize: number;
    hasMore: boolean;
  }> {
    // Build where clause
    const where: Prisma.RecipeWhereInput = { status: 'PUBLIC' };

    // Filter by health tags (any match) - using relationship table
    if (options?.healthTags && options.healthTags.length > 0) {
      where.healthTagAssignments = {
        some: {
          healthTagId: {
            in: options.healthTags,
          },
        },
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
                tags: true,
              },
            },
            supplementAlternatives: {
              include: {
                alternativeIngredient: true,
              },
              orderBy: {
                sortOrder: 'asc',
              },
            },
          },
        },
        healthTagAssignments: {
          include: {
            healthTag: true,
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }],
    });

    // Filter by life stages (any match) - in-memory filtering for JSON field
    let filteredRecipes = allRecipes;
    if (options?.lifeStages && options.lifeStages.length > 0) {
      filteredRecipes = allRecipes.filter((recipe) => {
        const stages = (recipe.applicableLifeStages as string[]) || [];
        // Check if recipe has ANY of the selected life stages
        return options.lifeStages!.some((selectedStage) =>
          stages.includes(selectedStage),
        );
      });
    }

    // Filter out recipes that contain excluded ingredient tags
    if (options?.excludeTags && options.excludeTags.length > 0) {
      filteredRecipes = filteredRecipes.filter((recipe) => {
        // Get all ingredient tag IDs for this recipe
        const recipeTagIds = new Set<string>();
        recipe.items?.forEach((item) => {
          item.ingredient?.tags?.forEach((tagAssignment) => {
            recipeTagIds.add(tagAssignment.tagId);
          });
        });

        // Check if any excluded tag is present
        return !options.excludeTags!.some((excludeTag) =>
          recipeTagIds.has(excludeTag),
        );
      });
    }

    // Filter out recipes that contain excluded ingredients
    if (options?.excludeIngredients && options.excludeIngredients.length > 0) {
      const excludeSet = new Set(options.excludeIngredients);
      console.log(`[PrismaRecipeRepo] PAGINATED excludeIngredients:`, [...excludeSet]);
      const beforeCount = filteredRecipes.length;
      filteredRecipes = filteredRecipes.filter((recipe) => {
        const hasExcluded = recipe.items?.some(
          (item) => item.ingredientId && excludeSet.has(item.ingredientId),
        );
        if (hasExcluded) {
          console.log(`[PrismaRecipeRepo] Excluding recipe "${recipe.name}" - items:`, recipe.items?.map(i => ({ ingId: i.ingredientId, name: i.ingredient?.name })));
        }
        return !hasExcluded;
      });
      console.log(`[PrismaRecipeRepo] After excludeIngredients filter: ${beforeCount} -> ${filteredRecipes.length}`);
    }

    // Group by recipeId and take latest version
    const latestByRecipeId = new Map<string, RecipeWithItems>();
    for (const recipe of filteredRecipes) {
      const existing = latestByRecipeId.get(recipe.recipeId);
      if (!existing || recipe.version > existing.version) {
        latestByRecipeId.set(recipe.recipeId, recipe);
      }
    }

    // Sort by createdAt descending AFTER grouping to ensure correct order
    const uniqueRecipes = Array.from(latestByRecipeId.values()).sort((a, b) => {
      const aTime =
        a.createdAt instanceof Date
          ? a.createdAt.getTime()
          : new Date(a.createdAt).getTime();
      const bTime =
        b.createdAt instanceof Date
          ? b.createdAt.getTime()
          : new Date(b.createdAt).getTime();
      return bTime - aTime;
    });
    const total = uniqueRecipes.length;

    // Apply pagination
    const page = options?.page || 1;
    const pageSize = options?.pageSize || 10;
    const skip = (page - 1) * pageSize;
    const take = pageSize;

    // Get paginated slice
    const paginatedRecipes = uniqueRecipes.slice(skip, skip + take);
    const hasMore = skip + take < total;

    return {
      data: paginatedRecipes.map((r) => this.mapToDomain(r)),
      total,
      page,
      pageSize,
      hasMore,
    };
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
    allRecipes.forEach((recipe) => {
      const stages = (recipe.applicableLifeStages as string[]) || [];
      stages.forEach((stage) => {
        lifeStageMap.set(stage, (lifeStageMap.get(stage) || 0) + 1);
      });
    });

    const lifeStages = Array.from(lifeStageMap.entries()).map(
      ([value, count]) => ({
        value,
        label: this.getLifeStageLabel(value),
        count,
      }),
    );

    // Aggregate health tags from relationship table
    const healthTagMap = new Map<string, number>();
    allRecipes.forEach((recipe) => {
      recipe.healthTagAssignments?.forEach((assignment) => {
        healthTagMap.set(
          assignment.healthTagId,
          (healthTagMap.get(assignment.healthTagId) || 0) + 1,
        );
      });
    });

    // Include all health tags (even those not yet assigned to any recipe)
    const healthTags = allHealthTags.map((tag) => ({
      value: tag.id,
      label: tag.name,
      count: healthTagMap.get(tag.id) || 0,
    }));

    // Ingredient tags (direct from database)
    const ingredientTags = allTags.map((tag) => ({
      value: tag.id,
      label: tag.name,
      count: 0, // TODO: Count recipes containing this tag
    }));

    // Build ingredient groups by CFCT classification
    const ingredientGroups = await this.buildIngredientGroups();

    return {
      lifeStages,
      healthTags,
      ingredientTags,
      ingredientGroups,
      total: allRecipes.length,
    };
  }

  // CFCT分类排序顺序
  private readonly CFCT_ORDER = [
    '谷类及制品',
    '薯类及制品',
    '干豆类及制品',
    '蔬菜类及制品',
    '菌藻类',
    '水果类及制品',
    '坚果种子类',
    '畜肉类及制品',
    '禽肉类及制品',
    '乳类及制品',
    '蛋类及制品',
    '水产类',
    '油脂类',
    '调味品类',
    '其他',
  ];

  private async buildIngredientGroups(): Promise<IngredientGroup[]> {
    // Query all FOOD type ingredients that appear in PUBLIC recipes
    const ingredients = await this.prisma.ingredient.findMany({
      where: {
        type: 'FOOD',
        recipeItems: {
          some: {
            recipe: {
              status: 'PUBLIC',
            },
          },
        },
      },
      select: {
        id: true,
        name: true,
        properties: true,
      },
    });

    // Group by cfct_class from properties JSON, then deduplicate by name
    const groupMap = new Map<string, Map<string, string[]>>();
    for (const ing of ingredients) {
      const props = ing.properties as any;
      const cfctClass = props?.cfct_class || '其他';
      if (!groupMap.has(cfctClass)) {
        groupMap.set(cfctClass, new Map());
      }
      const nameMap = groupMap.get(cfctClass)!;
      if (!nameMap.has(ing.name)) {
        nameMap.set(ing.name, []);
      }
      nameMap.get(ing.name)!.push(ing.id);
    }

    // Convert to IngredientGroup[]
    const result: IngredientGroup[] = [];
    for (const [category, nameMap] of groupMap) {
      result.push({
        category,
        ingredients: Array.from(nameMap.entries()).map(([name, ids]) => ({
          ids,
          name,
        })),
      });
    }

    // Sort groups by CFCT order, "其他" always last
    result.sort((a, b) => {
      const idxA = this.CFCT_ORDER.indexOf(a.category);
      const idxB = this.CFCT_ORDER.indexOf(b.category);
      const orderA = idxA === -1 ? this.CFCT_ORDER.length - 1 : idxA;
      const orderB = idxB === -1 ? this.CFCT_ORDER.length - 1 : idxB;
      return orderA - orderB;
    });

    return result;
  }

  // Helper methods for label translation
  private getLifeStageLabel(stage: string): string {
    const labels: Record<string, string> = {
      PUPPY: '幼犬',
      ADULT: '成犬',
      SENIOR: '老年犬',
      PREGNANCY: '妊娠期',
      LACTATION: '哺乳期',
    };
    return labels[stage] || stage;
  }

  private getHealthTagLabel(tag: string): string {
    const labels: Record<string, string> = {
      HEALTHY: '健康',
      PICKY_EATER: '挑食',
      SENSITIVE_STOMACH: '敏感胃',
      PANCREATITIS_SUPPORT: '胰腺炎友好',
      LOW_FAT: '低脂',
      SKIN_COAT_CARE: '护肤',
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
            supplementTargets: item.supplementTargets ?? undefined,
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
            supplementTargets: item.supplementTargets ?? undefined,
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
            ingredient: true,
            supplementAlternatives: {
              include: {
                alternativeIngredient: true,
              },
              orderBy: {
                sortOrder: 'asc',
              },
            },
          },
        },
        healthTagAssignments: {
          include: {
            healthTag: true,
          },
        },
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
      targetHealthTags:
        record.healthTagAssignments?.map((assign) => assign.healthTagId) || [],
      applicableLifeStages: (record.applicableLifeStages as string[]) || [],
      designSource: record.designSource,
      nutritionStandard: record.nutritionStandard,
      nutritionDetailedData: record.nutritionDetailedData,
      description: record.description,
      viewCount: record.viewCount ?? 0,
      favoriteCount: record.favoriteCount ?? 0,
      diyGenCount: record.diyGenCount ?? 0,
      items: record.items.map(
        (item): RecipeItem => ({
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
          supplementTargets: (item.supplementTargets as any) ?? null,
          supplementAlternativeIngredientIds:
            item.supplementAlternatives?.map(
              (alternative) => alternative.alternativeIngredientId,
            ) ?? null,
          supplementAlternatives:
            item.supplementAlternatives?.map((alternative) => ({
              ingredientId: alternative.alternativeIngredientId,
              ingredientName: alternative.alternativeIngredient.name,
              ingredient: alternative.alternativeIngredient
                ? {
                    id: alternative.alternativeIngredient.id,
                    name: alternative.alternativeIngredient.name,
                    type: alternative.alternativeIngredient.type,
                    properties: alternative.alternativeIngredient.properties,
                    brand: alternative.alternativeIngredient.brand,
                    productModel: alternative.alternativeIngredient.productModel,
                    purchaseChannel:
                      alternative.alternativeIngredient.purchaseChannel,
                    unitDisplayLabel:
                      alternative.alternativeIngredient.unitDisplayLabel,
                    diyEnabled: alternative.alternativeIngredient.diyEnabled,
                    procurementEnabled:
                      alternative.alternativeIngredient.procurementEnabled,
                    nutritionProfile:
                      alternative.alternativeIngredient.nutritionProfile,
                  }
                : undefined,
            })) ?? null,
          ingredient: item.ingredient
            ? {
                id: item.ingredient.id,
                name: item.ingredient.name,
                type: item.ingredient.type,
                properties: item.ingredient.properties,
                brand: item.ingredient.brand,
                productModel: item.ingredient.productModel,
                purchaseChannel: item.ingredient.purchaseChannel,
                unitDisplayLabel: item.ingredient.unitDisplayLabel,
                diyEnabled: item.ingredient.diyEnabled,
                procurementEnabled: item.ingredient.procurementEnabled,
                nutritionProfile: item.ingredient.nutritionProfile,
              }
            : undefined,
        }),
      ),
    };
  }
}
