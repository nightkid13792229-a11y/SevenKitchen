import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('me page regressions', () => {
  it('hides the order list entry from the me page', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/me/index.vue'),
      'utf-8',
    )
    const templateSource = source.slice(0, source.indexOf('<script setup'))

    expect(templateSource).not.toContain('我的订单')
    expect(templateSource).not.toContain('@tap="goToOrderList"')
    expect(templateSource).not.toContain('userInfo.orderCount')
    expect(source).not.toContain("url: '/pages/orders-list/index'")
  })

  it('hides the standalone shipping address entry while keeping internal address flows available', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/me/index.vue'),
      'utf-8',
    )
    const templateSource = source.slice(0, source.indexOf('<script setup'))
    const checkoutSource = readFileSync(
      resolve(process.cwd(), 'src/pages/checkout/index.vue'),
      'utf-8',
    )
    const orderDetailSource = readFileSync(
      resolve(process.cwd(), 'src/pages/order-detail/index.vue'),
      'utf-8',
    )

    expect(templateSource).not.toContain('@tap="goToAddressList"')
    expect(templateSource).not.toContain('<text class="function-text">收货地址</text>')
    expect(templateSource).not.toContain('userInfo.addressCount')
    expect(source).not.toContain("url: '/pages/address-list/index'")

    expect(checkoutSource).toContain("url: '/pages/address-list/index?mode=select'")
    expect(orderDetailSource).toContain('/pages/address-list/index?mode=select&orderId=')
  })
})
