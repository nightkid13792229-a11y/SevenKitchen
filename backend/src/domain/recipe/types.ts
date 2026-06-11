/**
 * Recipe Domain Types
 * Based on 07_Core_Architecture.md Section 2.4
 */

import type { NutritionProfile, SupplementTarget } from '../ingredient/types';

/**
 * Recipe Snapshot
 * Immutable snapshot of recipe at the time of order creation.
 * Used in OrderItem.recipe_snapshot JSON field.
 */
export interface RecipeSnapshot {
  id: string; // Original Recipe UUID
  version: number; // Recipe Version at time of order
  name: string;
  production_loss_rate: number; // CRITICAL: Captured at order time
  energy_density_kcal_per_kg: number; // CRITICAL: Captured at order time for dailyIntakeG calculation
  nutrition_standard: string;
  nutrition_detailed_data?: NutritionDetailedData; // 添加营养成分详细数据（可选）
  items: RecipeSnapshotItem[]; // List of ingredients
}

export interface RecipeSnapshotItem {
  ingredient_id: string;
  name: string;
  ratio: number; // or amount logic
  example_weight?: number;
  nutrition_food_id?: string;
  nutrition_food_name?: string;
  nutrition_state?: string;
  nutrition_state_label?: string;
  ingredient_type?: string; // 'FOOD' | 'SUPPLEMENT' | 'PACKAGING'
  nutrient_target_key?: string; // 补剂类型：营养素名称（如"钙"、"维生素D3"）
  nutrient_target_value?: number; // 补剂类型：营养目标值
  supplement_targets?: SupplementTarget[];
  nutrition_profile_snapshot?: NutritionProfile | null;
  properties?: any; // 补剂类型：完整属性（包含active_nutrients等）
  preparation_methods?: string[]; // 制备方法名称数组（如"生重"、"熟重"、"打碎"）
  sort_order?: number; // 原料在食谱中的顺序
  unit_display_label?: string; // 补剂类型：单位显示标签（如"粒"、"片"、"g"）
}

/**
 * Nutrition Detailed Data
 * Structure for Recipe.nutrition_detailed_data JSON field.
 * All macronutrients use Dry Matter Basis (DM) with _dm_pct suffix.
 */
export interface NutritionDetailedData {
  moisture_pct?: number | null; // 含水量 (As Fed basis)
  protein_dm_pct?: number | null; // 蛋白质 (Dry Matter Basis)
  fat_dm_pct?: number | null; // 脂肪 (Dry Matter Basis)
  fiber_dm_pct?: number | null; // 纤维 (Dry Matter Basis)
  ash_dm_pct?: number | null; // 灰分 (Dry Matter Basis)
  carbs_dm_pct?: number | null; // 碳水 (Dry Matter Basis)
  ca_p_ratio?: number | null; // 钙磷比 (Decimal, 2 places)
  energy_density_kcal_per_kg?: number | null; // 热量密度 (As Fed, matching column)
  source?: string;
  schemaVersion?: number;
  standard?: string;
  scenario?: string;
  generatedAt?: string;
  summary?: NutritionDetailedSummary;
  report?: SetarNutritionReport;
}

export type NutritionDetailedSummary = Pick<
  NutritionDetailedData,
  | 'moisture_pct'
  | 'protein_dm_pct'
  | 'fat_dm_pct'
  | 'fiber_dm_pct'
  | 'ash_dm_pct'
  | 'carbs_dm_pct'
  | 'ca_p_ratio'
  | 'energy_density_kcal_per_kg'
>;

export interface SetarNutritionReport {
  ingredientRows?: Array<Record<string, unknown>>;
  macroRows?: Array<Record<string, unknown>>;
  energyDensityRows?: Array<Record<string, unknown>>;
  nutrientSections?: Record<string, unknown>;
}
