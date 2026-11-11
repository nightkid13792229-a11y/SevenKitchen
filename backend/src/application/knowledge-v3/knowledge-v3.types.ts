/**
 * 知识库 v3 对外契约类型（设计 §6）。
 *
 * 只有 3 个工具：kb_catalog / kb_find / kb_read。
 * 页是原子单位：`kb_read` 一次返回多页（文本 + 块结构 + 页图 + 锚点），
 * 不返回结论/摘要，也不判断“知识库是否覆盖”。
 */

export type KnowledgeToolName = 'kb_catalog' | 'kb_find' | 'kb_read';

export interface KbSourceSummary {
  id: string;
  collection: string;
  title: string;
  publisher: string | null;
  version: string | null;
  publishedYear: number | null;
  status: string | null;
  license: string | null;
  pageCount: number;
  hasTextLayer: boolean;
}

export interface KbTocEntry {
  id: string;
  title: string;
  level: number;
  pageFrom: number;
  pageTo: number;
}

export interface KbCatalogResult {
  sources: KbSourceSummary[];
  toc?: KbTocEntry[];
}

export interface KbFindHit {
  documentId: string;
  pageNo: number;
  chapter: string | null;
  blockId: string | null;
  kind: 'page' | 'table' | 'figure';
  snippet: string;
  score: number;
  anchor: string;
}

export interface KbFindResult {
  hits: KbFindHit[];
  searched: { documents: number; pages: number };
}

export type KbBlockKind =
  | 'heading'
  | 'paragraph'
  | 'table'
  | 'figure'
  | 'footnote';

export interface KbBbox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface KbBlock {
  id: string;
  kind: KbBlockKind;
  bbox: KbBbox;
  /** 块文本；`kb_read` 返回结构时省略，避免与 page.text 重复 */
  text: string | null;
  caption: string | null;
  anchor: string;
}

export interface KbPage {
  pageNo: number;
  text: string;
  blocks: KbBlock[];
  /** 相对 KB_PAGE_IMAGE_ROOT 的路径；无页图（如非 PDF）为 null */
  imagePath: string | null;
  imageMime: 'image/jpeg' | null;
  /** JPEG base64；仅 includeImages 且未超图片张数上限时返回 */
  imageBase64: string | null;
  anchor: string;
}

export interface KbReadResult {
  documentId: string;
  pages: KbPage[];
  nextCursor: string | null;
  version: string;
}

export interface KbCatalogArgs {
  collection?: string;
  documentId?: string;
}

export interface KbFindArgs {
  query: string;
  collections?: string[];
  documentIds?: string[];
  limit?: number;
}

export interface KbReadArgs {
  documentId: string;
  pageFrom?: number;
  pageTo?: number;
  tocId?: string;
  includeImages?: boolean;
  budgetTokens?: number;
  cursor?: string;
}

/** `kb_read` 续读游标：base64url(JSON)，见 knowledge-v3.anchors.ts */
export interface ReadCursor {
  documentId: string;
  /** 下一次读取的起始页（含） */
  nextPage: number;
  /** 本次阅读的结束页（含），游标续读时沿用 */
  endPage: number;
  includeImages: boolean;
  budgetTokens: number;
}

export type KnowledgeToolResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };
