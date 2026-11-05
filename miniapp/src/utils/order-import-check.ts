/**
 * 「模型认为截图没读全」这一条提示（纯函数，2026-11-05）。
 *
 * 金额对不对已经不在这里算了 —— 现在统一由「商品 + 运费 + 包装 = 实付」
 * 那道账来说（见 order-import-fees 的 feeStatusText），
 * 因为拿「模型抄下来的商品小计」去比「商品行合计」会出现两个口径打架：
 * 盒马特价单的小计按原价、商品行是实付价，于是同一页既写「差 1 元」又写「对得上」。
 *
 * 这里只剩一件事：模型自己说「可能没读全」时给一句话，让人对照原图看。
 * 它只是提示，不拦人 —— 点「生成采购记录」就是人的判断。
 */

export interface OrderImportCompletenessInput {
  incomplete: boolean;
  incompleteReason: string | null;
}

export function orderImportIncompleteNotice(
  input: OrderImportCompletenessInput,
): string | null {
  if (!input.incomplete) return null;
  return (
    input.incompleteReason?.trim() ||
    '模型认为这张截图没读完整，请对照原图确认'
  );
}
