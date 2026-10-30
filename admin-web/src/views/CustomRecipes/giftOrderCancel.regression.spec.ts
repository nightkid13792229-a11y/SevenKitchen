import { describe, expect, it } from 'vitest'

/**
 * 0 元赠送单的「取消赠送订单」按钮（2026-10-28）
 *
 * ## 背景（线上真实卡点）
 *
 * 代客单是线下收款，页面有一条硬规则：线下单不能走「取消订单」，
 * 否则会误调微信原路退款（微信里根本没有这笔钱）。
 *
 * 但 **0 元赠送单**没有实收金额：它没有款可退，线下退款弹窗本来就不显示。
 * 2026-10-21 把按钮文案改成「取消赠送订单」并放出了按钮，却**没有改
 * 点击时的拦截条件** —— 点击处理仍无条件拦下所有线下单。
 *
 * 结果：按钮能点，点了只弹「请使用线下退款并取消」，而那个按钮因为
 * 实收为 0 根本不出现 —— 用户永远取消不掉这张单。
 *
 * ## 这里锁两件事
 *
 *   ① 规则本身：只有「实收 > 0 的线下单」才必须走线下退款；
 *   ② 页面接线：按钮可见性与点击处理共用同一条规则，不能再各写一份。
 */
import { shouldUseOfflineRefundForCancel } from '@/constants/customRecipeOrder'
import orderDetail from '@/views/CustomRecipes/OrderDetail.vue?raw'

describe('0 元赠送单 · 直接取消的判定', () => {
  it('0 元赠送单直接取消，不要求线下退款', () => {
    expect(shouldUseOfflineRefundForCancel(true, 0)).toBe(false)
  })

  it('线下实收 > 0 必须走「线下退款并取消」', () => {
    expect(shouldUseOfflineRefundForCancel(true, 500)).toBe(true)
  })

  it('线上单 / 未收款单不受线下退款限制', () => {
    expect(shouldUseOfflineRefundForCancel(false, 0)).toBe(false)
    expect(shouldUseOfflineRefundForCancel(false, 500)).toBe(false)
  })

  it('异常金额（NaN）不拦直接取消，避免脏数据把按钮锁死', () => {
    expect(shouldUseOfflineRefundForCancel(true, Number.NaN)).toBe(false)
  })
})

describe('0 元赠送单 · 页面接线', () => {
  it('按钮可见性与点击处理共用同一条规则', () => {
    expect(orderDetail).toContain('shouldUseOfflineRefundForCancel(')
    // 点击处理不能再无条件拦下所有线下单（旧 bug 的原句）
    expect(orderDetail).not.toContain('if (isOfflinePaidOrder.value) {')
  })

  it('赠送单的确认文案说明不会调用微信退款', () => {
    expect(orderDetail).toContain('没有款可退，不会调用微信退款')
  })
})
