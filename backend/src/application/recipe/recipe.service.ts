/**
 * Recipe Service
 * Business logic for recipe management in admin panel
 */

import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma.service';
import { Prisma } from '@prisma/client';
import {
  RecipeStatus,
  RecipeHealthTag,
  LifeStage,
  NutritionStandard,
} from '../../domain/recipe/enums';
import {
  extractLegacyPreparationMethodIds,
  normalizePreparationMethodHistoryText,
  resolvePreparationMethodText,
} from './preparation-method-text.util';
import type { RecipeQueryDto } from '../../interfaces/dto/recipes/admin-recipe.dto';
import type {
  IngredientPreparationMethodHistoryDto,
  RecipeSummaryResponseDto,
  RecipeVersionSummaryDto,
  RecipeDetailResponseDto,
  RecipeListResponseDto,
} from '../../interfaces/dto/recipes/admin-recipe.dto';

@Injectable()
export class RecipeService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly recipeDetailInclude = {
    items: {
      include: {
        ingredient: true,
        nutritionFood: true,
        supplementAlternatives: {
          include: {
            alternativeIngredient: true,
          },
          orderBy: {
            sortOrder: 'asc' as const,
          },
        },
      },
      orderBy: {
        sortOrder: 'asc' as const,
      },
    },
    healthTagAssignments: {
      include: {
        healthTag: true,
      },
    },
  };

  private normalizeSupplementAlternativeIngredientIds(
    ingredientIds?: string[] | null,
  ): string[] {
    if (!Array.isArray(ingredientIds) || ingredientIds.length === 0) {
      return [];
    }

    return [...new Set(ingredientIds.map((id) => id?.trim()).filter(Boolean))];
  }

  private normalizeOptionalValueForComparison<T>(value: T | null | undefined) {
    return value ?? null;
  }

  private normalizeSupplementTargets(targets?: unknown): any {
    if (!Array.isArray(targets)) {
      return targets && typeof targets === 'object'
        ? (targets as Record<string, unknown>)
        : null;
    }

    return targets.length > 0 ? targets : null;
  }

  private resolveNutritionStateLabel(nutritionFood?: Record<string, any> | null) {
    return (
      nutritionFood?.preparationStateLabel ||
      nutritionFood?.preparationState ||
      undefined
    );
  }

  private mapNutritionFoodRef(nutritionFood?: Record<string, any> | null) {
    if (!nutritionFood) {
      return undefined;
    }

    return {
      id: nutritionFood.id,
      name: nutritionFood.name,
      nameEn: nutritionFood.nameEn ?? undefined,
      preparationState: nutritionFood.preparationState ?? undefined,
      preparationStateLabel: nutritionFood.preparationStateLabel ?? undefined,
    };
  }

  private async resolveRecipeItemNutritionFoodIds<
    T extends { ingredientId: string; nutritionFoodId?: string | null },
  >(items?: T[]): Promise<T[] | undefined> {
    if (!items || items.length === 0) {
      return items;
    }

    const ingredientIds = [
      ...new Set(items.map((item) => item.ingredientId).filter(Boolean)),
    ] as string[];

    if (ingredientIds.length === 0) {
      return items;
    }

    const nutritionFoodMappingClient = (this.prisma as any).nutritionFoodMapping;
    if (!nutritionFoodMappingClient?.findMany) {
      return items;
    }

    const mappings = await nutritionFoodMappingClient.findMany({
      where: {
        ingredientId: { in: ingredientIds },
      },
      include: {
        nutritionFood: true,
      },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });

    const mappingsByIngredientId = new Map<string, any[]>();
    for (const mapping of mappings) {
      const current = mappingsByIngredientId.get(mapping.ingredientId) || [];
      current.push(mapping);
      mappingsByIngredientId.set(mapping.ingredientId, current);
    }

    return items.map((item) => {
      if (!item.ingredientId) {
        return item;
      }

      const ingredientMappings =
        mappingsByIngredientId.get(item.ingredientId) || [];

      if (item.nutritionFoodId) {
        const isMapped = ingredientMappings.some(
          (mapping) => mapping.nutritionFoodId === item.nutritionFoodId,
        );

        if (!isMapped) {
          throw new BadRequestException(
            `营养档案 ${item.nutritionFoodId} 未映射到原料 ${item.ingredientId}`,
          );
        }

        return item;
      }

      const defaultMapping =
        ingredientMappings.find((mapping) => mapping.isPrimary) ||
        (ingredientMappings.length === 1 ? ingredientMappings[0] : undefined);

      return defaultMapping
        ? { ...item, nutritionFoodId: defaultMapping.nutritionFoodId }
        : item;
    });
  }

  private buildRecipeItemCreateData(item: Record<string, any>, index: number) {
    const supplementAlternativeIngredientIds =
      this.normalizeSupplementAlternativeIngredientIds(
        item.supplementAlternativeIngredientIds ??
          item.supplementAlternatives?.map(
            (alternative: Record<string, any>) =>
              alternative.alternativeIngredientId,
          ),
      );

    return {
      ingredientId: item.ingredientId,
      nutritionFoodId: item.nutritionFoodId || undefined,
      preparationMethod: item.preparationMethod,
      exampleWeight: item.exampleWeight,
      ratioPercent: item.ratioPercent,
      nutrientTargetKey: item.nutrientTargetKey,
      nutrientTargetValue: item.nutrientTargetValue,
      supplementTargets: this.normalizeSupplementTargets(item.supplementTargets),
      sortOrder: index,
      ...(supplementAlternativeIngredientIds.length > 0 && {
        supplementAlternatives: {
          create: supplementAlternativeIngredientIds.map(
            (alternativeIngredientId, alternativeIndex) => ({
              alternativeIngredientId,
              sortOrder: alternativeIndex,
            }),
          ),
        },
      }),
    };
  }

  private async validateSupplementAlternativeItems(
    items?: Array<Record<string, any>>,
  ): Promise<void> {
    if (!items || items.length === 0) {
      return;
    }

    const itemsWithAlternatives = items
      .map((item) => ({
        item,
        alternativeIds: this.normalizeSupplementAlternativeIngredientIds(
          item.supplementAlternativeIngredientIds,
        ),
      }))
      .filter(({ alternativeIds }) => alternativeIds.length > 0);

    if (itemsWithAlternatives.length === 0) {
      return;
    }

    const ingredientIds = [
      ...new Set(
        itemsWithAlternatives.flatMap(({ item, alternativeIds }) => [
          item.ingredientId,
          ...alternativeIds,
        ]),
      ),
    ];

    const ingredients = await this.prisma.ingredient.findMany({
      where: {
        id: {
          in: ingredientIds,
        },
      },
      select: {
        id: true,
        type: true,
      },
    });

    const ingredientTypeMap = new Map(
      ingredients.map((ingredient) => [ingredient.id, ingredient.type]),
    );

    for (const { item, alternativeIds } of itemsWithAlternatives) {
      if (ingredientTypeMap.get(item.ingredientId) !== 'SUPPLEMENT') {
        throw new BadRequestException('只有补剂原料可以配置替代补剂');
      }

      for (const alternativeIngredientId of alternativeIds) {
        if (alternativeIngredientId === item.ingredientId) {
          throw new BadRequestException('补剂替代项不能与默认补剂相同');
        }

        if (ingredientTypeMap.get(alternativeIngredientId) !== 'SUPPLEMENT') {
          throw new BadRequestException('补剂替代项必须引用补剂原料');
        }
      }
    }
  }

  private async loadPreparationMethodNameMap(
    values: Array<string | null | undefined>,
  ): Promise<Map<string, string>> {
    const ids = extractLegacyPreparationMethodIds(values);
    if (ids.length === 0) {
      return new Map();
    }

    const methods = await this.prisma.preparationMethod.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });

    return new Map(
      methods.map((method: { id: string; name: string }) => [
        method.id,
        method.name,
      ]),
    );
  }

  /**
   * Helper: Check if recipe items have changed (ingredient name, ratio, or usage amount)
   */
  private haveRecipeItemsChanged(
    existingItems: Array<{
      ingredientId: string;
      nutritionFoodId?: string | null;
      preparationMethod: string | null;
      ratioPercent: number | null;
      nutrientTargetKey: string | null;
      nutrientTargetValue: number | null;
      supplementTargets?: unknown;
      sortOrder: number;
    }>,
    newItems: Array<{
      ingredientId: string;
      nutritionFoodId?: string | null;
      preparationMethod?: string | null;
      ratioPercent?: number | null;
      nutrientTargetKey?: string | null;
      nutrientTargetValue?: number | null;
      supplementTargets?: unknown;
    }>,
  ): boolean {
    // If item count differs, items have changed
    if (existingItems.length !== newItems.length) {
      return true;
    }

    // Sort both arrays by ingredientId for comparison
    const sortedExisting = [...existingItems].sort((a, b) =>
      a.ingredientId.localeCompare(b.ingredientId),
    );
    const sortedNew = [...newItems].sort((a, b) =>
      a.ingredientId.localeCompare(b.ingredientId),
    );

    // Compare each item
    for (let i = 0; i < sortedExisting.length; i++) {
      const existing = sortedExisting[i];
      const newItem = sortedNew[i];

      // Check if ingredient changed
      if (existing.ingredientId !== newItem.ingredientId) {
        return true;
      }

      if ((existing.nutritionFoodId ?? null) !== (newItem.nutritionFoodId ?? null)) {
        return true;
      }

      // Check if ratio percent changed (for FOOD ingredients)
      if (
        this.normalizeOptionalValueForComparison(existing.ratioPercent) !==
        this.normalizeOptionalValueForComparison(newItem.ratioPercent)
      ) {
        return true;
      }

      // Check if nutrient target value changed (for SUPPLEMENT ingredients)
      if (
        this.normalizeOptionalValueForComparison(existing.nutrientTargetValue) !==
        this.normalizeOptionalValueForComparison(newItem.nutrientTargetValue)
      ) {
        return true;
      }

      if (
        JSON.stringify(
          this.normalizeSupplementTargets(existing.supplementTargets),
        ) !==
        JSON.stringify(this.normalizeSupplementTargets(newItem.supplementTargets))
      ) {
        return true;
      }

      // Check if preparation method changed
      if (
        this.normalizeOptionalValueForComparison(existing.preparationMethod) !==
        this.normalizeOptionalValueForComparison(newItem.preparationMethod)
      ) {
        return true;
      }

      // Note: We don't check nutrientTargetKey as it's derived from the ingredient type
    }

    return false;
  }

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

    const recipes = await this.prisma.recipe.findMany({
      where,
      include: {
        healthTagAssignments: {
          include: {
            healthTag: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const groupedRecipes = this.buildRecipeSeriesListRows(recipes);
    const total = groupedRecipes.length;
    const data = groupedRecipes.slice(
      (page - 1) * pageSize,
      (page - 1) * pageSize + pageSize,
    );

    return {
      data,
      total,
      page,
      pageSize,
    };
  }

  private buildRecipeSeriesListRows(
    recipes: any[],
  ): RecipeSummaryResponseDto[] {
    const groups = new Map<string, any[]>();

    for (const recipe of recipes) {
      const key = recipe.recipeId || recipe.id;
      groups.set(key, [...(groups.get(key) ?? []), recipe]);
    }

    return [...groups.values()]
      .map((group) => this.buildRecipeSeriesListRow(group))
      .sort((left, right) => {
        const leftTime = new Date(left.createdAt).getTime();
        const rightTime = new Date(right.createdAt).getTime();
        return rightTime - leftTime;
      });
  }

  private buildRecipeSeriesListRow(group: any[]): RecipeSummaryResponseDto {
    const sortedByVersion = [...group].sort(
      (left, right) => (right.version ?? 0) - (left.version ?? 0),
    );
    const pendingDraft =
      sortedByVersion.find((recipe) => recipe.status === RecipeStatus.DRAFT) ??
      null;
    const currentPublic =
      sortedByVersion.find((recipe) => recipe.status === RecipeStatus.PUBLIC) ??
      null;
    const current = pendingDraft ?? currentPublic ?? sortedByVersion[0];
    const summary = this.mapToSummaryDto(current);
    const versionHistory = sortedByVersion.map((recipe) =>
      this.mapToVersionSummaryDto(recipe),
    );

    return {
      ...summary,
      currentPublicVersion: currentPublic
        ? this.mapToVersionSummaryDto(currentPublic)
        : undefined,
      pendingDraftVersion: pendingDraft
        ? this.mapToVersionSummaryDto(pendingDraft)
        : undefined,
      versionHistory,
    };
  }

  /**
   * Get recipe by ID with full details
   */
  async getRecipeById(id: string): Promise<RecipeDetailResponseDto> {
    const recipe = await this.prisma.recipe.findUnique({
      where: { id },
      include: this.recipeDetailInclude,
    });

    if (!recipe) {
      throw new NotFoundException(`Recipe not found: ${id}`);
    }

    return await this.mapToDetailDto(recipe);
  }

  /**
   * Create new recipe
   */
  async createRecipe(
    dto: Record<string, any>,
  ): Promise<RecipeDetailResponseDto> {
    // Check if recipe with same name exists
    const existing = await this.prisma.recipe.findFirst({
      where: { name: dto.name },
    });

    if (existing) {
      throw new BadRequestException(
        `Recipe with name "${dto.name}" already exists`,
      );
    }

    // Generate recipe ID and set initial version
    const recipeId = crypto.randomUUID();
    const version = 1;
    const targetHealthTags = dto.targetHealthTags || [];

    await this.validateSupplementAlternativeItems(dto.items);
    const resolvedItems = await this.resolveRecipeItemNutritionFoodIds(
      dto.items,
    );

    // Create recipe with items
    const recipe = await this.prisma.recipe.create({
      data: {
        recipeId,
        version,
        name: dto.name,
        status: dto.status || RecipeStatus.DRAFT,
        energyDensityKcalPerKg: dto.energyDensityKcalPerKg,
        productionLossRate: dto.productionLossRate ?? 1.07,
        batchLaborHours: dto.batchLaborHours ?? 2.0,
        coverImageUrl: dto.coverImageUrl,
        coverTitle: dto.coverTitle,
        detailImages: dto.detailImages || [],
        videoUrl: dto.videoUrl,
        description: dto.description,
        designSource: dto.designSource,
        nutritionStandard: dto.nutritionStandard,
        nutritionDetailedData: Prisma.JsonNull,
        targetHealthTags: [] as any, // Keep empty for now, will be migrated
        applicableLifeStages: dto.applicableLifeStages || [],
        productionSteps: dto.productionSteps,
        items: resolvedItems
          ? {
              create: resolvedItems.map((item: any, index: number) =>
                this.buildRecipeItemCreateData(item, index),
              ),
            }
          : undefined,
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
      include: this.recipeDetailInclude,
    });

    return await this.mapToDetailDto(recipeWithTags!);
  }

  /**
   * Update recipe (creates new version only when ingredients change)
   */
  async updateRecipe(
    id: string,
    dto: Record<string, any>,
  ): Promise<RecipeDetailResponseDto> {
    // Get existing recipe with items
    const existing = await this.prisma.recipe.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            supplementAlternatives: {
              orderBy: {
                sortOrder: 'asc',
              },
            },
          },
        },
      },
    });

    if (!existing) {
      throw new NotFoundException(`Recipe not found: ${id}`);
    }

    const targetHealthTags = dto.targetHealthTags ?? undefined;

    await this.validateSupplementAlternativeItems(dto.items);
    const resolvedItems = await this.resolveRecipeItemNutritionFoodIds(
      dto.items,
    );

    // Check if recipe items have changed (ingredient name, ratio, or usage amount)
    const itemsChanged = resolvedItems
      ? this.haveRecipeItemsChanged(existing.items, resolvedItems)
      : false;

    // Only create new version if ingredients changed
    const shouldCreateNewVersion = itemsChanged;
    const newVersion = shouldCreateNewVersion
      ? existing.version + 1
      : existing.version;

    // Always delete old items if new items are provided (to handle updates like reordering)
    if (resolvedItems) {
      await this.prisma.recipeItem.deleteMany({
        where: { recipeId: existing.recipeId, recipeVersion: existing.version },
      });
    }

    // Update recipe (creates new version only if ingredients changed)
    const recipe = await this.prisma.recipe.update({
      where: { id },
      data: {
        version: newVersion,
        name: dto.name,
        status: dto.status ?? existing.status,
        energyDensityKcalPerKg:
          dto.energyDensityKcalPerKg ?? existing.energyDensityKcalPerKg,
        productionLossRate:
          dto.productionLossRate ?? existing.productionLossRate,
        batchLaborHours: dto.batchLaborHours ?? existing.batchLaborHours,
        coverImageUrl: dto.coverImageUrl,
        coverTitle: dto.coverTitle,
        detailImages: dto.detailImages,
        videoUrl: dto.videoUrl,
        description: dto.description,
        designSource: dto.designSource,
        nutritionStandard: dto.nutritionStandard,
        nutritionDetailedData: undefined,
        targetHealthTags: [] as any, // Keep empty for now
        applicableLifeStages: dto.applicableLifeStages ?? undefined,
        productionSteps: dto.productionSteps,
        items: resolvedItems
          ? {
              create: resolvedItems.map((item: any, index: number) =>
                this.buildRecipeItemCreateData(item, index),
              ),
            }
          : undefined,
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
      include: this.recipeDetailInclude,
    });

    return await this.mapToDetailDto(recipeWithTags!);
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
      include: this.recipeDetailInclude,
    });

    return await this.mapToDetailDto(updated);
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
      include: this.recipeDetailInclude,
    });

    return await this.mapToDetailDto(updated);
  }

  /**
   * Duplicate recipe (create new recipe with new ID)
   */
  async duplicateRecipe(id: string): Promise<RecipeDetailResponseDto> {
    const recipe = await this.prisma.recipe.findUnique({
      where: { id },
      include: this.recipeDetailInclude,
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
        coverTitle: recipe.coverTitle,
        detailImages: recipe.detailImages as Prisma.InputJsonValue,
        videoUrl: recipe.videoUrl,
        description: recipe.description,
        designSource: recipe.designSource,
        nutritionStandard: recipe.nutritionStandard,
        nutritionDetailedData:
          recipe.nutritionDetailedData as Prisma.InputJsonValue,
        targetHealthTags: [] as any, // Keep empty for now
        applicableLifeStages:
          recipe.applicableLifeStages as Prisma.InputJsonValue,
        productionSteps: recipe.productionSteps,
        items: {
          create: recipe.items.map((item: any) => ({
            ...this.buildRecipeItemCreateData(item, item.sortOrder),
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
        data: recipe.healthTagAssignments.map((assignment: any) => ({
          recipeId: duplicated.id,
          healthTagId: assignment.healthTagId,
        })),
        skipDuplicates: true,
      });
    }

    // Fetch with health tag assignments
    const duplicatedWithTags = await this.prisma.recipe.findUnique({
      where: { id: duplicated.id },
      include: this.recipeDetailInclude,
    });

    return await this.mapToDetailDto(duplicatedWithTags!);
  }

  async getIngredientPreparationMethodHistory(
    ingredientId: string,
  ): Promise<IngredientPreparationMethodHistoryDto[]> {
    const rows = await this.prisma.recipeItem.findMany({
      where: {
        ingredientId,
        recipe: { isCustomRecipe: false },
      },
      select: {
        preparationMethod: true,
        recipe: { select: { updatedAt: true } },
      },
    });

    const methodMap = await this.loadPreparationMethodNameMap(
      rows.map((row: { preparationMethod: string | null }) => row.preparationMethod),
    );

    const aggregated = new Map<
      string,
      { text: string; usageCount: number; lastUsedAt: Date }
    >();

    for (const row of rows) {
      const readable = resolvePreparationMethodText(
        row.preparationMethod,
        methodMap,
        { preserveUnresolvedLegacy: false },
      );
      const normalized = normalizePreparationMethodHistoryText(readable);
      if (!normalized) {
        continue;
      }

      const existing = aggregated.get(normalized);
      if (existing) {
        existing.usageCount += 1;
        if (row.recipe.updatedAt > existing.lastUsedAt) {
          existing.lastUsedAt = row.recipe.updatedAt;
        }
        continue;
      }

      aggregated.set(normalized, {
        text: normalized,
        usageCount: 1,
        lastUsedAt: row.recipe.updatedAt,
      });
    }

    return [...aggregated.values()]
      .sort((left, right) => {
        const byLastUsed =
          right.lastUsedAt.getTime() - left.lastUsedAt.getTime();
        if (byLastUsed !== 0) {
          return byLastUsed;
        }

        const byUsage = right.usageCount - left.usageCount;
        if (byUsage !== 0) {
          return byUsage;
        }

        return left.text.localeCompare(right.text);
      })
      .map((item) => ({
        ...item,
        lastUsedAt: item.lastUsedAt.toISOString(),
      }));
  }

  /**
   * Get recipe version history
   */
  async getRecipeVersions(
    recipeId: string,
  ): Promise<RecipeSummaryResponseDto[]> {
    const recipes = await this.prisma.recipe.findMany({
      where: { recipeId },
      orderBy: { version: 'desc' },
    });

    return recipes.map((recipe: any) => this.mapToSummaryDto(recipe));
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
      recipeId: recipe.recipeId,
      name: recipe.name,
      version: recipe.version,
      status: recipe.status as RecipeStatus,
      coverImageUrl: recipe.coverImageUrl,
      coverTitle: recipe.coverTitle || undefined,
      energyDensityKcalPerKg: recipe.energyDensityKcalPerKg,
      applicableLifeStages: (recipe.applicableLifeStages as LifeStage[]) || [],
      targetHealthTags:
        recipe.healthTagAssignments?.map((a: any) => a.healthTagId) || [],
      salesCount: recipe.salesCount,
      diyGenCount: recipe.diyGenCount,
      likeCount: recipe.likeCount,
      favoriteCount: recipe.favoriteCount,
      createdAt: recipe.createdAt.toISOString(),
      updatedAt: recipe.updatedAt.toISOString(),
    };
  }

  private mapToVersionSummaryDto(recipe: any): RecipeVersionSummaryDto {
    return {
      id: recipe.id,
      name: recipe.name,
      version: recipe.version,
      status: recipe.status as RecipeStatus,
      createdAt: recipe.createdAt.toISOString(),
      updatedAt: recipe.updatedAt.toISOString(),
    };
  }

  /**
   * Map Recipe entity to Detail DTO
   */
  private async mapToDetailDto(recipe: any): Promise<RecipeDetailResponseDto> {
    const methodMap = await this.loadPreparationMethodNameMap(
      (recipe.items || []).map((item: any) => item.preparationMethod),
    );

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
      items:
        recipe.items?.map((item: any) => ({
          id: item.id,
          ingredientId: item.ingredientId,
          ingredientName: item.ingredient?.name,
          ingredientType: item.ingredient?.type,
          nutritionFoodId: item.nutritionFoodId || undefined,
          nutritionState: item.nutritionFood?.preparationState || undefined,
          nutritionStateLabel: this.resolveNutritionStateLabel(
            item.nutritionFood,
          ),
          nutritionFood: this.mapNutritionFoodRef(item.nutritionFood),
          ingredient: item.ingredient
            ? {
                id: item.ingredient.id,
                name: item.ingredient.name,
                type: item.ingredient.type,
                properties: item.ingredient.properties,
              }
            : undefined,
          preparationMethod:
            resolvePreparationMethodText(item.preparationMethod, methodMap, {
              preserveUnresolvedLegacy: true,
            }) || undefined,
          exampleWeight: item.exampleWeight || undefined,
          ratioPercent: item.ratioPercent || undefined,
          nutrientTargetKey: item.nutrientTargetKey || undefined,
          nutrientTargetValue: item.nutrientTargetValue || undefined,
          supplementTargets: item.supplementTargets || undefined,
          supplementAlternativeIngredientIds:
            item.supplementAlternatives?.map(
              (alternative: any) => alternative.alternativeIngredientId,
            ) || undefined,
          supplementAlternatives:
            item.supplementAlternatives?.map((alternative: any) => ({
              ingredientId: alternative.alternativeIngredientId,
              ingredientName: alternative.alternativeIngredient?.name,
            })) || undefined,
        })) || [],
    };
  }
}
