import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function readPage(pagePath: string) {
  return readFileSync(resolve(process.cwd(), pagePath), 'utf-8')
}

/**
 * 补剂购买链路回归。
 *
 * 锁住 2026-09-22 这一轮的改动，避免以后被无意改回：
 *   · 费用只给一个最终价格，不再逐项摊开货款 / 服务费 / 运费
 *   · 包邮状态来自服务端，不写死
 *   · 两个页面的空态都要有出口
 *   · 多种补剂要能全选，且不可购买的不能被选中
 */
describe('supplement purchase regressions', () => {
  describe('补剂下单页', () => {
    const source = readPage('src/pages/supplement-order/index.vue')
    const template = source.slice(0, source.indexOf('<script setup'))

    it('费用只给一个最终价格，不再逐项摊开', () => {
      // 旧的逐项行已经移除（注释里提到过这些词，所以断言标记而不是词）
      expect(template).not.toContain('class="fee-row"')
      expect(template).not.toContain('fee-label')
      expect(template).not.toContain('fee-value')

      // 新的一价全包卡片
      expect(template).toContain('fee-total')
      expect(template).toContain('一价全包')
      expect(template).toContain('已含分装与配送')
    })

    it('包邮状态由服务端返回决定，不写死', () => {
      expect(template).toContain("summary.freeShipping ? '全国包邮'")
    })

    it('空态给出可点的出口', () => {
      expect(template).toContain('@tap="goToDiySheetList"')
      expect(source).toContain("'/pages/diy-sheet-list/index'")
    })

    it('多种补剂时提供全选/全不选', () => {
      expect(template).toContain('@tap="toggleSelectAll"')
      expect(template).toContain('allSelectableSelected')
      expect(source).toContain('selectableLines')
    })

    it('全选会跳过不可购买的补剂，不会污染报价', () => {
      // 可选项的定义必须排除 unavailableReason
      const selectableBlock = source.slice(
        source.indexOf('const selectableLines'),
        source.indexOf('const allSelectableSelected'),
      )
      expect(selectableBlock).toContain('!line.unavailableReason')
    })

    it('提交后按支付结果分流，通道不可用时降级人工确认', () => {
      expect(source).toContain('runSupplementPayment')
      expect(source).toContain('showPaidModal')
      expect(source).toContain('showManualConfirmModal')
    })
  })

  describe('补剂订单页', () => {
    const source = readPage('src/pages/supplement-orders/index.vue')
    const template = source.slice(0, source.indexOf('<script setup'))

    it('空态给出可点的出口', () => {
      expect(template).toContain('@tap="goToDiySheetList"')
      expect(source).toContain("'/pages/diy-sheet-list/index'")
    })

    it('待付款订单提供去支付入口', () => {
      expect(template).toContain("order.status === 'PENDING_PAYMENT'")
      expect(template).toContain('@tap="handlePay(order)"')
    })

    it('状态文案走统一的中文映射', () => {
      expect(source).toContain('SUPPLEMENT_ORDER_STATUS_LABELS')
    })
  })
})
