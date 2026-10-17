import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 封面组件 · 守卫
 *
 * 这个组件是**四页共用**的（交付第 1 页 / 详情页 / DIY 配置页 / 将来更多），
 * 老板 2026-10-18 审原型时定了三条，这三条都是"改回去很容易"的：
 *
 *   ① 没封面**不用首字母占位** —— 用一个字代替菜名等于什么都没说
 *   ② **不做布尔开关** —— 参数越少，漏传的机会越少
 *   ③ 空行要过滤 —— 狗没有品种时不该留一行空白
 */
describe('RecipeCover · 封面组件', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/components/recipe/RecipeCover.vue'),
    'utf-8',
  )
  const template = source.slice(0, source.indexOf('<script setup'))

  it('★ 没封面时用品牌深色块，不用首字母占位', () => {
    // 首字母占位是详情页原来的做法，老板明确否掉
    expect(template).not.toContain('charAt(0)')
    expect(template).not.toContain('slice(0, 1)')
    // 兜底靠的是同一个渐变，不是"取名字第一个字"
    expect(source).toContain('recipe-cover--fallback')
    expect(source).toContain('#24483a')
  })

  it('★ 不做显示开关：没有 showXxx 之类的布尔参数', () => {
    /**
     * 原型定稿时的原则：**参数越少，漏传的机会越少**。
     * 一旦加了 `showSubtitles` / `showBadge` 这类开关，
     * 就会出现"某一页忘了传导致少一行"的问题。
     */
    const propsBlock = source.slice(
      source.indexOf('defineProps'),
      source.indexOf('const hasImage'),
    )
    expect(propsBlock).not.toMatch(/show[A-Z]/)
    expect(propsBlock).not.toMatch(/withSubtitles/)
    expect(propsBlock).not.toMatch(/compact/)
  })

  it('空标题行会被过滤掉（狗没填品种时不留空行）', () => {
    expect(source).toContain('visibleSubtitles')
    expect(source).toContain("line.trim().length > 0")
  })

  it('食谱名永远显示 —— 兜底时也一样', () => {
    // 兜底只是换底色，文字一个都不能少
    expect(template).toContain('{{ title }}')
    const textBlock = template.slice(
      template.indexOf('recipe-cover__text'),
      template.indexOf('recipe-cover__badge'),
    )
    // 标题在兜底分支之外（没有 v-if 包着）
    expect(textBlock).toContain('recipe-cover__title')
  })

  it('图片为空字符串时也走兜底（不是只判 null）', () => {
    // 接口常给 '' 而不是 null，只判 null 会让空串走进 <image> 变白块
    expect(source).toContain("typeof props.coverImageUrl === 'string'")
    expect(source).toContain('props.coverImageUrl.length > 0')
  })
})
