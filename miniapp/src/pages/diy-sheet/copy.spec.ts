import { describe, expect, it } from 'vitest'
import {
  DIY_SHEET_FOOD_RECOMMENDATION_LABEL,
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
})
