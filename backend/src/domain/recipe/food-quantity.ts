/**
 * 食材用量内核
 *
 * 一条公式，三处共用（定价、采购、成本核算）：
 *
 *   归一配比 = 该食材配比 ÷ 食材配比合计 × 100
 *   净需求   = 订单净重 × 归一配比
 *   毛需求   = 净需求 ÷ 出成率 × 配方损耗率   ← 采购按这个买
 *   只含损耗 = 净需求 × 配方损耗率
 *
 * 为什么要抽出来：这三步原先只存在于定价内部，采购再从定价快照里取值。
 * 一旦有第二条链路（比如重做单没有定价快照）需要同样的数，就只能再抄一遍。
 * 抽成纯函数后，任何一条链路都调用它，口径不会再分叉。
 *
 * ⚠️ 本函数的运算顺序与定价原实现逐行一致（先乘净重再除出成率），
 * 以免扰动既有价格。改动后必须跑 tests/domain/pricing/pricing-characterization.spec.ts。
 */

export interface FoodQuantityInput {
  /** 配方明细行 id（同一食材可能出现多次，不能按 ingredientId 合并） */
  itemId: string;
}

export interface FoodQuantityLine {
  itemId: string;
  /** 归一后的食材配比（食材内部占比，合计 100） */
  normalizedRatioPercent: number;
  /** 净需求（kg），不含损耗与出成率 */
  netKg: number;
  /** 毛需求（kg），含出成率与配方损耗率 */
  grossKg: number;
  /** 只含配方损耗率的用量（kg） */
  purchaseKg: number;
}

export interface BuildFoodQuantityTableInput {
  items: FoodQuantityInput[];
  /** 订单/配方的净重（g） */
  totalNetWeightG: number;
  /** 配方损耗率系数（1.05 = 5%） */
  lossRate: number;
  /** 每行食材的出成率；缺省按 1 处理 */
  yieldRateByItemId: Map<string, number>;
  /** 每行食材的配比（百分比），可直接取自配方明细或快照 */
  ratioPercentByItemId: Map<string, number | null | undefined>;
}

/** 归一配比的合计（只统计正数配比） */
export function sumPositiveRatios(values: Array<number | null | undefined>) {
  return values.reduce<number>((sum, value) => {
    const ratio = Number(value);
    return Number.isFinite(ratio) && ratio > 0 ? sum + ratio : sum;
  }, 0);
}

/**
 * 生成食材用量表（按配方明细行 id 索引）。
 * 配比合计为 0 时返回空表 —— 调用方应视为「无食材」而不是除以 0。
 */
export function buildFoodQuantityTable(
  input: BuildFoodQuantityTableInput,
): Map<string, FoodQuantityLine> {
  const { items, totalNetWeightG, lossRate } = input;
  const result = new Map<string, FoodQuantityLine>();

  const foodRatioTotalPercent = sumPositiveRatios(
    items.map((item) => input.ratioPercentByItemId.get(item.itemId)),
  );
  if (!Number.isFinite(foodRatioTotalPercent) || foodRatioTotalPercent <= 0) {
    return result;
  }

  const safeLossRate =
    Number.isFinite(lossRate) && lossRate > 0 ? lossRate : 1;
  const safeTotalNetWeightG =
    Number.isFinite(totalNetWeightG) && totalNetWeightG > 0
      ? totalNetWeightG
      : 0;

  for (const item of items) {
    const rawRatio = Number(input.ratioPercentByItemId.get(item.itemId));
    const normalizedRatioPercent =
      Number.isFinite(rawRatio) && rawRatio > 0
        ? (rawRatio / foodRatioTotalPercent) * 100
        : 0;
    if (normalizedRatioPercent <= 0) continue;

    // 与定价原实现同一运算顺序（kg 口径，先净需求、再除出成率、乘损耗）
    const totalNetWeightKg = safeTotalNetWeightG / 1000.0;
    const netKg = totalNetWeightKg * (normalizedRatioPercent / 100.0);
    const rawYield = Number(input.yieldRateByItemId.get(item.itemId));
    const yieldRate = Number.isFinite(rawYield) && rawYield > 0 ? rawYield : 1;
    const grossKg = (netKg / yieldRate) * safeLossRate;
    const purchaseKg = netKg * safeLossRate;

    result.set(item.itemId, {
      itemId: item.itemId,
      normalizedRatioPercent,
      netKg,
      grossKg,
      purchaseKg,
    });
  }

  return result;
}
