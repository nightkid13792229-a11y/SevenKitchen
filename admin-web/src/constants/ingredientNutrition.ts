import type {
  NutritionConfidenceLevel,
  NutritionProfileSourceType,
  NutritionRawBasisType,
  NutritionSampleState,
  NutritionTabRecord
} from '@/types/ingredient'

export type IngredientNutritionTabKey =
  | 'macros'
  | 'minerals'
  | 'vitamins'
  | 'fattyAcids'
  | 'aminoAcids'

export interface IngredientNutritionOption<TValue extends string> {
  label: string
  value: TValue
}

export interface IngredientNutritionMetaFieldDefinition {
  key:
    | 'rawBasisType'
    | 'sampleState'
    | 'isEdiblePortionBasis'
    | 'ediblePortionRate'
    | 'densityGPerMl'
    | 'servingWeightG'
    | 'sourceType'
    | 'sourceTitle'
    | 'sourceProvider'
    | 'attachments'
    | 'confidenceLevel'
    | 'versionNote'
  label: string
}

export interface IngredientNutritionFieldDefinition<TKey extends string = string> {
  key: TKey
  label: string
  unit: string
  placeholder?: string
}

export interface IngredientNutritionTabDefinition<
  TKey extends string = string
> {
  key: IngredientNutritionTabKey
  label: string
  fields: Array<IngredientNutritionFieldDefinition<TKey>>
}

export const INGREDIENT_NUTRITION_TAB_KEYS: readonly IngredientNutritionTabKey[] = [
  'macros',
  'minerals',
  'vitamins',
  'fattyAcids',
  'aminoAcids'
] as const

export const INGREDIENT_NUTRITION_META_FIELDS: readonly IngredientNutritionMetaFieldDefinition[] = [
  { key: 'rawBasisType', label: '原始基准' },
  { key: 'sampleState', label: '样品状态' },
  { key: 'isEdiblePortionBasis', label: '按可食部口径' },
  { key: 'ediblePortionRate', label: '可食部比例' },
  { key: 'densityGPerMl', label: '密度 (g/ml)' },
  { key: 'servingWeightG', label: '单份重量 (g)' },
  { key: 'sourceType', label: '来源类型' },
  { key: 'sourceTitle', label: '来源标题' },
  { key: 'sourceProvider', label: '来源提供方' },
  { key: 'attachments', label: '附件' },
  { key: 'confidenceLevel', label: '置信度' },
  { key: 'versionNote', label: '版本备注' }
] as const

export const INGREDIENT_NUTRITION_RAW_BASIS_OPTIONS: readonly IngredientNutritionOption<NutritionRawBasisType>[] = [
  { label: '每100g', value: 'PER_100_G' },
  { label: '每100ml', value: 'PER_100_ML' },
  { label: '每1g', value: 'PER_1_G' },
  { label: '每1ml', value: 'PER_1_ML' },
  { label: '每份', value: 'PER_SERVING' }
] as const

export const INGREDIENT_NUTRITION_SAMPLE_STATE_OPTIONS: readonly IngredientNutritionOption<NutritionSampleState>[] = [
  { label: '生', value: 'RAW' },
  { label: '熟', value: 'COOKED' },
  { label: '冻干', value: 'FREEZE_DRIED' },
  { label: '风干', value: 'AIR_DRIED' },
  { label: '粉末', value: 'POWDER' },
  { label: '油脂', value: 'OIL' },
  { label: '浓缩物', value: 'CONCENTRATE' }
] as const

export const INGREDIENT_NUTRITION_SOURCE_TYPE_OPTIONS: readonly IngredientNutritionOption<NutritionProfileSourceType>[] = [
  { label: '实验室报告', value: 'LAB_REPORT' },
  { label: '商品标签', value: 'LABEL' },
  { label: '文献资料', value: 'LITERATURE' },
  { label: '供应商', value: 'SUPPLIER' },
  { label: '人工估算', value: 'MANUAL_ESTIMATE' }
] as const

export const INGREDIENT_NUTRITION_CONFIDENCE_OPTIONS: readonly IngredientNutritionOption<NutritionConfidenceLevel>[] = [
  { label: '高', value: 'HIGH' },
  { label: '中', value: 'MEDIUM' },
  { label: '低', value: 'LOW' }
] as const

export const INGREDIENT_NUTRITION_CUSTOM_ITEM_UNIT_OPTIONS: readonly string[] = [
  'kcal',
  'g',
  'mg',
  'μg',
  'IU',
  '%'
] as const

export const INGREDIENT_NUTRITION_TAB_DEFINITIONS: readonly IngredientNutritionTabDefinition[] = [
  {
    key: 'macros',
    label: '宏量',
    fields: [
      { key: 'energyKcal', label: '能量', unit: 'kcal' },
      { key: 'moisture', label: '水分', unit: 'g' },
      { key: 'crudeProtein', label: '粗蛋白', unit: 'g' },
      { key: 'crudeFat', label: '粗脂肪', unit: 'g' },
      { key: 'ash', label: '灰分', unit: 'g' },
      { key: 'carbohydrate', label: '碳水化合物', unit: 'g' },
      { key: 'fiber', label: '膳食纤维', unit: 'g' },
      { key: 'solubleFiber', label: '可溶性纤维', unit: 'g' },
      { key: 'insolubleFiber', label: '不可溶性纤维', unit: 'g' }
    ]
  },
  {
    key: 'minerals',
    label: '矿物质',
    fields: [
      { key: 'calcium', label: '钙', unit: 'mg' },
      { key: 'phosphorus', label: '磷', unit: 'mg' },
      { key: 'potassium', label: '钾', unit: 'mg' },
      { key: 'sodium', label: '钠', unit: 'mg' },
      { key: 'magnesium', label: '镁', unit: 'mg' },
      { key: 'chloride', label: '氯', unit: 'mg' },
      { key: 'iron', label: '铁', unit: 'mg' },
      { key: 'zinc', label: '锌', unit: 'mg' },
      { key: 'copper', label: '铜', unit: 'mg' },
      { key: 'manganese', label: '锰', unit: 'mg' },
      { key: 'selenium', label: '硒', unit: 'μg' },
      { key: 'iodine', label: '碘', unit: 'μg' }
    ]
  },
  {
    key: 'vitamins',
    label: '维生素',
    fields: [
      { key: 'vitaminA', label: '维生素 A', unit: 'IU' },
      { key: 'vitaminD', label: '维生素 D', unit: 'IU' },
      { key: 'vitaminE', label: '维生素 E', unit: 'mg' },
      { key: 'vitaminK', label: '维生素 K', unit: 'μg' },
      { key: 'vitaminB1', label: '维生素 B1', unit: 'mg' },
      { key: 'vitaminB2', label: '维生素 B2', unit: 'mg' },
      { key: 'vitaminB3', label: '维生素 B3', unit: 'mg' },
      { key: 'vitaminB5', label: '维生素 B5', unit: 'mg' },
      { key: 'vitaminB6', label: '维生素 B6', unit: 'mg' },
      { key: 'vitaminB7', label: '维生素 B7', unit: 'μg' },
      { key: 'vitaminB9', label: '维生素 B9', unit: 'μg' },
      { key: 'vitaminB12', label: '维生素 B12', unit: 'μg' },
      { key: 'choline', label: '胆碱', unit: 'mg' },
      { key: 'vitaminC', label: '维生素 C', unit: 'mg' }
    ]
  },
  {
    key: 'fattyAcids',
    label: '脂肪酸',
    fields: [
      { key: 'saturatedFattyAcids', label: '饱和脂肪酸', unit: 'g' },
      { key: 'monounsaturatedFattyAcids', label: '单不饱和脂肪酸', unit: 'g' },
      { key: 'polyunsaturatedFattyAcids', label: '多不饱和脂肪酸', unit: 'g' },
      { key: 'linoleicAcid', label: '亚油酸', unit: 'g' },
      { key: 'alphaLinolenicAcid', label: 'α-亚麻酸', unit: 'g' },
      { key: 'arachidonicAcid', label: '花生四烯酸', unit: 'g' },
      { key: 'epa', label: 'EPA', unit: 'g' },
      { key: 'dpa', label: 'DPA', unit: 'g' },
      { key: 'dha', label: 'DHA', unit: 'g' }
    ]
  },
  {
    key: 'aminoAcids',
    label: '氨基酸',
    fields: [
      { key: 'arginine', label: '精氨酸', unit: 'g' },
      { key: 'lysine', label: '赖氨酸', unit: 'g' },
      { key: 'methionine', label: '蛋氨酸', unit: 'g' },
      { key: 'cystine', label: '胱氨酸', unit: 'g' },
      { key: 'taurine', label: '牛磺酸', unit: 'g' },
      { key: 'tryptophan', label: '色氨酸', unit: 'g' },
      { key: 'threonine', label: '苏氨酸', unit: 'g' },
      { key: 'leucine', label: '亮氨酸', unit: 'g' },
      { key: 'isoleucine', label: '异亮氨酸', unit: 'g' },
      { key: 'valine', label: '缬氨酸', unit: 'g' },
      { key: 'phenylalanine', label: '苯丙氨酸', unit: 'g' },
      { key: 'tyrosine', label: '酪氨酸', unit: 'g' },
      { key: 'histidine', label: '组氨酸', unit: 'g' },
      { key: 'glutamicAcid', label: '谷氨酸', unit: 'g' },
      { key: 'glycine', label: '甘氨酸', unit: 'g' },
      { key: 'proline', label: '脯氨酸', unit: 'g' }
    ]
  }
] as const

export const INGREDIENT_NUTRITION_TAB_LABELS: Readonly<Record<IngredientNutritionTabKey, string>> =
  Object.fromEntries(
    INGREDIENT_NUTRITION_TAB_DEFINITIONS.map((tab) => [tab.key, tab.label])
  ) as Record<IngredientNutritionTabKey, string>

export const INGREDIENT_NUTRITION_FIELD_UNITS: Readonly<Record<string, string>> =
  Object.fromEntries(
    INGREDIENT_NUTRITION_TAB_DEFINITIONS.flatMap((tab) =>
      tab.fields.map((field) => [field.key, field.unit])
    )
  )

export const INGREDIENT_NUTRITION_TAB_EMPTY_RECORDS: Readonly<Record<IngredientNutritionTabKey, NutritionTabRecord>> =
  Object.fromEntries(
    INGREDIENT_NUTRITION_TAB_DEFINITIONS.map((tab) => [
      tab.key,
      Object.fromEntries(tab.fields.map((field) => [field.key, null]))
    ])
  ) as Record<IngredientNutritionTabKey, NutritionTabRecord>
