import { describe, expect, it } from 'vitest'
/**
 * 用 Vite 的 `?raw` 读源码，**不要用 `node:fs`**：
 * admin-web 的 vitest 是 node 环境（没有 jsdom），Element Plus 页面挂不起来，
 * 所以页面接线用"读源码断言"锁住；算法与判定在 constants 的纯函数里真跑。
 */
import orderDetail from '@/views/CustomRecipes/OrderDetail.vue?raw'
import customRecipeApiSource from '@/api/customRecipe.ts?raw'

/**
 * 后台「补退款」入口的接线回归（2026-10-21）。
 *
 * 背景：生产单 CR202610201196 取消时漏退（修复前取消制作中的单不退钱），
 * 而订单一旦取消，「取消订单」按钮就消失 —— 后台再无退款入口。
 *
 * 这条链路必须完整：
 *   条件（已取消 + 已付款 + 未退成）→ 按钮 → 二次确认 → 调接口 → 回显状态 → 刷新
 */
describe('后台 · 手工补退款入口', () => {
  it('★ 详情页有「补退款」按钮，只在 canManualRefund 时显示', () => {
    expect(orderDetail).toContain('v-if="canManualRefund"')
    expect(orderDetail).toContain('@click="manualRefund"')
    expect(orderDetail).toContain('补退款')
  })

  it('显示条件走纯函数，三个字段都从订单上取（不自己拼状态）', () => {
    expect(orderDetail).toContain('canManualRefundCustomRecipeOrder({')
    expect(orderDetail).toContain('status: order.value?.status')
    expect(orderDetail).toContain('paymentConfirmedAt: order.value?.paymentConfirmedAt')
    expect(orderDetail).toContain('refundStatus: order.value?.refundStatus')
    // 接口仅管理员，员工不该看到按钮再吃 403
    expect(orderDetail).toContain('isAdmin.value &&')
  })

  it('★ 点下去先二次确认，说明钱会原路退回，并且不能报成成功', () => {
    const start = orderDetail.indexOf('const manualRefund = async')
    const end = orderDetail.indexOf('const viewRecipeFull =')
    expect(start).toBeGreaterThan(-1)
    const block = orderDetail.slice(start, end > start ? end : start + 3000)

    expect(block).toContain('ElMessageBox.prompt(')
    expect(block).toContain("confirmButtonText: '确认退款'")
    expect(block).toContain('原路退款')
    // 退款是钱的事：失败/异常状态不能弹"成功"
    expect(block).toContain('ElMessage.warning')
    expect(block).toContain('微信商户平台核查')
  })

  it('★ 接口调用带订单号与原因（原因可省略，页面给默认值）', () => {
    const start = orderDetail.indexOf('const manualRefund = async')
    const end = orderDetail.indexOf('const viewRecipeFull =')
    const block = orderDetail.slice(start, end > start ? end : start + 3000)

    expect(block).toContain('customRecipeApi.refundOrder(')
    expect(block).toContain('order.value!.orderId')
    expect(block).toContain("value || '客服补退款'")
  })

  it('★ 回显退款结果状态，并刷新详情（退款块/按钮随之更新）', () => {
    const start = orderDetail.indexOf('const manualRefund = async')
    const end = orderDetail.indexOf('const viewRecipeFull =')
    const block = orderDetail.slice(start, end > start ? end : start + 3000)

    expect(block).toContain('getCustomRecipeRefundStatusText(status)')
    // 已退过（幂等复用）要换措辞，不能假装又退了一笔
    expect(block).toContain('result?.reused')
    expect(block).toContain('await loadOrderDetail()')
    expect(block).toContain("emit('refresh')")
  })

  it('★ API 层：POST 到 /admin/custom-recipe/orders/:orderId/refund，body 带 reason', () => {
    expect(customRecipeApiSource).toContain(
      'refundOrder: (orderId: string, reason?: string)',
    )
    expect(customRecipeApiSource).toContain('`${BASE}/orders/${orderId}/refund`')
    expect(customRecipeApiSource).toContain('CustomRecipeRefundResult')
    // 与后端返回字段对齐
    for (const field of [
      'orderId',
      'status',
      'amount',
      'outRefundNo',
      'refundId',
      'reused',
    ]) {
      expect(customRecipeApiSource).toContain(`${field}:`)
    }
  })
})
