import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../infrastructure/prisma.service';
import { getKnowledgeSource } from '../../domain/recipe-designer/knowledge-base/source-registry';
import { extractQueryFocus, matchesNeedle } from './query-expansion';
import { deriveDisplayTitle } from './section-display';

/**
 * 原文层查询服务。
 *
 * 数据来自 `docs/knowledge-base/` 的解析产物，由
 * `scripts/import-knowledge-source-layer.ts` 导入（整表重建，可重跑）。
 *
 * 这一层只做"查"：段落、表格、图片、以及知识条目的出处锚点。
 * 它不判断业务，也不拼提示词 —— 那是调用方（Agent）的事。
 */

export interface ParagraphHit {
  id: string;
  documentId: string;
  sectionId: string;
  text: string;
  pageStart: number | null;
  sectionTitle: string;
}

export interface TableHit {
  id: string;
  documentId: string;
  caption: string;
  pageNo: number | null;
  columnCount: number;
  rowCount: number;
}

/** 打开节时返回的段落（分页窗口内）。 */
export interface SectionParagraph {
  id: string;
  sectionId: string;
  text: string;
  pageStart: number | null;
  pageEnd: number | null;
}

/** 表格摘要：节视图里最多带 3 张，只需要足以让模型决定打开哪张。 */
export interface TableSummary {
  tableId: string;
  caption: string;
  pageNo: number | null;
  rowCount: number;
  documentId: string;
  sourceId: string | null;
  sourceName: string | null;
}

/**
 * 打开一节（spec v1.1 §6.4）。
 *
 * 默认一次 12 段；`totalParagraphs`/`nextOffset` 让调用方知道还有没有下一页。
 * 标题走 `deriveDisplayTitle`（页眉型标题降级成「来源名 · 第37章 · p787」）。
 */
export interface SectionView {
  sectionId: string;
  title: string;
  displayTitle: string;
  documentId: string;
  documentTitle: string | null;
  sourceId: string | null;
  sourceName: string | null;
  sourceVersion: string | null;
  pageStart: number | null;
  pageEnd: number | null;
  paragraphs: SectionParagraph[];
  totalParagraphs: number;
  nextOffset: number | null;
  tables: TableSummary[];
  previousSectionId: string | null;
  nextSectionId: string | null;
}

/** 打开一张表（spec v1.1 §6.4/§7.5）；`pageNo` 允许为 null（v2 补导入）。 */
export interface TableView extends TableSummary {
  columns: string[];
  rows: string[][];
  documentTitle: string | null;
}

/** 馆藏里的一份文档（spec v1.1 §6.5）。 */
export interface ScopeDocument {
  id: string;
  title: string | null;
  sourceId: string | null;
  sourceName: string | null;
  sections: number;
  paragraphs: number;
  tables: number;
  pageCount: number | null;
}

/** 馆藏（spec v1.1 §6.5）：服务本身不硬编码 CKD，范围由调用方传入。 */
export interface ScopeView {
  documents: ScopeDocument[];
  totals: {
    documents: number;
    sections: number;
    paragraphs: number;
    tables: number;
  };
}

export interface CitationAnchor {
  entryId: string;
  sourceName: string | null;
  locator: string | null;
  documentId: string | null;
  sectionId: string | null;
  paragraphIds: string[];
  tableIds: string[];
  /** paragraph=精确到某一段；section=只到小节（引用本身就没写更细） */
  precision: string;
  confidence: string;
}

const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 30;

/** 打开一节：默认 12 段一页；被引用段前留 2 段上下文。 */
const DEFAULT_PARAGRAPHS_PER_PAGE = 12;
const MAX_PARAGRAPHS_PER_PAGE = 50;
const ANCHOR_LEAD_PARAGRAPHS = 2;
const MAX_SECTION_TABLES = 3;

/** 表格视图：最多 3 张（spec §7.5），候选上限只防全库扫描失控。 */
const MAX_TABLE_VIEWS = 3;
const MAX_TABLE_CANDIDATES = 500;

/**
 * spec §7.5「核心 5 组表优先」：37-1 / 37-9 / 37-11/12 / AAHA 表 8。
 * 只做同分时的排序优先，不额外加权 —— 相关性仍由命中位置决定。
 */
const CORE_TABLE_IDS = new Set([
  'T0253',
  'T0497',
  'T0260',
  'T0261',
  'T0025',
  'T0026',
]);

function coreTableRank(tableId: string): number {
  return CORE_TABLE_IDS.has(String(tableId ?? '').trim()) ? 0 : 1;
}

/**
 * 表格视图相关性权重（spec 未规定数值，这里登记）：
 * - 表题点名 → 3；
 * - 第一列（行标签）就是查询词（`Phosphorus` / `Protein`）→ 4，最强信号；
 * - 只出现在其他单元格里（正文顺带提到）→ 1。
 * 只影响排序，不做分期/物种排除。
 */
const CAPTION_MATCH_WEIGHT = 3;
const ROW_LABEL_MATCH_WEIGHT = 4;
const ROW_BODY_MATCH_WEIGHT = 1;

function normalizeIdList(values: string[] | undefined): string[] {
  return (values ?? [])
    .map((value) => String(value ?? '').trim())
    .filter(Boolean);
}

function toTextArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((cell) => String(cell ?? ''))
    : [];
}

function toTextMatrix(value: unknown): string[][] {
  if (!Array.isArray(value)) return [];
  return value.map((row) =>
    Array.isArray(row)
      ? row.map((cell) => String(cell ?? ''))
      : [String(row ?? '')],
  );
}

/** 页码在节范围内的表优先，`pageNo=null` 的次之（允许打开），其余最后。 */
function rankSectionTable(
  pageNo: number | null,
  pageStart: number | null,
  pageEnd: number | null,
): number {
  if (pageNo === null) return 1;
  if (pageStart === null || pageEnd === null) return 2;
  return pageNo >= pageStart && pageNo <= pageEnd ? 0 : 2;
}

function compactMin(
  values: Array<number | null>,
  fallback: number | null,
): number | null {
  let min: number | null = fallback;
  for (const value of values) {
    if (typeof value !== 'number') continue;
    if (min === null || value < min) min = value;
  }
  return min;
}

function compactMax(
  values: Array<number | null>,
  fallback: number | null,
): number | null {
  let max: number | null = fallback;
  for (const value of values) {
    if (typeof value !== 'number') continue;
    if (max === null || value > max) max = value;
  }
  return max;
}

/**
 * 表格命中强度：门禁先看 `caption + 行文本`，命中后再按位置加权
 * （行标签 > 表题 > 其他单元格）。
 */
function scoreTableRow(
  row: { caption: string; rows: unknown },
  needles: string[],
): number {
  const caption = String(row.caption ?? '');
  const rows = toTextMatrix(row.rows);
  const haystack = `${caption} ${JSON.stringify(rows)}`;
  let score = 0;
  for (const needle of needles) {
    if (!matchesNeedle(haystack, needle)) continue;
    const labelHit = rows.some(
      (cells) => cells.length > 0 && matchesNeedle(cells[0], needle),
    );
    if (labelHit) {
      score += ROW_LABEL_MATCH_WEIGHT;
    } else if (matchesNeedle(caption, needle)) {
      score += CAPTION_MATCH_WEIGHT;
    } else {
      score += ROW_BODY_MATCH_WEIGHT;
    }
  }
  return score;
}

@Injectable()
export class SourceLayerService {
  private readonly logger = new Logger(SourceLayerService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** 库里有什么：文档数、段落数、表格数、图片数 */
  async getScope(): Promise<{
    documents: number;
    paragraphs: number;
    tables: number;
    figures: number;
  }> {
    const [documents, paragraphs, tables, figures] = await Promise.all([
      this.prisma.sourceDocument.count(),
      this.prisma.sourceParagraph.count(),
      this.prisma.sourceTable.count(),
      this.prisma.sourceFigure.count(),
    ]);
    return { documents, paragraphs, tables, figures };
  }

  /** 列出文档（可按来源过滤） */
  async listDocuments(sourceId?: string) {
    return this.prisma.sourceDocument.findMany({
      where: sourceId ? { sourceId } : undefined,
      select: {
        id: true,
        sourceId: true,
        title: true,
        path: true,
        pageCount: true,
        charCount: true,
      },
      orderBy: { id: 'asc' },
    });
  }

  /**
   * 在原文里搜。
   *
   * 用 `contains` 而不是全文索引：中文没有词边界，trigram 之外的办法效果都不稳；
   * 段落总量两万多，顺序扫描够快。
   */
  async searchParagraphs(
    query: string,
    options: { limit?: number; documentId?: string; sourceId?: string } = {},
  ): Promise<ParagraphHit[]> {
    const q = (query ?? '').trim();
    if (!q) return [];
    const limit = Math.min(options.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

    const rows = await this.prisma.sourceParagraph.findMany({
      where: {
        text: { contains: q, mode: 'insensitive' },
        ...(options.documentId ? { documentId: options.documentId } : {}),
        ...(options.sourceId
          ? { document: { sourceId: options.sourceId } }
          : {}),
      },
      include: { section: { select: { title: true } } },
      take: limit,
      orderBy: { id: 'asc' },
    });

    return rows.map((r) => ({
      id: r.id,
      documentId: r.documentId,
      sectionId: r.sectionId,
      text: r.text,
      pageStart: r.pageStart,
      sectionTitle: r.section?.title ?? '',
    }));
  }

  /** 取某一段 */
  async getParagraph(id: string): Promise<ParagraphHit | null> {
    const r = await this.prisma.sourceParagraph.findUnique({
      where: { id },
      include: { section: { select: { title: true } } },
    });
    if (!r) return null;
    return {
      id: r.id,
      documentId: r.documentId,
      sectionId: r.sectionId,
      text: r.text,
      pageStart: r.pageStart,
      sectionTitle: r.section?.title ?? '',
    };
  }

  /** 取某段前后若干段（把结论放回上下文里看） */
  async getParagraphContext(
    id: string,
    before = 1,
    after = 1,
  ): Promise<ParagraphHit[]> {
    const centre = await this.prisma.sourceParagraph.findUnique({
      where: { id },
      select: { sectionId: true },
    });
    if (!centre) return [];

    const siblings = await this.prisma.sourceParagraph.findMany({
      where: { sectionId: centre.sectionId },
      include: { section: { select: { title: true } } },
      orderBy: { id: 'asc' },
    });
    const idx = siblings.findIndex((s) => s.id === id);
    if (idx < 0) return [];

    const from = Math.max(0, idx - before);
    const to = Math.min(siblings.length, idx + after + 1);
    return siblings.slice(from, to).map((r) => ({
      id: r.id,
      documentId: r.documentId,
      sectionId: r.sectionId,
      text: r.text,
      pageStart: r.pageStart,
      sectionTitle: r.section?.title ?? '',
    }));
  }

  /** 取小节信息 */
  async getSection(sectionId: string) {
    return this.prisma.sourceSection.findUnique({
      where: { id: sectionId },
      select: {
        id: true,
        documentId: true,
        title: true,
        pageNo: true,
        sortOrder: true,
      },
    });
  }

  /** 按关键词找表格（查表题） */
  async searchTables(query: string, limit = DEFAULT_LIMIT): Promise<TableHit[]> {
    const q = (query ?? '').trim();
    if (!q) return [];
    const rows = await this.prisma.sourceTable.findMany({
      where: { caption: { contains: q, mode: 'insensitive' } },
      take: Math.min(limit, MAX_LIMIT),
      orderBy: { id: 'asc' },
    });
    return rows.map((r) => ({
      id: r.id,
      documentId: r.documentId,
      caption: r.caption,
      pageNo: r.pageNo,
      columnCount: Array.isArray(r.columns) ? (r.columns as unknown[]).length : 0,
      rowCount: r.rowCount,
    }));
  }

  /** 取整张表 */
  async getTable(id: string) {
    return this.prisma.sourceTable.findUnique({ where: { id } });
  }

  /**
   * 打开一节（spec v1.1 §6.4）。
   *
   * - 段落按 id 升序，默认一页 12 段；给了 `anchorParagraphId` 就让被引用段落
   *   出现在第一页（前面留 2 段上下文），否则用 `paragraphOffset`；
   * - `displayTitle` 走 §7.4 的降级（页眉型标题不直接丢给模型）；
   * - 前后节按 `documentId + sortOrder`；
   * - `tables` 取同文档的表，页码落在本节范围的优先，`pageNo=null` 的也允许，
   *   最多 3 张。
   */
  async openSection(
    sectionId: string,
    options: {
      paragraphOffset?: number;
      paragraphLimit?: number;
      anchorParagraphId?: string;
    } = {},
  ): Promise<SectionView | null> {
    const id = String(sectionId ?? '').trim();
    if (!id) return null;

    const section = await this.prisma.sourceSection.findUnique({
      where: { id },
      include: {
        document: { select: { id: true, title: true, sourceId: true } },
      },
    });
    if (!section) return null;

    const paragraphs = await this.prisma.sourceParagraph.findMany({
      where: { sectionId: id },
      select: {
        id: true,
        sectionId: true,
        text: true,
        pageStart: true,
        pageEnd: true,
      },
      orderBy: { id: 'asc' },
    });

    const totalParagraphs = paragraphs.length;
    const limit = Math.min(
      MAX_PARAGRAPHS_PER_PAGE,
      Math.max(
        1,
        Math.floor(options.paragraphLimit ?? DEFAULT_PARAGRAPHS_PER_PAGE),
      ),
    );
    const anchorIndex = options.anchorParagraphId
      ? paragraphs.findIndex((row) => row.id === options.anchorParagraphId)
      : -1;
    const offset =
      anchorIndex >= 0
        ? Math.max(0, anchorIndex - ANCHOR_LEAD_PARAGRAPHS)
        : Math.max(0, Math.floor(options.paragraphOffset ?? 0));
    const page = paragraphs.slice(offset, offset + limit);
    const nextOffset =
      offset + page.length < totalParagraphs ? offset + page.length : null;

    const paragraphPageStart = compactMin(
      paragraphs.map((row) => row.pageStart),
      null,
    );
    const paragraphPageEnd = compactMax(
      paragraphs.map((row) => row.pageEnd ?? row.pageStart),
      null,
    );
    const pageStart = paragraphPageStart ?? section.pageNo ?? null;
    const pageEnd = paragraphPageEnd ?? pageStart;

    const siblings = await this.prisma.sourceSection.findMany({
      where: { documentId: section.documentId },
      select: { id: true, sortOrder: true },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
    const position = siblings.findIndex((row) => row.id === id);
    const previousSectionId =
      position > 0 ? siblings[position - 1].id : null;
    const nextSectionId =
      position >= 0 && position < siblings.length - 1
        ? siblings[position + 1].id
        : null;

    const tableRows = await this.prisma.sourceTable.findMany({
      where: { documentId: section.documentId },
      select: {
        id: true,
        caption: true,
        pageNo: true,
        rowCount: true,
        documentId: true,
      },
      orderBy: { id: 'asc' },
    });
    const sourceId = section.document?.sourceId ?? null;
    const source = sourceId ? getKnowledgeSource(sourceId) : undefined;
    const sourceName = source?.name ?? sourceId;
    const tables = tableRows
      .map((row) => ({
        row,
        rank: rankSectionTable(row.pageNo, pageStart, pageEnd),
      }))
      .sort((a, b) => a.rank - b.rank || a.row.id.localeCompare(b.row.id))
      .slice(0, MAX_SECTION_TABLES)
      .map(({ row }) => ({
        tableId: row.id,
        caption: row.caption,
        pageNo: row.pageNo,
        rowCount: row.rowCount,
        documentId: row.documentId,
        sourceId,
        sourceName,
      }));

    return {
      sectionId: section.id,
      title: section.title,
      displayTitle: deriveDisplayTitle({
        title: section.title,
        sourceName,
        pageNo: section.pageNo ?? pageStart,
      }),
      documentId: section.documentId,
      documentTitle: section.document?.title ?? null,
      sourceId,
      sourceName,
      sourceVersion: source?.version ?? null,
      pageStart,
      pageEnd,
      paragraphs: page.map((row) => ({
        id: row.id,
        sectionId: row.sectionId,
        text: row.text,
        pageStart: row.pageStart,
        pageEnd: row.pageEnd,
      })),
      totalParagraphs,
      nextOffset,
      tables,
      previousSectionId,
      nextSectionId,
    };
  }

  /** 打开一张表（spec v1.1 §6.4/§7.5）；`pageNo` 允许为 null。 */
  async openTable(tableId: string): Promise<TableView | null> {
    const id = String(tableId ?? '').trim();
    if (!id) return null;
    const row = await this.prisma.sourceTable.findUnique({
      where: { id },
      include: {
        document: { select: { id: true, title: true, sourceId: true } },
      },
    });
    if (!row) return null;
    return this.toTableView(row);
  }

  /**
   * 馆藏（spec v1.1 §6.5）。
   *
   * 服务不硬编码 CKD：调用方传 `documentIds`（配方侧传 CKD 5 份），
   * `sourceId` 只做收窄，不做扩权。
   */
  async scope(
    options: { sourceId?: string; documentIds?: string[] } = {},
  ): Promise<ScopeView> {
    const sourceId = String(options.sourceId ?? '').trim() || undefined;
    const documentIds = normalizeIdList(options.documentIds);
    const where =
      documentIds.length > 0
        ? { id: { in: documentIds }, ...(sourceId ? { sourceId } : {}) }
        : sourceId
          ? { sourceId }
          : undefined;

    const rows = await this.prisma.sourceDocument.findMany({
      where,
      select: {
        id: true,
        title: true,
        sourceId: true,
        pageCount: true,
        _count: { select: { sections: true, paragraphs: true, tables: true } },
      },
      orderBy: { id: 'asc' },
    });

    const documents: ScopeDocument[] = rows.map((row) => {
      const documentSourceId = row.sourceId ?? null;
      const source = documentSourceId
        ? getKnowledgeSource(documentSourceId)
        : undefined;
      return {
        id: row.id,
        title: row.title,
        sourceId: documentSourceId,
        sourceName: source?.name ?? documentSourceId,
        sections: row._count.sections,
        paragraphs: row._count.paragraphs,
        tables: row._count.tables,
        pageCount: row.pageCount,
      };
    });

    return {
      documents,
      totals: documents.reduce(
        (totals, document) => ({
          documents: totals.documents + 1,
          sections: totals.sections + document.sections,
          paragraphs: totals.paragraphs + document.paragraphs,
          tables: totals.tables + document.tables,
        }),
        { documents: 0, sections: 0, paragraphs: 0, tables: 0 },
      ),
    };
  }

  /**
   * 表格视图（spec v1.1 §7.5）。
   *
   * 在指定文档/来源里按 `caption + 行文本` 找表：
   * - topicPhrases 非空时必须命中 topicPhrase（vitamin K 不能命中 vitamin E 表）；
   * - 否则用 focusTerms/stagePhrases；没有可匹配的焦点词就不返回表格，
   *   避免给「分期/馆藏」这类查询随便塞 3 张无关表；
   * - 不做分期/物种排除；返回 ≤3 张，按命中强度排序，同分时核心表优先。
   */
  async searchTableViews(
    query: string,
    options: { documentIds?: string[]; sourceIds?: string[]; limit?: number } = {},
  ): Promise<TableView[]> {
    const raw = String(query ?? '').trim();
    if (!raw) return [];

    const focus = extractQueryFocus(raw);
    const needles =
      focus.topicPhrases.length > 0
        ? focus.topicPhrases
        : [...focus.focusTerms, ...focus.stagePhrases];
    if (needles.length === 0) return [];

    const documentIds = normalizeIdList(options.documentIds);
    const sourceIds = normalizeIdList(options.sourceIds);
    const rows = await this.prisma.sourceTable.findMany({
      where: {
        ...(documentIds.length > 0 ? { documentId: { in: documentIds } } : {}),
        ...(sourceIds.length > 0
          ? { document: { sourceId: { in: sourceIds } } }
          : {}),
      },
      include: {
        document: { select: { id: true, title: true, sourceId: true } },
      },
      orderBy: { id: 'asc' },
      take: MAX_TABLE_CANDIDATES,
    });

    const limit = Math.min(
      MAX_TABLE_VIEWS,
      Math.max(1, Math.floor(options.limit ?? MAX_TABLE_VIEWS)),
    );

    return rows
      .map((row) => ({ row, score: scoreTableRow(row, needles) }))
      .filter(({ score }) => score > 0)
      .sort(
        (a, b) =>
          b.score - a.score ||
          coreTableRank(a.row.id) - coreTableRank(b.row.id) ||
          a.row.id.localeCompare(b.row.id),
      )
      .slice(0, limit)
      .map(({ row }) => this.toTableView(row));
  }

  /** 把 Prisma 的表格行转成对调用方稳定的形状（列/行都归一成字符串）。 */
  private toTableView(row: {
    id: string;
    caption: string;
    pageNo: number | null;
    columns: unknown;
    rows: unknown;
    rowCount: number;
    documentId: string;
    document?: { title: string | null; sourceId: string | null } | null;
  }): TableView {
    const sourceId = row.document?.sourceId ?? null;
    const source = sourceId ? getKnowledgeSource(sourceId) : undefined;
    return {
      tableId: row.id,
      caption: row.caption,
      pageNo: row.pageNo,
      columns: toTextArray(row.columns),
      rows: toTextMatrix(row.rows),
      rowCount: row.rowCount,
      documentId: row.documentId,
      documentTitle: row.document?.title ?? null,
      sourceId,
      sourceName: source?.name ?? sourceId,
    };
  }

  /**
   * 取图。
   *
   * 返回里带 `url` —— 静态目录挂在 `/kb-figures/`，调用方直接用这个地址就能取到文件，
   * 不用自己拼路径。
   */
  async getFigure(id: string) {
    const row = await this.prisma.sourceFigure.findUnique({ where: { id } });
    if (!row) return null;
    const name = row.path.split('/').pop() ?? '';
    return { ...row, url: `/kb-figures/${name}` };
  }

  /**
   * 某条知识的所有出处锚点。
   *
   * 这是"点开出处看原文"的入口：paragraphIds 有值就能直接取原文；
   * precision=section 时表示引用只写到小节，取到的是一段范围。
   */
  async getEntryAnchors(entryId: string): Promise<CitationAnchor[]> {
    const rows = await this.prisma.knowledgeCitationAnchor.findMany({
      where: { entryId },
      orderBy: { score: 'desc' },
    });
    return rows.map((r) => ({
      entryId: r.entryId,
      sourceName: r.sourceName,
      locator: r.locator,
      documentId: r.documentId,
      sectionId: r.sectionId,
      paragraphIds: r.paragraphIds,
      tableIds: r.tableIds,
      precision: r.precision,
      confidence: r.confidence,
    }));
  }

  /**
   * 校验一处引用：AI 说"依据这段"，到底靠不靠得住。
   *
   * 三条判定：① 段落是否存在 ② 是否属于该条目锚定的文档 ③ 段落里是否有该条目的关键词。
   * 返回 `ok=false` 时调用方应把这条回答标为"引用不可核"。
   */
  async verifyCitation(
    entryId: string,
    paragraphId: string,
    keywords: string[] = [],
  ): Promise<{
    ok: boolean;
    reason: string;
    paragraph: ParagraphHit | null;
    matchedKeywords: string[];
  }> {
    const paragraph = await this.getParagraph(paragraphId);
    if (!paragraph) {
      return { ok: false, reason: 'paragraph-not-found', paragraph: null, matchedKeywords: [] };
    }

    const anchors = await this.getEntryAnchors(entryId);
    const inAnchoredDoc = anchors.some(
      (a) => a.documentId === paragraph.documentId,
    );

    const text = paragraph.text.toLowerCase();
    const matched = keywords.filter((k) => {
      const key = (k ?? '').trim().toLowerCase();
      return key.length >= 2 && text.includes(key);
    });

    if (!inAnchoredDoc) {
      return { ok: false, reason: 'document-mismatch', paragraph, matchedKeywords: matched };
    }
    if (keywords.length > 0 && matched.length === 0) {
      return { ok: false, reason: 'no-keyword-match', paragraph, matchedKeywords: [] };
    }
    return { ok: true, reason: 'ok', paragraph, matchedKeywords: matched };
  }

  /**
   * 一次性把某条知识的出处连同原文取出来。
   *
   * 给"核对"用：返回每处出处命中的段落原文（最多 `perAnchor` 段）。
   */
  async getEntryEvidence(
    entryId: string,
    perAnchor = 3,
  ): Promise<
    Array<CitationAnchor & { paragraphs: ParagraphHit[]; tables: TableHit[] }>
  > {
    const anchors = await this.getEntryAnchors(entryId);
    const out = [];
    for (const a of anchors) {
      const ids = a.paragraphIds.slice(0, perAnchor);
      const paragraphs = ids.length
        ? await this.prisma.sourceParagraph.findMany({
            where: { id: { in: ids } },
            include: { section: { select: { title: true } } },
          })
        : [];
      const tables = a.tableIds.length
        ? await this.prisma.sourceTable.findMany({
            where: { id: { in: a.tableIds } },
          })
        : [];
      out.push({
        ...a,
        paragraphs: paragraphs.map((r) => ({
          id: r.id,
          documentId: r.documentId,
          sectionId: r.sectionId,
          text: r.text,
          pageStart: r.pageStart,
          sectionTitle: r.section?.title ?? '',
        })),
        tables: tables.map((r) => ({
          id: r.id,
          documentId: r.documentId,
          caption: r.caption,
          pageNo: r.pageNo,
          columnCount: Array.isArray(r.columns) ? (r.columns as unknown[]).length : 0,
          rowCount: r.rowCount,
        })),
      });
    }
    return out;
  }
}
