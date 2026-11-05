/**
 * 订单识别结果的金额提示（纯函数，2026-11-05）。
 *
 * 「截图完整不完整」只由模型判断：优惠/满减/特价/包装费/运费/称重退差都会让
 * 「商品小计」与「各行合计」对不上，用公式硬判只会误报（盒马特价单就是例子：
 * 小计按原价、商品行按实付价，差 1 元但截图完整）。
 *
 * 所以这里只把差额算出来，交给页面提示，员工勾选「我已核对」后照常生成，
 * 不再拦人。差额会随明细一起留在库里，报销审核时仍然看得到。
 */

const TOLERANCE = 0.011;

const round2 = (value: number): number => Math.round(value * 100) / 100;

export interface OrderImportAmountInput {
  /** 截图上的「商品小计 / 商品金额」（不是实付合计） */
  subtotal: number | null;
  /** 模型自己判断的「没读完整」 */
  incomplete: boolean;
  incompleteReason: string | null;
  lineTotals: Array<number | null>;
}

export interface OrderImportAmountCheck {
  /** 商品小计 − 各行合计；没读到商品小计时为 null */
  diff: number | null;
  /** 为空表示金额上没发现问题，不需要员工确认 */
  warnings: string[];
}

export function checkOrderImportAmount(
  input: OrderImportAmountInput,
): OrderImportAmountCheck {
  const lineSum = round2(
    input.lineTotals.reduce((sum, value) => sum + (value ?? 0), 0),
  );
  const warnings: string[] = [];

  if (input.incomplete) {
    warnings.push(
      input.incompleteReason?.trim() ||
        '模型认为这张截图没读完整，请对照原图确认',
    );
  }

  let diff: number | null = null;
  if (input.subtotal === null || input.subtotal === undefined) {
    warnings.push('没读到商品金额，无法自动核对是否读全，请对照原图确认');
  } else {
    diff = round2(input.subtotal - lineSum);
    if (Math.abs(diff) > TOLERANCE) {
      warnings.push(
        `各行合计 ¥${lineSum.toFixed(2)}，商品小计 ¥${round2(input.subtotal).toFixed(2)}，` +
          `差 ¥${Math.abs(diff).toFixed(2)}；可能是优惠、特价或包装费，请对照原图确认`,
      );
    }
  }

  return { diff, warnings };
}
