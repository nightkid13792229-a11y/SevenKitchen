import { describe, expect, it } from 'vitest'
import { resolveCoverBadgeText } from './cover-badge'

describe('resolveCoverBadgeText', () => {
  it('joins series badges with a separator', () => {
    expect(resolveCoverBadgeText({ coverBadges: ['低脂', '易消化'] })).toBe('低脂 · 易消化')
  })

  it('returns empty when no badge is configured, even if a legacy cover title exists', () => {
    expect(resolveCoverBadgeText({ coverBadges: [], coverTitle: '旧封面标题' } as any)).toBe('')
    expect(resolveCoverBadgeText({ coverTitle: '旧封面标题' } as any)).toBe('')
  })

  it('trims and ignores blank badges', () => {
    expect(resolveCoverBadgeText({ coverBadges: [' 低脂 ', '', '  '] })).toBe('低脂')
    expect(resolveCoverBadgeText({ coverBadges: ['  ', '', '   '] })).toBe('')
  })

  it('returns empty when the series has no badge list at all', () => {
    expect(resolveCoverBadgeText()).toBe('')
    expect(resolveCoverBadgeText(null)).toBe('')
    expect(resolveCoverBadgeText({})).toBe('')
    expect(resolveCoverBadgeText({ coverBadges: null })).toBe('')
    expect(resolveCoverBadgeText({ coverBadges: [] })).toBe('')
  })
})
