import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../infrastructure/prisma.service';

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
