import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma.service';
import { KnowledgeLibraryService } from '../knowledge-base/knowledge-library.service';
import type { KnowledgeHit } from '../../domain/knowledge/knowledge-search';

/**
 * 知识库检索工具（给 Agent 用的那一层）。
 *
 * 和配方 Agent 走**同一个** `KnowledgeLibraryService`：一个语料、一个服务入口。
 * 补剂不传 `documentIds`，查全库；配方侧才限制在 CKD 5 份。
 * 这里仍然只做关键词检索（不建向量库、不引外部服务）——领域词很硬，
 * 关键词打分够准，而且能解释「为什么是这几条」。
 *
 * `chunks.jsonl` 已退休：那段 17MB 的本地产物不再参与运行时，原文一律从
 * `source_paragraph` 读，生产环境不再出现「知识库不可用」。
 */
const SNIPPET_CHARS = 600;

@Injectable()
export class KnowledgeSearchService {
  private readonly logger = new Logger(KnowledgeSearchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly library: KnowledgeLibraryService
  ) {}

  /** 供 Agent 调用的检索入口：返回带出处的段落。 */
  async search(query: string, limit = 4): Promise<KnowledgeHit[]> {
    const raw = String(query ?? '').trim();
    if (!raw) {
      return [];
    }

    // 不传 documentIds：补剂查全库（配方侧才收窄到 CKD）。
    const passages = await this.library.search(raw, { limit });
    return passages.map((passage) => ({
      chunkId: passage.id,
      docId: passage.documentId,
      text: passage.text.slice(0, SNIPPET_CHARS),
      score: passage.score
    }));
  }

  /** 语料是否可用——Agent 该在检索前知道这件事，好如实告诉用户。 */
  async isAvailable(): Promise<boolean> {
    try {
      const count = await this.prisma.sourceParagraph.count();
      return count > 0;
    } catch (error) {
      this.logger.warn(
        `[knowledge] 知识库数据库不可用或为空：${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return false;
    }
  }
}
