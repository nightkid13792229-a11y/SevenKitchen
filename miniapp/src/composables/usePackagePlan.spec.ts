import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 分装计划 composable · 守卫
 *
 * 这段状态原来在**成品订购页**和 **DIY 配置页**各写一遍，
 * 6 个 ref 一字不差 + 9 个同名函数。四条口径必须守住：
 *   ① **不算价格** —— 价格由后端算（项目硬规矩）
 *   ② **不做隐式重置** —— 换狗清空要页面显式调用（隐式副作用会把守卫条件悄悄变真）
 *   ③ **参数是函数** —— 饭量/餐数会随选狗变化，传值会拿到第一次的快照
 *   ④ **取消自定义要二次确认** —— 会丢掉顾客填的内容
 */
describe('usePackagePlan · 分装计划公共状态', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/composables/usePackagePlan.ts'),
    'utf-8',
  )

  it('★ 不算价格（价格归后端）', () => {
    expect(source).not.toContain('price')
    expect(source).not.toContain('amount')
    expect(source).not.toContain('总价')
  })

  it('★ 不做隐式重置：没有 watch，重置要显式调用', () => {
    expect(source).not.toContain('watch(')
    expect(source).toContain('function resetPackagePlan')
  })

  it('★ 参数是函数（响应式来源），且先解构', () => {
    expect(source).toContain('dailyIntakeG: () => number | null | undefined')
    expect(source).toContain('const { dailyIntakeG, mealsPerDay, dogId, perMealG, onPlanChanged, clearCycleOnCustom } =')
  })

  it('★ 取消自定义有二次确认（会丢顾客填的内容）', () => {
    expect(source).toContain('uni.showModal')
    expect(source).toContain('取消后你填写的每袋克数和袋数会恢复为系统默认分装')
  })

  it('★ 按钮文案不超过 4 个汉字（超了微信静默不弹）', () => {
    const confirm = source.match(/confirmText:\s*'([^']+)'/)?.[1] || ''
    const cancel = source.match(/cancelText:\s*'([^']+)'/)?.[1] || ''
    expect(confirm.length).toBeLessThanOrEqual(4)
    expect(cancel.length).toBeLessThanOrEqual(4)
  })

  it('★ 至少保留一行分装（全删光顾客没输入框可用）', () => {
    expect(source).toContain('if (packagePlan.value.length <= 1)')
  })

  it('★ 每袋克数非法时归 0（0 = 还没填，不是填了 0 克）', () => {
    expect(source).toContain('Number.isFinite(normalized) && normalized > 0 ? normalized : 0')
  })

  it('★ 取消自定义会退回上一次的周期，而不是一律回 7 天', () => {
    expect(source).toContain('selectedCycleDays.value = lastSelectedCycleDays.value')
  })
})
