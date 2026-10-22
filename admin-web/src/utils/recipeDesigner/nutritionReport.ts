/**
 * 草稿营养报告展示辅助（2026-10-22）。
 *
 * 报告内容由后端按发布口径生成并持久化，前端只做三件事：
 *  1. 根据上线检查概要决定「生成 / 查看 / 重新生成」动作；
 *  2. 把能量密度按「干物质优先」排序；
 *  3. 把营养分区对象转成固定顺序的数组。
 *
 * 不参与任何营养计算，避免前后端两套口径。
 */
import type {
  DraftLaunchReadinessSummary,
  DraftNutritionReportEnergyDensityRow,
  DraftNutritionReportNutrientSection
} from '@/types/recipeDesigner'

export type NutritionReportActionKind = 'generate' | 'view' | 'regenerate'

export interface NutritionReportActionState {
  kind: NutritionReportActionKind
  label: string
}

/**
 * 上线检查概要里的报告状态 → 报告行动作。
 *
 * - 没有保存过报告：生成；
 * - 有报告且未过期：查看；
 * - 有报告但草稿已修改：重新生成。
 *
 * `reportStale` 只在有报告时才有意义，因此没有报告时忽略脏值。
 */
export function resolveNutritionReportAction(
  summary: Pick<DraftLaunchReadinessSummary, 'reportGenerated' | 'reportStale'>
): NutritionReportActionState {
  if (!summary.reportGenerated) {
    return { kind: 'generate', label: '生成营养报告' }
  }
  if (summary.reportStale) {
    return { kind: 'regenerate', label: '报告已过期，重新生成' }
  }
  return { kind: 'view', label: '查看营养报告' }
}

const DRY_MATTER_PATTERN = /干物质|\bDM\b/i

function isDryMatterEnergyRow(
  row: DraftNutritionReportEnergyDensityRow
): boolean {
  return DRY_MATTER_PATTERN.test(`${row.label ?? ''} ${row.value ?? ''}`)
}

/**
 * 能量密度行：干物质口径优先展示，其余保持后端顺序。
 * 返回新数组，不修改响应数据。
 */
export function orderEnergyDensityRows(
  rows: readonly DraftNutritionReportEnergyDensityRow[]
): DraftNutritionReportEnergyDensityRow[] {
  return [...rows].sort(
    (left, right) =>
      Number(isDryMatterEnergyRow(right)) - Number(isDryMatterEnergyRow(left))
  )
}

/** 与后端 published-nutrition-report.ts 的分区顺序一致 */
const NUTRIENT_SECTION_ORDER = [
  'minerals',
  'vitamins',
  'aminoAcids',
  'fattyAcids'
] as const

/**
 * 营养分区对象 → 固定顺序数组。
 * 后端可能新增分区：未知分区保留在后，不丢数据。
 */
export function buildNutrientSectionList(
  sections:
    | Record<string, DraftNutritionReportNutrientSection>
    | null
    | undefined
): DraftNutritionReportNutrientSection[] {
  const entries = Object.values(sections ?? {}).filter(
    (section): section is DraftNutritionReportNutrientSection =>
      Boolean(section && typeof section === 'object')
  )

  const known = NUTRIENT_SECTION_ORDER.map((key) =>
    entries.find((section) => section.key === key)
  ).filter(
    (section): section is DraftNutritionReportNutrientSection => Boolean(section)
  )
  const unknown = entries.filter(
    (section) =>
      !NUTRIENT_SECTION_ORDER.includes(
        section.key as (typeof NUTRIENT_SECTION_ORDER)[number]
      )
  )

  return [...known, ...unknown].map((section) => ({
    ...section,
    rows: Array.isArray(section.rows) ? section.rows : []
  }))
}

/** 营养素状态 → 行样式；未知状态保持默认样式 */
export function nutrientRowStatusClass(status?: string | null): string {
  switch (String(status ?? '').trim().toUpperCase()) {
    case 'COMPLIANT':
      return 'is-compliant'
    case 'DEFICIENT':
      return 'is-deficient'
    case 'EXCESS':
      return 'is-excess'
    case 'MISSING_DATA':
      return 'is-missing'
    default:
      return ''
  }
}

/**
 * 是否展示生成时间 / 内容版本。
 * 没有信封（加载中 / 还没请求）或从未生成过报告时都不展示。
 */
export function hasNutritionReportMeta(
  snapshot: { generatedAt?: string | null; revision?: number | null } | null | undefined
): boolean {
  if (!snapshot) return false
  return Boolean(snapshot.generatedAt) || snapshot.revision !== null
}
