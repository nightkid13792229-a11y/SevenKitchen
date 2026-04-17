import { describe, expect, it } from 'vitest'
import {
  DIY_SHEET_FOOD_RECOMMENDATION_LABEL,
  getPurchaseTipByPlatform,
  getRecommendedPurchaseChannelDisplay,
  getSpecRecommendedPurchaseChannelDisplay,
  DIY_SHEET_SUPPLEMENT_RECOMMENDATION_LABEL,
  DIY_SHEET_SPEC_MODAL_TITLE,
  DIY_SHEET_PURCHASE_LABEL
} from './copy'

describe('diy-sheet copy', () => {
  it('uses 推荐商品 for all diy sheet recommendation labels', () => {
    expect(DIY_SHEET_FOOD_RECOMMENDATION_LABEL).toBe('推荐商品')
    expect(DIY_SHEET_SUPPLEMENT_RECOMMENDATION_LABEL).toBe('推荐商品')
    expect(DIY_SHEET_SPEC_MODAL_TITLE).toBe('推荐商品')
    expect(DIY_SHEET_PURCHASE_LABEL).toBe('推荐商品')
  })

  it('prefers purchase link platform label for recommended purchase channel display', () => {
    expect(getRecommendedPurchaseChannelDisplay(
      { platform: 'JD', url: 'https://jd.example/product' },
      'iHerb'
    )).toBe('京东')
  })

  it('displays iHerb for iHerb purchase links', () => {
    expect(getRecommendedPurchaseChannelDisplay(
      { platform: 'IHERB', url: 'https://iherb.example/product' },
      '网页链接'
    )).toBe('iHerb')
  })

  it('falls back to the manually entered purchase channel without a link platform', () => {
    expect(getRecommendedPurchaseChannelDisplay(null, ' iHerb ')).toBe('iHerb')
  })

  it('keeps non-supplement spec modal channel display on the manually entered channel', () => {
    expect(getSpecRecommendedPurchaseChannelDisplay({
      ingredientType: 'FOOD',
      purchaseLink: { platform: 'JD', url: 'https://jd.example/product' },
      purchaseChannel: 'iHerb'
    })).toBe('iHerb')
  })

  it('uses an iHerb-specific purchase copy tip', () => {
    expect(getPurchaseTipByPlatform('IHERB')).toBe('已复制 iHerb 购买链接')
  })
})
