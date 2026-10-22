import { describe, expect, it } from 'vitest'
import type {
  IngredientCreationAuditChanges,
  IngredientCreationAuditFieldChange
} from '@/types/ingredientCreation'
import {
  EMPTY_CHANGES_TEXT,
  EMPTY_PROPOSAL_TEXT,
  buildAuditChangeRows,
  buildAuditExceptionRows,
  buildProposalSection
} from './creationAuditPresentation'

function change(
  overrides: Partial<IngredientCreationAuditFieldChange> = {}
): IngredientCreationAuditFieldChange {
  return {
    profileIndex: 0,
    preparationState: 'RAW',
    sourceRecordId: 'src-1',
    fieldPath: 'macros.crudeProtein',
    change: 'VALUE_CHANGED',
    aiValue: 20,
    aiUnit: 'g',
    aiSourceRecordId: 'src-1',
    aiCandidates: null,
    finalValue: 22,
    finalUnit: 'g',
    finalStatus: 'MANUAL',
    finalSourceRecordId: 'src-1',
    finalConfirmedBy: 'admin-1',
    ...overrides
  }
}

function changes(
  fields: IngredientCreationAuditFieldChange[] = [],
  exceptions: IngredientCreationAuditChanges['exceptions'] = []
): IngredientCreationAuditChanges {
  return { fields, exceptions }
}

describe('creationAuditPresentation', () => {
  it('没有提案快照时给出明确文案，不留空白', () => {
    const section = buildProposalSection([])

    expect(section.isEmpty).toBe(true)
    expect(section.snapshots).toEqual([])
    expect(section.emptyText).toBe(EMPTY_PROPOSAL_TEXT)
    expect(section.emptyText).toBe('这次创建没有留下提案快照')
  })

  it('proposals 不是数组或全是脏数据时也按空处理', () => {
    expect(buildProposalSection(undefined).isEmpty).toBe(true)
    expect(buildProposalSection('not-json').isEmpty).toBe(true)
    expect(buildProposalSection([{ foo: 'bar' }]).isEmpty).toBe(true)
  })

  it('MERGE 提案按字段列出 AI 当时的来源与值', () => {
    const section = buildProposalSection([
      {
        kind: 'MERGE',
        createdAt: '2026-10-22T03:00:00.000Z',
        primarySourceRecordId: 'src-primary',
        rows: [
          {
            fieldPath: 'macros.crudeProtein',
            value: 20,
            unit: 'g',
            status: 'DIRECT',
            sourceRecordId: 'src-primary',
            sourceValue: 20,
            sourceUnit: 'g'
          },
          {
            fieldPath: 'macros.crudeFat',
            value: 4.5,
            unit: 'g',
            status: 'FILLED',
            sourceRecordId: 'src-supplement',
            sourceValue: 4.5,
            sourceUnit: 'g'
          }
        ],
        conflicts: [],
        missingFields: ['minerals.calcium']
      }
    ])

    expect(section.isEmpty).toBe(false)
    expect(section.snapshots[0]).toMatchObject({
      kindLabel: '缝合方案',
      createdAt: '2026-10-22T03:00:00.000Z'
    })
    expect(section.snapshots[0]?.fieldRows).toEqual([
      {
        fieldPath: 'macros.crudeProtein',
        fieldLabel: '粗蛋白',
        valueText: '20 g',
        statusLabel: '直接采用',
        sourceText: 'src-primary'
      },
      {
        fieldPath: 'macros.crudeFat',
        fieldLabel: '粗脂肪',
        valueText: '4.5 g',
        statusLabel: '补缺',
        sourceText: 'src-supplement'
      }
    ])
    expect(section.snapshots[0]?.summaryLines).toContain(
      '主来源：src-primary'
    )
    expect(section.snapshots[0]?.summaryLines).toContain('缺失字段：1 项')
  })

  it('MERGE 冲突字段把 AI 当时的多来源候选摊开', () => {
    const section = buildProposalSection([
      {
        kind: 'MERGE',
        createdAt: '2026-10-22T03:00:00.000Z',
        primarySourceRecordId: 'src-primary',
        rows: [],
        conflicts: [
          {
            fieldPath: 'macros.crudeProtein',
            candidates: [
              { sourceRecordId: 'src-a', value: 20, unit: 'g', sourceValue: null, sourceUnit: null },
              { sourceRecordId: 'src-b', value: 22, unit: 'g', sourceValue: null, sourceUnit: null }
            ]
          }
        ],
        missingFields: []
      }
    ])

    expect(section.snapshots[0]?.fieldRows[0]).toMatchObject({
      fieldPath: 'macros.crudeProtein',
      valueText: '20 g / 22 g',
      statusLabel: '多来源冲突',
      sourceText: 'src-a / src-b'
    })
  })

  it('人工改动格式化成「AI 值 → 最终值、类型、操作人」', () => {
    const rows = buildAuditChangeRows(changes([change()]))

    expect(rows).toEqual([
      {
        key: 'RAW:macros.crudeProtein:0',
        profileLabel: '生档案',
        fieldPath: 'macros.crudeProtein',
        fieldLabel: '粗蛋白',
        aiValueText: '20 g',
        finalValueText: '22 g',
        statusLabel: '人改值',
        changedBy: 'admin-1'
      }
    ])
  })

  it('冲突裁决行的 AI 值显示人当时可选的多个候选', () => {
    const rows = buildAuditChangeRows(
      changes([
        change({
          change: 'CONFLICT_RESOLVED',
          aiValue: null,
          aiUnit: null,
          finalConfirmedBy: null,
          aiCandidates: [
            { sourceRecordId: 'src-a', value: 20, unit: 'g', sourceValue: null, sourceUnit: null },
            { sourceRecordId: 'src-b', value: 22, unit: 'g', sourceValue: null, sourceUnit: null }
          ]
        })
      ])
    )

    expect(rows[0]).toMatchObject({
      aiValueText: '20 g / 22 g',
      finalValueText: '22 g',
      statusLabel: '冲突已裁决',
      changedBy: '未记录'
    })
  })

  it('人工新增与移除字段的 AI 值用占位符，不显示 undefined', () => {
    const rows = buildAuditChangeRows(
      changes([
        change({
          fieldPath: 'minerals.calcium',
          change: 'MANUALLY_ADDED',
          aiValue: null,
          aiUnit: null,
          finalValue: 120,
          finalUnit: 'mg',
          finalConfirmedBy: 'admin-2'
        }),
        change({
          fieldPath: 'macros.ash',
          change: 'REMOVED_FROM_FINAL',
          aiValue: 3,
          aiUnit: 'g',
          finalValue: null,
          finalUnit: null,
          finalConfirmedBy: null
        })
      ])
    )

    expect(rows[0]).toMatchObject({
      fieldLabel: '钙',
      aiValueText: '—',
      finalValueText: '120 mg',
      statusLabel: '人工新增',
      changedBy: 'admin-2'
    })
    expect(rows[1]).toMatchObject({
      fieldLabel: '灰分',
      aiValueText: '3 g',
      finalValueText: '—',
      statusLabel: '从最终值移除',
      changedBy: '未记录'
    })
  })

  it('改动为空时返回空列表，交给组件显示空状态文案', () => {
    expect(buildAuditChangeRows(changes())).toEqual([])
    expect(buildAuditChangeRows(null).length).toBe(0)
    expect(EMPTY_CHANGES_TEXT).toBe('这次创建没有留下人工改动记录')
  })

  it('例外记录转成可展示行，保留理由与操作人', () => {
    const rows = buildAuditExceptionRows(
      changes([], [
        {
          code: 'MACRO_SUM_OVER_100',
          reason: '来源标注的是湿重',
          approvedBy: 'admin-1',
          approvedAt: '2026-10-22T04:00:00.000Z'
        }
      ])
    )

    expect(rows).toEqual([
      {
        key: 'MACRO_SUM_OVER_100:2026-10-22T04:00:00.000Z',
        code: 'MACRO_SUM_OVER_100',
        reason: '来源标注的是湿重',
        approvedBy: 'admin-1',
        approvedAt: '2026/10/22 12:00:00'
      }
    ])
  })
})
