import { describe, expect, it } from 'vitest'
import { formatSupplementAmountWithDisplayUnit } from './diy-sheet-format'

describe('diy-sheet-format', () => {
  it('keeps fractional count-based supplement display units without integer rounding', () => {
    expect(formatSupplementAmountWithDisplayUnit(13.0328, 'g', '片')).toBe('13.03片')
    expect(formatSupplementAmountWithDisplayUnit(1.6, 'g', '片')).toBe('1.6片')
    expect(formatSupplementAmountWithDisplayUnit(2, 'g', '粒')).toBe('2粒')
    expect(formatSupplementAmountWithDisplayUnit(0.4, 'g', '颗')).toBe('0.4颗')
  })

  it('keeps existing decimal formatting for gram and milligram displays', () => {
    expect(formatSupplementAmountWithDisplayUnit(1.25, 'g', 'g')).toBe('1.3g')
    expect(formatSupplementAmountWithDisplayUnit(0.25, 'g', 'mg')).toBe('250.0mg')
  })
})
