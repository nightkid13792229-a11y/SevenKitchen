import { describe, expect, it } from 'vitest'
import {
  DIY_SHEET_FOOD_RECOMMENDATION_LABEL,
  getPurchaseTipByPlatform,
  getRecommendedPurchaseChannelDisplay,
  getRecommendationEntryDisplayText,
  getSpecRecommendedPurchaseChannelDisplay,
  DIY_SHEET_SUPPLEMENT_RECOMMENDATION_LABEL,
  DIY_SHEET_SPEC_MODAL_TITLE,
  DIY_SHEET_PURCHASE_LABEL,
  formatRecommendationActionLabel,
  formatSelectedProductDisplayText
} from './copy'

describe('diy-sheet copy', () => {
  it('uses selected-product wording for diy sheet recommendation labels', () => {
    expect(DIY_SHEET_FOOD_RECOMMENDATION_LABEL).toBe('已选商品')
    expect(DIY_SHEET_SUPPLEMENT_RECOMMENDATION_LABEL).toBe('已选商品')
    expect(DIY_SHEET_SPEC_MODAL_TITLE).toBe('选择商品')
    expect(DIY_SHEET_PURCHASE_LABEL).toBe('已选商品')
  })

  it('does not treat the standard ingredient name as a selected product', () => {
    expect(formatSelectedProductDisplayText({ name: '牛霖' }, '牛霖')).toBe('-')
    expect(formatSelectedProductDisplayText({}, '牛霖')).toBe('-')
    expect(formatSelectedProductDisplayText({ purchaseChannel: '本地生鲜市场' }, '牛霖')).toBe('-')
  })

  it('shows no food selected product unless a DIY recommended SKU exists', async () => {
    const { formatFoodSelectedProductDisplayText } = await import('./copy')

    expect(formatFoodSelectedProductDisplayText(undefined, {
      name: '牛霖',
      brand: '无',
      productModel: '牛霖',
      purchaseChannel: '本地生鲜市场'
    })).toBe('-')

    expect(formatFoodSelectedProductDisplayText({
      brand: '盒马自营',
      productModel: '中心150g/份'
    }, {
      name: '牛心',
      brand: '无',
      productModel: '牛心'
    })).toBe('盒马自营 / 中心150g/份')
  })

  it('formats configured selected products from brand/spec or a distinct product name', () => {
    expect(formatSelectedProductDisplayText({
      brand: 'NOW FOODS',
      productModel: '473ml/瓶'
    }, '小麦胚芽油')).toBe('NOW FOODS / 473ml/瓶')

    expect(formatSelectedProductDisplayText({
      name: '维生素E 400IU'
    }, '维生素E')).toBe('维生素E 400IU')
  })

  it('uses actionable wording for selected product replacement hints', () => {
    expect(formatRecommendationActionLabel(0)).toBe('')
    expect(formatRecommendationActionLabel(1)).toBe('查看商品 〉')
    expect(formatRecommendationActionLabel(2)).toBe('可更换 2项 〉')
    expect(formatRecommendationActionLabel(4)).toBe('可更换 4项 〉')
  })

  it('uses 点击查看 for recommendation entries with detail', () => {
    expect(getRecommendationEntryDisplayText(true)).toBe('点击查看')
    expect(getRecommendationEntryDisplayText(false)).toBe('-')
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
    expect(getPurchaseTipByPlatform('IHERB')).toBe('已复制 iHerb 商品链接')
  })

})
