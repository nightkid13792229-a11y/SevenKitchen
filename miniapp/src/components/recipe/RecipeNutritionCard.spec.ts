import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 核心营养成分卡 · 守卫
 *
 * 这块是**交付第 1 页 + 详情页共用**的。三条口径很容易被改坏：
 *   ① 缺失显示「—」不是 0（0% 会被读成"不含脂肪"）
 *   ② 卡内不再带报告入口（2026-11-08 起报告是独立板块）
 *   ③ 8 项顺序写死在前端（后端只给数字）
 */
describe('RecipeNutritionCard · 核心营养成分卡', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/components/recipe/RecipeNutritionCard.vue'),
    'utf-8',
  )
  // 注释里会提到"旧入口"，断言只认代码本身
  const markup = source.replace(/<!--[\s\S]*?-->/g, '')

  it('★ 缺失值显示「—」而不是 0', () => {
    // 这是最容易"顺手改成 0"的地方
    expect(source).toContain("return '—'")
    expect(source).toContain('Number.isFinite(raw)')
    // 不能出现 "?? 0" 这种把缺失当零的写法
    expect(source).not.toMatch(/\?\?\s*0\b/)
  })

  it('★ 卡内不再带报告入口（2026-11-08：报告是独立板块）', () => {
    // 旧入口是死代码：调用方固定 report-available=false，open-report 无人监听。
    // 留着默认值 true，将来谁复用这张卡就会把「查看完整营养报告」旧文案带回来。
    expect(markup).not.toContain('nutrition-card__report')
    expect(markup).not.toContain('查看完整营养报告')
    expect(markup).not.toContain('reportAvailable')
    expect(markup).not.toContain('open-report')
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

  it('★ 百分比必须带 %：只画数字会被读成"38.2 克/38.2 倍"', () => {
    // 单位写在 MACRO_CELLS 里还不够 —— 2026-11-07 的毛病就是定义了 unit 却没渲染
    expect(source).toContain("unit: '%'")
    expect(source).toContain('{{ cell.unit }}')
    expect(source).toContain('nutrition-cell__unit')
  })

  it('★ 能量密度按每公斤显示（1144 kcal/kg），不再折成每克', () => {
    expect(source).toContain("label: '能量密度'")
    expect(source).toContain("unit: 'kcal/kg'")
    expect(source).not.toContain('raw / 1000')
    expect(source).toContain('Math.round(raw)')
  })

  it('★ 钙磷比写成 N:1（只写 1.35 会被读成 1.35 倍）', () => {
    expect(source).toContain('}:1`')
  })

  it('没有 standard 时整行不显示（不留空标签）；页面有 banner 时可关闭', () => {
    expect(source).toContain('v-if="showStandard && standardLabel"')
    expect(source).toContain("if (!value) return ''")
    expect(source).toContain('showStandard?: boolean')
  })

  it('★ 5 项营养标清「干物质（DM）」口径（不标会被拿去和膨化粮湿基值比）', () => {
    // 2026-11-07：快照里存的就是 DM 占比，卡片必须自己说清口径
    expect(source).toContain('按干物质（DM）计')
    expect(source).toContain('含水量为实际含水率')
    // 只在有数字时出现，空块不该多一行说明
    expect(source).toContain('v-if="cells.length" class="nutrition-card__basis"')
  })
})
