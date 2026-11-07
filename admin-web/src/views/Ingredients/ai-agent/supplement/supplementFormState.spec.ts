import { describe, expect, it } from 'vitest'
import {
  SUPPLEMENT_CARD_FIELDS,
  SUPPLEMENT_HUMAN_FIELD_KEYS
} from '@/constants/supplementCardFields'
import {
  computePerUnit,
  emptySupplementDraft,
  patchFromPreview,
  toCreatePayload,
  toGateInput
} from './supplementFormState'

/**
 * 补剂档案的表单状态：从"人填进去的那几个数"到"要发给后端的那一份"。
 *
 * 这里只做一个决定：**人填的是标签上每份的值，写进库的是每粒的值**。
 * 折算在 `computePerUnit` 里做一次，`evaluateSupplementGates` 再校验一次——
 * 两处用的必须是同一个数，否则门禁就成了自说自话。
 */
describe('字段目录', () => {
  it('只有「标签分类」和「添加时机」是 AI 不该替人定的', () => {
    const human = SUPPLEMENT_CARD_FIELDS.filter((field) => field.owner === 'HUMAN').map(
      (field) => field.key
    )
    expect(human.sort()).toEqual([...SUPPLEMENT_HUMAN_FIELD_KEYS].sort())
    expect(human.sort()).toEqual(['addTiming', 'tagNames'])
  })

  it('字段 key 不重复', () => {
    const keys = SUPPLEMENT_CARD_FIELDS.map((field) => field.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('每份几粒在目录里，且是必填', () => {
    const field = SUPPLEMENT_CARD_FIELDS.find((item) => item.key === 'servingUnitsPerDose')
    expect(field?.required).toBe(true)
  })
})

describe('折算', () => {
  it('每份 2 粒：650 → 325', () => {
    expect(computePerUnit({ 'fattyAcids.epa': 650 }, 2, {})).toEqual({
      'fattyAcids.epa': 325
    })
  })

  it('每份 1 粒也照样折，不隐藏', () => {
    expect(computePerUnit({ 'fattyAcids.epa': 650 }, 1, {})).toEqual({
      'fattyAcids.epa': 650
    })
  })

  it('手改过的字段不被折算覆盖', () => {
    expect(computePerUnit({ 'fattyAcids.epa': 650 }, 2, { 'fattyAcids.epa': 320 })).toEqual({
      'fattyAcids.epa': 320
    })
  })

  it('每份粒数不合法时返回空，不猜', () => {
    expect(computePerUnit({ 'fattyAcids.epa': 650 }, null, {})).toEqual({})
    expect(computePerUnit({ 'fattyAcids.epa': 650 }, 0, {})).toEqual({})
  })
})

describe('表单 → 门禁入参', () => {
  it('把每份值、每粒值、单位与成本一起交给门禁', () => {
    const draft = {
      ...emptySupplementDraft(),
      servingUnitsPerDose: 2,
      servingNutrients: { 'fattyAcids.epa': 650 },
      currentPricePerPurchaseUnit: 398,
      purchaseToBaseRatio: 120
    }
    const input = toGateInput(draft)
    expect(input.servingUnitsPerDose).toBe(2)
    expect(input.perUnitNutrients['fattyAcids.epa']).toBe(325)
    expect(input.baseUnit).toBe('PCS')
  })
})

describe('表单 → 提交载荷', () => {
  const filled = {
    ...emptySupplementDraft(),
    name: '鱼油（Omega-3）',
    tagNames: ['油脂类'],
    addTiming: 'BEFORE_MIXING',
    labelCategory: 'FEED_ADDITIVE' as const,
    labelNames: ['鱼油'],
    servingUnitsPerDose: 2,
    servingNutrients: { 'fattyAcids.epa': 650 },
    purchaseToBaseRatio: 120,
    currentPricePerPurchaseUnit: 398
  }

  it('人定项没填完时返回 null，不发请求', () => {
    expect(toCreatePayload({ ...filled, name: '' })).toBeNull()
    expect(toCreatePayload({ ...filled, tagNames: [] })).toBeNull()
    expect(toCreatePayload({ ...filled, addTiming: '' })).toBeNull()
    expect(toCreatePayload({ ...filled, labelCategory: null })).toBeNull()
    expect(toCreatePayload({ ...filled, labelNames: [] })).toBeNull()
    expect(toCreatePayload({ ...filled, purchaseUnit: '  ' })).toBeNull()
  })

  it('发出去的是标签每份值，折算交给服务端', () => {
    const payload = toCreatePayload(filled)
    expect(payload?.servingNutrients).toEqual({ 'fattyAcids.epa': 650 })
    expect(payload?.servingUnitsPerDose).toBe(2)
  })

  it('标签原文随载荷一起带上，空着也带空串以外的 null', () => {
    expect(toCreatePayload(filled)?.evidence.labelText).toBeNull()
    expect(
      toCreatePayload({ ...filled, evidence: { ...filled.evidence, labelText: 'Serving Size 2' } })
        ?.evidence.labelText
    ).toBe('Serving Size 2')
  })
})

describe('链接读出来的初稿 → 表单', () => {
  const preview = {
    productUrl: 'https://www.iherb.com/pr/x/1',
    productName: '北欧 Naturals 儿童 DHA',
    servingUnitsPerDose: 4,
    nutrients: [
      { fieldPath: 'fattyAcids.epa', value: 80, unit: 'mg', rawName: 'EPA' },
      { fieldPath: 'minerals.selenium', value: 120, unit: 'mcg', rawName: 'Selenium' },
      { fieldPath: 'minerals.zinc', value: 1, unit: 'g', rawName: 'Zinc' },
      { fieldPath: 'vitamins.vitaminA', value: 1000, unit: 'IU', rawName: 'Vitamin A' }
    ],
    unrecognized: ['Proprietary Blend'],
    labelText: 'Serving Size: 4 Soft Gels'
  }

  it('单位一致时原样进表单', () => {
    const { patch } = patchFromPreview(preview)
    expect(patch.servingNutrients?.['fattyAcids.epa']).toBe(80)
  })

  it('µg 与档案的 µg 对得上，就按 µg 记', () => {
    const { patch } = patchFromPreview(preview)
    expect(patch.servingNutrients?.['minerals.selenium']).toBe(120)
  })

  it('克换算成档案要的毫克，不把 1g 记成 1mg', () => {
    const { patch } = patchFromPreview(preview)
    expect(patch.servingNutrients?.['minerals.zinc']).toBe(1000)
  })

  it('单位对不上的行不进表单，但要报出来让人补', () => {
    const { patch, skipped } = patchFromPreview(preview)
    expect(patch.servingNutrients?.['vitamins.vitaminA']).toBe(1000)
    expect(skipped).toContain('Proprietary Blend')
  })

  it('每份几粒、商品名、标签原文一起带进来', () => {
    const { patch } = patchFromPreview(preview)
    expect(patch.servingUnitsPerDose).toBe(4)
    expect(patch.name).toBe('北欧 Naturals 儿童 DHA')
    expect(patch.evidence?.labelText).toBe('Serving Size: 4 Soft Gels')
    expect(patch.evidence?.productUrl).toBe('https://www.iherb.com/pr/x/1')
  })

  it('页面没给每份几粒时不动表单里的值，不默认成 1', () => {
    const { patch } = patchFromPreview({ ...preview, servingUnitsPerDose: null })
    expect(patch.servingUnitsPerDose).toBeUndefined()
  })
})
