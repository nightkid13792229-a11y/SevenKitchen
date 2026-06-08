import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function readPage(pagePath: string) {
  return readFileSync(resolve(process.cwd(), pagePath), 'utf-8')
}

describe('customer service page placement regressions', () => {
  const fixedBottomPages = [
    {
      path: 'src/pages/recipe-order/index.vue',
      title: '下单配置咨询',
      context: 'recipe order bottom bar',
    },
    {
      path: 'src/pages/checkout/index.vue',
      title: '确认订单咨询',
      context: 'checkout bottom bar',
    },
    {
      path: 'src/pages/aftersale-apply/index.vue',
      title: '售后申请咨询',
      context: 'aftersale submit bar',
    },
    {
      path: 'src/pages/order-config/index.vue',
      title: '订单配置咨询',
      context: 'legacy order config bottom bar',
    },
  ]

  it('uses a non-floating customer service component on pages with fixed bottom actions', () => {
    for (const page of fixedBottomPages) {
      const source = readPage(page.path)
      const templateSource = source.slice(0, source.indexOf('<script setup'))

      expect(source, page.context).toContain('CustomerServiceInlineButton')
      expect(source, page.context).not.toContain('<CustomerServiceFloatButton')
      expect(source, page.context).not.toContain("import CustomerServiceFloatButton")
      expect(templateSource, page.context).toContain('class="customer-service-bottom-action"')
      expect(templateSource, page.context).toContain(`title="${page.title}"`)
    }
  })

  it('puts order list customer service in its own fixed bottom bar', () => {
    const source = readPage('src/pages/orders-list/index.vue')
    const templateSource = source.slice(0, source.indexOf('<script setup'))

    expect(source).toContain('CustomerServiceInlineButton')
    expect(source).not.toContain('<CustomerServiceFloatButton')
    expect(source).not.toContain("import CustomerServiceFloatButton")
    expect(templateSource).toContain('class="customer-service-bottom-bar"')
    expect(templateSource).toContain('title="订单列表咨询"')
  })

  it('renders the inline customer service button as text only', () => {
    const source = readPage('src/components/CustomerServiceInlineButton.vue')

    expect(source).toContain('问Seven爸')
    expect(source).not.toContain('customer-service-inline-icon')
    expect(source).not.toContain('<text class="customer-service-inline-icon">问</text>')
  })

  it('uses a prominent primary style for the inline customer service button', () => {
    const source = readPage('src/components/CustomerServiceInlineButton.vue')

    expect(source).toContain('background: #07c160;')
    expect(source).toContain('color: #ffffff;')
    expect(source).toContain('box-shadow: 0 8rpx 18rpx rgba(7, 193, 96, 0.22);')
    expect(source).toContain('font-size: 26rpx;')
  })

  it('does not show customer service on the cart page', () => {
    const source = readPage('src/pages/cart/index.vue')

    expect(source).not.toContain('<CustomerServiceFloatButton')
    expect(source).not.toContain('CustomerServiceInlineButton')
    expect(source).not.toContain('购物车咨询')
  })
})
