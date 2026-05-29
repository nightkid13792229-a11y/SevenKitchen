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
  PUPPY_UNDER_14_WEEKS = 'PUPPY_UNDER_14_WEEKS',
  PUPPY_14_WEEKS_PLUS = 'PUPPY_14_WEEKS_PLUS',
  LOW_ACTIVITY_ADULT_OR_SENIOR = 'LOW_ACTIVITY_ADULT_OR_SENIOR',
  HIGH_ACTIVITY_ADULT = 'HIGH_ACTIVITY_ADULT',
  REPRODUCTION = 'REPRODUCTION',
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
  moisture_pct?: number | null;
  protein_dm_pct?: number | null;
  fat_dm_pct?: number | null;
  fiber_dm_pct?: number | null;
  ash_dm_pct?: number | null;
  carbs_dm_pct?: number | null;
  ca_p_ratio?: number | null;
  energy_density_kcal_per_kg?: number | null;
  source?: string;
  schemaVersion?: number;
  standard?: string;
  scenario?: string;
  generatedAt?: string;
  summary?: NutritionSummaryData;
  report?: SetarNutritionReport;
}

export interface NutritionSummaryData {
  moisture_pct?: number | null;
  protein_dm_pct?: number | null;
  fat_dm_pct?: number | null;
  fiber_dm_pct?: number | null;
  ash_dm_pct?: number | null;
  carbs_dm_pct?: number | null;
  ca_p_ratio?: number | null;
  energy_density_kcal_per_kg?: number | null;
}

export interface SetarNutritionReport {
  ingredientRows?: SetarIngredientReportRow[];
  macroRows?: SetarMacroReportRow[];
  energyDensityRows?: SetarEnergyDensityRow[];
  nutrientSections?: Record<string, SetarNutrientSection>;
}

export interface SetarIngredientReportRow {
  ingredientName: string;
  amountLabel: string;
  weightPercentLabel: string;
}

export interface SetarMacroReportRow {
  key: string;
  name: string;
  weightPercentLabel: string;
  dryMatterLabel: string;
  energyPercentLabel: string;
}

export interface SetarEnergyDensityRow {
  label: string;
  value: string;
}

export interface SetarNutrientSection {
  key: string;
  title: string;
  dryMatterHeader: string;
  rows: SetarNutrientReportRow[];
}

export interface SetarNutrientReportRow {
  key: string;
  name: string;
  unit: string;
  minLabel: string;
  maxLabel: string;
  currentLabel: string;
  dryMatterLabel: string;
  status: string;
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
  nutritionFoodId?: string;
  nutritionState?: string;
  nutritionStateLabel?: string;
  nutritionFood?: {
    id: string;
    name: string;
    nameEn?: string;
    preparationState?: string;
    preparationStateLabel?: string;
  };
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

export interface RecipeVersionSummary {
  id: string;
  name: string;
  version: number;
  status: RecipeStatus;
  createdAt: string;
  updatedAt: string;
}

export interface RecipeSummary {
  id: string;
  recipeId?: string;
  name: string;
  version: number;
  status: RecipeStatus;
  coverImageUrl?: string;
  coverTitle?: string;
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
  currentPublicVersion?: RecipeVersionSummary;
  pendingDraftVersion?: RecipeVersionSummary;
  versionHistory?: RecipeVersionSummary[];
}

export interface RecipeDetail extends RecipeSummary {
  detailImages?: string[];
  videoUrl?: string;
  description?: string;
  designSource?: string;
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
