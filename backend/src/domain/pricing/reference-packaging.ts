/**
 * 参考价的"标准分装"。
 *
 * 为什么单独抽出来：参考价是一个**假设订单**——没有狗狗档案，就不知道该按
 * 每餐多少克分装。2026-11-07 拍板统一按 100g/袋（1kg = 10 袋）计算，
 * 让这个展示数字可复现、也接近真实首单（实测与 7 天单只差 0.1%）。
 *
 * 只影响展示用的参考价；真实订单仍按顾客自己填的分装算钱。
 */

/** 参考价的"标准袋"规格：每袋 100g。 */
export const REFERENCE_PACK_SPEC_G = 100;

/**
 * 参考价按标准袋分装时一共几袋。
 *
 * 非有限值 / 非正数一律退化为 1 袋，避免除零或 Infinity；
 * 起订量不是整百时四舍五入（1250g → 13 袋，包材略高估半袋，不影响分位精度）。
 */
export function resolveReferencePackCount(
  totalWeightG: number,
  packSpecG: number = REFERENCE_PACK_SPEC_G,
): number {
  if (!Number.isFinite(totalWeightG) || totalWeightG <= 0) {
    return 1;
  }

  if (!Number.isFinite(packSpecG) || packSpecG <= 0) {
    return 1;
  }

  return Math.max(1, Math.round(totalWeightG / packSpecG));
}
