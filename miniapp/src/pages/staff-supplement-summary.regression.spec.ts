import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(
  resolve(__dirname, 'staff-supplement-summary/index.vue'),
  'utf8',
)
const pagesConfig = JSON.parse(
  readFileSync(resolve(__dirname, '../pages.json'), 'utf8'),
)

describe('分装备料页 · 订单清单只负责查看和进详情', () => {
  it('仍然按发货日取汇总，接口不变', () => {
    // 这个接口已经会返回 orders[]，不要为了列表另开一个重复接口
    expect(source).toContain("url: '/admin/supplement-shop/packing-summary'")
    expect(source).toContain('data: { date: date.value }')
  })

  it('渲染当天订单，不再只有总量和包材', () => {
    expect(source).toContain('data.value?.orders')
    expect(source).toContain('v-for="order in orders"')
    expect(source).toContain('{{ order.orderNo }}')
    expect(source).toContain('{{ order.bagCount }}')
  })

  it('这一页不再放打印标签/去发货按钮，功能只留在订单详情页', () => {
    expect(source).not.toContain('打印标签')
    expect(source).not.toContain('去发货')
    expect(source).not.toContain('openLabels')
    expect(source).not.toContain('openShip')
    expect(source).not.toContain('开始分装')
    expect(source).not.toContain('继续分装')
    expect(source).not.toContain('openPack')
  })

  it('点订单行进补剂订单详情；不再直接跳标签页/发货弹窗', () => {
    // 路径写错不会编译报错，只会线上点不动 —— 所以钉死
    expect(source).toContain('/pages/staff-supplement-orders/detail?id=')
    expect(source).toContain('/pages/staff-supplement-orders/index')
    expect(source).not.toContain('/pages/staff-supplement-orders/labels?id=')
    expect(source).not.toContain('&action=ship')
  })

  it('没有当天订单时，给出「全部补剂订单」的兜底入口', () => {
    // 刚下单但还没确认收款 / 还没排期时，packingDate 是空的，
    // 这一屏按分装日查不到它；必须能一键去全部订单里找。
    expect(source).toContain('这天没有待发货的订单')
    expect(source).toContain('去看全部补剂订单')
    expect(source).toContain('全部补剂订单 ›')
  })

  it('从分装/发货详情返回时刷新，避免状态还停在旧值', () => {
    expect(source).toContain("import { onShow } from '@dcloudio/uni-app'")
    expect(source).toContain('onShow(load)')
    expect(source).not.toContain('onMounted(load)')
  })

  it('页面标题与工作台入口一致，都叫「分装备料」', () => {
    const page = pagesConfig.pages.find(
      (item: { path: string }) => item.path === 'pages/staff-supplement-summary/index',
    )
    expect(page?.style?.navigationBarTitleText).toBe('分装备料')
  })
})
