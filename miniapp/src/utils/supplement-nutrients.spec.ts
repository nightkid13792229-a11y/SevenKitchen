import { describe, expect, it } from 'vitest'

import {
  buildSupplementNutrientRows,
  buildSupplementNutrientRowsFromItems,
  calculateSupplementAmountForProduction,
  getSupplementTargets,
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
    ).toBe('每公斤食材添加660μg碘')

    // 数值取整（2026-10-24）
    expect(
      formatSupplementTargets({
        supplement_targets: [
          { fieldPath: 'minerals.calcium', label: '钙', targetValuePerKg: 5.6, unit: 'g' }
        ]
      })
    ).toBe('每公斤食材添加6g钙')
  })

  it('returns display unit from item snapshot', () => {
    expect(getResolvedSupplementDisplayUnit({ unit_display_label: '平勺' })).toBe('平勺')
  })
})

describe('buildSupplementNutrientRows · 需额外补充的营养素', () => {
  it('摊平成「营养素 / 添加浓度」两列，数值取整', () => {
    expect(
      buildSupplementNutrientRows([
        {
          targets: [
            { label: '钙', targetValuePerKg: 5.6, unit: 'g' },
            { label: '锌', targetValuePerKg: 12.4, unit: 'mg' },
          ],
        },
      ])
    ).toEqual([
      { nutrient: '钙', concentration: '每公斤食材添加 6 g' },
      { nutrient: '锌', concentration: '每公斤食材添加 12 mg' },
    ])
  })

  it('不同营养素按补剂顺序摊平，各占一行', () => {
    expect(
      buildSupplementNutrientRows([
        { targets: [{ label: '钙', targetValuePerKg: 5, unit: 'g' }] },
        { targets: [{ label: '鱼油', targetValuePerKg: 0, unit: 'g' }] },
      ])
    ).toEqual([
      { nutrient: '钙', concentration: '每公斤食材添加 5 g' },
      { nutrient: '鱼油', concentration: '每公斤食材添加 0 g' },
    ])
  })

  it('没有营养素名就跳过；没数值给「—」；没单位不猜单位', () => {
    expect(
      buildSupplementNutrientRows([
        {
          targets: [
            { label: '', targetValuePerKg: 5, unit: 'g' },
            { label: '维生素 D', targetValuePerKg: null, unit: 'IU' },
            { label: '碘', targetValuePerKg: 660, unit: null },
          ],
        },
      ])
    ).toEqual([
      { nutrient: '维生素 D', concentration: '—' },
      { nutrient: '碘', concentration: '每公斤食材添加 660' },
    ])
  })

  it('空数据不抛错，返回空数组（老快照没有 targets）', () => {
    expect(buildSupplementNutrientRows(undefined)).toEqual([])
    expect(buildSupplementNutrientRows([])).toEqual([])
    expect(buildSupplementNutrientRows([{ targets: null }, {}])).toEqual([])
  })

  it('不足 1 的正数保留一位小数：0.4mg 不能显示成 0mg', () => {
    expect(
      buildSupplementNutrientRows([
        {
          targets: [
            { label: '硒', targetValuePerKg: 0.4, unit: 'mg' },
            { label: '维生素 B12', targetValuePerKg: 0.04, unit: 'μg' },
            { label: '碘', targetValuePerKg: 0, unit: 'μg' },
          ],
        },
      ])
    ).toEqual([
      { nutrient: '硒', concentration: '每公斤食材添加 0.4 mg' },
      { nutrient: '维生素 B12', concentration: '每公斤食材添加 <0.1 μg' },
      { nutrient: '碘', concentration: '每公斤食材添加 0 μg' },
    ])
  })

  it('空字符串不算 0：给「—」，不能凭空写出 0 g', () => {
    expect(
      buildSupplementNutrientRows([
        { targets: [{ label: '锌', targetValuePerKg: '' as unknown as number, unit: 'mg' }] },
      ])
    ).toEqual([{ nutrient: '锌', concentration: '—' }])
  })

  it('★ 两个补剂补同一营养素时合并成一行（浓度相加，2026-11-08）', () => {
    // 老板反馈：钙粉 + 骨粉各带一个「钙」目标时，页面出现两行钙，
    // 顾客读成「要加两次钙 / 加多了」。合并成合计才是这一块要回答的问题。
    expect(
      buildSupplementNutrientRows([
        { targets: [{ label: '钙', targetValuePerKg: 3, unit: 'g' }] },
        { targets: [{ label: '钙', targetValuePerKg: 2, unit: 'g' }] },
      ])
    ).toEqual([{ nutrient: '钙', concentration: '每公斤食材添加 5 g' }])
  })

  it('★ 合并时单位不同但可换算：1364mg + 0.719g = 2083mg', () => {
    expect(
      buildSupplementNutrientRows([
        { targets: [{ label: '钙', targetValuePerKg: 1364, unit: 'mg' }] },
        { targets: [{ label: '钙', targetValuePerKg: 0.719, unit: 'g' }] },
      ])
    ).toEqual([{ nutrient: '钙', concentration: '每公斤食材添加 2083 mg' }])
  })

  it('★ 合并后行序按营养素首次出现，三个及以上也合并', () => {
    expect(
      buildSupplementNutrientRows([
        { targets: [{ label: '钙', targetValuePerKg: 1000, unit: 'mg' }] },
        { targets: [{ label: '锌', targetValuePerKg: 12, unit: 'mg' }] },
        { targets: [{ label: '钙', targetValuePerKg: 719, unit: 'mg' }] },
        { targets: [{ label: '钙', targetValuePerKg: 364, unit: 'mg' }] },
      ])
    ).toEqual([
      { nutrient: '钙', concentration: '每公斤食材添加 2083 mg' },
      { nutrient: '锌', concentration: '每公斤食材添加 12 mg' },
    ])
  })

  it('★ 同一营养素里有一个值未知时合计给「—」，不假装知道总数', () => {
    expect(
      buildSupplementNutrientRows([
        { targets: [{ label: '钙', targetValuePerKg: 1364, unit: 'mg' }] },
        { targets: [{ label: '钙', targetValuePerKg: null, unit: 'mg' }] },
      ])
    ).toEqual([{ nutrient: '钙', concentration: '—' }])
  })

  it('★ 单位不可换算（IU 与 μg）时不硬加，各占一行', () => {
    expect(
      buildSupplementNutrientRows([
        { targets: [{ label: '维生素 D', targetValuePerKg: 500, unit: 'IU' }] },
        { targets: [{ label: '维生素 D', targetValuePerKg: 5, unit: 'μg' }] },
      ])
    ).toEqual([
      { nutrient: '维生素 D', concentration: '每公斤食材添加 500 IU' },
      { nutrient: '维生素 D', concentration: '每公斤食材添加 5 μg' },
    ])
  })

  it('老食谱的 legacy 目标（nutrientTargetKey/Value）也能摊成一行', () => {
    const legacyItem = {
      nutrientTargetKey: '钙',
      nutrientTargetValue: 1100,
      properties: { active_nutrients: { 钙: { value: 115, unit: 'mg' } } },
    }

    expect(
      getSupplementTargets(legacyItem)[0]
    ).toEqual({
      fieldPath: '钙',
      label: '钙',
      targetValuePerKg: 1100,
      unit: 'mg',
    })

    expect(
      buildSupplementNutrientRows([{ targets: getSupplementTargets(legacyItem) }])
    ).toEqual([{ nutrient: '钙', concentration: '每公斤食材添加 1100 mg' }])
  })
})


describe('buildSupplementNutrientRowsFromItems · 详情页接线', () => {
  it('★ 从原料里摊出行（补剂有目标就出现，食材不产生行）', () => {
    const rows = buildSupplementNutrientRowsFromItems([
      {
        ingredientType: 'SUPPLEMENT',
        name: '钙粉',
        supplementTargets: [
          { fieldPath: 'minerals.calcium', label: '钙', targetValuePerKg: 5.6, unit: 'g' },
        ],
      },
      { ingredientType: 'FOOD', name: '鸡胸肉' },
    ]);

    expect(rows).toEqual([{ nutrient: '钙', concentration: '每公斤食材添加 6 g' }]);
  });

  it('★ 老食谱只有 nutrientTargetKey/Value 也能摊出来', () => {
    const rows = buildSupplementNutrientRowsFromItems([
      {
        ingredientType: 'SUPPLEMENT',
        nutrientTargetKey: '钙',
        nutrientTargetValue: 1100,
        properties: { active_nutrients: { 钙: { value: 115, unit: 'mg' } } },
      },
    ]);

    expect(rows).toEqual([
      { nutrient: '钙', concentration: '每公斤食材添加 1100 mg' },
    ]);
  });

  it('补剂没有目标 / 空数组 → 不产生行（页面据此整块隐藏）', () => {
    expect(buildSupplementNutrientRowsFromItems([])).toEqual([]);
    expect(buildSupplementNutrientRowsFromItems(null)).toEqual([]);
    expect(
      buildSupplementNutrientRowsFromItems([{ ingredientType: 'SUPPLEMENT', name: '某补剂' }]),
    ).toEqual([]);
  });

  it('★ 钙粉 + 骨粉两个钙源只出一行钙（老板截图里的那两行）', () => {
    const rows = buildSupplementNutrientRowsFromItems([
      {
        ingredientType: 'SUPPLEMENT',
        name: '蛋壳粉',
        supplementTargets: [
          { fieldPath: 'minerals.calcium', label: '钙', targetValuePerKg: 1364, unit: 'mg' },
        ],
      },
      {
        ingredientType: 'SUPPLEMENT',
        name: '骨粉',
        supplementTargets: [
          { fieldPath: 'minerals.calcium', label: '钙', targetValuePerKg: 719, unit: 'mg' },
        ],
      },
      {
        ingredientType: 'SUPPLEMENT',
        name: '海藻粉',
        supplementTargets: [
          { fieldPath: 'minerals.iodine', label: '碘', targetValuePerKg: 497, unit: 'μg' },
        ],
      },
    ]);

    expect(rows).toEqual([
      { nutrient: '钙', concentration: '每公斤食材添加 2083 mg' },
      { nutrient: '碘', concentration: '每公斤食材添加 497 μg' },
    ]);
  });
});
