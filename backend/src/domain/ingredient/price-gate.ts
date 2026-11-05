/**
 * 原料价格的写入闸（2026-11-06「单一来源」改造 · 阶段 A）
 *
 * 背景：价格原来有两条实现 —— 写入时由报销审批写一次，读取时又由
 * `IngredientPriceBasisService` 按四档来源重新推导一次。两条实现同一套规则，
 * 一旦分叉就会出现「档案价和算价用的价不是同一个」。
 *
 * 改造后：**价格只在写入时确定**，读取时一律读档案价。本文件是写入侧唯一的判断点。
 *
 * 三道闸（顺序不能换，先拦离谱的，再拦波动大的）：
 *   ① 必须为正        —— 0 元 / 负数一律拒绝（历史上有 0 元价被自动写入过）
 *   ② 不得离谱        —— 与基准价相差超过 5 倍或小于 1/5，拒绝并说明倍数
 *   ③ 波动可控        —— 与基准价相差超过阈值（默认 8%）则挂起，等人工确认
 *
 * 基准价（anchor）由调用方给出：该原料**历史采购价的中位数**；
 * 没有任何历史时退回「上一次生效价」；两者都没有（首次定价）则直接放行。
 *
 * ⚠️ 纯函数，无依赖、无 IO。改这里必须跑 `tests/domain/ingredient/price-gate.spec.ts`。
 */

export type PriceGateAction = 'APPLY' | 'HOLD' | 'REJECT';

export interface PriceGateInput {
  /** 本次想写入的单价（元 / 采购单位） */
  proposedPrice: number;
  /** 基准价（元 / 采购单位）。null / 0 表示没有可用基准 */
  anchorPrice: number | null | undefined;
  /** 自动生效阈值，0.08 = 8% */
  thresholdRate: number;
  /** 离谱判定倍数，默认 5 */
  hardLimitMultiple?: number;
}

export interface PriceGateResult {
  action: PriceGateAction;
  /** 不通过时的原因；通过时为 null */
  reason: string | null;
  /** 相对基准的变动率；没有基准时为 null */
  deltaRate: number | null;
  /** 相对基准的倍数；没有基准时为 null */
  multiple: number | null;
}

/** 默认「离谱」倍数：与基准价相差 5 倍以上就不写库 */
export const DEFAULT_HARD_LIMIT_MULTIPLE = 5;

function formatPrice(value: number): string {
  return Number.isFinite(value) ? value.toFixed(6).replace(/0+$/, '').replace(/\.$/, '') : String(value);
}

export function evaluatePriceGate(input: PriceGateInput): PriceGateResult {
  const hardLimit = Number(input.hardLimitMultiple);
  const limit =
    Number.isFinite(hardLimit) && hardLimit > 1
      ? hardLimit
      : DEFAULT_HARD_LIMIT_MULTIPLE;

  // ① 必须为正
  const proposed = Number(input.proposedPrice);
  if (!Number.isFinite(proposed) || proposed <= 0) {
    return {
      action: 'REJECT',
      reason: '单价必须大于 0',
      deltaRate: null,
      multiple: null,
    };
  }

  const anchor = Number(input.anchorPrice);
  if (
    input.anchorPrice === null ||
    input.anchorPrice === undefined ||
    !Number.isFinite(anchor) ||
    anchor <= 0
  ) {
    // 首次定价：没有基准就没有可比对象，直接放行
    return { action: 'APPLY', reason: null, deltaRate: null, multiple: null };
  }

  const deltaRate = (proposed - anchor) / anchor;
  const multiple = proposed / anchor;

  // ② 不得离谱
  if (multiple > limit || multiple < 1 / limit) {
    return {
      action: 'REJECT',
      reason: `拟定价 ${formatPrice(proposed)} 是基准价 ${formatPrice(anchor)} 的 ${multiple.toFixed(2)} 倍，疑似单位或数量录错`,
      deltaRate,
      multiple,
    };
  }

  // ③ 波动可控
  // 容差是必要的：1.08 / 1 在浮点下是 0.08000000000000002，
  // 不放容差会让「正好 8%」被判成超阈值，边界行为不可预测。
  const threshold = Number(input.thresholdRate);
  const tolerance = 1e-9;
  if (
    Number.isFinite(threshold) &&
    threshold >= 0 &&
    Math.abs(deltaRate) - threshold > tolerance
  ) {
    const percent = (deltaRate * 100).toFixed(1);
    const thresholdPercent = (threshold * 100).toFixed(0);
    return {
      action: 'HOLD',
      reason: `价格变动 ${percent}%，超过自动生效阈值 ${thresholdPercent}%`,
      deltaRate,
      multiple,
    };
  }

  return { action: 'APPLY', reason: null, deltaRate, multiple };
}
