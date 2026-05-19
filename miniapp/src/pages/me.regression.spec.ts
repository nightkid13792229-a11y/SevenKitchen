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
})
