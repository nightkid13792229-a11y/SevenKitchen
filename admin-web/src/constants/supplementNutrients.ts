/**
 * 补剂营养字段组（与小程序端保持一致）
 */
export interface SupplementNutrientField {
  fieldPath: string
  label: string
  unit: string
  common?: boolean
}

export interface SupplementNutrientGroup {
  key: string
  title: string
  fields: SupplementNutrientField[]
}

export const supplementNutrientGroups: SupplementNutrientGroup[] = [
  {
    key: 'minerals',
    title: '矿物质',
    fields: [
      { fieldPath: 'minerals.calcium', label: '钙', unit: 'mg', common: true },
      { fieldPath: 'minerals.phosphorus', label: '磷', unit: 'mg', common: true },
      { fieldPath: 'minerals.potassium', label: '钾', unit: 'mg' },
      { fieldPath: 'minerals.sodium', label: '钠', unit: 'mg' },
      { fieldPath: 'minerals.magnesium', label: '镁', unit: 'mg' },
      { fieldPath: 'minerals.chloride', label: '氯', unit: 'mg' },
      { fieldPath: 'minerals.iron', label: '铁', unit: 'mg' },
      { fieldPath: 'minerals.zinc', label: '锌', unit: 'mg', common: true },
      { fieldPath: 'minerals.copper', label: '铜', unit: 'mg' },
      { fieldPath: 'minerals.manganese', label: '锰', unit: 'mg' },
      { fieldPath: 'minerals.selenium', label: '硒', unit: 'μg' },
      { fieldPath: 'minerals.iodine', label: '碘', unit: 'μg' }
    ]
  },
  {
    key: 'vitamins',
    title: '维生素',
    fields: [
      { fieldPath: 'vitamins.vitaminA', label: '维生素 A', unit: 'IU' },
      { fieldPath: 'vitamins.vitaminD', label: '维生素 D', unit: 'IU', common: true },
      { fieldPath: 'vitamins.vitaminE', label: '维生素 E', unit: 'IU', common: true },
      { fieldPath: 'vitamins.vitaminK', label: '维生素 K', unit: 'μg' },
      { fieldPath: 'vitamins.vitaminB1', label: '维生素 B1', unit: 'mg' },
      { fieldPath: 'vitamins.vitaminB2', label: '维生素 B2', unit: 'mg' },
      { fieldPath: 'vitamins.vitaminB3', label: '维生素 B3', unit: 'mg' },
      { fieldPath: 'vitamins.vitaminB5', label: '维生素 B5', unit: 'mg' },
      { fieldPath: 'vitamins.vitaminB6', label: '维生素 B6', unit: 'mg' },
      { fieldPath: 'vitamins.vitaminB7', label: '维生素 B7', unit: 'μg' },
      { fieldPath: 'vitamins.vitaminB9', label: '维生素 B9', unit: 'μg' },
      { fieldPath: 'vitamins.vitaminB12', label: '维生素 B12', unit: 'μg' },
      { fieldPath: 'vitamins.choline', label: '胆碱', unit: 'mg' },
      { fieldPath: 'vitamins.vitaminC', label: '维生素 C', unit: 'mg' }
    ]
  },
  {
    key: 'fattyAcids',
    title: '脂肪酸',
    fields: [
      { fieldPath: 'fattyAcids.saturatedFattyAcids', label: '饱和脂肪酸', unit: 'g' },
      { fieldPath: 'fattyAcids.monounsaturatedFattyAcids', label: '单不饱和脂肪酸', unit: 'g' },
      { fieldPath: 'fattyAcids.polyunsaturatedFattyAcids', label: '多不饱和脂肪酸', unit: 'g' },
      { fieldPath: 'fattyAcids.linoleicAcid', label: '亚油酸', unit: 'g' },
      { fieldPath: 'fattyAcids.alphaLinolenicAcid', label: 'α-亚麻酸', unit: 'g' },
      { fieldPath: 'fattyAcids.arachidonicAcid', label: '花生四烯酸', unit: 'g' },
      { fieldPath: 'fattyAcids.epa', label: 'EPA', unit: 'mg', common: true },
      { fieldPath: 'fattyAcids.dpa', label: 'DPA', unit: 'mg' },
      { fieldPath: 'fattyAcids.dha', label: 'DHA', unit: 'mg', common: true }
    ]
  },
  {
    key: 'aminoAcids',
    title: '氨基酸',
    fields: [
      { fieldPath: 'aminoAcids.arginine', label: '精氨酸', unit: 'g' },
      { fieldPath: 'aminoAcids.lysine', label: '赖氨酸', unit: 'g' },
      { fieldPath: 'aminoAcids.methionine', label: '蛋氨酸', unit: 'g' },
      { fieldPath: 'aminoAcids.cystine', label: '胱氨酸', unit: 'g' },
      { fieldPath: 'aminoAcids.taurine', label: '牛磺酸', unit: 'g', common: true },
      { fieldPath: 'aminoAcids.tryptophan', label: '色氨酸', unit: 'g' },
      { fieldPath: 'aminoAcids.threonine', label: '苏氨酸', unit: 'g' },
      { fieldPath: 'aminoAcids.leucine', label: '亮氨酸', unit: 'g' },
      { fieldPath: 'aminoAcids.isoleucine', label: '异亮氨酸', unit: 'g' },
      { fieldPath: 'aminoAcids.valine', label: '缬氨酸', unit: 'g' },
      { fieldPath: 'aminoAcids.phenylalanine', label: '苯丙氨酸', unit: 'g' },
      { fieldPath: 'aminoAcids.tyrosine', label: '酪氨酸', unit: 'g' },
      { fieldPath: 'aminoAcids.histidine', label: '组氨酸', unit: 'g' },
      { fieldPath: 'aminoAcids.glutamicAcid', label: '谷氨酸', unit: 'g' },
      { fieldPath: 'aminoAcids.glycine', label: '甘氨酸', unit: 'g' },
      { fieldPath: 'aminoAcids.proline', label: '脯氨酸', unit: 'g' }
    ]
  },
  {
    key: 'macros',
    title: '基础营养',
    fields: [
      { fieldPath: 'macros.energyKcal', label: '能量', unit: 'kcal' },
      { fieldPath: 'macros.moisture', label: '水分', unit: 'g' },
      { fieldPath: 'macros.crudeProtein', label: '粗蛋白', unit: 'g' },
      { fieldPath: 'macros.crudeFat', label: '粗脂肪', unit: 'g' },
      { fieldPath: 'macros.ash', label: '灰分', unit: 'g' },
      { fieldPath: 'macros.carbohydrate', label: '碳水化合物', unit: 'g' },
      { fieldPath: 'macros.fiber', label: '膳食纤维', unit: 'g' },
      { fieldPath: 'macros.solubleFiber', label: '可溶性纤维', unit: 'g' },
      { fieldPath: 'macros.insolubleFiber', label: '不可溶性纤维', unit: 'g' }
    ]
  }
]

export const supplementUsageUnitOptions = ['g', 'ml', '粒', '片', '胶囊', '平勺', '份'] as const

export const supplementServingBasisLabels: Record<string, string> = {
  g: '每1g',
  ml: '每1ml',
  粒: '每粒',
  片: '每片',
  胶囊: '每胶囊',
  平勺: '每平勺',
  份: '每份'
}
