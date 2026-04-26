/**
 * Recipe Repository Interface
 * Domain layer repository interface (no Prisma dependency)
 */

import type { SupplementTarget } from '../ingredient/types';

export interface IngredientRef {
  id: string;
  name: string;
  type?: string;
  properties?: any;
  brand?: string | null;
  productModel?: string | null;
  purchaseChannel?: string | null;
  unitDisplayLabel?: string | null;
  diyEnabled?: boolean;
  procurementEnabled?: boolean;
  nutritionProfile?: any;
}

export interface RecipeItem {
  id: string;
  ingredientId: string;
  preparationMethod?: string | null;
  exampleWeight?: number | null;
  ratioPercent?: number | null;
  sortOrder?: number | null;
  nutrientTargetKey?: string | null;
  nutrientTargetValue?: number | null;
  supplementTargets?: SupplementTarget[] | null;
  supplementAlternativeIngredientIds?: string[] | null;
  supplementAlternatives?: Array<{
    ingredientId: string;
    ingredientName: string;
    isActive?: boolean;
    ingredient?: IngredientRef;
  }> | null;
  ingredient?: IngredientRef;
}

export interface Recipe {
  id: string;
  version: number;
  name: string;
  status: string; // TODO: Use RecipeStatus enum when fully defined
  energyDensityKcalPerKg: number;
  productionLossRate: number;
  batchLaborHours?: number;
  coverImageUrl?: string | null;
  targetHealthTags?: string[];
  applicableLifeStages?: string[];
  items?: RecipeItem[]; // Recipe items with ingredient references
  designSource?: string | null;
  nutritionStandard?: string;
  nutritionDetailedData?: any;
  nutritionReportUrl?: string | null;
  description?: string | null;
  viewCount?: number;
  favoriteCount?: number;
  diyGenCount?: number;
}

export interface IngredientGroup {
  category: string; // CFCT分类名，如"畜肉类及制品"
  ingredients: Array<{ ids: string[]; name: string }>;
}

export interface FindRecipesOptions {
  lifeStages?: string[];
  healthTags?: string[];
  excludeTags?: string[];
  excludeIngredients?: string[];
  page?: number;
  pageSize?: number;
}

export interface PaginatedRecipes {
  data: Recipe[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface FilterOptions {
  lifeStages: Array<{
    value: string;
    label: string;
    count: number;
  }>;
  healthTags: Array<{
    value: string;
    label: string;
    count: number;
  }>;
  ingredientTags: Array<{
    value: string;
    label: string;
    count: number;
  }>;
  ingredientGroups: IngredientGroup[];
  total: number;
}

export interface RecipeRepository {
  findById(id: string): Promise<Recipe | null>;
  findByIdAndVersion(id: string, version: number): Promise<Recipe | null>;
  findPublicRecipes(options?: FindRecipesOptions): Promise<Recipe[]>;
  findPublicRecipesPaginated(
    options?: FindRecipesOptions,
  ): Promise<PaginatedRecipes>;
  getFilterOptions(): Promise<FilterOptions>;
  save(recipe: Recipe): Promise<Recipe>;
}
