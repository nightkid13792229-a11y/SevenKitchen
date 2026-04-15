export interface ActiveNutrientValue {
  value: number
  unit: string
}

function getSupplementTargetKey(item: any): string {
  return item?.nutrientTargetKey || item?.nutrient_target_key || ''
}

function getSupplementTargetValue(item: any): number {
  const value = item?.nutrientTargetValue ?? item?.nutrient_target_value
  return typeof value === 'number' ? value : Number(value || 0)
}

function getSupplementLossRate(item: any): number {
  return (
    item?.properties?.production_loss_rate ||
    item?.ingredient?.properties?.production_loss_rate ||
    1.05
  )
}

export function getResolvedSupplementNutrient(
  item: any
): ActiveNutrientValue | undefined {
  const nutrientKey = getSupplementTargetKey(item)
  if (!nutrientKey) {
    return undefined
  }

  const sources = [
    item?.activeNutrients,
    item?.ingredient?.activeNutrients,
    item?.properties?.active_nutrients,
    item?.ingredient?.properties?.active_nutrients
  ]

  for (const source of sources) {
    const nutrient = source?.[nutrientKey]
    if (
      nutrient &&
      typeof nutrient === 'object' &&
      typeof nutrient.value === 'number' &&
      nutrient.unit
    ) {
      return {
        value: nutrient.value,
        unit: nutrient.unit
      }
    }
  }

  return undefined
}

export function getResolvedSupplementNutrientUnit(item: any): string {
  return getResolvedSupplementNutrient(item)?.unit || ''
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

export function calculateSupplementAmountForProduction(
  item: any,
  totalProductionG: number
): { amount: number; unit: string } {
  const nutrient = getResolvedSupplementNutrient(item)
  const nutrientTargetValue = getSupplementTargetValue(item)
  const unit = getResolvedSupplementDisplayUnit(item)

  if (!nutrient || !nutrientTargetValue || nutrient.value <= 0) {
    return {
      amount: 0,
      unit
    }
  }

  const finishedProductKG = totalProductionG / 1000
  const totalNutrientNeeded = finishedProductKG * nutrientTargetValue
  const baseUnits = totalNutrientNeeded / nutrient.value
  const finalUnits = baseUnits * getSupplementLossRate(item)

  return {
    amount: finalUnits,
    unit
  }
}
