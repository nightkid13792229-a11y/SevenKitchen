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
