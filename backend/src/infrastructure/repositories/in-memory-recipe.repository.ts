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
      Array.from(this.recipes.values()).filter(
        (r) => r.status === 'PUBLIC', // TODO: Use enum when Recipe interface is fully defined
      ),
    );
  }

  async getFilterOptions(): Promise<FilterOptions> {
    // TODO: Implement filter options aggregation
    return Promise.resolve({
      lifeStages: [],
      healthTags: [],
      ingredientTags: [],
      total: this.recipes.size,
    });
  }
}
