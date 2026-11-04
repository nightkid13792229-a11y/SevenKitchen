import { describe, expect, it } from 'vitest'
import type { IngredientDraft } from '@/types/ingredientCreation'
import { buildLegacyProcurementSkuDraft } from './childDraftMigration'

const base: IngredientDraft = {
  name: '冷冻三文鱼',
  type: 'FOOD',
  baseUnit: 'G',
  unitDisplayLabel: '克'
}

describe('旧草稿采购信息迁移', () => {
  it('没有任何旧值时返回 null', () => {
    expect(buildLegacyProcurementSkuDraft(base, 'sku-1')).toBeNull()
    expect(buildLegacyProcurementSkuDraft(null, 'sku-1')).toBeNull()
  })

  it('把原料级采购字段收进一条采购 SKU 草稿', () => {
    const draft = buildLegacyProcurementSkuDraft(
      {
        ...base,
        brand: '挪威海产',
        productModel: '1kg/袋',
        purchaseChannel: '京东',
        purchaseUnit: '袋',
        purchaseToBaseRatio: 1000,
        currentPricePerPurchaseUnit: 128,
        safetyStock: 2,
        reorderPoint: 3,
        targetStock: 10
      },
      'sku-1'
    )

    expect(draft).toMatchObject({
      key: 'sku-1',
      name: '冷冻三文鱼',
      brand: '挪威海产',
      productModel: '1kg/袋',
      purchaseChannel: '京东',
      purchaseUnit: '袋',
      purchaseToBaseRatio: 1000,
      currentPurchasePrice: 128,
      safetyStock: 2,
      reorderPoint: 3,
      targetStock: 10,
      isActive: true
    })
    expect(draft?.notes).toContain('旧版')
  })

  it('原料名缺失时给可读的默认名，0 不被当成空', () => {
    const draft = buildLegacyProcurementSkuDraft(
      { ...base, name: '  ', currentPricePerPurchaseUnit: 0 },
      'sku-1'
    )

    expect(draft?.name).toBe('旧版采购信息')
    expect(draft?.currentPurchasePrice).toBe(0)
  })
})
