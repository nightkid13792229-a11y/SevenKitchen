/**
 * 预分装下单页 · 每行可选产品（2026-11-15）
 *
 * 换款只发生在下单前：这里算出每一行还有哪些「同组且已上架」的产品，
 * 页面据此决定要不要显示「换一款」；选中后重新报价，提交后冻结。
 */
import type {
  SupplementPlanResponse,
  SupplementRepackOption,
} from '../../utils/supplement-plan'

export interface PurchaseLineLike {
  recipeItemId: string
  ingredientId: string
}

export interface PurchaseLineOption<T extends PurchaseLineLike = PurchaseLineLike> {
  line: T
  options: SupplementRepackOption[]
  selected: SupplementRepackOption | null
}

export function buildPurchaseLineOptions<T extends PurchaseLineLike>(
  plan: Pick<SupplementPlanResponse, 'items'> | null | undefined,
  lines: T[],
): Array<PurchaseLineOption<T>> {
  const byItem = new Map(
    (plan?.items || []).map((item) => [item.recipeItemId, item]),
  )

  return (lines || []).map((line) => {
    const item = byItem.get(line.recipeItemId)
    const options = (item?.repackPool || []).filter(
      (option) =>
        option.available &&
        option.amount !== null &&
        Number.isFinite(option.amount) &&
        Number(option.amount) > 0,
    )
    const selected =
      options.find((option) => option.ingredientId === line.ingredientId) ??
      options[0] ??
      null
    return { line, options, selected }
  })
}
