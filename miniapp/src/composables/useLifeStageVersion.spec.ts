import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 生命阶段 composable（2026-11-02 起）· 只做"结论 → 八态"的映射。
 *
 * 结论只有一个来源：`/recipes/:id` 返回里的 `lifeStageMatch`。
 * 页面换狗/换版都重新加载菜谱，所以这里不再发请求、不再计时、不再自己判风险。
 */
describe('useLifeStageVersion · 结论映射', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/composables/useLifeStageVersion.ts'),
    'utf-8',
  )

  it('★ 不再自己请求结论', () => {
    expect(source).not.toContain('fetchLifeStageMatch')
    expect(source).not.toContain('request(')
    expect(source).not.toContain('check()')
  })

  it('★ 八态交给 life-stage-ui 一处判定', () => {
    expect(source).toContain('resolveLifeStageUiState')
  })

  it('★ 参数仍是函数（响应式来源），且直接吃 verdict', () => {
    expect(source).toContain('verdict: () => LifeStageMatchVerdict | null | undefined')
    expect(source).toContain('dogId: () => string | null | undefined')
  })

  it('★ 风险等级只读后端，不自己拼', () => {
    expect(source).toContain('verdict()?.riskLevel')
    expect(source).not.toMatch(/=== 'PUPPY_UNDER_14_WEEKS'/)
  })

  it('★ 没狗时不判断（isMatch 为 true，不拦）', () => {
    expect(source).toContain("state.value === 'no_dog'")
    expect(source).toContain("state.value === 'unknown'")
  })
})
