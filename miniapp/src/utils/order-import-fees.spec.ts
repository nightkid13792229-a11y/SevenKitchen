import { describe, expect, it } from 'vitest'
import {
  IMPORT_FEE_TOLERANCE,
  isFeeGapOff,
  sumImportFees,
  summarizeOrderImportFees,
} from './order-import-fees'

/**
 * 订单识别的费用核对（2026-11-05）。
 *
 * 背景：识别结果页以前只显示商品行，运费/包装费读了也不显示，
 * 于是「凭证 127.90、采购金额 125.90」这 2 块钱在页面上无处解释。
 * 这里锁定：
 *   1. 商品 + 运费 + 包装 = 实付 这道账要能算出来；
 *   2. 读不到的运费/包装费是 null，不能被当成「0 元已确认」；
 *   3. 实付没读到就不算差额，不硬猜；
 *   4. 多笔订单的运费/包装费能相加（报销页预填用）。
 */

describe('summarizeOrderImportFees', () => {
  it('运费读到了：账能合上，差额为 0', () => {
    const summary = summarizeOrderImportFees({
      lineTotals: [125.9],
      shippingFee: 2,
      packagingFee: 0,
      paid: 127.9,
    })

    expect(summary.lineSum).toBe(125.9)
    expect(summary.feeTotal).toBe(2)
    expect(summary.expected).toBe(127.9)
    expect(summary.gap).toBe(0)
    expect(summary.hasMissingFee).toBe(false)
  })

  it('运费没读到：按 0 参与合计，但明确标出「没读到」，并把 2 块钱差额露出来', () => {
    const summary = summarizeOrderImportFees({
      lineTotals: [125.9],
      shippingFee: null,
      packagingFee: null,
      paid: 127.9,
    })

    expect(summary.hasMissingFee).toBe(true)
    expect(summary.feeTotal).toBe(0)
    expect(summary.expected).toBe(125.9)
    expect(summary.gap).toBe(2)
    expect(summary.shipping).toBeNull()
  })

  it('实付没读到：差额是 null，不猜', () => {
    const summary = summarizeOrderImportFees({
      lineTotals: [125.9],
      shippingFee: 2,
      packagingFee: 0,
      paid: null,
    })

    expect(summary.gap).toBeNull()
    expect(summary.expected).toBe(127.9)
  })

  it('实付比构成还少时，差额是负数（超出部分要人看）', () => {
    const summary = summarizeOrderImportFees({
      lineTotals: [125.9],
      shippingFee: 5,
      packagingFee: 0,
      paid: 127.9,
    })

    expect(summary.gap).toBe(-3)
  })

  it('个人采购行也在商品小计里：差额只反映没解释的钱', () => {
    const summary = summarizeOrderImportFees({
      lineTotals: [100, 25.9],
      shippingFee: 2,
      packagingFee: 0,
      paid: 127.9,
    })

    expect(summary.lineSum).toBe(125.9)
    expect(summary.gap).toBe(0)
  })

  it('行金额有 null 时当 0 算，不会算出 NaN', () => {
    const summary = summarizeOrderImportFees({
      lineTotals: [10, null],
      shippingFee: null,
      packagingFee: null,
      paid: null,
    })

    expect(summary.lineSum).toBe(10)
    expect(summary.gap).toBeNull()
  })

  it('一分钱的差额算对得上，不报错', () => {
    const summary = summarizeOrderImportFees({
      lineTotals: [100],
      shippingFee: 0,
      packagingFee: 0,
      paid: 100.01,
    })

    expect(summary.gap).toBe(0.01)
    expect(isFeeGapOff(summary.gap)).toBe(false)
    expect(IMPORT_FEE_TOLERANCE).toBeGreaterThan(0.005)
  })
})

describe('sumImportFees', () => {
  it('多笔订单的运费/包装费相加（含没读到的按 0）', () => {
    const result = sumImportFees([
      { shippingFee: 2, packagingFee: 0.5 },
      { shippingFee: 3, packagingFee: null },
      { shippingFee: null, packagingFee: null },
    ])

    expect(result.count).toBe(3)
    expect(result.shipping).toBe(5)
    expect(result.packaging).toBe(0.5)
  })

  it('空列表是 0，不会 NaN', () => {
    expect(sumImportFees([])).toEqual({ count: 0, shipping: 0, packaging: 0 })
  })
})

describe('isFeeGapOff', () => {
  it('差值超过一分钱才算没对上', () => {
    expect(isFeeGapOff(0)).toBe(false)
    expect(isFeeGapOff(0.01)).toBe(false)
    expect(isFeeGapOff(0.02)).toBe(true)
    expect(isFeeGapOff(-2)).toBe(true)
    expect(isFeeGapOff(null)).toBe(false)
  })
})
