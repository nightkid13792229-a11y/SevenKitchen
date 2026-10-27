import { describe, expect, it } from 'vitest'
import orderDetail from '@/views/CustomRecipes/OrderDetail.vue?raw'
import customRecipeApiSource from '@/api/customRecipe.ts?raw'
import {
  canManualRefundCustomRecipeOrder,
  canOfflineRefundCustomRecipeOrder,
  getCustomRecipeOfflineRefundMethodText,
  isOfflinePaidCustomRecipeOrder,
} from '@/constants/customRecipeOrder'

/**
 * 后台「线下退款并取消」的接线回归（2026-10-21 · 代客定制食谱订单 Task 5）。
 *
 * ## 必须防住的 bug
 *
 * 代客单线下收款、订单状态却是 PAID。原来的「取消订单 / 补退款」会调用
 * 微信原路退款 —— 微信里根本没有这笔支付。所以线下单必须：
 *   ① 不显示会调微信退款的两个入口；
 *   ② 改走「线下退款并取消」弹窗（金额默认实收、方式、备注）；
 *   ③ 调新接口登记，**不调用微信退款**，成功后刷新详情。
 *
 * 纯函数在这里真跑；页面接线用 `?raw` 断言（后台 vitest 是 node 环境，
 * Element Plus 页面挂不起来，沿用 manualRefund.regression.spec.ts 的做法）。
 */
describe('后台 · 线下退款并取消', () => {
  it('★ 线下收款判定：三个线下渠道都算，线上/老订单不算', () => {
    for (const paymentChannel of [
      'OFFLINE_WECHAT',
      'OFFLINE_ALIPAY',
      'OTHER',
    ]) {
      expect(
        isOfflinePaidCustomRecipeOrder({
          paymentChannel,
          paymentConfirmedAt: '2026-10-21T02:00:00.000Z',
        }),
      ).toBe(true)
    }

    expect(
      isOfflinePaidCustomRecipeOrder({
        paymentChannel: 'WECHAT_ONLINE',
        paymentConfirmedAt: '2026-10-21T02:00:00.000Z',
      }),
    ).toBe(false)

    // 老的自助单没有渠道记录，但它们确实走过微信支付，仍按线上处理
    expect(
      isOfflinePaidCustomRecipeOrder({
        paymentChannel: null,
        paymentConfirmedAt: '2026-10-21T02:00:00.000Z',
      }),
    ).toBe(false)
  })

  it('★ 代客单即使漏了收款渠道，只要已确认收款也必须按线下处理', () => {
    expect(
      isOfflinePaidCustomRecipeOrder({
        orderSource: 'ASSISTED',
        paymentConfirmedAt: '2026-10-21T02:00:00.000Z',
      }),
    ).toBe(true)

    // 没收款就没有退款可登记，不能当成线下已付款
    expect(
      isOfflinePaidCustomRecipeOrder({
        orderSource: 'ASSISTED',
        paymentConfirmedAt: null,
      }),
    ).toBe(false)
  })

  it('★ 只有"线下已收款 + 仍可取消 + 未登记过"才显示线下退款入口', () => {
    const paidOffline = {
      status: 'PAID',
      paymentConfirmedAt: '2026-10-21T02:00:00.000Z',
      paymentChannel: 'OFFLINE_WECHAT',
      orderSource: 'ASSISTED',
    }

    expect(canOfflineRefundCustomRecipeOrder(paidOffline)).toBe(true)

    expect(
      canOfflineRefundCustomRecipeOrder({
        ...paidOffline,
        status: 'PENDING_PAYMENT',
        paymentConfirmedAt: null,
      }),
    ).toBe(false)

    expect(
      canOfflineRefundCustomRecipeOrder({
        ...paidOffline,
        paymentChannel: 'WECHAT_ONLINE',
        orderSource: 'SELF',
      }),
    ).toBe(false)

    for (const status of ['CANCELLED', 'DELIVERED', 'COMPLETED']) {
      expect(
        canOfflineRefundCustomRecipeOrder({ ...paidOffline, status }),
      ).toBe(false)
    }

    expect(
      canOfflineRefundCustomRecipeOrder({
        ...paidOffline,
        offlineRefundedAt: '2026-10-21T03:00:00.000Z',
      }),
    ).toBe(false)
    expect(
      canOfflineRefundCustomRecipeOrder({
        ...paidOffline,
        cancelledAt: '2026-10-21T03:00:00.000Z',
      }),
    ).toBe(false)
  })

  it('★ 线下单不再显示微信「补退款」；线上单保持原判', () => {
    const offlineCancelled = {
      status: 'CANCELLED',
      paymentConfirmedAt: '2026-10-21T02:00:00.000Z',
      refundStatus: null,
      paymentChannel: 'OFFLINE_WECHAT',
      orderSource: 'ASSISTED',
    }
    expect(canManualRefundCustomRecipeOrder(offlineCancelled)).toBe(false)

    const onlineCancelled = {
      status: 'CANCELLED',
      paymentConfirmedAt: '2026-10-21T02:00:00.000Z',
      refundStatus: 'FAILED',
      paymentChannel: 'WECHAT_ONLINE',
      orderSource: 'SELF',
    }
    expect(canManualRefundCustomRecipeOrder(onlineCancelled)).toBe(true)
  })

  it('退款方式中文可读，不把英文枚举甩给客服', () => {
    expect(getCustomRecipeOfflineRefundMethodText('OFFLINE_WECHAT')).toBe(
      '线下微信退款',
    )
    expect(getCustomRecipeOfflineRefundMethodText('OFFLINE_ALIPAY')).toBe(
      '线下支付宝退款',
    )
    expect(getCustomRecipeOfflineRefundMethodText('OTHER')).toBe(
      '其他线下方式退款',
    )
    expect(getCustomRecipeOfflineRefundMethodText(null)).toBe('未记录')
  })

  it('★ 详情页：线下单显示「线下退款并取消」，不再走取消/补退款入口', () => {
    expect(orderDetail).toContain('线下退款并取消')
    expect(orderDetail).toContain('v-if="canOfflineRefund"')
    expect(orderDetail).toContain('@click="openOfflineRefundDialog"')
    expect(orderDetail).toContain('v-if="canCancelOrder"')
    // 取消入口只排除「实收 > 0 的线下单」；0 元赠送单仍可直接取消
    expect(orderDetail).toContain('!shouldUseOfflineRefundForCancel(')
  })

  it('★ 旧「取消订单」逻辑里再兜一层：线下已收款的单不去调微信退款', () => {
    const start = orderDetail.indexOf('const cancelOrder = async')
    const end = orderDetail.indexOf('const resolveDefaultOfflineRefundMethod')
    expect(start).toBeGreaterThan(-1)
    const block = orderDetail.slice(start, end > start ? end : start + 2000)

    expect(block).toContain('shouldUseOfflineRefundForCancel(')
    expect(block).toContain('offlineRefundCap.value')
    expect(block).toContain('系统不会调用微信退款')
    expect(block).toContain('return')
  })

  it('★ 弹窗三个字段齐全：金额（默认实收）、方式、备注；并说明是手工退款', () => {
    expect(orderDetail).toContain('offlineRefundDialogVisible')
    expect(orderDetail).toContain('offlineRefundForm.amount')
    expect(orderDetail).toContain('offlineRefundForm.method')
    expect(orderDetail).toContain('offlineRefundForm.note')
    expect(orderDetail).toContain('CUSTOM_RECIPE_OFFLINE_REFUND_METHOD_OPTIONS')
    // 默认金额 = 实收（缺失时退回订单金额）
    expect(orderDetail).toContain('amount: offlineRefundCap.value')
    expect(orderDetail).toContain('actualPaidAmount')
    // 必须让操作的人知道这是手工退款
    expect(orderDetail).toContain('这是手工退款，不会调用微信退款')
  })

  it('★ 提交走新接口，成功后刷新详情；失败不吞', () => {
    const start = orderDetail.indexOf('const submitOfflineRefund = async')
    const end = orderDetail.indexOf('const manualRefund = async')
    expect(start).toBeGreaterThan(-1)
    const block = orderDetail.slice(start, end > start ? end : start + 4000)

    expect(block).toContain('customRecipeApi.registerOfflineRefund(')
    expect(block).toContain('order.value!.orderId')
    expect(block).toContain('退款金额必须大于 0')
    expect(block).toContain('offlineRefundCap.value')
    expect(block).toContain("emit('refresh')")
    expect(block).toContain('await loadOrderDetail()')
    expect(block).toContain('toastApiError(')
    // 不能调微信退款 helper
    expect(block).not.toContain('refundOrder(')
  })

  it('★ 详情页展示线下收款与线下退款登记记录', () => {
    expect(orderDetail).toContain('线下收款')
    expect(orderDetail).toContain('线下退款登记')
    expect(orderDetail).toContain('getCustomRecipePaymentChannelText')
    expect(orderDetail).toContain('getCustomRecipeOfflineRefundMethodText')
    expect(orderDetail).toContain('offlineRefundAmount')
    expect(orderDetail).toContain('offlineRefundByStaffId')
  })

  it('★ API 层：POST /admin/custom-recipe/orders/:orderId/offline-refund', () => {
    expect(customRecipeApiSource).toContain(
      'registerOfflineRefund: (orderId: string, payload: OfflineRefundPayload)',
    )
    expect(customRecipeApiSource).toContain(
      '`${BASE}/orders/${orderId}/offline-refund`',
    )
    expect(customRecipeApiSource).toContain('OfflineRefundResult')
    for (const field of [
      'offlineRefundedAt',
      'offlineRefundAmount',
      'offlineRefundMethod',
      'offlineRefundNote',
      'offlineRefundByStaffId',
    ]) {
      expect(customRecipeApiSource).toContain(`${field}?`)
    }
  })
})
