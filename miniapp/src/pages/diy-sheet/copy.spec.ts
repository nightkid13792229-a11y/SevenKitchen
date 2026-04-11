import { describe, expect, it } from 'vitest'
import {
  DIY_SHEET_FOOD_RECOMMENDATION_LABEL,
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
})
