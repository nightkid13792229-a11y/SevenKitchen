import { CustomRecipeStatus } from '@prisma/client'
import { decideAutoComplete } from '../../../src/domain/custom-recipe/custom-recipe.state'

/**
 * 自动完成的售后闸门（2026-10-18 · 需求 2.5.5）
 *
 * 老板原话：
 *   "为什么不能到期强制完成：否则会出现「顾客的问题还没解决，
 *     订单却显示已完成」—— 他会以为被敷衍了。"
 *
 * 这条是**真 bug 的回归测试**：此前 `decideAutoComplete` 只看时间，
 * 有未处理完的售后也照完成。
 */
describe('decideAutoComplete · 有未完成的售后时不许完成', () => {
  const past = new Date('2026-10-01T00:00:00+08:00')
  const now = new Date('2026-10-20T00:00:00+08:00')

  it('★ 有未处理完的售后 → 到点了也不完成', () => {
    const result = decideAutoComplete({
      status: CustomRecipeStatus.DELIVERED,
      autoCompleteAt: past,
      now,
      hasOpenAftersale: true,
    })

    expect(result.shouldComplete).toBe(false)
    expect(result.reason).toContain('售后')
  })

  it('没有售后 + 到点 → 正常完成', () => {
    const result = decideAutoComplete({
      status: CustomRecipeStatus.DELIVERED,
      autoCompleteAt: past,
      now,
      hasOpenAftersale: false,
    })

    expect(result.shouldComplete).toBe(true)
  })

  it('没传这个参数时按"没有售后"处理（向后兼容）', () => {
    const result = decideAutoComplete({
      status: CustomRecipeStatus.DELIVERED,
      autoCompleteAt: past,
      now,
    })

    expect(result.shouldComplete).toBe(true)
  })

  it('★ 售后这条判断**先于**时间判断（与到没到点无关）', () => {
    // 即使还没到点，也该报"售后没处理完"而不是"还没到点"
    const result = decideAutoComplete({
      status: CustomRecipeStatus.DELIVERED,
      autoCompleteAt: new Date('2026-12-01T00:00:00+08:00'),
      now,
      hasOpenAftersale: true,
    })

    expect(result.shouldComplete).toBe(false)
    expect(result.reason).toContain('售后')
  })
})
