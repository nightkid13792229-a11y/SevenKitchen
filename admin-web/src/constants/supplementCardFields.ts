/**
 * 补剂档案的字段目录。
 *
 * 与食材线分开维护：补剂是单层产品模型（品牌、规格、渠道、采购价、剂型都挂在
 * 同一条标准原料上），字段集合和食材不是一回事，混在一张卡里迟早错位。
 *
 * `owner` 说的是"这一格正常情况下谁来填"，不是权限：
 * - `AI`：AI 读商品页/标签会填上，人随时可以改
 * - `HUMAN`：AI 不替你定，必须人填（没填就不许写入）
 * - `DEFAULT`：有全局默认值，人不去动它就行
 */
export type SupplementFieldOwner = 'AI' | 'HUMAN' | 'DEFAULT'

export type SupplementFieldGroup = 'BASIC' | 'PRODUCT' | 'PURCHASE' | 'LABEL'

export interface SupplementCardField {
  key: string
  label: string
  group: SupplementFieldGroup
  owner: SupplementFieldOwner
  required: boolean
}

/** 人必须自己定的两格。界面永远展开、标黄，写入按钮由它们把关。 */
export const SUPPLEMENT_HUMAN_FIELD_KEYS = ['tagNames', 'addTiming'] as const

export const SUPPLEMENT_CARD_FIELDS: SupplementCardField[] = [
  { key: 'name', label: '原料名称', group: 'BASIC', owner: 'AI', required: true },
  { key: 'unitDisplayLabel', label: '单位展示名', group: 'BASIC', owner: 'AI', required: true },
  { key: 'physicalForm', label: '物理形态', group: 'BASIC', owner: 'AI', required: true },

  { key: 'brand', label: '产品品牌', group: 'PRODUCT', owner: 'AI', required: false },
  { key: 'productModel', label: '产品规格', group: 'PRODUCT', owner: 'AI', required: false },
  { key: 'purchaseChannel', label: '采购渠道', group: 'PRODUCT', owner: 'AI', required: false },

  { key: 'servingUnitsPerDose', label: '每份几粒', group: 'PURCHASE', owner: 'AI', required: true },
  { key: 'purchaseUnit', label: '采购单位', group: 'PURCHASE', owner: 'AI', required: true },
  { key: 'purchaseToBaseRatio', label: '换算倍数', group: 'PURCHASE', owner: 'AI', required: true },
  { key: 'currentPricePerPurchaseUnit', label: '当前采购价', group: 'PURCHASE', owner: 'AI', required: true },
  { key: 'addTiming', label: '添加时机', group: 'PURCHASE', owner: 'HUMAN', required: true },
  { key: 'productionLossRate', label: '生产损耗率', group: 'PURCHASE', owner: 'DEFAULT', required: false },
  { key: 'diyEnabled', label: '用于 DIY 推荐', group: 'PURCHASE', owner: 'DEFAULT', required: false },
  { key: 'procurementEnabled', label: '用于采购/生产', group: 'PURCHASE', owner: 'DEFAULT', required: false },

  { key: 'tagNames', label: '标签分类', group: 'LABEL', owner: 'HUMAN', required: true },
  { key: 'labelCategory', label: '标签类型', group: 'LABEL', owner: 'AI', required: false },
  { key: 'labelNames', label: '标签名称', group: 'LABEL', owner: 'AI', required: false },
  { key: 'labelNameSource', label: '名称依据', group: 'LABEL', owner: 'AI', required: false }
]
