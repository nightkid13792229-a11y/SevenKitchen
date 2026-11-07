/**
 * 顾客备注里的过敏提醒：只认“过敏”，但排除“不过敏 / 无过敏 / 过敏已排除”这类否定说法。
 * 备注是自由文本，做不到 100% 准确；这里只负责把明显误报压掉，真正的结构化过敏原仍应另做。
 */
const NEGATIONS = ['不过敏', '无过敏', '过敏已排除', '没有过敏'];

export function hasAllergyText(note?: string | null): boolean {
  const text = String(note || '');
  if (!text.includes('过敏')) return false;
  return !NEGATIONS.some((negation) => text.includes(negation));
}
