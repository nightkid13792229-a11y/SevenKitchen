/**
 * Recipe Repository Interface
 * Domain layer repository interface (no Prisma dependency)
 */

export interface RecipeItem {
  id: string;
  ingredientId: string;
  preparationMethod?: string | null;
  ratioPercent?: number | null;
  isPrimarySource: boolean;
  nutrientTargetKey?: string | null;
  nutrientTargetValue?: number | null;
}

export interface Recipe {
  id: string;
  version: number;
  name: string;
  status: string; // TODO: Use RecipeStatus enum when fully defined
  energyDensityKcalPerKg: number;
  productionLossRate: number;
  batchLaborHours?: number;
  items?: RecipeItem[]; // Recipe items with ingredient references
  // TODO: Add more fields as needed
}

export interface RecipeRepository {
  findById(id: string): Promise<Recipe | null>;
  findByIdAndVersion(id: string, version: number): Promise<Recipe | null>;
  findPublicRecipes(): Promise<Recipe[]>;
  save(recipe: Recipe): Promise<Recipe>;
}
