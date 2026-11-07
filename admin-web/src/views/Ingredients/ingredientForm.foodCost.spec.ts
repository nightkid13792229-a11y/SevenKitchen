import { describe, expect, it } from 'vitest'
/**
 * 原料表单 · 食材成本（2026-11-07 成本口径归位 · Task 10）
 *
 * admin-web 的 vitest 是 node 环境（没有 jsdom），页面挂不起来，
 * 所以接线用 `?raw` 读源码断言（与 ingredientForm.priceBasis.regression.spec.ts 同一套做法）。
 */
import ingredientFormSource from './IngredientForm.vue?raw'
import ingredientsApiSource from '@/api/ingredients.ts?raw'

describe('原料表单 · 食材成本', () => {
  it('保存食材时不再把成本写成 0、换算写成 1', () => {
    // 老代码保存任何「已有价」的食材都会被后端以「不能把价格改成 0」拒掉，
    // 折算后更是会把整条原料的成本抹平。
    expect(ingredientFormSource).not.toMatch(
      /formData\.currentPricePerPurchaseUnit = 0/,
    )
    expect(ingredientFormSource).not.toMatch(/formData\.purchaseToBaseRatio = 1\b/)
  })

  it('提交时对食材不下发成本与换算（让后端保留原值）', () => {
    expect(ingredientFormSource).toContain('delete payload.currentPricePerPurchaseUnit')
    expect(ingredientFormSource).toContain('delete payload.purchaseToBaseRatio')
  })

  it('食材详情展示只读的「当前成本」卡，并带价格历史入口', () => {
    expect(ingredientFormSource).toContain('当前成本')
    expect(ingredientFormSource).toContain('openIngredientCostHistory')
    // 成本按基准单位展示（元/g 或 元/ml），不再跟着采购单位走
    expect(ingredientFormSource).toContain('每 1 {{ baseUnitLabel }} 成本')
  })

  it('成本来源按四个流水来源翻译成人话，不再用「建档手填」', () => {
    expect(ingredientFormSource).toContain('INIT_FROM_SKU')
    expect(ingredientFormSource).not.toContain('建档手填')
  })

  it('后台能查食材成本历史', () => {
    expect(ingredientsApiSource).toContain('cost-history')
  })
})
