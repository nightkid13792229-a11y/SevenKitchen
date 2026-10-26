import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 两张食材表 · 守卫
 *
 * 老板 2026-10-18 定：**做成两个组件，不做参数开关**。
 * 理由是参数越少、漏传的机会越少。这条决定很容易被"顺手合并"。
 */
/**
 * 去掉 HTML 注释与 JS 行注释 / 块注释 —— 只留"会被渲染或执行"的部分。
 *
 * 为什么需要：组件的注释里常常写着"为什么不做 X"，
 * 而断言 `not.toContain('X')` 会被这段说明文字绊倒。
 */
function stripComments(source: string): string {
  return source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

describe('两张食材表 · 分成两个组件', () => {
  const ratio = readFileSync(
    resolve(
      process.cwd(),
      'src/components/recipe/RecipeIngredientRatioTable.vue',
    ),
    'utf-8',
  )
  const usage = readFileSync(
    resolve(
      process.cwd(),
      'src/components/recipe/RecipeIngredientUsageTable.vue',
    ),
    'utf-8',
  )

  it('★ 占比保留两位小数；小于 0.01% 显示 <0.01%，不能舍成 0.00%', () => {
    /**
     * 2026-10-24 老板定：占比保留两位小数。
     * 真实数据里食用盐是 0.12%，显示 0.12%；
     * 更小的（<0.01%）显示 <0.01%，不能读成"没放"。
     */
    expect(ratio).toContain("'<0.01%'")
    expect(ratio).toContain('num > 0')
    expect(ratio).toContain('num < 0.01')
    expect(ratio).toContain('toFixed(2)')
  })

  it('★ 占比表三列：名称 + 部位 / 状态 / 预处理 + 占比，不显示老的"制备方法"', () => {
    expect(ratio).toContain('占比')
    expect(ratio).toContain('部位 / 状态 / 预处理')
    expect(ratio).toContain('item.preparation')
    // 老文案不能再出现
    const template = stripComments(
      ratio.slice(0, ratio.indexOf('<script setup')),
    )
    expect(template).not.toContain('制备方法')
  })

  it('★ 用量表三列：名称 + 部位 / 状态 / 预处理 + 净用量', () => {
    expect(usage).toContain('原料名称')
    expect(usage).toContain('部位 / 状态 / 预处理')
    expect(usage).toContain('净用量')
    expect(usage).toContain('item.preparation')
  })

  it('★ 用量表没有"采购量"列，也不提损耗', () => {
    /**
     * 2026-10-18 老板定：只给净用量。
     *
     * ⚠️ 断言前必须**剥掉注释** —— 组件里有一段注释在解释
     * "为什么没有采购量列"，直接搜字符串会被那段注释绊倒。
     * 要看的是**渲染出来的东西**，不是说明文字。
     */
    const rendered = stripComments(usage)
    expect(rendered).not.toContain('采购量')
    expect(rendered).not.toContain('损耗')
    expect(rendered).not.toContain('purchaseG')
  })

  it('两个组件都不接受"显示/隐藏列"的开关参数', () => {
    // 一旦有开关，就会出现"某一页漏传导致多一列"
    for (const source of [ratio, usage]) {
      const propsBlock = stripComments(source).slice(
        source.indexOf('defineProps'),
        source.indexOf('</script>'),
      )
      expect(propsBlock).not.toMatch(/show[A-Z]/)
      expect(propsBlock).not.toMatch(/with[A-Z]/)
      expect(propsBlock).not.toMatch(/columns\??:/)
    }
  })

  it('两张表缺失值都给「—」，不给 0', () => {
    expect(ratio).toContain("return '—'")
    expect(usage).toContain("return '—'")
    expect(ratio).not.toMatch(/\?\?\s*0\b/)
    expect(usage).not.toMatch(/\?\?\s*0\b/)
  })

  it('用量表给出合计净重', () => {
    expect(usage).toContain('合计净重')
    expect(usage).toContain('totalNetG')
  })
})
