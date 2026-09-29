import {
  WeightGoalAdjustmentReason,
  WeightGoalDirection,
} from './enums';
import { RER_COEFFICIENT, RER_EXPONENT, resolveIdealWeightFactor } from './energy-v2';

/**
 * 体重管理计划（增减重）· 领域逻辑（2026-09-29，阶段 B）
 *
 * 设计文档：
 *   docs/plans/2026-09-28-weight-goal-plan-requirements.md
 *   docs/plans/2026-09-28-weight-goal-plan-ux-and-fields.md
 *
 * 老板原话：不只是给用户一个记录体重的工具，而是真真正正能指导用户
 * **通过饮食增减重的可执行方案**。
 *
 * ⚠️ 本模块是纯函数，不依赖 Nest DI，便于单独测试与对全量狗做试算。
 */

// ==================== 常量 ====================

/** 目标速率区间（%/周）—— SACN5：0.5-2%/周 */
export const TARGET_RATE_MIN_PERCENT_PER_WEEK = 0.5;
export const TARGET_RATE_MAX_PERCENT_PER_WEEK = 2.0;
/** 起步目标速率取区间中值 */
export const DEFAULT_TARGET_RATE_PERCENT_PER_WEEK = 1.0;

/**
 * 减重起步力度：RER(目标体重) × 1.0（老板定：最温和起点）。
 *
 * 注意这里用的是**目标（理想）体重**而不是当前体重 —— 胖狗按当前体重算会虚高，
 * 减着减着就不够了。用理想体重起步，得到的约是 26% 的热量缺口。
 */
export const LOSS_START_RER_FACTOR = 1.0;
/**
 * 减重能量下限：RER(目标体重) × 0.6。
 * 知识库原文：「多数犬可耐受低至理想体重 RER 的 60%」。撞到这里就不再下调。
 */
export const LOSS_FLOOR_RER_FACTOR = 0.6;

/**
 * 增重起步力度：维持需求 +10%。
 *
 * ⚠️ **这个 +10% 是我们的取值，没有权威依据** —— 知识库明确写了
 * 「增重方案超出 AAHA 指南范围」。它偏保守，宁可 2 周后上调一次。
 */
export const GAIN_START_FACTOR = 1.1;
/** 增重能量上限：维持需求 × 1.4 */
export const GAIN_CEILING_FACTOR = 1.4;

/** 达标转维持期时，热量按减重期上浮 10%（AAHA） */
export const MAINTENANCE_UPLIFT_FACTOR = 1.1;

/**
 * 减重的力度档位 —— 能量相对 **RER(目标体重)** 的倍数（需求文档 §3.2）。
 *
 * 老板选 ×1.0 起步而不是 AAHA 的 ×0.8，是取更温和、更不容易掉肌肉的起点。
 *
 * 顾客**只能往更温和方向调**（倍数只能变大）。更激进的方向留给自动校正 ——
 * 因为它有实测速率作依据，而顾客没有；让顾客把自己调到危险区间是不负责任的。
 */
export const LOSS_INTENSITY_LEVELS = [
  { key: 'STANDARD', label: '标准', factor: 1.0 },
  { key: 'GENTLE', label: '温和', factor: 1.1 },
  { key: 'GENTLER', label: '更温和', factor: 1.2 },
] as const;

/**
 * 增重的力度档位 —— 能量相对 **维持需求** 的倍数。
 *
 * ⚠️ 同样没有权威依据（知识库明确「增重方案超出 AAHA 指南范围」），
 * 三档都偏保守，宁可 2 周后由自动校正上调。
 */
export const GAIN_INTENSITY_LEVELS = [
  { key: 'STANDARD', label: '标准', factor: 1.1 },
  { key: 'GENTLE', label: '温和', factor: 1.2 },
  { key: 'GENTLER', label: '更温和', factor: 1.3 },
] as const;

export type WeightGoalIntensityKey = 'STANDARD' | 'GENTLE' | 'GENTLER';

export interface WeightGoalIntensityLevel {
  key: WeightGoalIntensityKey;
  label: string;
  factor: number;
}

export function resolveIntensityLevels(
  direction: WeightGoalDirection,
): readonly WeightGoalIntensityLevel[] {
  return direction === WeightGoalDirection.LOSS
    ? LOSS_INTENSITY_LEVELS
    : GAIN_INTENSITY_LEVELS;
}

/** 按档位算能量。未知档位按 STANDARD 保守处理。 */
export function resolveIntensityKcal(input: {
  direction: WeightGoalDirection;
  intensity: string | null | undefined;
  targetWeightKg: number;
  maintenanceKcal: number;
}): { key: WeightGoalIntensityKey; label: string; kcal: number } {
  const levels = resolveIntensityLevels(input.direction);
  const level =
    levels.find((l) => l.key === input.intensity) ??
    levels.find((l) => l.key === 'STANDARD')!;

  const kcal =
    input.direction === WeightGoalDirection.LOSS
      ? Math.round(calculateRerForWeight(input.targetWeightKg) * level.factor)
      : Math.round(input.maintenanceKcal * level.factor);

  return { key: level.key, label: level.label, kcal };
}

/**
 * 力度调整幅度。
 * 老板要求「下调 10-20%」→ 取中值 15%；上调「约 10%」。
 */
export const SLOW_ADJUST_RATIO = 0.15;
export const FAST_ADJUST_RATIO = 0.1;

/** 目标体重离当前体重 <5% → 建议不做计划（变化太小，无法有效监测）。提示性建议，不拦。 */
export const MIN_GOAL_CHANGE_RATIO = 0.05;
/** 目标体重与系统建议相差 >30% → 提示一次「偏离较大」。不拦。 */
export const TARGET_DEVIATION_WARN_RATIO = 0.3;

/** 连续未称重多久转暂停 */
export const INACTIVITY_PAUSE_WEEKS = 8;
/** 维持期持续多久自动结束 */
export const MAINTENANCE_DURATION_MONTHS = 3;
/** 复查间隔（称重提醒频率） */
export const REVIEW_INTERVAL_WEEKS = 2;
/** 速率在目标区间内时，复查间隔放宽到 4-6 周（取 5） */
export const REVIEW_INTERVAL_ON_TRACK_WEEKS = 5;

// ==================== 工具 ====================

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function round(value: number, digits = 1): number {
  const p = 10 ** digits;
  return Math.round(value * p) / p;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

/** 计划生效期间使用的「维持需求」口径：理想体重下的 RER × 成犬基线系数 */
export function calculateRerForWeight(weightKg: number): number {
  return RER_COEFFICIENT * weightKg ** RER_EXPONENT;
}

// ==================== 建计划：系统建议 ====================

export interface SuggestedPlanInput {
  currentWeightKg: number;
  bcsScore: number;
  /** 主人手填的理想体重（最高优先，与能量算法同一口径） */
  ownerIdealWeightKg?: number | null;
  /** 该狗按当前算法算出的每日维持能量（kcal/天） */
  maintenanceKcal: number;
  /** 建立日期，默认今天 */
  asOf?: Date;
}

export interface SuggestedPlan {
  direction: WeightGoalDirection;
  targetWeightKg: number;
  /** 当前体重与目标体重相差的比例（绝对值） */
  changeRatio: number;
  targetRatePercentPerWeek: number;
  /** 起步每日能量（kcal） */
  startKcal: number;
  floorKcal: number;
  ceilingKcal: number;
  estimatedGoalDate: Date | null;
  /** 需要提醒顾客的话（不拦截，只是提示） */
  notes: string[];
}

/**
 * 由当前体重 + 体况分给出系统建议方案（触点 1 第 1 步）。
 *
 * 方向判定：
 *   · BCS ≥ 6 → 减重
 *   · BCS ≤ 3 → 增重
 *   · BCS 4-5 → 维持（不回建议方案，由调用方告知顾客「不需要计划」）
 */
export function resolveSuggestedPlan(
  input: SuggestedPlanInput,
): SuggestedPlan | null {
  const asOf = input.asOf ?? new Date();
  const { currentWeightKg, bcsScore, maintenanceKcal } = input;

  if (!Number.isFinite(currentWeightKg) || currentWeightKg <= 0) {
    return null;
  }
  if (!Number.isFinite(maintenanceKcal) || maintenanceKcal <= 0) {
    return null;
  }

  const rounded = Math.round(bcsScore);
  let direction: WeightGoalDirection;
  if (rounded >= 6) {
    direction = WeightGoalDirection.LOSS;
  } else if (rounded <= 3) {
    direction = WeightGoalDirection.GAIN;
  } else {
    // BCS 4-5 是理想区间（FEDIAF：犬应维持 BCS 4-5），不该建增减重计划
    return null;
  }

  const ownerIdeal =
    typeof input.ownerIdealWeightKg === 'number' &&
    Number.isFinite(input.ownerIdealWeightKg) &&
    input.ownerIdealWeightKg > 0
      ? input.ownerIdealWeightKg
      : null;

  const targetWeightKg = round(
    ownerIdeal ?? currentWeightKg * resolveIdealWeightFactor(rounded),
    2,
  );

  const notes: string[] = [];
  const changeRatio = Math.abs(currentWeightKg - targetWeightKg) / currentWeightKg;
  if (changeRatio < MIN_GOAL_CHANGE_RATIO) {
    notes.push(
      `目标体重与当前体重只差 ${round(changeRatio * 100, 1)}%，变化太小、难以有效监测，建议先不建计划`,
    );
  }
  if (ownerIdeal !== null && changeRatio > TARGET_DEVIATION_WARN_RATIO) {
    notes.push('档案里填的理想体重与当前体重相差较大，建议确认');
  }

  const energy = resolvePlanEnergy({
    direction,
    targetWeightKg,
    maintenanceKcal,
  });
  const safeguards = resolvePlanSafeguards({
    direction,
    targetWeightKg,
    maintenanceKcal,
  });

  return {
    direction,
    targetWeightKg,
    changeRatio: round(changeRatio, 4),
    targetRatePercentPerWeek: DEFAULT_TARGET_RATE_PERCENT_PER_WEEK,
    startKcal: energy,
    floorKcal: safeguards.floorKcal,
    ceilingKcal: safeguards.ceilingKcal,
    estimatedGoalDate: resolveEstimatedGoalDate({
      currentWeightKg,
      targetWeightKg,
      targetRatePercentPerWeek: DEFAULT_TARGET_RATE_PERCENT_PER_WEEK,
      startDate: asOf,
    }),
    notes,
  };
}

/**
 * 计划的起步能量。
 *   减重：RER(目标体重) × 1.0
 *   增重：维持需求 × 1.10
 */
export function resolvePlanEnergy(input: {
  direction: WeightGoalDirection;
  targetWeightKg: number;
  maintenanceKcal: number;
}): number {
  if (input.direction === WeightGoalDirection.LOSS) {
    return Math.round(calculateRerForWeight(input.targetWeightKg) * LOSS_START_RER_FACTOR);
  }
  return Math.round(input.maintenanceKcal * GAIN_START_FACTOR);
}

/** 安全边界：减重卡下限、增重卡上限，另一侧一律不得超过维持量 */
export function resolvePlanSafeguards(input: {
  direction: WeightGoalDirection;
  targetWeightKg: number;
  maintenanceKcal: number;
}): { floorKcal: number; ceilingKcal: number } {
  if (input.direction === WeightGoalDirection.LOSS) {
    return {
      floorKcal: Math.round(
        calculateRerForWeight(input.targetWeightKg) * LOSS_FLOOR_RER_FACTOR,
      ),
      // 减重期间绝不超过维持量 —— 超了就不是减重了
      ceilingKcal: Math.round(input.maintenanceKcal),
    };
  }
  return {
    // 增重期间绝不低于维持量
    floorKcal: Math.round(input.maintenanceKcal),
    ceilingKcal: Math.round(input.maintenanceKcal * GAIN_CEILING_FACTOR),
  };
}

/**
 * 预计达标日。
 *
 * 按体重**每周等比变化**推算（W(t) = W0 × (1 ± r)^t），
 * 所以用对数解而不是线性除法 —— 越接近目标，每周掉的绝对值越少，
 * 线性估算会系统性偏乐观。
 */
export function resolveEstimatedGoalDate(input: {
  currentWeightKg: number;
  targetWeightKg: number;
  targetRatePercentPerWeek: number;
  startDate: Date;
}): Date | null {
  const { currentWeightKg, targetWeightKg, targetRatePercentPerWeek, startDate } = input;

  if (
    !Number.isFinite(currentWeightKg) ||
    !Number.isFinite(targetWeightKg) ||
    currentWeightKg <= 0 ||
    targetWeightKg <= 0 ||
    targetWeightKg === currentWeightKg
  ) {
    return null;
  }

  const rate = Math.abs(targetRatePercentPerWeek) / 100;
  if (!Number.isFinite(rate) || rate <= 0 || rate >= 1) {
    return null;
  }

  const weeklyRatio = targetWeightKg < currentWeightKg ? 1 - rate : 1 + rate;
  const weeks =
    Math.log(targetWeightKg / currentWeightKg) / Math.log(weeklyRatio);

  if (!Number.isFinite(weeks) || weeks <= 0) {
    return null;
  }
  // 给个上限，避免速率极小时算出几十年后
  if (weeks > 520) {
    return null;
  }

  return addDays(startDate, Math.round(weeks * 7));
}

// ==================== 自动校正 ====================

/**
 * 实测速率（%/周）。
 *
 * **按体重变化方向带符号：掉重为负、增重为正** —— 与顾客看到的口径一致。
 * 间隔为 0 或体重非法时返回 null（宁可不动，也不要按脏数据调热量）。
 */
export function calculateRatePercentPerWeek(input: {
  previousWeightKg: number;
  currentWeightKg: number;
  elapsedDays: number;
}): number | null {
  const { previousWeightKg, currentWeightKg, elapsedDays } = input;

  if (
    !Number.isFinite(previousWeightKg) ||
    !Number.isFinite(currentWeightKg) ||
    previousWeightKg <= 0 ||
    !Number.isFinite(elapsedDays) ||
    elapsedDays <= 0
  ) {
    return null;
  }

  const weeks = elapsedDays / 7;
  return round(((currentWeightKg - previousWeightKg) / previousWeightKg / weeks) * 100, 2);
}

/** 把带符号速率换算成「朝目标推进的速率」（正数 = 在往目标走） */
export function resolveProgressRate(
  direction: WeightGoalDirection,
  signedRatePercentPerWeek: number,
): number {
  return direction === WeightGoalDirection.LOSS
    ? -signedRatePercentPerWeek
    : signedRatePercentPerWeek;
}

export type CorrectionAction =
  /** 在目标区间内，保持 */
  | 'HOLD'
  /** 推进太慢 → 力度加一档（减重降能量 / 增重升能量） */
  | 'MORE_AGGRESSIVE'
  /** 推进太快 → 力度退一档（朝维持量靠） */
  | 'LESS_AGGRESSIVE'
  /** 想加力度但已撞到安全边界 → 不再调整 */
  | 'BLOCKED';

export interface CorrectionResult {
  action: CorrectionAction;
  nextKcal: number;
  /** 需要写进调整历史的原因；HOLD 时为 null */
  reason: WeightGoalAdjustmentReason | null;
  note: string;
}

/**
 * 自动校正（触点 4 / 设计文档第四节）。
 *
 * 每次顾客称重后调用。三条规则：
 *   推进慢于 0.5%/周 → 加力度一档（15%）
 *   在 0.5-2%/周 区间 → 保持，复查间隔放宽
 *   快于 2%/周       → 退力度一档（10%），减太快会掉肌肉
 *
 * 撞到安全边界就不再调整，返回 BLOCKED（写一条 FLOOR_REACHED 历史，让后台看得到）。
 */
export function resolveCorrection(input: {
  direction: WeightGoalDirection;
  progressRatePercentPerWeek: number;
  currentKcal: number;
  floorKcal: number;
  ceilingKcal: number;
}): CorrectionResult {
  const {
    direction,
    progressRatePercentPerWeek: rate,
    currentKcal,
    floorKcal,
    ceilingKcal,
  } = input;

  const isLoss = direction === WeightGoalDirection.LOSS;

  if (
    !Number.isFinite(rate) ||
    (rate >= TARGET_RATE_MIN_PERCENT_PER_WEEK &&
      rate <= TARGET_RATE_MAX_PERCENT_PER_WEEK)
  ) {
    return {
      action: 'HOLD',
      nextKcal: currentKcal,
      reason: null,
      note: Number.isFinite(rate)
        ? `推进速率 ${round(rate, 2)}%/周，在目标区间内，保持当前能量`
        : '缺少有效的速率数据，保持当前能量',
    };
  }

  if (rate < TARGET_RATE_MIN_PERCENT_PER_WEEK) {
    // 加力度：减重降能量、增重升能量
    if (isLoss && currentKcal <= floorKcal) {
      return {
        action: 'BLOCKED',
        nextKcal: currentKcal,
        reason: WeightGoalAdjustmentReason.FLOOR_REACHED,
        note: '已到安全下限，不再继续下调；建议由营养师评估',
      };
    }
    if (!isLoss && currentKcal >= ceilingKcal) {
      return {
        action: 'BLOCKED',
        nextKcal: currentKcal,
        reason: WeightGoalAdjustmentReason.FLOOR_REACHED,
        note: '已到安全上限，不再继续上调；建议先排查是否有其他原因',
      };
    }

    const raw = isLoss
      ? currentKcal * (1 - SLOW_ADJUST_RATIO)
      : currentKcal * (1 + SLOW_ADJUST_RATIO);
    const nextKcal = isLoss
      ? Math.max(Math.round(raw), floorKcal)
      : Math.min(Math.round(raw), ceilingKcal);

    return {
      action: 'MORE_AGGRESSIVE',
      nextKcal,
      reason: WeightGoalAdjustmentReason.RATE_TOO_SLOW,
      note: `推进速率仅 ${round(rate, 2)}%/周，低于 ${TARGET_RATE_MIN_PERCENT_PER_WEEK}%/周，力度加一档`,
    };
  }

  // 快于上限 → 退力度（朝维持量靠）
  const raw = isLoss
    ? currentKcal * (1 + FAST_ADJUST_RATIO)
    : currentKcal * (1 - FAST_ADJUST_RATIO);
  const nextKcal = isLoss
    ? Math.min(Math.round(raw), ceilingKcal)
    : Math.max(Math.round(raw), floorKcal);

  return {
    action: 'LESS_AGGRESSIVE',
    nextKcal,
    reason: WeightGoalAdjustmentReason.RATE_TOO_FAST,
    note: `推进速率 ${round(rate, 2)}%/周，快于 ${TARGET_RATE_MAX_PERCENT_PER_WEEK}%/周，力度退一档（减太快会掉肌肉）`,
  };
}

// ==================== 手动调整 ====================

export interface ManualTargetChangeResult {
  /** 落库用的目标体重（已按方向做合理性收敛） */
  targetWeightKg: number;
  kcal: number;
  floorKcal: number;
  ceilingKcal: number;
  /** 需要提示顾客的话（不拦截） */
  notes: string[];
}

/**
 * 顾客手动改目标体重（触点「调整计划」）。
 *
 * **完全自由可调，不做「只能更温和」的限制**（老板决定：系统算出的目标体重
 * 本身有不确定性，权限交还顾客）。安全由能量下限与自动校正负责。
 *
 * 唯一保留的是三道护栏：
 *   1. 偏离系统建议 >30% → 提示一次（不拦）
 *   2. 能量下限/上限照旧夹紧
 *   3. 自动校正继续跑（掉太快会被拉回来）
 */
export function applyManualTargetWeight(input: {
  direction: WeightGoalDirection;
  newTargetWeightKg: number;
  suggestedTargetWeightKg: number;
  currentWeightKg: number;
  maintenanceKcal: number;
}): ManualTargetChangeResult | null {
  const { direction, newTargetWeightKg, suggestedTargetWeightKg, currentWeightKg, maintenanceKcal } =
    input;

  if (!Number.isFinite(newTargetWeightKg) || newTargetWeightKg <= 0) {
    return null;
  }

  const notes: string[] = [];
  const targetWeightKg = round(newTargetWeightKg, 2);

  if (
    Number.isFinite(suggestedTargetWeightKg) &&
    suggestedTargetWeightKg > 0 &&
    Number.isFinite(currentWeightKg) &&
    currentWeightKg > 0
  ) {
    const diff = Math.abs(targetWeightKg - currentWeightKg) / currentWeightKg;
    if (diff > TARGET_DEVIATION_WARN_RATIO) {
      notes.push('这个目标与当前体重相差超过 30%，偏离较大，建议确认后再继续');
    }
    if (diff < MIN_GOAL_CHANGE_RATIO) {
      notes.push('这个目标与当前体重只差不到 5%，变化太小、难以有效监测');
    }
  }

  const safeguards = resolvePlanSafeguards({
    direction,
    targetWeightKg,
    maintenanceKcal,
  });

  // 改目标后能量按同一口径重算，再夹进安全区间
  const raw = resolvePlanEnergy({ direction, targetWeightKg, maintenanceKcal });
  const kcal = Math.min(
    Math.max(raw, safeguards.floorKcal),
    safeguards.ceilingKcal,
  );

  return {
    targetWeightKg,
    kcal,
    floorKcal: safeguards.floorKcal,
    ceilingKcal: safeguards.ceilingKcal,
    notes,
  };
}

// ==================== 状态流转 ====================

/** 是否已达标：减重到目标及以下 / 增重到目标及以上 */
export function isGoalReached(input: {
  direction: WeightGoalDirection;
  currentWeightKg: number;
  targetWeightKg: number;
}): boolean {
  const { direction, currentWeightKg, targetWeightKg } = input;
  if (!Number.isFinite(currentWeightKg) || !Number.isFinite(targetWeightKg)) {
    return false;
  }
  return direction === WeightGoalDirection.LOSS
    ? currentWeightKg <= targetWeightKg
    : currentWeightKg >= targetWeightKg;
}

/** 连续 8 周没称重 → 该转暂停了 */
export function shouldPauseForInactivity(input: {
  lastWeighInDate: Date | null | undefined;
  asOf?: Date;
}): boolean {
  const asOf = input.asOf ?? new Date();
  const last = input.lastWeighInDate;
  if (!(last instanceof Date) || Number.isNaN(last.getTime())) {
    return false;
  }
  const weeks = (asOf.getTime() - last.getTime()) / (MS_PER_DAY * 7);
  return weeks >= INACTIVITY_PAUSE_WEEKS;
}

/** 维持期满 3 个月 → 自动结束 */
export function shouldCompleteMaintenance(input: {
  maintenanceStartedAt: Date | null | undefined;
  asOf?: Date;
}): boolean {
  const asOf = input.asOf ?? new Date();
  const startedAt = input.maintenanceStartedAt;
  if (!(startedAt instanceof Date) || Number.isNaN(startedAt.getTime())) {
    return false;
  }
  const days = (asOf.getTime() - startedAt.getTime()) / MS_PER_DAY;
  return days >= MAINTENANCE_DURATION_MONTHS * 30.4375;
}

/** 下次复查日 = 今天 + 复查间隔（在目标区间内时放宽） */
export function resolveNextReviewDate(input: {
  from: Date;
  /** 速率是否在目标区间内 */
  onTrack: boolean;
}): Date {
  const weeks = input.onTrack
    ? REVIEW_INTERVAL_ON_TRACK_WEEKS
    : REVIEW_INTERVAL_WEEKS;
  return addDays(input.from, Math.round(weeks * 7));
}

// ==================== 增重前的站内排查（B1-8） ====================

export interface WeightGainScreeningQuestion {
  key: string;
  title: string;
  /** 选「是」是否构成危险信号 */
  isDangerSignal: boolean;
}

/**
 * 增重前的 5 个问题。
 *
 * 前 3 项任一为「是」→ 提示就医，**不进入增重方案**（兽医提醒白名单第 1 类：疑似疾病信号）。
 * 后 2 项只是背景信息，不影响是否放行。
 */
export const WEIGHT_GAIN_SCREENING_QUESTIONS: WeightGainScreeningQuestion[] = [
  { key: 'losing_weight', title: '最近体重是否还在持续下降？', isDangerSignal: true },
  { key: 'poor_appetite', title: '食欲是否明显变差？', isDangerSignal: true },
  { key: 'vomiting_diarrhea', title: '最近有没有呕吐或腹泻？', isDangerSignal: true },
  { key: 'dewormed_on_schedule', title: '驱虫是否按时做了？', isDangerSignal: false },
  { key: 'changed_food', title: '最近是否换过狗粮？', isDangerSignal: false },
];

export interface WeightGainScreeningResult {
  /** 是否出现危险信号（出现就不该进增重方案，先就医） */
  needsVet: boolean;
  /** 命中的危险信号问题（给顾客看的原文） */
  dangerReasons: string[];
}

export function evaluateWeightGainScreening(
  answers: Record<string, boolean | undefined>,
): WeightGainScreeningResult {
  const dangerReasons = WEIGHT_GAIN_SCREENING_QUESTIONS.filter(
    (q) => q.isDangerSignal && answers?.[q.key] === true,
  ).map((q) => q.title);

  return { needsVet: dangerReasons.length > 0, dangerReasons };
}
