/**
 * 形态词的写法归一。
 *
 * 同一个东西会有很多写法：`bisglycinate` / `bis-glycinate` / `Bis Glycinate` / `甘氨酸螯合`。
 * 这里只负责生成"这个写法应该被哪些键找到"，真正的合并关系存在 `supplement_form_term` 表里，
 * 认错的由人改一次，之后所有请求都受益。
 */
import { normalizeTermKey } from './supplement-form-candidates';

/** 一种写法对应的一组别名（原样、小写、去掉分隔符）。 */
export function buildAliases(raw: string): string[] {
  const text = String(raw ?? '').trim();
  if (!text) {
    return [];
  }
  return [...new Set([text, text.toLowerCase(), normalizeTermKey(text)].filter(Boolean))];
}
