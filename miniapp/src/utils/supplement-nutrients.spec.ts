import { describe, expect, it } from 'vitest'

import {
  calculateSupplementAmountForProduction,
  getResolvedSupplementDisplayUnit,
  getResolvedSupplementNutrient,
  getResolvedSupplementNutrientUnit
} from './supplement-nutrients'

describe('supplement nutrient resolution', () => {
  it('prefers ingredient activeNutrients over legacy active_nutrients', () => {
    const item = {
      nutrientTargetKey: '维生素E',
      properties: {
        active_nutrients: {
          维生素E: { value: 200, unit: 'IU' }
        }
      },
      ingredient: {
        activeNutrients: {
          维生素E: { value: 400, unit: 'IU' }
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
      nutrient_target_key: '维生素E',
      nutrient_target_value: 1000,
      unit_display_label: '粒',
      ingredient: {
        unitDisplayLabel: '粒',
        activeNutrients: {
          维生素E: { value: 400, unit: 'IU' }
        },
        properties: {
          production_loss_rate: 1.1
        }
      }
    }

    expect(calculateSupplementAmountForProduction(item, 1000)).toEqual({
      amount: 2.5,
      unit: '粒'
    })
  })

  it('falls back to legacy snapshot active_nutrients and unit labels', () => {
    const item = {
      nutrient_target_key: '碘',
      nutrient_target_value: 500,
      unit_display_label: '平勺',
      properties: {
        production_loss_rate: 1.05,
        active_nutrients: {
          碘: { value: 250, unit: 'μg' }
        }
      }
    }

    expect(getResolvedSupplementDisplayUnit(item)).toBe('平勺')
    expect(getResolvedSupplementNutrientUnit(item)).toBe('μg')
    expect(calculateSupplementAmountForProduction(item, 2000)).toEqual({
      amount: 4,
      unit: '平勺'
    })
  })

  it('uses production pot input weight as the production supplement baseline', () => {
    const item = {
      nutrient_target_key: '碘',
      nutrient_target_value: 660,
      unit_display_label: '片',
      properties: {
        production_loss_rate: 1.05,
        active_nutrients: {
          碘: { value: 150, unit: 'μg' }
        }
      }
    }

    expect(calculateSupplementAmountForProduction(item, 3260)).toEqual({
      amount: 14.344,
      unit: '片'
    })
  })
})
