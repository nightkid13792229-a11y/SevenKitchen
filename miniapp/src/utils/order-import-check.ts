/**
 * 订单识别结果的金额提示（纯函数，2026-11-05）。
 *
 * 「截图完整不完整」只由模型判断：优惠/满减/特价/包装费/运费/称重退差都会让
 * 「商品小计」与「各行合计」对不上，用公式硬判只会误报（盒马特价单就是例子：
 * 小计按原价、商品行按实付价，差 1 元但截图完整）。
 *
 * 这里的产出只用于「显示」，不参与任何拦截：
 *   · statusText：顶部一行，说清金额状态（一致 / 差多少 / 没读到）
 *   · incompleteNotice：只有模型说「可能没读全」时才有值，单独一条轻提示
 *
 * 差额本身不落库也不拦人 —— 点「生成采购记录」就是员工的判断；
 * 报销审核页会重新算一遍差额，提示审核人抽查原图。
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
  /** 顶部一行状态：金额一致 / 与商品小计差 ¥x / 没读到商品金额 */
  statusText: string;
  /** 模型认为没读完整时的一句话；否则 null */
  incompleteNotice: string | null;
}

export function checkOrderImportAmount(
  input: OrderImportAmountInput,
): OrderImportAmountCheck {
  const lineSum = round2(
    input.lineTotals.reduce((sum, value) => sum + (value ?? 0), 0),
  );

  const incompleteNotice = input.incomplete
    ? input.incompleteReason?.trim() ||
      '模型认为这张截图没读完整，请对照原图确认'
    : null;

  if (input.subtotal === null || input.subtotal === undefined) {
    return { diff: null, statusText: '没读到商品金额', incompleteNotice };
  }

  const diff = round2(input.subtotal - lineSum);
  const consistent = Math.abs(diff) <= TOLERANCE;
  return {
    diff,
    statusText: consistent
      ? '金额一致'
      : `与商品小计差 ¥${Math.abs(diff).toFixed(2)}`,
    incompleteNotice,
  };
}
