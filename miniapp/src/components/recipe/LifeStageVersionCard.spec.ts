import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 生命阶段版本卡 · 守卫
 *
 * 这个组件替掉了四页各写一遍的实现（21 个 computed + 13 个函数）。
 * 三条口径必须守住：
 *   ① 后端 5 种 matchType → 界面 **3 种**状态（LEGACY 不显示）
 *   ② 文案优先用后端给的 message（它知道"为什么没匹配上"）
 *   ③ 前端不自己判定匹配 —— 判定在 `utils/life-stage-match.ts` 与后端
 */
describe('LifeStageVersionCard · 生命阶段版本卡', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/components/recipe/LifeStageVersionCard.vue'),
    'utf-8',
  )

  it('★ 5 种 matchType 收成 3 种界面状态，LEGACY 整块不显示', () => {
    expect(source).toContain('FALLBACK_ADULT')
    expect(source).toContain('FALLBACK_FIRST')
    expect(source).toContain("'MANUAL_MISMATCH'")
    expect(source).toContain("'MATCHED'")
    // LEGACY = 这张食谱本来就不分版本 → 不显示
    expect(source).toContain("type === 'LEGACY'")
    expect(source).toContain("return 'hidden'")
  })

  it('★ 不自己判定匹配，复用 utils 里的 isLifeStageMismatch', () => {
    // 判定逻辑只能有一份
    expect(source).toContain("import { isLifeStageMismatch } from '@/utils/life-stage-match'")
    expect(source).toContain('isLifeStageMismatch(type)')
    // 不能在组件里再写一遍"哪些算不匹配"
    expect(source).not.toMatch(/matchType === 'MANUAL_MISMATCH' \|\|/)
  })

  it('★ 文案优先用后端 message', () => {
    expect(source).toContain('props.message')
    expect(source).toContain("if (fromBackend) return fromBackend")
  })

  it('只有多于 1 个版本时才显示「切换 ›」', () => {
    expect(source).toContain('versionCount')
    expect(source).toContain('> 1')
  })

  it('三种状态各有配色（匹配绿 / 手动黄 / 不匹配红）', () => {
    expect(source).toContain('life-stage-card--matched')
    expect(source).toContain('life-stage-card--manual')
    expect(source).toContain('life-stage-card--mismatch')
  })

  it('切换按钮只 emit，不自己跳路由', () => {
    expect(source).toContain("emit('open-selector')")
    expect(source).not.toContain('uni.navigateTo')
  })
})
