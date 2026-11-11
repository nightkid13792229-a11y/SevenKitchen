import { Injectable } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { PrismaService } from '../../infrastructure/prisma.service';
import {
  blockAnchor,
  decodeReadCursor,
  encodeReadCursor,
  estimateTokens,
  pageAnchor,
} from './knowledge-v3.anchors';
import { KnowledgeToolError } from './knowledge-v3.errors';
import type {
  KbBlock,
  KbBlockKind,
  KbBbox,
  KbPage,
  KbReadArgs,
  KbReadResult,
} from './knowledge-v3.types';
import { PageImageService } from './page-image.service';

/**
 * `kb_read` 的数据层（设计 §6.4）：按页读原文 + 结构 + 页图。
 *
 * - 范围优先级：cursor > tocId > pageFrom/pageTo > 默认 1..min(5,pageCount)；
 * - 一次最多给 5 张页图 base64，其余页只给 `imagePath`；
 * - 预算只算 `page.text`（图片不参与），至少返回 1 页，避免死循环；
 * - blocks 只返回结构（kind/bbox/caption/anchor），不重复 page.text；
 * - 不返回结论/摘要，也不判断“知识库是否覆盖”。
 */

const DEFAULT_BUDGET_TOKENS = 20_000;
const MAX_BUDGET_TOKENS = 200_000;
const DEFAULT_PAGE_WINDOW = 5;
const MAX_INLINE_IMAGES = 5;

const BLOCK_KINDS: readonly KbBlockKind[] = [
  'heading',
  'paragraph',
  'table',
  'figure',
  'footnote',
];

interface ReadRange {
  fromPage: number;
  endPage: number;
  includeImages: boolean;
  budgetTokens: number;
}

interface ReadRow {
  pageNo: number;
  text: string;
  imagePath: string | null;
  blocks: Array<{
    id: string;
    kind: string;
    bbox: unknown;
    caption: string | null;
    orderIndex: number;
  }>;
}

@Injectable()
export class KnowledgeReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly images: PageImageService,
  ) {}

  async read(args: KbReadArgs): Promise<KbReadResult> {
    const documentId = normalizeDocumentId(args?.documentId);

    const source = await this.prisma.kbSource.findUnique({
      where: { id: documentId },
      select: { id: true, pageCount: true, updatedAt: true },
    });
    if (!source) {
      throw new KnowledgeToolError(
        'SOURCE_NOT_FOUND',
        `SOURCE_NOT_FOUND: document ${documentId} not found`,
      );
    }

    const version = new Date(source.updatedAt).toISOString();
    const pageCount = Number(source.pageCount);
    if (!Number.isInteger(pageCount) || pageCount < 1) {
      return { documentId, pages: [], nextCursor: null, version };
    }

    const range = await this.resolveRange(args, documentId, pageCount);

    const rows = (await this.prisma.kbPage.findMany({
      where: {
        sourceId: documentId,
        pageNo: { gte: range.fromPage, lte: range.endPage },
      },
      include: { blocks: { orderBy: { orderIndex: 'asc' } } },
      orderBy: { pageNo: 'asc' },
    })) as unknown as ReadRow[];

    const pages: KbPage[] = [];
    let usedTokens = 0;
    let inlineImages = 0;

    for (const row of rows) {
      const pageTokens = estimateTokens(row.text ?? '');
      // 加入当前页后超预算且已有页 → 停；第一页无论多大都返回。
      if (pages.length > 0 && usedTokens + pageTokens > range.budgetTokens) {
        break;
      }

      const page = await this.buildPage(
        row,
        documentId,
        range.includeImages,
        inlineImages,
      );
      if (page.imageBase64 !== null) inlineImages += 1;
      pages.push(page);
      usedTokens += pageTokens;
    }

    const lastPage = pages[pages.length - 1]?.pageNo;
    const nextCursor =
      lastPage !== undefined && lastPage < range.endPage
        ? encodeReadCursor({
            documentId,
            nextPage: lastPage + 1,
            endPage: range.endPage,
            includeImages: range.includeImages,
            budgetTokens: range.budgetTokens,
          })
        : null;

    return { documentId, pages, nextCursor, version };
  }

  private async resolveRange(
    args: KbReadArgs,
    documentId: string,
    pageCount: number,
  ): Promise<ReadRange> {
    if (args?.cursor !== undefined && args.cursor !== null) {
      const cursor = decodeReadCursor(String(args.cursor));
      if (cursor.documentId !== documentId) {
        throw new KnowledgeToolError(
          'INVALID_CURSOR',
          'INVALID_CURSOR: 游标属于其他文档，请按 documentId 重新读取',
        );
      }
      if (cursor.nextPage < 1 || cursor.endPage < cursor.nextPage) {
        throw new KnowledgeToolError(
          'INVALID_CURSOR',
          'INVALID_CURSOR: 游标页码非法，请原样传入上次 kb_read 返回的 nextCursor',
        );
      }

      const range: ReadRange = {
        fromPage: cursor.nextPage,
        endPage: cursor.endPage,
        includeImages:
          typeof args.includeImages === 'boolean'
            ? args.includeImages
            : cursor.includeImages,
        budgetTokens: normalizeBudget(
          args.budgetTokens === undefined
            ? cursor.budgetTokens
            : args.budgetTokens,
        ),
      };
      assertInRange(range.fromPage, range.endPage, pageCount);
      return range;
    }

    const includeImages =
      typeof args?.includeImages === 'boolean' ? args.includeImages : true;
    const budgetTokens = normalizeBudget(args?.budgetTokens);

    if (args?.tocId !== undefined) {
      const tocId = typeof args.tocId === 'string' ? args.tocId.trim() : '';
      if (!tocId) {
        throw new KnowledgeToolError(
          'INVALID_ARGUMENT',
          'INVALID_ARGUMENT: tocId 不能为空',
        );
      }

      const toc = await this.prisma.kbToc.findUnique({ where: { id: tocId } });
      if (!toc || toc.sourceId !== documentId) {
        throw new KnowledgeToolError(
          'TOC_NOT_FOUND',
          `TOC_NOT_FOUND: toc ${tocId} not found in document ${documentId}`,
        );
      }

      const range: ReadRange = {
        fromPage: toc.pageFrom,
        endPage: toc.pageTo,
        includeImages,
        budgetTokens,
      };
      assertInRange(range.fromPage, range.endPage, pageCount);
      return range;
    }

    if (args?.pageFrom !== undefined) {
      const fromPage = normalizePage(args.pageFrom, 'pageFrom');
      const explicitTo =
        args.pageTo === undefined ? null : normalizePage(args.pageTo, 'pageTo');
      if (explicitTo !== null && explicitTo < fromPage) {
        throw new KnowledgeToolError(
          'INVALID_ARGUMENT',
          'INVALID_ARGUMENT: pageTo 不能小于 pageFrom',
        );
      }

      const range: ReadRange = {
        fromPage,
        endPage:
          explicitTo ?? Math.min(fromPage + DEFAULT_PAGE_WINDOW - 1, pageCount),
        includeImages,
        budgetTokens,
      };
      assertInRange(range.fromPage, range.endPage, pageCount);
      return range;
    }

    if (args?.pageTo !== undefined) {
      const range: ReadRange = {
        fromPage: 1,
        endPage: normalizePage(args.pageTo, 'pageTo'),
        includeImages,
        budgetTokens,
      };
      assertInRange(range.fromPage, range.endPage, pageCount);
      return range;
    }

    const range: ReadRange = {
      fromPage: 1,
      endPage: Math.min(DEFAULT_PAGE_WINDOW, pageCount),
      includeImages,
      budgetTokens,
    };
    assertInRange(range.fromPage, range.endPage, pageCount);
    return range;
  }

  private async buildPage(
    row: ReadRow,
    documentId: string,
    includeImages: boolean,
    inlineImageCount: number,
  ): Promise<KbPage> {
    const pageNo = row.pageNo;
    const blocks: KbBlock[] = (row.blocks ?? []).map((block) => ({
      id: block.id,
      kind: normalizeBlockKind(block.kind),
      bbox: normalizeBbox(block.bbox),
      // 正文统一由 page.text 提供，块结构不重复。
      text: null,
      caption: block.caption ?? null,
      anchor: blockAnchor(documentId, pageNo, block.orderIndex),
    }));

    let imagePath: string | null = null;
    let imageMime: 'image/jpeg' | null = null;
    let imageBase64: string | null = null;

    if (includeImages && row.imagePath) {
      const resolved = await this.images.resolve(documentId, pageNo);
      if (resolved) {
        if (inlineImageCount >= MAX_INLINE_IMAGES) {
          // 超过 5 张不再读文件，只给相对路径。
          imagePath = row.imagePath;
          imageMime = resolved.mime;
        } else {
          const base64 = await readImageBase64(resolved.absolutePath);
          if (base64 !== null) {
            imagePath = row.imagePath;
            imageMime = resolved.mime;
            imageBase64 = base64;
          }
        }
      }
    }

    return {
      pageNo,
      text: row.text ?? '',
      blocks,
      imagePath,
      imageMime,
      imageBase64,
      anchor: pageAnchor(documentId, pageNo),
    };
  }
}

function normalizeDocumentId(value: unknown): string {
  const documentId = typeof value === 'string' ? value.trim() : '';
  if (!documentId) {
    throw new KnowledgeToolError(
      'INVALID_ARGUMENT',
      'INVALID_ARGUMENT: documentId 不能为空',
    );
  }
  return documentId;
}

function normalizePage(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new KnowledgeToolError(
      'INVALID_ARGUMENT',
      `INVALID_ARGUMENT: ${field} 必须是 >=1 的整数`,
    );
  }
  return value;
}

function normalizeBudget(value: unknown): number {
  if (value === undefined || value === null) {
    return DEFAULT_BUDGET_TOKENS;
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) {
    throw new KnowledgeToolError(
      'INVALID_ARGUMENT',
      `INVALID_ARGUMENT: budgetTokens 必须是 >=1 的数字（最大 ${MAX_BUDGET_TOKENS}）`,
    );
  }
  return Math.min(Math.floor(value), MAX_BUDGET_TOKENS);
}

function assertInRange(
  fromPage: number,
  endPage: number,
  pageCount: number,
): void {
  if (
    !Number.isInteger(fromPage) ||
    fromPage < 1 ||
    fromPage > pageCount ||
    !Number.isInteger(endPage) ||
    endPage < fromPage ||
    endPage > pageCount
  ) {
    throw new KnowledgeToolError(
      'PAGE_OUT_OF_RANGE',
      `PAGE_OUT_OF_RANGE: 请求页码 ${fromPage}..${endPage} 超出 1..${pageCount}`,
    );
  }
}

function normalizeBlockKind(kind: string): KbBlockKind {
  return BLOCK_KINDS.includes(kind as KbBlockKind)
    ? (kind as KbBlockKind)
    : 'paragraph';
}

function normalizeBbox(value: unknown): KbBbox {
  const source =
    typeof value === 'object' && value !== null
      ? (value as Record<string, unknown>)
      : {};
  return {
    x0: toFiniteNumber(source.x0),
    y0: toFiniteNumber(source.y0),
    x1: toFiniteNumber(source.x1),
    y1: toFiniteNumber(source.y1),
  };
}

function toFiniteNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

async function readImageBase64(absolutePath: string): Promise<string | null> {
  try {
    return (await readFile(absolutePath)).toString('base64');
  } catch {
    // 定位后被删/权限变化：按“无页图”处理，不让整次 read 失败。
    return null;
  }
}
