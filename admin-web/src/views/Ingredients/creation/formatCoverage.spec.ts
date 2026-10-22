import { describe, expect, it } from 'vitest'
import { formatCoverage } from './formatCoverage'

/**
 * ② 站候选卡上的覆盖率文案。
 *
 * 后端只给百分比与缺失项数，页面要还原成「已覆盖 / 总数 · 缺 N」；
 * 总数从百分比与缺失数反推，不能写死 30（必需营养素会随规则版本变化）。
 * 注意：`·` 两侧各有一个空格，是产品文案的一部分。
 */
describe('原料创建向导 · 覆盖率文案', () => {
  it('86.7% 缺 4 项时还原成 26 / 30 · 缺 4', () => {
    expect(formatCoverage(86.7, 4)).toBe('26 / 30 · 缺 4')
  })

  it('0% 缺 30 项时是 0 / 30 · 缺 30', () => {
    expect(formatCoverage(0, 30)).toBe('0 / 30 · 缺 30')
  })

  it('总数按百分比反推，不写死 30 项', () => {
    expect(formatCoverage(91.3, 4)).toBe('42 / 46 · 缺 4')
    expect(formatCoverage(50, 15)).toBe('15 / 30 · 缺 15')
  })

  it('一项不缺时显示全部覆盖', () => {
    expect(formatCoverage(100, 0)).toBe('全部覆盖 · 缺 0')
  })

  it('异常输入不产出 NaN', () => {
    expect(formatCoverage(Number.NaN, 4)).toBe('0 / 4 · 缺 4')
    expect(formatCoverage(86.7, -2)).toBe('全部覆盖 · 缺 0')
  })
})
