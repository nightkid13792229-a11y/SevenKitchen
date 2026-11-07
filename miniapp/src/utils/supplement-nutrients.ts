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
 * · 没有数值 → 「—」（不知道 ≠ 0）；
 * · 没有单位 → 只写数字，不猜单位（猜错比不写更糟）。
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
  const rows: SupplementNutrientRow[] = []

  for (const supplement of supplements || []) {
    for (const target of supplement?.targets || []) {
      const nutrient = String(target?.label ?? '').trim()
      if (!nutrient) continue

      const raw = target?.targetValuePerKg
      const value = raw === null || raw === undefined ? Number.NaN : Number(raw)
      const unit = String(target?.unit ?? '').trim()

      rows.push({
        nutrient,
        concentration: Number.isFinite(value)
          ? `每公斤食材添加 ${Math.round(value)} ${unit}`.trim()
          : '—'
      })
    }
  }

  return rows
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
