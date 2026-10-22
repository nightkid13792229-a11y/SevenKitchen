import { describe, expect, it } from 'vitest'
import {
  COVERAGE_CATEGORY_OPTIONS,
  getCoverageCategoryLabel,
  getPreparationStateLabel,
  resolveCoverageStates,
  resolveDefaultPrimaryState,
  resolveStateCoverage
} from './stateCoverage'
import type { CoverageCategory } from '@/types/ingredientCreation'

/**
 * 生熟清单是产品规则，不是页面自己的发挥：
 * 这张表必须与后端 `domain/ingredient-creation/state-coverage.ts` 一字不差。
 * 一旦两边漂移，① 站勾出来的清单和 ④ 站终检的「必需项缺失」就会各说各话。
 */
describe('原料创建向导 · 默认生熟清单', () => {
  it('肉 / 内脏 / 水产 / 蛋：必需生、建议熟、默认主档案生', () => {
    expect(resolveStateCoverage('MEAT_ORGAN')).toEqual({
      required: ['RAW'],
      suggested: ['COOKED']
    })
    expect(resolveDefaultPrimaryState('MEAT_ORGAN')).toBe('RAW')
  })

  it('根茎淀粉类蔬菜：必需熟、建议生、默认主档案熟', () => {
    expect(resolveStateCoverage('STARCHY_VEGETABLE')).toEqual({
      required: ['COOKED'],
      suggested: ['RAW']
    })
    expect(resolveDefaultPrimaryState('STARCHY_VEGETABLE')).toBe('COOKED')
  })

  it('其他：不预设必需或建议，默认主档案生', () => {
    expect(resolveStateCoverage('OTHER')).toEqual({
      required: [],
      suggested: []
    })
    expect(resolveDefaultPrimaryState('OTHER')).toBe('RAW')
  })

  it('每次返回新对象与新数组，避免页面改动污染默认表', () => {
    const first = resolveStateCoverage('MEAT_ORGAN')
    first.required.push('COOKED')
    first.suggested.length = 0

    expect(resolveStateCoverage('MEAT_ORGAN')).toEqual({
      required: ['RAW'],
      suggested: ['COOKED']
    })
  })

  it('把必需与建议合并成要检索/要建档的状态，顺序固定为先生后熟且不重复', () => {
    expect(resolveCoverageStates(resolveStateCoverage('MEAT_ORGAN'))).toEqual([
      'RAW',
      'COOKED'
    ])
    expect(
      resolveCoverageStates(resolveStateCoverage('STARCHY_VEGETABLE'))
    ).toEqual(['RAW', 'COOKED'])
    expect(resolveCoverageStates(resolveStateCoverage('OTHER'))).toEqual([])
    expect(
      resolveCoverageStates({
        required: ['COOKED', 'RAW'],
        suggested: ['COOKED']
      })
    ).toEqual(['RAW', 'COOKED'])
  })

  it('类别文案必须含「水产」和「蛋」，否则虾与鸡蛋会被归到「其他」并静默丢掉必需生', () => {
    expect(getCoverageCategoryLabel('MEAT_ORGAN')).toBe('肉/内脏/水产/蛋')
    expect(getCoverageCategoryLabel('MEAT_ORGAN')).toContain('水产')
    expect(getCoverageCategoryLabel('MEAT_ORGAN')).toContain('蛋')
    expect(getCoverageCategoryLabel('STARCHY_VEGETABLE')).toBe(
      '根茎淀粉类蔬菜'
    )
    expect(getCoverageCategoryLabel('OTHER')).toBe('其他')
  })

  it('类别选项固定为三选一，值与后端 CoverageCategory 一致', () => {
    expect(COVERAGE_CATEGORY_OPTIONS.map((item) => item.value)).toEqual([
      'MEAT_ORGAN',
      'STARCHY_VEGETABLE',
      'OTHER'
    ])
  })

  it('状态文案只有生 / 熟两种', () => {
    expect(getPreparationStateLabel('RAW')).toBe('生')
    expect(getPreparationStateLabel('COOKED')).toBe('熟')
  })

  it('三个类别都能查到文案，不出现空标签', () => {
    const categories: CoverageCategory[] = [
      'MEAT_ORGAN',
      'STARCHY_VEGETABLE',
      'OTHER'
    ]
    for (const category of categories) {
      expect(getCoverageCategoryLabel(category).trim().length).toBeGreaterThan(0)
    }
  })
})
