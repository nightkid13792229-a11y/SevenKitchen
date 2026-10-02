import { describe, expect, it } from 'vitest'
import {
  HEALTH_VISIT_KIND_FIELD,
  buildHealthVisitPayload,
  buildHealthVisitSummary,
  createHealthVisitDraft,
  getHealthVisitFieldConfig,
  getHealthVisitValidationError,
  resolveMedicalStatusToggle,
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

describe('病例合并 · 字段对照表（2026-10-02 精简版）', () => {
  it('就诊：日期 / 症状 / 医生怎么说 / 处理与提醒 / 用药 / 其它想说的', () => {
    const config = getHealthVisitFieldConfig('medical')

    expect(config.dateKey).toBe('visitDate')
    expect(config.primaryKey).toBe('diagnosis')
    // 「诊断结果」对家长太专业 —— 他记得住的是"医生怎么说"
    expect(config.primaryLabel).toBe('医生怎么说')
    expect(config.complaintKey).toBe('chiefComplaint')
    // 2026-10-02 老板：文案就叫「症状」
    expect(config.complaintLabel).toBe('症状')
    expect(config.adviceKey).toBe('treatment')
    expect(config.adviceLabel).toBe('处理与提醒')
    expect(config.medicationKey).toBe('medications')
    // 「备注」改名「其它想说的」（老板：保留但改名）
    expect(config.notesKey).toBe('notes')
    expect(config.notesLabel).toBe('其它想说的')
  })

  it('体检：日期 / 体检类型 / 检查结论 / 医生建议 / 其它想说的', () => {
    const config = getHealthVisitFieldConfig('checkup')

    expect(config.dateKey).toBe('checkupDate')
    expect(config.primaryKey).toBe('findings')
    // 体检没有"诊断"：措辞上不能让家长以为体检也能下诊断
    expect(config.primaryLabel).toBe('检查结论')
    expect(config.adviceKey).toBe('recommendations')
    expect(config.adviceLabel).toBe('医生建议')
    // 2026-10-01（第五期）给体检表加了 notes 列，
    // 此前"就诊能写备注、体检不能"说不通
    expect(config.notesKey).toBe('notes')
    // 体检类型从「更多」里提出来（它同时是卡片标题，藏在折叠里会显示错）
    expect(config.checkupTypeKey).toBe('checkupType')
  })

  it('类型独有的字段用 null 表达：症状与用药只给就诊，体检类型只给体检', () => {
    const medical = getHealthVisitFieldConfig('medical')
    const checkup = getHealthVisitFieldConfig('checkup')

    expect(medical.complaintKey).toBe('chiefComplaint')
    expect(medical.medicationKey).toBe('medications')
    expect(medical.checkupTypeKey).toBeNull()
    expect(medical.followUpKey).toBe('followUpDate')

    expect(checkup.complaintKey).toBeNull()
    expect(checkup.medicationKey).toBeNull()
    expect(checkup.checkupTypeKey).toBe('checkupType')
    expect(checkup.followUpKey).toBeNull()
  })

  it('状态不再出现在字段对照表里（老板 2026-10-02：这个字段不要了）', () => {
    const config = getHealthVisitFieldConfig('medical') as Record<string, unknown>

    expect('showsStatus' in config).toBe(false)
    expect(Object.values(config)).not.toContain('status')
  })
})

describe('病例合并 · 校验', () => {
  it('必填只剩日期 +（症状 或 医生怎么说）至少一个', () => {
    expect(getHealthVisitValidationError('medical', {})).toBe('请选择就诊日期')
    expect(getHealthVisitValidationError('medical', { visitDate: '2026-05-01' }))
      .toBe('请至少填写「症状」或「医生怎么说」，或上传报告原件')
    // 只填症状（拿不到诊断）也能存
    expect(getHealthVisitValidationError('medical', { visitDate: '2026-05-01', chiefComplaint: '呕吐' })).toBeNull()
    // 只填诊断也能存
    expect(getHealthVisitValidationError('medical', { visitDate: '2026-05-01', diagnosis: '胃炎' })).toBeNull()
  })

  it('体检也放宽成两个内容字段填一个：检查结论 / 医生建议', () => {
    expect(getHealthVisitValidationError('checkup', { checkupDate: '2026-05-01' }))
      .toBe('请至少填写「检查结论」或「医生建议」，或上传报告原件')
    // 只写了几句医嘱也能存（有的报告只给建议）
    expect(getHealthVisitValidationError('checkup', {
      checkupDate: '2026-05-01',
      recommendations: '半年后复查',
    })).toBeNull()
    // 只写了结论当然也能存
    expect(getHealthVisitValidationError('checkup', {
      checkupDate: '2026-05-01',
      findings: '血常规未见异常',
    })).toBeNull()
  })

  it('用药、处理、其它想说的都不拦着保存（想记多少记多少）', () => {
    const record = { visitDate: '2026-05-01', diagnosis: '胃炎' }
    expect(getHealthVisitValidationError('medical', record)).toBeNull()
  })

  it('没写内容但传了原件（X 光片/超声）也能存 —— 日期 + 附件就是一条合法记录', () => {
    expect(getHealthVisitValidationError('checkup', {
      checkupDate: '2026-05-01',
      attachments: ['https://img.sevenkitchen.cloud/medical-reports/temp/x.jpg'],
    })).toBeNull()
    expect(getHealthVisitValidationError('medical', {
      visitDate: '2026-05-01',
      attachments: ['https://img.sevenkitchen.cloud/medical-reports/temp/y.jpg'],
    })).toBeNull()
    // 既没内容又没附件才算缺信息
    expect(getHealthVisitValidationError('checkup', { checkupDate: '2026-05-01' }))
      .toContain('或上传报告原件')
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

  it('摘要标题"有什么显示什么"：就诊优先症状、体检优先检查结论', () => {
    const medical = buildHealthVisitSummary('medical', {
      visitDate: '2026-05-01',
      chiefComplaint: '呕吐两次',
      diagnosis: '急性胃炎',
    })
    expect(medical.title).toBe('呕吐两次')
    expect(medical.detail).toContain('2026-05-01')

    // 只填了诊断（没填症状）时用诊断当标题，而不是「未填写症状」
    expect(buildHealthVisitSummary('medical', {
      visitDate: '2026-05-01',
      diagnosis: '急性胃炎',
    }).title).toBe('急性胃炎')

    // 体检：表单已经不问类型了，标题改成家长填的检查结论
    const checkup = buildHealthVisitSummary('checkup', {
      checkupDate: '2026-05-02',
      findings: '未见异常',
      checkupType: 'ROUTINE',
    })
    expect(checkup.title).toBe('未见异常')
    expect(checkup.detail).toContain('2026-05-02')

    // 没填结论时退回"识别出来的体检类型"（例如拍报告识别成老年健康检查）
    expect(buildHealthVisitSummary('checkup', {
      checkupDate: '2026-05-02',
      checkupType: 'SENIOR_WELLNESS',
    }).title).toBe('老年健康检查')
  })

  it('摘要里不再显示状态（状态已不在表单里问，家长也改不了）', () => {
    const medical = buildHealthVisitSummary('medical', {
      visitDate: '2026-05-01',
      chiefComplaint: '呕吐',
      status: 'PENDING_CONFIRMATION',
    })

    expect(medical.detail).not.toContain('待确认')
  })

  it('什么都没填的草稿标题给个中性占位，不写"未填写 XX"', () => {
    expect(buildHealthVisitSummary('medical', {}).title).toBe('新记录')
    expect(buildHealthVisitSummary('checkup', {}).title).toBe('体检记录')
  })

  it('「已经好了」一键切换：点了变已康复，再点回治疗中', () => {
    expect(resolveMedicalStatusToggle({ status: 'PENDING_CONFIRMATION' }).status).toBe('RECOVERED')
    expect(resolveMedicalStatusToggle({ status: 'TREATING' }).status).toBe('RECOVERED')
    expect(resolveMedicalStatusToggle({ status: 'RECOVERED' }).status).toBe('TREATING')
    expect(resolveMedicalStatusToggle(null).status).toBe('RECOVERED')
    // 两句话都要说清后果，不能只写个"已康复"
    expect(resolveMedicalStatusToggle({}).hint).toContain('AI 分析')
    expect(resolveMedicalStatusToggle({ status: 'RECOVERED' }).hint).toContain('不再算进')
  })

  it('日期取值跟着类型走', () => {
    expect(resolveHealthVisitDate({ [HEALTH_VISIT_KIND_FIELD]: 'medical', visitDate: '2026-05-01' })).toBe('2026-05-01')
    expect(resolveHealthVisitDate({ [HEALTH_VISIT_KIND_FIELD]: 'checkup', checkupDate: '2026-05-02' })).toBe('2026-05-02')
  })
})
