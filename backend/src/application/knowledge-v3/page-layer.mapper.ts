import type { Prisma } from '@prisma/client';
import { KnowledgeToolError } from './knowledge-v3.errors';
import type { KbBlockKind, KbBbox } from './knowledge-v3.types';

/**
 * page-layer JSON（解析器产物，设计 §8.3）→ 知识库 v3 四实体的 Prisma 行。
 *
 * JSON 形状见 `docs/knowledge-base/tools/build-page-layer.py`：
 *   { source, pages: [{ pageNo, text, charCount, width, height, imagePath, blocks }], toc }
 *
 * 只有两层职责：
 * - `validatePageLayerFile`：结构/唯一性/页码范围校验，非法一律 `INVALID_ARGUMENT`；
 * - `mapPageLayerToRows`：生成确定性的页/块/目录行。
 *
 * ID 规则（设计 §5.1）：
 *   - 页：`{sourceId}-p{pageNo:04d}`（由本模块生成）；
 *   - 块：解析器已按同一规则生成 `{pageId}-b{order:04d}`，这里原样使用，不重算；
 *   - 目录：解析器生成 `{sourceId}-toc-{n}`，这里原样使用。
 */

/** validator 认识的块类型；与 schema 注释一致（heading/paragraph/table/figure/footnote） */
const BLOCK_KINDS: readonly KbBlockKind[] = [
  'heading',
  'paragraph',
  'table',
  'figure',
  'footnote',
];

const PAGE_ID_WIDTH = 4;

export interface PageLayerBlock {
  id: string;
  kind: KbBlockKind;
  bbox: KbBbox;
  text: string | null;
  caption: string | null;
  orderIndex: number;
}

export interface PageLayerPage {
  pageNo: number;
  /** 扫描件允许为空字符串；页图仍然存在 */
  text: string;
  /** 解析器给了就用；缺失时导入回退到 `text.length` */
  charCount?: number;
  width?: number | null;
  height?: number | null;
  /** 相对 `KB_PAGE_IMAGE_ROOT`；非 PDF 为 null */
  imagePath?: string | null;
  blocks: PageLayerBlock[];
}

export interface PageLayerTocEntry {
  id: string;
  title: string;
  level: number;
  pageFrom: number;
  pageTo: number;
  orderIndex: number;
}

export interface PageLayerSource {
  id: string;
  collection: string;
  title: string;
  publisher?: string | null;
  version?: string | null;
  publishedYear?: number | null;
  status?: string | null;
  license?: string | null;
  checksum: string;
  archivePath: string;
  pageCount: number;
  /** 缺省时按“是否存在非空页文本”推断，与设计 §5 的 hasTextLayer 含义一致 */
  hasTextLayer?: boolean;
}

export interface PageLayerFile {
  source: PageLayerSource;
  pages: PageLayerPage[];
  toc: PageLayerTocEntry[];
}

export interface PageLayerRows {
  source: Prisma.KbSourceCreateInput;
  pages: Prisma.KbPageCreateManyInput[];
  blocks: Prisma.KbBlockCreateManyInput[];
  toc: Prisma.KbTocCreateManyInput[];
}

/** 页 ID 是确定性的：`{sourceId}-p{pageNo:04d}`（设计 §5.1） */
export function pageLayerPageId(sourceId: string, pageNo: number): string {
  return `${sourceId}-p${String(pageNo).padStart(PAGE_ID_WIDTH, '0')}`;
}

/**
 * 校验解析产物；任何结构/唯一性/范围问题都抛 `INVALID_ARGUMENT`。
 * 只做“能不能安全入库”的判断，不改写任何内容。
 */
export function validatePageLayerFile(raw: unknown): PageLayerFile {
  const root = requireRecord(raw, 'page-layer 文件');
  const source = validateSource(root.source);
  const pages = validatePages(root.pages, source.pageCount);
  const toc = validateToc(root.toc, source.pageCount);

  return { source, pages, toc };
}

/**
 * 生成四类行。页/块/目录的 ID 全部可复现，重复导入得到同一份数据。
 */
export function mapPageLayerToRows(file: PageLayerFile): PageLayerRows {
  const sourceId = file.source.id;

  const source: Prisma.KbSourceCreateInput = {
    id: sourceId,
    collection: file.source.collection,
    title: file.source.title,
    publisher: file.source.publisher ?? null,
    version: file.source.version ?? null,
    publishedYear: file.source.publishedYear ?? null,
    status: file.source.status ?? null,
    license: file.source.license ?? null,
    checksum: file.source.checksum,
    archivePath: file.source.archivePath,
    pageCount: file.source.pageCount,
    hasTextLayer:
      file.source.hasTextLayer ??
      file.pages.some((page) => page.text.trim().length > 0),
  };

  const pages: Prisma.KbPageCreateManyInput[] = file.pages.map((page) => ({
    id: pageLayerPageId(sourceId, page.pageNo),
    sourceId,
    pageNo: page.pageNo,
    text: page.text,
    charCount: page.charCount ?? page.text.length,
    width: page.width ?? null,
    height: page.height ?? null,
    imagePath: page.imagePath ?? null,
    imageRenderedAt: null,
  }));

  const blocks: Prisma.KbBlockCreateManyInput[] = [];
  for (const page of file.pages) {
    const pageId = pageLayerPageId(sourceId, page.pageNo);
    for (const block of page.blocks) {
      blocks.push({
        id: block.id,
        pageId,
        kind: block.kind,
        bbox: {
          x0: block.bbox.x0,
          y0: block.bbox.y0,
          x1: block.bbox.x1,
          y1: block.bbox.y1,
        },
        text: block.text ?? null,
        caption: block.caption ?? null,
        orderIndex: block.orderIndex,
      });
    }
  }

  const toc: Prisma.KbTocCreateManyInput[] =
    file.toc.length > 0
      ? file.toc.map((entry) => ({
          id: entry.id,
          sourceId,
          title: entry.title,
          level: entry.level,
          pageFrom: entry.pageFrom,
          pageTo: entry.pageTo,
          orderIndex: entry.orderIndex,
        }))
      : [wholeDocumentToc(sourceId, file.source.pageCount)];

  return { source, pages, blocks, toc };
}

/** 没有目录的文档写一条“全文 1..N”（设计 §8.1） */
function wholeDocumentToc(
  sourceId: string,
  pageCount: number,
): Prisma.KbTocCreateManyInput {
  return {
    id: `${sourceId}-toc-1`,
    sourceId,
    title: `全文 1..${pageCount}`,
    level: 1,
    pageFrom: 1,
    pageTo: pageCount,
    orderIndex: 1,
  };
}

// ---------------------------------------------------------------------------
// 校验
// ---------------------------------------------------------------------------

function invalid(detail: string): never {
  throw new KnowledgeToolError('INVALID_ARGUMENT', `INVALID_ARGUMENT: ${detail}`);
}

function requireRecord(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    invalid(`${label} 必须是对象`);
  }
  return value as Record<string, unknown>;
}

function requireText(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    invalid(`${label} 必须是非空字符串`);
  }
  return value;
}

function optionalText(value: unknown, label: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    invalid(`${label} 必须是字符串或 null`);
  }
  return value;
}

function requireNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    invalid(`${label} 必须是有限数字`);
  }
  return value;
}

function optionalNumber(value: unknown, label: string): number | null {
  if (value === undefined || value === null) return null;
  return requireNumber(value, label);
}

function requireInt(
  value: unknown,
  label: string,
  range: { min?: number; max?: number } = {},
): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    invalid(`${label} 必须是整数`);
  }
  if (range.min !== undefined && value < range.min) {
    invalid(`${label} 必须 >= ${range.min}，实际 ${value}`);
  }
  if (range.max !== undefined && value > range.max) {
    invalid(`${label} 必须 <= ${range.max}，实际 ${value}`);
  }
  return value;
}

function optionalInt(
  value: unknown,
  label: string,
  range: { min?: number; max?: number } = {},
): number | null {
  if (value === undefined || value === null) return null;
  return requireInt(value, label, range);
}

function validateSource(value: unknown): PageLayerSource {
  const raw = requireRecord(value, 'page-layer.source');
  const hasTextLayer = raw.hasTextLayer;
  if (hasTextLayer !== undefined && typeof hasTextLayer !== 'boolean') {
    invalid('source.hasTextLayer 必须是布尔值');
  }

  return {
    id: requireText(raw.id, 'source.id'),
    collection: requireText(raw.collection, 'source.collection'),
    title: requireText(raw.title, 'source.title'),
    publisher: optionalText(raw.publisher, 'source.publisher'),
    version: optionalText(raw.version, 'source.version'),
    publishedYear: optionalInt(raw.publishedYear, 'source.publishedYear', {
      min: 0,
    }),
    status: optionalText(raw.status, 'source.status'),
    license: optionalText(raw.license, 'source.license'),
    checksum: requireText(raw.checksum, 'source.checksum'),
    archivePath: requireText(raw.archivePath, 'source.archivePath'),
    pageCount: requireInt(raw.pageCount, 'source.pageCount', { min: 1 }),
    hasTextLayer,
  };
}

function validatePages(value: unknown, pageCount: number): PageLayerPage[] {
  if (!Array.isArray(value) || value.length === 0) {
    invalid('pages 必须是非空数组');
  }
  if (value.length !== pageCount) {
    invalid(
      `source.pageCount=${pageCount} 与 pages 数量 ${value.length} 不一致`,
    );
  }

  const pages: PageLayerPage[] = [];
  const pageNos = new Set<number>();
  const blockIds = new Set<string>();

  for (let index = 0; index < value.length; index += 1) {
    const raw = requireRecord(value[index], `pages[${index}]`);
    const pageNo = requireInt(raw.pageNo, `pages[${index}].pageNo`, {
      min: 1,
      max: pageCount,
    });
    if (pageNos.has(pageNo)) {
      invalid(`页码重复：p${pageNo} 出现了多次`);
    }
    pageNos.add(pageNo);

    if (typeof raw.text !== 'string') {
      invalid(`pages[${index}].text 必须是字符串（扫描件可为空字符串）`);
    }

    pages.push({
      pageNo,
      text: raw.text,
      charCount:
        optionalInt(raw.charCount, `pages[${index}].charCount`, { min: 0 }) ??
        undefined,
      width: optionalNumber(raw.width, `pages[${index}].width`),
      height: optionalNumber(raw.height, `pages[${index}].height`),
      imagePath: optionalText(raw.imagePath, `pages[${index}].imagePath`),
      blocks: validateBlocks(raw.blocks, index, blockIds),
    });
  }

  return pages;
}

function validateBlocks(
  value: unknown,
  pageIndex: number,
  seenIds: Set<string>,
): PageLayerBlock[] {
  if (value === undefined || value === null) return [];

  const label = `pages[${pageIndex}].blocks`;
  if (!Array.isArray(value)) {
    invalid(`${label} 必须是数组`);
  }

  const blocks: PageLayerBlock[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const raw = requireRecord(value[index], `${label}[${index}]`);
    const id = requireText(raw.id, `${label}[${index}].id`);
    if (seenIds.has(id)) {
      invalid(`块 ID 重复：${id}`);
    }
    seenIds.add(id);

    blocks.push({
      id,
      kind: requireBlockKind(raw.kind, `${label}[${index}].kind`),
      bbox: requireBbox(raw.bbox, `${label}[${index}].bbox`),
      text: optionalText(raw.text, `${label}[${index}].text`),
      caption: optionalText(raw.caption, `${label}[${index}].caption`),
      orderIndex: requireInt(raw.orderIndex, `${label}[${index}].orderIndex`, {
        min: 1,
      }),
    });
  }

  return blocks;
}

function requireBlockKind(value: unknown, label: string): KbBlockKind {
  if (
    typeof value !== 'string' ||
    !BLOCK_KINDS.includes(value as KbBlockKind)
  ) {
    invalid(`${label} 必须是 ${BLOCK_KINDS.join(' / ')} 之一，实际 ${String(value)}`);
  }
  return value as KbBlockKind;
}

function requireBbox(value: unknown, label: string): KbBbox {
  const raw = requireRecord(value, label);
  return {
    x0: requireNumber(raw.x0, `${label}.x0`),
    y0: requireNumber(raw.y0, `${label}.y0`),
    x1: requireNumber(raw.x1, `${label}.x1`),
    y1: requireNumber(raw.y1, `${label}.y1`),
  };
}

function validateToc(value: unknown, pageCount: number): PageLayerTocEntry[] {
  if (value === undefined || value === null) return [];

  if (!Array.isArray(value)) {
    invalid('toc 必须是数组');
  }

  const entries: PageLayerTocEntry[] = [];
  const ids = new Set<string>();

  for (let index = 0; index < value.length; index += 1) {
    const raw = requireRecord(value[index], `toc[${index}]`);
    const id = requireText(raw.id, `toc[${index}].id`);
    if (ids.has(id)) {
      invalid(`目录 ID 重复：${id}`);
    }
    ids.add(id);

    const pageFrom = requireInt(raw.pageFrom, `toc[${index}].pageFrom`, {
      min: 1,
    });
    const pageTo = requireInt(raw.pageTo, `toc[${index}].pageTo`, { min: 1 });
    if (pageTo < pageFrom) {
      invalid(
        `目录页码范围非法：toc[${index}] pageFrom=${pageFrom} > pageTo=${pageTo}`,
      );
    }
    if (pageTo > pageCount) {
      invalid(
        `目录页码超出文档范围：toc[${index}] pageTo=${pageTo} > pageCount=${pageCount}`,
      );
    }

    entries.push({
      id,
      title: requireText(raw.title, `toc[${index}].title`),
      level: requireInt(raw.level, `toc[${index}].level`, { min: 1 }),
      pageFrom,
      pageTo,
      orderIndex: requireInt(raw.orderIndex, `toc[${index}].orderIndex`, {
        min: 1,
      }),
    });
  }

  return entries;
}
