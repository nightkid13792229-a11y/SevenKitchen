/**
 * 运费分摊（2026-11-07 合并 / 拆包发货）。
 *
 * 规则（老板 2026-11-07 拍板）：
 *   · 按**净重占比**分，不用均摊；
 *   · 每个包裹单独分，再把订单在各包裹拿到的份额相加；
 *   · 零头落在「按重量从大到小、同重量按订单 id」排序后的**最后一单**上，
 *     保证各单相加精确等于实付运费（一分不差）。
 *
 * 全程用「分」做整数运算，避免 0.1 + 0.2 !== 0.3 这种浮点问题。
 */

export interface AllocationItemInput {
  orderId: string;
  weightG: number;
}

export interface AllocationPackageInput {
  /** 这个包裹实付的运费（元） */
  totalFee: number;
  items: AllocationItemInput[];
}

export interface AllocationItemResult {
  orderId: string;
  weightG: number;
  /** 这单从这个包裹分到的运费（元，两位小数） */
  allocatedFee: number;
}

export interface AllocationPackageResult {
  totalFee: number;
  totalWeightG: number;
  items: AllocationItemResult[];
}

export interface AllocationResult {
  packages: AllocationPackageResult[];
  /** 订单 → 这票里一共分到多少运费（元，两位小数） */
  orderTotals: Record<string, number>;
}

/** 把元换成整数分，顺手挡掉脏数字 */
export function toCents(amount: number): number {
  return Math.round(Number(amount) * 100);
}

/**
 * 一个包裹内部分摊。
 *
 * 例：fee 20.00，A 1.54kg、B 2.64kg
 *   → A 7.37、B 12.63（合计正好 20.00）
 */
export function allocatePackageFee(
  totalFee: number,
  items: AllocationItemInput[],
): AllocationItemResult[] {
  if (items.length === 0) {
    return [];
  }

  const totalCents = toCents(totalFee);
  const totalWeight = items.reduce(
    (sum, item) => sum + Math.max(0, Math.floor(item.weightG || 0)),
    0,
  );

  // 包裹里一个克重都没有（理论不该出现）：按单数平分，零头同样落最后一单
  if (totalWeight <= 0) {
    const base = Math.floor(totalCents / items.length);
    const remainder = totalCents - base * items.length;
    return items.map((item, index) => ({
      orderId: item.orderId,
      weightG: 0,
      allocatedFee:
        (base + (index >= items.length - remainder ? 1 : 0)) / 100,
    }));
  }

  const centsList = items.map((item) => {
    const weight = Math.max(0, Math.floor(item.weightG || 0));
    const raw = (totalCents * weight) / totalWeight;
    return Math.floor(raw);
  });

  let left = totalCents - centsList.reduce((sum, value) => sum + value, 0);

  // 排序：重量大的在前、同重量按订单 id；零头从**最后**往前补
  const sortedIndexes = items
    .map((item, index) => index)
    .sort((a, b) => {
      const weightDiff =
        Math.max(0, Math.floor(items[b].weightG || 0)) -
        Math.max(0, Math.floor(items[a].weightG || 0));
      if (weightDiff !== 0) return weightDiff;
      return items[a].orderId.localeCompare(items[b].orderId);
    });

  for (let i = sortedIndexes.length - 1; i >= 0 && left > 0; i -= 1) {
    centsList[sortedIndexes[i]] += 1;
    left -= 1;
  }

  return items.map((item, index) => ({
    orderId: item.orderId,
    weightG: Math.max(0, Math.floor(item.weightG || 0)),
    allocatedFee: centsList[index] / 100,
  }));
}

/**
 * 一票里所有包裹一起分，并汇总到订单。
 *
 * 不变量：Σ(orderTotals) === Σ(packages.totalFee)，精确到分。
 */
export function allocateShipmentFees(
  packages: AllocationPackageInput[],
): AllocationResult {
  const result: AllocationResult = { packages: [], orderTotals: {} };

  for (const pkg of packages) {
    const allocated = allocatePackageFee(pkg.totalFee, pkg.items);
    result.packages.push({
      totalFee: Math.round(Number(pkg.totalFee) * 100) / 100,
      totalWeightG: pkg.items.reduce(
        (sum, item) => sum + Math.max(0, Math.floor(item.weightG || 0)),
        0,
      ),
      items: allocated,
    });

    for (const item of allocated) {
      result.orderTotals[item.orderId] =
        (result.orderTotals[item.orderId] ?? 0) + item.allocatedFee;
    }
  }

  // 汇总后再四舍五入到分，避免 7.369999 这种尾巴
  for (const orderId of Object.keys(result.orderTotals)) {
    result.orderTotals[orderId] =
      Math.round(result.orderTotals[orderId] * 100) / 100;
  }

  return result;
}
