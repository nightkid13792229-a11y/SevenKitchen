/**
 * 从标签原文里认「这是哪种盐」，翻成《饲料添加剂品种目录》里用的中文前缀。
 *
 * 只做「词 → 中文盐名」这一层，不猜目录条目：目录查不到就留空，
 * 由人去填——标签名印错是要下架的，不能拿近似名凑。
 */

const SALT_ZH: { pattern: RegExp; zh: string }[] = [
  { pattern: /bisglycinate|bis-glycinate|glycinate/i, zh: '甘氨酸' },
  { pattern: /proteinate/i, zh: '蛋白' },
  { pattern: /pyrophosphate/i, zh: '焦磷酸' },
  { pattern: /gluconate/i, zh: '葡萄糖酸' },
  { pattern: /fumarate/i, zh: '富马酸' },
  { pattern: /citrate/i, zh: '柠檬酸' },
  { pattern: /lactate/i, zh: '乳酸' },
  { pattern: /carbonate/i, zh: '碳酸' },
  { pattern: /sulfate|sulphate/i, zh: '硫酸' },
  { pattern: /chloride/i, zh: '氯化' },
  { pattern: /oxide/i, zh: '氧化' },
  { pattern: /malate/i, zh: '苹果酸' },
  { pattern: /succinate/i, zh: '琥珀酸' },
  { pattern: /picolinate/i, zh: '吡啶甲酸' },
  { pattern: /orotate/i, zh: '乳清酸' },
  { pattern: /yeast/i, zh: '酵母' },
];

/** 标签里出现哪种盐，返回中文前缀；认不出返回 null（不猜）。 */
export function detectSaltNameZh(text: string): string | null {
  const source = String(text ?? '');
  for (const item of SALT_ZH) {
    if (item.pattern.test(source)) {
      return item.zh;
    }
  }
  return null;
}

/** 目录检索词：有盐名就「盐名 + 营养素」，没有就只查营养素。 */
export function buildCatalogQuery(nutrientLabel: string, labelText: string): string {
  const salt = detectSaltNameZh(labelText);
  return salt ? `${salt}${nutrientLabel}` : nutrientLabel;
}
