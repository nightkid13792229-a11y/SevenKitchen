/**
 * 补剂营养素的两种名字：给 iHerb 搜索用的英文，和给人看的英文名。
 *
 * 只收补剂线真的会比价的那些；认不出的键退化成字段名本身，
 * 让人一眼看出"这里没配"，而不是悄悄搜一个空词。
 */

const NUTRIENT_EN: Record<string, string> = {
  'minerals.calcium': 'calcium',
  'minerals.phosphorus': 'phosphorus',
  'minerals.potassium': 'potassium',
  'minerals.sodium': 'sodium',
  'minerals.magnesium': 'magnesium',
  'minerals.iron': 'iron',
  'minerals.zinc': 'zinc',
  'minerals.copper': 'copper',
  'minerals.manganese': 'manganese',
  'minerals.selenium': 'selenium',
  'minerals.iodine': 'iodine',
  'vitamins.vitaminA': 'vitamin a',
  'vitamins.vitaminD': 'vitamin d3',
  'vitamins.vitaminE': 'vitamin e',
  'vitamins.vitaminC': 'vitamin c',
  'vitamins.vitaminK': 'vitamin k2',
  'fattyAcids.epa': 'omega 3 fish oil',
  'fattyAcids.dha': 'omega 3 fish oil',
  'aminoAcids.lysine': 'lysine',
  'aminoAcids.methionine': 'methionine',
};

const NUTRIENT_ZH: Record<string, string> = {
  'minerals.calcium': '钙',
  'minerals.phosphorus': '磷',
  'minerals.potassium': '钾',
  'minerals.sodium': '钠',
  'minerals.magnesium': '镁',
  'minerals.iron': '铁',
  'minerals.zinc': '锌',
  'minerals.copper': '铜',
  'minerals.manganese': '锰',
  'minerals.selenium': '硒',
  'minerals.iodine': '碘',
  'vitamins.vitaminA': '维生素 A',
  'vitamins.vitaminD': '维生素 D',
  'vitamins.vitaminE': '维生素 E',
  'vitamins.vitaminC': '维生素 C',
  'vitamins.vitaminK': '维生素 K',
  'fattyAcids.epa': 'EPA',
  'fattyAcids.dha': 'DHA',
};

export function nutrientEnglishName(nutrientKey: string): string {
  return NUTRIENT_EN[nutrientKey] ?? nutrientKey.split('.').pop() ?? nutrientKey;
}

export function nutrientChineseLabel(nutrientKey: string): string {
  return NUTRIENT_ZH[nutrientKey] ?? nutrientKey.split('.').pop() ?? nutrientKey;
}
