import type { Dog } from './dog.entity';
import type { DogBreed } from './dog-breed.entity';
import { ActivityLevel, DogSizeCategory, LifeStageOverride, TreatInputMode, TreatLevel } from './enums';

/**
 * 狗狗每日能量需求 · 第二版算法（2026-09-28）
 *
 * 依据：**FEDIAF 官方英文 2025 原版**
 * 规格书：docs/plans/2026-09-28-energy-algorithm-v2-spec.md
 * 通读笔记：docs/audits/2026-09-28-fediaf-2025-full-read.md
 *
 * 与 v1（dog-calc.service.ts 的 calculateDogEnergy）的区别：
 *   1. **用理想体重**算 RER（v1 用当前体重）
 *   2. **删除体况分打折系数**，体况分改为「换算理想体重」+「给建议」
 *   3. **幼犬用连续生长曲线**（v1 是 9 个阶梯档位）
 *   4. **成犬用 FEDIAF「年龄档 × 活动档」3×3 表**（v1 是 95/110 两档 + 老年单独一套）
 *   5. **怀孕/哺乳用 FEDIAF 分期公式**（v1 是 3.0 / 4.0 定值）
 *   6. 零食扣减不变
 *
 * 设计约束（老板 2026-09-28 明确）：
 *   - 本模块**只算能量（kcal/天）**，不涉及营养配方浓度
 *   - 能量 → 克数 由业务端完成（食谱能量密度、进食习惯）
 *   - **不引入环境温度、独居/群养等专业工具向的修正**
 *   - **缺数据时取更保守（更低）的一侧**
 *
 * ⚠️ 本模块是纯函数，不依赖 Nest DI，便于对全量狗狗做新旧对比。
 */

// ==================== 常量（全部可追溯到 FEDIAF 官方英文 2025） ====================

/** 静息能量：RER = 70 × 体重(kg)^0.75（FEDIAF 全篇一致） */
export const RER_COEFFICIENT = 70;
export const RER_EXPONENT = 0.75;

/**
 * 体况分 → 理想体重换算系数（FEDIAF 表 VII-2，犬）
 *
 * 该表直接给出「相对 BCS 5 的体重增减百分比」；换算方式：
 *   理想体重 = 当前体重 ÷ (1 + 增减中值)
 *
 * BCS 4 与 5 都属理想区间（FEDIAF 原文：「犬应维持 BCS 4-5」），**不做换算**。
 */
export const BCS_TO_IDEAL_WEIGHT_FACTOR: Record<number, number> = {
  1: 1 / 0.6, // ≥ −40% → 取 −40%
  2: 1 / 0.65, // −30~−40% → 取中值 −35%
  3: 1 / 0.75, // −20~−30% → 取中值 −25%
  4: 1.0, // 理想区间，不换算
  5: 1.0, // 基准
  6: 1 / 1.125, // +10~+15% → 取中值 +12.5%
  7: 1 / 1.25, // +20~+30% → 取中值 +25%
  8: 1 / 1.375, // +30~+45% → 取中值 +37.5%
  9: 1 / 1.45, // > +45% → 取区间下限 +45%
};

/**
 * 幼犬生长曲线（FEDIAF 表 VII-8a）
 * `% 预期成年体重 = a × Ln(周龄) + b`，适用断奶（8 周）至 1 岁。
 *
 * ⚠️ >15-27.5 kg 档的 a = 39.88 已用**官方英文 2025 原版**核对
 *    （波兰文官方译本误印为 36.88，会造成 6 月龄能量高估约 8%）。
 */
export const GROWTH_CURVES: Array<{ maxAdultKg: number; a: number; b: number }> = [
  { maxAdultKg: 7, a: 36.92, b: -43.57 },
  { maxAdultKg: 15, a: 36.86, b: -48.22 },
  { maxAdultKg: 27.5, a: 39.88, b: -60.7 },
  { maxAdultKg: 47.5, a: 36.96, b: -56.18 },
  { maxAdultKg: Infinity, a: 36.61, b: -62.39 },
];

/** 幼犬能量公式（FEDIAF 表 VII-8b）：[254.1 − 135 × 比值] × 当前体重^0.75 */
export const GROWTH_ENERGY_INTERCEPT = 254.1;
export const GROWTH_ENERGY_SLOPE = 135.0;
/** 生长曲线只覆盖到 1 岁 */
export const GROWTH_CURVE_MAX_WEEKS = 52;
export const GROWTH_CURVE_MIN_WEEKS = 8;

/**
 * 成犬「年龄档 × 活动档」表（FEDIAF 表 VII-6 × 表 VII-7）
 *
 * 单位 kcal ME/kg^0.75。出处：
 *   · 1-2 岁 130（125-140）→ 日常取区间下限 125、活跃取均值 130
 *   · 3-7 岁 110（95-130）→ 日常取表 VII-7 低活动 95、活跃取中活动 110
 *   · >7 岁 95（80-120）  → 日常取区间下限 80、活跃取均值 95
 *   · 工作犬 = 表 VII-7 高活动（工作犬）150-175 → 取区间下限 150（「往低取」）
 */
export const ADULT_ENERGY_TABLE = {
  YOUNG: { daily: 125, active: 130, working: 150 }, // 1-2 岁
  MIDDLE: { daily: 95, active: 110, working: 150 }, // 2-7 岁
  SENIOR: { daily: 80, active: 95, working: 150 }, // >7 岁
} as const;

/** 年龄段界限（月龄 / 年） */
export const YOUNG_ADULT_END_MONTHS = 24;
/**
 * 步入老年的年龄界线（能量分期用）。
 *
 * ⚠️ **已知口径不一致（2026-10-01 记录，未改）**：
 *   犬种表里自带 seniorAgeYears（按体型/品种给，用于生命阶段标签），
 *   但**能量分期用的是这个固定值 7 岁**，不读犬种。
 *   也就是说：一只按犬种 10 岁才算老的小型犬，从 7 岁起就按老年档算能量；
 *   一只按犬种 5-6 岁就该算老的大型犬，7 岁前仍按中年档。
 *
 *   之所以没有顺手改成按犬种取：这会直接改变线上**所有 7 岁以上犬**的能量数字，
 *   进而影响已下单的克数、体重目标的建议值。属于"要单独评估 + 单独灰度"的改动，
 *   不适合混在健康管理重构里做。改动前需要先出一份差异报表。
 */
export const SENIOR_START_YEARS = 7;

/** 犬妊娠期天数（均值；个体约 58-68 天）—— 用于由预产期反推孕周 */
export const DOG_GESTATION_DAYS = 63;

/** 怀孕（FEDIAF 表 VII-8b，单位 kcal，用当前体重） */
export const PREGNANCY_EARLY_KCAL_PER_KG075 = 132;
export const PREGNANCY_LATE_ADD_KCAL_PER_KG = 26;
/** 孕期约 9 周，前 4 周 + 后 5 周 */
export const PREGNANCY_TOTAL_WEEKS = 9;
export const PREGNANCY_EARLY_WEEKS = 4;

/** 哺乳（FEDIAF 表 VII-8b，单位 kcal，用当前体重） */
export const LACTATION_BASE_KCAL_PER_KG075 = 145;
/** 1-4 只：24 × n × 体重 × L；5-8 只：[96 + 12(n−4)] × 体重 × L */
export const LACTATION_SMALL_LITTER_FACTOR = 24;
export const LACTATION_LARGE_LITTER_BASE = 96;
export const LACTATION_LARGE_LITTER_STEP = 12;
/** 哺乳期周龄系数 L：第 1-4 周 */
export const LACTATION_WEEK_FACTORS = [0.75, 0.95, 1.1, 1.2];

/**
 * 哺乳期的有效期（周）。
 *
 * 犬通常在 6-8 周断奶，之后就不该再按哺乳期供能了。
 * **没有这个上限会出严重问题**：算法只认「分娩日 + 窝仔数」，
 * 顾客如果忘了切回「普通」，一只 10 kg、4 只小狗的母犬在产后第 26 周
 * 仍会拿到 1967 kcal，而它的成犬档只有 534 kcal —— **3.7 倍**。
 *
 * 所以让**算法自带有效期**，而不是依赖定时任务：
 * 产后超过这个周数 → 自动按成犬档计算，并提示顾客更新档案。
 */
export const LACTATION_MAX_WEEKS = 8;

/**
 * 妊娠期的宽限期（天）。
 *
 * 预产期过后这么久仍未改成哺乳期 → 说明顾客没更新档案。
 * 此时按成犬档计算（宁低勿高）并提示。
 */
export const PREGNANCY_OVERDUE_GRACE_DAYS = 14;

/** 零食扣减（不变）：上限 10% */
export const TREAT_RATIOS = { NONE: 0, LOW: 0.03, MODERATE: 0.06, HIGH: 0.1 } as const;
export const TREAT_CAP_RATIO = 0.1;

/** 混血 / 品种缺失时，按体型档选生长曲线的代表成年体重（公斤） */
export const SIZE_CLASS_ADULT_WEIGHT_REPRESENTATIVE: Record<DogSizeCategory, number> = {
  [DogSizeCategory.SMALL]: 10, // 落在 >7-15 档
  [DogSizeCategory.MEDIUM]: 20, // 落在 >15-27.5 档
  [DogSizeCategory.LARGE]: 35, // 落在 >27.5-47.5 档
  [DogSizeCategory.GIANT]: 55, // 落在 >47.5 档
};

// ==================== 类型 ====================

export type AdultEnergyPhase = 'YOUNG' | 'MIDDLE' | 'SENIOR';

export type EnergyV2Stage =
  | 'PUPPY_GROWTH_CURVE'
  | 'ADULT_YOUNG'
  | 'ADULT_MIDDLE'
  | 'ADULT_SENIOR'
  | 'PREGNANCY_EARLY'
  | 'PREGNANCY_LATE'
  | 'LACTATION';

/** 本次用的是哪个能量基线（供营养侧取对应的营养列，唯一的跨侧接口） */
export type EnergyBaselineKcalPerKg075 = number;

export interface EnergyV2Input {
  /** 当前体重（公斤） */
  currentWeightKg: number;
  /** 体况分 1-9 */
  bcsScore: number;
  /** 生日 */
  birthday: Date;
  /** 活动量 */
  activityLevel: ActivityLevel;
  /** 生命阶段覆盖（NONE = 按年龄自动判断） */
  lifeStageOverride: LifeStageOverride;
  /** 体型档（混血 / 品种缺失时用于兜底） */
  sizeCategory: DogSizeCategory | null;
  /** 品种的常见成年体重（公斤），仅用于挑选生长曲线 */
  breedAverageAdultWeightKg?: number | null;
  /** 主人手动填写的理想体重（公斤）——最高优先 */
  ownerIdealWeightKg?: number | null;

  // —— 以下仅怀孕 / 哺乳需要 ——
  /** 配种日（用于推算孕周） */
  matingDate?: Date | null;
  /** 预产期（兽医 B 超值更准）；与配种日同时存在时以本字段为准 */
  expectedDueDate?: Date | null;
  /** 窝仔数 */
  litterSize?: number | null;
  /** 分娩日（用于推算产后周数） */
  deliveryDate?: Date | null;

  // —— 零食 ——
  treatInputMode: TreatInputMode;
  treatLevel: TreatLevel;
  manualTreatKcal?: number | null;

  /** 计算基准日，默认今天（便于测试与对比） */
  asOf?: Date;
}

export interface EnergyV2Result {
  /** 静息能量（按理想体重算；幼犬/孕哺按当前体重） */
  rer: number;
  /** 用来算 RER 的体重（公斤） */
  rerBasisWeightKg: number;
  /** 理想体重（公斤） */
  idealWeightKg: number;
  /** 理想体重的来源 */
  idealWeightSource: 'OWNER' | 'BCS' | 'CURRENT';
  /** 命中的生命阶段 */
  stage: EnergyV2Stage;
  /** 阶段系数（RER 倍数） */
  stageFactor: number;
  /** 本次使用的能量基线（kcal ME/kg^0.75）——跨侧接口 */
  baselineKcalPerKg075: EnergyBaselineKcalPerKg075;
  /** 零食扣减（kcal） */
  treatDeduction: number;
  /** 最终：每日能量需求（kcal/天） */
  dailyEnergyKcal: number;
  /** 计算过程中的提示（缺数据、需要确认等） */
  notes: string[];
}

// ==================== 纯函数实现 ====================

function round(value: number, digits = 1): number {
  const p = 10 ** digits;
  return Math.round(value * p) / p;
}

/** RER = 70 × 体重^0.75 */
export function calculateRerV2(weightKg: number): number {
  return RER_COEFFICIENT * weightKg ** RER_EXPONENT;
}

/**
 * 体况分 → 理想体重系数。
 * 越界或缺失时按 BCS 5（不换算）处理 —— 缺数据取保守侧。
 */
export function resolveIdealWeightFactor(bcsScore: number | null | undefined): number {
  if (typeof bcsScore !== 'number' || !Number.isFinite(bcsScore)) {
    return 1.0;
  }
  const rounded = Math.round(bcsScore);
  if (rounded < 1 || rounded > 9) {
    return 1.0;
  }
  return BCS_TO_IDEAL_WEIGHT_FACTOR[rounded] ?? 1.0;
}

/**
 * 由「预期成年体重」选出所属档位的生长曲线。
 *
 * ⚠️ 这里是**离散选档**，不做跨档混合：
 *    FEDIAF 的 5 条曲线各自对应一个体重区间（≤7 / >7-15 / >15-27.5 / >27.5-47.5 / >47.5），
 *    一只狗按其预期成年体重落在哪一档，就用那一条曲线——这正是原表的用法。
 *    跨档边界上会有一个台阶，最大约 5.9%（相邻档之间），可以接受；
 *    且只影响恰好压在边界上的极少数狗。
 */
export function resolveGrowthCurveForAdultWeight(expectedAdultWeightKg: number) {
  for (const curve of GROWTH_CURVES) {
    if (expectedAdultWeightKg <= curve.maxAdultKg) {
      return curve;
    }
  }
  return GROWTH_CURVES[GROWTH_CURVES.length - 1];
}

/**
 * 生长曲线：算出「该周龄应有的体重占预期成年体重的百分比」。
 *
 * 关键：这个百分比**本身就是 FEDIAF 幼犬能量公式要的那个比值**
 * （比值 = 当前体重 ÷ 预期成年体重），所以只要选对曲线，
 * **不需要知道这只狗成年后的精确体重**。
 */
export function resolveGrowthCurvePercent(
  expectedAdultWeightKg: number,
  ageWeeks: number,
): number {
  if (!Number.isFinite(expectedAdultWeightKg) || expectedAdultWeightKg <= 0) {
    return 0;
  }
  if (!Number.isFinite(ageWeeks) || ageWeeks <= 0) {
    return 0;
  }
  const curve = resolveGrowthCurveForAdultWeight(expectedAdultWeightKg);
  return curve.a * Math.log(ageWeeks) + curve.b;
}

/** 幼犬能量系数：由「占成年体重百分比」算出 RER 倍数 */
export function resolvePuppyFactor(percentOfAdultWeight: number): number {
  const ratio = Math.min(Math.max(percentOfAdultWeight / 100, 0), 1);
  const kcalPerKg075 = GROWTH_ENERGY_INTERCEPT - GROWTH_ENERGY_SLOPE * ratio;
  return kcalPerKg075 / RER_COEFFICIENT;
}

/** 成犬年龄段：12-24 月 = 青年；24 月-7 岁 = 中年；>7 岁 = 老年 */
export function resolveAdultEnergyPhase(ageMonths: number): AdultEnergyPhase {
  if (ageMonths < YOUNG_ADULT_END_MONTHS) {
    return 'YOUNG';
  }
  if (ageMonths < SENIOR_START_YEARS * 12) {
    return 'MIDDLE';
  }
  return 'SENIOR';
}

/** 活动档 → 3×3 表中的列 */
export function resolveActivityColumn(
  activityLevel: ActivityLevel,
): 'daily' | 'active' | 'working' {
  if (activityLevel === ActivityLevel.WORKING) {
    return 'working';
  }
  // HIGH 视为活跃；RESTING / LOW / NORMAL 一律视为日常
  // （FEDIAF：多数家养犬活动不足，且「应从较低 MER 起步」）
  if (activityLevel === ActivityLevel.HIGH) {
    return 'active';
  }
  return 'daily';
}

function monthsBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24 * 30.4375);
}

function weeksBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24 * 7);
}

/**
 * 推算当前孕周（第几周）。
 *
 * 优先用**预产期**（兽医 B 超更准）：孕周 = 9 −（预产期 − 今天）÷ 7
 * 没有预产期时用**配种日**：孕周 =（今天 − 配种日）÷ 7
 * 两者都没有 → 返回 null（调用方按孕早期保守处理）
 */
export function resolveGestationWeeks(
  input: { matingDate?: Date | null; expectedDueDate?: Date | null },
  asOf: Date,
): number | null {
  const due = input.expectedDueDate;
  if (due instanceof Date && !Number.isNaN(due.getTime())) {
    const daysUntilDue = (due.getTime() - asOf.getTime()) / (1000 * 60 * 60 * 24);
    return PREGNANCY_TOTAL_WEEKS - daysUntilDue / 7;
  }

  const mating = input.matingDate;
  if (mating instanceof Date && !Number.isNaN(mating.getTime())) {
    const daysSinceMating = (asOf.getTime() - mating.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceMating < 0) {
      return null;
    }
    return Math.min(daysSinceMating / 7, PREGNANCY_TOTAL_WEEKS);
  }

  return null;
}

/**
 * 怀孕总能量（kcal，直接用当前体重）——FEDIAF 表 VII-8b：
 *   前 4 周：132 × 体重^0.75
 *   后 5 周：132 × 体重^0.75 + 26 × 体重
 *
 * 注意两项量纲不同（前者按 kg^0.75、后者按 kg），必须分别算完再相加。
 */
export function resolvePregnancyKcal(
  currentWeightKg: number,
  gestationWeeks: number | null,
): { totalKcal: number; isEarly: boolean } {
  const weightPow = currentWeightKg ** RER_EXPONENT;
  const base = PREGNANCY_EARLY_KCAL_PER_KG075 * weightPow;

  if (gestationWeeks === null || !Number.isFinite(gestationWeeks)) {
    // 缺数据 → 保守取孕早期
    return { totalKcal: base, isEarly: true };
  }
  if (gestationWeeks <= PREGNANCY_EARLY_WEEKS) {
    return { totalKcal: base, isEarly: true };
  }
  return {
    totalKcal: base + PREGNANCY_LATE_ADD_KCAL_PER_KG * currentWeightKg,
    isEarly: false,
  };
}

/**
 * 哺乳系数（kcal/kg^0.75）：
 * 1-4 只 = 145 + 24 × n × 体重 × L ÷ 体重^0.75 …… 直接按 FEDIAF 原式返回总 kcal
 */
export function resolveLactationKcal(
  currentWeightKg: number,
  litterSize: number | null,
  postpartumWeeks: number | null,
): number {
  const n = typeof litterSize === 'number' && litterSize > 0 ? Math.min(litterSize, 8) : 2;
  const week = typeof postpartumWeeks === 'number' && postpartumWeeks > 0 ? postpartumWeeks : 1;
  const L = LACTATION_WEEK_FACTORS[Math.min(Math.max(Math.floor(week) - 1, 0), 3)];
  const weightPow = currentWeightKg ** RER_EXPONENT;

  const litterTerm =
    n <= 4
      ? LACTATION_SMALL_LITTER_FACTOR * n
      : LACTATION_LARGE_LITTER_BASE + LACTATION_LARGE_LITTER_STEP * (n - 4);

  return LACTATION_BASE_KCAL_PER_KG075 * weightPow + litterTerm * currentWeightKg * L;
}

function resolveTreatRatio(
  treatInputMode: TreatInputMode,
  treatLevel: TreatLevel,
): number {
  if (treatInputMode === TreatInputMode.EXACT_KCAL) {
    return -1; // 由调用方按具体 kcal 扣
  }
  // 兜底取 LOW（3%）而不是随手取中间值：
  //   · 前端只给三档（NONE / LOW / HIGH），但历史数据里可能有 MODERATE；
  //     表里查得到就用表里的值，查不到（脏数据 / 未来的新枚举）
  //     一律按 LOW 处理 —— 零食算少不算多，对减重管理是安全的一侧。
  //   · TREAT_RATIOS 里另有 TREAT_CAP_RATIO = 0.1，再高也不会超过 10%。
  return TREAT_RATIOS[treatLevel] ?? TREAT_RATIOS.LOW;
}

/**
 * v2 主函数：算出每日能量需求（kcal/天）。
 *
 * 缺数据时一律取更保守（更低）的一侧。
 */
export function calculateDailyEnergyV2(input: EnergyV2Input): EnergyV2Result {
  const notes: string[] = [];
  const asOf = input.asOf ?? new Date();
  const currentWeightKg = input.currentWeightKg;

  if (!Number.isFinite(currentWeightKg) || currentWeightKg <= 0) {
    throw new Error('体重缺失或非法，无法计算能量');
  }

  const ageMonths = monthsBetween(input.birthday, asOf);
  const ageWeeks = weeksBetween(input.birthday, asOf);

  // ---------- 第 2 步：理想体重 ----------
  let idealWeightKg = currentWeightKg;
  let idealWeightSource: EnergyV2Result['idealWeightSource'] = 'CURRENT';

  const ownerIdeal =
    typeof input.ownerIdealWeightKg === 'number' && input.ownerIdealWeightKg > 0
      ? input.ownerIdealWeightKg
      : null;

  if (ownerIdeal !== null) {
    idealWeightKg = ownerIdeal;
    idealWeightSource = 'OWNER';
    const diff = Math.abs(ownerIdeal - currentWeightKg) / currentWeightKg;
    if (diff > 0.3) {
      notes.push('主人填写的理想体重与当前体重相差超过 30%，建议确认');
    }
  } else {
    const factor = resolveIdealWeightFactor(input.bcsScore);
    idealWeightKg = currentWeightKg * factor;
    idealWeightSource = Math.abs(factor - 1) < 1e-6 ? 'CURRENT' : 'BCS';
  }
  idealWeightKg = round(idealWeightKg, 2);

  // ---------- 第 4 步：定生命阶段 ----------
  const override = input.lifeStageOverride ?? LifeStageOverride.NONE;
  // ---------- 繁殖期有效期：过期的自动失效（见上面两个常量的说明） ----------
  let pregnancyExpired = false;
  let lactationExpired = false;

  if (override === LifeStageOverride.PREGNANCY) {
    const due = input.expectedDueDate;
    if (due instanceof Date && !Number.isNaN(due.getTime())) {
      const daysOverdue =
        (asOf.getTime() - due.getTime()) / (1000 * 60 * 60 * 24);
      if (daysOverdue > PREGNANCY_OVERDUE_GRACE_DAYS) {
        pregnancyExpired = true;
        notes.push(
          '预产期已过两周以上，妊娠期信息可能已过期，已按成犬计算；' +
            '如果已经生产，请更新为哺乳期',
        );
      }
    }
  }

  if (override === LifeStageOverride.LACTATION) {
    const delivery = input.deliveryDate;
    if (delivery instanceof Date && !Number.isNaN(delivery.getTime())) {
      const weeks = weeksBetween(delivery, asOf);
      if (weeks > LACTATION_MAX_WEEKS) {
        lactationExpired = true;
        notes.push(
          `分娩已超过 ${LACTATION_MAX_WEEKS} 周（通常已断奶），已按成犬计算；` +
            '请把生命阶段改回「自动判断」或「成年期」',
        );
      }
    } else {
      // 没填分娩日 → 无法判断是否过期，按成犬保守处理
      lactationExpired = true;
      notes.push('缺少分娩日，无法判断哺乳期是否结束，已按成犬保守计算');
    }
  }

  // 过期的妊娠/哺乳不再算作「特殊阶段」，让后面的 else 分支按成犬处理
  const effectiveOverride =
    pregnancyExpired || lactationExpired ? LifeStageOverride.NONE : override;

  const isPuppy =
    effectiveOverride === LifeStageOverride.PUPPY ||
    (effectiveOverride !== LifeStageOverride.ADULT &&
      effectiveOverride !== LifeStageOverride.SENIOR &&
      ageMonths < 12);

  // 幼犬 / 孕哺用当前体重；成犬用理想体重
  const rerBasisWeightKg = isPuppy || effectiveOverride === LifeStageOverride.PREGNANCY || effectiveOverride === LifeStageOverride.LACTATION
    ? currentWeightKg
    : idealWeightKg;
  const rer = calculateRerV2(rerBasisWeightKg);

  // ---------- 第 5 步：阶段系数 ----------
  let stage: EnergyV2Stage;
  let factor: number;

  if (override === LifeStageOverride.PREGNANCY && !pregnancyExpired) {
    const gestationWeeks = resolveGestationWeeks(input, asOf);
    if (gestationWeeks === null) {
      notes.push('缺少配种日 / 预产期，已按孕早期保守处理');
    }
    const { totalKcal, isEarly } = resolvePregnancyKcal(
      currentWeightKg,
      gestationWeeks,
    );
    stage = isEarly ? 'PREGNANCY_EARLY' : 'PREGNANCY_LATE';
    factor = totalKcal / rer;
  } else if (override === LifeStageOverride.LACTATION && !lactationExpired) {
    const delivery = input.deliveryDate ?? null;
    const postpartumWeeks = delivery ? weeksBetween(delivery, asOf) : null;
    if (input.litterSize === null || input.litterSize === undefined) {
      notes.push('缺少窝仔数，已按 2 只保守处理');
    }
    const lactationKcal = resolveLactationKcal(
      currentWeightKg,
      input.litterSize ?? null,
      postpartumWeeks,
    );
    stage = 'LACTATION';
    factor = lactationKcal / rer;
  } else if (isPuppy) {
    if (ageWeeks < GROWTH_CURVE_MIN_WEEKS) {
      notes.push('不足 8 周（未断奶），生长曲线不适用，已按 8 周处理');
    }
    const effectiveWeeks = Math.min(
      Math.max(ageWeeks, GROWTH_CURVE_MIN_WEEKS),
      GROWTH_CURVE_MAX_WEEKS,
    );
    const expectedAdultKg =
      typeof input.breedAverageAdultWeightKg === 'number' &&
      input.breedAverageAdultWeightKg > 0
        ? input.breedAverageAdultWeightKg
        : SIZE_CLASS_ADULT_WEIGHT_REPRESENTATIVE[
            input.sizeCategory ?? DogSizeCategory.MEDIUM
          ];
    const percent = resolveGrowthCurvePercent(expectedAdultKg, effectiveWeeks);
    stage = 'PUPPY_GROWTH_CURVE';
    factor = resolvePuppyFactor(percent);
  } else {
    const phase = resolveAdultEnergyPhase(ageMonths);
    const column = resolveActivityColumn(input.activityLevel);
    const kcalPerKg075 = ADULT_ENERGY_TABLE[phase][column];
    stage =
      phase === 'YOUNG'
        ? 'ADULT_YOUNG'
        : phase === 'MIDDLE'
          ? 'ADULT_MIDDLE'
          : 'ADULT_SENIOR';
    factor = kcalPerKg075 / RER_COEFFICIENT;
  }

  const baselineKcalPerKg075 = round(factor * RER_COEFFICIENT, 1);
  const grossKcal = rer * factor;

  // ---------- 第 6 步：零食扣减 ----------
  let treatDeduction: number;
  if (input.treatInputMode === TreatInputMode.EXACT_KCAL) {
    const manual = input.manualTreatKcal;
    if (typeof manual === 'number' && Number.isFinite(manual) && manual > 0) {
      treatDeduction = manual;
    } else {
      // 缺数据 → 按「少」保守处理，而不是 0
      treatDeduction = grossKcal * TREAT_RATIOS.LOW;
      notes.push('缺少零食千卡数值，已按「少」档处理');
    }
  } else {
    const ratio = resolveTreatRatio(input.treatInputMode, input.treatLevel);
    treatDeduction = grossKcal * ratio;
  }
  treatDeduction = Math.min(treatDeduction, grossKcal * TREAT_CAP_RATIO);

  // ---------- 第 7 步：输出 ----------
  const dailyEnergyKcal = Math.max(grossKcal - treatDeduction, 0);

  return {
    rer: round(rer, 1),
    rerBasisWeightKg: round(rerBasisWeightKg, 2),
    idealWeightKg,
    idealWeightSource,
    stage,
    stageFactor: round(factor, 4),
    baselineKcalPerKg075,
    treatDeduction: round(treatDeduction, 1),
    dailyEnergyKcal: round(dailyEnergyKcal, 1),
    notes,
  };
}

/** 便捷入口：直接从 Dog 实体 + 品种计算 */
export function calculateDailyEnergyV2ForDog(
  dog: Dog,
  breed?: DogBreed | null,
  asOf?: Date,
): EnergyV2Result {
  const sizeCategory =
    (dog.sizeClassOverride as DogSizeCategory | null) ??
    ((breed?.sizeCategory as DogSizeCategory | undefined) ?? null);

  return calculateDailyEnergyV2({
    currentWeightKg: dog.currentWeightKg,
    bcsScore: dog.bcsScore,
    birthday: dog.birthday,
    activityLevel: dog.activityLevel,
    lifeStageOverride: dog.lifeStageOverride,
    sizeCategory,
    breedAverageAdultWeightKg: breed?.averageAdultWeightKg ?? null,
    matingDate: dog.matingDate ?? null,
    expectedDueDate: dog.expectedDueDate ?? null,
    deliveryDate: dog.deliveryDate ?? null,
    litterSize: dog.litterSize ?? null,
    treatInputMode: dog.treatInputMode,
    treatLevel: dog.treatLevel,
    manualTreatKcal: dog.manualTreatKcal,
    asOf,
  });
}

// ==================== 算法版本开关（默认 v1，线上行为不变） ====================

/**
 * 是否启用 v2 能量算法。
 *
 * **默认关闭**：只有显式设置环境变量 `ENERGY_ALGORITHM=v2` 时才切到新算法。
 * 这样新旧两套并存、可一键回滚，且不改动线上默认行为。
 *
 * 上线节奏（见 docs/plans/2026-09-28-energy-algorithm-v2-spec.md）：
 *   先影子对比 → 老板审定差异报表 → 灰度 → 全量。
 */
export function isEnergyV2Enabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return String(env.ENERGY_ALGORITHM ?? '').trim().toLowerCase() === 'v2';
}
