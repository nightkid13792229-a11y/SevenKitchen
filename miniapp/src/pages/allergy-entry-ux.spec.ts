import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 过敏标签的入口体验（2026-10-04 老板："我实在是看不懂你这个过敏标签
 * 该如何添加过敏原，以及如何建计划？"）。
 *
 * 站在家长角度走一遍，问题出在**两个入口都找不到**：
 *   · 添加过敏原：那张卡默认收起，要点「新增记录」→「手动点选 / 手输」，
 *     而这一步只弹一句"在上面点选或手输过敏原" —— 等于把入口指回自己。
 *   · 排查计划：它是页面第三块，得往下滑才看得到。
 *
 * 老板给的改法："你不一定要加在顶部，你也可以改造最下方的那个新增记录的固定栏。"
 */
describe('过敏标签 · 底部固定栏（老板指定的改造位置）', () => {
  const page = () =>
    readFileSync(
      resolve(process.cwd(), 'src/pages/dog-profile-health/index.vue'),
      'utf-8',
    )

  it('主按钮在过敏标签下写明「添加过敏原」，不再叫笼统的「新增记录」', () => {
    const source = page()

    expect(source).toContain('添加过敏原')
    // 其它标签仍是「新增记录」
    expect(source).toContain("return '新增记录'")
  })

  it('过敏的第二个出口是「排查计划」，常驻在固定栏上', () => {
    const source = page()

    expect(source).toContain('stickyAllergyPlanText')
    expect(source).toContain("? '排查计划' : ''")
    expect(source).toContain(':secondary-text="stickyAllergyPlanText"')
    expect(source).toContain('@secondary="onStickyAllergyPlan"')
    // 只有过敏标签有第二个按钮，其它标签不显示
    expect(source).toContain("activeHealthTab.value === 'allergy' ? '排查计划' : ''")
  })

  it('点「添加过敏原」= 滚到那张卡 + 光标落进输入框（不是弹一句"在上面点"）', () => {
    const source = page()

    expect(source).toContain("scrollPageToSelector('#allergy-add')")
    expect(source).toContain('allergySectionRef.value?.focusInput?.()')
    // 那句"在上面点选或手输过敏原"只允许留在注释里（说明历史），不能是活代码
    expect(source).not.toContain("showToast({ title: '在上面点选或手输过敏原'")
  })

  it('点「排查计划」= 滚到排查计划那一块', () => {
    const source = page()

    expect(source).toContain("scrollPageToSelector('#allergy-trial')")
  })

  it('两个锚点在模板里真的存在（滚过去要有东西接着）', () => {
    const source = page()

    expect(source).toContain('id="allergy-add"')
    expect(source).toContain('id="allergy-trial"')
  })

  it('添加卡常开：一进过敏标签就能看见怎么加', () => {
    const source = page()

    expect(source).toContain(':show-add-entry="true"')
    expect(source).not.toContain('allergyAddEntryVisible')
  })

  it('手输框支持被叫起聚焦', () => {
    const card = readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/AllergyQuickAddSection.vue'),
      'utf-8',
    )

    expect(card).toContain(':focus="customFocused"')
    expect(card).toContain('defineExpose({ pickHealthReport, focusInput })')
  })
})
