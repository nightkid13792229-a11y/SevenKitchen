/**
 * 需求分类 → 卡片上的标签。
 *
 * 规则：分类顺序永远跟后端 `kind.sort` 走，不受 `links` 返回顺序影响；
 * 没归的分类不隐藏，而是给一个"未归类"占位 —— 看不见就会忘记补。
 */
import type {
  TaxonomyKindView,
  TaxonomySeriesItem
} from '@/types/recipeDesigner'

export interface TaxonomyChip {
  key: string
  label: string
  missing: boolean
}

export function buildTaxonomyChips(
  item: TaxonomySeriesItem,
  kinds: TaxonomyKindView[]
): TaxonomyChip[] {
  const linkByKind = new Map(item.links.map((link) => [link.kindId, link]))

  return [...kinds]
    .sort((left, right) => left.sort - right.sort)
    .map((kind) => {
      const link = linkByKind.get(kind.id)
      return {
        key: kind.code,
        label: link ? `${kind.name} ${link.nodeName}` : `${kind.name} 未归类`,
        missing: !link
      }
    })
}
