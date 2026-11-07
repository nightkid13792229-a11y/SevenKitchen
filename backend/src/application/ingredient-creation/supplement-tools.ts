import type { KnowledgeSearchService } from '../knowledge/knowledge-search.service';
import type { SupplementLinkPreviewService } from './supplement-link-preview.service';
import type { FeedAdditiveCatalogService } from '../../domain/ingredient/feed-additive-catalog.service';
import {
  applyDraftPatch,
  type SupplementDraftRecord
} from '../../domain/ingredient/supplement-draft-patch';

/**
 * 补剂 Agent 的工具箱。
 *
 * 这里只定义"模型能做什么"，**不规定它怎么做**：给不给形态分析、先搜商品还是先查资料，
 * 都由模型自己决定。工具本身的职责是老实执行并把结果/失败如实带回去。
 *
 * 唯一刻意做成"拦"的是 `ask_user`：模型卡住时应当停下来问人，而不是编一个答案。
 */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolContext {
  knowledge: Pick<KnowledgeSearchService, 'search' | 'isAvailable'>;
  preview: Pick<SupplementLinkPreviewService, 'preview' | 'searchCandidates'>;
  catalog: Pick<FeedAdditiveCatalogService, 'lookup' | 'getSummary'>;
  draft: SupplementDraftRecord;
}

export type ToolResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string };

export const SUPPLEMENT_TOOLS: ToolDefinition[] = [
  {
    name: 'search_knowledge',
    description:
      '检索本地营养知识库（NRC / FEDIAF / SACN5 等权威来源），返回带出处的原文段落。' +
      '判断某个营养素有哪些形态、对狗的吸收与安全性时用它。查不到就如实说查不到。',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '检索词，中英文都行' },
        limit: { type: 'integer', minimum: 1, maximum: 8, description: '最多几条，默认 4' }
      },
      required: ['query']
    }
  },
  {
    name: 'search_products',
    description: '按关键词搜索 iHerb 上的商品，返回候选（链接 + 名称）。搜不到就返回空。',
    parameters: {
      type: 'object',
      properties: {
        keyword: { type: 'string', description: '搜索词，建议带上形态，例如「甘氨酸锌」' }
      },
      required: ['keyword']
    }
  },
  {
    name: 'fetch_product',
    description: '读取一个商品链接的页面，返回标签字段（每份几粒、营养素）与人民币标价。',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: '商品链接（http/https）' }
      },
      required: ['url']
    }
  },
  {
    name: 'lookup_feed_catalog',
    description:
      '查询《饲料添加剂品种目录》：给定名字查规范写法与适用范围（是否含犬）。' +
      '只用于标签名称，不是选品门禁。',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '品种名，例如「甘氨酸锌」' }
      },
      required: ['name']
    }
  },
  {
    name: 'write_draft',
    description:
      '往档案草稿里写字段。只写字段与值，不负责判断该不该写。' +
      '营养档案用 servingNutrients，键是字段路径（如 fattyAcids.epa），值是**每份**含量。',
    parameters: {
      type: 'object',
      properties: {
        patch: {
          type: 'object',
          description:
            '要写的字段。可用：name / brand / productModel / purchaseChannel / unitDisplayLabel / ' +
            'physicalForm / servingUnitsPerDose / purchaseUnit / purchaseToBaseRatio / ' +
            'currentPricePerPurchaseUnit / addTiming / productionLossRate / diyEnabled / ' +
            'procurementEnabled / tagNames / labelCategory / labelNames / labelNameSource / servingNutrients'
        }
      },
      required: ['patch']
    }
  },
  {
    name: 'ask_user',
    description:
      '真的需要人来定的时候用它提问（例如选哪个化学形态、要不要跳过某一步）。' +
      '能自己查证的事不要问。',
    parameters: {
      type: 'object',
      properties: {
        question: { type: 'string', description: '要问的一句话' },
        options: {
          type: 'array',
          items: { type: 'string' },
          description: '可选项；开放问题可以不给'
        }
      },
      required: ['question']
    }
  }
];

function asString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${field} 必须是非空字符串`);
  }
  return value.trim();
}

/** 执行一次工具调用。抛出的错误都会被翻译成 ok:false —— 让模型看到失败，而不是让流程崩掉。 */
export async function executeSupplementTool(
  name: string,
  args: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> {
  try {
    switch (name) {
      case 'search_knowledge': {
        const query = asString(args.query, 'query');
        if (!context.knowledge.isAvailable()) {
          return { ok: false, error: '知识库当前不可用（语料未加载），请如实告诉用户并改用人工判断' };
        }
        const limit = typeof args.limit === 'number' ? args.limit : 4;
        return { ok: true, data: context.knowledge.search(query, limit) };
      }

      case 'search_products': {
        const keyword = asString(args.keyword, 'keyword');
        return { ok: true, data: await context.preview.searchCandidates(keyword) };
      }

      case 'fetch_product': {
        const url = asString(args.url, 'url');
        return { ok: true, data: await context.preview.preview(url) };
      }

      case 'lookup_feed_catalog': {
        const target = asString(args.name, 'name');
        return {
          ok: true,
          data: {
            exact: context.catalog.lookup(target, 5),
            summary: context.catalog.getSummary()
          }
        };
      }

      case 'write_draft': {
        const patch = args.patch;
        if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
          return { ok: false, error: 'patch 必须是对象' };
        }
        const result = applyDraftPatch(context.draft, patch as SupplementDraftRecord);
        return {
          ok: true,
          data: {
            applied: result.applied,
            rejected: result.rejected,
            draft: result.draft
          }
        };
      }

      case 'ask_user': {
        const question = asString(args.question, 'question');
        const options = Array.isArray(args.options)
          ? args.options.filter((item): item is string => typeof item === 'string')
          : [];
        return { ok: true, data: { question, options } };
      }

      default:
        return { ok: false, error: `没有这个工具：${name}` };
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
