import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * 营养报告入口卡（2026-11-07）
 *
 * 老板的两条要求：① 样式对齐同页「全营养标准」卡；② 不要那个"营养"方块标识。
 * 文案也是定的：标题「营养报告」、按钮「查看报告」，
 * 副标题说清报告里包含氨基酸、脂肪酸、维生素、矿物质。
 */
describe('NutritionReportEntry · 营养报告入口', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/components/recipe/NutritionReportEntry.vue'),
    'utf-8',
  )

  it('用老板定的三处文案', () => {
    expect(source).toContain('营养报告')
    expect(source).toContain('包含氨基酸、脂肪酸、维生素、矿物质在内的详细营养评估')
    expect(source).toContain('查看报告')
  })

  it('不再有「营养」方块标识，也不再用旧文案', () => {
    expect(source).not.toContain('report-icon')
    expect(source).not.toContain('>营养<')
    expect(source).not.toContain('查看完整报告')
    expect(source).not.toContain('查看 Setar 生成的完整营养评估')
  })

  it('整卡可点：点击抛 open 事件（跳转由页面决定）', () => {
    expect(source).toContain('@tap="emit(\'open\')"')
    expect(source).toContain("(event: 'open')")
    // 组件自己不跳页 —— 详情页和交付页的入口参数不同
    expect(source).not.toContain('uni.navigateTo')
  })

  it('样式对齐「全营养标准」卡：米金渐变底 + 金色描边 + 左右两栏', () => {
    expect(source).toContain('linear-gradient(150deg, #fdf8ee 0%, #f6efe0 100%)')
    expect(source).toContain('rgba(176, 141, 79, 0.5)')
    expect(source).toContain('justify-content: space-between')
    expect(source).toContain('color: #b08d4f')
  })

  it('副标题独占一行（26 个字跟按钮抢宽度会被挤成孤零零的「营养评估」）', () => {
    const headIndex = source.indexOf('nutrition-report-entry__head')
    const subIndex = source.indexOf('nutrition-report-entry__sub')

    expect(headIndex).toBeGreaterThan(-1)
    // 标题与按钮在 head 里，副标题在 head 外面、整卡宽度
    expect(subIndex).toBeGreaterThan(headIndex)
    expect(source).toMatch(/\.nutrition-report-entry__sub\s*\{[\s\S]*display:\s*block;/)
    expect(source).toMatch(/\.nutrition-report-entry\s*\{[\s\S]*padding:\s*24rpx 26rpx;/)
    expect(source).not.toContain('flex-direction: column')
  })
})
