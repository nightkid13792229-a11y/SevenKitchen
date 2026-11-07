import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import {
  searchKnowledge,
  type KnowledgeChunk,
  type KnowledgeHit
} from '../../domain/knowledge/knowledge-search';

/**
 * 知识库检索工具（给 Agent 用的那一层）。
 *
 * 语料是仓库里的 `docs/knowledge-base/chunks.jsonl`（两万多段，17MB）。
 * 首次查询时整份读进内存，之后常驻——不建向量库、不引外部服务：
 * 这个库的领域词很硬，关键词打分已经够准，而且能解释"为什么是这几条"。
 *
 * 找不到语料时**明确返回空并记一次日志**，不假装检索成功。
 */
const DEFAULT_CANDIDATES = [
  'docs/knowledge-base/chunks.jsonl',
  '../docs/knowledge-base/chunks.jsonl',
  '../../docs/knowledge-base/chunks.jsonl',
  join(process.cwd(), 'docs/knowledge-base/chunks.jsonl'),
  join(process.cwd(), '../docs/knowledge-base/chunks.jsonl')
];

@Injectable()
export class KnowledgeSearchService {
  private readonly logger = new Logger(KnowledgeSearchService.name);
  private chunks: KnowledgeChunk[] | null = null;
  private loadFailed = false;

  /** 供 Agent 调用的检索入口：返回带出处的段落。 */
  search(query: string, limit = 4): KnowledgeHit[] {
    const chunks = this.load();
    if (chunks.length === 0) {
      return [];
    }
    return searchKnowledge(chunks, query, { limit });
  }

  /** 语料是否可用——Agent 该在检索前知道这件事，好如实告诉用户。 */
  isAvailable(): boolean {
    return this.load().length > 0;
  }

  private load(): KnowledgeChunk[] {
    if (this.chunks) {
      return this.chunks;
    }
    if (this.loadFailed) {
      return [];
    }

    const path = this.resolvePath();
    if (!path) {
      this.loadFailed = true;
      this.logger.error('[knowledge] 找不到 chunks.jsonl，检索工具不可用');
      return [];
    }

    try {
      const chunks: KnowledgeChunk[] = [];
      for (const line of readFileSync(path, 'utf8').split('\n')) {
        if (!line.trim()) {
          continue;
        }
        const parsed = JSON.parse(line) as Partial<KnowledgeChunk>;
        if (parsed.chunkId && parsed.docId && parsed.text) {
          chunks.push({
            chunkId: parsed.chunkId,
            docId: parsed.docId,
            text: parsed.text
          });
        }
      }
      this.chunks = chunks;
      this.logger.log(`[knowledge] 载入 ${chunks.length} 段语料：${path}`);
      return chunks;
    } catch (error) {
      this.loadFailed = true;
      this.logger.error(
        `[knowledge] 语料读取失败：${error instanceof Error ? error.message : String(error)}`
      );
      return [];
    }
  }

  private resolvePath(): string | null {
    const configured = (process.env.KNOWLEDGE_CHUNKS_PATH ?? '').trim();
    if (configured && existsSync(configured)) {
      return configured;
    }
    for (const candidate of DEFAULT_CANDIDATES) {
      if (existsSync(candidate)) {
        return candidate;
      }
    }
    return null;
  }
}
