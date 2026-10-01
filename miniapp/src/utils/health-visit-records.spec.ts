import { describe, expect, it } from 'vitest'
import {
  HEALTH_VISIT_KIND_FIELD,
  buildHealthVisitPayload,
  buildHealthVisitSummary,
  createHealthVisitDraft,
  getHealthVisitFieldConfig,
  getHealthVisitValidationError,
  mergeHealthVisitRecords,
  normalizeHealthVisitRecord,
  normalizeMedicationList,
  resolveHealthVisitDate,
  resolveHealthVisitKind,
} from './health-records'

/**
 * 「病例」合并板块（2026-10-01）。
 *
 * 病史与体检在界面上合并成一个列表、一张表单，但**底层仍然是两张表**：
 * 这里锁住的就是那层映射 —— 字段怎么对、校验怎么定、保存时发什么。
 */
describe('病例合并 · 列表', () => {
  const medical = (id: string, date: string) => ({ id, visitDate: date, diagnosis: `诊断${id}` })
  const checkup = (id: string, date: string) => ({ id, checkupDate: date, findings: `结论${id}` })

  it('两类记录合成一条列表，按日期从新到旧', () => {
    const merged = mergeHealthVisitRecords(
      [medical('m1', '2026-01-10')],
      [checkup('c1', '2026-03-05')],
    )

    expect(merged.map((record) => record.id)).toEqual(['c1', 'm1'])
  })

  it('同一天里就诊排在体检前面（先看病、后体检更符合直觉）', () => {
    const merged = mergeHealthVisitRecords(
      [medical('m1', '2026-05-01')],
      [checkup('c1', '2026-05-01')],
    )

    expect(merged.map((record) => record.id)).toEqual(['m1', 'c1'])
  })

  it('还没填日期的草稿排在最前面，免得新建的记录跑到列表底部', () => {
    const merged = mergeHealthVisitRecords(
      [medical('m1', '2026-01-10'), { __localId: 'draft', visitDate: '', diagnosis: '' }],
      [],
    )

    expect(merged[0].__localId).toBe('draft')
  })

  it('合并后每条记录都带着自己的归属标记', () => {
    const merged = mergeHealthVisitRecords([medical('m1', '2026-01-10')], [checkup('c1', '2026-01-11')])

    expect(merged.find((record) => record.id === 'm1')?.[HEALTH_VISIT_KIND_FIELD]).toBe('medical')
    expect(merged.find((record) => record.id === 'c1')?.[HEALTH_VISIT_KIND_FIELD]).toBe('checkup')
  })

  it('空输入不炸', () => {
    expect(mergeHealthVisitRecords(null, undefined)).toEqual([])
  })

  it('resolveHealthVisitKind 认不出时按就诊处理（新增记录默认就是就诊）', () => {
    expect(resolveHealthVisitKind({})).toBe('medical')
    expect(resolveHealthVisitKind(null)).toBe('medical')
    expect(resolveHealthVisitKind({ [HEALTH_VISIT_KIND_FIELD]: 'checkup' })).toBe('checkup')
  })
})

describe('病例合并 · 字段对照表', () => {
  it('就诊：诊断结果 / 就诊日期 / 处理方式，有备注', () => {
    const config = getHealthVisitFieldConfig('medical')

    expect(config.dateKey).toBe('visitDate')
    expect(config.primaryKey).toBe('diagnosis')
    expect(config.primaryLabel).toBe('诊断结果')
    expect(config.adviceKey).toBe('treatment')
    expect(config.notesKey).toBe('notes')
  })

  it('体检：检查结论 / 体检日期 / 医生建议 / 备注', () => {
    const config = getHealthVisitFieldConfig('checkup')

    expect(config.dateKey).toBe('checkupDate')
    expect(config.primaryKey).toBe('findings')
    // 体检没有"诊断"：措辞上不能让家长以为体检也能下诊断
    expect(config.primaryLabel).toBe('检查结论')
    expect(config.adviceKey).toBe('recommendations')
    // 2026-10-01（第五期）给体检表加了 notes 列，
    // 此前"就诊能写备注、体检不能"说不通
    expect(config.notesKey).toBe('notes')
  })

  it('次要字段按类型分开：症状与用药只给就诊，体检类型只给体检', () => {
    const medical = getHealthVisitFieldConfig('medical')
    const checkup = getHealthVisitFieldConfig('checkup')

    expect(medical.showsComplaint).toBe(true)
    expect(medical.showsMedications).toBe(true)
    expect(medical.showsCheckupType).toBe(false)

    expect(checkup.showsComplaint).toBe(false)
    expect(checkup.showsMedications).toBe(false)
    expect(checkup.showsCheckupType).toBe(true)
  })
})

describe('病例合并 · 校验', () => {
  it('只有「日期」和「诊断结果」是必填的内容字段', () => {
    expect(getHealthVisitValidationError('medical', {})).toBe('请选择就诊日期')
    expect(getHealthVisitValidationError('medical', { visitDate: '2026-05-01' })).toBe('请填写诊断结果')
    expect(getHealthVisitValidationError('medical', { visitDate: '2026-05-01', diagnosis: '胃炎' })).toBeNull()
  })

  it('体检的提示语用「检查结论」而不是「诊断结果」', () => {
    expect(getHealthVisitValidationError('checkup', { checkupDate: '2026-05-01' })).toBe('请填写检查结论')
  })

  it('症状、用药、状态都不拦着保存（老板第 3 条：病史只保留一个诊断结果）', () => {
    const record = { visitDate: '2026-05-01', diagnosis: '胃炎' }
    expect(getHealthVisitValidationError('medical', record)).toBeNull()
  })

  it('新建的就诊草稿带上「待确认」状态', () => {
    expect(createHealthVisitDraft('medical').status).toBe('PENDING_CONFIRMATION')
  })

  it('新建的体检草稿默认「常规体检」，收进更多也不会卡住保存', () => {
    expect(createHealthVisitDraft('checkup').checkupType).toBe('ROUTINE')
  })
})

describe('病例合并 · 保存载荷', () => {
  it('就诊：发到 medical-record 的字段', () => {
    const payload = buildHealthVisitPayload('medical', {
      visitDate: '2026-05-01',
      diagnosis: '急性胃炎',
      treatment: '禁食 12 小时',
      veterinarian: '张医生',
      chiefComplaint: '呕吐两次',
      medications: '速诺、胃复安',
      notes: '精神尚可',
      attachments: ['a.jpg'],
    })

    expect(payload).toMatchObject({
      visitDate: '2026-05-01',
      diagnosis: '急性胃炎',
      treatment: '禁食 12 小时',
      veterinarian: '张医生',
      chiefComplaint: '呕吐两次',
      medications: ['速诺', '胃复安'],
      notes: '精神尚可',
      attachments: ['a.jpg'],
    })
  })

  it('体检：发到 checkup 的字段名是 findings / recommendations', () => {
    const payload = buildHealthVisitPayload('checkup', {
      checkupDate: '2026-05-01',
      checkupType: 'SENIOR_WELLNESS',
      findings: '血常规未见异常',
      recommendations: '半年后复查',
      veterinarian: '李医生',
      attachments: ['b.jpg'],
    })

    expect(payload).toMatchObject({
      checkupDate: '2026-05-01',
      checkupType: 'SENIOR_WELLNESS',
      findings: '血常规未见异常',
      recommendations: '半年后复查',
      veterinarian: '李医生',
      attachments: ['b.jpg'],
    })
    // 第五期起体检表也有 notes 列，备注照常发
    expect(payload).toHaveProperty('notes')
  })

  it('只填了诊断结果时，chiefComplaint 送空串而不是 null（后端那一栏是必填字符串）', () => {
    const payload = buildHealthVisitPayload('medical', { visitDate: '2026-05-01', diagnosis: '胃炎' })
    expect(payload.chiefComplaint).toBe('')
  })

  it('体检缺类型时兜底成常规体检', () => {
    const payload = buildHealthVisitPayload('checkup', { checkupDate: '2026-05-01' })
    expect(payload.checkupType).toBe('ROUTINE')
  })

  it('非法状态回落到「待确认」，不会把脏值发给后端', () => {
    const payload = buildHealthVisitPayload('medical', {
      visitDate: '2026-05-01',
      diagnosis: '胃炎',
      status: '乱填的',
    })
    expect(payload.status).toBe('PENDING_CONFIRMATION')
  })
})

describe('病例合并 · 用药与摘要', () => {
  it('用药按顿号 / 逗号 / 换行拆成数组', () => {
    expect(normalizeMedicationList('速诺、胃复安')).toEqual(['速诺', '胃复安'])
    expect(normalizeMedicationList('速诺, 胃复安')).toEqual(['速诺', '胃复安'])
    expect(normalizeMedicationList('速诺\n胃复安')).toEqual(['速诺', '胃复安'])
    expect(normalizeMedicationList('')).toEqual([])
    expect(normalizeMedicationList(['速诺'])).toEqual(['速诺'])
  })

  it('接口返回的数组用药在表单里串成一行', () => {
    const record = normalizeHealthVisitRecord('medical', {
      id: 'm1',
      visitDate: '2026-05-01',
      diagnosis: '胃炎',
      medications: ['速诺', '胃复安'],
    })
    expect(record.medications).toBe('速诺、胃复安')
  })

  it('体检记录归一化时 findings 与 notes 各归各位', () => {
    const record = normalizeHealthVisitRecord('checkup', {
      id: 'c1',
      checkupDate: '2026-05-01',
      findings: '未见异常',
      notes: '医生让半年后复查',
    })
    expect(record.findings).toBe('未见异常')
    expect(record.notes).toBe('医生让半年后复查')
  })

  it('摘要标题用诊断结果 / 检查结论，明细带日期与类型特征', () => {
    const medical = buildHealthVisitSummary('medical', {
      visitDate: '2026-05-01',
      diagnosis: '急性胃炎',
      status: 'PENDING_CONFIRMATION',
    })
    expect(medical.title).toBe('急性胃炎')
    expect(medical.detail).toContain('2026-05-01')

    const checkup = buildHealthVisitSummary('checkup', {
      checkupDate: '2026-05-02',
      findings: '未见异常',
      checkupType: 'ROUTINE',
    })
    expect(checkup.title).toBe('未见异常')
    expect(checkup.detail).toContain('常规体检')
  })

  it('没填结论时标题给个明确的占位', () => {
    expect(buildHealthVisitSummary('medical', {}).title).toBe('未填写诊断结果')
    expect(buildHealthVisitSummary('checkup', {}).title).toBe('未填写检查结论')
  })

  it('日期取值跟着类型走', () => {
    expect(resolveHealthVisitDate({ [HEALTH_VISIT_KIND_FIELD]: 'medical', visitDate: '2026-05-01' })).toBe('2026-05-01')
    expect(resolveHealthVisitDate({ [HEALTH_VISIT_KIND_FIELD]: 'checkup', checkupDate: '2026-05-02' })).toBe('2026-05-02')
  })
})
