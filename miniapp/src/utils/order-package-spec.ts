/**
 * 订单分装规格的展示写法（2026-11-14）。
 *
 * 员工在订单中心列表上要一眼看出「这单装几袋、每袋多少克」，
 * 所以卡片上用**袋数在前**的写法：`4袋×250g`。
 *
 * 注意别和标签打印的 `250g×4袋`（utils/label-print-items）混用：
 * 那边是贴纸上的固定排版，这里只服务于列表卡片。
 */

export type OrderPackagePlanRow = {
  packageSpecG: number;
  packageCount: number;
};

export type OrderPackagePlanSource = {
  /** 多组分装（优先）；null / 空数组时退回单组字段 */
  packagePlan?: Array<{ packageSpecG?: number | null; packageCount?: number | null }> | null;
  /** 老订单只有这两个字段 */
  packageSpecG?: number | null;
  packageCount?: number | null;
};

function toPositiveInt(value: unknown): number | null {
  const normalized = Math.floor(Number(value));
  return Number.isFinite(normalized) && normalized > 0 ? normalized : null;
}

/**
 * 正常化分装计划：过滤脏数据（0 袋、负克重、非数字），保持原有顺序。
 */
export function normalizeOrderPackagePlan(
  source: OrderPackagePlanSource | null | undefined,
): OrderPackagePlanRow[] {
  if (!source) return [];

  const rows: OrderPackagePlanRow[] = [];
  const plan = Array.isArray(source.packagePlan) ? source.packagePlan : [];
  for (const row of plan) {
    const packageSpecG = toPositiveInt(row?.packageSpecG);
    const packageCount = toPositiveInt(row?.packageCount);
    if (packageSpecG && packageCount) {
      rows.push({ packageSpecG, packageCount });
    }
  }
  if (rows.length > 0) return rows;

  const packageSpecG = toPositiveInt(source.packageSpecG);
  const packageCount = toPositiveInt(source.packageCount);
  return packageSpecG && packageCount ? [{ packageSpecG, packageCount }] : [];
}

/**
 * `4袋×250g`；多组用中文逗号连接：`4袋×250g，2袋×500g`。
 * 没有可用的分装数据时返回空串 —— 调用方据此整段不显示，不要写「0袋×0g」。
 */
export function formatOrderPackageSpec(
  source: OrderPackagePlanSource | null | undefined,
): string {
  return normalizeOrderPackagePlan(source)
    .map((row) => `${row.packageCount}袋×${row.packageSpecG}g`)
    .join('，');
}
