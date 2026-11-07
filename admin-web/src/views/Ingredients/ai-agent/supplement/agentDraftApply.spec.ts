import { describe, expect, it } from 'vitest'
import { applyAgentDraft } from './agentDraftApply'

/**
 * 模型回写只认后端给的 applied 清单。
 *
 * 有个真实场景必须钉住：用户在模型思考期间手改的价格，不能被回显的旧值冲掉。
 */
describe('按 applied 回写', () => {
  it('只写清单里的字段', () => {
    const form = { name: '锌', brand: '' }
    const touched = applyAgentDraft(form, {
      draft: { name: '锌', brand: 'NOW Foods' },
      applied: ['brand']
    })

    expect(form.brand).toBe('NOW Foods')
    expect(touched).toEqual(['brand'])
  })

  it('用户在等待期间手改的值不会被冲掉（模型没写这一格）', () => {
    const form = { name: '锌', currentPricePerPurchaseUnit: 100 }
    applyAgentDraft(form, {
      draft: { name: '锌', currentPricePerPurchaseUnit: 92 },
      applied: ['name']
    })

    expect(form.currentPricePerPurchaseUnit).toBe(100)
  })

  it('营养档案按项合并', () => {
    const form = { servingNutrients: { 'minerals.zinc': 15 } }
    applyAgentDraft(form, {
      draft: { servingNutrients: { 'minerals.zinc': 15, 'fattyAcids.epa': 325 } },
      applied: ['servingNutrients.fattyAcids.epa']
    })

    expect(form.servingNutrients).toEqual({ 'minerals.zinc': 15, 'fattyAcids.epa': 325 })
  })

  it('表单里没有的字段不写', () => {
    const form = { name: '' }
    applyAgentDraft(form, { draft: { evil: 1 }, applied: ['evil'] })
    expect('evil' in form).toBe(false)
  })

  it('空清单什么都不动', () => {
    const form = { name: '锌' }
    expect(applyAgentDraft(form, {})).toEqual([])
    expect(form.name).toBe('锌')
  })
})
