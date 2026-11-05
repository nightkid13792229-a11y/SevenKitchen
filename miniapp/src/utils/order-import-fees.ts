/**
 * 订单识别的费用核对（纯函数，2026-11-05）。
 *
 * 一笔订单的账必须能合上：商品小计 + 运费 + 包装费 = 实付。
 * 运费/包装费是订单级的，不摊到商品行、不和个人采购分摊（业务规则 R6/R10）。
 *
 * 约定：
 *   · 金额读不到就是 null，不当 0 用；只有算「合计」时才临时按 0 计；
 *   · 实付没读到就不算差额（null），不硬猜；
 *   · 差额 = 实付 −（商品 + 运费 + 包装），正数说明实付还有别的费用没算进来。
 */

/** 1 分钱以内算对得上（和识别自检同一口径） */
export const IMPORT_FEE_TOLERANCE = 0.011;

const round2 = (value: number): number => Math.round(value * 100) / 100;

export interface OrderImportFeeInput {
  /** 各商品行的金额（当前值，员工改过的以改后为准） */
  lineTotals: Array<number | null>;
  shippingFee: number | null;
  packagingFee: number | null;
  /** 实付（凭证金额）；没读到传 null */
  paid: number | null;
}

export interface OrderImportFeeSummary {
  /** 商品小计：各行金额之和 */
  lineSum: number;
  shipping: number | null;
  packaging: number | null;
  /** 运费 + 包装费（null 按 0 计） */
  feeTotal: number;
  /** 商品 + 运费 + 包装费 */
  expected: number;
  /** 实付 − expected；实付没读到为 null */
  gap: number | null;
  /** 运费或包装费还没读到 */
  hasMissingFee: boolean;
}

export function summarizeOrderImportFees(
  input: OrderImportFeeInput,
): OrderImportFeeSummary {
  const lineSum = round2(
    input.lineTotals.reduce<number>((sum, value) => sum + (value ?? 0), 0),
  );
  const shipping = input.shippingFee ?? null;
  const packaging = input.packagingFee ?? null;
  const feeTotal = round2((shipping ?? 0) + (packaging ?? 0));
  const expected = round2(lineSum + feeTotal);
  const paid = input.paid ?? null;
  const gap = paid === null ? null : round2(paid - expected);

  return {
    lineSum,
    shipping,
    packaging,
    feeTotal,
    expected,
    gap,
    hasMissingFee: shipping === null || packaging === null,
  };
}

export interface ImportFeeLike {
  shippingFee?: number | null;
  packagingFee?: number | null;
}

/** 多笔订单的运费/包装费相加（报销页预填用） */
export function sumImportFees(items: ImportFeeLike[]): {
  count: number;
  shipping: number;
  packaging: number;
} {
  const sum = (key: 'shippingFee' | 'packagingFee'): number =>
    round2(
      items.reduce<number>((total, item) => {
        const value = Number(item?.[key]);
        return total + (Number.isFinite(value) ? value : 0);
      }, 0),
    );

  return {
    count: items.length,
    shipping: sum('shippingFee'),
    packaging: sum('packagingFee'),
  };
}

/** 差额是否算「没对上」 */
export function isFeeGapOff(gap: number | null): boolean {
  return typeof gap === 'number' && Math.abs(gap) > IMPORT_FEE_TOLERANCE;
}

/**
 * 顶部那一行的金额状态（2026-11-05）。
 *
 * ⚠️ 不要再用「模型抄下来的商品小计」去比「商品行合计」✗ ——
 * 盒马特价单就是两个口径：小计按原价 148.33、商品行是实付价 147.33，
 * 于是同一页上「差 1 元」和「和实付对得上」同时出现，自相矛盾。
 *
 * 现在统一用这道账：商品行合计 + 运费 + 包装费 = 实付。
 */
export function feeStatusText(summary: OrderImportFeeSummary): string {
  if (summary.gap === null) return '实付没读到';
  if (!isFeeGapOff(summary.gap)) return '金额一致';
  return `与实付差 ¥${Math.abs(summary.gap).toFixed(2)}`;
}
