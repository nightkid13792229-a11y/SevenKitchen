import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 生命阶段 composable · 守卫
 *
 * 这段状态原来在**四个页面各写一遍**（21 computed + 13 函数）。
 * 三条口径必须守住：
 *   ① **不判定匹配** —— 判定在 `utils/life-stage-match.ts` 与后端
 *   ② **拿不到结论时不拦**，但要能说"无法确认"（用 `checkFailed` 区分）
 *   ③ 参数是**函数**不是值（响应式来源传值会拿到第一次的快照）
 */
describe('useLifeStageVersion · 生命阶段公共状态', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/composables/useLifeStageVersion.ts'),
    'utf-8',
  )

  it('★ 不自己判定匹配，复用 utils 里的 isLifeStageMismatch', () => {
    expect(source).toContain('isLifeStageMismatch')
    // 不能在 composable 里再写一遍"哪些 matchType 算不匹配"
    expect(source).not.toMatch(/matchType === 'MANUAL_MISMATCH'/)
    expect(source).not.toMatch(/matchType === 'FALLBACK_ADULT'/)
  })

  it('★ 拿不到结论时 isMatch 返回 true（不拦顾客）', () => {
    expect(source).toContain('if (!current) return true')
  })

  it('★ checkFailed 与 verdict 分开 —— "还没查"和"查了失败"是两回事', () => {
    expect(source).toContain('const checkFailed = ref(false)')
    // 不能用"verdict 为 null"充当失败标记
    expect(source).toContain('checkFailed.value = !result')
  })

  it('★ 文案优先用后端 message，后端没给才兜底', () => {
    expect(source).toContain('if (verdict.value?.message) return verdict.value.message')
    expect(source).toContain('buildLifeStageReminderText')
    /**
     * 顺序：message 判断在兜底之前。
     *
     * ⚠️ 必须**在 computed 体内**比较 —— 直接 `indexOf` 会命中文件顶部的
     * import 行（`buildLifeStageReminderText` 在那里出现过一次），索引就反了。
     * 这个坑在另外两个 spec 里也踩过。
     */
    const body = source.slice(
      source.indexOf('const reminderText = computed'),
      source.indexOf('/** \n   * 向后端要一次结论'),
    )
    expect(body.indexOf('verdict.value?.message')).toBeGreaterThan(-1)
    expect(body.indexOf('verdict.value?.message')).toBeLessThan(
      body.indexOf('buildLifeStageReminderText'),
    )
  })

  it('★ 参数是函数而不是值（响应式来源）', () => {
    expect(source).toContain('recipeId: () => string | null | undefined')
    expect(source).toContain('dogId: () => string | null | undefined')
  })

  it('缺 recipeId 或 dogId 时不发请求', () => {
    expect(source).toContain('if (!currentRecipeId || !currentDogId) return')
  })

  it('查询失败不抛错（只置标记）', () => {
    expect(source).not.toMatch(/throw new Error/)
  })
})
