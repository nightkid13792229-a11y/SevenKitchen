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
  // 先按原样比，再按清洗后的比：`Copper(II) oxide` 这类带价态的写法，清洗会把括号抹掉
  const surfaces = [normalizeTermKey(term.surface), normalizeTermKey(cleanSurface(term.surface))]
    .filter(Boolean);
  const surface = surfaces.find((item) => pageText.includes(item));
  if (!surface) {
    return false;
  }
  const quote = normalizeTermKey(term.quote);
  if (quote.length < 8 || !pageText.includes(quote)) {
    return false;
  }
  // 光"词在这页、句在这页"不够：那句原话本身得提到这个词，
  // 否则 AVOID 可以挂在一句完全无关的句子上（2026-11-20 复核实测）。
  return quote.includes(surface);
}
