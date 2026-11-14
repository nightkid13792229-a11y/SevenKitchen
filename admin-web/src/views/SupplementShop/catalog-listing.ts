/**
 * 补剂「上架清单」· 「上架」开关能不能点（2026-11-14）。
 *
 * 为什么单独拎出来：原来模板里写的是 `:disabled="!row.readyToSell"`，
 * 而后端的 readyToSell = **已上架 且 无红色问题** ——
 * 于是还没上架的条目永远是灰的：只能关、不能开，运营没法逐条上架，
 * 只能靠右上角「一键上架全部可生产补剂」一次性全开（挑不了条）。
 *
 * 现在的口径：
 *   · 未上架：档案没有红色问题（缺价 / 缺形态 / 液体 / 单位不可换算 /
 *     缺保质期 / 缺储存条件）就能点，点了就是上架；
 *   · 已上架：永远能点 —— 哪怕档案后来出了红色问题，也得允许先下架。
 */

export interface ListingIssueLike {
  level: string
}

export interface ListingRowLike {
  supplementRetailEnabled: boolean
  issues: ListingIssueLike[]
}

function hasBlockingError(row: ListingRowLike): boolean {
  return (row.issues || []).some((issue) => issue.level === 'ERROR')
}

export function canToggleListing(row: ListingRowLike): boolean {
  if (row.supplementRetailEnabled) {
    return true
  }
  return !hasBlockingError(row)
}

/** 「档案未补齐，无法上架」这句提示：只在"想开但开不了"的时候出现 */
export function showListingBlockedHint(row: ListingRowLike): boolean {
  return !row.supplementRetailEnabled && hasBlockingError(row)
}
