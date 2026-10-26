/**
 * 制作单的“这批食物总重”（g）——补剂用量的分母。
 *
 * 口径与小程序 `getPackagePlanTotal` 一致：
 *   1. 包规 rows 的 `packageSpecG × packageCount` 求和；
 *   2. 包规为空时用 `dailyIntakeG × cycleDays`；
 *   3. 都取不到返回 0（调用方决定是否 400，不能按 0 静默算）。
 */
export function computeSheetTotalWeightG(sheet: {
  packagePlan?: unknown;
  dailyIntakeG?: unknown;
  cycleDays?: unknown;
}): number {
  const plan = sheet?.packagePlan;
  let planTotal = 0;
  if (Array.isArray(plan)) {
    for (const row of plan) {
      const spec = Number((row as any)?.packageSpecG);
      const count = Number((row as any)?.packageCount);
      if (Number.isFinite(spec) && spec > 0 && Number.isFinite(count) && count > 0) {
        planTotal += spec * count;
      }
    }
  }
  if (planTotal > 0) return planTotal;

  const daily = Number(sheet?.dailyIntakeG);
  const days = Number(sheet?.cycleDays);
  if (Number.isFinite(daily) && daily > 0 && Number.isFinite(days) && days > 0) {
    return daily * days;
  }
  return 0;
}
