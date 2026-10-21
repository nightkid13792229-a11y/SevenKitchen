import { describe, expect, it } from 'vitest'
import {
  ALLERGY_SOURCE_LABELS,
  DIETITIAN_PROTEIN_FALLBACK,
  buildAllergyFacts,
  buildLatestHealthFacts,
  formatAllergySources,
  formatInsightDate,
  formatRequestedProteins,
  type LatestCheckupRecordLike,
  type LatestMedicalRecordLike,
} from '../dogInsight'

describe('主蛋白文案（fact-only）', () => {
  it('六个 code 都映射成中文', () => {
    expect(
      formatRequestedProteins([
        'CHICKEN',
        'DUCK',
        'PORK',
        'BEEF',
        'TURKEY',
        'RABBIT',
      ])
    ).toBe('鸡、鸭、猪、牛、火鸡、兔')
  })

  it('没有指定主蛋白时显示「营养师搭配」', () => {
    expect(formatRequestedProteins([])).toBe(DIETITIAN_PROTEIN_FALLBACK)
    expect(formatRequestedProteins(undefined)).toBe(DIETITIAN_PROTEIN_FALLBACK)
    expect(formatRequestedProteins(null)).toBe(DIETITIAN_PROTEIN_FALLBACK)
  })

  it('去重、忽略大小写与空白，并保留后端顺序', () => {
    expect(
      formatRequestedProteins([' chicken ', 'CHICKEN', 'BEEF', '', null])
    ).toBe('鸡、牛')
  })

  it('未知 code 原样显示，不吞掉也不猜', () => {
    expect(formatRequestedProteins(['FISH'])).toBe('FISH')
    expect(formatRequestedProteins(['fish'])).toBe('fish')
  })
})

describe('过敏信息合并（fact-only）', () => {
  it('档案明细与旧列表合并去重，本单重复项合并来源', () => {
    const facts = buildAllergyFacts({
      allergyDetail: [
        { allergen: '鸡肉', certainty: 'CONFIRMED', source: 'OWNER' },
        { allergen: ' 牛肉 ', certainty: 'SUSPECTED', source: 'OWNER' },
        { allergen: '鸡肉', certainty: 'RULED_OUT', source: 'STAFF' },
      ],
      structuredAllergies: ['牛肉', '鱼肉'],
      allergyFoods: ' 鸡胸肉、鸡蛋 ',
      orderAllergies: ['鸡肉', '鸭肉', '鸭肉'],
      orderAllergyText: ' 三文鱼 ',
    })

    expect(facts.allergens).toEqual([
      { text: '鸡肉', sources: ['PROFILE', 'ORDER'] },
      { text: '牛肉', sources: ['PROFILE'] },
      { text: '鱼肉', sources: ['PROFILE'] },
      { text: '鸭肉', sources: ['ORDER'] },
    ])
    expect('profileText' in facts).toBe(false)
    expect(facts.orderText).toBe('三文鱼')
    expect(facts.hasAny).toBe(true)
  })

  it('不输出 certainty / 分档字段，也不按可信度分组', () => {
    const facts = buildAllergyFacts({
      allergyDetail: [
        { allergen: '鸡肉', certainty: 'CONFIRMED', source: 'OWNER' },
        { allergen: '牛肉', certainty: 'SUSPECTED', source: 'OWNER' },
      ],
    })

    expect(Object.keys(facts).sort()).toEqual([
      'allergens',
      'hasAny',
      'orderText',
    ])
    const serialized = JSON.stringify(facts)
    expect(serialized).not.toContain('certainty')
    expect(serialized).not.toContain('CONFIRMED')
    expect(serialized).not.toContain('SUSPECTED')
    expect(serialized).not.toContain('confirmed')
    expect(serialized).not.toContain('suspected')
  })

  it('完全没有过敏时 hasAny 为 false', () => {
    const facts = buildAllergyFacts({})
    expect(facts.allergens).toEqual([])
    expect(facts.orderText).toBe('')
    expect(facts.hasAny).toBe(false)
  })

  it('来源文案只有「档案 / 本单填写」两种', () => {
    expect(ALLERGY_SOURCE_LABELS).toEqual({
      PROFILE: '档案',
      ORDER: '本单填写',
    })
    expect(formatAllergySources(['PROFILE', 'ORDER'])).toBe('档案 · 本单填写')
  })
})

describe('最近一次就诊 / 体检（fact-only）', () => {
  it('只取日期 + 诊断 / 结论，不泄漏其它健康字段', () => {
    const medical: LatestMedicalRecordLike & {
      labValues: Record<string, unknown>
      vitals: Record<string, unknown>
    } = {
      visitDate: '2026-10-20T00:00:00.000Z',
      diagnosis: '急性肠胃炎',
      status: 'RECOVERED',
      chiefComplaint: '呕吐两天',
      exams: '血常规',
      labValues: { WBC: 22.1 },
      vitals: { temperature: 39.4 },
    }
    const checkup: LatestCheckupRecordLike & {
      labValues: Record<string, unknown>
    } = {
      checkupDate: '2026-09-30',
      checkupType: 'FULL',
      findings: '未见明显异常',
      labValues: { ALT: 45 },
    }

    const facts = buildLatestHealthFacts({
      latestMedicalRecord: medical,
      latestCheckupRecord: checkup,
    })

    expect(facts.medical).toEqual({
      date: '2026-10-20',
      diagnosis: '急性肠胃炎',
      attachments: [],
    })
    expect(facts.checkup).toEqual({
      date: '2026-09-30',
      findings: '未见明显异常',
      attachments: [],
    })
    expect(facts.hasAny).toBe(true)

    const serialized = JSON.stringify(facts)
    for (const forbidden of [
      'labValues',
      'vitals',
      'chiefComplaint',
      'exams',
      'checkupType',
      'RECOVERED',
    ]) {
      expect(serialized).not.toContain(forbidden)
    }
  })

  it('没有记录时两项都是 null', () => {
    const facts = buildLatestHealthFacts({})
    expect(facts.medical).toBeNull()
    expect(facts.checkup).toBeNull()
    expect(facts.hasAny).toBe(false)
  })

  it('结论为空时如实写未记录，日期无法解析时不猜日期', () => {
    const facts = buildLatestHealthFacts({
      latestMedicalRecord: { visitDate: 'not-a-date', diagnosis: '' },
      latestCheckupRecord: { checkupDate: '', findings: '  ' },
    })
    expect(facts.medical).toEqual({
      date: '日期未知',
      diagnosis: '未记录诊断',
      attachments: [],
    })
    expect(facts.checkup).toEqual({
      date: '日期未知',
      findings: '未记录结论',
      attachments: [],
    })
  })

  it('ISO 日期按日历日截取，避免时区把日期挪一天', () => {
    expect(formatInsightDate('2026-10-20T23:30:00.000Z')).toBe('2026-10-20')
    expect(formatInsightDate(new Date(2026, 9, 20, 23, 30))).toBe('2026-10-20')
    expect(formatInsightDate('')).toBe('')
    expect(formatInsightDate(null)).toBe('')
    expect(formatInsightDate('not-a-date')).toBe('')
  })
})
