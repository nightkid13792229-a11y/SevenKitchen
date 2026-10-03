import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildHealthVisitSummary,
  HEALTH_VISIT_KIND_FIELD,
  normalizeHealthRecordListResponse,
  resolveHealthVisitKind,
} from './health-records'

/**
 * 服务器读回来的记录必须带上"我是哪张表的"（2026-10-03 老板实测发现）。
 *
 * 老板截图：体检标签里躺着一条**就诊记录**格式的卡片 ——
 * 标题「就诊记录」、字段是"症状 / 医生诊断 / 医嘱"、日期显示「未填日期」，
 * 而里面装的其实是刚存好的体检数据（7 个附件 + 109 项化验数据）。
 *
 * 根因：就诊与体检在界面上共用一个列表，一条记录按哪种格式渲染全靠
 * `__visitKind` 这个章；草稿有章、**服务器记录没有章** → 一律退化成"就诊"。
 * 日期也跟着错位：就诊读 visitDate，而体检存的是 checkupDate。
 */
describe('服务器记录 · 归属章', () => {
  const checkupFromServer = {
    id: 'c1',
    checkupDate: '2026-07-15',
    findings: '',
    labValues: '生化\nGLU 7.8 mmol/L（偏高）',
    attachments: ['a.jpg'],
  }

  it('体检列表读回来盖"体检"章', () => {
    const [record] = normalizeHealthRecordListResponse(
      { data: { records: [checkupFromServer] } },
      'checkup',
    )

    expect(record[HEALTH_VISIT_KIND_FIELD]).toBe('checkup')
    expect(resolveHealthVisitKind(record)).toBe('checkup')
  })

  it('就诊列表读回来盖"就诊"章', () => {
    const [record] = normalizeHealthRecordListResponse(
      { data: { records: [{ id: 'm1', visitDate: '2026-02-11', diagnosis: '胆汁淤积' }] } },
      'medical',
    )

    expect(record[HEALTH_VISIT_KIND_FIELD]).toBe('medical')
    expect(resolveHealthVisitKind(record)).toBe('medical')
  })

  it('过敏列表不掺和这个章（它不走就诊/体检合并）', () => {
    const [record] = normalizeHealthRecordListResponse(
      { data: { records: [{ id: 'a1', allergen: '鸡肉' }] } },
      'allergy',
    )

    expect(record[HEALTH_VISIT_KIND_FIELD]).toBeUndefined()
  })

  it('盖了章的体检记录，卡片标题是「体检记录」而不是「就诊记录」', () => {
    const [record] = normalizeHealthRecordListResponse(
      { data: { records: [checkupFromServer] } },
      'checkup',
    )

    const summary = buildHealthVisitSummary(resolveHealthVisitKind(record), record)
    expect(summary.title).toBe('体检记录')
    expect(summary.detail).toContain('含化验数据')
  })

  it('不盖章就会退化成就诊（这条守着"为什么要盖章"）', () => {
    const [record] = normalizeHealthRecordListResponse(
      { data: { records: [checkupFromServer] } },
    )

    expect(resolveHealthVisitKind(record)).toBe('medical')
    expect(buildHealthVisitSummary(resolveHealthVisitKind(record), record).title)
      .toBe('就诊记录')
  })

  it('页面加载记录时把"这张表"传下去', () => {
    const page = readFileSync(
      resolve(process.cwd(), 'src/pages/dog-profile-health/index.vue'),
      'utf-8',
    )

    expect(page).toContain('normalizeHealthRecordListResponse(res, type)')
  })
})

/**
 * 老记录里重复的化验块（2026-10-03 老板同一张截图里的第二个问题）。
 *
 * 同一份「生化」在化验数据里列了三遍 —— 那是去重上线**之前**存下的记录
 * （同一张报告拍了两张照片）。新记录合并时就去重，老记录在展示这一步兜底。
 */
describe('化验数据 · 展示时兜底去重', () => {
  it('展示层对原文去重（不动数据库里的原文）', () => {
    const view = readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/LabValuesView.vue'),
      'utf-8',
    )

    expect(view).toContain('dedupeLabValues(String(props.text || \'\'))')
    expect(view).toContain("from '../../utils/health-records'")
  })
})
