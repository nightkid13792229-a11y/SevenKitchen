/**
 * Recipe Types
 * TypeScript types for recipe management
 */

export enum RecipeStatus {
  DRAFT = 'DRAFT',
  PUBLIC = 'PUBLIC',
  PRIVATE_CUSTOM = 'PRIVATE_CUSTOM',
}

export enum LifeStage {
  PUPPY = 'PUPPY',
  ADULT = 'ADULT',
  SENIOR = 'SENIOR',
  PREGNANCY = 'PREGNANCY',
  LACTATION = 'LACTATION',
}

export enum RecipeHealthTag {
  HEALTHY = 'HEALTHY',
  PICKY_EATER = 'PICKY_EATER',
  SENSITIVE_STOMACH = 'SENSITIVE_STOMACH',
  PANCREATITIS_SUPPORT = 'PANCREATITIS_SUPPORT',
  LOW_FAT = 'LOW_FAT',
  SKIN_COAT_CARE = 'SKIN_COAT_CARE',
}

export enum NutritionStandard {
  NRC_2006 = 'NRC_2006',
  FEDIAF_2021 = 'FEDIAF_2021',
  FEDIAF_2024 = 'FEDIAF_2024',
  FEDIAF_2025 = 'FEDIAF_2025',
  AAFCO_2022 = 'AAFCO_2022',
}

export interface NutritionDetailedData {
  moisture_pct: number;
  protein_dm_pct: number;
  fat_dm_pct: number;
  fiber_dm_pct: number;
  ash_dm_pct: number;
  carbs_dm_pct: number;
  ca_p_ratio: number;
  energy_density_kcal_per_kg: number;
}

export interface SupplementTarget {
  fieldPath: string;
  label: string;
  targetValuePerKg: number;
  unit: string;
}

export interface RecipeItem {
  id: string;
  ingredientId: string;
  ingredientName?: string;
  ingredientType?: string;
  preparationMethod?: string;
  exampleWeight?: number;
  ratioPercent?: number;
  nutrientTargetKey?: string;
  nutrientTargetValue?: number;
  supplementTargets?: SupplementTarget[];
  supplementAlternativeIngredientIds?: string[];
  supplementAlternatives?: Array<{
    ingredientId: string;
    ingredientName: string;
  }>;
  ingredient?: {
    id: string;
    name: string;
    type: string;
    properties?: any;
  };
}

export interface IngredientPreparationMethodHistoryItem {
  text: string;
  usageCount: number;
  lastUsedAt: string;
}

export interface RecipeSummary {
  id: string;
  name: string;
  version: number;
  status: RecipeStatus;
  coverImageUrl?: string;
  coverTitle?: string;
  nutritionReportUrl?: string | null;
  energyDensityKcalPerKg: number;
  applicableLifeStages: LifeStage[];
  targetHealthTags: string[]; // Now using UUIDs instead of enum
  salesCount: number;
  diyGenCount: number;
  likeCount: number;
  favoriteCount: number;
  designSource?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RecipeDetail extends RecipeSummary {
  detailImages?: string[];
  videoUrl?: string;
  description?: string;
  designSource?: string;
  nutritionReportUrl?: string | null;
  nutritionStandard: NutritionStandard;
  nutritionDetailedData?: NutritionDetailedData;
  productionSteps?: string;
  productionLossRate: number;
  batchLaborHours?: number;
  items: RecipeItem[];
}

export interface RecipeForm {
  name: string;
  coverImageUrl?: string;
  coverTitle?: string;
  detailImages?: string[];
  videoUrl?: string;
  description?: string;
  designSource?: string;
  nutritionReportUrl?: string | null;
  nutritionStandard: NutritionStandard;
  energyDensityKcalPerKg: number;
  items?: RecipeItem[];
  nutritionDetailedData?: NutritionDetailedData;
  targetHealthTags?: string[]; // Now using UUIDs instead of enum
  applicableLifeStages?: LifeStage[];
  productionSteps?: string;
  productionLossRate?: number;
  batchLaborHours?: number;
  status?: RecipeStatus;
}

export interface RecipeQuery {
  status?: RecipeStatus;
  lifeStage?: LifeStage;
  healthTag?: string; // Now using UUID instead of enum
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface RecipeListResponse {
  data: RecipeSummary[];
  total: number;
  page: number;
  pageSize: number;
}
