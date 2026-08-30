/**
 * Web 配方发布页的完整营养评估报告构建。
 * 参考小程序 publish.vue（publish-report.ts）的报告结构：
 * 原料清单 / 宏量营养分析 / 能量密度 / 四类营养素分区（微量/维生素/氨基酸/脂肪酸）。
 * 数据来自 Web 端评估结果（DesignRecipeAssessmentResult），
 * 每项营养素的干物质值取自对应细节条目的 PER_100G_DRY_MATTER 子项。
 */

const MACRO_ROW_DEFINITIONS = [
  { key: 'crudeProtein', name: '蛋白质', energyFactor: 3.5 },
  { key: 'crudeFat', name: '脂肪', energyFactor: 8.5 },
  { key: 'ash', name: '灰分', energyFactor: 0 },
  { key: 'moisture', name: '水分', energyFactor: 0 },
  { key: 'fiber', name: '膳食纤维', energyFactor: 0 },
  { key: 'carbohydrate', name: '碳水', energyFactor: 3.5 },
] as const

interface NutrientSection {
  key: string
  category: string
  title: string
  dryMatterHeader: string
}

const NUTRIENT_SECTIONS: NutrientSection[] = [
  { key: 'minerals', category: 'MINERAL', title: '微量元素', dryMatterHeader: '/100gDM' },
  { key: 'vitamins', category: 'VITAMIN', title: '维生素', dryMatterHeader: '/100gDM' },
  { key: 'aminoAcids', category: 'AMINO_ACID', title: '氨基酸', dryMatterHeader: '/100gDM' },
  { key: 'fattyAcids', category: 'FATTY_ACID', title: '脂肪酸', dryMatterHeader: '/100gDM' },
]

export interface PublishIngredientReportRow {
  ingredientName: string
  amountLabel: string
  weightPercentLabel: string
}

export interface PublishMacroReportRow {
  key: string
  name: string
  weightPercentLabel: string
  dryMatterLabel: string
  energyPercentLabel: string
}

export interface PublishEnergyDensityRow {
  label: string
  value: string
}

export interface PublishNutrientReportRow {
  key: string
  name: string
  unit: string
  minLabel: string
  maxLabel: string
  currentLabel: string
  dryMatterLabel: string
  statusClass: string
}

export interface PublishNutrientSection {
  key: string
  title: string
  dryMatterHeader: string
  rows: PublishNutrientReportRow[]
}

export interface PublishNutritionReport {
  ingredientRows: PublishIngredientReportRow[]
  macroRows: PublishMacroReportRow[]
  energyDensityRows: PublishEnergyDensityRow[]
  nutrientSections: PublishNutrientSection[]
}

export function buildPublishNutritionReport(input: {
  draft?: any
  assessment?: any
}): PublishNutritionReport {
  const assessment = input.assessment || {}
  const draft = input.draft || {}
  const draftItems = Array.isArray(draft.items) ? draft.items : []
  const assessedItems = Array.isArray(assessment.items) ? assessment.items : []
  const draftItemById: Map<string, any> = new Map(
    draftItems.map((item: any) => [String(item.id || ''), item])
  )

  return {
    ingredientRows: buildIngredientRows(draftItems, assessedItems, draftItemById),
    macroRows: buildMacroRows(assessment),
    energyDensityRows: buildEnergyDensityRows(assessment),
    nutrientSections: buildNutrientSections(assessment),
  }
}

function buildIngredientRows(
  draftItems: any[],
  assessedItems: any[],
  draftItemById: Map<string, any>,
): PublishIngredientReportRow[] {
  const sourceItems = assessedItems.length > 0 ? assessedItems : draftItems

  return sourceItems.map((item: any) => {
    const draftItem = draftItemById.get(String(item.id || '')) || item
    const supplement = isSupplementItem(draftItem) || isSupplementItem(item)
    return {
      ingredientName: getIngredientReportName(draftItem, item, supplement),
      amountLabel: getIngredientAmountLabel(draftItem, item),
      weightPercentLabel: supplement
        ? '-'
        : formatPercent(readNumber(item.ratioPercent ?? draftItem.ratioPercent), 1),
    }
  })
}

function buildMacroRows(assessment: any): PublishMacroReportRow[] {
  const macroMetrics = assessment?.macroMetrics || {}
  const totalWeightG = readNumber(assessment?.totalWeightG)
  const totalEnergyKcal = readNumber(assessment?.totalEnergyKcal)

  return MACRO_ROW_DEFINITIONS.map((definition) => {
    const metric = macroMetrics[definition.key] || {}
    const total = readNumber(metric.total)
    const dryMatterPercent = readNumber(metric.dryMatterPercent)
    const energyPercent =
      total !== null && totalEnergyKcal !== null && totalEnergyKcal > 0
        ? (total * definition.energyFactor * 100) / totalEnergyKcal
        : null

    return {
      key: definition.key,
      name: definition.name,
      weightPercentLabel:
        total !== null && totalWeightG !== null && totalWeightG > 0
          ? formatPercent((total * 100) / totalWeightG, 1)
          : '-',
      dryMatterLabel: dryMatterPercent === null ? '-' : formatPercent(dryMatterPercent, 1),
      energyPercentLabel: energyPercent === null ? '-' : formatPercent(energyPercent, 1),
    }
  })
}

function buildEnergyDensityRows(assessment: any): PublishEnergyDensityRow[] {
  const energyDensity = readNumber(assessment?.energyDensityKcalPerKg)
  const dryMatterEnergyPerKg = readDryMatterEnergyDensityPerKg(assessment)

  return [
    { label: '每公斤配方', value: formatEnergyDensity(energyDensity, 'kcal/kg') },
    { label: '每公斤干物质', value: formatEnergyDensity(dryMatterEnergyPerKg, 'kcal/kg DM') },
  ]
}

function buildNutrientSections(assessment: any): PublishNutrientSection[] {
  const entries = Array.isArray(assessment?.groupedEntries)
    ? assessment.groupedEntries
    : Array.isArray(assessment?.entries)
      ? assessment.entries
      : []

  return NUTRIENT_SECTIONS.map((section) => {
    const sectionEntries = entries.filter(
      (entry: any) => String(entry?.category || '').toUpperCase() === section.category,
    )
    return {
      key: section.key,
      title: section.title,
      dryMatterHeader: section.dryMatterHeader,
      rows: sectionEntries.map((entry: any) => buildNutrientRow(entry)),
    }
  })
}

function buildNutrientRow(entry: any): PublishNutrientReportRow {
  const details = Array.isArray(entry.details) ? entry.details : []
  const basisEntry =
    details.find((detail: any) => detail.expressionBasis === 'PER_1000_KCAL_ME') || entry
  const dryMatterEntry =
    details.find((detail: any) => detail.expressionBasis === 'PER_100G_DRY_MATTER') ||
    (entry.expressionBasis === 'PER_100G_DRY_MATTER' ? entry : undefined)
  const dryMatterValue = dryMatterEntry ? readNumber(dryMatterEntry.currentValue) : null
  const ratio = isRatioEntry(basisEntry)
  const unit = ratio
    ? '比例'
    : cleanText(basisEntry.unit || entry.unit) || '-'

  return {
    key: cleanText(basisEntry.nutrientKey || entry.nutrientKey || entry.key),
    name: cleanText(basisEntry.label || entry.label || entry.name || entry.nutrientName || entry.key),
    unit: unit,
    minLabel: formatNutrientValue(readTargetNumber(basisEntry), ratio),
    maxLabel: formatNutrientValue(readMaxNumber(basisEntry), ratio),
    currentLabel: formatNutrientValue(readNumber(basisEntry.currentValue), ratio),
    dryMatterLabel: ratio ? '' : formatDryMatterValue(dryMatterValue),
    statusClass: getStatusClass(entry),
  }
}

function getIngredientReportName(draftItem: any, assessedItem: any, supplement: boolean) {
  const baseName = getIngredientProfileName(draftItem, assessedItem)
  if (!supplement) return baseName

  const detailLabel = getSupplementBrandSpecLabel(draftItem, assessedItem)
  if (detailLabel && baseName.includes(detailLabel)) return baseName
  return detailLabel ? `${baseName}（${detailLabel}）` : baseName
}

function getIngredientProfileName(draftItem: any, assessedItem: any) {
  return (
    cleanText(draftItem?.nutritionProfileDisplayName) ||
    cleanText(draftItem?.nutritionFoodName) ||
    cleanText(draftItem?.nutritionFood?.displayNameZh) ||
    cleanText(draftItem?.nutritionFood?.name) ||
    cleanText(assessedItem?.nutritionProfileDisplayName) ||
    cleanText(assessedItem?.name) ||
    cleanText(draftItem?.ingredientName) ||
    cleanText(draftItem?.ingredient?.name) ||
    '未命名原料'
  )
}

function getSupplementBrandSpecLabel(draftItem: any, assessedItem: any) {
  const sources = [draftItem?.ingredient, assessedItem?.ingredient, draftItem, assessedItem]
  const brand = firstCleanText(sources, ['brand'])
  const productModel = firstCleanText(sources, [
    'productModel',
    'product_model',
    'spec',
    'specification',
    'model',
  ])
  const parts = [brand, productModel].filter(Boolean)
  return Array.from(new Set(parts)).join(' · ')
}

function firstCleanText(sources: any[], keys: string[]) {
  for (const source of sources) {
    const properties = readProperties(source)
    for (const key of keys) {
      const direct = cleanText(source?.[key])
      if (direct) return direct
      const nested = cleanText(properties?.[key])
      if (nested) return nested
    }
  }
  return ''
}

function isSupplementItem(item: any) {
  return cleanText(item?.ingredient?.type || item?.ingredientType).toUpperCase() === 'SUPPLEMENT'
}

function getIngredientAmountLabel(draftItem: any, assessedItem: any) {
  const amount = readNumber(
    assessedItem?.weightG ??
      assessedItem?.amount ??
      assessedItem?.quantity ??
      draftItem?.weightG ??
      draftItem?.amount ??
      draftItem?.quantity,
  )
  if (amount === null) return '-'
  return `${formatCompactNumber(amount)}${getIngredientAmountUnit(draftItem, assessedItem)}`
}

function getIngredientAmountUnit(draftItem: any, assessedItem: any) {
  if (!isSupplementItem(draftItem) && !isSupplementItem(assessedItem)) return 'g'
  return (
    readIngredientDisplayUnit(draftItem?.ingredient) ||
    readIngredientDisplayUnit(assessedItem?.ingredient) ||
    readIngredientDisplayUnit(draftItem) ||
    readIngredientDisplayUnit(assessedItem) ||
    'g'
  )
}

function readIngredientDisplayUnit(source: any) {
  const properties = readProperties(source)
  const directUnit =
    cleanText(source?.unitDisplayLabel) ||
    cleanText(source?.displayUnit) ||
    cleanText(source?.display_unit) ||
    cleanText(properties?.unitDisplayLabel) ||
    cleanText(properties?.displayUnit) ||
    cleanText(properties?.display_unit) ||
    cleanText(properties?.servingUnitLabel) ||
    cleanText(source?.purchaseUnit) ||
    cleanText(source?.unit)
  if (directUnit) return directUnit
  return (
    cleanText(properties?.amountUnitLabel) ||
    cleanText(properties?.purchaseUnit) ||
    cleanText(properties?.unit)
  )
}

function readProperties(source: any) {
  return typeof source?.properties === 'string' ? safeParseJson(source.properties) : source?.properties
}

function safeParseJson(value: string) {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function formatDryMatterValue(value: number | null | undefined) {
  const numericValue = readNumber(value)
  if (numericValue === null) return '-'
  return formatCompactNumber(numericValue)
}

function readDryMatterEnergyDensityPerKg(assessment: any) {
  const direct = readNumber(assessment?.dryMatterEnergyKcalPerKg)
  if (direct !== null) return direct

  const per100g = readNumber(assessment?.dryMatterEnergyKcalPer100g)
  if (per100g !== null) return per100g * 10

  const totalEnergy = readNumber(assessment?.totalEnergyKcal)
  const dryMatterG = readNumber(assessment?.dryMatterG)
  if (totalEnergy !== null && dryMatterG !== null && dryMatterG > 0) {
    return (totalEnergy / dryMatterG) * 1000
  }

  return null
}

function formatEnergyDensity(value: number | null, unit: string) {
  if (value === null || !Number.isFinite(value)) return '-'
  return `${Math.round(value)} ${unit}`
}

function formatNutrientValue(value: number | null, ratio: boolean) {
  if (value === null) return '-'
  return ratio ? formatRatioValue(value) : formatCompactNumber(value)
}

function formatPercent(value: number | null, precision: number) {
  if (value === null || !Number.isFinite(value)) return '-'
  return `${value.toFixed(precision)}%`
}

function formatCompactNumber(value: number) {
  if (!Number.isFinite(value)) return '-'
  const rounded = Math.round(value * 100) / 100
  return Number.isInteger(rounded)
    ? String(rounded)
    : String(rounded).replace(/0+$/, '').replace(/\.$/, '')
}

function formatRatioValue(value: number) {
  const rounded = Math.round(value * 100) / 100
  return String(Number.isInteger(rounded) ? rounded : rounded.toFixed(2))
}

function readTargetNumber(entry: any) {
  return readNumber(entry.minValue ?? entry.targetMin ?? entry.min)
}

function readMaxNumber(entry: any) {
  return readNumber(entry.maxValue ?? entry.targetMax ?? entry.max)
}

function readNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function isRatioEntry(entry: any) {
  const key = cleanText(entry.nutrientKey || entry.key).toLowerCase()
  const unit = cleanText(entry.unit).toLowerCase()
  return entry.expressionBasis === 'RATIO' || key.includes('ratio') || unit === 'ratio'
}

function getStatusClass(entry: any): string {
  const status = String(entry?.status || '').toUpperCase()
  switch (status) {
    case 'COMPLIANT':
      return 'status-compliant'
    case 'DEFICIENT':
      return 'status-deficient'
    case 'EXCESS':
      return 'status-excess'
    case 'MISSING_DATA':
      return 'status-missing'
    default:
      return 'status-pending'
  }
}
