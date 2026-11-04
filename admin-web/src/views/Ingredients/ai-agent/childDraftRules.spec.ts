import { describe, expect, it } from 'vitest'
import type {
  ProcurementSkuDraft,
  RecommendedProductDraft
} from '@/types/ingredientCreation'
import { validateChildDrafts } from './childDraftRules'

function product(
  overrides: Partial<RecommendedProductDraft> = {}
): RecommendedProductDraft {
  return {
    key: 'rp-1',
    name: '挪威三文鱼 500g',
    brand: '',
    productModel: '',
    purchaseChannel: '',
    purchaseLinkPlatform: 'OTHER',
    purchaseLinkUrl: '',
    imageUrl: '',
    sortOrder: 0,
    isActive: true,
    ...overrides
  }
}

function sku(
  overrides: Partial<ProcurementSkuDraft> = {}
): ProcurementSkuDraft {
  return {
    key: 'sku-1',
    name: '三文鱼整条',
    brand: '',
    productModel: '',
    purchaseChannel: '',
    purchaseUnit: '箱',
    purchaseToBaseRatio: 5000,
    currentPurchasePrice: 380,
    openingStock: null,
    safetyStock: 1,
    reorderPoint: 2,
    targetStock: 5,
    notes: '',
    isActive: true,
    ...overrides
  }
}

describe('子板块提交前校验', () => {
  it('空板块直接通过', () => {
    expect(validateChildDrafts([], [])).toBeNull()
  })

  it('DIY制作单推荐商品缺名称时指出第几条', () => {
    expect(validateChildDrafts([product()], [])).toBeNull()
    expect(validateChildDrafts([product({ name: '  ' })], [])).toContain(
      '第 1 个 DIY制作单推荐商品'
    )
  })

  it('采购 SKU 缺名称时指出第几条', () => {
    expect(validateChildDrafts([], [sku({ name: '  ' })])).toContain(
      '第 1 个生产/采购SKU'
    )
  })

  it('换算倍数必须大于 0', () => {
    expect(
      validateChildDrafts([], [sku({ purchaseToBaseRatio: 0 })])
    ).toContain('换算倍数')
    expect(
      validateChildDrafts([], [sku({ purchaseToBaseRatio: null })])
    ).toBeNull()
  })

  it('采购价不能为负，0 合法', () => {
    expect(
      validateChildDrafts([], [sku({ currentPurchasePrice: -1 })])
    ).toContain('采购价')
    expect(
      validateChildDrafts([], [sku({ currentPurchasePrice: 0 })])
    ).toBeNull()
  })

  it('库存顺序：补货点 ≥ 安全库存，目标库存 ≥ 补货点', () => {
    expect(
      validateChildDrafts(
        [],
        [sku({ safetyStock: 5, reorderPoint: 2, targetStock: 10 })]
      )
    ).toContain('补货点')
    expect(
      validateChildDrafts(
        [],
        [sku({ safetyStock: 1, reorderPoint: 5, targetStock: 3 })]
      )
    ).toContain('目标库存')
    expect(
      validateChildDrafts(
        [],
        [sku({ safetyStock: 1, reorderPoint: 2, targetStock: 2 })]
      )
    ).toBeNull()
  })
})
