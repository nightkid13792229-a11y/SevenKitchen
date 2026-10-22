import { describe, expect, it } from 'vitest'
import {
  areAllExceptionableApproved,
  canLeaveCheckStep,
  computeProfileCoverage,
  EVIDENCE_STATUS_META,
  formatCoverageNotice,
  isExceptionRecordComplete,
  resolvePrimaryProfileIndex
} from './stepProfileHelpers'
import type {
  CheckItem,
  ExceptionRecord,
  PreparationState,
  ProfileDraft
} from '@/types/ingredientCreation'

/**
 * ③ 档案成型与 ④ 终检共用的纯文案 / 判定：
 * 覆盖率怎么念、例外算不算填齐、主档案选谁。
 * 这些规则散在组件里最容易漂移，所以钉在纯函数上。
 */
describe('原料创建向导 · 档案覆盖率文案', () => {
  it('缺项时显示「营养待补：覆盖率 xx%，缺 a、b」', () => {
    expect(formatCoverageNotice(86.7, ['水分', '铁'])).toBe(
      '营养待补：覆盖率 86.7%，缺 水分、铁'
    )
  })

  it('覆盖率保留 1 位小数，0 与 100 都能正常显示', () => {
    expect(formatCoverageNotice(86.666, ['水分'])).toBe(
      '营养待补：覆盖率 86.7%，缺 水分'
    )
    expect(formatCoverageNotice(0, ['水分'])).toBe(
      '营养待补：覆盖率 0%，缺 水分'
    )
  })

  it('没有缺项时不显示提示', () => {
    expect(formatCoverageNotice(100, [])).toBe('')
    expect(formatCoverageNotice(100, ['水分'])).not.toBe('')
  })

  it('非有限百分比按 0 处理，不把 NaN 念给用户', () => {
    expect(formatCoverageNotice(Number.NaN, ['水分'])).toBe(
      '营养待补：覆盖率 0%，缺 水分'
    )
  })

  it('覆盖统计把 0 当成已填，把 null 当成缺失', () => {
    const coverage = computeProfileCoverage(
      [
        { fieldPath: 'macros.moisture', finalValue: 0 },
        { fieldPath: 'macros.crudeProtein', finalValue: 20 },
        { fieldPath: 'macros.crudeFat', finalValue: null },
        { fieldPath: 'macros.ash', finalValue: 3 }
      ],
      [
        { fieldPath: 'macros.moisture', label: '水分' },
        { fieldPath: 'macros.crudeProtein', label: '粗蛋白' },
        { fieldPath: 'macros.crudeFat', label: '粗脂肪' },
        { fieldPath: 'macros.ash', label: '灰分' }
      ]
    )

    expect(coverage.filled).toBe(3)
    expect(coverage.total).toBe(4)
    expect(coverage.percent).toBe(75)
    expect(coverage.missingFields).toEqual(['macros.crudeFat'])
    expect(coverage.missingLabels).toEqual(['粗脂肪'])
  })

  it('空目录不除零', () => {
    expect(computeProfileCoverage([], [])).toEqual({
      filled: 0,
      total: 0,
      percent: 0,
      missingFields: [],
      missingLabels: []
    })
  })

  it('证据状态标签固定为直接 / 换算 / 补位 / 人工裁决', () => {
    expect(EVIDENCE_STATUS_META.DIRECT.label).toBe('直接')
    expect(EVIDENCE_STATUS_META.CONVERTED.label).toBe('换算')
    expect(EVIDENCE_STATUS_META.FILLED.label).toBe('补位')
    expect(EVIDENCE_STATUS_META.MANUAL.label).toBe('人工裁决')
  })
})

describe('原料创建向导 · 例外是否齐备', () => {
  const missingState: CheckItem = {
    code: 'REQUIRED_STATE_MISSING',
    message: '缺少必需的熟档案（COOKED），需要补数据或登记例外。'
  }
  const macroOver: CheckItem = {
    code: 'MACRO_SUM_OVER_100',
    message: '宏量之和为 103.2g/100g，超过 100g 上限，需要登记例外。'
  }
  const approved = (code: string): ExceptionRecord => ({
    code,
    reason: '供应商确认这批数据可用',
    approvedBy: 'admin',
    approvedAt: '2026-10-22T10:00:00.000Z'
  })

  it('理由、操作人、时间缺一不可', () => {
    expect(isExceptionRecordComplete(approved('MACRO_SUM_OVER_100'))).toBe(true)
    expect(
      isExceptionRecordComplete({ ...approved('MACRO_SUM_OVER_100'), reason: '   ' })
    ).toBe(false)
    expect(
      isExceptionRecordComplete({ ...approved('MACRO_SUM_OVER_100'), approvedBy: '' })
    ).toBe(false)
    expect(
      isExceptionRecordComplete({ ...approved('MACRO_SUM_OVER_100'), approvedAt: '' })
    ).toBe(false)
    expect(isExceptionRecordComplete(null)).toBe(false)
  })

  it('每个可例外项都要有对应规则的放行记录', () => {
    const items = [missingState, macroOver]

    expect(areAllExceptionableApproved(items, [])).toBe(false)
    expect(
      areAllExceptionableApproved(items, [approved('REQUIRED_STATE_MISSING')])
    ).toBe(false)
    expect(
      areAllExceptionableApproved(items, [
        approved('REQUIRED_STATE_MISSING'),
        approved('MACRO_SUM_OVER_100')
      ])
    ).toBe(true)
  })

  it('没有可例外项时视为齐备', () => {
    expect(areAllExceptionableApproved([], [])).toBe(true)
  })

  it('拦死项存在时绝不能进入下一站（哪怕例外都填了）', () => {
    const blocking: CheckItem = {
      code: 'UNIT_NOT_ALLOWED',
      message: '单位不在允许集合'
    }

    expect(
      canLeaveCheckStep(
        { blocking: [blocking], exceptionable: [missingState], warnings: [] },
        [approved('REQUIRED_STATE_MISSING')]
      )
    ).toBe(false)

    expect(
      canLeaveCheckStep(
        { blocking: [], exceptionable: [missingState], warnings: [] },
        [approved('REQUIRED_STATE_MISSING')]
      )
    ).toBe(true)
  })

  it('提醒项不阻断下一步', () => {
    expect(
      canLeaveCheckStep(
        {
          blocking: [],
          exceptionable: [],
          warnings: [
            {
              code: 'ENERGY_CROSS_CHECK_DEVIATION',
              message: '能量反算偏差 12%'
            }
          ]
        },
        []
      )
    ).toBe(true)
  })
})

describe('原料创建向导 · 主档案推断', () => {
  function profile(
    preparationState: PreparationState,
    sourceRecordId: string
  ): Pick<ProfileDraft, 'preparationState' | 'sourceRecordId'> {
    return { preparationState, sourceRecordId }
  }

  it('优先选本次缝合主来源对应的档案', () => {
    const profiles = [profile('RAW', 'source-raw'), profile('COOKED', 'source-cooked')]

    expect(
      resolvePrimaryProfileIndex(profiles, {
        primarySourceRecordId: 'source-cooked',
        category: 'MEAT_ORGAN'
      })
    ).toBe(1)
  })

  it('没有主来源匹配时，按类别默认主档案状态选', () => {
    const profiles = [profile('RAW', 'source-raw'), profile('COOKED', 'source-cooked')]

    expect(
      resolvePrimaryProfileIndex(profiles, {
        primarySourceRecordId: null,
        category: 'STARCHY_VEGETABLE'
      })
    ).toBe(1)
    expect(
      resolvePrimaryProfileIndex(profiles, {
        primarySourceRecordId: null,
        category: 'MEAT_ORGAN'
      })
    ).toBe(0)
  })

  it('都没有时退回第一份，空档案返回 -1', () => {
    expect(
      resolvePrimaryProfileIndex([profile('COOKED', 'source-cooked')], {
        primarySourceRecordId: null,
        category: 'OTHER'
      })
    ).toBe(0)
    expect(
      resolvePrimaryProfileIndex([], {
        primarySourceRecordId: null,
        category: 'OTHER'
      })
    ).toBe(-1)
  })
})
