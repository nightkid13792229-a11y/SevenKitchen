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

  it('筛选项统一成 6 个状态 + 全部，且不再用旧的鲜食口径文案', () => {
    const labels = ['全部', '未付款', '已付款', '已发货', '已完成', '售后中', '已取消']

    labels.forEach((label) => {
      expect(source, `缺少筛选项 ${label}`).toContain(`label: '${label}'`)
    })

    // 旧文案不能残留，否则两个列表会对同一个状态叫两个名字
    expect(source).not.toContain("label: '待付款'")
    expect(source).not.toContain("label: '已付款/制作中'")
    expect(source).not.toContain("label: '待收货'")
    expect(source).not.toContain("label: '已收货'")
    expect(source).not.toContain("label: '已取消/退款'")
  })

  it('鲜食状态分组原样保留，补剂补上 PACKING / PACKED', () => {
    // 鲜食那套映射是被后端归并好的既有口径，合并时不许被改动
    expect(source).toContain(
      "IN_PROGRESS: ['PAID', 'PURCHASING', 'IN_PRODUCTION', 'FREEZING']",
    )
    // 补剂的已付款段位包含"待分装 / 分装中 / 待发货"
    expect(source).toContain("IN_PROGRESS: ['PAID', 'PACKING', 'PACKED']")
    // 两组映射分别按订单类型取用，避免补剂状态漏进鲜食筛选
    expect(source).toContain("orderType === 'supplement' ? SUPPLEMENT_STATUS_GROUPS : FOOD_STATUS_GROUPS")
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
    // 管理员视角只看全部顾客的鲜食订单，不该混进管理员自己的补剂订单
    expect(source).toMatch(/viewAllOrders\.value\s*\n?\s*\? Promise\.resolve\(\[\]\)/)
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

  it('补剂没有详情页，点卡片不跳转；鲜食点击行为不变', () => {
    expect(source).toContain('function handleOrderTap(order: UnifiedOrder)')
    expect(source).toContain("if (order._orderType !== 'food') return")
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

  it('补剂订单页仍可从购买结果页进入，不算死页面', () => {
    // 合并的是顾客入口；下单成功后的「查看订单」还指向这个页面，所以先不删
    const purchaseSource = readPage('src/pages/supplement-order/index.vue')
    expect(purchaseSource).toContain("uni.redirectTo({ url: '/pages/supplement-orders/index' })")

    const pagesJson = readPage('src/pages.json')
    expect(pagesJson).toContain('pages/supplement-orders/index')
  })
})
