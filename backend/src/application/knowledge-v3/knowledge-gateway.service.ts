import { Injectable, Logger, Optional } from '@nestjs/common';
import { KnowledgeCatalogService } from './knowledge-catalog.service';
import { KnowledgeFindService } from './knowledge-find.service';
import { KnowledgeReadService } from './knowledge-read.service';
import { KnowledgeToolError } from './knowledge-v3.errors';
import type {
  KbCatalogArgs,
  KbCatalogResult,
  KbFindArgs,
  KbFindResult,
  KbReadArgs,
  KbReadResult,
  KnowledgeToolResult,
} from './knowledge-v3.types';

/**
 * 3 个通用动作的边界（设计 §6）：参数校验 + 错误归一 + 每次调用一行日志。
 *
 * 这里只做“输入合法吗、调哪个数据服务、失败怎么包”三件事：
 * - 不判断知识库是否覆盖，不生成结论/摘要，不做临床分级；
 * - 不建审计表、不识别身份；身份与传输层由以后接的调用方负责；
 * - 每次 `execute` 记 `{ tool, ok, documentId?, pages?, ms }`，只走 Logger。
 */

const MIN_LIMIT = 1;
const MAX_LIMIT = 30;
const MIN_PAGE = 1;
const MAX_PAGE = Number.MAX_SAFE_INTEGER;
const MIN_BUDGET_TOKENS = 1;
const MAX_BUDGET_TOKENS = 200_000;

interface CallLog {
  tool: string;
  ok: boolean;
  documentId?: string;
  pages?: number;
  ms: number;
}

@Injectable()
export class KnowledgeGatewayService {
  private readonly logger: Logger;

  constructor(
    private readonly catalogService: KnowledgeCatalogService,
    private readonly findService: KnowledgeFindService,
    private readonly readService: KnowledgeReadService,
    // Logger 允许注入（测试/调用方替换）；Nest 不提供时回退到类名 Logger。
    @Optional() logger?: Logger,
  ) {
    this.logger = logger ?? new Logger(KnowledgeGatewayService.name);
  }

  /**
   * `documentId` 优先于 `collection`：给了文档就返回该文档 + 目录，
   * 只给集合就列集合内的书。
   */
  async catalog(args: KbCatalogArgs): Promise<KbCatalogResult> {
    const source = asObject(args);
    const collection = optionalString(source, 'collection');
    const documentId = optionalString(source, 'documentId');

    if (documentId !== undefined) {
      return this.catalogService.get(documentId);
    }
    // `list` 只返回文档摘要；catalog 的对外形状统一是 `{ sources }`。
    return { sources: await this.catalogService.list(collection) };
  }

  /**
   * 范围优先级：`documentIds` / `collections` 都是显式范围；
   * 任一为空数组都表示“范围为空”，直接 0 命中，不退回全库。
   */
  async find(args: KbFindArgs): Promise<KbFindResult> {
    const source = asObject(args);
    const query = requiredString(source, 'query');
    const collections = optionalStringArray(source, 'collections');
    const documentIds = optionalStringArray(source, 'documentIds');
    const limit = optionalInteger(source, 'limit', MIN_LIMIT, MAX_LIMIT);

    if (collections?.length === 0 || documentIds?.length === 0) {
      return { hits: [], searched: { documents: 0, pages: 0 } };
    }

    return this.findService.find({
      query,
      ...(collections !== undefined ? { collections } : {}),
      ...(documentIds !== undefined ? { documentIds } : {}),
      ...(limit !== undefined ? { limit } : {}),
    });
  }

  /**
   * 范围优先级：`cursor` > `tocId` > `pageFrom`/`pageTo`（设计 §6.4）。
   * 低优先级字段不参与本次读取，也不校验，避免游标续读被多余页码干扰。
   * `includeImages` / `budgetTokens` 是读取选项，任何路径都可以覆盖。
   */
  async read(args: KbReadArgs): Promise<KbReadResult> {
    const source = asObject(args);
    const documentId = requiredString(source, 'documentId');
    const cursor = optionalString(source, 'cursor');
    const tocId = optionalString(source, 'tocId');
    const pageFrom = optionalInteger(source, 'pageFrom', MIN_PAGE, MAX_PAGE);
    const pageTo = optionalInteger(source, 'pageTo', MIN_PAGE, MAX_PAGE);
    const includeImages = optionalBoolean(source, 'includeImages');
    const budgetTokens = optionalInteger(
      source,
      'budgetTokens',
      MIN_BUDGET_TOKENS,
      MAX_BUDGET_TOKENS,
    );

    if (pageFrom !== undefined && pageTo !== undefined && pageTo < pageFrom) {
      throw invalidArgument('pageTo 不能小于 pageFrom');
    }

    const options = {
      ...(includeImages !== undefined ? { includeImages } : {}),
      ...(budgetTokens !== undefined ? { budgetTokens } : {}),
    };

    if (cursor !== undefined) {
      return this.readService.read({ documentId, cursor, ...options });
    }
    if (tocId !== undefined) {
      return this.readService.read({ documentId, tocId, ...options });
    }
    return this.readService.read({
      documentId,
      ...(pageFrom !== undefined ? { pageFrom } : {}),
      ...(pageTo !== undefined ? { pageTo } : {}),
      ...options,
    });
  }

  /**
   * 工具边界：任何输入都返回 `KnowledgeToolResult`，不向上抛异常。
   * 未知工具/参数错误 → `INVALID_ARGUMENT`；数据层/未知异常 → `INTERNAL_ERROR`。
   */
  async execute(
    name: string,
    rawArgs: unknown,
  ): Promise<KnowledgeToolResult<unknown>> {
    const startedAt = Date.now();
    const tool = typeof name === 'string' ? name.trim() : '';
    const documentId = peekDocumentId(rawArgs);

    try {
      let data: unknown;
      switch (tool) {
        case 'kb_catalog':
          data = await this.catalog(rawArgs as KbCatalogArgs);
          break;
        case 'kb_find':
          data = await this.find(rawArgs as KbFindArgs);
          break;
        case 'kb_read':
          data = await this.read(rawArgs as KbReadArgs);
          break;
        default:
          throw invalidArgument(`未知工具：${tool || '(空)'}`);
      }

      this.logCall({
        tool,
        ok: true,
        ...(documentId !== undefined ? { documentId } : {}),
        ...(tool === 'kb_read' ? { pages: pageCount(data) } : {}),
        ms: Date.now() - startedAt,
      });
      return { ok: true, data };
    } catch (error) {
      this.logCall({
        tool,
        ok: false,
        ...(documentId !== undefined ? { documentId } : {}),
        ms: Date.now() - startedAt,
      });

      if (error instanceof KnowledgeToolError) {
        return {
          ok: false,
          error: { code: error.code, message: error.message },
        };
      }

      // 内部细节只进日志，不回给调用方。
      this.logger.error(
        `知识库工具 ${tool || '(空)'} 执行失败：${describeError(error)}`,
      );
      return {
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: 'INTERNAL_ERROR: 知识库内部错误' },
      };
    }
  }

  private logCall(call: CallLog): void {
    const entry: Record<string, unknown> = {
      tool: call.tool,
      ok: call.ok,
    };
    if (call.documentId !== undefined) entry.documentId = call.documentId;
    if (call.pages !== undefined) entry.pages = call.pages;
    entry.ms = call.ms;
    this.logger.log(entry);
  }
}

function asObject(raw: unknown): Record<string, unknown> {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw invalidArgument('参数必须是对象');
  }
  return raw as Record<string, unknown>;
}

function requiredString(
  source: Record<string, unknown>,
  field: string,
): string {
  const value = optionalString(source, field);
  if (value === undefined) {
    throw invalidArgument(`${field} 不能为空`);
  }
  return value;
}

function optionalString(
  source: Record<string, unknown>,
  field: string,
): string | undefined {
  const value = source[field];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') {
    throw invalidArgument(`${field} 必须是字符串`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw invalidArgument(`${field} 不能为空`);
  }
  return trimmed;
}

function optionalStringArray(
  source: Record<string, unknown>,
  field: string,
): string[] | undefined {
  const value = source[field];
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) {
    throw invalidArgument(`${field} 必须是字符串数组`);
  }
  return value.map((item) => {
    if (typeof item !== 'string') {
      throw invalidArgument(`${field} 必须是字符串数组`);
    }
    const trimmed = item.trim();
    if (!trimmed) {
      throw invalidArgument(`${field} 不能包含空字符串`);
    }
    return trimmed;
  });
}

function optionalInteger(
  source: Record<string, unknown>,
  field: string,
  min: number,
  max: number,
): number | undefined {
  const value = source[field];
  if (value === undefined || value === null) return undefined;
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < min ||
    value > max
  ) {
    throw invalidArgument(`${field} 必须是 ${min}–${max} 的整数`);
  }
  return value;
}

function optionalBoolean(
  source: Record<string, unknown>,
  field: string,
): boolean | undefined {
  const value = source[field];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'boolean') {
    throw invalidArgument(`${field} 必须是布尔值`);
  }
  return value;
}

/** 日志字段：入参里有合法 documentId 就记下来，非法/缺失不影响主流程。 */
function peekDocumentId(raw: unknown): string | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return undefined;
  }
  const value = (raw as Record<string, unknown>).documentId;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function pageCount(data: unknown): number | undefined {
  if (typeof data !== 'object' || data === null) return undefined;
  const pages = (data as Record<string, unknown>).pages;
  return Array.isArray(pages) ? pages.length : undefined;
}

function invalidArgument(message: string): KnowledgeToolError {
  return new KnowledgeToolError('INVALID_ARGUMENT', `INVALID_ARGUMENT: ${message}`);
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
