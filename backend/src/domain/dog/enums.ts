/**
 * Dog Domain Enums
 * These enums match the Prisma schema exactly.
 */

export enum DogSizeCategory {
  SMALL = 'SMALL',
  MEDIUM = 'MEDIUM',
  LARGE = 'LARGE',
  GIANT = 'GIANT',
}

export enum GrowthCurveType {
  STANDARD = 'STANDARD',
  SLOW = 'SLOW',
  VERY_SLOW = 'VERY_SLOW',
}

export enum DogGender {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
}

export enum ActivityLevel {
  RESTING = 'RESTING',
  LOW = 'LOW',
  NORMAL = 'NORMAL',
  HIGH = 'HIGH',
  WORKING = 'WORKING',
}

export enum LifeStageOverride {
  NONE = 'NONE',
  PREGNANCY = 'PREGNANCY',
  LACTATION = 'LACTATION',
  PUPPY = 'PUPPY',
  ADULT = 'ADULT',
  SENIOR = 'SENIOR',
}

export enum TreatInputMode {
  ESTIMATE_LEVEL = 'ESTIMATE_LEVEL',
  EXACT_KCAL = 'EXACT_KCAL',
}

export enum TreatLevel {
  NONE = 'NONE',
  LOW = 'LOW',
  MODERATE = 'MODERATE',
  HIGH = 'HIGH',
}

// ===== 体重管理计划（2026-09-29，阶段 B）=====

export enum WeightGoalDirection {
  /** 减重 */
  LOSS = 'LOSS',
  /** 增重 */
  GAIN = 'GAIN',
}

export enum WeightGoalPlanStatus {
  /** 进行中 */
  ACTIVE = 'ACTIVE',
  /** 暂停（连续 8 周未称重 / 计划期间怀孕） */
  PAUSED = 'PAUSED',
  /** 维持期（已达标，防反弹） */
  MAINTENANCE = 'MAINTENANCE',
  /** 已结束 */
  COMPLETED = 'COMPLETED',
  /** 已取消 */
  CANCELLED = 'CANCELLED',
}

export enum WeightGoalAdjustmentReason {
  /** 速率过慢（朝目标推进慢于 0.5%/周）→ 力度加一档 */
  RATE_TOO_SLOW = 'RATE_TOO_SLOW',
  /** 速率过快（快于 2%/周，会掉肌肉）→ 力度退一档 */
  RATE_TOO_FAST = 'RATE_TOO_FAST',
  /** 顾客手动改（目标体重 / 力度） */
  MANUAL = 'MANUAL',
  /** 达标转维持期（热量上浮 10%） */
  GOAL_REACHED = 'GOAL_REACHED',
  /** 维持期仍继续掉重 → 再加 10% */
  MAINTENANCE_UNDERSHOOT = 'MAINTENANCE_UNDERSHOOT',
  /** 撞到安全下限，不再继续加力度 */
  FLOOR_REACHED = 'FLOOR_REACHED',
}
