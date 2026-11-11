import { Injectable } from '@nestjs/common';
import type { KbSource, KbToc } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma.service';
import { KnowledgeToolError } from './knowledge-v3.errors';
import type {
  KbCatalogResult,
  KbSourceSummary,
  KbTocEntry,
} from './knowledge-v3.types';

/**
 * `kb_catalog` 的数据层（设计 §6）：找书 + 单本文档目录。
 *
 * - `list`：按 collection 过滤（不传则全部），供模型发现有哪些书；
 * - `get`：返回 `{ sources: [source], toc }`，与 catalog 工具输出同形状。
 *
 * 只读 Prisma，不做检索/摘要/判断覆盖；文档不存在抛 `SOURCE_NOT_FOUND`。
 */
@Injectable()
export class KnowledgeCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async list(collection?: string): Promise<KbSourceSummary[]> {
    const sources = await this.prisma.kbSource.findMany({
      where: collection ? { collection } : undefined,
      orderBy: [{ collection: 'asc' }, { id: 'asc' }],
    });

    return sources.map(toSourceSummary);
  }

  async get(documentId: string): Promise<KbCatalogResult> {
    const source = await this.prisma.kbSource.findUnique({
      where: { id: documentId },
      include: { toc: { orderBy: { orderIndex: 'asc' } } },
    });

    if (!source) {
      throw new KnowledgeToolError(
        'SOURCE_NOT_FOUND',
        `SOURCE_NOT_FOUND: document ${documentId} not found`,
      );
    }

    return {
      sources: [toSourceSummary(source)],
      toc: [...source.toc]
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map(toTocEntry),
    };
  }
}

function toSourceSummary(source: KbSource): KbSourceSummary {
  return {
    id: source.id,
    collection: source.collection,
    title: source.title,
    publisher: source.publisher,
    version: source.version,
    publishedYear: source.publishedYear,
    status: source.status,
    license: source.license,
    pageCount: source.pageCount,
    hasTextLayer: source.hasTextLayer,
  };
}

function toTocEntry(toc: KbToc): KbTocEntry {
  return {
    id: toc.id,
    title: toc.title,
    level: toc.level,
    pageFrom: toc.pageFrom,
    pageTo: toc.pageTo,
  };
}
