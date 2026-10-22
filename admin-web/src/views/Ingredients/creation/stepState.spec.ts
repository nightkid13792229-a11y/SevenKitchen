import { describe, expect, it } from 'vitest'
import { nextStep, stepIndex, stepList } from './stepState'
import type { CreationStep } from '@/types/ingredientCreation'

/**
 * 向导六站的顺序是产品的硬契约：
 * ① 起手 → ② 营养依据 → ③ 档案成型 → ④ 终检 → ⑤ 原料档案 → ⑥ 收尾。
 *
 * 站点顺序一旦漂移，进度条、上一步/下一步与草稿恢复都会跟着错位，
 * 所以这里把顺序与边界都钉死。
 */
describe('原料创建向导 · 站点状态', () => {
  it('stepList 固定为六站且顺序不变', () => {
    expect(stepList).toHaveLength(6)
    expect(stepList.map((item) => item.step)).toEqual([
      'INTAKE',
      'SOURCES',
      'PROFILE',
      'CHECK',
      'INGREDIENT',
      'COMMIT'
    ])
  })

  it('nextStep 按固定顺序前进', () => {
    expect(nextStep('INTAKE')).toBe('SOURCES')
    expect(nextStep('SOURCES')).toBe('PROFILE')
    expect(nextStep('PROFILE')).toBe('CHECK')
    expect(nextStep('CHECK')).toBe('INGREDIENT')
    expect(nextStep('INGREDIENT')).toBe('COMMIT')
  })

  it('nextStep 在最后一站返回 null', () => {
    expect(nextStep('COMMIT')).toBeNull()
  })

  it('stepIndex 按固定顺序返回下标', () => {
    expect(stepIndex('INTAKE')).toBe(0)
    expect(stepIndex('CHECK')).toBe(3)
    expect(stepIndex('COMMIT')).toBe(5)
  })

  it('stepIndex 对未知站点返回 -1', () => {
    expect(stepIndex('NOT_A_STEP' as CreationStep)).toBe(-1)
  })

  it('每一站都有可展示的中文标题与说明', () => {
    for (const item of stepList) {
      expect(item.title.trim().length).toBeGreaterThan(0)
      expect(item.summary.trim().length).toBeGreaterThan(0)
    }
  })
})
