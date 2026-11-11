import { KnowledgeToolError } from './knowledge-v3.errors';
import type { ReadCursor } from './knowledge-v3.types';

/**
 * 知识库 v3 跨层工具函数：锚点、续读游标、token 估算。
 *
 * 锚点自描述、可持久化（设计 §5.1）：
 *   - 页：`{sourceId}/p{pageNo}`
 *   - 块：`{sourceId}/p{pageNo}#b{order:4}`
 * 不使用会话内 K#，也不需要额外的 resolve 工具。
 */

const ANCHOR_PATTERN = /^([^/]+)\/p(\d+)(?:#b(\d+))?$/;
const BLOCK_ORDER_WIDTH = 4;

export interface ParsedAnchor {
  documentId: string;
  pageNo: number;
  /** 页锚点无此字段；块锚点为块的顺序号 */
  blockOrder?: number;
}

export function pageAnchor(sourceId: string, pageNo: number): string {
  return `${sourceId}/p${pageNo}`;
}

export function blockAnchor(
  sourceId: string,
  pageNo: number,
  orderIndex: number,
): string {
  return `${sourceId}/p${pageNo}#b${String(orderIndex).padStart(BLOCK_ORDER_WIDTH, '0')}`;
}

export function parseAnchor(anchor: string): ParsedAnchor {
  const matched = ANCHOR_PATTERN.exec(anchor);
  if (!matched) {
    throw new KnowledgeToolError(
      'INVALID_ARGUMENT',
      `INVALID_ARGUMENT: 锚点格式非法，应为 "{documentId}/p{pageNo}" 或 "{documentId}/p{pageNo}#b{order}"：${anchor}`,
    );
  }

  const parsed: ParsedAnchor = {
    documentId: matched[1],
    pageNo: Number(matched[2]),
  };
  if (matched[3] !== undefined) {
    parsed.blockOrder = Number(matched[3]);
  }
  return parsed;
}

/**
 * 续读游标：base64url(JSON)。调用方原样带回即可，不需要理解内容。
 * 解码失败一律 `INVALID_CURSOR`，不泄露内部细节。
 */
export function encodeReadCursor(cursor: ReadCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeReadCursor(raw: string): ReadCursor {
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    throw new KnowledgeToolError(
      'INVALID_CURSOR',
      'INVALID_CURSOR: 游标无法解码，请原样传入上次 kb_read 返回的 nextCursor',
    );
  }

  if (!isReadCursor(decoded)) {
    throw new KnowledgeToolError(
      'INVALID_CURSOR',
      'INVALID_CURSOR: 游标缺少必要字段，请原样传入上次 kb_read 返回的 nextCursor',
    );
  }
  return decoded;
}

function isReadCursor(value: unknown): value is ReadCursor {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.documentId === 'string' &&
    candidate.documentId.length > 0 &&
    Number.isInteger(candidate.nextPage) &&
    Number.isInteger(candidate.endPage) &&
    typeof candidate.includeImages === 'boolean' &&
    Number.isInteger(candidate.budgetTokens)
  );
}

/**
 * 保守的 token 估算（不调用 tokenizer）：
 * CJK 1 token/字，非 CJK 1 token/4 字符，向上取整。
 * 中英混排时取两者之和，不低估；宁可提前截断，也不超预算。
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;

  let cjkCount = 0;
  let otherCount = 0;
  for (const char of text) {
    if (isCjkCodePoint(char.codePointAt(0) as number)) {
      cjkCount += 1;
    } else {
      otherCount += 1;
    }
  }
  return cjkCount + Math.ceil(otherCount / 4);
}

function isCjkCodePoint(codePoint: number): boolean {
  return (
    (codePoint >= 0x3000 && codePoint <= 0x303f) || // CJK 标点
    (codePoint >= 0x3040 && codePoint <= 0x30ff) || // 日文假名
    (codePoint >= 0x3400 && codePoint <= 0x4dbf) || // 汉字扩展 A
    (codePoint >= 0x4e00 && codePoint <= 0x9fff) || // 汉字基本区
    (codePoint >= 0xac00 && codePoint <= 0xd7af) || // 谚文
    (codePoint >= 0xf900 && codePoint <= 0xfaff) || // 汉字兼容区
    (codePoint >= 0x20000 && codePoint <= 0x2fa1f) // 汉字扩展 B–F
  );
}
