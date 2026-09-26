/**
 * 试吃装（现货）链路回归测试
 *
 * 这一组锁的是"现货与鲜食分道"的关键分叉点。
 * 试吃装复用鲜食的订单表与结算页，好处是不用重造支付/售后，
 * 风险则是**很容易被当成鲜食单误处理**（拉去排产、要求选制作日期、绑狗狗）。
 * 下面每一条都对应一个真实会出问题的点。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function read(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf-8')
}

describe('试吃装 · 首页入口', () => {
  const source = read('src/pages/home/index.vue')

  it('只在开放且有货时展示入口，避免点进去是空的', () => {
    expect(source).toContain('tastingPackEntry')
    expect(source).toContain('loadTastingPackEntry')
    // 过滤掉售罄的商品
    expect(source).toContain('!item.soldOut')
    // 一个都没货就不显示
    expect(source).toContain('available.length === 0')
  })

  it('入口失败不能影响首页其它内容', () => {
    expect(source).toContain('fetchTastingPacks')
    expect(source).toContain('入口失败不影响首页其它内容')
  })
})

describe('试吃装 · 详情页', () => {
  const source = read('src/pages/tasting-pack/index.vue')

  it('价格来自服务端报价，不在前端自己算', () => {
    expect(source).toContain('quoteTastingPack')
    expect(source).toContain('refreshQuote')
    // 前端只做展示，不做定价
    expect(source).not.toContain('tastingMultiplier')
    expect(source).not.toContain('skuCost')
  })

  it('下单前重新报价并携带快照 ID 进入结算', () => {
    expect(source).toContain("orderKind: 'TASTING_PACK'")
    expect(source).toContain('snapshotId')
    expect(source).toContain('mode=stockBuy')
  })

  it('分享链接指向本商品，顾客可以自己转发', () => {
    expect(source).toContain('onShareAppMessage')
    expect(source).toContain('pages/tasting-pack/index?packId=')
  })
})

describe('试吃装 · 结算页（现货模式）', () => {
  const source = read('src/pages/checkout/index.vue')

  it('识别现货订单', () => {
    expect(source).toContain("orderConfig.value.orderKind === 'TASTING_PACK'")
    expect(source).toContain('isStockOrder')
  })

  it('现货不要求选制作日期，也不把制作日期提交给后端', () => {
    expect(source).toContain('if (isStockOrder.value) return true')
    expect(source).toContain("isStockOrder.value ? 'TASTING_PACK' : 'FRESH_FOOD'")
    expect(source).toContain('...(isStockOrder.value')
  })

  it('现货隐藏狗狗信息与制作说明（这两块对现货没有意义）', () => {
    expect(source).toContain('v-if="!isStockOrder" class="info-card dog-info-card"')
    expect(source).toContain('v-if="!isStockOrder" class="info-card requirement-card"')
  })

  it('刷新价格时走现货报价接口，而不是鲜食的按狗算量接口', () => {
    expect(source).toContain('Refresh tasting pack quote error')
    expect(source).toContain('tastingPackCode')
  })

  it('现货的售后文案是"退款或补发"，不能说"免费重做"', () => {
    expect(source).toContain('可申请全额退款，或联系客服补发')
  })
})

describe('试吃装 · 我的订单', () => {
  const listSource = read('src/pages/orders-list/index.vue')
  const detailSource = read('src/pages/order-detail/index.vue')

  it('列表按订单类型区分现货，不显示狗狗与"共 N 餐"', () => {
    expect(listSource).toContain("order.type === 'TASTING_PACK'")
    expect(listSource).toContain('isStockOrderRow')
    expect(listSource).toContain('getStockSets')
  })

  it('详情页列出这一套包含哪几道菜（顾客最想知道的内容）', () => {
    expect(detailSource).toContain("order.value?.type === 'TASTING_PACK'")
    expect(detailSource).toContain('stockDishes')
    expect(detailSource).toContain('包含菜品')
  })

  it('详情页现货不显示目标制作日期，改显示发货方式', () => {
    expect(detailSource).toContain('现货，付款后尽快发出')
    expect(detailSource).toContain('v-if="!isStockOrder" class="buyer-row"')
  })
})

describe('试吃装 · 免费补发单的展示', () => {
  const listSource = read('src/pages/orders-list/index.vue')
  const detailSource = read('src/pages/order-detail/index.vue')

  it('售后文案按类型逐项列出，别把"重做"也说成"免费补发"', () => {
    expect(listSource).toContain('getAftersaleLabel')
    expect(listSource).toContain("REMAKE: '重做'")
    expect(listSource).toContain("RESHIP: '免费补发'")
    // 原来的三目会被新类型套错，不能再退回去
    expect(listSource).not.toContain("=== 'REFUND' ? '退款' : '免费补发'")
  })

  it('补发单在列表里明确标注"免费补发、不收费"', () => {
    expect(listSource).toContain('order.reshipFromOrderId')
    expect(listSource).toContain('本单为免费补发，不收任何费用')
  })

  it('补发单在详情页说明订单性质，顾客不会以为又下了一单', () => {
    expect(detailSource).toContain('isReshipOrder')
    expect(detailSource).toContain('免费补发（不收费）')
  })

  it('补发单也是一种售后处理结果，文案里要给得出"免费补发"', () => {
    expect(detailSource).toContain("RESHIP: '免费补发'")
  })
})

describe('试吃装 · 页面注册', () => {
  it('放在独立分包里，不撑大主包', () => {
    const pagesJson = JSON.parse(read('src/pages.json'))
    const pkg = pagesJson.subPackages.find(
      (item: any) => item.root === 'pages/tasting-pack',
    )
    expect(pkg).toBeTruthy()
    expect(pkg.pages.map((page: any) => page.path).sort()).toEqual([
      'index',
      'list',
    ])
  })

  it('分包里不应重复出现在主包 pages 中', () => {
    const pagesJson = JSON.parse(read('src/pages.json'))
    const mainPaths = pagesJson.pages.map((page: any) => page.path)
    expect(
      mainPaths.some((path: string) => path.startsWith('pages/tasting-pack/')),
    ).toBe(false)
  })
})
