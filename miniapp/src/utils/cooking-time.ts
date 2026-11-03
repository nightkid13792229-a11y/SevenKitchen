/**
 * 鲜食烹饪时间（按每袋分装重量）。
 *
 * 2026-11-03 老板定的口径：
 *   ≤150g        蒸/炖 约10分钟，低温慢煮 30分钟
 *   151–250g     蒸/炖 约15分钟，低温慢煮 45分钟
 *   251–400g     蒸/炖 约20分钟，低温慢煮 60分钟
 *   401–600g     蒸/炖 约25分钟，低温慢煮 90分钟
 *   >600g        不给固定时间，只给判定标准
 *
 * 这个模块不依赖任何页面，订单详情现在用它；生产标签以后可以直接复用，
 * 避免标签和页面各维护一套时间表。
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

/** 出锅 / 出浴判定标准（页面与标签共用同一段文案） */
export const COOKING_TIME_JUDGEMENT =
  '由于火力不一致，烹饪时间可能有误差。蒸和炖的出锅判定标准为——鲜食中心没有可见血水。低温慢煮的出浴判定标准为——食物中心温度达到 65℃ 后 1 分钟。';

const TIERS: Array<{ max: number; times: CookingTimes }> = [
  { max: 150, times: { steam: 10, stew: 10, sousvide: 30 } },
  { max: 250, times: { steam: 15, stew: 15, sousvide: 45 } },
  { max: 400, times: { steam: 20, stew: 20, sousvide: 60 } },
  { max: 600, times: { steam: 25, stew: 25, sousvide: 90 } },
];

/**
 * 按每袋克重取烹饪时间。
 *
 * @returns 超过 600g、重量不合法或为 0 时返回 null（页面只显示判定标准）
 */
export function getCookingTimes(weightPerBagG: number | null | undefined): CookingTimes | null {
  const weight = Number(weightPerBagG);
  if (!Number.isFinite(weight) || weight <= 0) {
    return null;
  }
  for (const tier of TIERS) {
    if (weight <= tier.max) {
      return { ...tier.times };
    }
  }
  return null;
}

export interface CookingTimeLabels {
  steam: string;
  stew: string;
  sousvide: string;
}

/**
 * 转成页面/标签直接可用的文案：
 *   蒸、炖 → 「约 20 分钟」
 *   低温慢煮 → 「60 分钟」
 */
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

/** 是否属于「超重、不给固定时间」的情况 */
export function isCookingTimeOverLimit(weightPerBagG: number | null | undefined): boolean {
  const weight = Number(weightPerBagG);
  return Number.isFinite(weight) && weight > COOKING_TIME_MAX_WEIGHT_G;
}
