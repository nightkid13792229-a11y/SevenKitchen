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
        nutrition_profile_snapshot: {
          vitamins: { vitaminE: 200 }
        },
        properties: {
          image_url: 'https://cdn.example.com/default-square.jpg'
        }
      },
      {
        ingredient: {
          id: 'supp-default',
          displayUnit: '粒',
          imageUrl: 'https://cdn.example.com/default-square.jpg',
          addTimingLabel: '随餐',
          nutritionProfile: {
            vitamins: {
              vitaminE: 200
            }
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
              nutritionProfile: {
                vitamins: {
                  vitaminE: 400
                }
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

  it('only exposes diy-enabled supplement options for customer recommendations', () => {
    const options = buildSupplementCandidateOptions(
      {
        ingredientId: 'supp-default',
        name: '自制鸡蛋壳粉',
        brand: '自制',
        properties: {}
      },
      {
        ingredient: {
          id: 'supp-default',
          diyEnabled: false,
          properties: {}
        },
        supplementAlternatives: [
          {
            ingredientId: 'supp-alt-disabled',
            ingredientName: '内部采购鸡蛋壳粉',
            ingredient: {
              id: 'supp-alt-disabled',
              name: '内部采购鸡蛋壳粉',
              diyEnabled: false,
              properties: {}
            }
          },
          {
            ingredientId: 'supp-alt-enabled',
            ingredientName: '第三方鸡蛋壳粉',
            ingredient: {
              id: 'supp-alt-enabled',
              name: '第三方鸡蛋壳粉',
              brand: '西红柿',
              diyEnabled: true,
              properties: {}
            }
          }
        ]
      }
    )

    expect(options).toHaveLength(1)
    expect(options[0].ingredientId).toBe('supp-alt-enabled')
    expect(options[0].brand).toBe('西红柿')
  })

  it('returns no recommendation options when every supplement candidate disables diy recommendations', () => {
    const options = buildSupplementCandidateOptions(
      {
        ingredientId: 'supp-default',
        name: '自制鸡蛋壳粉',
        properties: {}
      },
      {
        ingredient: {
          id: 'supp-default',
          diyEnabled: false,
          properties: {}
        },
        supplementAlternatives: [
          {
            ingredientId: 'supp-alt-disabled',
            ingredientName: '采购鸡蛋壳粉',
            ingredient: {
              id: 'supp-alt-disabled',
              name: '采购鸡蛋壳粉',
              diyEnabled: false,
              properties: {}
            }
          }
        ]
      }
    )

    expect(options).toEqual([])
  })

  it('recalculates supplement amount and nutrient unit from selected alternative without supplement loss', () => {
    const baseItem = {
      amount: 5,
      supplementTargets: [
        {
          fieldPath: 'vitamins.vitaminE',
          label: '维生素 E',
          targetValuePerKg: 1000,
          unit: 'IU'
        }
      ]
    }

    const selectedOption = {
      id: 'supp-alt-1',
      ingredientId: 'supp-alt-1',
      name: '维生素E-400',
      nutritionProfile: {
        vitamins: {
          vitaminE: 400
        }
      }
    }

    expect(
      calculateSupplementAmountForOption(
        baseItem,
        selectedOption,
        1000
      )
    ).toBeCloseTo(2.5, 6)
    expect(getSupplementNutrientUnit(baseItem, selectedOption)).toBe('IU')
  })

  it('keeps fractional tablet amounts when calculating from ingredient input weight', () => {
    const baseItem = {
      amount: 12,
      supplementTargets: [
        {
          fieldPath: 'minerals.iodine',
          label: '碘',
          targetValuePerKg: 660,
          unit: 'μg'
        }
      ],
      properties: {}
    }

    const kelpTablet = {
      id: 'kelp-tablet',
      ingredientId: 'kelp-tablet',
      name: '海带片',
      nutritionProfile: {
        minerals: {
          iodine: 150
        }
      }
    }

    expect(
      calculateSupplementAmountForOption(
        baseItem,
        kelpTablet,
        2962
      )
    ).toBeCloseTo(13.0328, 6)
  })

  it('recalculates supplement amount from selected alternative active nutrients when public payload has no nutritionProfile', () => {
    const options = buildSupplementCandidateOptions(
      {
        ingredientId: 'vitamin-e-default',
        name: '维生素E-200',
        properties: {}
      },
      {
        ingredient: {
          id: 'vitamin-e-default',
          activeNutrients: {
            'vitamins.vitaminE': {
              value: 200,
              unit: 'IU'
            }
          },
          properties: {}
        },
        supplementAlternatives: [
          {
            ingredientId: 'vitamin-e-400',
            ingredientName: '维生素E-400',
            ingredient: {
              id: 'vitamin-e-400',
              name: '维生素E-400',
              activeNutrients: {
                'vitamins.vitaminE': {
                  value: 400,
                  unit: 'IU'
                }
              },
              properties: {}
            }
          }
        ]
      }
    )

    expect(options).toHaveLength(2)
    expect(
      calculateSupplementAmountForOption(
        {
          amount: 5,
          supplementTargets: [
            {
              fieldPath: 'vitamins.vitaminE',
              label: '维生素 E',
              targetValuePerKg: 1000,
              unit: 'IU'
            }
          ]
        },
        options[1],
        1000
      )
    ).toBeCloseTo(2.5, 6)
  })
})
