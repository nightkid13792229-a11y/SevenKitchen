import { describe, expect, it } from 'vitest'
import { CHECK_GROUP_META, groupCheckItems } from './checkPresentation'
import type { FinalCheckResult } from '@/types/ingredientCreation'

/**
 * ④ 终检站的三栏展示。
 *
 * 分组本身完全照抄后端返回（前端不判断能不能通过），但组内顺序必须是确定的：
 * 同一份结果刷新两次，页面不能一会儿把单位问题排第一、一会儿排最后。
 */
describe('原料创建向导 · 终检三栏分组', () => {
  const result: FinalCheckResult = {
    blocking: [
      { code: 'CONVERSION_NOT_REVERSIBLE', message: '换算反算不闭合' },
      { code: 'UNIT_NOT_ALLOWED', message: '单位不在允许集合' },
      { code: 'UNIT_MISMATCH', message: '单位与字段不匹配' },
      { code: 'BASIS_NOT_CONVERTIBLE', message: '每份缺份量克数' }
    ],
    exceptionable: [
      { code: 'REQUIRED_STATE_MISSING', message: '缺少必需的熟档案' },
      { code: 'MACRO_SUM_OVER_100', message: '宏量之和超过 100g' }
    ],
    warnings: [
      { code: 'MAGNITUDE_OUTLIER', message: '量级异常', fieldPath: 'minerals.iron' },
      { code: 'ENERGY_CROSS_CHECK_DEVIATION', message: '能量反算偏差 12%' }
    ]
  }

  it('按拦死 / 可例外 / 提醒三组返回，不丢条目', () => {
    const grouped = groupCheckItems(result)

    expect(grouped.blocking).toHaveLength(4)
    expect(grouped.exceptionable).toHaveLength(2)
    expect(grouped.warnings).toHaveLength(2)
  })

  it('组内按固定规则顺序排，未知规则保持后端顺序（稳定）', () => {
    const grouped = groupCheckItems({
      blocking: [
        { code: 'UNKNOWN_NEW_RULE', message: '未知一' },
        { code: 'UNIT_MISMATCH', message: '单位不匹配' },
        { code: 'UNIT_NOT_ALLOWED', message: '单位不允许' },
        { code: 'UNKNOWN_NEW_RULE', message: '未知二' }
      ],
      exceptionable: [
        { code: 'REQUIRED_STATE_MISSING', message: '缺熟档案' },
        { code: 'MACRO_SUM_OVER_100', message: '宏量超限' }
      ],
      warnings: [
        { code: 'MAGNITUDE_OUTLIER', message: '量级异常' },
        { code: 'ENERGY_CROSS_CHECK_DEVIATION', message: '能量偏差' }
      ]
    })

    expect(grouped.blocking.map((item) => item.code)).toEqual([
      'UNIT_NOT_ALLOWED',
      'UNIT_MISMATCH',
      'UNKNOWN_NEW_RULE',
      'UNKNOWN_NEW_RULE'
    ])
    expect(grouped.blocking[2]?.message).toBe('未知一')
    expect(grouped.blocking[3]?.message).toBe('未知二')
    expect(grouped.exceptionable.map((item) => item.code)).toEqual([
      'MACRO_SUM_OVER_100',
      'REQUIRED_STATE_MISSING'
    ])
    expect(grouped.warnings.map((item) => item.code)).toEqual([
      'ENERGY_CROSS_CHECK_DEVIATION',
      'MAGNITUDE_OUTLIER'
    ])
  })

  it('不修改后端返回的原始结果', () => {
    const original = JSON.parse(JSON.stringify(result)) as FinalCheckResult
    groupCheckItems(result)

    expect(result).toEqual(original)
  })

  it('空结果 / null 不报错，三组都是空数组', () => {
    expect(groupCheckItems({ blocking: [], exceptionable: [], warnings: [] })).toEqual({
      blocking: [],
      exceptionable: [],
      warnings: []
    })
    expect(groupCheckItems(null)).toEqual({
      blocking: [],
      exceptionable: [],
      warnings: []
    })
    expect(groupCheckItems(undefined)).toEqual({
      blocking: [],
      exceptionable: [],
      warnings: []
    })
  })

  it('三个分组都有中文标题与说明，且拦死组强调没有绕过按钮', () => {
    expect(CHECK_GROUP_META.blocking.title).toContain('拦死')
    expect(CHECK_GROUP_META.blocking.description).toContain('没有绕过')
    expect(CHECK_GROUP_META.exceptionable.title).toContain('可例外')
    expect(CHECK_GROUP_META.warnings.title).toContain('提醒')
  })
})
