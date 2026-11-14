import { describe, expect, it } from 'vitest'
import { mergeIngredientProperties } from './mergeIngredientProperties'

/**
 * `properties` 在原料更新接口里是**整块替换**，不是深合并。
 * 第 4 步保存 DIY/采购段时必须先合并再提交，否则会清掉
 * add_timing / production_loss_rate / 标签三项 / display_unit。
 */
describe('合并原料 properties', () => {
  it('保留原有字段，只覆盖传入的键', () => {
    const merged = mergeIngredientProperties(
      {
        display_unit: '粒',
        add_timing: 'BEFORE_MEAL',
        production_loss_rate: 1.05,
        tags: ['补剂'],
      },
      { image_url: 'https://cdn/x.png' },
    )

    expect(merged).toEqual({
      display_unit: '粒',
      add_timing: 'BEFORE_MEAL',
      production_loss_rate: 1.05,
      tags: ['补剂'],
      image_url: 'https://cdn/x.png',
    })
  })

  it('传 null 表示删掉这个键（清空链接/图片）', () => {
    const merged = mergeIngredientProperties(
      { purchase_link: { platform: 'IHERB', url: 'x' }, add_timing: 'AFTER' },
      { purchase_link: null },
    )

    expect(merged).toEqual({ add_timing: 'AFTER' })
    expect('purchase_link' in merged).toBe(false)
  })

  it('传 undefined 表示不动（不是删掉）', () => {
    const merged = mergeIngredientProperties(
      { image_url: 'keep' },
      { image_url: undefined },
    )

    expect(merged.image_url).toBe('keep')
  })

  it('原值为空时直接从补丁开始', () => {
    expect(mergeIngredientProperties(null, { image_url: 'a' })).toEqual({
      image_url: 'a',
    })
    expect(mergeIngredientProperties(undefined, { image_url: 'a' })).toEqual({
      image_url: 'a',
    })
  })

  it('不修改入参', () => {
    const existing = { add_timing: 'BEFORE_MEAL' }
    mergeIngredientProperties(existing, { image_url: 'a' })
    expect(existing).toEqual({ add_timing: 'BEFORE_MEAL' })
  })
})
