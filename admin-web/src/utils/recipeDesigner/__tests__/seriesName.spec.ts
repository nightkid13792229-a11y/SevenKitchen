import { describe, expect, it } from 'vitest'
import { buildTemporarySeriesName, isTemporarySeriesName } from '../seriesName'

describe('系列临时名称', () => {
  it('generates a clearly marked temporary name with local time', () => {
    expect(
      buildTemporarySeriesName({ now: new Date(2026, 9, 21, 22, 15) })
    ).toBe('未命名系列 · 10-21 22:15')
  })

  it('includes the referenced dog name when available', () => {
    expect(
      buildTemporarySeriesName({
        dogName: ' 旺财 ',
        now: new Date(2026, 0, 3, 9, 5)
      })
    ).toBe('未命名系列 · 旺财 · 01-03 09:05')
  })

  it('drops an overly long dog name to stay within the backend name limit', () => {
    const name = buildTemporarySeriesName({
      dogName: '超'.repeat(60),
      now: new Date(2026, 9, 21, 22, 15)
    })
    expect(name).toBe('未命名系列 · 10-21 22:15')
    expect(name.length).toBeLessThanOrEqual(60)
  })

  it('detects the temporary prefix only', () => {
    expect(isTemporarySeriesName('未命名系列 · 10-21 22:15')).toBe(true)
    expect(isTemporarySeriesName(' 未命名系列 · 旺财 ')).toBe(true)
    expect(isTemporarySeriesName('旺财 12 月定制鲜食')).toBe(false)
    expect(isTemporarySeriesName('')).toBe(false)
    expect(isTemporarySeriesName(undefined)).toBe(false)
  })
})
