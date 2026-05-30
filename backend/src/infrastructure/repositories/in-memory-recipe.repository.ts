/**
 * InMemory Recipe Repository Implementation
 * Temporary implementation for development/testing without database
 */

import { Injectable } from '@nestjs/common';
import type {
  Recipe,
  RecipeRepository,
  FindRecipesOptions,
  FilterOptions,
} from '../../domain/recipe/recipe.repository';

@Injectable()
export class InMemoryRecipeRepository implements RecipeRepository {
  private recipes: Map<string, Recipe> = new Map();

  // Helper method for testing - add recipe to repository
  async save(recipe: Recipe): Promise<Recipe> {
    const key = `${recipe.id}-${recipe.version}`;
    this.recipes.set(key, recipe);
    return Promise.resolve(recipe);
  }

  async findById(id: string): Promise<Recipe | null> {
    // Find latest version
    const matchingRecipes = Array.from(this.recipes.values()).filter(
      (r) => r.id === id,
    );
    if (matchingRecipes.length === 0) {
      return Promise.resolve(null);
    }
    return Promise.resolve(
      matchingRecipes.reduce((latest, current) =>
        current.version > latest.version ? current : latest,
      ),
    );
  }

  async findByIdAndVersion(
    id: string,
    version: number,
  ): Promise<Recipe | null> {
    const recipe = Array.from(this.recipes.values()).find(
      (r) => r.id === id && r.version === version,
    );
    return Promise.resolve(recipe || null);
  }

  async findPublicRecipes(_options?: FindRecipesOptions): Promise<Recipe[]> {
    // TODO: Implement filtering logic
    return Promise.resolve(
      this.groupPublicRecipes(
        Array.from(this.recipes.values()).filter(
          (r) => r.status === 'PUBLIC', // TODO: Use enum when Recipe interface is fully defined
        ),
      ),
    );
  }

  async findPublicRecipesPaginated(_options?: FindRecipesOptions): Promise<{
    data: Recipe[];
    total: number;
    page: number;
    pageSize: number;
    hasMore: boolean;
  }> {
    // TODO: Implement filtering logic
    const allRecipes = this.groupPublicRecipes(
      Array.from(this.recipes.values()).filter((r) => r.status === 'PUBLIC'),
    );

    const page = _options?.page || 1;
    const pageSize = _options?.pageSize || 10;
    const skip = (page - 1) * pageSize;

    const paginatedRecipes = allRecipes.slice(skip, skip + pageSize);
    const hasMore = skip + pageSize < allRecipes.length;

    return Promise.resolve({
      data: paginatedRecipes,
      total: allRecipes.length,
      page,
      pageSize,
      hasMore,
    });
  }

  async getFilterOptions(): Promise<FilterOptions> {
    // TODO: Implement filter options aggregation
    return Promise.resolve({
      lifeStages: [],
      healthTags: [],
      ingredientTags: [],
      ingredientGroups: [],
      total: this.recipes.size,
    });
  }

  private groupPublicRecipes(recipes: Recipe[]): Recipe[] {
    const latestByGroup = new Map<string, Recipe>();
    for (const recipe of recipes) {
      const groupKey = recipe.seriesId || recipe.id;
      const existing = latestByGroup.get(groupKey);
      if (!existing || this.isNewerRepresentative(recipe, existing)) {
        latestByGroup.set(groupKey, recipe);
      }
    }
    return Array.from(latestByGroup.values());
  }

  private isNewerRepresentative(candidate: Recipe, existing: Recipe): boolean {
    if (candidate.id === existing.id && candidate.version !== existing.version) {
      return candidate.version > existing.version;
    }
    return candidate.version > existing.version;
  }
}
