/**
 * 售价圆整
 *
 * 试吃装按成本算出来的价格天然带小数（例如 ¥137.4832…），
 * 直接对外展示既不像零售价，也让顾客难以判断。
 * 圆整规则由后台「试吃装设置」控制，运营可随时调整。
 *
 * 注意：圆整只作用于**对外售价**，不改变成本核算口径。
 */

export enum PriceRoundingMode {
  /** 不圆整，保留两位小数 */
  NONE = 'NONE',
  /** 向上进位到 0.1 元 */
  CEIL_TO_0_1 = 'CEIL_TO_0_1',
  /** 向上进位到 0.5 元 */
  CEIL_TO_0_5 = 'CEIL_TO_0_5',
  /** 向上进位到 1 元 */
  CEIL_TO_1 = 'CEIL_TO_1',
}

const ROUNDING_STEPS: Record<PriceRoundingMode, number | null> = {
  [PriceRoundingMode.NONE]: null,
  [PriceRoundingMode.CEIL_TO_0_1]: 0.1,
  [PriceRoundingMode.CEIL_TO_0_5]: 0.5,
  [PriceRoundingMode.CEIL_TO_1]: 1,
};

/**
 * 按规则圆整售价。
 *
 * - 一律**向上**取整（宁可多收一毛，不少收，避免出现"算出来 0.9999 实收 1.00"的负数毛利）
 * - 传入非法值直接抛错，不静默返回 0
 */
export function applyPriceRounding(
  value: number,
  mode: PriceRoundingMode,
): number {
  if (!Number.isFinite(value)) {
    throw new Error(`applyPriceRounding 收到非法金额: ${value}`);
  }

  const step = ROUNDING_STEPS[mode];
  if (step === null || step === undefined) {
    return Math.round(value * 100) / 100;
  }

  // 先消掉浮点尾差（0.1 的倍数在二进制里不精确），再向上取整
  const steps = Math.ceil(Number((value / step).toFixed(6)));
  return Math.round(steps * step * 100) / 100;
}
