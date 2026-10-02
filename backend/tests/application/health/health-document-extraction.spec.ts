import {
  normalizeDocumentType,
  normalizeDraftDate,
  normalizeDrafts,
} from '../../../src/application/health/health-report-extraction.service';

/**
 * AI 录入扩展（2026-10-01，第六期）。
 *
 * 老板第 4 条：拍照自动识别覆盖到除过敏报告以外的体检报告和疫苗本
 *（第六期又加上病历，凑齐四类）。
 * 老板第 5 条：识别之后**不需要一条一条确认**，确认一次就自动录入表单。
 *
 * 这组测试锁的是"能不能安全地直接填表"：
 *   · 日期认不出来就留空，绝不能猜
 *   · 未知字段一律丢掉，不能把脏数据写进表单
 *   · 过敏那条路径的旧行为不能被改坏（线上已经在跑）
 */
describe('AI 录入扩展', () => {
  describe('文档类型', () => {
    it('只认四种，其余回落到过敏报告（保持旧行为）', () => {
      expect(normalizeDocumentType('CHECKUP_REPORT')).toBe('CHECKUP_REPORT')
      expect(normalizeDocumentType('vaccine_book')).toBe('VACCINE_BOOK')
      expect(normalizeDocumentType('MEDICAL_RECORD')).toBe('MEDICAL_RECORD')
      expect(normalizeDocumentType('ALLERGY_REPORT')).toBe('ALLERGY_REPORT')
      expect(normalizeDocumentType('随便传的')).toBe('ALLERGY_REPORT')
      expect(normalizeDocumentType(undefined)).toBe('ALLERGY_REPORT')
    })
  })

  describe('日期归一化（认不出来就留空，绝不猜）', () => {
    it('认 YYYY-MM-DD / YYYY/MM/DD / 中文年月日', () => {
      expect(normalizeDraftDate('2026-08-30')).toBe('2026-08-30')
      expect(normalizeDraftDate('2026/8/3')).toBe('2026-08-03')
      expect(normalizeDraftDate('2026年8月30日')).toBe('2026-08-30')
      expect(normalizeDraftDate('2026-08-30T00:00:00Z')).toBe('2026-08-30')
    })

    it('认不出来就留空 —— 宁可让顾客自己填，也不能编一个日期', () => {
      expect(normalizeDraftDate('看不清')).toBe('')
      expect(normalizeDraftDate('')).toBe('')
      expect(normalizeDraftDate(null)).toBe('')
      expect(normalizeDraftDate('2026-13-45')).toBe('')
      expect(normalizeDraftDate('1800-01-01')).toBe('')
    })
  })

  describe('疫苗本（一次读出多条）', () => {
    it('按表单字段产出多条草稿', () => {
      const drafts = normalizeDrafts('VACCINE_BOOK', {
        drafts: [
          { vaccineName: '犬四联', vaccinationDate: '2025-03-10', nextDueDate: '2026-03-10', notes: '' },
          { vaccineName: '狂犬', vaccinationDate: '2025/06/01', nextDueDate: '', notes: '左后腿' },
        ],
      })

      expect(drafts).toHaveLength(2)
      expect(drafts[0]).toMatchObject({
        vaccineName: '犬四联',
        vaccinationDate: '2025-03-10',
        nextDueDate: '2026-03-10',
      })
      expect(drafts[1].vaccinationDate).toBe('2025-06-01')
    })

    it('没有疫苗名的记录被丢掉（填进表单也没有意义）', () => {
      const drafts = normalizeDrafts('VACCINE_BOOK', {
        drafts: [{ vaccineName: '', vaccinationDate: '2025-03-10' }],
      })
      expect(drafts).toEqual([])
    })

    it('一次最多 20 条（防止把整本册子每页都当成记录）', () => {
      const drafts = normalizeDrafts('VACCINE_BOOK', {
        drafts: Array.from({ length: 50 }, (_, index) => ({
          vaccineName: `疫苗${index}`,
          vaccinationDate: '2025-03-10',
        })),
      })
      expect(drafts).toHaveLength(20)
    })
  })

  describe('体检报告（一条）', () => {
    it('产出可填表单的草稿，未知的检查类型留空', () => {
      const drafts = normalizeDrafts('CHECKUP_REPORT', {
        drafts: [
          {
            checkupDate: '2026-08-30',
            checkupType: 'ROUTINE',
            findings: '血常规与生化未见明显异常',
            recommendations: '半年后复查',
            veterinarian: '张医生',
            notes: '当天有点紧张',
          },
        ],
      })

      expect(drafts).toHaveLength(1)
      expect(drafts[0]).toMatchObject({
        checkupDate: '2026-08-30',
        checkupType: 'ROUTINE',
        findings: '血常规与生化未见明显异常',
        recommendations: '半年后复查',
      })
    })

    it('模型编出来的检查类型会被丢掉（只认白名单）', () => {
      const drafts = normalizeDrafts('CHECKUP_REPORT', {
        drafts: [{ checkupDate: '2026-08-30', checkupType: 'MADE_UP_TYPE', findings: 'x' }],
      })
      expect(drafts[0].checkupType).toBe('')
    })

    it('日期与结论都没有的草稿丢掉（兽医这类不在白名单里的字段一律不产出）', () => {
      const drafts = normalizeDrafts('CHECKUP_REPORT', {
        drafts: [{ veterinarian: '张医生', madeUpField: 'x' }],
      })
      expect(drafts).toEqual([])
    })

    it('只有医生建议的那一页留着（多页报告的尾页常见，2026-10-01 第九期）', () => {
      const drafts = normalizeDrafts('CHECKUP_REPORT', {
        drafts: [{ recommendations: '两周后复查血常规' }],
      })

      expect(drafts).toHaveLength(1)
      expect(drafts[0].recommendations).toBe('两周后复查血常规')
    })
  })

  describe('病历（一条）', () => {
    it('产出就诊草稿，用药只留药名', () => {
      const drafts = normalizeDrafts('MEDICAL_RECORD', {
        drafts: [
          {
            visitDate: '2026-09-12',
            chiefComplaint: '呕吐两次',
            diagnosis: '急性胃炎',
            treatment: '禁食 12 小时',
            medications: ['速诺', '胃复安'],
            veterinarian: '李医生',
            notes: '',
          },
        ],
      })

      expect(drafts).toHaveLength(1)
      expect(drafts[0].medications).toEqual(['速诺', '胃复安'])
      // 新记录默认「待确认」——系统不替兽医下判断
      expect(drafts[0].status).toBe('PENDING_CONFIRMATION')
    })

    it('什么都没读出来的病历草稿丢掉', () => {
      const drafts = normalizeDrafts('MEDICAL_RECORD', { drafts: [{ notes: '看不清' }] })
      expect(drafts).toEqual([])
    })

    it('只有处置与药单的那一页留着（第二页常见，2026-10-01 第九期）', () => {
      const drafts = normalizeDrafts('MEDICAL_RECORD', {
        drafts: [{ treatment: '清创缝合', medications: ['速诺'] }],
      })

      expect(drafts).toHaveLength(1)
      expect(drafts[0].treatment).toBe('清创缝合')
      expect(drafts[0].medications).toEqual(['速诺'])
    })
  })

  describe('过敏报告（线上已有的那条路，不能被改坏）', () => {
    it('用 drafts 的形状照常工作', () => {
      const drafts = normalizeDrafts('ALLERGY_REPORT', {
        drafts: [
          { allergen: '鸡肉', notes: '' },
          { allergen: '牛肉', notes: '弱阳性' },
        ],
      })

      expect(drafts.map((draft) => draft.allergen)).toEqual(['鸡肉', '牛肉'])
    })

    it('模型仍按旧形状只返回 allergies 时，兜底接住（不丢数据）', () => {
      const drafts = normalizeDrafts('ALLERGY_REPORT', {
        allergies: ['鸡肉', '牛肉'],
      })

      expect(drafts.map((draft) => draft.allergen)).toEqual(['鸡肉', '牛肉'])
    })

    it('两个都没有时返回空数组', () => {
      expect(normalizeDrafts('ALLERGY_REPORT', {})).toEqual([])
    })
  })

  describe('脏数据不会进表单', () => {
    it('未知字段一律丢弃（只保留白名单里的键）', () => {
      const drafts = normalizeDrafts('CHECKUP_REPORT', {
        drafts: [
          {
            checkupDate: '2026-08-30',
            findings: '未见异常',
            恶意字段: '不该出现',
            __proto__: 'x',
          },
        ],
      })

      expect(Object.keys(drafts[0]).sort()).toEqual(
        // 2026-10-02：表单删掉了「兽医」，识别也不再产出这一栏
        ['attachments', 'checkupDate', 'checkupType', 'findings', 'notes', 'recommendations'].sort(),
      )
    })

    it('超长文本会被截断', () => {
      const drafts = normalizeDrafts('CHECKUP_REPORT', {
        drafts: [{ checkupDate: '2026-08-30', findings: '很'.repeat(2000) }],
      })
      expect(drafts[0].findings.length).toBeLessThanOrEqual(500)
    })

    it('drafts 不是数组时返回空数组，不炸', () => {
      expect(normalizeDrafts('VACCINE_BOOK', { drafts: '不是数组' })).toEqual([])
      expect(normalizeDrafts('CHECKUP_REPORT', {})).toEqual([])
    })
  })
})
