import { describe, expect, it } from 'vitest'
import { mergeAgentDraft, pickChangedFields } from './agentDraftApply'

/**
 * 模型回写的收敛逻辑。
 *
 * 这一层的存在理由很具体：模型返回的是整份草稿，如果整份覆盖，
 * 用户在等它思考期间手填的采购价会被打回原样。
 */
describe('挑出模型改过的字段', () => {
  it('只挑真的变了的', () => {
    const sent = { name: '锌', brand: '', servingUnitsPerDose: 2 }
    const returned = { name: '锌', brand: 'NOW Foods', servingUnitsPerDose: 2 }

    expect(pickChangedFields(sent, returned)).toEqual({ brand: 'NOW Foods' })
  })

  it('营养档案只挑变了的项', () => {
    const sent = { servingNutrients: { 'minerals.zinc': 15, 'fattyAcids.epa': 0 } }
    const returned = { servingNutrients: { 'minerals.zinc': 15, 'fattyAcids.epa': 325 } }

    expect(pickChangedFields(sent, returned)).toEqual({
      servingNutrients: { 'fattyAcids.epa': 325 }
    })
  })

  it('什么都没改时返回空', () => {
    const sent = { name: '锌', servingNutrients: { 'minerals.zinc': 15 } }
    expect(pickChangedFields(sent, { ...sent })).toEqual({})
  })

  it('模型多带来的字段也算"变了"（交给下一步决定收不收）', () => {
    expect(pickChangedFields({ name: '锌' }, { name: '锌', evil: 1 })).toEqual({ evil: 1 })
  })
})

describe('合回表单', () => {
  it('表单里有的字段才写', () => {
    const form = { name: '', brand: '' }
    const applied = mergeAgentDraft(form, { name: '锌', evil: 1 })

    expect(form.name).toBe('锌')
    expect(applied).toEqual(['name'])
    expect('evil' in form).toBe(false)
  })

  it('营养档案按项合并，不清空其它项', () => {
    const form = { servingNutrients: { 'minerals.zinc': 15 } }
    mergeAgentDraft(form, { servingNutrients: { 'fattyAcids.epa': 325 } })

    expect(form.servingNutrients).toEqual({ 'minerals.zinc': 15, 'fattyAcids.epa': 325 })
  })

  it('null 不覆盖已有值（模型没读到，不等于要清空）', () => {
    const form = { brand: 'NOW Foods' }
    mergeAgentDraft(form, { brand: null })
    expect(form.brand).toBe('NOW Foods')
  })
})
