/**
 * 采购商品「包装层级」的展示与换算（2026-11-11，admin-web 侧）。
 *
 * 与后端 `backend/src/domain/purchasing/packaging.ts` **同一口径**：
 * 层级 = 中间层 `links` + 末层 `amount`（恒为原料基准单位），
 * 换算倍数 = 连乘 × amount。
 *
 * 前端只用来**预览**和**拼提交体**，真正的倍数由服务端再算一遍 ——
 * 前端算错了也进不了库。
 */

export type PackagingBaseUnit = 'G' | 'ML' | 'PCS'

export interface PackagingLink {
  count: number
  unit: string
}

export interface PackagingSpec {
  links: PackagingLink[]
  amount: number
  amountUnit: PackagingBaseUnit
  amountLabel?: string
  printedText?: string
}

const BASE_UNIT_LABEL: Record<PackagingBaseUnit, string> = {
  G: '克',
  ML: '毫升',
  PCS: '个',
}

export function baseUnitLabelOf(baseUnit: string | null | undefined): string {
  return BASE_UNIT_LABEL[(baseUnit || 'G').toUpperCase() as PackagingBaseUnit] ?? '克'
}

/** 层级连乘 × 末层数量；没有层级时就是末层本身 */
export function ratioOf(spec: PackagingSpec | null | undefined): number {
  if (!spec) return 0
  const product = (spec.links ?? []).reduce(
    (acc, link) => acc * Number(link.count || 0),
    1,
  )
  const ratio = product * Number(spec.amount || 0)
  if (!Number.isFinite(ratio) || ratio <= 0) return 0
  return Math.round(ratio * 1e6) / 1e6
}

/** 「1 箱 = 10 捆 × 500 克」 */
export function formatPackagingText(
  spec: PackagingSpec | null | undefined,
  purchaseUnit: string | null | undefined,
): string {
  if (!spec) return ''
  const head = `1 ${(purchaseUnit || '件').trim()}`
  const parts = (spec.links ?? []).map((link) => `${link.count} ${link.unit}`)
  const amountLabel = spec.amountLabel || baseUnitLabelOf(spec.amountUnit)
  parts.push(`${spec.amount} ${amountLabel}`)
  return `${head} = ${parts.join(' × ')}`
}

/**
 * 只有「一件 = 多少克」时用的简版层级。
 *
 * 后台原料页的 SKU 弹窗只收"单位 + 倍数"，没有层编辑，就按单层折 ——
 * 与后端 `packagingFromLegacy` 同口径，倍数不变、金额不变。
 */
export function legacyPackaging(
  ratio: number | null | undefined,
  baseUnit: string | null | undefined,
  printedText?: string | null,
): PackagingSpec {
  const value = Number(ratio || 0)
  const unit = (baseUnit || 'G').toUpperCase() as PackagingBaseUnit
  return {
    links: [],
    amount: Number.isFinite(value) && value > 0 ? Number(value.toFixed(6)) : 0,
    amountUnit: unit,
    ...(printedText ? { printedText } : {}),
  }
}
