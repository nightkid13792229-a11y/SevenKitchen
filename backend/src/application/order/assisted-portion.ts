/**
 * 代客下单的饭量与分装建议（纯计算）。
 *
 * 为什么单独一个文件：`OrderService` 里算饭量的链路要读狗狗、读食谱、
 * 还要处理体重管理计划，很重；而"1 袋 = 1 顿""最低 1000g"这两条是
 * 纯算术，把它们拎出来才能被直接盯住，也免得代客单和顾客端各算一套。
 */

/** 成品鲜食的最低订购量（与顾客端 `usePackagePlan` 同一口径） */
export const MIN_ASSISTED_ORDER_G = 1000;

export interface PortionPreview {
  dailyIntakeG: number;
  perMealIntakeG: number;
  mealsPerDay: number;
  days: number;
  totalG: number;
  suggestedPackagePlan: Array<{ packageSpecG: number; packageCount: number }>;
  minOrderG: number;
}

export interface BuildPortionPreviewInput {
  dailyIntakeG: number;
  mealsPerDay: number;
  days: number;
  minOrderG?: number;
}

/**
 * 把"每天吃多少克"折算成员工下单时要填的一组数。
 *
 * 默认分装口径是 **1 袋 = 1 顿**：每袋就是一顿的量，袋数 = 天数 × 餐次。
 * 这样员工在现场照着填，跟顾客自己下单得到的分装是一致的。
 *
 * 注意：**这里不替调用方抬天数**。总量不足最低订购量时，返回的
 * `totalG` 会小于 `minOrderG`，由页面提示并决定抬到几天 —— 后端定价
 * 会硬校验 1000g，静默凑数只会让人不知道单子为什么被拒。
 */
export function buildPortionPreview(
  input: BuildPortionPreviewInput,
): PortionPreview {
  const dailyIntakeG = Number(input?.dailyIntakeG);
  const mealsPerDay = Number(input?.mealsPerDay);
  const days = Number(input?.days);
  const minOrderG = Number(input?.minOrderG ?? MIN_ASSISTED_ORDER_G);

  if (!Number.isFinite(dailyIntakeG) || dailyIntakeG <= 0) {
    throw new Error('缺少有效的每日克数，无法计算饭量');
  }
  if (!Number.isFinite(mealsPerDay) || mealsPerDay < 1) {
    throw new Error('每天餐次不合法');
  }
  if (!Number.isFinite(days) || days < 1) {
    throw new Error('订购天数不合法');
  }

  const perMealIntakeG = Math.round(dailyIntakeG / mealsPerDay);

  return {
    dailyIntakeG: Math.round(dailyIntakeG),
    perMealIntakeG,
    mealsPerDay,
    days,
    totalG: Math.round(dailyIntakeG * days),
    suggestedPackagePlan: [
      { packageSpecG: perMealIntakeG, packageCount: days * mealsPerDay },
    ],
    minOrderG,
  };
}
