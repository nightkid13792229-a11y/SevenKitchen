/**
 * Dog Calculation Constants
 * Based on docs/07_Core_Architecture.md Section 3.3
 * DO NOT hardcode numbers in functions. Use these constants.
 */

/**
 * Virtual Breed ID for Mixed Breeds
 * Used when dog is not a pure breed
 */
export const MIXED_BREED_VIRTUAL_ID = '00000000-0000-0000-0000-000000000000';

/**
 * Life Stage Base Factors (RER Multipliers)
 * Source: FEDIAF (2021), WSAVA Global Nutrition Guidelines
 */
export const LIFE_STAGE_FACTORS = {
  PREGNANCY: 3.0,
  LACTATION: 4.0,
  // Puppy Growth Phases
  PUPPY_0_4_MONTHS: 3.0,
  PUPPY_4_6_MONTHS_GENERIC: 2.5,
  PUPPY_4_6_MONTHS_LARGE_GIANT: 3.0,
  PUPPY_6_9_MONTHS_GENERIC: 2.0,
  PUPPY_6_9_MONTHS_LARGE: 2.5,
  PUPPY_6_9_MONTHS_GIANT: 2.8,
  PUPPY_9_12_MONTHS_GENERIC: 1.8, // Reaches Adult-like level
  PUPPY_9_12_MONTHS_LARGE: 2.0,
  PUPPY_9_12_MONTHS_GIANT: 2.5,
  // Late Growth
  JUNIOR_GIANT_12_18_MONTHS: 2.0,
  JUNIOR_GIANT_18_24_MONTHS: 1.8,
  JUNIOR_LARGE_12_18_MONTHS: 1.8,
  // FEDIAF adult maintenance energy recommendation bands.
  ADULT_MER_95: 95 / 70,
  ADULT_MER_110: 110 / 70,
  // Adult Base
  ADULT_INTACT: 1.8, // 未绝育基准
  ADULT_NEUTERED: 1.6, // 绝育基准
  SENIOR: 1.4,
} as const;

/**
 * Activity Modifiers (Multipliers on Adult Base)
 * Applied ONLY to Adult Maintenance (not Growth/Repro)
 */
export const ACTIVITY_MULTIPLIERS = {
  RESTING: 0.8,
  LOW: 0.9,
  NORMAL: 1.0,
  HIGH: 1.2,
  WORKING: 1.5,
} as const;

/**
 * Treat Ratios (Percentage of Total DER)
 */
export const TREAT_LIMITS = {
  CAP_PERCENT: 0.1, // Max 10% safety cap
  LOW_RATIO: 0.03, // 3%
  MODERATE_RATIO: 0.06, // 6%
  HIGH_RATIO: 0.1, // 10%
} as const;

/**
 * BCS Adjustments (Body Condition Score)
 * Source: WSAVA BCS Guidelines (9-point scale)
 */
export const BCS_PARAMS = {
  IDEAL_LOW: 4,
  IDEAL_HIGH: 5,
  OVERWEIGHT_PENALTY_PER_POINT: 0.1, // -10% per point > 5
  UNDERWEIGHT_BOOST_BCS_3: 1.2,
  UNDERWEIGHT_BOOST_BCS_1_2: 1.4,
} as const;

/**
 * Size Class Default Adult Thresholds (months)
 * Used when DogBreed.adult_age_months is not available
 */
export const SIZE_CLASS_ADULT_THRESHOLDS = {
  SMALL: 10,
  MEDIUM: 12,
  LARGE: 18,
  GIANT: 24,
} as const;

/**
 * Size Class Default Senior Thresholds (years)
 * Used when DogBreed.senior_age_years is not available
 * Source: AAHA Senior Care Guidelines
 */
export const SIZE_CLASS_SENIOR_THRESHOLDS = {
  SMALL: 11,
  MEDIUM: 10,
  LARGE: 8,
  GIANT: 7,
} as const;

/**
 * 档案允许的体重上限（公斤）
 *
 * 2026-09-28：从「无上限」收紧到 130 —— 生产库发现「顾客按斤报体重、
 * 系统当成公斤存下来」的污染，而原有校验只有「> 0」，任何数值都能存进来。
 * 历史上最重的犬只约 155 kg，130 kg 已覆盖所有真实个体；
 * 超过这个值只可能是输入错误，应当直接拒绝。
 *
 * 注意：**不在这里做「偏大/偏小/是不是填了斤」的判断**。系统无法区分
 * 顾客真的填错了，还是养的本就是串串/茶杯犬，给出错误提醒比不提醒更伤信任。
 * 顾客侧只保留客观的「公斤 ⇄ 斤」换算回显。
 * 见 docs/plans/2026-09-28-weight-input-contamination-fix.md
 */
export const MAX_DOG_WEIGHT_KG = 130;
