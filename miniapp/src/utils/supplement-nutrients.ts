export interface ActiveNutrientValue {
  value: number
  unit: string
}

export interface SupplementTarget {
  fieldPath: string
  label: string
  targetValuePerKg: number
  unit: string
}

export interface SupplementTargetBreakdown {
  target: SupplementTarget
  concentration: number
  totalNutrientNeeded: number
  amount: number
}

export interface CalculateSupplementAmountOptions {
  includeProductionLoss?: boolean
}

function normalizeLegacyTargetLabel(value: unknown): string {
  return String(value || '').trim().replace(/\s+/g, '')
}

function getLegacyActiveNutrients(item: any): Record<string, ActiveNutrientValue> {
  return (
    item?.properties?.active_nutrients ||
    item?.activeNutrients ||
    item?.active_nutrients ||
    item?.ingredient?.properties?.active_nutrients ||
    {}
  )
}

function getLegacyTarget(item: any): SupplementTarget | undefined {
  const targetKey = normalizeLegacyTargetLabel(
    item?.nutrientTargetKey ||
      item?.nutrient_target_key ||
      item?.ingredient?.nutrientTargetKey ||
      item?.ingredient?.nutrient_target_key
  )
  const targetValue = Number(
    item?.nutrientTargetValue ??
      item?.nutrient_target_value ??
      item?.ingredient?.nutrientTargetValue ??
      item?.ingredient?.nutrient_target_value
  )

  if (!targetKey || !Number.isFinite(targetValue) || targetValue <= 0) {
    return undefined
  }

  const activeNutrient = getLegacyActiveNutrients(item)[targetKey]
  const unit = activeNutrient?.unit || ''
  return {
    fieldPath: targetKey,
    label: targetKey,
    targetValuePerKg: targetValue,
    unit
  }
}

export function getSupplementTargets(item: any): SupplementTarget[] {
  const targets =
    item?.supplementTargets ||
    item?.supplement_targets ||
    item?.ingredient?.supplementTargets ||
    item?.ingredient?.supplement_targets ||
    []

  const normalizedTargets = Array.isArray(targets)
    ? targets.filter((target) => target?.fieldPath && target?.targetValuePerKg)
    : []

  if (normalizedTargets.length > 0) {
    return normalizedTargets
  }

  const legacyTarget = getLegacyTarget(item)
  return legacyTarget ? [legacyTarget] : []
}

function getNutritionProfile(item: any): any {
  return (
    item?.nutritionProfile ||
    item?.nutrition_profile_snapshot ||
    item?.ingredient?.nutritionProfile ||
    item?.ingredient?.nutrition_profile_snapshot ||
    null
  )
}

function getRawBasisType(item: any): string {
  const nutritionProfile = getNutritionProfile(item)
  if (Array.isArray(nutritionProfile?.items)) {
    return mapLegacyBasisType(nutritionProfile.items[0]?.basisType)
  }

  return nutritionProfile?.meta?.rawBasisType || 'PER_100_G'
}

function hasUnsupportedExplicitRawBasisType(nutritionProfile: any): boolean {
  const rawBasisType = nutritionProfile?.meta?.rawBasisType
  return (
    typeof rawBasisType === 'string' &&
    ![
      'PER_100_G',
      'PER_100_ML',
      'PER_1_G',
      'PER_1_ML',
      'PER_SERVING'
    ].includes(rawBasisType)
  )
}

export function getNutritionProfileFieldValue(
  nutritionProfile: any,
  fieldPath: string
): number | undefined {
  const [tabKey, fieldKey] = fieldPath.split('.')
  const value = nutritionProfile?.[tabKey]?.[fieldKey]

  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function normalizeNutritionKey(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[.\s_-]+/g, '')
}

function mapLegacyBasisType(value: unknown): string {
  if (value === 'PER_1_PCS') {
    return 'PER_SERVING'
  }

  return [
    'PER_100_G',
    'PER_100_ML',
    'PER_1_G',
    'PER_1_ML',
    'PER_SERVING'
  ].includes(String(value))
    ? String(value)
    : 'PER_100_G'
}

function resolveValueByBasis(value: number, rawBasisType: string): number | undefined {
  switch (rawBasisType) {
    case 'PER_100_G':
    case 'PER_100_ML':
      return value / 100
    case 'PER_1_G':
    case 'PER_1_ML':
    case 'PER_SERVING':
      return value
    default:
      return undefined
  }
}

function resolveLegacyNutritionItemConcentration(
  nutritionProfile: any,
  target: SupplementTarget
): number | undefined {
  if (!Array.isArray(nutritionProfile?.items)) {
    return undefined
  }

  const [, fieldKey = target.fieldPath] = target.fieldPath.split('.')
  const targetKeys = new Set(
    [
      target.fieldPath,
      fieldKey,
      target.label
    ].map(normalizeNutritionKey)
  )
  const item = nutritionProfile.items.find((item: any) =>
    [
      item?.nutrientCode,
      item?.nutrientName
    ].map(normalizeNutritionKey).some((key) => targetKeys.has(key))
  )
  const value = Number(item?.value)
  if (!Number.isFinite(value) || value <= 0) {
    return undefined
  }

  return resolveValueByBasis(value, mapLegacyBasisType(item?.basisType))
}

function resolveNutritionProfileConcentration(
  nutritionProfile: any,
  fieldPath: string
): number | undefined {
  const value = getNutritionProfileFieldValue(nutritionProfile, fieldPath)
  if (value === undefined || value <= 0) {
    return undefined
  }

  const rawBasisType =
    nutritionProfile?.meta?.rawBasisType || 'PER_100_G'

  return resolveValueByBasis(value, rawBasisType)
}

function getSupplementConcentration(item: any, target: SupplementTarget): number | undefined {
  const nutritionProfile = getNutritionProfile(item)
  if (hasUnsupportedExplicitRawBasisType(nutritionProfile)) {
    return undefined
  }

  const nutritionProfileValue = resolveNutritionProfileConcentration(
    nutritionProfile,
    target.fieldPath
  )
  if (nutritionProfileValue !== undefined) {
    return nutritionProfileValue
  }

  const legacyNutritionProfileValue = resolveLegacyNutritionItemConcentration(
    nutritionProfile,
    target
  )
  if (legacyNutritionProfileValue !== undefined) {
    return legacyNutritionProfileValue
  }

  const activeNutrients = getLegacyActiveNutrients(item)
  const legacyTargetKey = normalizeLegacyTargetLabel(target.fieldPath)
  const legacyLabelKey = normalizeLegacyTargetLabel(target.label)
  const activeNutrient =
    activeNutrients[legacyTargetKey] ||
    activeNutrients[legacyLabelKey] ||
    activeNutrients[target.fieldPath] ||
    activeNutrients[target.label]
  const value = Number(activeNutrient?.value)

  return Number.isFinite(value) ? value : undefined
}

export function getSupplementTargetBreakdowns(
  item: any,
  totalFoodInputWeightG: number
): SupplementTargetBreakdown[] {
  const foodInputWeightKG = totalFoodInputWeightG / 1000

  return getSupplementTargets(item)
    .map((target) => {
      const concentration = getSupplementConcentration(item, target)

      if (!concentration || concentration <= 0) {
        return null
      }

      const totalNutrientNeeded = foodInputWeightKG * Number(target.targetValuePerKg)
      return {
        target,
        concentration,
        totalNutrientNeeded,
        amount: totalNutrientNeeded / concentration
      }
    })
    .filter((item): item is SupplementTargetBreakdown => !!item)
}

export function getResolvedSupplementNutrient(
  item: any
): ActiveNutrientValue | undefined {
  const firstTarget = getSupplementTargets(item)[0]
  if (!firstTarget) {
    return undefined
  }

  const concentration = getSupplementConcentration(item, firstTarget)

  return concentration
    ? {
        value: concentration,
        unit: firstTarget.unit
      }
    : undefined
}

export function getResolvedSupplementNutrientUnit(item: any): string {
  return getSupplementTargets(item)[0]?.unit || ''
}

export function getResolvedSupplementDisplayUnit(item: any): string {
  const rawBasisType = getRawBasisType(item)
  const fallbackUnit =
    rawBasisType === 'PER_1_ML' || rawBasisType === 'PER_100_ML'
      ? 'ml'
      : rawBasisType === 'PER_SERVING'
        ? 'serving'
        : 'g'

  return (
    item?.displayUnit ||
    item?.unit_display_label ||
    item?.unitDisplayLabel ||
    item?.ingredient?.displayUnit ||
    item?.ingredient?.unitDisplayLabel ||
    item?.unit ||
    fallbackUnit
  )
}

function getProductionLossRate(item: any): number {
  const lossRate = Number(
    item?.properties?.production_loss_rate ??
      item?.productionLossRate ??
      item?.production_loss_rate ??
      item?.ingredient?.properties?.production_loss_rate ??
      1
  )

  return Number.isFinite(lossRate) && lossRate > 0 ? lossRate : 1
}

function getPositiveNumber(value: unknown): number | undefined {
  const normalized = Number(value)
  return Number.isFinite(normalized) && normalized > 0 ? normalized : undefined
}

function getFixedRatioSupplementAmount(
  item: any,
  totalFoodInputWeightG: number,
  options: CalculateSupplementAmountOptions
): number | undefined {
  const ratioPercent =
    getPositiveNumber(item?.ratio) ??
    getPositiveNumber(item?.ratioPercent) ??
    getPositiveNumber(item?.ratio_percent)

  if (!ratioPercent) {
    return undefined
  }

  const amount = totalFoodInputWeightG * (ratioPercent / 100)
  if (!Number.isFinite(amount) || amount <= 0) {
    return undefined
  }

  return options.includeProductionLoss
    ? amount * getProductionLossRate(item)
    : amount
}

export function formatSupplementTargets(item: any): string {
  return getSupplementTargets(item)
    .map((target) => {
      const raw = Number(target.targetValuePerKg)
      const value = Number.isFinite(raw) ? Math.round(raw) : target.targetValuePerKg
      return `每公斤食材添加${value}${target.unit}${target.label}`
    })
    .join('、')
}

/**
 * 「需额外补充的营养素」的一行：**营养素名 + 每公斤食材添加浓度**。
 *
 * 顾客要看的是"补什么、补多少"（钙 / 锌 / 维生素 D），
 * 不是"买哪瓶"（补剂产品名）或"什么时候加"。
 */
export interface SupplementNutrientRow {
  nutrient: string
  concentration: string
}

/**
 * 把补剂的**营养素目标**摊平成「营养素 / 添加浓度」两列表格行（2026-11-07）。
 *
 * 交付页（快照里的 `supplements[].targets`）和食谱详情页（原料上的
 * `supplementTargets`）都走这一个函数 —— 两个页面的口径必须一模一样，
 * 各写一份迟早漂移成"每公斤加 5g"和"每kg加 5 克"两种说法。
 *
 * · 没有营养素名（老数据只有补剂产品）→ 跳过，不显示一行空白；
 * · 没有数值（含空字符串）→ 「—」（不知道 ≠ 0）；
 * · 没有单位 → 只写数字，不猜单位（猜错比不写更糟）；
 * · 不足 1 的正数保留一位小数 —— 直接取整会把 0.4 mg 写成 0 mg，
 *   顾客会读成"没加"，而它其实是有效添加量；
 * · **同一营养素合并成一行**（2026-11-08 老板反馈改的）：
 *   一个食谱里常有不止一种钙源（钙粉 + 骨粉，为了调钙磷比），
 *   每个补剂的目标值只代表**它自己那一份**贡献，
 *   原来分成两行「钙 1364 mg」「钙 719 mg」，顾客会读成"钙要加两次"。
 *   现在合成一行合计（2083 mg）—— 这才是"每公斤要补多少钙"。
 *   合并只在**单位可换算**时做（都是质量单位，按最小单位相加）；
 *   单位不可换算（如 IU 与 μg）时宁可不合并，也不硬加；
 *   组里只要有一个值未知，合计就给「—」，不用已知部分冒充总数。
 */
export function buildSupplementNutrientRows(
  supplements:
    | Array<{
        targets?: Array<{
          label?: string | null
          targetValuePerKg?: number | null
          unit?: string | null
        }> | null
      }>
    | null
    | undefined
): SupplementNutrientRow[] {
  const groups = new Map<string, Array<{ value: number; unit: string }>>()

  for (const supplement of supplements || []) {
    for (const target of supplement?.targets || []) {
      const nutrient = String(target?.label ?? '').trim()
      if (!nutrient) continue

      const raw = target?.targetValuePerKg
      const value =
        raw === null ||
        raw === undefined ||
        (typeof raw === 'string' && raw.trim() === '')
          ? Number.NaN
          : Number(raw)
      const unit = String(target?.unit ?? '').trim()

      const bucket = groups.get(nutrient)
      if (bucket) {
        bucket.push({ value, unit })
      } else {
        groups.set(nutrient, [{ value, unit }])
      }
    }
  }

  const rows: SupplementNutrientRow[] = []

  for (const [nutrient, entries] of groups) {
    if (entries.length === 1) {
      rows.push({
        nutrient,
        concentration: buildConcentrationText(entries[0].value, entries[0].unit)
      })
      continue
    }

    const merged = mergeSameNutrient(entries)
    if (!merged) {
      // 单位不可换算：不硬加，各自成行（比编一个错的合计更诚实）
      for (const entry of entries) {
        rows.push({
          nutrient,
          concentration: buildConcentrationText(entry.value, entry.unit)
        })
      }
      continue
    }

    rows.push({ nutrient, concentration: merged })
  }

  return rows
}

/** 质量单位 → mg 的换算系数；不在表里的（IU、片、勺…）不参与合并 */
const MASS_UNIT_TO_MG: Record<string, number> = {
  μg: 0.001,
  ug: 0.001,
  mcg: 0.001,
  mg: 1,
  g: 1000,
  kg: 1000000
}

function normalizeUnitForMerge(unit: string): string {
  return unit.trim().replace(/µ/g, 'μ').toLowerCase()
}

/** 质量单位 → mg 的系数；不是质量单位（IU / 片 / 勺…）时返回 undefined */
function massUnitFactor(unit: string): number | undefined {
  const key = normalizeUnitForMerge(unit)
  return Object.prototype.hasOwnProperty.call(MASS_UNIT_TO_MG, key)
    ? MASS_UNIT_TO_MG[key]
    : undefined
}

/**
 * 合计同一营养素的多个目标值；单位不可换算时返回 `null`（调用方各自成行）。
 *
 * 换算规则：都是质量单位就统一到**其中最小的单位**（如 mg + g → mg），
 * 避免先换到 g 再取整时把 719 mg 抹成 1 g。
 */
function mergeSameNutrient(
  entries: Array<{ value: number; unit: string }>
): string | null {
  const factors = entries.map((entry) => massUnitFactor(entry.unit))
  const normalizedUnits = entries.map((entry) => normalizeUnitForMerge(entry.unit))
  const unitsAreIdentical = normalizedUnits.every(
    (unit) => unit === normalizedUnits[0]
  )

  if (!unitsAreIdentical && factors.some((factor) => factor === undefined)) {
    return null
  }

  // 单位一致时按原样相加；不一致时统一到其中最小的质量单位
  const displayFactor = unitsAreIdentical
    ? 1
    : Math.min(...(factors as number[]))
  const displayUnitIndex = unitsAreIdentical
    ? 0
    : factors.findIndex((factor) => factor === displayFactor)
  const displayUnit = entries[displayUnitIndex].unit

  if (!entries.every((entry) => Number.isFinite(entry.value))) {
    return '—'
  }

  const total = entries.reduce((sum, entry, index) => {
    const factor = unitsAreIdentical ? 1 : (factors[index] as number)
    return sum + (entry.value * factor) / displayFactor
  }, 0)

  return buildConcentrationText(roundConcentrationTotal(total), displayUnit)
}

/** 合并相加后的浮点噪声（0.1 + 0.2）：小数位比显示精度多留两位再格式化 */
function roundConcentrationTotal(value: number): number {
  return Math.round(value * 1000) / 1000
}

function buildConcentrationText(value: number, unit: string): string {
  return Number.isFinite(value)
    ? `每公斤食材添加 ${formatConcentrationValue(value)} ${unit}`.trim()
    : '—'
}

/**
 * 从**食谱原料**里摊出「需额外补充的营养素」行（2026-11-08）。
 *
 * 详情页原来在 computed 里自己 `map + getSupplementTargets`，接线一改（比如漏传
 * items）整块就永远不渲染，而页面级守卫只会断言"源码里出现过某个函数名"。
 * 收成一个函数后，行为可以在单测里用真实原料夹具验。
 */
export function buildSupplementNutrientRowsFromItems(
  items: any[] | null | undefined
): SupplementNutrientRow[] {
  const groups = (items || []).map((item) => ({
    targets: getSupplementTargets(item),
  }));
  return buildSupplementNutrientRows(groups);
}

/**
 * 添加浓度的数字写法：常规按整数（营养师定的目标就是这个量级），
 * 只有"取整后会变成 0"的小数值才保留一位小数，极小值写「<0.1」而不是「0」。
 */
function formatConcentrationValue(value: number): string {
  if (value === 0) return '0'

  const rounded = Math.round(value)
  if (rounded !== 0) return String(rounded)

  const oneDecimal = Math.round(value * 10) / 10
  return Math.abs(oneDecimal) >= 0.1 ? String(oneDecimal) : '<0.1'
}

export function calculateSupplementAmountForProduction(
  item: any,
  totalFoodInputWeightG: number,
  options: CalculateSupplementAmountOptions = {}
): { amount: number; unit: string } {
  const unit = getResolvedSupplementDisplayUnit(item)
  const breakdowns = getSupplementTargetBreakdowns(item, totalFoodInputWeightG)

  if (breakdowns.length === 0) {
    const fixedRatioAmount = getFixedRatioSupplementAmount(
      item,
      totalFoodInputWeightG,
      options
    )
    if (fixedRatioAmount !== undefined) {
      return {
        amount: fixedRatioAmount,
        unit
      }
    }

    return {
      amount: 0,
      unit
    }
  }

  const limitingBreakdown = breakdowns.reduce((max, current) =>
    current.amount > max.amount ? current : max
  )

  return {
    amount: options.includeProductionLoss
      ? limitingBreakdown.amount * getProductionLossRate(item)
      : limitingBreakdown.amount,
    unit
  }
}
