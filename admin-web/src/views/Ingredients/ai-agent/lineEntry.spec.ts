import { describe, expect, it } from 'vitest'
import { resolveLineEntry } from './lineEntry'

/**
 * 线路决议：进页面第一刻就决定这半页显示哪副身体。
 *
 * 优先级写死：草稿 / 原料（有对象，锁定）> 用户手选 > 入口预选。
 * 入口预选只在用户还没表达意见时起作用——否则 `?line=supplement`
 * 会让闸门卡上的「改回食材」变成死路。
 */
describe('resolveLineEntry', () => {
  it('没有任何输入 → 未定，不锁定', () => {
    expect(resolveLineEntry({})).toMatchObject({
      line: null,
      source: null,
      locked: false,
      rejected: false
    })
  })

  it('用户选食材 → 食材线，可改', () => {
    expect(resolveLineEntry({ userPick: 'FOOD' })).toMatchObject({
      line: 'FOOD',
      source: 'USER',
      locked: false
    })
  })

  it('入口预选补剂、用户改选食材 → 食材线（用户压过预选）', () => {
    expect(
      resolveLineEntry({ entryLine: 'SUPPLEMENT', userPick: 'FOOD' })
    ).toMatchObject({
      line: 'FOOD',
      source: 'USER'
    })
  })

  it('只有入口预选 → 按预选，可改', () => {
    expect(resolveLineEntry({ entryLine: 'SUPPLEMENT' })).toMatchObject({
      line: 'SUPPLEMENT',
      source: 'ENTRY',
      locked: false
    })
  })

  it('入口带了不认识的取值 → 当作没有预选', () => {
    expect(resolveLineEntry({ entryLine: 'PACKAGING' })).toMatchObject({
      line: null,
      source: null,
      locked: false
    })
  })

  it('草稿是食材、入口预选补剂 → 以草稿为准并提示已纠正', () => {
    const decision = resolveLineEntry({
      draftType: 'FOOD',
      entryLine: 'SUPPLEMENT'
    })

    expect(decision).toMatchObject({
      line: 'FOOD',
      source: 'DRAFT',
      locked: true
    })
    expect(decision.notice).not.toBeNull()
  })

  it('草稿是补剂、用户选食材 → 仍以草稿为准', () => {
    expect(
      resolveLineEntry({ draftType: 'SUPPLEMENT', userPick: 'FOOD' })
    ).toMatchObject({
      line: 'SUPPLEMENT',
      source: 'DRAFT',
      locked: true
    })
  })

  it('原料是补剂 → 以原料为准', () => {
    expect(resolveLineEntry({ ingredientType: 'SUPPLEMENT' })).toMatchObject({
      line: 'SUPPLEMENT',
      source: 'INGREDIENT',
      locked: true
    })
  })

  it.each(['draftType', 'ingredientType'])('%s 是包装 → 拒绝', (key) => {
    expect(resolveLineEntry({ [key]: 'PACKAGING' })).toMatchObject({
      line: null,
      locked: true,
      rejected: true
    })
  })
})
