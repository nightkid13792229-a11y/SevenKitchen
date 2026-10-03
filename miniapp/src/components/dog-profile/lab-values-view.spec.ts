import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  isLabTitleLine,
  parseLabRow,
  splitLabValueParts,
} from '../../utils/lab-values'

/**
 * 化验数据的排版（2026-10-02 老板第二次实测提的）。
 *
 * 老板原话："化验数据中的数值类型在排版上并没有做区分。生化、CRP 这些，
 * 连标题和正文都是一模一样的，这个在排版上可以优化一下吗？"
 *
 * 一份化验单抄下来是「报告名 + 逐项数值」，所以展示要分三层：
 *   · 报告名（生化 / 血细胞检测报告单 / CRP）→ 小标题
 *   · 项目名 与 数值 → 左右两栏
 *   · 偏高/偏低（报告自己标的）→ 点出来
 */
describe('化验数据排版', () => {
  function readView() {
    return readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/LabValuesView.vue'),
      'utf-8',
    )
  }

  it('三层排版都在：报告名 / 项目名 / 数值', () => {
    const view = readView()

    expect(view).toContain('lab__title')
    expect(view).toContain('lab__name')
    expect(view).toContain('lab__value')
  })

  it('报告名判定：整行没有数字（数值行几乎都带数字）', () => {
    expect(isLabTitleLine('血细胞形态学检查')).toBe(true)
    expect(isLabTitleLine('正常红细胞 个数:2292个/56张')).toBe(false)
  })

  it('折叠时报告项数报**总量**，不是精简后剩几项（老板实测提的）', () => {
    const view = readView()

    expect(view).toContain('total: block.rows.length')
    expect(view).toContain('return block.total || block.rows.length')
  })

  it('项目与数值切开、左右分栏（单值行仍然这样排）', () => {
    const row = parseLabRow('总胆红素(TBIL) 7 umol/L')

    expect(row.name).toBe('总胆红素(TBIL)')
    expect(row.value).toBe('7 umol/L')
    expect(readView()).toContain('justify-content: space-between')
  })

  it('偏高/偏低单独着色，但不做任何判断（只显示报告自己标的）', () => {
    // 只认报告自己写的标记；没写就留空，绝不自己判断
    expect(parseLabRow('丙氨酸氨基转移酶(ALT) 144 U/L（偏高）').flag).toBe('偏高')
    expect(parseLabRow('丙氨酸氨基转移酶(ALT) 144 U/L').flag).toBe('')
    expect(readView()).toContain('lab__flag')
  })

  it('确认卡片与表单都用它（一处排版，两处一致）', () => {
    const scan = readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/HealthDocumentScan.vue'),
      'utf-8',
    )
    const section = readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/HealthRecordsSection.vue'),
      'utf-8',
    )

    expect(scan).toContain('<LabValuesView')
    expect(section).toContain('<LabValuesView')
    // 表单里每个板块都是「默认只读 + 小编辑按钮」，化验那一格默认折叠
    expect(section).toContain('toggleFieldEditing')
    expect(section).toContain("isFieldEditing(record, index, row.key) ? '完成' : '编辑'")
    expect(section).toContain('collapsible')
  })
})

/**
 * 多组数值的排版（2026-10-04 老板提的三个排版问题）。
 *
 * 原话：
 *   · "血细胞形态学检查这一块的排版，为什么会强行分割成两列？"
 *   · "将浓度一拆为二？"（`1.47 x` 和 `10^12/L` 被折到两行）
 *   · "字体大小也有区别呢？"（项目名小、数值大）
 *
 * 根因：这类报告一行并排三组数（个数 / 浓度 / 百分比），
 * 却被塞进「左项目名 + 右数值」的两栏，长数值只能折行，还把单位拆开。
 */
describe('化验数据 · 一行多组数值的排版', () => {
  const cases: [string, string][] = [
    ['个数:2292个/56张 浓度:1.47 x 10^12/L 百分比:26.62', '3'],
    ['个数 17个/HPF 参考值 3.4-9.7×10^9/L', '2'],
  ]

  it('把一行里的几组「标签 数值」拆开', () => {
    expect(splitLabValueParts(cases[0][0]).map(p => p.label))
      .toEqual(['个数', '浓度', '百分比'])
    expect(splitLabValueParts(cases[0][0]).map(p => p.text))
      .toEqual(['2292个/56张', '1.47\u00A0×10^12/L', '26.62'])
  })

  it('数字和单位粘在一起，不再被折到两行（"浓度一拆为二"）', () => {
    const parts = splitLabValueParts('个数:10个/377张 浓度:0.25 x 10^9/L 百分比:2.84')
    const density = parts.find(p => p.label === '浓度')

    expect(density?.text).toBe('0.25\u00A0×10^9/L')
    expect(density?.text).not.toContain(' ')
  })

  it('只有一组数值时不拆（普通两栏排版继续用）', () => {
    expect(splitLabValueParts('17.9 umol/L')).toEqual([])
    expect(splitLabValueParts('参考值 0-4.9')).toEqual([])
  })

  it('第一个标签之前的内容并进第一组（"白细胞 个数 17个/HPF"）', () => {
    const parts = splitLabValueParts('白细胞 个数 17个/HPF 参考值 3.4-9.7')

    expect(parts[0]).toEqual({ label: '', text: '白细胞' })
    expect(parts[1].label).toBe('个数')
  })

  it('两组以上用竖排布局，字号统一（标签与数值都是 24rpx）', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/LabValuesView.vue'),
      'utf-8',
    )

    expect(source).toContain("'lab__row--stacked': row.parts.length >= 2")
    // 项目名、标签、数值三者字号一致 —— 老板说的"字体大小也有区别"
    const sizes = source.match(/\.lab__(name|part-label|part-value)\s*\{[^}]*font-size:\s*(\d+)rpx/g) || []
    const found = sizes.map(s => Number(s.match(/font-size:\s*(\d+)rpx/)![1]))
    expect(found.length).toBeGreaterThanOrEqual(3)
    expect(new Set(found).size).toBe(1)
  })
})

/**
 * 切分位置本身（2026-10-04 老板截图里的真正元凶）。
 *
 * 原来按"第一个数字前面就是项目名"来切，于是切在了 `10^12/L` 前面：
 *   项目名 = `正常红细胞 个数:2292个/56张 浓度:1.47 x`
 *   数值   = `10^12/L 百分比:26.62`
 * 塞进左右两栏，就成了老板看到的"强行分割成两列 + 浓度一拆为二"。
 */
describe('化验数据 · 项目名该切在哪', () => {
  it('一行三组数时，项目名只留项目名', () => {
    const row = parseLabRow('正常红细胞 个数:2292个/56张 浓度:1.47 x 10^12/L 百分比:26.62')

    expect(row.name).toBe('正常红细胞')
    expect(row.parts.map(p => p.label)).toEqual(['个数', '浓度', '百分比'])
    expect(row.parts.map(p => p.text)).toEqual(['2292个/56张', '1.47\u00A0×10^12/L', '26.62'])
  })

  it('项目名里带"百分比"三个字不算数值标签（二、五分类报告很常见）', () => {
    const row = parseLabRow('1-2.中性粒细胞百分比(NEU%) 71.1 %')

    expect(row.name).toBe('1-2.中性粒细胞百分比(NEU%)')
    expect(row.value).toBe('71.1 %')
    expect(row.parts).toEqual([])
  })

  it('空格分隔的写法也认（个数 17个/HPF 参考值 3.4-9.7）', () => {
    const row = parseLabRow('白细胞 个数 17个/HPF 参考值 3.4-9.7×10^9/L')

    expect(row.name).toBe('白细胞')
    expect(row.parts.map(p => p.label)).toEqual(['个数', '参考值'])
  })

  it('普通一行一项的报告不受影响', () => {
    const row = parseLabRow('丙氨酸氨基转移酶(ALT) 144 U/L（偏高）')

    expect(row.name).toBe('丙氨酸氨基转移酶(ALT)')
    expect(row.value).toBe('144 U/L')
    expect(row.flag).toBe('偏高')
    expect(row.parts).toEqual([])
  })

  it('`10^9/L` 不会被当成数值的起点（老路也要防这一刀）', () => {
    const row = parseLabRow('中性杆状核粒细胞 0.25 x 10^9/L')

    expect(row.name).toBe('中性杆状核粒细胞')
    expect(row.value).toBe('0.25\u00A0×10^9/L')
  })
})
