/**
 * 知识库抽词的"防编"校验。
 *
 * 模型很容易顺手写出"文献说甘氨酸铜更好"——但那一页里根本没这句话。
 * 这里做两件最朴素也最有效的事：清洗词形、逐字比对。
 * 比不过就丢，不降级、不近似。
 */
import { normalizeTermKey } from './supplement-form-candidates';

export interface ReadPage {
  documentId: string;
  page: number;
  text: string;
}

export interface RawKbTerm {
  surface: string;
  quote: string;
  documentId: string;
  page: number;
}

/** 去掉引号、括号注释、首尾标点：`“copper oxide” (CuO)` → `copper oxide`。 */
export function cleanSurface(raw: string): string {
  return String(raw ?? '')
    .replace(/[“”"'‘’]/g, '')
    .replace(/[（(][^）)]*[）)]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,.;:、，。；：-]+|[\s,.;:、，。；：-]+$/g, '')
    .trim();
}

/**
 * 词与原句都必须能在**该页原文**里找到（忽略大小写与分隔符）。
 *
 * 找不到就返回 false —— 调用方据此丢掉这一条，而不是把页码改成"猜的"。
 */
export function verifyAgainstPages(term: RawKbTerm, pages: ReadPage[]): boolean {
  const page = pages.find(
    (item) => item.documentId === term.documentId && item.page === term.page,
  );
  if (!page) {
    return false;
  }
  const pageText = normalizeTermKey(page.text);
  const surface = normalizeTermKey(cleanSurface(term.surface));
  if (!surface || !pageText.includes(surface)) {
    return false;
  }
  const quote = normalizeTermKey(term.quote);
  if (quote.length < 8) {
    return false;
  }
  return pageText.includes(quote);
}
