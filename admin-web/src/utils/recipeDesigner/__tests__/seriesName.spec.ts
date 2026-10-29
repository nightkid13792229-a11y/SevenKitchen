import { describe, expect, it } from 'vitest'
import { buildTemporarySeriesName, isTemporarySeriesName } from '../seriesName'

describe('系列临时名称', () => {
  it('生成带本地日期时间的临时名，例如 未命名1021-2215', () => {
    expect(
      buildTemporarySeriesName({ now: new Date(2026, 9, 21, 22, 15) })
    ).toBe('未命名1021-2215')
  })

  it('临时名不超过后端 12 个字的上限', () => {
    const name = buildTemporarySeriesName({
      now: new Date(2026, 11, 31, 23, 59)
    })
    expect(name).toBe('未命名1231-2359')
    expect([...name].length).toBe(12)
    expect(name.length).toBeLessThanOrEqual(12)
  })

  it('检测临时前缀', () => {
    expect(isTemporarySeriesName('未命名1021-2215')).toBe(true)
    expect(isTemporarySeriesName(' 未命名系列 · 旺财 ')).toBe(true)
    expect(isTemporarySeriesName('旺财 12 月定制鲜食')).toBe(false)
    expect(isTemporarySeriesName('')).toBe(false)
    expect(isTemporarySeriesName(undefined)).toBe(false)
  })
})
