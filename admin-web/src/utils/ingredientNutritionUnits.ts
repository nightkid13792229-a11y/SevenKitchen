export function normalizeIngredientNutritionUnit(unit: string): string {
  const normalized = unit.trim()
  const compact = normalized.toLowerCase()
  if (compact === 'ug' || compact === 'μg' || compact === 'mcg') {
    return 'μg'
  }
  if (compact === 'kj') {
    return 'kJ'
  }
  if (compact === 'iu') {
    return 'IU'
  }
  return normalized
}

type VitaminABasis =
  | 'IU_GENERIC'
  | 'IU_RETINOL'
  | 'MG_RETINOL'
  | 'IU_ACETATE'
  | 'MG_ACETATE'
  | 'IU_PROPIONATE'
  | 'MG_PROPIONATE'
  | 'IU_PALMITATE'
  | 'MG_PALMITATE'
  | 'IU_BETA_CAROTENE_DOG'
  | 'MG_BETA_CAROTENE_DOG'

type VitaminEBasis =
  | 'IU_GENERIC'
  | 'IU_NATURAL_D_ALPHA_TOCOPHEROL'
  | 'MG_NATURAL_D_ALPHA_TOCOPHEROL'
  | 'IU_SYNTHETIC_DL_ALPHA_TOCOPHERYL_ACETATE'
  | 'MG_SYNTHETIC_DL_ALPHA_TOCOPHERYL_ACETATE'

function parseVitaminAUnit(unit: string): VitaminABasis | null {
  switch (unit.trim()) {
    case 'IU':
      return 'IU_GENERIC'
    case 'IU（视黄醇）':
      return 'IU_RETINOL'
    case 'mg（视黄醇）':
      return 'MG_RETINOL'
    case 'IU（乙酸酯）':
      return 'IU_ACETATE'
    case 'mg（乙酸酯）':
      return 'MG_ACETATE'
    case 'IU（丙酸酯）':
      return 'IU_PROPIONATE'
    case 'mg（丙酸酯）':
      return 'MG_PROPIONATE'
    case 'IU（棕榈酸酯）':
      return 'IU_PALMITATE'
    case 'mg（棕榈酸酯）':
      return 'MG_PALMITATE'
    case 'IU（β-胡萝卜素，犬）':
      return 'IU_BETA_CAROTENE_DOG'
    case 'mg（β-胡萝卜素，犬）':
      return 'MG_BETA_CAROTENE_DOG'
    default:
      return null
  }
}

function parseVitaminEUnit(unit: string): VitaminEBasis | null {
  switch (unit.trim()) {
    case 'IU':
      return 'IU_GENERIC'
    case 'IU（天然，d-α-tocopherol）':
      return 'IU_NATURAL_D_ALPHA_TOCOPHEROL'
    case 'mg（天然，d-α-tocopherol）':
      return 'MG_NATURAL_D_ALPHA_TOCOPHEROL'
    case 'IU（合成，dl-α-tocopheryl acetate）':
      return 'IU_SYNTHETIC_DL_ALPHA_TOCOPHERYL_ACETATE'
    case 'mg（合成，dl-α-tocopheryl acetate）':
      return 'MG_SYNTHETIC_DL_ALPHA_TOCOPHERYL_ACETATE'
    default:
      return null
  }
}

export function convertIngredientNutritionMassValue(value: number, fromUnit: string, toUnit: string): number {
  const normalizedFrom = normalizeIngredientNutritionUnit(fromUnit)
  const normalizedTo = normalizeIngredientNutritionUnit(toUnit)
  const gramsPerUnitMap: Record<string, number> = {
    g: 1,
    mg: 0.001,
    'μg': 0.000001
  }
  const fromFactor = gramsPerUnitMap[normalizedFrom]
  const toFactor = gramsPerUnitMap[normalizedTo]
  if (!fromFactor || !toFactor) {
    return value
  }
  return (value * fromFactor) / toFactor
}

export function convertIngredientNutritionEnergyValue(value: number, fromUnit: string, toUnit: string): number {
  const normalizedFrom = normalizeIngredientNutritionUnit(fromUnit)
  const normalizedTo = normalizeIngredientNutritionUnit(toUnit)
  if (normalizedFrom === normalizedTo) {
    return value
  }
  if (normalizedFrom === 'kcal' && normalizedTo === 'kJ') {
    return value * 4.184
  }
  if (normalizedFrom === 'kJ' && normalizedTo === 'kcal') {
    return value / 4.184
  }
  return value
}

export function convertIngredientNutritionVitaminValue(
  fieldKey: string,
  value: number,
  fromUnit: string,
  toUnit: string
): number {
  const normalizedFrom = normalizeIngredientNutritionUnit(fromUnit)
  const normalizedTo = normalizeIngredientNutritionUnit(toUnit)
  if (normalizedFrom === normalizedTo) {
    return value
  }

  if (fieldKey === 'vitaminA') {
    const parsedFrom = parseVitaminAUnit(fromUnit)
    const parsedTo = parseVitaminAUnit(toUnit)

    const toVitaminAIu = (inputValue: number, basis: VitaminABasis | null): number => {
      switch (basis) {
        case 'IU_GENERIC':
        case 'IU_RETINOL':
        case 'IU_ACETATE':
        case 'IU_PROPIONATE':
        case 'IU_PALMITATE':
        case 'IU_BETA_CAROTENE_DOG':
          return inputValue
        case 'MG_RETINOL':
          return inputValue * 3333
        case 'MG_ACETATE':
          return inputValue * (1000 / 0.344)
        case 'MG_PROPIONATE':
          return inputValue * (1000 / 0.359)
        case 'MG_PALMITATE':
          return inputValue * (1000 / 0.55)
        case 'MG_BETA_CAROTENE_DOG':
          return inputValue * 833
        default:
          return inputValue
      }
    }

    const fromVitaminAIu = (inputValue: number, basis: VitaminABasis | null): number => {
      switch (basis) {
        case 'IU_GENERIC':
        case 'IU_RETINOL':
        case 'IU_ACETATE':
        case 'IU_PROPIONATE':
        case 'IU_PALMITATE':
        case 'IU_BETA_CAROTENE_DOG':
          return inputValue
        case 'MG_RETINOL':
          return inputValue / 3333
        case 'MG_ACETATE':
          return inputValue / (1000 / 0.344)
        case 'MG_PROPIONATE':
          return inputValue / (1000 / 0.359)
        case 'MG_PALMITATE':
          return inputValue / (1000 / 0.55)
        case 'MG_BETA_CAROTENE_DOG':
          return inputValue / 833
        default:
          return inputValue
      }
    }

    return fromVitaminAIu(toVitaminAIu(value, parsedFrom), parsedTo)
  }

  if (fieldKey === 'vitaminD') {
    if (normalizedFrom === 'IU' && normalizedTo === 'μg') {
      return value * 0.025
    }
    if (normalizedFrom === 'μg' && normalizedTo === 'IU') {
      return value / 0.025
    }
  }

  if (fieldKey === 'vitaminE') {
    const parsedFrom = parseVitaminEUnit(fromUnit)
    const parsedTo = parseVitaminEUnit(toUnit)

    const toVitaminEIu = (inputValue: number, basis: VitaminEBasis | null): number => {
      switch (basis) {
        case 'IU_GENERIC':
        case 'IU_NATURAL_D_ALPHA_TOCOPHEROL':
        case 'IU_SYNTHETIC_DL_ALPHA_TOCOPHERYL_ACETATE':
          return inputValue
        case 'MG_NATURAL_D_ALPHA_TOCOPHEROL':
          return inputValue * 1.49
        case 'MG_SYNTHETIC_DL_ALPHA_TOCOPHERYL_ACETATE':
          return inputValue
        default:
          return inputValue
      }
    }

    const fromVitaminEIu = (inputValue: number, basis: VitaminEBasis | null): number => {
      switch (basis) {
        case 'IU_GENERIC':
        case 'IU_NATURAL_D_ALPHA_TOCOPHEROL':
        case 'IU_SYNTHETIC_DL_ALPHA_TOCOPHERYL_ACETATE':
          return inputValue
        case 'MG_NATURAL_D_ALPHA_TOCOPHEROL':
          return inputValue / 1.49
        case 'MG_SYNTHETIC_DL_ALPHA_TOCOPHERYL_ACETATE':
          return inputValue
        default:
          return inputValue
      }
    }

    return fromVitaminEIu(toVitaminEIu(value, parsedFrom), parsedTo)
  }

  return convertIngredientNutritionMassValue(value, normalizedFrom, normalizedTo)
}

export function convertIngredientNutritionFieldValue(
  fieldKey: string,
  value: number,
  fromUnit: string,
  toUnit: string
): number {
  const normalizedFrom = normalizeIngredientNutritionUnit(fromUnit)
  const normalizedTo = normalizeIngredientNutritionUnit(toUnit)
  if (normalizedFrom === normalizedTo) {
    return value
  }

  if (fieldKey === 'energyKcal') {
    return convertIngredientNutritionEnergyValue(value, normalizedFrom, normalizedTo)
  }

  if (fieldKey === 'vitaminA' || fieldKey === 'vitaminD' || fieldKey === 'vitaminE') {
    return convertIngredientNutritionVitaminValue(fieldKey, value, normalizedFrom, normalizedTo)
  }

  return convertIngredientNutritionMassValue(value, normalizedFrom, normalizedTo)
}

export function getIngredientNutritionUnitStep(unit: string): number {
  const normalizedUnit = normalizeIngredientNutritionUnit(unit)
  const rawUnit = unit.trim()
  if (
    normalizedUnit === 'kcal' ||
    normalizedUnit === 'kJ' ||
    normalizedUnit === 'IU' ||
    normalizedUnit.startsWith('IU_') ||
    rawUnit.startsWith('IU') ||
    normalizedUnit === 'μg'
  ) {
    return 1
  }
  if (normalizedUnit === 'mg' || rawUnit.startsWith('mg')) {
    return 0.1
  }
  return 0.01
}

export function getIngredientNutritionUnitPrecision(unit: string): number {
  const normalizedUnit = normalizeIngredientNutritionUnit(unit)
  const rawUnit = unit.trim()
  if (
    normalizedUnit === 'kcal' ||
    normalizedUnit === 'kJ' ||
    normalizedUnit === 'IU' ||
    normalizedUnit.startsWith('IU_') ||
    rawUnit.startsWith('IU')
  ) {
    return 0
  }
  if (normalizedUnit === 'μg' || rawUnit.startsWith('μg')) {
    return 2
  }
  return 4
}
