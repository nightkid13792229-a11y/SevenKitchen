import { describe, expect, it } from 'vitest'
import { formatNutrientAmount } from '@/utils/nutrientAmount'

/**
 * 营养素显示精度（2026-10-28）
 *
 * 守的是一个问题：明细弹窗原来一律保留 1 位小数，镁这种单份只有
 * 0.005–0.03 g 的微量元素整列被压成「0.0」，用户以为算错了。
 */
describe('formatNutrientAmount', () => {
  it('镁这类小量：不会被压成 0', () => {
    expect(formatNutrientAmount(0.0285, 'g')).toBe('0.029 g')
    expect(formatNutrientAmount(0.0138, 'g')).toBe('0.014 g')
    expect(formatNutrientAmount(0.0054, 'g')).toBe('0.0054 g')
    expect(formatNutrientAmount(0.0052, 'g')).toBe('0.0052 g')
  })

  it('克级以上的量：保留 1 位，读起来不啰嗦', () => {
    expect(formatNutrientAmount(0.777, 'g')).toBe('0.78 g')
    expect(formatNutrientAmount(14.21, 'g')).toBe('14.2 g')
    expect(formatNutrientAmount(6, 'mg')).toBe('6.0 mg')
  })

  it('0 就是 0（不是「没数据」，也不是 0.0）', () => {
    expect(formatNutrientAmount(0, 'g')).toBe('0 g')
  })

  it('缺失给「无数据」，不冒充 0', () => {
    expect(formatNutrientAmount(null, 'g')).toBe('无数据')
    expect(formatNutrientAmount(undefined, 'g')).toBe('无数据')
    expect(formatNutrientAmount(Number.NaN, 'g')).toBe('无数据')
  })

  it('单位为空时不留下尾部空格', () => {
    expect(formatNutrientAmount(0.5, '')).toBe('0.5')
    expect(formatNutrientAmount(0.5, null)).toBe('0.5')
  })
})
