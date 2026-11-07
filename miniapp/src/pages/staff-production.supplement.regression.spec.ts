import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const productionSource = readFileSync(
  resolve(__dirname, 'staff-production/index.vue'),
  'utf8',
)
const packingSource = readFileSync(
  resolve(__dirname, 'staff-production/components/SupplementPacking.vue'),
  'utf8',
)
const pagesConfig = JSON.parse(
  readFileSync(resolve(__dirname, '../pages.json'), 'utf8'),
)

describe('生产管理 · 鲜食 / 补剂分装共用入口', () => {
  it('顶部提供「鲜食生产 / 补剂分装」切换，默认停在鲜食', () => {
    expect(productionSource).toContain("label: '鲜食生产'")
    expect(productionSource).toContain("label: '补剂分装'")
    expect(productionSource).toContain("ref<ProductionMode>('FRESH')")
    expect(productionSource).toContain(
      "v-show=\"activeMode === 'FRESH'\" class=\"mode-panel\"",
    )
    expect(productionSource).toContain(
      "v-show=\"activeMode === 'SUPPLEMENT'\" class=\"mode-panel\"",
    )
  })

  it('补剂面板就是原来的分装备料，整块挂在生产管理页里', () => {
    expect(productionSource).toContain('<SupplementPacking')
    expect(packingSource).toContain("url: '/admin/supplement-shop/packing-summary'")
    expect(packingSource).toContain('data: { date: date.value }')
    expect(packingSource).toContain('v-for="order in orders"')
    expect(packingSource).toContain('{{ order.orderNo }}')
    expect(packingSource).toContain('{{ order.bagCount }}')
  })

  it('看板直接提供「打印标签」入口，但仍不在这里做发货/分装工单', () => {
    expect(packingSource).toContain('打印标签')
    expect(packingSource).toContain('openLabels')
    expect(packingSource).toContain(
      'url: `/pages/staff-supplement-orders/labels?id=${encodeURIComponent(order.id)}`',
    )
    expect(packingSource).toContain('@tap.stop="openLabels(order)"')
    expect(packingSource).not.toContain('去发货')
    expect(packingSource).not.toContain('openShip')
    expect(packingSource).not.toContain('开始分装')
    expect(packingSource).not.toContain('继续分装')
    expect(packingSource).not.toContain('openPack')
  })

  it('点订单行进补剂订单详情，并保留「全部补剂订单」兜底入口', () => {
    expect(packingSource).toContain('/pages/staff-supplement-orders/detail?id=')
    expect(packingSource).toContain('/pages/staff-supplement-orders/index')
    expect(packingSource).toContain('这天没有待发货的订单')
    expect(packingSource).toContain('去看全部补剂订单')
    expect(packingSource).toContain('全部补剂订单 ›')
    expect(packingSource).not.toContain('&action=ship')
  })

  it('补剂面板在组件里，靠父页面 onShow 手动刷新，避免返回后状态还是旧的', () => {
    expect(packingSource).toContain('defineExpose({ refresh: load })')
    expect(packingSource).toContain('onMounted(load)')
    expect(packingSource).not.toContain("from '@dcloudio/uni-app'")
    expect(productionSource).toContain('supplementRef.value?.refresh?.()')
    expect(productionSource).toContain("activeMode.value === 'SUPPLEMENT'")
  })

  it('补剂待处理数会显示在切换上，并回传给工作台的角标思路一致', () => {
    expect(packingSource).toContain("emit('count'")
    expect(productionSource).toContain('@count="onSupplementCount"')
    expect(productionSource).toContain('supplementCount')
  })

  it('补剂面板加载失败时给重试，不把失败显示成「这天没有订单」', () => {
    expect(packingSource).toContain('loadError')
    expect(packingSource).toContain('没取到')
    expect(packingSource).toContain('@tap="load"')
    expect(packingSource).toContain('v-else-if="loadError')
    expect(packingSource).toContain('orders.length === 0 && !loadError')
  })

  it('★ 旧的「分装备料」独立页和路由已撤掉，不留死页面', () => {
    expect(existsSync(resolve(__dirname, 'staff-supplement-summary/index.vue'))).toBe(
      false,
    )
    expect(
      pagesConfig.pages.map((page: { path: string }) => page.path),
    ).not.toContain('pages/staff-supplement-summary/index')
  })
})
