import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma.service';
import { pageAnchor } from './knowledge-v3.anchors';
import { KnowledgeToolError } from './knowledge-v3.errors';
import type { KbFindArgs, KbFindHit, KbFindResult } from './knowledge-v3.types';

/**
 * `kb_find` 的数据层（设计 §6.3）：按词找候选页，只返回页码、命中块/表题、短摘要。
 *
 * - 英文/通用：页全文 `to_tsvector('simple', p.text) @@ websearch_to_tsquery(...)`
 *   + `ts_rank_cd` 排序；
 * - CJK：`simple` 配置不切词，改走 `ILIKE` 兜底（`pg_trgm` 索引可加速）；
 * - 表/图：再查 `kb_block`（`kind IN ('table','figure')`，caption/text ILIKE）；
 * - 合并：同一 `documentId + pageNo` 只留最高分，页命中 `kind='page'`。
 *
 * 0 命中只返回 `hits: []` + `searched`，不返回 `no_match`，也不判断“知识库是否覆盖”。
 */

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 30;
const SNIPPET_WINDOW = 160;

/** `$queryRaw` 返回数据库原始行（snake_case）。 */
interface RawFindRow {
  source_id: string | null;
  page_no: number | string | null;
  text: string | null;
  block_id: string | null;
  kind: string | null;
  score: number | string | null;
}

interface SearchedCounts {
  documents: number;
  pages: number;
}

@Injectable()
export class KnowledgeFindService {
  constructor(private readonly prisma: PrismaService) {}

  async find(args: KbFindArgs): Promise<KbFindResult> {
    const query = typeof args?.query === 'string' ? args.query.trim() : '';
    if (!query) {
      throw new KnowledgeToolError(
        'INVALID_ARGUMENT',
        'INVALID_ARGUMENT: query 不能为空',
      );
    }

    const limit = normalizeLimit(args.limit);
    const collections = normalizeScope(args.collections);
    const documentIds = normalizeScope(args.documentIds);

    // 显式空范围 = 范围为空，直接 0 命中；不退回全库。
    if (collections?.length === 0 || documentIds?.length === 0) {
      return emptyResult();
    }

    const searched = await this.countSearched(collections, documentIds);
    if (searched.documents === 0 || searched.pages === 0) {
      return { hits: [], searched };
    }

    const pageRows = isCjkQuery(query)
      ? await this.searchPagesByLike(query, collections, documentIds, limit)
      : await this.searchPagesByFullText(
          query,
          collections,
          documentIds,
          limit,
        );
    const blockRows = await this.searchBlocksByLike(
      query,
      collections,
      documentIds,
      limit,
    );

    return {
      hits: mergeHits(pageRows, blockRows, query, limit),
      searched,
    };
  }

  private async countSearched(
    collections: string[] | null,
    documentIds: string[] | null,
  ): Promise<SearchedCounts> {
    const sourceWhere: {
      id?: { in: string[] };
      collection?: { in: string[] };
    } = {};
    if (documentIds) sourceWhere.id = { in: documentIds };
    if (collections) sourceWhere.collection = { in: collections };

    const pageWhere: {
      sourceId?: { in: string[] };
      source?: { collection: { in: string[] } };
    } = {};
    if (documentIds) pageWhere.sourceId = { in: documentIds };
    if (collections) pageWhere.source = { collection: { in: collections } };

    const [documents, pages] = await Promise.all([
      this.prisma.kbSource.count({ where: sourceWhere }),
      this.prisma.kbPage.count({ where: pageWhere }),
    ]);
    return { documents, pages };
  }

  private searchPagesByFullText(
    query: string,
    collections: string[] | null,
    documentIds: string[] | null,
    limit: number,
  ): Promise<RawFindRow[]> {
    return this.prisma.$queryRaw<RawFindRow[]>`
      SELECT
        p.source_id AS source_id,
        p.page_no AS page_no,
        p.text AS text,
        NULL::text AS block_id,
        'page'::text AS kind,
        ts_rank_cd(
          to_tsvector('simple', p.text),
          websearch_to_tsquery('simple', ${query})
        )::float8 AS score
      FROM kb_page p
      JOIN kb_source s ON s.id = p.source_id
      WHERE (${collections}::text[] IS NULL OR s.collection = ANY(${collections}::text[]))
        AND (${documentIds}::text[] IS NULL OR p.source_id = ANY(${documentIds}::text[]))
        AND to_tsvector('simple', p.text) @@ websearch_to_tsquery('simple', ${query})
      ORDER BY score DESC, p.page_no ASC
      LIMIT ${limit}
    `;
  }

  private searchPagesByLike(
    query: string,
    collections: string[] | null,
    documentIds: string[] | null,
    limit: number,
  ): Promise<RawFindRow[]> {
    return this.prisma.$queryRaw<RawFindRow[]>`
      SELECT
        p.source_id AS source_id,
        p.page_no AS page_no,
        p.text AS text,
        NULL::text AS block_id,
        'page'::text AS kind,
        similarity(p.text, ${query})::float8 AS score
      FROM kb_page p
      JOIN kb_source s ON s.id = p.source_id
      WHERE (${collections}::text[] IS NULL OR s.collection = ANY(${collections}::text[]))
        AND (${documentIds}::text[] IS NULL OR p.source_id = ANY(${documentIds}::text[]))
        AND p.text ILIKE '%' || ${query} || '%'
      ORDER BY p.page_no ASC
      LIMIT ${limit}
    `;
  }

  private searchBlocksByLike(
    query: string,
    collections: string[] | null,
    documentIds: string[] | null,
    limit: number,
  ): Promise<RawFindRow[]> {
    return this.prisma.$queryRaw<RawFindRow[]>`
      SELECT
        p.source_id AS source_id,
        p.page_no AS page_no,
        coalesce(nullif(b.caption, ''), nullif(b.text, ''), p.text) AS text,
        b.id AS block_id,
        b.kind AS kind,
        similarity(
          coalesce(b.text, '') || ' ' || coalesce(b.caption, ''),
          ${query}
        )::float8 AS score
      FROM kb_block b
      JOIN kb_page p ON p.id = b.page_id
      JOIN kb_source s ON s.id = p.source_id
      WHERE b.kind IN ('table', 'figure')
        AND (${collections}::text[] IS NULL OR s.collection = ANY(${collections}::text[]))
        AND (${documentIds}::text[] IS NULL OR p.source_id = ANY(${documentIds}::text[]))
        -- 与 kb_block_text_trgm_idx 的表达式一致，ILIKE 可走 trigram 索引。
        AND (coalesce(b.text, '') || ' ' || coalesce(b.caption, '')) ILIKE '%' || ${query} || '%'
      ORDER BY score DESC, p.page_no ASC
      LIMIT ${limit}
    `;
  }
}

function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new KnowledgeToolError(
      'INVALID_ARGUMENT',
      `INVALID_ARGUMENT: limit 必须是 1–${MAX_LIMIT} 的整数`,
    );
  }
  return limit;
}

/**
 * 范围过滤：`undefined` = 不过滤；显式数组 = 只在这些文档/集合里找。
 * 空数组（或全是空串）表示“范围为空”，由调用方直接返回 0 命中。
 */
function normalizeScope(values: string[] | undefined): string[] | null {
  if (values === undefined || values === null) return null;
  if (!Array.isArray(values)) return null;
  return values
    .filter((value) => typeof value === 'string')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function emptyResult(): KbFindResult {
  return { hits: [], searched: { documents: 0, pages: 0 } };
}

function mergeHits(
  pageRows: RawFindRow[],
  blockRows: RawFindRow[],
  query: string,
  limit: number,
): KbFindHit[] {
  const hits: KbFindHit[] = [];
  for (const row of pageRows) {
    const hit = toHit(row, 'page', query);
    if (hit) hits.push(hit);
  }
  for (const row of blockRows) {
    const kind = blockKind(row.kind);
    if (!kind) continue;
    const hit = toHit(row, kind, query);
    if (hit) hits.push(hit);
  }

  const byPage = new Map<string, KbFindHit>();
  for (const hit of hits) {
    const key = `${hit.documentId}\u0000${hit.pageNo}`;
    const existing = byPage.get(key);
    // 只留最高分；同分时保留先加入的页命中。
    if (!existing || hit.score > existing.score) {
      byPage.set(key, hit);
    }
  }

  return [...byPage.values()]
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.documentId.localeCompare(b.documentId) ||
        a.pageNo - b.pageNo,
    )
    .slice(0, limit);
}

function blockKind(kind: string | null): 'table' | 'figure' | null {
  return kind === 'table' || kind === 'figure' ? kind : null;
}

function toHit(
  row: RawFindRow,
  kind: KbFindHit['kind'],
  query: string,
): KbFindHit | null {
  if (typeof row.source_id !== 'string' || row.source_id.length === 0) {
    return null;
  }
  const pageNo = Number(row.page_no);
  if (!Number.isInteger(pageNo) || pageNo < 1) return null;

  const score = Number(row.score ?? 0);
  return {
    documentId: row.source_id,
    pageNo,
    // 目录反查不在本任务硬性要求内；查不到统一给 null，不阻断命中。
    chapter: null,
    blockId: kind === 'page' ? null : (row.block_id ?? null),
    kind,
    snippet: makeSnippet(row.text ?? '', query),
    score: Number.isFinite(score) ? score : 0,
    anchor: pageAnchor(row.source_id, pageNo),
  };
}

/**
 * 命中词前后约 160 字的窗口；没有命中词时取前 160 字。
 * 导出供测试直接断言裁剪行为。
 */
export function makeSnippet(text: string, query: string): string {
  const source = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!source) return '';

  const term = findSnippetTerm(source, query);
  if (!term) return clip(source, SNIPPET_WINDOW);

  const matchIndex = source.toLowerCase().indexOf(term.toLowerCase());
  if (matchIndex < 0) return clip(source, SNIPPET_WINDOW);

  const half = Math.floor((SNIPPET_WINDOW - term.length) / 2);
  let start = Math.max(0, matchIndex - half);
  const end = Math.min(source.length, start + SNIPPET_WINDOW);
  start = Math.max(0, end - SNIPPET_WINDOW);

  const body = source.slice(start, end).trim();
  return `${start > 0 ? '…' : ''}${body}${end < source.length ? '…' : ''}`;
}

function clip(source: string, length: number): string {
  return `${source.slice(0, length)}${source.length > length ? '…' : ''}`;
}

function findSnippetTerm(source: string, query: string): string | null {
  const haystack = source.toLowerCase();
  for (const candidate of snippetCandidates(query)) {
    if (haystack.includes(candidate.toLowerCase())) return candidate;
  }
  return null;
}

/** 先试完整 query（含短语），再逐词退让；长词优先，避免先命中短的无义词。 */
function snippetCandidates(query: string): string[] {
  const trimmed = (query ?? '').trim();
  if (!trimmed) return [];
  const unquoted = trimmed.replace(/["'“”‘’]/g, ' ');
  const candidates: string[] = [];
  const seen = new Set<string>();
  for (const raw of [trimmed, unquoted, ...unquoted.split(/\s+/)]) {
    const value = raw.trim();
    const key = value.toLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    candidates.push(value);
  }
  return candidates.sort((a, b) => b.length - a.length);
}

/**
 * 查询里只要出现 CJK 字符就走 ILIKE 兜底：
 * PostgreSQL 的 `simple` 配置不切中文词，tsquery 对中文基本命中不了。
 */
export function isCjkQuery(query: string): boolean {
  return Array.from(query ?? '').some((char) =>
    isCjkCodePoint(char.codePointAt(0) as number),
  );
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
