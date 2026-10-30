import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * 顾客「我的订单」已并入「我的补剂订单」：一个列表管两类订单、一套状态筛选。
 *
 * 这些断言锁的是"合并口径"本身——状态分组、类型标记、筛选互不污染，
 * 以及补剂那套支付流程必须复用而不是另写一套。
 */
function readPage(pagePath: string) {
  return readFileSync(resolve(process.cwd(), pagePath), 'utf-8')
}

describe('我的订单合并补剂订单', () => {
  const source = readPage('src/pages/orders-list/index.vue')
  const template = source.slice(0, source.indexOf('<script setup'))
  const meSource = readPage('src/pages/me/index.vue')

  it('状态筛选精简为 6 个，并按订单类型换词（2026-10-24）', () => {
    // 全部 / 待付款 / 进行中 / 待收货·待确认 / 已完成 / 售后中
    expect(source).toMatch(
      /'ALL',\s*'PENDING_PAYMENT',\s*'IN_PROGRESS',\s*'WAIT_RECEIVE',\s*'COMPLETED',\s*'AFTERSALE'/,
    )
    // 同一档位在三种订单上的说法不同
    expect(source).toContain("IN_PROGRESS: '制作中'")
    expect(source).toContain("WAIT_RECEIVE: '待收货'")
    expect(source).toContain("IN_PROGRESS: '分装中'")
    expect(source).toContain("IN_PROGRESS: '定制中'")
    expect(source).toContain("WAIT_RECEIVE: '待确认'")

    // 旧的七档文案不再作为 Tab 出现
    expect(source).not.toContain("label: '未付款'")
    expect(source).not.toContain("label: '已付款'")
    expect(source).not.toContain("label: '已发货'")
    expect(source).not.toContain("label: '已取消'")
  })

  it('鲜食状态分组原样保留，补剂补上 PACKING / PACKED', () => {
    // 鲜食那套映射是被后端归并好的既有口径，合并时不许被改动
    expect(source).toContain(
      "IN_PROGRESS: ['PAID', 'PURCHASING', 'IN_PRODUCTION', 'FREEZING']",
    )
    // 补剂的已付款段位包含"待分装 / 分装中 / 待发货"
    expect(source).toContain("IN_PROGRESS: ['PAID', 'PACKING', 'PACKED']")
    // 两组映射分别按订单类型取用，避免补剂状态漏进鲜食筛选
    /**
     * 2026-10-18：加了定制单，分发变成三分支。
     * 这条守卫的**意图不变** —— 三种单的状态名不同，不能互相套用分组
     * （否则"已付款"会被错算成"制作中"）。
     */
    expect(source).toContain('CUSTOM_STATUS_GROUPS')
    expect(source).toContain('SUPPLEMENT_STATUS_GROUPS')
    expect(source).toContain('FOOD_STATUS_GROUPS')
    expect(source).toContain("orderType === 'custom'")
  })

  it('两类订单都打上类型标记，并按 createdAt 混排倒序', () => {
    expect(source).toContain("_orderType: 'food' as const")
    expect(source).toContain("_orderType: 'supplement' as const")
    expect(source).toContain('mergeOrdersByCreatedAtDesc')
    // 倒序：后发生的排前面；不做"先鲜食后补剂"的拼接
    expect(source).toMatch(
      /toCreatedAtTime\(b\.createdAt\) - toCreatedAtTime\(a\.createdAt\)/,
    )
  })

  it('一次拉全两类订单：鲜食 /orders + 补剂分页翻到底', () => {
    expect(source).toContain("url: apiUrl,")
    expect(source).toContain('fetchSupplementOrders(')
    expect(source).toContain('fetchAllSupplementOrders')
    expect(source).toContain('SUPPLEMENT_ORDER_PAGE_SIZE')
    // 2026-10-25：viewAll 是管理员测试视图，补剂也要把当前管理员自己的测试单带进来
    expect(source).not.toMatch(
      /viewAllOrders\.value\s*\n?\s*\? Promise\.resolve\(\[\]\)/,
    )
    expect(template).toContain('全部顾客鲜食')
    expect(template).toContain('我的测试单')
  })

  it('补剂卡片展示订单号、概要、金额与状态，并复用补剂自己的支付流程', () => {
    expect(template).toContain('order.orderNo')
    expect(template).toContain('formatSupplementSummary(order)')
    expect(template).toContain('formatAmount(order.totalAmount)')
    expect(template).toContain('formatShortDateTime(order.createdAt)')
    expect(template).toContain('order-type-tag')

    // 未付款才给「去支付」，且必须走 runSupplementPayment（含"转人工确认"降级）
    expect(source).toContain("import { runSupplementPayment } from '../../utils/supplement-payment'")
    expect(template).toContain('paySupplementFromList(order)')
    expect(source).toContain('await runSupplementPayment(order.id)')
    expect(template).toContain('order.status === \'PENDING_PAYMENT\'')
  })

  it('补剂有详情页：卡片和「查看详情」都跳转；鲜食点击行为不变', () => {
    expect(source).toContain('function viewSupplementDetail')
    expect(source).toContain('url: `/pages/supplement-order-detail/index?orderId=')
    expect(source).toContain('function handleOrderTap(order: UnifiedOrder)')
    expect(source).toContain("_orderType === 'supplement'")
    expect(source).toContain('viewOrder(order.id)')
    expect(source).toContain('url: `/pages/order-detail/index?id=${orderId}`')
  })

  it('「我的」页移除补剂订单独立入口，制作单入口保留', () => {
    const meTemplate = meSource.slice(0, meSource.indexOf('<script setup'))

    expect(meTemplate).not.toContain('我的补剂订单')
    expect(meSource).not.toContain('goToSupplementOrders')
    expect(meTemplate).toContain('我的订单')
    expect(meTemplate).toContain('我的制作单')
  })

  it('补剂下单结果直达补剂订单详情页，统一列表仍能查看补剂订单', () => {
    // 2026-10-21：结果页从"补剂订单列表"改到"补剂订单详情"，两条支付成功路径都要跟上。
    // 顾客的补剂订单列表入口已并入「我的订单」，但详情页仍是下单后的落点。
    const purchaseSource = readPage('src/pages/supplement-order/index.vue')
    const redirectCount = [
      ...purchaseSource.matchAll(/uni\.redirectTo\(\{ url: `\/pages\/supplement-order-detail\/index\?orderId=/g),
    ].length
    expect(redirectCount).toBe(2)

    const pagesJson = readPage('src/pages.json')
    expect(pagesJson).toContain('pages/supplement-order-detail/index')
    // 合并后的「我的订单」仍要拉补剂订单
    expect(source).toContain('fetchSupplementOrders(')
  })
})
