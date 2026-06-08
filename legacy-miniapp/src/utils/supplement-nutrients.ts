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

export function getNutritionProfileFieldValue(
  nutritionProfile: any,
  fieldPath: string
): number | undefined {
  const [tabKey, fieldKey] = fieldPath.split('.')
  const value = nutritionProfile?.[tabKey]?.[fieldKey]

  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function getSupplementConcentration(item: any, target: SupplementTarget): number | undefined {
  const nutritionProfileValue = getNutritionProfileFieldValue(
    getNutritionProfile(item),
    target.fieldPath
  )
  if (nutritionProfileValue !== undefined) {
    return nutritionProfileValue
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
  return (
    item?.displayUnit ||
    item?.unit_display_label ||
    item?.unitDisplayLabel ||
    item?.ingredient?.displayUnit ||
    item?.ingredient?.unitDisplayLabel ||
    item?.unit ||
    'g'
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

export function formatSupplementTargets(item: any): string {
  return getSupplementTargets(item)
    .map((target) => `每kg食材添加${target.targetValuePerKg}${target.unit}${target.label}`)
    .join('、')
}

export function calculateSupplementAmountForProduction(
  item: any,
  totalFoodInputWeightG: number,
  options: CalculateSupplementAmountOptions = {}
): { amount: number; unit: string } {
  const unit = getResolvedSupplementDisplayUnit(item)
  const breakdowns = getSupplementTargetBreakdowns(item, totalFoodInputWeightG)

  if (breakdowns.length === 0) {
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
