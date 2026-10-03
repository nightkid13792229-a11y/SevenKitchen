import { describe, expect, it } from 'vitest'
import { dedupeLabValues } from './health-records'

/**
 * 化验数据去重（2026-10-03 老板实测）。
 *
 * 老板传了 8 张报告（其中生化那份拍了两张），合并后觉得"很多项目、数值都不准"。
 * 逐页核对下来数值其实是对的，问题是**重复**：
 *   · 同一份报告拍两张 → 同一段数值抄两遍；
 *   · 血涂片形态学与血常规九分类都写了"中性杆状核粒细胞 0.25" → 同一件事出现两次。
 */
describe('化验数据去重', () => {
  it('同一份报告拍两张：同一项目只留一次', () => {
    const merged = [
      '生化',
      'GLU 7.8 mmol/L（偏高）',
      'TP 64 g/L',
      '生化',
      'GLU 7.8 mmol/l（偏高）',
      'TP 64 g/L',
    ].join('\n')

    expect(dedupeLabValues(merged)).toBe(['生化', 'GLU 7.8 mmol/L（偏高）', 'TP 64 g/L'].join('\n'))
  })

  it('两份报告测同一项目、项目名与数值都一样：跨段也只留一次', () => {
    const merged = [
      '血常规',
      '中性杆状核粒细胞 0.25 x 10^9/L',
      '血液形态学检测报告',
      '中性杆状核粒细胞 0.25 x 10^9/L',
    ].join('\n')

    expect(dedupeLabValues(merged)).toBe(
      ['血常规', '中性杆状核粒细胞 0.25 x 10^9/L', '血液形态学检测报告'].join('\n'),
    )
  })

  it('两份报告的同名项目但数值不同：都留着（可能是两次不同时间的检查）', () => {
    const merged = [
      '血常规',
      '中性杆状核粒细胞 0.25 x 10^9/L',
      '血液形态学检测报告',
      '中性杆状核粒细胞 0.31 x 10^9/L',
    ].join('\n')

    const out = dedupeLabValues(merged)
    expect(out).toContain('0.25 x 10^9/L')
    expect(out).toContain('0.31 x 10^9/L')
  })

  it('数值不同就必须都留（可能是两次不同时间的检查，是真信息）', () => {
    const merged = ['生化', 'ALT 87 U/L（偏高）', '生化', 'ALT 144 U/L（偏高）'].join('\n')

    const out = dedupeLabValues(merged)
    expect(out).toContain('ALT 87 U/L（偏高）')
    expect(out).toContain('ALT 144 U/L（偏高）')
  })

  it('同一段里项目名相同、数值不同：保留第一个（同一份报告不该出现两次同一项）', () => {
    const merged = ['生化', 'GLU 7.8 mmol/L', 'GLU 9.9 mmol/L'].join('\n')

    expect(dedupeLabValues(merged)).toBe(['生化', 'GLU 7.8 mmol/L'].join('\n'))
  })

  it('报告名与普通文字行原样保留；空行不影响', () => {
    const merged = ['生化', '', 'GLU 7.8 mmol/L', '样本存在异常：溶血+'].join('\n')

    const out = dedupeLabValues(merged)
    expect(out).toContain('生化')
    expect(out).toContain('样本存在异常：溶血+')
    expect(dedupeLabValues('')).toBe('')
  })
})
