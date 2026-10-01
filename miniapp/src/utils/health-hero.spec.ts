import { describe, expect, it } from 'vitest'
import {
  buildHealthHeroFacts,
  formatHealthHeroWeight,
} from './health-hero'

/**
 * 健康管理页顶部 Banner 的「狗狗基本信息」（2026-10-01）。
 *
 * 老板要求：Banner 左边头像+名字，右边显示年龄、性别、品种、体重。
 * 这里锁住四件事：
 *   · 顺序固定 年龄 → 性别 → 品种 → 体重；
 *   · 缺数据的项直接不显示（不出现"未填写"占位）；
 *   · 年龄按生日算（不满一岁显示月龄，与爱犬概览页同一套算法）；
 *   · 体重文案 12kg / 12.5kg，脏数据不显示。
 */
describe('Banner 基本信息', () => {
  const now = new Date('2026-10-01T12:00:00')

  it('四项齐全时按老板点名的顺序给出', () => {
    const facts = buildHealthHeroFacts(
      {
        birthday: '2023-05-01',
        gender: 'MALE',
        breedName: '柯基',
        currentWeightKg: 12.5,
      },
      { now },
    )

    expect(facts).toEqual([
      { label: '年龄', value: '3岁' },
      { label: '性别', value: '弟弟' },
      { label: '品种', value: '柯基' },
      { label: '体重', value: '12.5kg' },
    ])
  })

  it('不满一岁显示月龄（与爱犬概览页同一套算法）', () => {
    const facts = buildHealthHeroFacts(
      { birthday: '2026-06-01', gender: 'FEMALE' },
      { now },
    )

    expect(facts).toContainEqual({ label: '年龄', value: '4个月' })
  })

  it('母狗显示妹妹', () => {
    expect(buildHealthHeroFacts({ gender: 'FEMALE' }, { now })).toEqual([
      { label: '性别', value: '妹妹' },
    ])
  })

  it('手填的品种名优先于品种库里的名字（混血犬常用）', () => {
    const facts = buildHealthHeroFacts(
      { breedName: '柯基', customBreedName: '柯基串串' },
      { now },
    )

    expect(facts).toContainEqual({ label: '品种', value: '柯基串串' })
  })

  it('体重是整公斤时不显示小数', () => {
    const facts = buildHealthHeroFacts({ currentWeightKg: 12 }, { now })
    expect(facts).toContainEqual({ label: '体重', value: '12kg' })
  })

  it('体重是字符串（表单里存的就是字符串）也能正确显示', () => {
    const facts = buildHealthHeroFacts({ currentWeightKg: ' 8.4 ' }, { now })
    expect(facts).toContainEqual({ label: '体重', value: '8.4kg' })
  })

  it('缺数据的项不显示，也不留"未填写"占位', () => {
    expect(buildHealthHeroFacts({}, { now })).toEqual([])
    expect(buildHealthHeroFacts(null, { now })).toEqual([])
    expect(buildHealthHeroFacts(undefined, { now })).toEqual([])
  })

  it('只有部分数据时只显示有的那几项', () => {
    const facts = buildHealthHeroFacts(
      { gender: 'MALE', currentWeightKg: 5.2 },
      { now },
    )

    expect(facts).toEqual([
      { label: '性别', value: '弟弟' },
      { label: '体重', value: '5.2kg' },
    ])
  })

  it('生日不合法时年龄这一项不出现', () => {
    const facts = buildHealthHeroFacts({ birthday: '不是日期', gender: 'MALE' }, { now })
    expect(facts.map((fact) => fact.label)).toEqual(['性别'])
  })

  it('性别取值大小写与空格都能认（后端偶尔给 male）', () => {
    expect(buildHealthHeroFacts({ gender: ' male ' }, { now })).toEqual([
      { label: '性别', value: '弟弟' },
    ])
  })

  it('未知性别取值不显示这一项（不猜）', () => {
    expect(buildHealthHeroFacts({ gender: 'UNKNOWN' }, { now })).toEqual([])
  })

  describe('体重文案', () => {
    it('整数不带小数、非整数保留一位', () => {
      expect(formatHealthHeroWeight(12)).toBe('12kg')
      expect(formatHealthHeroWeight(12.34)).toBe('12.3kg')
    })

    it('零、负数、空值、非数字一律不显示', () => {
      expect(formatHealthHeroWeight(0)).toBe('')
      expect(formatHealthHeroWeight(-3)).toBe('')
      expect(formatHealthHeroWeight('')).toBe('')
      expect(formatHealthHeroWeight(null)).toBe('')
      expect(formatHealthHeroWeight(undefined)).toBe('')
      expect(formatHealthHeroWeight('abc')).toBe('')
    })
  })
})
