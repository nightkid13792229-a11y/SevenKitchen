import { describe, expect, it } from 'vitest'
import type {
  IngredientCreationDraftPayload,
  NutritionEvidenceEntry,
  ProfileDraft
} from '@/types/ingredientCreation'
import { PROFILE_FIELD_DEFINITIONS } from './ingredientProfileRules'
import {
  applyProfileCellEdit,
  countPendingRows,
  countPlanConflicts,
  markIngredientFieldManual,
  toCheckSummary,
  toCommitInput,
  toIngredientCard,
  toIngredientDraft,
  toProfileRows
} from './draftReview'

function entry(
  fieldPath: string,
  finalValue: number | null,
  overrides: Partial<NutritionEvidenceEntry> = {}
): NutritionEvidenceEntry {
  return {
    fieldPath,
    finalValue,
    unit: 'g',
    status: 'DIRECT',
    sourceRecordId: 'src-raw',
    sourceValue: finalValue,
    sourceUnit: 'g',
    formula: null,
    confirmedBy: null,
    confirmedAt: null,
    ...overrides
  }
}

const rawProfile: ProfileDraft = {
  preparationState: 'RAW',
  sourceRecordId: 'src-raw',
  entries: [
    entry('macros.crudeProtein', 20.4),
    entry('macros.crudeFat', 4.8, {
      status: 'FILLED',
      sourceRecordId: 'src-supplement'
    }),
    entry('minerals.iron', 12, {
      unit: 'mg',
      status: 'CONVERTED',
      sourceValue: 12000,
      sourceUnit: 'µg',
      formula: '12000 µg → 12 mg'
    })
  ],
  notes: '生档案'
}

const cookedProfile: ProfileDraft = {
  preparationState: 'COOKED',
  sourceRecordId: 'src-cooked',
  entries: [
    entry('macros.crudeProtein', 24, {
      status: 'MANUAL',
      sourceRecordId: 'src-cooked'
    })
  ],
  notes: null
}

const payload: IngredientCreationDraftPayload = {
  intake: {
    name: '鸡肝',
    nameEn: 'Chicken liver',
    aliases: [],
    confusables: [],
    category: 'MEAT_ORGAN',
    requiredStates: ['RAW'],
    suggestedStates: ['COOKED']
  },
  ingredient: {
    name: '鸡肝',
    nameEn: 'Chicken liver',
    type: 'FOOD',
    category: 'MEAT_ORGAN',
    baseUnit: 'G',
    unitDisplayLabel: '克',
    cfctClass: '禽肉类及制品',
    edibleYieldRate: 0.95,
    manualFields: ['edibleYieldPercent']
  },
  profiles: [cookedProfile, rawProfile],
  mergePlan: {
    primarySourceRecordId: 'src-raw',
    rows: [],
    conflicts: [
      {
        fieldPath: 'minerals.calcium',
        candidates: [
          {
            sourceRecordId: 'src-raw',
            value: 10,
            unit: 'mg',
            sourceValue: 10,
            sourceUnit: 'mg'
          }
        ]
      },
      {
        fieldPath: 'minerals.zinc',
        candidates: [
          {
            sourceRecordId: 'src-raw',
            value: 2.1,
            unit: 'mg',
            sourceValue: 2.1,
            sourceUnit: 'mg'
          }
        ]
      }
    ],
    missingFields: []
  },
  checks: {
    blocking: [],
    exceptionable: [],
    warnings: [{ code: 'MACRO_SUM', message: '宏量之和偏低' }]
  }
}

const SOURCE_NAMES = new Map([
  ['src-raw', 'Chicken, liver, raw'],
  ['src-cooked', 'Chicken liver, cooked'],
  ['src-supplement', '鸡肝（补位）']
])

const TOTAL_FIELDS = PROFILE_FIELD_DEFINITIONS.length

describe('审核页 · 原料卡映射', () => {
  it('把草稿里的原料卡读成表单值：可食部由比例换成百分数', () => {
    const card = toIngredientCard(payload)

    expect(card).toMatchObject({
      name: '鸡肝',
      nameEn: 'Chicken liver',
      category: 'MEAT_ORGAN',
      baseUnit: 'G',
      unitDisplayLabel: '克',
      cfctClass: '禽肉类及制品',
      edibleYieldPercent: 95,
      manualFields: ['edibleYieldPercent']
    })
  })

  it('草稿还没有原料卡时用草稿名 / 起手卡兜底，并给出默认单位展示名', () => {
    const card = toIngredientCard({
      intake: {
        name: '牛肉',
        nameEn: 'Beef',
        aliases: [],
        confusables: [],
        category: 'MEAT_ORGAN',
        requiredStates: ['RAW'],
        suggestedStates: []
      }
    })

    expect(card).toMatchObject({
      name: '牛肉',
      nameEn: 'Beef',
      category: 'MEAT_ORGAN',
      baseUnit: 'G',
      unitDisplayLabel: '克',
      cfctClass: '',
      edibleYieldPercent: null,
      manualFields: []
    })
  })

  it('写回草稿时把百分数换成比例，空串落成 null，并保留人工改动标记', () => {
    const card = {
      ...toIngredientCard(payload),
      nameEn: '  ',
      cfctClass: '  ',
      edibleYieldPercent: 87.5
    }

    const draft = toIngredientDraft(card)

    expect(draft).toMatchObject({
      name: '鸡肝',
      nameEn: null,
      category: 'MEAT_ORGAN',
      type: 'FOOD',
      baseUnit: 'G',
      unitDisplayLabel: '克',
      cfctClass: null,
      edibleYieldRate: 0.875,
      manualFields: ['edibleYieldPercent']
    })
  })

  it('markIngredientFieldManual 只追加一次，不重复也不丢已有标记', () => {
    const card = toIngredientCard(payload)

    const once = markIngredientFieldManual(card, 'name')
    const twice = markIngredientFieldManual(once, 'name')

    expect(once.manualFields).toEqual(['edibleYieldPercent', 'name'])
    expect(twice.manualFields).toEqual(['edibleYieldPercent', 'name'])
    // 原对象不被修改
    expect(card.manualFields).toEqual(['edibleYieldPercent'])
  })
})

describe('审核页 · 营养档案映射', () => {
  it('按先生后熟分组，保留草稿里的真实下标', () => {
    const groups = toProfileRows(payload, SOURCE_NAMES)

    expect(groups).toHaveLength(2)
    expect(groups[0]).toMatchObject({
      preparationState: 'RAW',
      profileIndex: 1,
      stateLabel: '生',
      sourceRecordId: 'src-raw',
      sourceLabel: 'Chicken, liver, raw'
    })
    expect(groups[1]).toMatchObject({
      preparationState: 'COOKED',
      profileIndex: 0,
      stateLabel: '熟'
    })
  })

  it('每份档案都铺满字段目录，状态映射成 直接 / 补位 / 人工 / 待补', () => {
    const [raw] = toProfileRows(payload, SOURCE_NAMES)

    expect(raw?.rows).toHaveLength(TOTAL_FIELDS)

    const byPath = new Map(raw?.rows.map((row) => [row.fieldPath, row]))
    expect(byPath.get('macros.crudeProtein')).toMatchObject({
      value: 20.4,
      unit: 'g',
      status: 'DIRECT',
      statusLabel: '直接'
    })
    expect(byPath.get('macros.crudeFat')).toMatchObject({
      status: 'FILLED',
      statusLabel: '补位',
      sourceRecordId: 'src-supplement'
    })
    // 换算仍是来源直接给的，展示为「直接」，换算公式单独留在 row 上
    expect(byPath.get('minerals.iron')).toMatchObject({
      status: 'DIRECT',
      statusLabel: '直接',
      formula: '12000 µg → 12 mg'
    })
    expect(byPath.get('minerals.calcium')).toMatchObject({
      value: null,
      status: 'PENDING',
      statusLabel: '待补',
      sourceRecordId: null
    })
  })

  it('人工改过的值单独标「人工」，来源仍然保留', () => {
    const groups = toProfileRows(payload, SOURCE_NAMES)
    const cooked = groups[1]
    const protein = cooked?.rows.find(
      (row) => row.fieldPath === 'macros.crudeProtein'
    )

    expect(protein).toMatchObject({
      value: 24,
      status: 'MANUAL',
      statusLabel: '人工',
      sourceRecordId: 'src-cooked'
    })
  })

  it('待补计数按单元格算：两份档案里没有值的格子都算', () => {
    const groups = toProfileRows(payload, SOURCE_NAMES)

    // 生档案填了 3 项、熟档案填了 1 项，其余都是待补
    expect(countPendingRows(groups)).toBe(TOTAL_FIELDS * 2 - 4)
    expect(groups[0]?.pendingCount).toBe(TOTAL_FIELDS - 3)
    expect(groups[1]?.pendingCount).toBe(TOTAL_FIELDS - 1)
  })

  it('没有 profiles 时返回空数组，待补计数为 0（不假装目录全缺）', () => {
    const groups = toProfileRows({})

    expect(groups).toEqual([])
    expect(countPendingRows(groups)).toBe(0)
  })

  it('冲突数直接取缝合方案里未裁决的冲突', () => {
    expect(countPlanConflicts(payload)).toBe(2)
    expect(countPlanConflicts({})).toBe(0)
  })

  it('人在营养格里手工填了冲突字段后，不再继续算作冲突', () => {
    // 审核页直接改档案、不走 resolve 接口，mergePlan.conflicts 不会自动清空。
    const withCalcium = applyProfileCellEdit(
      payload.profiles ?? [],
      1,
      'minerals.calcium',
      10
    )

    expect(
      countPlanConflicts({ ...payload, profiles: withCalcium })
    ).toBe(1)
  })
})

describe('审核页 · 编辑营养格', () => {
  const profiles = [rawProfile, cookedProfile]

  it('改值：状态变 MANUAL、保留来源，并写入人工确认标记', () => {
    const next = applyProfileCellEdit(profiles, 0, 'macros.crudeProtein', 21.2)
    const edited = next[0]?.entries.find(
      (item) => item.fieldPath === 'macros.crudeProtein'
    )

    expect(edited).toMatchObject({
      finalValue: 21.2,
      unit: 'g',
      status: 'MANUAL',
      sourceRecordId: 'src-raw',
      confirmedBy: 'HUMAN_REVIEW'
    })
    expect(typeof edited?.confirmedAt).toBe('string')
    // 原数组不被就地修改
    expect(
      profiles[0]?.entries.find(
        (item) => item.fieldPath === 'macros.crudeProtein'
      )?.finalValue
    ).toBe(20.4)
  })

  it('清空已有值：保留证据行但 finalValue=null，页面显示待补', () => {
    const next = applyProfileCellEdit(profiles, 0, 'minerals.iron', null)
    const cleared = next[0]?.entries.find(
      (item) => item.fieldPath === 'minerals.iron'
    )

    expect(cleared).toMatchObject({
      finalValue: null,
      status: 'MANUAL',
      sourceRecordId: 'src-raw'
    })

    const [raw] = toProfileRows({ profiles: next }, SOURCE_NAMES)
    expect(
      raw?.rows.find((row) => row.fieldPath === 'minerals.iron')
    ).toMatchObject({ value: null, status: 'PENDING' })
  })

  it('给原本没有值的格子填数：新建 MANUAL 行，单位取目录单位', () => {
    const next = applyProfileCellEdit(profiles, 0, 'minerals.calcium', 10)
    const created = next[0]?.entries.find(
      (item) => item.fieldPath === 'minerals.calcium'
    )

    expect(created).toMatchObject({
      finalValue: 10,
      unit: 'mg',
      status: 'MANUAL',
      sourceRecordId: null,
      confirmedBy: 'HUMAN_REVIEW'
    })
  })

  it('清空本来就没有值的格子：不新建空证据行', () => {
    const next = applyProfileCellEdit(profiles, 0, 'minerals.zinc', null)

    expect(
      next[0]?.entries.some((item) => item.fieldPath === 'minerals.zinc')
    ).toBe(false)
    expect(next).toEqual(profiles)
  })

  it('下标越界时原样返回，不抛异常', () => {
    expect(applyProfileCellEdit(profiles, 9, 'macros.crudeProtein', 1)).toEqual(
      profiles
    )
  })
})

describe('审核页 · 顶部检查状态与提交入参', () => {
  it('检查状态：没跑过 → 未检查；无阻断 → 通过；有阻断 → 阻断', () => {
    expect(toCheckSummary(null)).toMatchObject({
      state: 'UNKNOWN',
      label: '未检查',
      blocking: []
    })
    expect(toCheckSummary(payload.checks)).toMatchObject({
      state: 'PASS',
      label: '通过',
      warnings: 1
    })

    const blocking = [{ code: 'REQUIRED_STATE_MISSING', message: '缺生档案' }]
    expect(
      toCheckSummary({
        blocking,
        exceptionable: [],
        warnings: []
      })
    ).toMatchObject({ state: 'BLOCK', label: '阻断', blocking })
  })

  it('提交入参：原料卡 + 原始顺序的档案 + 主档案下标（按缝合主来源）', () => {
    const input = toCommitInput(payload)

    expect(input).not.toBeNull()
    expect(input?.profiles.map((profile) => profile.preparationState)).toEqual([
      'COOKED',
      'RAW'
    ])
    expect(input?.primaryProfileIndex).toBe(1)
    expect(input?.ingredient).toMatchObject({
      name: '鸡肝',
      baseUnit: 'G',
      unitDisplayLabel: '克',
      cfctClass: '禽肉类及制品',
      edibleYieldRate: 0.95
    })
  })

  it('没有缝合方案时按类别默认主状态兜底', () => {
    const input = toCommitInput({
      intake: payload.intake,
      ingredient: payload.ingredient,
      profiles: [rawProfile, cookedProfile]
    })

    // 肉/内脏默认生档案
    expect(input?.primaryProfileIndex).toBe(0)
  })

  it('没有任何营养档案时不给提交入参', () => {
    expect(toCommitInput({ ingredient: payload.ingredient })).toBeNull()
  })

  it('用表单里的原料卡覆盖 payload：AI 还没写原料卡也能提交', () => {
    const input = toCommitInput(
      { profiles: [rawProfile] },
      {
        name: '鸡肝',
        type: 'FOOD',
        baseUnit: 'G',
        unitDisplayLabel: '克',
        cfctClass: null,
        edibleYieldRate: null,
        manualFields: ['name']
      }
    )

    expect(input?.ingredient).toMatchObject({
      name: '鸡肝',
      manualFields: ['name']
    })
    expect(input?.primaryProfileIndex).toBe(0)
  })
})
