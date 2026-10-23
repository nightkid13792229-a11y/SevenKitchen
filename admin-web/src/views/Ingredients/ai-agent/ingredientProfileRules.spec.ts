import { describe, expect, it } from 'vitest'
import {
  COVERAGE_CATEGORY_OPTIONS,
  PROFILE_FIELD_DEFINITIONS,
  resolvePrimaryProfileIndex,
  sortProfilesByState
} from './ingredientProfileRules'
import type { PreparationState, ProfileDraft } from '@/types/ingredientCreation'

/**
 * Agent 审核页沿用旧向导的档案口径：类别文案、营养字段目录、生熟顺序、主档案推断。
 * 这些规则散在页面里最容易漂移，所以钉在纯函数上。
 */
describe('原料 Agent · 类别选项', () => {
  it('三类固定顺序：肉/内脏/水产/蛋、根茎淀粉类蔬菜、其他', () => {
    expect(COVERAGE_CATEGORY_OPTIONS.map((item) => item.value)).toEqual([
      'MEAT_ORGAN',
      'STARCHY_VEGETABLE',
      'OTHER'
    ])
  })

  it('肉/内脏那一类的文案必须写全「水产」和「蛋」，否则会被静默归到「其他」', () => {
    const meat = COVERAGE_CATEGORY_OPTIONS[0]!

    expect(meat.label).toBe('肉/内脏/水产/蛋')
    expect(meat.hint).toContain('鱼虾贝')
    expect(meat.hint).toContain('蛋')
  })
})

describe('原料 Agent · 营养字段目录', () => {
  it('字段路径是「tab.key.field.key」，且保留单位与中文名', () => {
    const moisture = PROFILE_FIELD_DEFINITIONS.find(
      (field) => field.fieldPath === 'macros.moisture'
    )

    expect(moisture).toMatchObject({
      tabKey: 'macros',
      fieldKey: 'moisture',
      label: '水分'
    })
    expect(moisture?.unit).toBeTruthy()
  })

  it('目录不重复，且每个字段都挂在已知 tab 上', () => {
    const paths = PROFILE_FIELD_DEFINITIONS.map((field) => field.fieldPath)

    expect(new Set(paths).size).toBe(paths.length)
    expect(
      PROFILE_FIELD_DEFINITIONS.every((field) =>
        field.fieldPath.startsWith(`${field.tabKey}.`)
      )
    ).toBe(true)
  })
})

describe('原料 Agent · 生熟排序', () => {
  function profile(preparationState: PreparationState): ProfileDraft {
    return {
      preparationState,
      sourceRecordId: `src-${preparationState}`,
      entries: [],
      notes: null
    }
  }

  it('先生后熟，同状态保持原顺序', () => {
    const cooked = profile('COOKED')
    const raw = profile('RAW')

    expect(sortProfilesByState([cooked, raw])).toEqual([raw, cooked])
    expect(sortProfilesByState([raw, cooked])).toEqual([raw, cooked])
  })

  it('不改动原数组', () => {
    const cooked = profile('COOKED')
    const raw = profile('RAW')
    const input = [cooked, raw]

    sortProfilesByState(input)

    expect(input).toEqual([cooked, raw])
  })
})

describe('原料 Agent · 主档案推断', () => {
  function profile(
    preparationState: PreparationState,
    sourceRecordId: string
  ): Pick<ProfileDraft, 'preparationState' | 'sourceRecordId'> {
    return { preparationState, sourceRecordId }
  }

  it('优先选缝合主来源对应的档案', () => {
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
    expect(
      resolvePrimaryProfileIndex(profiles, {
        primarySourceRecordId: null,
        category: 'OTHER'
      })
    ).toBe(0)
  })

  it('都对不上时退回第一份，空档案返回 -1', () => {
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
