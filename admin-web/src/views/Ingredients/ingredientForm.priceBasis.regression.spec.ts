import { describe, expect, it } from 'vitest'
/**
 * 原料表单 · 算价依据与来源方案下线（2026-11-02）
 *
 * admin-web 的 vitest 是 node 环境（没有 jsdom），页面挂不起来，
 * 所以接线用 `?raw` 读源码断言。
 *
 * ⚠️ 用 Vite 的 `?raw`，不要用 `node:fs`：构建时 tsconfig 没有 node 类型。
 */
import ingredientFormSource from './IngredientForm.vue?raw'
import ingredientTypesSource from '@/types/ingredient.ts?raw'
import tastingPackConfigSource from '@/views/TastingPack/Config.vue?raw'
import tastingPackApiSource from '@/api/tastingPack.ts?raw'

describe('原料表单 · 算价依据与来源方案下线（2026-11-02）', () => {
  it('不再展示「来源等级」，也没有未标来源的提示', () => {
    expect(ingredientFormSource).not.toContain('来源等级')
    expect(ingredientFormSource).not.toContain('未标来源')
    expect(ingredientFormSource).not.toContain('sourceTier')
    expect(ingredientFormSource).not.toContain('ProcurementSkuSourceTier')
    expect(ingredientFormSource).not.toContain('procurementSourceTierOptions')
  })

  it('采购商品卡片上不再有来源等级标签，但保留品牌和规格', () => {
    expect(ingredientFormSource).toContain('v-if="sku.brand"')
    expect(ingredientFormSource).toContain('v-if="sku.productModel"')
    expect(ingredientFormSource).toContain("{{ sku.isActive ? '已启用' : '已停用' }}")
  })

  it('原料详情页展示只读的算价依据：最近采购价 / 创建价 / 折合单价', () => {
    expect(ingredientFormSource).toContain('算价依据')
    expect(ingredientFormSource).toContain('priceBasisVisible')
    expect(ingredientFormSource).toContain('LATEST_PURCHASE')
    expect(ingredientFormSource).toContain('SKU_REFERENCE')
    expect(ingredientFormSource).toContain('最近采购')
    expect(ingredientFormSource).toContain('创建价')
    expect(ingredientFormSource).toContain('老订单价格已冻结')
  })

  it('类型定义里删掉了来源等级，补上了算价依据', () => {
    expect(ingredientTypesSource).not.toContain('ProcurementSkuSourceTier')
    expect(ingredientTypesSource).not.toContain('sourceTier')
    expect(ingredientTypesSource).toContain('IngredientPriceBasis')
    expect(ingredientTypesSource).toContain('priceBasis?: IngredientPriceBasis | null')
    expect(ingredientTypesSource).toContain('initialPricePerPurchaseUnit')
  })

  it('试吃装配置不再展示原料方案', () => {
    expect(tastingPackConfigSource).not.toContain('ingredientSourcePlan')
    expect(tastingPackConfigSource).not.toContain('原料方案')
    expect(tastingPackApiSource).not.toContain('ingredientSourcePlan')
  })
})
