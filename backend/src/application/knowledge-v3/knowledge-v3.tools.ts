import { KnowledgeGatewayService } from './knowledge-gateway.service';
import type {
  KnowledgeToolName,
  KnowledgeToolResult,
} from './knowledge-v3.types';

/**
 * 3 个工具的对外定义（设计 §6）。
 *
 * - 只依赖本地类型，不依赖任何模型 SDK；
 * - 描述只写“这个动作能拿到什么”，不写“必须先调用谁”，
 *   也不写结论/摘要/分级/分诊/剂量这类越界能力；
 * - 参数 schema 与 `knowledge-v3.types.ts` 的入参一一对应。
 */

export interface KnowledgeToolDefinition {
  type: 'function';
  function: {
    name: KnowledgeToolName;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export const KNOWLEDGE_TOOL_DEFINITIONS: KnowledgeToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'kb_catalog',
      description:
        '列出知识库中的文档（可按集合过滤）；给出文档 id 时返回该文档的目录，可按目录定位章节页码。',
      parameters: {
        type: 'object',
        properties: {
          collection: {
            type: 'string',
            description: '按集合过滤，例如 SACN5；不传则列出全部文档。',
          },
          documentId: {
            type: 'string',
            description: '文档 id；传入时返回该文档的元数据与目录。',
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'kb_find',
      description:
        '按内容词或短语检索候选页，返回页码、命中表/图、短片段与锚点；可用集合或文档限定范围，limit 控制返回条数。',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '内容词或短语，例如 phosphorus、"vitamin k"。',
          },
          collections: {
            type: 'array',
            items: { type: 'string' },
            description: '限定集合；空数组表示范围为空。',
          },
          documentIds: {
            type: 'array',
            items: { type: 'string' },
            description: '限定文档；空数组表示范围为空。',
          },
          limit: {
            type: 'integer',
            minimum: 1,
            maximum: 30,
            description: '返回条数，默认 10。',
          },
        },
        required: ['query'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'kb_read',
      description:
        '按页读取原文与块结构，可附带页图；支持页码范围、目录 id、token 预算与续读游标。',
      parameters: {
        type: 'object',
        properties: {
          documentId: {
            type: 'string',
            description: '要读取的文档 id。',
          },
          pageFrom: {
            type: 'integer',
            minimum: 1,
            description: '起始页（含）。',
          },
          pageTo: {
            type: 'integer',
            minimum: 1,
            description: '结束页（含）；不传时按默认页宽读取。',
          },
          tocId: {
            type: 'string',
            description: '目录条目 id；传入时按该条目的页码范围读取。',
          },
          includeImages: {
            type: 'boolean',
            description: '是否返回页图路径与内联图；默认 true。',
          },
          budgetTokens: {
            type: 'integer',
            minimum: 1,
            maximum: 200000,
            description: '本次读取的文本 token 预算，默认 20000。',
          },
          cursor: {
            type: 'string',
            description: '上次读取返回的 nextCursor；传入时从这里续读。',
          },
        },
        required: ['documentId'],
        additionalProperties: false,
      },
    },
  },
];

/**
 * 调用方（模型/内部 Agent/脚本）的统一入口：按名字转给网关，
 * 未知名字也由网关包成 `{ ok: false, error }`，这里不抛。
 */
export async function executeKnowledgeTool(
  gateway: KnowledgeGatewayService,
  name: string,
  rawArgs: unknown,
): Promise<KnowledgeToolResult<unknown>> {
  return gateway.execute(name, rawArgs);
}
