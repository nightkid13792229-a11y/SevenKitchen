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
  'vitamins.vitaminB1': 'thiamine',
  'vitamins.vitaminB2': 'riboflavin',
  'vitamins.vitaminB3': 'niacin',
  'vitamins.vitaminB5': 'pantothenic acid',
  'vitamins.vitaminB6': 'vitamin b6',
  'vitamins.vitaminB7': 'biotin',
  'vitamins.vitaminB9': 'folate',
  'vitamins.vitaminB12': 'vitamin b12',
  'vitamins.choline': 'choline',
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
  'vitamins.vitaminK': '维生素 K2',
  'vitamins.vitaminB1': '维生素 B1',
  'vitamins.vitaminB2': '维生素 B2',
  'vitamins.vitaminB3': '维生素 B3',
  'vitamins.vitaminB5': '维生素 B5',
  'vitamins.vitaminB6': '维生素 B6',
  'vitamins.vitaminB7': '维生素 B7',
  'vitamins.vitaminB9': '维生素 B9',
  'vitamins.vitaminB12': '维生素 B12',
  'vitamins.choline': '胆碱',
  'fattyAcids.epa': 'EPA',
  'fattyAcids.dha': 'DHA',
};

/**
 * 认不出的字段也要能拿去检索：`vitaminB12` → `vitamin b12`。
 * 不这么拆的话，查出来是 "vitaminB12 bioavailability"，知识库一条都命不中
 * （2026-11-20 实测：B12 因为没有词条，页数为 0，整屏只剩市场候选）。
 */
function humanizeFieldName(raw: string): string {
  return raw
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Za-z])(\d)/g, '$1 $2')
    .replace(/(\d)([A-Za-z])/g, '$1 $2')
    .toLowerCase()
    .trim();
}

export function nutrientEnglishName(nutrientKey: string): string {
  return (
    NUTRIENT_EN[nutrientKey] ??
    humanizeFieldName(nutrientKey.split('.').pop() ?? nutrientKey)
  );
}

export function nutrientChineseLabel(nutrientKey: string): string {
  return NUTRIENT_ZH[nutrientKey] ?? nutrientKey.split('.').pop() ?? nutrientKey;
}
