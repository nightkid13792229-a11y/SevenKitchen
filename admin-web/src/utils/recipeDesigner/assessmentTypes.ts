import type { NutritionProfile } from './nutritionProfileTypes';

export type FediafDogScenarioCode =
  | 'EARLY_GROWTH_REPRODUCTION'
  | 'REPRODUCTION'
  | 'LATE_GROWTH'
  | 'ADULT_MER_95'
  | 'ADULT_MER_110';

export type AssessmentExpressionBasis =
  | 'PER_1000_KCAL_ME'
  | 'PER_MJ_ME'
  | 'PER_100G_DRY_MATTER'
  | 'RATIO';

export type AssessmentCategory =
  | 'MACRO'
  | 'MINERAL'
  | 'VITAMIN'
  | 'FATTY_ACID'
  | 'AMINO_ACID'
  | 'COMBINATION'
  | 'RATIO';

export type AssessmentNutrientCategory = AssessmentCategory;

export type NutrientCalculation = 'SUM' | 'RATIO';

export interface FediafAssessmentTarget {
  nutrientKey: string;
  label: string;
  category: AssessmentCategory;
  expressionBasis: AssessmentExpressionBasis;
  unit: string;
  minValue: number | null;
  maxValue: number | null;
  minValueNote?: string | null;
  maxValueNote?: string | null;
  maxValueLabel?: string | null;
  excludeFromAttention?: boolean;
  fieldPaths: readonly string[];
  calculation?: NutrientCalculation;
}

export interface DesignRecipeAssessmentItemInput {
  id: string;
  name: string;
  ingredientType?: string | null;
  weightG: number;
  nutritionProfile: NutritionProfile | null;
}

export type AssessmentEntryStatus =
  | 'COMPLIANT'
  | 'DEFICIENT'
  | 'EXCESS'
  | 'MISSING_DATA'
  | 'INFO';

export type AssessmentOverallStatus =
  | 'COMPLIANT'
  | 'NON_COMPLIANT'
  | 'INCOMPLETE';

export interface AssessmentNutrientContributor {
  itemId: string;
  itemName: string;
  weightG: number;
  amountUnit?: string;
  amount: number | null;
  unit: string;
  contributionPercent: number | null;
  missing: boolean;
  missingAsZero?: boolean;
}

export interface AssessmentEntry {
  nutrientKey: string;
  label: string;
  category: AssessmentCategory;
  expressionBasis: AssessmentExpressionBasis;
  unit: string;
  minValue: number | null;
  maxValue: number | null;
  minValueNote?: string | null;
  maxValueNote?: string | null;
  maxValueLabel?: string | null;
  rangeConflict?: boolean;
  rangeConflictNote?: string | null;
  excludeFromAttention?: boolean;
  currentValue: number | null;
  status: AssessmentEntryStatus;
  missingAsZero?: boolean;
  contributors?: AssessmentNutrientContributor[];
}

/**
 * 评估数据缺口：某个原料缺了某个必填字段。
 *
 * 为什么要显式点名：配方的能量用**犬用 Atwater 公式**计算，强制要求
 * 水分 / 粗蛋白 / 粗脂肪 / 灰分 / 膳食纤维 五项。
 * 其中任何一项在任何一个**食材**上缺失，该食材能量就算不出，
 * 整份食谱能量随之变成 null —— 而绝大多数指标的表达式以能量为分母，
 * 于是「营养评估」会整片塌成「缺数据」，界面上却看不出是哪个原料缺了什么。
 *
 * 有这份清单，面板就能直接说「油麦菜 缺 膳食纤维」，而不是只显示满屏「缺数据」。
 */
export interface AssessmentDataGap {
  itemId: string;
  itemName: string;
  /** 字段路径，例如 macros.fiber */
  fieldPath: string;
  /** 字段中文名，例如 膳食纤维 */
  fieldLabel: string;
  /**
   * 该缺口是否卡住能量计算。
   * 为 true 时，所有「每1000千卡 / 每兆焦」口径的指标都会一起算不出。
   */
  blocksEnergy: boolean;
}
