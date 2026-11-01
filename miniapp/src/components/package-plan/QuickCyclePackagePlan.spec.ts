import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 快速选备餐天数 + 自定义分装 · 共享组件守卫（2026-11-01）
 *
 * 这一块原来在成品订购页和 DIY 配置页各写一遍，已经漂移过：
 * 删除按钮一个红一个灰、加行按钮一个宽一个窄、摘要一个带"约N天"一个不带。
 * 抽成组件后，下面五条是它必须守住的契约：
 *   ① 只做展示：不持有分装状态、不调接口、不算价格
 *   ② 输入用草稿：打字期间不被归一化（否则 14 袋改不成 5 袋）
 *   ③ 提示是一张清单：有几条问题列几条，不是二选一
 *   ④ 只剩一行时不显示删除（点了也没用）
 *   ⑤ 组件 wxss 不许出现属性/标签选择器（微信只允许类选择器）
 */
describe('QuickCyclePackagePlan · 共享分装组件', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/components/package-plan/QuickCyclePackagePlan.vue'),
    'utf-8',
  )
  const template = source.slice(0, source.indexOf('<script setup'))
  const style = source.slice(source.indexOf('<style'), source.length)

  it('★ 只做展示：不持有状态、不调接口、不算价格', () => {
    expect(source).not.toContain('usePackagePlan(')
    expect(source).not.toContain('uni.request')
    expect(source).not.toContain('request(')
    expect(source).not.toContain('price')
    expect(source).not.toContain('amount')
    // 状态从页面来，通过 props
    expect(source).toContain('packagePlan?: PackagePlanItem[]')
    expect(source).toContain('cycleDays?: number | null')
  })

  it('★ 发出去的是意图事件，组件自己不改数据', () => {
    expect(source).toContain("(event: 'select-cycle', days: number): void")
    expect(source).toContain("(event: 'toggle-custom'): void")
    expect(source).toContain("(event: 'add-row'): void")
    expect(source).toContain("(event: 'update-row', index: number, field: PackagePlanField, value: string): void")
    expect(source).toContain("(event: 'remove-row', index: number): void")
    expect(source).not.toContain('packagePlan.value =')
  })

  it('★ 输入用草稿：打字期间不被归一化，失焦才提交', () => {
    expect(source).toContain('const drafts = reactive')
    expect(source).toContain('function inputValue(')
    expect(source).toContain('@blur="commitField(')
    expect(source).toContain('function commitAll()')
    // 页面在提交订单前能拿到未失焦的值
    expect(source).toContain('defineExpose({ commitAll })')
  })

  it('★ 问题提示是一张清单，有几条列几条', () => {
    expect(template).toContain('v-if="warnings.length > 0"')
    expect(template).toContain('v-for="warning in warnings"')
    // 不允许再出现"二选一"的老写法
    expect(template).not.toContain('v-else-if')
  })

  it('★ 只剩一行时不显示删除（至少留一行）', () => {
    expect(template).toContain('v-if="packagePlan.length > 1"')
    // 用条件渲染，不是 disabled 灰按钮
    expect(template).not.toContain(':disabled')
  })

  it('★ 组件样式只用类选择器（微信组件 wxss 限制）', () => {
    // 先把选择器抽出来再看，避免把颜色值里的 #26261f 误判成 ID 选择器
    const selectors = [...style.matchAll(/(?:^|\})\s*([^{}@]+)\{/g)]
      .map((match) => match[1].trim())
      .filter(Boolean)

    expect(selectors.length).toBeGreaterThan(0)
    for (const selector of selectors) {
      for (const part of selector.split(',')) {
        const one = part.trim()
        expect(one, `ID 选择器：${one}`).not.toMatch(/(^|[\s>+~])#[A-Za-z]/)
        expect(one, `属性选择器：${one}`).not.toMatch(/\[[^\]]+\]/)
        expect(one, `标签选择器：${one}`).not.toMatch(
          /(^|[\s>+~])(view|text|button|input|image|scroll-view)\b/,
        )
      }
    }
  })
})
