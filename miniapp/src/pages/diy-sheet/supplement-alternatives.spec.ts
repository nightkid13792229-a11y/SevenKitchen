import { describe, expect, it } from 'vitest'
import {
  buildSupplementCandidateOptions,
  calculateSupplementAmountForOption,
  getSupplementNutrientUnit,
  getSupplementSelectionKey
} from './supplement-alternatives'

describe('supplement alternatives helpers', () => {
  it('uses recipe item id as supplement selection key when available', () => {
    expect(getSupplementSelectionKey({
      recipeItemId: 'recipe-item-1',
      ingredientId: 'ingredient-1'
    })).toBe('recipe-item-1')
  })

  it('builds default plus alternative supplement options with product info', () => {
    const options = buildSupplementCandidateOptions(
      {
        ingredientId: 'supp-default',
        name: '维生素E-200',
        brand: 'NOW FOODS',
        productModel: '200IU/粒',
        purchaseChannel: '京东',
        displayUnit: '粒',
        imageUrl: 'https://cdn.example.com/default-square.jpg',
        preparationMethod: '随餐',
        properties: {
          image_url: 'https://cdn.example.com/default-square.jpg',
          active_nutrients: {
            维生素E: { value: 200, unit: 'IU' }
          }
        }
      },
      {
        ingredient: {
          id: 'supp-default',
          displayUnit: '粒',
          imageUrl: 'https://cdn.example.com/default-square.jpg',
          addTimingLabel: '随餐',
          activeNutrients: {
            维生素E: { value: 200, unit: 'IU' }
          },
          properties: {
            image_url: 'https://cdn.example.com/default-square.jpg'
          }
        },
        supplementAlternatives: [
          {
            ingredientId: 'supp-alt-1',
            ingredientName: '维生素E-400',
            ingredient: {
              id: 'supp-alt-1',
              name: '维生素E-400',
              brand: 'NOW FOODS',
              productModel: '400IU/粒',
              purchaseChannel: '京东',
              displayUnit: '粒',
              imageUrl: 'https://cdn.example.com/alt-square.jpg',
              purchaseLink: {
                platform: 'JD',
                url: 'https://jd.example/e400'
              },
              addTimingLabel: '随餐',
              activeNutrients: {
                维生素E: { value: 400, unit: 'IU' }
              },
              properties: {}
            }
          }
        ]
      }
    )

    expect(options).toHaveLength(2)
    expect(options[0].ingredientId).toBe('supp-default')
    expect(options[0].timingLabel).toBe('随餐')
    expect(options[0].imageUrl).toBe('https://cdn.example.com/default-square.jpg')
    expect(options[1].ingredientId).toBe('supp-alt-1')
    expect(options[1].timingLabel).toBe('随餐')
    expect(options[1].imageUrl).toBe('https://cdn.example.com/alt-square.jpg')
    expect(options[1].purchaseLink).toEqual({
      platform: 'JD',
      url: 'https://jd.example/e400'
    })
  })

  it('recalculates supplement amount and nutrient unit from selected alternative', () => {
    const baseItem = {
      amount: 5,
      nutrientTargetKey: '维生素E',
      nutrientTargetValue: 1000,
      properties: {
        active_nutrients: {
          维生素E: { value: 200, unit: 'IU' }
        }
      }
    }

    const selectedOption = {
      id: 'supp-alt-1',
      ingredientId: 'supp-alt-1',
      name: '维生素E-400',
      activeNutrients: {
        维生素E: { value: 400, unit: 'IU' }
      }
    }

    expect(
      calculateSupplementAmountForOption(
        baseItem,
        selectedOption,
        1000,
        0.05
      )
    ).toBeCloseTo(2.625, 6)
    expect(getSupplementNutrientUnit(baseItem, selectedOption)).toBe('IU')
  })
})
