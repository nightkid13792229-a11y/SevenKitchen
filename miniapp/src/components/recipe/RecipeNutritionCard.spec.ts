import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 核心营养成分卡 · 守卫
 *
 * 这块是**交付第 1 页 + 详情页共用**的。三条口径很容易被改坏：
 *   ① 缺失显示「—」不是 0（0% 会被读成"不含脂肪"）
 *   ② 报告入口在**块内**（老板要求并进来，不是页面底部）
 *   ③ 8 项顺序写死在前端（后端只给数字）
 */
describe('RecipeNutritionCard · 核心营养成分卡', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/components/recipe/RecipeNutritionCard.vue'),
    'utf-8',
  )

  it('★ 缺失值显示「—」而不是 0', () => {
    // 这是最容易"顺手改成 0"的地方
    expect(source).toContain("return '—'")
    expect(source).toContain('Number.isFinite(raw)')
    // 不能出现 "?? 0" 这种把缺失当零的写法
    expect(source).not.toMatch(/\?\?\s*0\b/)
  })

  it('★ 报告入口在卡片内，不是页面底部', () => {
    expect(source).toContain('nutrition-card__report')
    expect(source).toContain('查看完整营养报告')
    // 入口必须 emit 出去，由页面决定怎么跳（组件不该知道路由）
    expect(source).toContain("emit('open-report')")
  })

  it('8 项营养按固定顺序，且正好 8 个', () => {
    const block = source.slice(
      source.indexOf('const MACRO_CELLS'),
      source.indexOf('type MacroKey'),
    )
    const keys = block.match(/key: '[a-zA-Z]+'/g) || []
    expect(keys.length).toBe(8)
    // 顺序是产品决定 —— 蛋白质一定在最前
    expect(keys[0]).toContain('proteinPercent')
    expect(keys[7]).toContain('calciumPhosphorusRatio')
  })

  it('能量密度从 kcal/kg 换算成 kcal/g 显示', () => {
    expect(source).toContain('raw / 1000')
  })

  it('没有 standard 时整行不显示（不留空标签）', () => {
    expect(source).toContain('v-if="standardLabel"')
    expect(source).toContain("if (!value) return ''")
  })
})
