import { describe, expect, it } from 'vitest'
import {
  applyEditorProfileToDraft,
  buildEvidenceEntriesFromPlan,
  buildProfileFromPlan,
  mergeProfilesWithPlan,
  profileDraftToNutritionProfile
} from './profileLedger'
import { createEmptyIngredientNutritionFormValue } from '@/utils/ingredientNutrition'
import type {
  MergePlan,
  NutritionEvidenceEntry,
  ProfileDraft
} from '@/types/ingredientCreation'

/**
 * ③ 档案成型的数据搬运：
 * 缝合方案 → 证据账本 → 档案 → 编辑器 → 人改 → 写回账本。
 * 这里每一跳都可能把来源 / 单位 / 人工状态弄丢，所以逐跳钉住。
 */
describe('原料创建向导 · 缝合方案转证据账本', () => {
  const plan: MergePlan = {
    primarySourceRecordId: 'source-main',
    rows: [
      {
        fieldPath: 'macros.moisture',
        value: 70,
        unit: 'g',
        status: 'DIRECT',
        sourceRecordId: 'source-main',
        sourceValue: 70,
        sourceUnit: 'g'
      },
      {
        fieldPath: 'macros.crudeProtein',
        value: 20,
        unit: 'g',
        status: 'FILLED',
        sourceRecordId: 'source-supplement',
        sourceValue: 20,
        sourceUnit: 'g'
      },
      {
        fieldPath: 'minerals.iron',
        value: 550,
        unit: 'µg',
        status: 'DIRECT',
        sourceRecordId: 'source-main',
        sourceValue: 0.55,
        sourceUnit: 'mg'
      },
      {
        fieldPath: 'minerals.zinc',
        value: 12,
        unit: 'mg',
        status: 'MANUAL',
        sourceRecordId: 'source-supplement',
        sourceValue: 12,
        sourceUnit: 'mg'
      },
      {
        fieldPath: 'minerals.calcium',
        value: null,
        unit: 'mg',
        status: 'CONFLICT',
        sourceRecordId: null,
        sourceValue: null,
        sourceUnit: null
      }
    ],
    conflicts: [
      {
        fieldPath: 'minerals.calcium',
        candidates: [
          {
            sourceRecordId: 'source-main',
            value: 100,
            unit: 'mg',
            sourceValue: 100,
            sourceUnit: 'mg'
          }
        ]
      }
    ],
    missingFields: ['vitamins.vitaminA']
  }

  it('直接采用 / 补位 / 人工裁决各自保留状态', () => {
    const entries = buildEvidenceEntriesFromPlan(plan)
    const byPath = new Map(entries.map((entry) => [entry.fieldPath, entry]))

    expect(byPath.get('macros.moisture')?.status).toBe('DIRECT')
    expect(byPath.get('macros.crudeProtein')?.status).toBe('FILLED')
    expect(byPath.get('minerals.zinc')?.status).toBe('MANUAL')
  })

  it('原文单位与目录单位不同时记 CONVERTED 并写换算公式', () => {
    const entry = buildEvidenceEntriesFromPlan(plan).find(
      (item) => item.fieldPath === 'minerals.iron'
    )

    expect(entry?.status).toBe('CONVERTED')
    expect(entry?.sourceValue).toBe(0.55)
    expect(entry?.sourceUnit).toBe('mg')
    expect(entry?.finalValue).toBe(550)
    expect(entry?.unit).toBe('µg')
    expect(entry?.formula).toBe('0.55 mg → 550 µg')
  })

  it('冲突行与缺失字段不产出证据行，也不写 0', () => {
    const entries = buildEvidenceEntriesFromPlan(plan)

    expect(entries.some((entry) => entry.fieldPath === 'minerals.calcium')).toBe(
      false
    )
    expect(entries.some((entry) => entry.fieldPath === 'vitamins.vitaminA')).toBe(
      false
    )
    // 缺失字段绝不能补成 0：0 会改变配方计算，缺失不会。
    expect(entries.some((entry) => entry.finalValue === 0)).toBe(false)
  })
})

describe('原料创建向导 · 缝合方案转档案', () => {
  const plan: MergePlan = {
    primarySourceRecordId: 'source-main',
    rows: [
      {
        fieldPath: 'macros.moisture',
        value: 70,
        unit: 'g',
        status: 'DIRECT',
        sourceRecordId: 'source-main',
        sourceValue: 70,
        sourceUnit: 'g'
      },
      {
        fieldPath: 'macros.crudeProtein',
        value: 20,
        unit: 'g',
        status: 'DIRECT',
        sourceRecordId: 'source-main',
        sourceValue: 20,
        sourceUnit: 'g'
      }
    ],
    conflicts: [],
    missingFields: ['macros.crudeFat']
  }

  it('按指定生熟状态生成一份档案，缺失字段不补 0', () => {
    const profile = buildProfileFromPlan({
      plan,
      preparationState: 'RAW',
      notes: '来自缝合方案'
    })

    expect(profile.preparationState).toBe('RAW')
    expect(profile.sourceRecordId).toBe('source-main')
    expect(profile.notes).toBe('来自缝合方案')
    expect(profile.entries.map((entry) => entry.fieldPath)).toEqual([
      'macros.moisture',
      'macros.crudeProtein'
    ])
    expect(
      profile.entries.some((entry) => entry.fieldPath === 'macros.crudeFat')
    ).toBe(false)
  })

  it('重建时保留人工改过的行（MANUAL），自动行按最新方案刷新', () => {
    const previous: NutritionEvidenceEntry[] = [
      {
        fieldPath: 'macros.moisture',
        finalValue: 72,
        unit: 'g',
        status: 'MANUAL',
        sourceRecordId: 'source-main',
        sourceValue: 70,
        sourceUnit: 'g',
        formula: null,
        confirmedBy: 'admin',
        confirmedAt: '2026-10-22T10:00:00.000Z'
      },
      {
        fieldPath: 'macros.crudeProtein',
        finalValue: 19,
        unit: 'g',
        status: 'DIRECT',
        sourceRecordId: 'source-main',
        sourceValue: 19,
        sourceUnit: 'g',
        formula: null,
        confirmedBy: null,
        confirmedAt: null
      }
    ]

    const profile = buildProfileFromPlan({
      plan,
      preparationState: 'RAW',
      existingEntries: previous
    })
    const byPath = new Map(profile.entries.map((entry) => [entry.fieldPath, entry]))

    expect(byPath.get('macros.moisture')?.finalValue).toBe(72)
    expect(byPath.get('macros.moisture')?.status).toBe('MANUAL')
    expect(byPath.get('macros.crudeProtein')?.finalValue).toBe(20)
    expect(byPath.get('macros.crudeProtein')?.status).toBe('DIRECT')
  })

  it('两份档案时按生熟排序；来源变了的那份按新方案重建', () => {
    const stored: ProfileDraft[] = [
      {
        preparationState: 'COOKED',
        sourceRecordId: 'source-cooked',
        entries: [
          {
            fieldPath: 'macros.moisture',
            finalValue: 60,
            unit: 'g',
            status: 'DIRECT',
            sourceRecordId: 'source-cooked',
            sourceValue: 60,
            sourceUnit: 'g',
            formula: null,
            confirmedBy: null,
            confirmedAt: null
          }
        ],
        notes: null
      }
    ]

    const result = mergeProfilesWithPlan({
      storedProfiles: stored,
      plan,
      planState: 'RAW'
    })

    expect(result.profiles.map((profile) => profile.preparationState)).toEqual([
      'RAW',
      'COOKED'
    ])
    expect(result.replacedState).toBeNull()

    const replaced = mergeProfilesWithPlan({
      storedProfiles: [
        {
          ...stored[0]!,
          preparationState: 'RAW',
          sourceRecordId: 'source-old'
        }
      ],
      plan,
      planState: 'RAW'
    })

    expect(replaced.profiles).toHaveLength(1)
    expect(replaced.replacedState).toBe('RAW')
    expect(replaced.profiles[0]?.sourceRecordId).toBe('source-main')
  })
})

describe('原料创建向导 · 编辑器改值写回证据', () => {
  function baseProfile(): ProfileDraft {
    return {
      preparationState: 'RAW',
      sourceRecordId: 'source-main',
      notes: null,
      entries: [
        {
          fieldPath: 'macros.crudeProtein',
          finalValue: 20,
          unit: 'g',
          status: 'DIRECT',
          sourceRecordId: 'source-main',
          sourceValue: 20,
          sourceUnit: 'g',
          formula: null,
          confirmedBy: null,
          confirmedAt: null
        },
        {
          fieldPath: 'minerals.iron',
          finalValue: 2,
          unit: 'mg',
          status: 'FILLED',
          sourceRecordId: 'source-supplement',
          sourceValue: 2,
          sourceUnit: 'mg',
          formula: null,
          confirmedBy: null,
          confirmedAt: null
        }
      ]
    }
  }

  it('人改过的值状态记 MANUAL，并记录确认人和时间，原始来源不丢', () => {
    const editor = profileDraftToNutritionProfile(baseProfile())
    editor.macros.crudeProtein = 22

    const updated = applyEditorProfileToDraft(
      baseProfile(),
      editor,
      'admin',
      '2026-10-22T12:00:00.000Z'
    )
    const protein = updated.entries.find(
      (entry) => entry.fieldPath === 'macros.crudeProtein'
    )

    expect(protein?.finalValue).toBe(22)
    expect(protein?.status).toBe('MANUAL')
    expect(protein?.confirmedBy).toBe('admin')
    expect(protein?.confirmedAt).toBe('2026-10-22T12:00:00.000Z')
    expect(protein?.sourceRecordId).toBe('source-main')
    expect(protein?.sourceValue).toBe(20)
  })

  it('只改一个字段不会把其它字段误标成人工', () => {
    const editor = profileDraftToNutritionProfile(baseProfile())
    editor.macros.crudeProtein = 22

    const updated = applyEditorProfileToDraft(baseProfile(), editor, 'admin')
    const iron = updated.entries.find(
      (entry) => entry.fieldPath === 'minerals.iron'
    )

    expect(iron?.status).toBe('FILLED')
    expect(iron?.finalValue).toBe(2)
  })

  it('人工补上缺失字段也进账本；清空字段则落一条 MANUAL 的 null', () => {
    const editor = profileDraftToNutritionProfile(baseProfile())
    editor.macros.moisture = 70
    editor.macros.crudeProtein = null

    const updated = applyEditorProfileToDraft(baseProfile(), editor, 'admin')

    const moisture = updated.entries.find(
      (entry) => entry.fieldPath === 'macros.moisture'
    )
    const protein = updated.entries.find(
      (entry) => entry.fieldPath === 'macros.crudeProtein'
    )

    expect(moisture?.status).toBe('MANUAL')
    expect(moisture?.finalValue).toBe(70)
    expect(moisture?.sourceRecordId).toBeNull()
    expect(protein?.status).toBe('MANUAL')
    expect(protein?.finalValue).toBeNull()
  })

  it('自定义营养项写入证据，重建档案时还能回到编辑器', () => {
    const editor = profileDraftToNutritionProfile(baseProfile())
    editor.customItems.push({
      name: '牛磺酸',
      value: 0.12,
      unit: 'g',
      rawBasisType: 'PER_100_G'
    })

    const updated = applyEditorProfileToDraft(baseProfile(), editor, 'admin')
    const custom = updated.entries.find((entry) => entry.fieldPath === '牛磺酸')

    expect(custom?.finalValue).toBe(0.12)
    expect(custom?.unit).toBe('g')
    expect(custom?.status).toBe('MANUAL')

    const roundTrip = profileDraftToNutritionProfile(updated)
    expect(roundTrip.customItems.map((item) => item.name)).toContain('牛磺酸')
  })
})
