import { describe, expect, it } from 'vitest'
/**
 * 订单中心合并定制订单（2026-10-21）
 *
 * 背景：定制单原来有一套独立的列表页 + 详情页；老板要求统一到订单中心，
 * 定制详情改成抽屉，避免同一张单在后台有两个入口、两套状态文案。
 *
 * admin-web 的 vitest 是 node 环境（没有 jsdom），页面挂不起来，
 * 所以接线用 `?raw` 读源码断言；真正的算法在 constants / utils 里由单测覆盖。
 *
 * ⚠️ 用 Vite 的 `?raw`，不要用 `node:fs`：构建时 tsconfig 没有 node 类型。
 */
import page from '@/views/OrderCenter/index.vue?raw'
import routerSource from '@/router/index.ts?raw'
import aftersalePage from '@/views/CustomRecipes/AftersaleList.vue?raw'
import aftersaleCenterSource from '@/views/AftersaleCenter/index.vue?raw'
import settingsPricingSource from '@/views/Settings/Pricing.vue?raw'

/** 剥注释后再断言 —— 注释里常引用被删掉的旧实现（本项目栽过多次） */
function stripComments(source: string): string {
  return source
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
}

describe('订单中心 · 定制订单走抽屉', () => {
  const clean = stripComments(page)

  it('★ CUSTOM_RECIPE 的「查看」打开订单详情抽屉，不再跳独立列表', () => {
    expect(clean).toContain("import OrderDetail from '@/views/CustomRecipes/OrderDetail.vue'")
    expect(clean).toContain('<el-drawer')
    expect(clean).toContain(':order-id="customDrawerOrderId"')
    expect(clean).toContain('openCustomOrder(row.orderNo)')
    expect(clean).not.toContain("router.push({ path: '/custom-recipes'")
  })

  it('★ 深链带 orderId 时，列表加载完自动打开抽屉', () => {
    expect(clean).toContain('route.query.orderId')
    expect(clean).toContain('await load()')
    expect(clean).toContain('openCustomOrder(initialOrderId)')
    // 只在定制类型下自动开，避免 FOOD/补剂的 orderId 误开定制抽屉
    expect(clean).toContain("query.type === 'CUSTOM_RECIPE'")
  })

  it('鲜食 / 补剂的跳转保持不变', () => {
    expect(clean).toContain('router.push(`/orders/${row.id}`)')
    expect(clean).toContain("path: '/supplement-shop/orders'")
  })
})

describe('订单中心 · 类型与子类型（2026-10-21）', () => {
  const clean = stripComments(page)

  it('★ 定制类型改叫「食谱定制」', () => {
    expect(clean).toContain("if (type === 'CUSTOM_RECIPE') return '食谱定制'")
    expect(clean).toContain('食谱定制 {{ counts.CUSTOM_RECIPE }}')
    expect(clean).toContain('value="CUSTOM_RECIPE">食谱定制</el-radio-button>')
  })

  it('★ 三类订单用不同颜色的类型标签', () => {
    expect(clean).toContain('typeTagType(row.type)')
    expect(clean).toContain("if (type === 'FOOD') return 'success'")
    expect(clean).toContain("if (type === 'CUSTOM_RECIPE') return 'warning'")
    expect(clean).toContain("return 'primary'")
  })

  it('★ 定制 / 补剂不再显示重复子类型，鲜食子类型保留', () => {
    expect(clean).toContain('showSubtype(row)')
    expect(clean).toContain("return row.type === 'FOOD' && Boolean(row.subtypeLabel)")
    expect(clean).not.toContain('<div v-if="row.subtypeLabel"')
  })
})

describe('订单中心 · 定制状态显示原始状态', () => {
  const clean = stripComments(page)

  it('★ 已付款 / 制作中 / 已交付不从统一状态组取「处理中」', () => {
    expect(clean).toContain('displayStatusLabel(row)')
    expect(clean).toContain("PAID: '已付款'")
    expect(clean).toContain("IN_PROGRESS: '制作中'")
    expect(clean).toContain("DELIVERED: '已交付'")
    expect(clean).toContain("row.type === 'CUSTOM_RECIPE'")
    expect(clean).toContain('CUSTOM_RAW_STATUS_LABELS')
  })

  it('其他订单仍用后端下发的 statusLabel', () => {
    expect(clean).toContain('return row.statusLabel')
  })

  it('定制状态标签按原始状态上色，不沿用统一组颜色', () => {
    expect(clean).toContain('statusTagTypeForRow(row)')
    expect(clean).toContain("case 'PAID':")
    expect(clean).toContain("case 'DELIVERED':")
  })
})

describe('订单中心 · 内部测试账号标记（2026-10-21）', () => {
  const clean = stripComments(page)

  it('★ 顾客列用后端 customerRole 判断是否内部账号', () => {
    expect(clean).toContain('isInternalCustomerRole(row.customerRole)')
    expect(clean).toContain('INTERNAL_CUSTOMER_BADGE')
    expect(clean).toContain('internal-tag')
  })

  it('★ 只有非 CUSTOMER 才打标，判断集中在工具函数', () => {
    expect(clean).not.toContain("row.customerRole !== 'CUSTOMER'")
    expect(clean).toContain("from '@/utils/customerRole'")
  })
})

describe('路由与售后入口（2026-10-21）', () => {
  const cleanRouter = stripComments(routerSource)
  const cleanAftersale = stripComments(aftersalePage)

  it('★ /custom-recipes 重定向到订单中心，不再挂 OrderList', () => {
    expect(cleanRouter).toContain('redirect: "/order-center?type=CUSTOM_RECIPE"')
    expect(cleanRouter).not.toContain('CustomRecipes/OrderList.vue')
    // 排期仍在；售后 / 设置已并入容器页（2026-10-30 导航整理）
    expect(cleanRouter).toContain('CustomRecipes/ScheduleCalendar.vue')
    expect(aftersaleCenterSource).toContain('CustomRecipes/AftersaleList.vue')
    expect(settingsPricingSource).toContain('CustomRecipes/Config.vue')
  })

  it('★ 售后「查看订单」深链到订单中心抽屉', () => {
    expect(cleanAftersale).toContain('/order-center?type=CUSTOM_RECIPE&orderId=')
    expect(cleanAftersale).toContain('encodeURIComponent(orderId)')
    expect(cleanAftersale).not.toContain('`/custom-recipes/${encodeURIComponent(orderId)}`')
  })
})
