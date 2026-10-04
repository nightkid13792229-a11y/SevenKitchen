import { describe, expect, it } from 'vitest'
import { isLabTitleLine, parseLabBlocks } from './lab-values'

/**
 * 报告名里带数字，不能被当成"项目"（2026-10-04 老板实测）。
 *
 * 老板原话："这里的白细胞分类的统计项，为什么总数是 57 项呢？"
 *
 * 原来按"整行有数字就不是报告名"来判，于是
 * 「血液形态学检测报告·九分类52项」被判成数值行：它自己变成一个"项目"，
 * 后面那份报告的几十项又全并进上一份报告 —— 项数被撑到五六十，
 * 两份报告也糊成一块，看着像"白细胞分类有 57 项"。
 */
describe('报告名判定 · 名字里带数字也算报告名', () => {
  it('名字里带数字的报告名认得出来', () => {
    expect(isLabTitleLine('血液形态学检测报告·九分类52项')).toBe(true)
    expect(isLabTitleLine('血常规（五分类52项）')).toBe(true)
    expect(isLabTitleLine('白细胞分类')).toBe(true)
    expect(isLabTitleLine('生化')).toBe(true)
  })

  it('数值行不会被误判成报告名', () => {
    expect(isLabTitleLine('1.白细胞数(WBC) 8.78 10^9/L')).toBe(false)
    expect(isLabTitleLine('中性杆状核粒细胞 个数:10个/377张 浓度:0.25 x 10^9/L')).toBe(false)
    expect(isLabTitleLine('上皮细胞 0.7个/HPF 参考值0-4.9')).toBe(false)
    expect(isLabTitleLine('丙氨酸氨基转移酶(ALT) 144 U/L（偏高）')).toBe(false)
  })

  it('两份报告不会被糊成一块：项数只算自己那几项', () => {
    const text = [
      '白细胞分类',
      '中性杆状核粒细胞 个数:10个/377张 浓度:0.25 x 10^9/L 百分比:2.84',
      '中性分叶核粒细胞 个数:239个/377张 浓度:5.96 x 10^9/L 百分比:67.90',
      '血液形态学检测报告·九分类52项',
      '1.白细胞数(WBC) 8.78 10^9/L',
      '1-1.中性粒细胞绝对值(NEU#) 6.44 10^9/L',
    ].join('\n')

    const blocks = parseLabBlocks(text)

    expect(blocks.map(b => b.title)).toEqual(['白细胞分类', '血液形态学检测报告·九分类52项'])
    expect(blocks.map(b => b.total)).toEqual([2, 2])
  })

  it('老板那条报告的真实形状：白细胞分类就是 9 项，不是 57 项', () => {
    const text = [
      '白细胞分类',
      '中性杆状核粒细胞 个数:10个/377张 浓度:0.25 x 10^9/L 百分比:2.84',
      '中性分叶核粒细胞 个数:239个/377张 浓度:5.96 x 10^9/L 百分比:67.90',
      '中性多分叶核粒细胞 个数:9个/377张 浓度:0.22 x 10^9/L 百分比:2.56',
      '小淋巴细胞 个数:66个/377张 浓度:1.65 x 10^9/L 百分比:100.00',
      '大淋巴细胞 个数:0个/377张 浓度:0.00 x 10^9/L 百分比:0.00',
      '单核细胞 个数:14个/377张 浓度:0.35 x 10^9/L 百分比:3.98',
      '嗜酸性粒细胞 个数:14个/377张 浓度:0.35 x 10^9/L 百分比:3.98',
      '嗜碱性粒细胞 个数:0个/377张 浓度:0.00 x 10^9/L 百分比:0.00',
      '非典型白细胞 个数:0个/377张 浓度:0.00 x 10^9/L 百分比:0.00',
      '血液形态学检测报告·九分类52项',
      '1.白细胞数(WBC) 8.78 10^9/L',
    ].join('\n')

    const [first] = parseLabBlocks(text)

    expect(first.title).toBe('白细胞分类')
    expect(first.total).toBe(9)
    expect(first.rows.every(r => r.parts.length === 3)).toBe(true)
  })
})
