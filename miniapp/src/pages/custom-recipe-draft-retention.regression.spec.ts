import { describe, expect, it } from 'vitest'
import confirmSource from './custom-recipe/confirm.vue?raw'
import indexSource from './custom-recipe/index.vue?raw'

describe('定制页草稿 · 付款前后保留规则', () => {
  it('创建订单后不再立刻清草稿', () => {
    expect(confirmSource).not.toContain(
      'clearCustomRecipeDraft(getDraftCustomerId(), dogId.value);',
    )
  })

  it('付款成功后保留选择、清掉上一单报告/附件', () => {
    expect(confirmSource).toContain('retainCustomRecipeChoicesAfterPayment(')
    expect(indexSource).toContain('retainCustomRecipeChoicesAfterPayment(')
  })
})
