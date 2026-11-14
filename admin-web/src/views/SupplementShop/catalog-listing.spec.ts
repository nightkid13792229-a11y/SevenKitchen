import { describe, expect, it } from 'vitest'
import {
  ATTENTION_WINDOW_DAYS,
  isNotLaunched,
  isRecentlyCreatedNotReady,
  needsAttention,
} from './catalog-listing'

const DAY = 24 * 60 * 60 * 1000
const NOW = new Date('2026-11-14T12:00:00Z').getTime()

function row(overrides: Record<string, any> = {}) {
  return {
    createdAt: new Date(NOW - DAY).toISOString(),
    supplementRetailEnabled: true,
    issues: [] as Array<{ level: string; code: string }>,
    ...overrides,
  }
}

describe('补剂上架清单 · 「配好了没」口径', () => {
  it('已上架、无 ERROR、组也正常 → 配好了', () => {
    expect(isNotLaunched(row())).toBe(false)
  })

  it('未上架 → 没配好', () => {
    expect(isNotLaunched(row({ supplementRetailEnabled: false }))).toBe(true)
  })

  it('已上架但有 ERROR → 没配好（不能只看开关）', () => {
    expect(
      isNotLaunched(row({ issues: [{ level: 'ERROR', code: 'SHELF_LIFE_MISSING' }] })),
    ).toBe(true)
  })

  it('已上架但等价组有问题 → 没配好（与「等价组」列口径一致）', () => {
    expect(
      isNotLaunched(row({ issues: [{ level: 'WARN', code: 'EQUIVALENCE_UNGROUPED' }] })),
    ).toBe(true)
    expect(
      isNotLaunched(row({ issues: [{ level: 'WARN', code: 'EQUIVALENCE_SINGLETON' }] })),
    ).toBe(true)
  })

  it('与组无关的 WARN（同名重复）不影响', () => {
    expect(
      isNotLaunched(row({ issues: [{ level: 'WARN', code: 'DUPLICATE_NAME' }] })),
    ).toBe(false)
  })
})

describe('补剂上架清单 · 新建 7 天待配勾选', () => {
  it('窗口是 7 天', () => {
    expect(ATTENTION_WINDOW_DAYS).toBe(7)
  })

  it('1 天前建的、还没上架 → 勾中', () => {
    expect(isRecentlyCreatedNotReady(row({ supplementRetailEnabled: false }), NOW)).toBe(true)
  })

  it('第 7 天边界仍算（含当天）', () => {
    const createdAt = new Date(NOW - 7 * DAY).toISOString()
    expect(
      isRecentlyCreatedNotReady(row({ createdAt, supplementRetailEnabled: false }), NOW),
    ).toBe(true)
  })

  it('第 8 天 → 不再提醒', () => {
    const createdAt = new Date(NOW - 8 * DAY).toISOString()
    expect(
      isRecentlyCreatedNotReady(row({ createdAt, supplementRetailEnabled: false }), NOW),
    ).toBe(false)
  })

  it('老档案没上架也不打扰新建提醒（但常驻「未配好」仍然算）', () => {
    const createdAt = new Date(NOW - 400 * DAY).toISOString()
    const old = row({ createdAt, supplementRetailEnabled: false })
    expect(isRecentlyCreatedNotReady(old, NOW)).toBe(false)
    expect(isNotLaunched(old)).toBe(true)
  })

  it('未来时间（系统时钟不准）不算新建', () => {
    const createdAt = new Date(NOW + DAY).toISOString()
    expect(
      isRecentlyCreatedNotReady(row({ createdAt, supplementRetailEnabled: false }), NOW),
    ).toBe(false)
  })

  it('没有 createdAt 的老数据不崩、也不算新建', () => {
    expect(
      isRecentlyCreatedNotReady(row({ createdAt: null, supplementRetailEnabled: false }), NOW),
    ).toBe(false)
    expect(needsAttention(row({ createdAt: null }), NOW)).toBe(false)
  })
})
