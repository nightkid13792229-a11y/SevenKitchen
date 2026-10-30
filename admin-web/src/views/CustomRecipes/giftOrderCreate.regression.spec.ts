import { describe, expect, it } from 'vitest'
import page from '@/views/CustomRecipes/AssistedOrderCreate.vue?raw'
import orderList from '@/views/CustomRecipes/OrderList.vue?raw'
import orderDetail from '@/views/CustomRecipes/OrderDetail.vue?raw'
import orderCenter from '@/views/OrderCenter/index.vue?raw'

/**
 * 赠送单的下单入口与展示（2026-10-30）
 *
 * ## 背景（老板反馈）
 *
 * 「想给老客户下一个赠送定制食谱单，不知道该怎么操作。」
 *
 * 原来的页面没有「赠送」这个概念：只能把实收改成 0，再手写一段
 * 「实收差异原因」，收款方式还必须选一个 —— 等于给一笔不存在的钱
 * 登记了渠道，订单上留下「线下微信」这种假信息。
 *
 * 改法：在「报价与收款」最上面先问**结算方式**（正常收款 / 赠送），
 * 赠送只问原因。这里锁住接线，避免下次改版又把它埋回异常分支里。
 */
describe('赠送单 · 下单页', () => {
  it('★ 先选结算方式，赠送是一个正经选项', () => {
    expect(page).toContain('结算方式')
    expect(page).toContain('赠送（0 元）')
    expect(page).toContain('form.payment.isGift')
    expect(page).toContain('onSettlementChange')
  })

  it('★ 赠送分支只问原因和补充说明，不再出现收款方式/实收金额', () => {
    // 正常收款那一整段包在 !isGift 里
    expect(page).toContain('v-if="!form.payment.isGift"')
    // 赠送分支
    expect(page).toContain('ASSISTED_GIFT_REASON_OPTIONS')
    expect(page).toContain('form.payment.giftReason')
    expect(page).toContain('form.payment.giftNote')
    expect(page).toContain('本单金额')
    expect(page).toContain('¥0.00')
  })

  it('★ 报价区明确标「本单赠送」，不让 ¥299 被误读成成交价', () => {
    expect(page).toContain('gift-badge-line')
    expect(page).toContain('本单赠送')
    expect(page).toContain('系统报价仅作记录')
  })

  it('★ 切换结算方式时清理另一侧的脏字段', () => {
    expect(page).toContain('form.payment.overrideReason = \'\'')
    expect(page).toContain('form.payment.externalRef = \'\'')
    expect(page).toContain('form.payment.giftReason = \'\'')
    expect(page).toContain('form.payment.giftNote = \'\'')
  })

  it('★ 报价刷新不会把赠送单的实收改回 299', () => {
    expect(page).toContain('syncAmount && !isGiftOrder.value')
  })

  it('★ 赠送单校验走同一个纯函数，页面不另写一套规则', () => {
    expect(page).toContain('getPaymentValidationError')
    expect(page).toContain('giftReason: form.payment.giftReason')
  })
})

describe('赠送单 · 订单列表', () => {
  it('★ 金额旁边标「赠送」和原因', () => {
    expect(orderList).toContain('row.isGift')
    expect(orderList).toContain('赠送')
    expect(orderList).toContain('getGiftReasonLabel(row.giftReason)')
  })

  it('★ 能按「赠送单 / 正常单」筛选', () => {
    expect(orderList).toContain('filters.gift')
    expect(orderList).toContain('params.isGift = true')
    expect(orderList).toContain('params.isGift = false')
  })
})

describe('赠送单 · 订单详情', () => {
  it('★ 赠送单不显示收款方式，改显示赠送原因', () => {
    expect(orderDetail).toContain('order.isGift')
    expect(orderDetail).toContain('giftReasonText')
    expect(orderDetail).toContain('赠送原因')
  })

  it('★ 0 元赠送单的退款/取消文案仍然保留', () => {
    expect(orderDetail).toContain('0 元赠送单')
    expect(orderDetail).toContain('取消赠送订单')
  })
})

describe('赠送单 · 订单中心（老板实际看的那张列表）', () => {
  it('★ 金额旁标「赠送」，¥0 不会被当成价格异常', () => {
    expect(orderCenter).toContain('row.isGift')
    expect(orderCenter).toContain('赠送')
  })

  it('★ 只在「食谱定制」下提供「只看赠送单」', () => {
    expect(orderCenter).toContain('query.type === \'CUSTOM_RECIPE\'')
    expect(orderCenter).toContain('只看赠送单')
    expect(orderCenter).toContain('query.gift')
  })

  it('★ 切走类型时清掉赠送筛选，避免鲜食列表被筛空', () => {
    expect(orderCenter).toContain('handleTypeChange')
    expect(orderCenter).toContain('query.gift = false')
  })
})
