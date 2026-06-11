import { describe, expect, it } from 'vitest'

import {
  calculateSupplementAmountForProduction,
  formatSupplementTargets,
  getResolvedSupplementDisplayUnit,
  getResolvedSupplementNutrient,
  getResolvedSupplementNutrientUnit
} from './supplement-nutrients'

describe('supplement nutrient resolution', () => {
  it('resolves supplement concentration from nutrition profile target path', () => {
    const item = {
      supplementTargets: [
        {
          fieldPath: 'vitamins.vitaminE',
          label: '维生素 E',
          targetValuePerKg: 1000,
          unit: 'IU'
        }
      ],
      ingredient: {
        nutritionProfile: {
          meta: { rawBasisType: 'PER_SERVING' },
          macros: {},
          minerals: {},
          vitamins: { vitaminE: 400 },
          fattyAcids: {},
          aminoAcids: {},
          customItems: []
        }
      }
    }

    expect(getResolvedSupplementNutrient(item)).toEqual({
      value: 400,
      unit: 'IU'
    })
    expect(getResolvedSupplementNutrientUnit(item)).toBe('IU')
  })

  it('calculates production supplement amount from input weight without supplement loss', () => {
    const item = {
      supplement_targets: [
        {
          fieldPath: 'vitamins.vitaminE',
          label: '维生素 E',
          targetValuePerKg: 1000,
          unit: 'IU'
        }
      ],
      nutrition_profile_snapshot: {
        meta: { rawBasisType: 'PER_SERVING' },
        macros: {},
        minerals: {},
        vitamins: { vitaminE: 400 },
        fattyAcids: {},
        aminoAcids: {},
        customItems: []
      },
      unit_display_label: '粒',
      properties: {
        production_loss_rate: 1.1
      }
    }

    expect(calculateSupplementAmountForProduction(item, 1000)).toEqual({
      amount: 2.5,
      unit: '粒'
    })
  })

  it('converts PER_100_G nutrition profiles before calculating supplement amount', () => {
    const item = {
      supplement_targets: [
        {
          fieldPath: 'vitamins.vitaminE',
          label: '维生素 E',
          targetValuePerKg: 1000,
          unit: 'IU'
        }
      ],
      nutrition_profile_snapshot: {
        meta: { rawBasisType: 'PER_100_G' },
        macros: {},
        minerals: {},
        vitamins: { vitaminE: 2000 },
        fattyAcids: {},
        aminoAcids: {},
        customItems: []
      },
      unit_display_label: 'g'
    }

    expect(getResolvedSupplementNutrient(item)).toEqual({
      value: 20,
      unit: 'IU'
    })
    expect(calculateSupplementAmountForProduction(item, 1000)).toEqual({
      amount: 50,
      unit: 'g'
    })
  })

  it('keeps PER_1_G nutrition profiles as per-gram concentration', () => {
    const item = {
      supplement_targets: [
        {
          fieldPath: 'vitamins.vitaminE',
          label: '维生素 E',
          targetValuePerKg: 1000,
          unit: 'IU'
        }
      ],
      nutrition_profile_snapshot: {
        meta: { rawBasisType: 'PER_1_G' },
        macros: {},
        minerals: {},
        vitamins: { vitaminE: 200 },
        fattyAcids: {},
        aminoAcids: {},
        customItems: []
      },
      unit_display_label: 'g'
    }

    expect(calculateSupplementAmountForProduction(item, 1000)).toEqual({
      amount: 5,
      unit: 'g'
    })
  })

  it('defaults missing nutrition profile basis to PER_100_G to match backend normalization', () => {
    const item = {
      supplement_targets: [
        {
          fieldPath: 'vitamins.vitaminE',
          label: '维生素 E',
          targetValuePerKg: 1000,
          unit: 'IU'
        }
      ],
      nutrition_profile_snapshot: {
        meta: {},
        macros: {},
        minerals: {},
        vitamins: { vitaminE: 2000 },
        fattyAcids: {},
        aminoAcids: {},
        customItems: []
      }
    }

    expect(getResolvedSupplementNutrient(item)).toEqual({
      value: 20,
      unit: 'IU'
    })
    expect(calculateSupplementAmountForProduction(item, 1000)).toEqual({
      amount: 50,
      unit: 'g'
    })
  })

  it('defaults missing nutrition profile meta to PER_100_G to match backend normalization', () => {
    const item = {
      supplement_targets: [
        {
          fieldPath: 'vitamins.vitaminE',
          label: '维生素 E',
          targetValuePerKg: 1000,
          unit: 'IU'
        }
      ],
      nutrition_profile_snapshot: {
        macros: {},
        minerals: {},
        vitamins: { vitaminE: 2000 },
        fattyAcids: {},
        aminoAcids: {},
        customItems: []
      }
    }

    expect(calculateSupplementAmountForProduction(item, 1000)).toEqual({
      amount: 50,
      unit: 'g'
    })
  })

  it('returns no supplement amount for unknown nutrition profile basis', () => {
    const item = {
      supplement_targets: [
        {
          fieldPath: 'vitamins.vitaminE',
          label: '维生素 E',
          targetValuePerKg: 1000,
          unit: 'IU'
        }
      ],
      nutrition_profile_snapshot: {
        meta: { rawBasisType: 'PER_TABLESPOON' },
        macros: {},
        minerals: {},
        vitamins: { vitaminE: 2000 },
        fattyAcids: {},
        aminoAcids: {},
        customItems: []
      }
    }

    expect(calculateSupplementAmountForProduction(item, 1000)).toEqual({
      amount: 0,
      unit: 'g'
    })
  })

  it('falls back to fixed recipe ratio when supplement targets are unavailable', () => {
    const item = {
      ratio: 1,
      unit_display_label: 'g',
      properties: {
        production_loss_rate: 1.1
      }
    }

    expect(calculateSupplementAmountForProduction(item, 1000)).toEqual({
      amount: 10,
      unit: 'g'
    })
    expect(
      calculateSupplementAmountForProduction(item, 1000, {
        includeProductionLoss: true
      })
    ).toEqual({
      amount: 11,
      unit: 'g'
    })
  })

  it('does not fall back to legacy active nutrients for unknown explicit profile basis', () => {
    const item = {
      supplement_targets: [
        {
          fieldPath: 'vitamins.vitaminE',
          label: '维生素 E',
          targetValuePerKg: 1000,
          unit: 'IU'
        }
      ],
      nutrition_profile_snapshot: {
        meta: { rawBasisType: 'PER_TABLESPOON' },
        macros: {},
        minerals: {},
        vitamins: { vitaminE: 2000 },
        fattyAcids: {},
        aminoAcids: {},
        customItems: []
      },
      properties: {
        active_nutrients: {
          'vitamins.vitaminE': { value: 400, unit: 'IU' }
        }
      }
    }

    expect(calculateSupplementAmountForProduction(item, 1000)).toEqual({
      amount: 0,
      unit: 'g'
    })
  })

  it('uses serving as fallback display unit for serving-based profiles', () => {
    const item = {
      supplement_targets: [
        {
          fieldPath: 'vitamins.vitaminE',
          label: '维生素 E',
          targetValuePerKg: 1000,
          unit: 'IU'
        }
      ],
      nutrition_profile_snapshot: {
        meta: { rawBasisType: 'PER_SERVING' },
        macros: {},
        minerals: {},
        vitamins: { vitaminE: 400 },
        fattyAcids: {},
        aminoAcids: {},
        customItems: []
      }
    }

    expect(calculateSupplementAmountForProduction(item, 1000)).toEqual({
      amount: 2.5,
      unit: 'serving'
    })
  })

  it('resolves legacy nutritionProfile.items using PER_1_PCS as serving basis', () => {
    const item = {
      supplement_targets: [
        {
          fieldPath: 'vitamins.vitaminE',
          label: '维生素 E',
          targetValuePerKg: 1000,
          unit: 'IU'
        }
      ],
      nutrition_profile_snapshot: {
        items: [
          {
            nutrientCode: 'vitamin_e',
            nutrientName: '维生素 E',
            value: 400,
            unit: 'IU',
            basisType: 'PER_1_PCS'
          }
        ]
      }
    }

    expect(getResolvedSupplementNutrient(item)).toEqual({
      value: 400,
      unit: 'IU'
    })
    expect(calculateSupplementAmountForProduction(item, 1000)).toEqual({
      amount: 2.5,
      unit: 'serving'
    })
  })

  it('converts legacy nutritionProfile.items PER_100_G values to per gram concentration', () => {
    const item = {
      supplement_targets: [
        {
          fieldPath: 'minerals.iodine',
          label: '碘',
          targetValuePerKg: 660,
          unit: 'μg'
        }
      ],
      nutrition_profile_snapshot: {
        items: [
          {
            nutrientCode: 'i',
            nutrientName: '碘',
            value: 15000,
            unit: 'μg',
            basisType: 'PER_100_G'
          }
        ]
      }
    }

    expect(getResolvedSupplementNutrient(item)).toEqual({
      value: 150,
      unit: 'μg'
    })
    expect(calculateSupplementAmountForProduction(item, 1000)).toEqual({
      amount: 4.4,
      unit: 'g'
    })
  })

  it('uses ml as fallback display unit for ml-based supplement profiles', () => {
    const item = {
      supplement_targets: [
        {
          fieldPath: 'vitamins.vitaminE',
          label: '维生素 E',
          targetValuePerKg: 1000,
          unit: 'IU'
        }
      ],
      nutrition_profile_snapshot: {
        meta: { rawBasisType: 'PER_100_ML' },
        macros: {},
        minerals: {},
        vitamins: { vitaminE: 2000 },
        fattyAcids: {},
        aminoAcids: {},
        customItems: []
      }
    }

    expect(calculateSupplementAmountForProduction(item, 1000)).toEqual({
      amount: 50,
      unit: 'ml'
    })
  })

  it('calculates multi-target supplements from nutrition profile snapshots', () => {
    const item = {
      supplement_targets: [
        { fieldPath: 'fattyAcids.epa', label: 'EPA', targetValuePerKg: 360, unit: 'mg' },
        { fieldPath: 'fattyAcids.dha', label: 'DHA', targetValuePerKg: 360, unit: 'mg' }
      ],
      nutrition_profile_snapshot: {
        meta: { rawBasisType: 'PER_SERVING' },
        macros: {},
        minerals: {},
        vitamins: {},
        fattyAcids: { epa: 180, dha: 120 },
        aminoAcids: {},
        customItems: []
      },
      unit_display_label: '粒'
    }

    expect(calculateSupplementAmountForProduction(item, 1000)).toEqual({
      amount: 3,
      unit: '粒'
    })
  })

  it('uses production pot input weight as the production supplement baseline', () => {
    const item = {
      supplement_targets: [
        {
          fieldPath: 'minerals.iodine',
          label: '碘',
          targetValuePerKg: 660,
          unit: 'μg'
        }
      ],
      nutrition_profile_snapshot: {
        meta: { rawBasisType: 'PER_SERVING' },
        macros: {},
        minerals: { iodine: 150 },
        vitamins: {},
        fattyAcids: {},
        aminoAcids: {},
        customItems: []
      },
      unit_display_label: '片'
    }

    expect(calculateSupplementAmountForProduction(item, 3260)).toEqual({
      amount: 14.344,
      unit: '片'
    })
  })

  it('formats supplement target labels', () => {
    expect(
      formatSupplementTargets({
        supplement_targets: [
          {
            fieldPath: 'minerals.iodine',
            label: '碘',
            targetValuePerKg: 660,
            unit: 'μg'
          }
        ]
      })
    ).toBe('每kg食材添加660μg碘')
  })

  it('returns display unit from item snapshot', () => {
    expect(getResolvedSupplementDisplayUnit({ unit_display_label: '平勺' })).toBe('平勺')
  })
})
