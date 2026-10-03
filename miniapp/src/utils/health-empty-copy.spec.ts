import { describe, expect, it } from 'vitest'
import { getHealthTabEmptyTitle } from './health-records'

/**
 * 空态文案（2026-10-03 老板报的 bug 修）。
 *
 * 老板实测：过敏标签下的提示写的是「还没有就诊记录」，与标签对不上。
 * 根因：原来按 `props.visitKind` 取文案，而页面在过敏标签下传的 visitKind
 * 是 `medical`（合并模式的遗留）—— 文案就跟数据一样被带偏了。
 * 现在一律**按标签**取，五类各自说自己的名字。
 */
describe('各板块空态文案', () => {
  it('按标签说自己的名字', () => {
    expect(getHealthTabEmptyTitle('medical')).toBe('还没有就诊记录')
    expect(getHealthTabEmptyTitle('checkup')).toBe('还没有体检记录')
    expect(getHealthTabEmptyTitle('allergy')).toBe('还没有过敏记录')
  })

  it('过敏标签绝不会说成"就诊"（老板报的那条）', () => {
    const allergy = getHealthTabEmptyTitle('allergy')

    expect(allergy).toContain('过敏')
    expect(allergy).not.toContain('就诊')
    expect(allergy).not.toContain('体检')
  })

  it('三个标签三种文案，互不相同', () => {
    const titles = (['medical', 'checkup', 'allergy'] as const).map(getHealthTabEmptyTitle)

    expect(new Set(titles).size).toBe(3)
  })
})
