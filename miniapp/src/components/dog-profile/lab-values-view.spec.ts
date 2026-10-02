import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

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
    const view = readView()
    expect(view).toContain('return !/\\d/.test(line)')
  })

  it('项目与数值按第一个数字切开，左右分栏', () => {
    const view = readView()
    expect(view).toContain('const valueMatch = body.match')
    expect(view).toContain('justify-content: space-between')
  })

  it('偏高/偏低单独着色，但不做任何判断（只显示报告自己标的）', () => {
    const view = readView()
    expect(view).toContain('(偏高|偏低|高|低|正常)')
    expect(view).toContain('lab__flag')
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
    // 表单里默认看排版好的，点「修改」才切输入框
    expect(section).toContain('toggleLabEditing')
    expect(section).toContain("isLabEditing(record, index) ? '完成' : '修改'")
  })
})
