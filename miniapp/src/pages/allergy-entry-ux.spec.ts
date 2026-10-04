import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 过敏标签的入口体验（2026-10-04，老板两轮意见）。
 *
 * 第一轮："我实在是看不懂你这个过敏标签该如何添加过敏原，以及如何建计划？"
 *   · 添加过敏原：那张卡默认收起，要点「新增记录」→「手动点选 / 手输」，
 *     而这一步只弹一句"在上面点选或手输过敏原" —— 等于把入口指回自己。
 *   · 排查计划：它是页面第三块，得往下滑才看得到。
 *
 * 第二轮（否掉我加重复的按钮）："添加过敏原板块，既然已经是默认展开的，
 * 可以选择，也可以手动输入的窗口，为什么还要在最下方增加一个添加过敏原的按钮？"
 *   → 底部按钮不再重复"添加"，只留这页唯一需要带路的事：**排查计划**。
 */
describe('过敏标签 · 底部固定栏（老板指定的改造位置）', () => {
  const page = () =>
    readFileSync(
      resolve(process.cwd(), 'src/pages/dog-profile-health/index.vue'),
      'utf-8',
    )

  it('底部按钮在过敏标签下是「排查计划」，不重复一个"添加过敏原"', () => {
    const source = page()

    expect(source).toContain("return '排查计划'")
    // 老板否掉的那个重复按钮不能再回来
    expect(source).not.toContain("return '添加过敏原'")
    expect(source).not.toContain('stickyAllergyPlanText')
    expect(source).not.toContain("id=\"allergy-add\"")
  })

  it('其它标签仍是「新增记录」/「返回」', () => {
    const source = page()

    expect(source).toContain("return '新增记录'")
    expect(source).toContain('return HEALTH_ENTRY_LABELS[entrySource.value]')
  })

  it('点底部按钮 = 滚到排查计划那一块（这页唯一需要带路的事）', () => {
    const source = page()

    expect(source).toContain("scrollPageToSelector('#allergy-trial')")
  })

  it('锚点在模板里真的存在（滚过去要有东西接着）', () => {
    const source = page()

    expect(source).toContain('id="allergy-trial"')
  })

  it('添加的三条路都在那张卡上，不需要任何按钮带路', () => {
    const card = readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/AllergyQuickAddSection.vue'),
      'utf-8',
    )

    // 一点即选
    expect(card).toContain('@tap="addAllergen(item)"')
    // 手动输入
    expect(card).toContain('@confirm="commitCustomAllergens"')
    // 传报告
    expect(card).toContain('@tap="pickHealthReport"')
    expect(card).toContain('defineExpose({ pickHealthReport })')
  })

  it('添加卡常开：一进过敏标签就能看见怎么加', () => {
    const source = page()

    expect(source).toContain(':show-add-entry="true"')
    expect(source).not.toContain('allergyAddEntryVisible')
  })

})
