import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * 营养报告页 · 空态与失败态（2026-11-08）
 *
 * 背景：交付页新增了「营养报告」入口，点进来可能碰上两种"看不到报告"：
 *   · 接口/网络失败  → 应该让人重试；
 *   · 这条食谱真的没有结构化报告 → 说清"暂无"。
 * 原来两者共用一句「暂无完整营养报告」，失败会被误读成"这食谱没报告"。
 */
describe('营养报告页 · 失败态与空态分开', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/pages/recipe-nutrition-report/index.vue'),
    'utf-8',
  )

  it('失败态有独立文案和重试按钮', () => {
    expect(source).toContain('loadFailed')
    expect(source).toContain('营养报告加载失败')
    expect(source).toContain('重新加载')
    expect(source).toContain('@tap="loadNutritionReport"')
  })

  it('真的没有报告时仍提示「暂无完整营养报告」', () => {
    expect(source).toContain('暂无完整营养报告')
  })

  it('请求失败 / 接口返回失败都落到失败态，而不是空态', () => {
    const loader = source.match(/function loadNutritionReport\(\)[\s\S]*?\n}/)?.[0] || ''

    expect(loader).toContain('loadFailed.value = true')
    // catch 与「接口返回非 0」两条路都要置失败
    expect(loader.match(/loadFailed\.value = true/g)?.length).toBe(2)
    // 进来先复位，重试才有效
    expect(loader).toContain('loadFailed.value = false')
  })

  it('没有食谱编号时不会永远停在「加载中」', () => {
    const loader = source.match(/function loadNutritionReport\(\)[\s\S]*?\n}/)?.[0] || ''
    const guard = loader.slice(0, loader.indexOf('loading.value = true'))

    expect(guard).toContain('if (!recipeId.value)')
    expect(guard).toContain('loading.value = false')
  })
})
