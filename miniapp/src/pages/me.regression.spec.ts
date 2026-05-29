import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('me page regressions', () => {
  it('shows the order list entry on the me page', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/me/index.vue'),
      'utf-8',
    )
    const templateSource = source.slice(0, source.indexOf('<script setup'))

    expect(templateSource).toContain('我的订单')
    expect(templateSource).toContain('@tap="goToOrderList"')
    expect(templateSource).toContain('userInfo.orderCount')
    expect(source).toContain("url: '/pages/orders-list/index'")
  })
})
