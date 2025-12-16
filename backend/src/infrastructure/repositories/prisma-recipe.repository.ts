import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { RecipeRepository, Recipe, RecipeItem } from '../../domain/recipe/recipe.repository';
import { PrismaService } from '../prisma.service';

// Type for Recipe with items included
type RecipeWithItems = Prisma.RecipeGetPayload<{
  include: { items: true };
}>;

@Injectable()
export class PrismaRecipeRepository implements RecipeRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Recipe | null> {
    // Find latest version for the given recipe ID
    const record = await this.prisma.recipe.findFirst({
      where: { recipeId: id },
      orderBy: { version: 'desc' },
      include: { items: true },
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
      include: { items: true },
    });
    return record ? this.mapToDomain(record) : null;
  }

  async findPublicRecipes(): Promise<Recipe[]> {
    // Get latest version of each recipe that is PUBLIC
    // This is a simplified approach - gets all PUBLIC recipes and then filters to latest version per recipeId
    const allPublic = await this.prisma.recipe.findMany({
      where: { status: 'PUBLIC' },
      include: { items: true },
      orderBy: [{ recipeId: 'asc' }, { version: 'desc' }],
    });

    // Group by recipeId and take latest version
    const latestByRecipeId = new Map<string, RecipeWithItems>();
    for (const recipe of allPublic) {
      const existing = latestByRecipeId.get(recipe.recipeId);
      if (!existing || recipe.version > existing.version) {
        latestByRecipeId.set(recipe.recipeId, recipe);
      }
    }

    return Array.from(latestByRecipeId.values()).map((r) =>
      this.mapToDomain(r),
    );
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
            ratioPercent: item.ratioPercent,
            isPrimarySource: item.isPrimarySource,
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
            ratioPercent: item.ratioPercent,
            isPrimarySource: item.isPrimarySource,
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
      include: { items: true },
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
      items: record.items.map((item): RecipeItem => ({
        id: item.id,
        ingredientId: item.ingredientId,
        preparationMethod: item.preparationMethod,
        ratioPercent: item.ratioPercent ? Number(item.ratioPercent) : null,
        isPrimarySource: item.isPrimarySource,
        nutrientTargetKey: item.nutrientTargetKey,
        nutrientTargetValue: item.nutrientTargetValue
          ? Number(item.nutrientTargetValue)
          : null,
      })),
    };
  }
}
