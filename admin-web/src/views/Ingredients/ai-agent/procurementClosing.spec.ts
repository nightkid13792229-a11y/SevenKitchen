import { describe, expect, it } from 'vitest'
import {
  buildCreateSkuPayload,
  computeClosingState,
  formatCostPreview,
} from './procurementClosing'

/**
 * AI 建档收尾「补一条采购商品」（2026-11-07）。
 *
 * 这一步是整条食材线的闭环：没有采购商品 → 买不了 → 成本永远是 0 →
 * 食谱里这条食材按「免费」算，售价跟着偏低。
 */
describe('AI 建档收尾 · 采购商品', () => {
  it('没商品时是 MISSING_SKU', () => {
    expect(
      computeClosingState({ skuCount: 0, pricePerPackage: null, netContent: null }),
    ).toBe('MISSING_SKU')
  })

  it('有商品但没填价时是 MISSING_PRICE（不算走完）', () => {
    expect(
      computeClosingState({ skuCount: 1, pricePerPackage: null, netContent: 500 }),
    ).toBe('MISSING_PRICE')
  })

  it('商品和价都齐了才是 READY', () => {
    expect(
      computeClosingState({ skuCount: 1, pricePerPackage: 39.9, netContent: 500 }),
    ).toBe('READY')
  })

  it('提交体只带「人话」字段，换算交给服务端算', () => {
    const payload = buildCreateSkuPayload({
      name: '山姆 糙米',
      purchaseChannel: '山姆会员店',
      purchaseUnit: '袋',
      packCount: 1,
      netContentPerPack: 500,
      currentPurchasePrice: 39.9,
    })

    expect(payload).toEqual({
      name: '山姆 糙米',
      purchaseChannel: '山姆会员店',
      purchaseUnit: '袋',
      packCount: 1,
      netContentPerPack: 500,
      currentPurchasePrice: 39.9,
    })
    // 前端不自己算换算：算错一次，库存差几十倍
    expect(payload).not.toHaveProperty('purchaseToBaseRatio')
  })

  it('换算预览按「一件多少钱 ÷ 净含量」显示', () => {
    expect(formatCostPreview(39.9, 500, 'g')).toBe('≈ ¥0.079800 / g')
    expect(formatCostPreview(null, 500, 'g')).toBe('')
    expect(formatCostPreview(39.9, 0, 'g')).toBe('')
  })
})
