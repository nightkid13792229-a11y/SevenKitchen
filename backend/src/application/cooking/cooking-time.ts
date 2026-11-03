/**
 * 鲜食烹饪时间 —— 全系统唯一真源（2026-11-03 老板定）。
 *
 * 生产标签（70×100mm）和顾客端鲜食订单详情页都从这里取数，
 * 客户端不再维护自己的时间表，避免两边各说各的。
 *
 * 口径：按「每袋实际克重」分档
 *   ≤150g      蒸/炖 约 10 分钟，低温慢煮 30 分钟
 *   151–250g   约 15 分钟，45 分钟
 *   251–400g   约 20 分钟，60 分钟
 *   401–600g   约 25 分钟，90 分钟
 *   >600g      不给固定时间，只给判定标准
 */

export interface CookingTimes {
  /** 蒸，分钟 */
  steam: number;
  /** 炖，分钟 */
  stew: number;
  /** 低温慢煮，分钟 */
  sousvide: number;
}

/** 超过这个重量就不给固定时间，只给判定标准 */
export const COOKING_TIME_MAX_WEIGHT_G = 600;

/** 顾客端（订单详情页）的判定标准文案 */
export const COOKING_TIME_JUDGEMENT =
  '由于火力不一致，烹饪时间可能有误差。蒸和炖的出锅判定标准为——鲜食中心没有可见血水。低温慢煮的出浴判定标准为——食物中心温度达到 65℃ 后 1 分钟。';

/** 标签（70×100mm）空间有限，超重时只印这一句 */
export const COOKING_LABEL_JUDGEMENT =
  '蒸/炖：食物中心无可见血水即可；低温慢煮：食物中心达65℃后1分钟即可。';

const TIERS: ReadonlyArray<{ maxG: number; times: CookingTimes }> = [
  { maxG: 150, times: { steam: 10, stew: 10, sousvide: 30 } },
  { maxG: 250, times: { steam: 15, stew: 15, sousvide: 45 } },
  { maxG: 400, times: { steam: 20, stew: 20, sousvide: 60 } },
  { maxG: 600, times: { steam: 25, stew: 25, sousvide: 90 } },
];

/** 按每袋克重取时间；超重、重量不合法或为 0 时返回 null */
export function getCookingTimes(
  weightPerBagG: number | null | undefined,
): CookingTimes | null {
  const weight = Number(weightPerBagG);
  if (!Number.isFinite(weight) || weight <= 0) {
    return null;
  }
  for (const tier of TIERS) {
    if (weight <= tier.maxG) {
      return { ...tier.times };
    }
  }
  return null;
}

/** 是否属于「超重、不给固定时间」的情况 */
export function isOverLimit(
  weightPerBagG: number | null | undefined,
): boolean {
  const weight = Number(weightPerBagG);
  return Number.isFinite(weight) && weight > COOKING_TIME_MAX_WEIGHT_G;
}

export interface CookingTimeLabels {
  steam: string;
  stew: string;
  sousvide: string;
}

/** 文案口径：蒸、炖 → 「约 20 分钟」；低温慢煮 → 「60 分钟」 */
export function formatCookingTimes(
  weightPerBagG: number | null | undefined,
): CookingTimeLabels | null {
  const times = getCookingTimes(weightPerBagG);
  if (!times) {
    return null;
  }
  return {
    steam: `约 ${times.steam} 分钟`,
    stew: `约 ${times.stew} 分钟`,
    sousvide: `${times.sousvide} 分钟`,
  };
}

export interface CookingAdvice {
  /** 每袋克重（页面显示「按每袋 xxx g 计算」） */
  weightPerBagG: number;
  /** 超重：不给固定时间，只给判定标准 */
  overLimit: boolean;
  steam: string | null;
  stew: string | null;
  sousvide: string | null;
  /** 判定标准（顾客端口径） */
  judgement: string;
}

/**
 * 从订单条目里取「每袋克重」：有分装明细取第一档，没有就退回 packageSpecG。
 * 口径与顾客端订单详情页完全一致（多规格只看第一档）。
 */
export function pickWeightPerBagG(
  items:
    | Array<{
        packageSpecG?: number | null;
        packagePlan?: Array<{ packageSpecG?: number | null }> | null;
      }>
    | null
    | undefined,
): number {
  const first = (items || [])[0];
  if (!first) {
    return 0;
  }
  const plan = Array.isArray(first.packagePlan) ? first.packagePlan : [];
  const fromPlan = Number(plan[0]?.packageSpecG);
  if (Number.isFinite(fromPlan) && fromPlan > 0) {
    return Math.round(fromPlan);
  }
  const fallback = Number(first.packageSpecG);
  return Number.isFinite(fallback) && fallback > 0 ? Math.round(fallback) : 0;
}

/**
 * 订单详情页/标签共用的烹饪建议。
 * 拿不到每袋重量（没有分装信息）时返回 null，页面走「暂未获取」分支。
 */
export function buildCookingAdvice(
  weightPerBagG: number | null | undefined,
): CookingAdvice | null {
  const weight = Number(weightPerBagG);
  if (!Number.isFinite(weight) || weight <= 0) {
    return null;
  }
  const labels = formatCookingTimes(weight);
  return {
    weightPerBagG: Math.round(weight),
    overLimit: labels === null,
    steam: labels?.steam ?? null,
    stew: labels?.stew ?? null,
    sousvide: labels?.sousvide ?? null,
    judgement: COOKING_TIME_JUDGEMENT,
  };
}

/** 订单详情接口用：从订单（含条目）算出烹饪建议 */
export function buildCookingAdviceForOrder(
  order:
    | {
        items?: Array<{
          packageSpecG?: number | null;
          packagePlan?: Array<{ packageSpecG?: number | null }> | null;
        }> | null;
      }
    | null
    | undefined,
): CookingAdvice | null {
  return buildCookingAdvice(pickWeightPerBagG(order?.items));
}
