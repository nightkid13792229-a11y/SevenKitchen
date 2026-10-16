import { describe, expect, it } from 'vitest'
/**
 * 跨端一致性守卫（2026-10-16，批次 5.3）—— **过渡期专用**
 *
 * ## 它守什么
 *
 * 后台有一份营养评估引擎的**副本**（`utils/recipeDesigner/assessment.ts`），
 * 后端有权威实现。删副本的前提是：**两边算出来的东西一模一样**。
 * 不一致就删，等于把差异变成线上事故。
 *
 * 这条测试把两份实现跑在同一组输入上，逐字段比。
 *
 * ## 它什么时候可以删
 *
 * 等批次 5.3 把后台改成调后端、删掉那份副本时，这条测试**一起删** ——
 * 那时没有"两份"可比了。（删副本的动作本身就是它完成使命的标志。）
 *
 * ## 为什么它现在才有
 *
 * 2026-10-16 给后端补 `dataGaps`（"哪个原料缺哪个字段"）时，
 * 需要证明移植是**逐字照搬**而不是"照着写了一个差不多的"。
 * 这个对比就是那次移植的验收依据。
 */
import { assessRecipeDraft as frontendAssess } from '@/utils/recipeDesigner/assessment'
// @ts-expect-error 跨包相对引用（只在这条一次性对比里用）
import { assessRecipeDraft as backendAssess } from '../../../../../backend/src/domain/recipe-designer/recipe-assessment'

function profile(overrides: Record<string, unknown> = {}) {
  return {
    macros: {
      moisture: 70,
      crudeProtein: 20,
      crudeFat: 8,
      ash: 2,
      fiber: 1,
    },
    ...overrides,
  }
}

const items = [
  { id: 'i1', name: '鸡胸肉', weightG: 300, nutritionProfile: profile() },
  // 缺粗脂肪 → 应该进 dataGaps
  {
    id: 'i2',
    name: '糙米',
    weightG: 200,
    nutritionProfile: {
      macros: { moisture: 12, crudeProtein: 8, ash: 1, fiber: 2 },
    },
  },
  // 缺水分与灰分
  {
    id: 'i3',
    name: '南瓜',
    weightG: 100,
    nutritionProfile: { macros: { crudeProtein: 1, crudeFat: 0.2 } },
  },
  // 用量为 0 → 不算缺口
  {
    id: 'i4',
    name: '没加的',
    weightG: 0,
    nutritionProfile: { macros: {} },
  },
]

describe('跨端对比：后台副本 vs 后端权威', () => {
  it('★ dataGaps 完全一致', () => {
    const input: any = { items, targets: [] }
    const fe = frontendAssess(input)
    const be = backendAssess(input)
    expect(be.dataGaps).toEqual(fe.dataGaps)
  })

  it('整份结果逐字段一致（除新增的 dataGaps）', () => {
    const input: any = { items, targets: [] }
    const fe: any = frontendAssess(input)
    const be: any = backendAssess(input)
    const { dataGaps: _a, ...beRest } = be
    const { dataGaps: _b, ...feRest } = fe
    expect(beRest).toEqual(feRest)
  })
})
