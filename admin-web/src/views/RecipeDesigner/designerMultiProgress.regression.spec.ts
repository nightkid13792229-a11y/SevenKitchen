import { describe, expect, it } from 'vitest'
import designer from '@/views/RecipeDesigner/index.vue?raw'
import orderDetail from '@/views/CustomRecipes/OrderDetail.vue?raw'

describe('设计器 · 多份订单进度', () => {
  it('从订单进入设计器时带上 orderId', () => {
    expect(orderDetail).toContain('orderId=${encodeURIComponent(order.value!.orderId)}')
  })

  it('显示共 N 份、已设计 X 份', () => {
    expect(designer).toContain('本单共 {{ multiOrderProgress.quantity }} 份，已设计 {{ multiOrderProgress.designed }} 份')
    expect(designer).toContain('multiOrderProgress')
  })

  it('读取订单份数和候选食谱数量', () => {
    expect(designer).toContain('customRecipeApi.getOrderDetail(orderId)')
    expect(designer).toContain('customRecipeApi.listRecipeCandidates(orderId)')
    expect(designer).toContain('designed:')
  })
})
