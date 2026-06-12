import {
  FEDIAF_DOG_SCENARIO_LABELS,
  type FediafDogScenario,
} from '../../api/recipe-designer'

export type AssessmentEntryStatus = 'MISSING_DATA' | 'DEFICIENT' | 'EXCESS' | 'COMPLIANT' | 'INFO'
export type AssessmentOverallStatus = 'INCOMPLETE' | 'NON_COMPLIANT' | 'COMPLIANT'
export type AssessmentStatus = AssessmentEntryStatus | AssessmentOverallStatus
export type AssessmentCategoryKey = 'MACRO' | 'AMINO_ACID' | 'FATTY_ACID' | 'MINERAL' | 'VITAMIN'

export interface AssessmentEntryLike {
  nutrientKey?: string
  key?: string
  label?: string
  name?: string
  nutrientName?: string
  category?: string
  expressionBasis?: string
  unit?: string
  minValue?: number | null
  targetMin?: number | null
  min?: number | null
  minValueNote?: string | null
  targetMinNote?: string | null
  minNote?: string | null
  maxValue?: number | null
  targetMax?: number | null
  max?: number | null
  maxValueNote?: string | null
  targetMaxNote?: string | null
  maxNote?: string | null
  maxValueLabel?: string | null
  targetMaxLabel?: string | null
  maxLabel?: string | null
  currentValue?: number | null
  current?: number | null
  actual?: number | null
  value?: number | null
  status?: string
  details?: AssessmentEntryLike[]
  dryMatterValue?: number | null
  displayBasisLabel?: string
  displayOrder?: number
  hideDryMatter?: boolean
  excludeFromAttention?: boolean
  missingAsZero?: boolean
  isSupplementalMacro?: boolean
  rangeConflict?: boolean
  rangeConflictNote?: string | null
  contributors?: AssessmentContributorLike[]
}

export interface AssessmentMacroMetricLike {
  total?: number | null
  per1000Kcal?: number | null
  dryMatterPercent?: number | null
  currentValue?: number | null
  current?: number | null
  value?: number | null
  percent?: number | null
}

export interface AssessmentBuildContext {
  totalWeightG?: number | null
  dryMatterG?: number | null
  energyDensityKcalPerKg?: number | null
  macroMetrics?: Record<string, AssessmentMacroMetricLike | number | null | undefined>
  nutrients?: Record<string, AssessmentMacroMetricLike | number | null | undefined>
  calculatedNutrition?: Record<string, AssessmentMacroMetricLike | number | null | undefined>
  nutrition?: Record<string, AssessmentMacroMetricLike | number | null | undefined>
}

export interface AssessmentCategoryGroup {
  key: AssessmentCategoryKey
  entries: AssessmentEntryLike[]
}

export interface AssessmentSummaryLike {
  compliant?: number
  deficient?: number
  excess?: number
  missingData?: number
  compliantCount?: number
  deficientCount?: number
  excessCount?: number
  missingDataCount?: number
}

export interface AssessmentDetailRow {
  label: string
  value: string
}

export interface AssessmentContributorLike {
  itemId?: string
  itemName?: string
  name?: string
  weightG?: number | null
  amountUnit?: string | null
  amount?: number | null
  value?: number | null
  unit?: string | null
  contributionPercent?: number | null
  percent?: number | null
  missing?: boolean
  missingAsZero?: boolean
}

export interface AssessmentContributionRow {
  itemId: string
  itemName: string
  weightValue: number | null
  weightLabel: string
  amountValue: number | null
  amountLabel: string
  amountUnit: string
  unit: string
  percentLabel: string
  barPercent: number
  missing: boolean
  sortPercent: number | null
  sortAmount: number | null
}

export interface AssessmentNutrientSearchTarget {
  nutrientKey: string
  label: string
  expressionBasis?: string
  targetValue?: number
}

export const ASSESSMENT_STATUS_LABELS: Record<AssessmentEntryStatus, string> = {
  MISSING_DATA: '缺数据',
  DEFICIENT: '不足',
  EXCESS: '过量',
  COMPLIANT: '达标',
  INFO: '无上下限',
}

export const ASSESSMENT_CATEGORY_ORDER: AssessmentCategoryKey[] = [
  'MACRO',
  'AMINO_ACID',
  'FATTY_ACID',
  'MINERAL',
  'VITAMIN',
]

const ASSESSMENT_CATEGORY_LABELS: Record<AssessmentCategoryKey, string> = {
  MACRO: '宏量',
  AMINO_ACID: '氨基酸',
  FATTY_ACID: '脂肪酸',
  MINERAL: '微量',
  VITAMIN: '维生素',
}

const ASSESSMENT_CATEGORY_TITLES: Record<AssessmentCategoryKey, string> = {
  MACRO: '宏量营养素',
  AMINO_ACID: '氨基酸',
  FATTY_ACID: '脂肪酸',
  MINERAL: '微量元素',
  VITAMIN: '维生素',
}

interface SupplementalMacroRowDefinition {
  nutrientKey: string
  metricKey: string
  label: string
  unit: string
  aliases: readonly string[]
  displayOrder: number
  displayBasisLabel?: string
  hideDryMatter?: boolean
}

const SUPPLEMENTAL_MACRO_ROWS: readonly SupplementalMacroRowDefinition[] = [
  {
    nutrientKey: 'net_carbohydrate',
    metricKey: 'carbohydrate',
    label: '净碳水',
    unit: 'g',
    aliases: ['net_carbohydrate', 'netCarbohydrate', 'carbohydrate', 'carbs'],
    displayOrder: 100,
  },
  {
    nutrientKey: 'dietary_fiber',
    metricKey: 'fiber',
    label: '膳食纤维',
    unit: 'g',
    aliases: ['dietary_fiber', 'dietaryFiber', 'fiber', 'crudeFiber'],
    displayOrder: 101,
  },
  {
    nutrientKey: 'ash',
    metricKey: 'ash',
    label: '灰分',
    unit: 'g',
    aliases: ['ash', 'crudeAsh'],
    displayOrder: 102,
  },
  {
    nutrientKey: 'moisture',
    metricKey: 'moisture',
    label: '水分',
    unit: '%',
    displayBasisLabel: '占总重',
    aliases: ['moisture', 'water'],
    hideDryMatter: true,
    displayOrder: 103,
  },
  {
    nutrientKey: 'energy_density',
    metricKey: 'energyDensity',
    label: '能量密度',
    unit: 'kcal/kg',
    displayBasisLabel: 'kcal/kg',
    aliases: ['energy_density', 'energyDensity', 'energyDensityKcalPerKg'],
    hideDryMatter: true,
    displayOrder: 104,
  },
] as const

export const OVERALL_STATUS_LABELS: Record<AssessmentOverallStatus, string> = {
  INCOMPLETE: '资料不完整',
  NON_COMPLIANT: '未达标/需审核',
  COMPLIANT: '已达标',
}

export function getAssessmentStatusLabel(status?: string) {
  return ASSESSMENT_STATUS_LABELS[status as AssessmentEntryStatus] || '待评估'
}

export function getAssessmentDisplayStatusLabel(entry: AssessmentEntryLike) {
  const basisEntry = getAssessmentDisplayEntry(entry).basisEntry
  return basisEntry.rangeConflict || entry.rangeConflict ? '冲突' : getAssessmentStatusLabel(resolveAssessmentDisplayStatus(entry))
}

export function formatAssessmentRatioValue(value: number) {
  if (!Number.isFinite(value)) return String(value)
  return `${formatCompactAssessmentNumber(value)}:1`
}

export function getAssessmentBoundaryNote(
  entry: AssessmentEntryLike,
  boundary: 'min' | 'max',
) {
  const basisEntry = getAssessmentDisplayEntry(entry).basisEntry
  const note =
    boundary === 'min'
      ? basisEntry.minValueNote ?? basisEntry.targetMinNote ?? basisEntry.minNote
      : basisEntry.maxValueNote ?? basisEntry.targetMaxNote ?? basisEntry.maxNote

  return typeof note === 'string' && note.trim().length > 0 ? note.trim() : ''
}

export function getAssessmentRangeConflictNote(entry: AssessmentEntryLike) {
  const basisEntry = getAssessmentDisplayEntry(entry).basisEntry
  const note = basisEntry.rangeConflictNote ?? entry.rangeConflictNote
  return typeof note === 'string' && note.trim().length > 0 ? note.trim() : ''
}

export function getOverallStatusLabel(status?: string) {
  return OVERALL_STATUS_LABELS[status as AssessmentOverallStatus] || '待评估'
}

export function buildAssessmentCategories(
  entries: AssessmentEntryLike[] = [],
  context: AssessmentBuildContext = {},
): AssessmentCategoryGroup[] {
  const groups = ASSESSMENT_CATEGORY_ORDER.map((key) => ({ key, entries: [] as AssessmentEntryLike[] }))
  const groupByKey = new Map(groups.map((group) => [group.key, group.entries]))

  entries.forEach((entry) => {
    groupByKey.get(resolveAssessmentCategory(entry))?.push(entry)
  })

  appendSupplementalMacroRows(groupByKey.get('MACRO') || [], context)

  groups.forEach((group) => {
    group.entries.sort((left, right) => {
      if (group.key !== 'MACRO') {
        return getEntryDisplayOrder(left) - getEntryDisplayOrder(right)
      }

      const leftInformational = Boolean(left.excludeFromAttention)
      const rightInformational = Boolean(right.excludeFromAttention)
      if (leftInformational !== rightInformational) return leftInformational ? 1 : -1

      const statusPriority =
        getEntryStatusPriority(resolveAssessmentDisplayStatus(right)) -
        getEntryStatusPriority(resolveAssessmentDisplayStatus(left))
      if (statusPriority !== 0) return statusPriority

      return getEntryDisplayOrder(left) - getEntryDisplayOrder(right)
    })
  })

  return groups
}

export function getAssessmentCategoryLabel(key: AssessmentCategoryKey) {
  return ASSESSMENT_CATEGORY_LABELS[key]
}

export function getAssessmentCategoryTitle(key: AssessmentCategoryKey) {
  return ASSESSMENT_CATEGORY_TITLES[key]
}

export function getAssessmentCategoryAttentionCount(group: AssessmentCategoryGroup) {
  return group.entries.filter((entry) => {
    const status = resolveAssessmentDisplayStatus(entry)
    return !entry.excludeFromAttention && status && status !== 'COMPLIANT' && status !== 'INFO'
  }).length
}

export function getAssessmentDisplayEntry(entry: AssessmentEntryLike) {
  const details = Array.isArray(entry.details) ? entry.details : []
  const basisEntry = details.find((detail) => detail.expressionBasis === 'PER_1000_KCAL_ME') || entry
  const dryMatterEntry =
    details.find((detail) => detail.expressionBasis === 'PER_100G_DRY_MATTER') ||
    (entry.expressionBasis === 'PER_100G_DRY_MATTER' ? entry : undefined)
  const dryMatterValue = entry.hideDryMatter
    ? null
    : readAssessmentNumber(dryMatterEntry) ?? readFiniteNumber(entry.dryMatterValue)

  return {
    basisEntry,
    dryMatterEntry,
    dryMatterValue,
    hideDryMatter: Boolean(entry.hideDryMatter),
  }
}

export function getAssessmentBoundaryTitle(entry: AssessmentEntryLike, boundary: 'min' | 'max') {
  if (boundary === 'min') return '下限'
  return '上限'
}

export function getAssessmentDryMatterLabel(entry: AssessmentEntryLike) {
  const displayEntry = getAssessmentDisplayEntry(entry)
  if (displayEntry.hideDryMatter) return ''
  const value = displayEntry.dryMatterValue
  if (value === null || value === undefined) return ''

  const dryMatterEntry = displayEntry.dryMatterEntry
  const unit = typeof dryMatterEntry?.unit === 'string' ? dryMatterEntry.unit.trim() : ''
  const category = resolveAssessmentCategory(entry)
  const shouldUsePercent = unit === '' || unit === '%' || (unit === 'g' && category === 'MACRO')
  const suffix = shouldUsePercent ? '%' : `${unit}/100g`
  const formattedValue = shouldUsePercent ? formatAssessmentNumber(value) : value.toFixed(2)

  return `干物质 ${formattedValue}${suffix}`
}

export function shouldShowAssessmentDryMatterInline(entry: AssessmentEntryLike) {
  return resolveAssessmentCategory(entry) === 'MACRO' && Boolean(getAssessmentDryMatterLabel(entry))
}

export function shouldShowAssessmentDetailTrigger(entry: AssessmentEntryLike) {
  if (entry.isSupplementalMacro) return false
  if (getAssessmentContributionRows(entry).length > 0) return true
  if (resolveAssessmentCategory(entry) === 'MACRO') return false
  const rows = getAssessmentDetailRows(entry)
  return rows.some((row) => row.label !== '/1000kcal ME')
}

export function getAssessmentDetailModalContent(entry: AssessmentEntryLike) {
  const rows = getAssessmentDetailRows(entry)
  return rows.map((row) => `${row.label}：${row.value}`).join('\n')
}

export function getAssessmentDetailNotes(entry: AssessmentEntryLike) {
  return []
}

export function getAssessmentNutrientSearchTarget(
  entry: AssessmentEntryLike,
): AssessmentNutrientSearchTarget | null {
  if (entry.isSupplementalMacro) return null
  const basisEntry = getAssessmentDisplayEntry(entry).basisEntry
  if (isAssessmentRatioEntry(basisEntry)) return null
  const nutrientKey = basisEntry.nutrientKey || entry.nutrientKey || entry.key
  if (!nutrientKey) return null
  const targetValue = readAssessmentTargetValue(basisEntry)

  return {
    nutrientKey,
    label: basisEntry.label || entry.label || entry.name || entry.nutrientName || nutrientKey,
    expressionBasis: basisEntry.expressionBasis || entry.expressionBasis,
    ...(targetValue !== null ? { targetValue } : {}),
  }
}

function readAssessmentTargetValue(entry: AssessmentEntryLike) {
  return readFiniteNumber(entry.minValue ?? entry.targetMin ?? entry.min)
}

export function getAssessmentContributionRows(entry: AssessmentEntryLike): AssessmentContributionRow[] {
  const basisEntry = getAssessmentDisplayEntry(entry).basisEntry
  const contributors = Array.isArray(basisEntry.contributors)
    ? basisEntry.contributors
    : Array.isArray(entry.contributors)
      ? entry.contributors
      : []

  return contributors.map((contributor, index) => {
    const amount = readFiniteNumber(contributor.amount ?? contributor.value)
    const percent = readFiniteNumber(contributor.contributionPercent ?? contributor.percent)
    const weightG = readFiniteNumber(contributor.weightG)
    const missing = Boolean(contributor.missing) || amount === null
    const unit = typeof contributor.unit === 'string' ? contributor.unit.trim() : basisEntry.unit || entry.unit || ''
    const amountUnit =
      typeof contributor.amountUnit === 'string' && contributor.amountUnit.trim()
        ? contributor.amountUnit.trim()
        : 'g'

    return {
      itemId: contributor.itemId || `contributor-${index}`,
      itemName: contributor.itemName || contributor.name || '未命名原料',
      weightValue: weightG,
      weightLabel: weightG === null ? '-' : `${formatCompactAssessmentNumber(weightG)}${amountUnit}`,
      amountValue: amount,
      amountLabel: missing ? '缺数据' : `${formatCompactAssessmentNumber(amount)}${unit}`,
      amountUnit,
      unit,
      percentLabel: percent === null ? '-' : formatContributionPercentLabel(percent),
      barPercent: percent === null ? 0 : clampContributionPercent(percent),
      missing,
      sortPercent: percent,
      sortAmount: amount,
    }
  }).sort(compareAssessmentContributionRows)
}

export function getAssessmentDetailRows(entry: AssessmentEntryLike): AssessmentDetailRow[] {
  const rows: AssessmentDetailRow[] = []
  const perEnergyEntry = getAssessmentEntryByBasis(entry, 'PER_1000_KCAL_ME')
  const perMjEntry = getAssessmentEntryByBasis(entry, 'PER_MJ_ME')
  const dryMatterEntry = getAssessmentEntryByBasis(entry, 'PER_100G_DRY_MATTER')

  appendAssessmentDetailRow(rows, '/1000kcal ME', perEnergyEntry)
  appendAssessmentDetailRow(rows, '/MJ ME', perMjEntry)
  appendAssessmentDetailRow(rows, '干物质', dryMatterEntry)

  if (!dryMatterEntry) {
    const dryMatterLabel = getAssessmentDryMatterLabel(entry)
    if (dryMatterLabel) {
      rows.push({
        label: '干物质',
        value: dryMatterLabel.replace(/^干物质\s*/, ''),
      })
    }
  }

  return rows
}

function compareAssessmentContributionRows(
  left: AssessmentContributionRow,
  right: AssessmentContributionRow,
) {
  if (left.missing !== right.missing) return left.missing ? 1 : -1

  const leftPercent = left.sortPercent ?? -1
  const rightPercent = right.sortPercent ?? -1
  if (leftPercent !== rightPercent) return rightPercent - leftPercent

  const leftAmount = left.sortAmount ?? -1
  const rightAmount = right.sortAmount ?? -1
  if (leftAmount !== rightAmount) return rightAmount - leftAmount

  return left.itemName.localeCompare(right.itemName)
}

function clampContributionPercent(value: number) {
  return Math.min(Math.max(value, 0), 100)
}

function formatContributionPercentLabel(value: number) {
  const rounded = Math.round(value * 10) / 10
  return `${formatCompactAssessmentNumber(rounded)}%`
}

export function canDisplayAssessmentRange(entry: AssessmentEntryLike) {
  if (entry.isSupplementalMacro) return false
  const basisEntry = getAssessmentDisplayEntry(entry).basisEntry
  return (
    readAssessmentTargetNumber(basisEntry, ['minValue', 'targetMin', 'min']) !== null ||
    readAssessmentTargetNumber(basisEntry, ['maxValue', 'targetMax', 'max']) !== null
  )
}

export function shouldShowAssessmentCurrentMarker(entry: AssessmentEntryLike) {
  if (entry.isSupplementalMacro) return false
  return canDisplayAssessmentRange(entry) && readAssessmentNumber(getAssessmentDisplayEntry(entry).basisEntry) !== null
}

export function getAssessmentStatusClass(status?: string) {
  const map: Record<AssessmentStatus, string> = {
    INCOMPLETE: 'status-missing',
    NON_COMPLIANT: 'status-deficient',
    MISSING_DATA: 'status-missing',
    INFO: 'status-pending',
    DEFICIENT: 'status-deficient',
    EXCESS: 'status-excess',
    COMPLIANT: 'status-compliant',
  }
  return map[status as AssessmentStatus] || 'status-pending'
}

export function getAssessmentDisplayStatusClass(entry: AssessmentEntryLike) {
  const basisEntry = getAssessmentDisplayEntry(entry).basisEntry
  return basisEntry.rangeConflict || entry.rangeConflict
    ? 'status-conflict'
    : getAssessmentStatusClass(resolveAssessmentDisplayStatus(entry))
}

function resolveAssessmentDisplayStatus(entry: AssessmentEntryLike) {
  const basisEntry = getAssessmentDisplayEntry(entry).basisEntry
  return typeof basisEntry.status === 'string' ? basisEntry.status : entry.status
}

function appendSupplementalMacroRows(entries: AssessmentEntryLike[], context: AssessmentBuildContext) {
  SUPPLEMENTAL_MACRO_ROWS.forEach((definition) => {
    if (hasAssessmentEntry(entries, definition.aliases)) return
    entries.push(createSupplementalMacroRow(definition, context))
  })
}

function hasAssessmentEntry(entries: AssessmentEntryLike[], aliases: readonly string[]) {
  const normalizedAliases = new Set(aliases.map(normalizeKey))
  return entries.some((entry) => {
    const keys = [
      entry.nutrientKey,
      entry.key,
      entry.label,
      entry.name,
      entry.nutrientName,
    ].filter(Boolean)
    return keys.some((key) => normalizedAliases.has(normalizeKey(String(key))))
  })
}

function createSupplementalMacroRow(
  definition: (typeof SUPPLEMENTAL_MACRO_ROWS)[number],
  context: AssessmentBuildContext,
): AssessmentEntryLike {
  const currentValue = readSupplementalMacroValue(definition, context)

  return {
    nutrientKey: definition.nutrientKey,
    key: `macro_${definition.nutrientKey}`,
    label: definition.label,
    category: 'MACRO',
    expressionBasis: definition.displayBasisLabel ? undefined : 'PER_1000_KCAL_ME',
    unit: definition.unit,
    minValue: null,
    maxValue: null,
    currentValue: currentValue ?? 0,
    dryMatterValue: definition.hideDryMatter
      ? null
      : readSupplementalMacroDryMatterValue(definition, context),
    status: 'INFO',
    displayBasisLabel: definition.displayBasisLabel,
    displayOrder: definition.displayOrder,
    hideDryMatter: definition.hideDryMatter,
    excludeFromAttention: true,
    ...(currentValue === null ? { missingAsZero: true } : {}),
    isSupplementalMacro: true,
  }
}

function getAssessmentEntryByBasis(entry: AssessmentEntryLike, basis: string) {
  const details = Array.isArray(entry.details) ? entry.details : []
  return details.find((detail) => detail.expressionBasis === basis) ||
    (entry.expressionBasis === basis ? entry : undefined)
}

function appendAssessmentDetailRow(
  rows: AssessmentDetailRow[],
  label: string,
  entry?: AssessmentEntryLike,
) {
  if (!entry) return
  const value = formatAssessmentDetailEntry(entry)
  if (!value) return
  rows.push({ label, value })
}

function formatAssessmentDetailEntry(entry: AssessmentEntryLike) {
  const currentValue = readAssessmentNumber(entry)
  if (currentValue === null) return ''
  return formatAssessmentDetailValue(entry, currentValue)
}

function formatAssessmentDetailValue(entry: AssessmentEntryLike, value: number) {
  if (isAssessmentRatioEntry(entry)) return formatAssessmentRatioValue(value)

  const unit = typeof entry.unit === 'string' ? entry.unit.trim() : ''
  if (entry.expressionBasis === 'PER_100G_DRY_MATTER') {
    const shouldUsePercent =
      unit === '' ||
      unit === '%' ||
      (unit === 'g' && resolveAssessmentCategory(entry) === 'MACRO')
    const suffix = shouldUsePercent ? '%' : `${unit}/100g`
    return `${formatCompactAssessmentNumber(value)}${suffix}`
  }

  return `${formatCompactAssessmentNumber(value)}${unit}`
}

function readSupplementalMacroValue(
  definition: (typeof SUPPLEMENTAL_MACRO_ROWS)[number],
  context: AssessmentBuildContext,
) {
  if (definition.metricKey === 'energyDensity') {
    return readFiniteNumber(context.energyDensityKcalPerKg) ?? readMetricNumber(findMetric(context, definition), [
      'total',
      'currentValue',
      'current',
      'value',
    ])
  }

  if (definition.metricKey === 'moisture') {
    return readMoisturePercent(context, findMetric(context, definition))
  }

  return readMetricNumber(findMetric(context, definition), ['per1000Kcal', 'currentValue', 'current', 'value'])
}

function readSupplementalMacroDryMatterValue(
  definition: (typeof SUPPLEMENTAL_MACRO_ROWS)[number],
  context: AssessmentBuildContext,
) {
  return readMetricNumber(findMetric(context, definition), ['dryMatterPercent'])
}

function readMoisturePercent(
  context: AssessmentBuildContext,
  metric?: AssessmentMacroMetricLike | number | null,
) {
  const directPercent = readMetricNumber(metric, ['percent', 'currentValue', 'current', 'value'])
  if (directPercent !== null) return directPercent

  const totalWeightG = readFiniteNumber(context.totalWeightG)
  const moistureTotal = readMetricNumber(metric, ['total'])
  if (totalWeightG !== null && totalWeightG > 0 && moistureTotal !== null) {
    return (moistureTotal / totalWeightG) * 100
  }

  const dryMatterG = readFiniteNumber(context.dryMatterG)
  if (totalWeightG !== null && totalWeightG > 0 && dryMatterG !== null) {
    return ((totalWeightG - dryMatterG) / totalWeightG) * 100
  }

  return null
}

function findMetric(
  context: AssessmentBuildContext,
  definition: (typeof SUPPLEMENTAL_MACRO_ROWS)[number],
) {
  const sources = [context.macroMetrics, context.nutrients, context.calculatedNutrition, context.nutrition]

  for (const source of sources) {
    if (!source) continue
    for (const alias of definition.aliases) {
      const value = source[alias]
      if (value !== undefined) return value
    }
  }

  return undefined
}

function readMetricNumber(
  metric: AssessmentMacroMetricLike | number | null | undefined,
  keys: Array<keyof AssessmentMacroMetricLike>,
) {
  const numericMetric = readFiniteNumber(metric)
  if (numericMetric !== null) return numericMetric
  if (!metric || typeof metric !== 'object') return null

  for (const key of keys) {
    const value = readFiniteNumber(metric[key])
    if (value !== null) return value
  }

  return null
}

function normalizeKey(value: string) {
  return value.replace(/[_\s-]/g, '').toLowerCase()
}

function resolveAssessmentCategory(entry: AssessmentEntryLike): AssessmentCategoryKey {
  const category = entry.category
  if (category === 'MACRO') return 'MACRO'
  if (category === 'AMINO_ACID') return 'AMINO_ACID'
  if (category === 'FATTY_ACID') return 'FATTY_ACID'
  if (category === 'MINERAL' || category === 'TRACE_ELEMENT') return 'MINERAL'
  if (category === 'VITAMIN') return 'VITAMIN'

  const text = `${entry.nutrientKey || entry.key || ''} ${entry.label || entry.name || entry.nutrientName || ''}`.toLowerCase()

  if (/vitamin|维生素/.test(text)) return 'VITAMIN'
  if (/epa|dha|omega|欧米伽|linoleic|linolenic|arachidonic|脂肪酸|亚油酸|花生四烯酸/.test(text)) {
    return 'FATTY_ACID'
  }
  if (/methionine|cystine|lysine|arginine|histidine|isoleucine|leucine|phenylalanine|threonine|tryptophan|valine|氨|赖氨酸|蛋氨酸/.test(text)) {
    return 'AMINO_ACID'
  }
  if (/calcium|phosphorus|sodium|potassium|chloride|magnesium|iron|copper|zinc|manganese|iodine|selenium|钙|磷|钠|钾|氯|镁|铁|铜|锌|锰|碘|硒/.test(text)) {
    return 'MINERAL'
  }

  return 'MACRO'
}

function getEntryStatusPriority(status?: string) {
  switch (status) {
    case 'MISSING_DATA':
      return 4
    case 'EXCESS':
      return 3
    case 'DEFICIENT':
      return 2
    case 'COMPLIANT':
      return 1
    case 'INFO':
      return 0
    default:
      return 0
  }
}

function readAssessmentNumber(entry?: AssessmentEntryLike) {
  if (!entry) return null
  const value = entry.currentValue ?? entry.current ?? entry.actual ?? entry.value
  return readFiniteNumber(value)
}

function readAssessmentTargetNumber(
  entry: AssessmentEntryLike | undefined,
  keys: Array<keyof AssessmentEntryLike>,
) {
  if (!entry) return null
  for (const key of keys) {
    const value = readFiniteNumber(entry[key])
    if (value !== null) return value
  }
  return null
}

function isAssessmentRatioEntry(entry: AssessmentEntryLike) {
  const unit = String(entry.unit || '').toLowerCase()
  return entry.expressionBasis === 'RATIO' || entry.category === 'RATIO' || unit === 'ratio' || unit === ':1'
}

function readFiniteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function formatAssessmentNumber(value: number) {
  if (!Number.isFinite(value)) return '-'
  if (Math.abs(value) >= 100) return value.toFixed(0)
  if (Math.abs(value) >= 10) return value.toFixed(1)
  return value.toFixed(2)
}

function formatCompactAssessmentNumber(value: number) {
  const rounded = Math.round(value * 100) / 100
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(/0+$/, '').replace(/\.$/, '')
}

function getEntryDisplayOrder(entry: AssessmentEntryLike) {
  return typeof entry.displayOrder === 'number' ? entry.displayOrder : 0
}

export function getScenarioLabel(scenario?: string) {
  return FEDIAF_DOG_SCENARIO_LABELS[scenario as FediafDogScenario] || scenario || '未设置'
}

export function getSummaryCount(summary: AssessmentSummaryLike | undefined, key: keyof AssessmentSummaryLike) {
  if (!summary) return 0
  const value = summary[key]
  return typeof value === 'number' ? value : 0
}

export function normalizeAssessmentSummary(summary?: AssessmentSummaryLike) {
  return {
    compliant: getSummaryCount(summary, 'compliant') || getSummaryCount(summary, 'compliantCount'),
    deficient: getSummaryCount(summary, 'deficient') || getSummaryCount(summary, 'deficientCount'),
    excess: getSummaryCount(summary, 'excess') || getSummaryCount(summary, 'excessCount'),
    missingData: getSummaryCount(summary, 'missingData') || getSummaryCount(summary, 'missingDataCount'),
  }
}
