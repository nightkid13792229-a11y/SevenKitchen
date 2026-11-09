/**
 * 10 个工具（2026-10-31 重建；2026-11-09 最小图书馆版新增 open / scope）。
 *
 * 原则：工具的数量和返回体积，就是模型的"操作规程"。
 * 所以不加"你必须先…"的说明，而是让工具本身只回这一步需要的东西。
 */
import type { DeepSeekToolDefinition } from '../deepseek-tools-chat';
import { RecipeDraftPort } from './draft-port';
import { RecipeCatalogPort } from './catalog-port';
import type {
  KnowledgeLibraryService,
  LibraryPassage,
  SectionHit,
} from '../../knowledge-base/knowledge-library.service';
import type {
  SourceLayerService,
  TableView,
} from '../../knowledge-base/source-layer.service';
import type { KnowledgeScope } from '../../../domain/knowledge/knowledge-scope';
import { normalizeTopics } from '../../knowledge-base/query-expansion';
import { TOPIC_KEYS } from '../../../domain/knowledge/topic-aliases';
import type { CitationRegistry } from './citation-registry';
import {
  AgentToolError,
  fail,
  ok,
  type RecipeEditOp,
  type ToolOutcome,
} from './agent-types';

const NO_ARGS = {
  type: 'object',
  properties: {},
  required: [],
  additionalProperties: false,
} as const;

export const AGENT_TOOLS: DeepSeekToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'read_draft',
      description:
        '读当前草稿：名称、阶段、现有原料与克数、上次评估是否最新。需要看现有配方或阶段时读；草稿是空的就不用读。',
      parameters: NO_ARGS,
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_taxonomy',
      description:
        '查看产品线的需求分类（只读）。产品线按 5 个分类维度划分：主蛋白、健康需求、场景、季节、工艺形态。' +
        '第一步**不带参数**调用，拿到这 5 个分类各自多少节点、挂了多少道；' +
        '再给 kind 看该分类下的节点；再给 nodeId 看该节点下的食谱（最多 20 条）。' +
        '不要把「需求分类」当成「健康需求」一个维度 —— 健康需求只是其中之一。',
      parameters: {
        type: 'object',
        properties: {
          kind: {
            type: 'string',
            description: '分类代码，如 HEALTH_NEED / MAIN_PROTEIN / SCENARIO',
          },
          nodeId: {
            type: 'string',
            description: '分类节点 id，来自上一层返回',
          },
          node: {
            type: 'string',
            description:
              '也可以直接给节点名或路径（如「肾脏泌尿 / 尿石症」）；命中多条会返回候选让你挑',
          },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_knowledge_library',
      description:
        '在知识库原文里按问题找「节」（只读）。返回最多 5 节、每节最多 2 段原文，带来源、章节、页码和引用编号 K#；同时返回命中的表格摘要。' +
        '配方侧只开放 CKD 5 份文档（SACN5 / IRIS-CKD-2026 / AAHA-2021-NUTRITION），不会查 CKD 之外的库。设计疾病营养配方（如 CKD、胰腺炎、肾病）前先用它查证据；可以换关键词、换来源多次查。' +
        '它返回的是原文，不是结论；需要整节/表格全文时用 open_knowledge，最终回答用 [K#] 引用。',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description:
              '检索词，优先英文关键词，如「CKD phosphorus dog 0.2 0.5」「proteinuria UPC dog」',
          },
          sourceIds: {
            type: 'array',
            items: { type: 'string' },
            description:
              '可选：限定来源，仅限 CKD 来源：SACN5 / IRIS-CKD-2026 / AAHA-2021-NUTRITION；不传则查全部 CKD 5 份。',
          },
          limit: {
            type: 'integer',
            minimum: 1,
            maximum: 10,
            description: '最多返回几节，默认 5',
          },
          documentIds: {
            type: 'array',
            items: { type: 'string' },
            description:
              '可选：只在这些文档 ID 里搜，仅限 CKD 5 份；不传则查全部 CKD 5 份。',
          },
          sectionIds: {
            type: 'array',
            items: { type: 'string' },
            description:
              '可选：只在这些章节 ID 里搜；显式传空数组会返回 no_match，不会退回全库。',
          },
          species: {
            type: 'string',
            enum: ['dog', 'cat'],
            description: '可选：犬/猫；只是排序提示，不会排除',
          },
          stage: {
            type: 'integer',
            minimum: 1,
            maximum: 4,
            description: '可选：CKD 分期 1–4；只扩召回和排序，不会排除其他分期',
          },
          topics: {
            type: 'array',
            items: { type: 'string' },
            description:
              '可选主题提示（只排序、不排除），中英文皆可并自动归一；未知主题会报错并列合法值，如 phosphorus / protein / sodium / proteinuria / bloodpressure / staging。',
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
      name: 'open_knowledge',
      description:
        '打开知识库里的节或表格（只读）。三选一：sectionId / tableId / citationId；打开节默认一页 12 段，可用 paragraphOffset 翻页。' +
        '打开的每一段/每张表都会登记引用编号 K#，最终回答用 [K#] 引用。配方侧只开放 CKD。',
      parameters: {
        type: 'object',
        properties: {
          sectionId: { type: 'string', description: '要打开的节 id' },
          tableId: { type: 'string', description: '要打开的表格 id，如 T0497' },
          citationId: {
            type: 'string',
            description: '之前结果里的引用编号，如 K2；按它重新打开对应段落或表格',
          },
          paragraphOffset: {
            type: 'integer',
            minimum: 0,
            description: '可选：打开节时的段落偏移，默认 0，每页 12 段',
          },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'knowledge_scope',
      description:
        '看知识库馆藏（只读）：有哪些文档、各有多少节/段/表。不确定库里有没有某份资料时先看它。' +
        '配方侧默认只列 CKD 5 份，不会暴露 CKD 之外的馆藏。',
      parameters: {
        type: 'object',
        properties: {
          sourceId: {
            type: 'string',
            description:
              '可选：只收窄到某个 CKD 来源，如 IRIS-CKD-2026；非 CKD 来源会被拒绝。',
          },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_food',
      description:
        '按关键词或营养素找原料。按营养素找时，每条会带该营养素的含量、单位和基准。一次最多 8 条。',
      parameters: {
        type: 'object',
        properties: {
          search: { type: 'string', description: '关键词，如「鸭肉」「南瓜」；按营养素找时可只传 nutrientKey' },
          nutrientKey: {
            type: 'string',
            description: '可选：按营养素找，如 magnesium / iron / zinc / iodine / chloride / vitaminD',
          },
          limit: { type: 'integer', minimum: 1, maximum: 20 },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_recipe',
      description:
        '修改当前草稿的原料。一次可传多个操作，按顺序执行并逐条回报结果。',
      parameters: {
        type: 'object',
        properties: {
          ops: {
            type: 'array',
            minItems: 1,
            maxItems: 20,
            items: {
              type: 'object',
              properties: {
                op: {
                  type: 'string',
                  enum: ['add', 'set_weight', 'replace', 'remove'],
                },
                nutritionFoodId: { type: 'string' },
                ingredientId: { type: 'string' },
                itemId: { type: 'string' },
                weightG: { type: 'number', minimum: 0 },
                preparationMethod: { type: 'string', maxLength: 20 },
              },
              required: ['op'],
              additionalProperties: false,
            },
          },
          trackNutrients: {
            type: 'array',
            items: { type: 'string' },
            description:
              '可选：要跟踪的缺口 nutrientKey（如 iodine / chloride / magnesium）；传了会返回改动前后缺口变化和剂量提示。',
          },
        },
        required: ['ops'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'assess',
      description:
        '在当前内容上跑营养评估。只回：过没过、各项计数、还差的项（最多 12 条）、命中的过敏原。配方定稿前必须跑通；没跑过就不算完成。' +
        '如果疾病目标与内置标准冲突（如 CKD 低磷），先用 search_knowledge_library 查到目标，再在 targetOverrides 里传；每个覆盖必须带 citationId。',
      parameters: {
        type: 'object',
        properties: {
          targetOverrides: {
            type: 'array',
            maxItems: 12,
            description:
              '本次评估的目标覆盖；不传则用内置 FEDIAF 标准。每个覆盖必须带本次检索结果的 citationId。',
            items: {
              type: 'object',
              properties: {
                nutrientKey: {
                  type: 'string',
                  description: '评估缺口里的 key，如 phosphorus / crudeProtein',
                },
                basis: {
                  type: 'string',
                  enum: ['DM', 'PER_1000_KCAL'],
                  description:
                    'DM = 每 100g 干物质，数值按百分比填（0.2–0.5）；PER_1000_KCAL = 每 1000 kcal',
                },
                minValue: {
                  anyOf: [{ type: 'number' }, { type: 'null' }],
                },
                maxValue: {
                  anyOf: [{ type: 'number' }, { type: 'null' }],
                },
                citationId: {
                  type: 'string',
                  description: '本次检索结果里的引用编号，如 K1',
                },
              },
              required: [
                'nutrientKey',
                'basis',
                'minValue',
                'maxValue',
                'citationId',
              ],
              additionalProperties: false,
            },
          },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_copy',
      description: '写名称、封面标题、卖点和描述。配方定了再写。',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', maxLength: 200 },
          coverTitle: { type: 'string', maxLength: 20 },
          sellingPoint: { type: 'string', maxLength: 200 },
          description: { type: 'string', maxLength: 4000 },
        },
        minProperties: 1,
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ask',
      description:
        '只有在"目的不清楚"或"两个方向都合理但选错要重做"时才用。一次只问一个问题。',
      parameters: {
        type: 'object',
        properties: {
          question: { type: 'string' },
          options: { type: 'array', items: { type: 'string' }, maxItems: 5 },
        },
        required: ['question'],
        additionalProperties: false,
      },
    },
  },
];

/** 检索返回的段落 + 本次登记的 K 号。 */
export type CitedPassage = LibraryPassage & { citationId: string };

/** 检索返回的节 + 每段的 K 号。 */
export type CitedSection = Omit<SectionHit, 'passages'> & {
  passages: CitedPassage[];
};

/** 表格命中摘要（spec v1.1 §6.3）：文档级，≤3 张。 */
export interface TableHitSummary {
  tableId: string;
  caption: string;
  pageNo: number | null;
  rowCount: number;
  documentId: string;
  sourceId: string | null;
  citationId: string;
}

export interface ToolExecutionContext {
  /** 本次运行开放的知识范围（领域配置）。 */
  scope: KnowledgeScope;
  port: RecipeDraftPort;
  catalog: RecipeCatalogPort;
  library: KnowledgeLibraryService;
  sourceLayer: SourceLayerService;
  citations: CitationRegistry;
  /** ask 工具把问题交回运行时：运行时暂停并等用户回答。 */
  onAsk: (question: string, options: string[]) => void;
}

export async function executeTool(
  name: string,
  rawArgs: unknown,
  context: ToolExecutionContext,
): Promise<ToolOutcome> {
  const args = isRecord(rawArgs) ? rawArgs : {};

  try {
    switch (name) {
      case 'read_draft': {
        const summary = await context.port.readDraft();
        return ok(summary, summarizeDraft(summary));
      }

      case 'read_taxonomy': {
        const kind =
          typeof args.kind === 'string' ? args.kind.trim() : undefined;
        const nodeId =
          typeof args.nodeId === 'string' ? args.nodeId.trim() : undefined;
        const node =
          typeof args.node === 'string' ? args.node.trim() : undefined;
        const result = await context.catalog.read({ kind, nodeId, node });
        return ok(result, summarizeTaxonomy(result));
      }

      case 'search_knowledge_library': {
        const query =
          typeof args.query === 'string' ? args.query.trim() : '';
        if (!query) {
          return fail('INVALID_ARGUMENT', 'query 不能为空');
        }
        if (hasValue(args.scope)) {
          return fail(
            'INVALID_ARGUMENT',
            '本阶段只开放 CKD；scope 参数已移除',
          );
        }

        const sourceIds = readStringArray(args.sourceIds, 'sourceIds');
        const invalidSourceId = sourceIds?.find(
          (sourceId) => !isSourceInScope(context.scope, sourceId),
        );
        if (invalidSourceId) {
          return fail(
            'OUT_OF_SCOPE',
            `来源「${invalidSourceId}」不在「${context.scope.label}」范围；可用：${listScopeValues(context.scope.sourceIds)}`,
          );
        }

        const explicitDocumentIds = readStringArray(
          args.documentIds,
          'documentIds',
        );
        const invalidDocumentId = explicitDocumentIds?.find(
          (documentId) => !isDocumentInScope(context.scope, documentId),
        );
        if (invalidDocumentId) {
          return fail(
            'OUT_OF_SCOPE',
            `文档「${invalidDocumentId}」不在「${context.scope.label}」范围；可用：${listScopeValues(context.scope.documentIds)}`,
          );
        }

        const normalizedTopics = normalizeTopics(args.topics);
        if (normalizedTopics.invalid.length > 0) {
          return fail(
            'INVALID_ARGUMENT',
            `未知主题：${normalizedTopics.invalid.join('、')}；可用：${TOPIC_KEYS.join('、')}`,
          );
        }

        const sectionIds = readStringArray(args.sectionIds, 'sectionIds');
        if (
          isExplicitEmpty(args.sourceIds, sourceIds) ||
          isExplicitEmpty(args.documentIds, explicitDocumentIds) ||
          isExplicitEmpty(args.sectionIds, sectionIds)
        ) {
          // 显式 [] = 范围为空，不是「不限制」：不能悄悄退化成全库，也不能
          // 把「这次没检索」说成「本库没有」（模型会直接转述摘要）。
          return ok(
            {
              status: 'no_match',
              query,
              sections: [],
              tables: [],
              count: 0,
              hints: [
                '这次没有检索：documentIds/sourceIds/sectionIds 传了空数组',
                '去掉空的范围参数再查，或用 knowledge_scope 看馆藏',
              ],
            },
            '显式范围为空，未执行检索（不代表本库未覆盖该问题）',
          );
        }

        const documentIds =
          explicitDocumentIds && explicitDocumentIds.length > 0
            ? explicitDocumentIds
            : context.scope.allDocuments
              ? undefined
              : [...context.scope.documentIds];
        const querySpecies = /\b(dog|dogs|canine)\b|犬/i.test(query)
          ? 'dog'
          : /\b(cat|cats|feline)\b|猫/i.test(query)
            ? 'cat'
            : undefined;
        const queryStageMatch = query.match(/\bstage\s*([1-4])\b|([1-4])\s*期/i);
        const queryStage = queryStageMatch
          ? Number(queryStageMatch[1] ?? queryStageMatch[2])
          : undefined;
        const species =
          args.species === 'dog' || args.species === 'cat'
            ? args.species
            : querySpecies;
        const stage =
          typeof args.stage === 'number' && args.stage >= 1 && args.stage <= 4
            ? (args.stage as 1 | 2 | 3 | 4)
            : queryStage && queryStage >= 1 && queryStage <= 4
              ? (queryStage as 1 | 2 | 3 | 4)
              : undefined;
        const topics =
          normalizedTopics.topics.length > 0
            ? normalizedTopics.topics
            : undefined;
        const limit =
          typeof args.limit === 'number' ? args.limit : undefined;

        const sections = await context.library.searchSections(query, {
          sourceIds,
          documentIds,
          sectionIds,
          species,
          stage,
          topics,
          limit,
        });
        const tableViews = await context.sourceLayer.searchTableViews(query, {
          documentIds,
          sourceIds,
          limit: 3,
        });

        const citedSections: CitedSection[] = sections.map((section) => ({
          ...section,
          passages: section.passages.map((passage) => ({
            ...passage,
            citationId: context.citations.register(passage).citationId,
          })),
        }));
        const citedTables: TableHitSummary[] = tableViews.map((table) => ({
          tableId: table.tableId,
          caption: table.caption,
          pageNo: table.pageNo,
          rowCount: table.rowCount,
          documentId: table.documentId,
          sourceId: table.sourceId,
          citationId: context.citations.registerTable(table).citationId,
        }));

        const status =
          citedSections.length > 0 || citedTables.length > 0
            ? 'ok'
            : 'no_match';
        const summary =
          citedSections.length === 0
            ? citedTables.length === 0
              ? '知识库未覆盖该问题'
              : `未找到节；命中 ${citedTables.length} 张表：${citedTables
                  .slice(0, 3)
                  .map(
                    (table) =>
                      `${table.tableId}${table.caption ? `（${table.caption}）` : ''}[${table.citationId}]`,
                  )
                  .join('；')}`
            : `找到 ${citedSections.length} 节：${citedSections
                .slice(0, 3)
                .map((section) => {
                  const page =
                    section.pageStart === null
                      ? ''
                      : `（p${section.pageStart}）`;
                  const citationId =
                    section.passages[0]?.citationId ?? '';
                  return `${section.displayTitle}${page}[${citationId}]`;
                })
                .join('；')}${
                citedTables.length > 0
                  ? `；表格 ${citedTables.length} 张`
                  : ''
              }`;
        const hints =
          status === 'no_match'
            ? ['换同义词', '用 knowledge_scope 看馆藏']
            : undefined;
        return ok(
          {
            status,
            query,
            sections: citedSections,
            tables: citedTables,
            count: citedSections.length,
            ...(hints ? { hints } : {}),
          },
          summary,
        );
      }

      case 'open_knowledge': {
        const sectionId = readText(args.sectionId);
        const requestedTableId = readText(args.tableId);
        const citationId = readText(args.citationId);

        const targetCount = [sectionId, requestedTableId, citationId].filter(
          Boolean,
        ).length;
        if (targetCount > 1) {
          return fail(
            'INVALID_ARGUMENT',
            'sectionId/tableId/citationId 三选一',
          );
        }

        let resolvedSectionId = sectionId;
        let resolvedTableId = requestedTableId;
        let anchorParagraphId: string | undefined;

        if (citationId) {
          const record = context.citations.get(citationId);
          if (!record) {
            return fail(
              'INVALID_CITATION',
              `引用编号「${citationId}」不在本次会话里；请先检索或打开`,
            );
          }
          if (record.kind === 'table') {
            resolvedTableId = record.tableId ?? record.recordId;
            resolvedSectionId = undefined;
          } else {
            if (!record.sectionId) {
              return fail(
                'INVALID_CITATION',
                `引用「${citationId}」没有所属节，无法打开`,
              );
            }
            resolvedSectionId = record.sectionId;
            resolvedTableId = undefined;
            anchorParagraphId = record.passageId ?? record.recordId;
          }
        }

        if (!resolvedSectionId && !resolvedTableId) {
          return fail(
            'INVALID_ARGUMENT',
            'open_knowledge 需要 sectionId、tableId、citationId 三选一',
          );
        }

        if (resolvedTableId) {
          const table = await context.sourceLayer.openTable(resolvedTableId);
          if (!table) {
            return fail('NOT_FOUND', `没有这张表：${resolvedTableId}`);
          }
          if (!isDocumentInScope(context.scope, table.documentId)) {
            return fail(
              'OUT_OF_SCOPE',
              `表格 ${table.tableId} 属于 ${table.documentId}；不在「${context.scope.label}」范围`,
            );
          }
          const record = context.citations.registerTable(table);
          return ok(
            { status: 'ok', table, citationId: record.citationId },
            `打开表格 ${table.tableId}：${table.caption}${table.pageNo === null ? '' : `（p${table.pageNo}）`}，共 ${table.rowCount} 行 [${record.citationId}]`,
          );
        }

        const paragraphOffset =
          typeof args.paragraphOffset === 'number' &&
          Number.isFinite(args.paragraphOffset) &&
          args.paragraphOffset >= 0
            ? Math.floor(args.paragraphOffset)
            : undefined;
        const section = await context.sourceLayer.openSection(
          resolvedSectionId!,
          { paragraphOffset, anchorParagraphId },
        );
        if (!section) {
          return fail('NOT_FOUND', `没有这一节：${resolvedSectionId}`);
        }
        if (!isDocumentInScope(context.scope, section.documentId)) {
          return fail(
            'OUT_OF_SCOPE',
            `节 ${section.sectionId} 属于 ${section.documentId}；不在「${context.scope.label}」范围`,
          );
        }
        if (!section.anchorFound) {
          return fail(
            'NOT_FOUND',
            `引用段不在 ${section.displayTitle || section.sectionId}：原段落已不存在或已重切，请重新检索`,
          );
        }
        if (section.totalParagraphs === 0) {
          return ok(
            {
              status: 'ok',
              section: { ...section, paragraphs: [] },
              citationIds: [],
            },
            `本节没有段落：${section.displayTitle}`,
          );
        }

        const paragraphs = section.paragraphs.map((paragraph) => {
          const passage: LibraryPassage = {
            id: paragraph.id,
            text: paragraph.text,
            truncated: false,
            sourceId: section.sourceId,
            sourceName: section.sourceName,
            sourceVersion: section.sourceVersion,
            documentId: section.documentId,
            documentTitle: section.documentTitle,
            sectionId: paragraph.sectionId,
            sectionTitle: section.title,
            pageStart: paragraph.pageStart,
            pageEnd: paragraph.pageEnd,
            score: 0,
          };
          return {
            ...passage,
            citationId: context.citations.register(passage).citationId,
          };
        });
        const citationIds = paragraphs.map((paragraph) => paragraph.citationId);
        const emptyPageHint =
          paragraphs.length === 0 && section.totalParagraphs > 0
            ? '；本页无段落，可用 paragraphOffset=0'
            : '';
        return ok(
          {
            status: 'ok',
            section: { ...section, paragraphs },
            citationIds,
          },
          `打开 ${section.displayTitle}：${paragraphs.length}/${section.totalParagraphs} 段${
            section.nextOffset === null
              ? ''
              : `（下一页 paragraphOffset=${section.nextOffset}）`
          }${paragraphs.length > 0 ? `，引用 ${citationIds.join('、')}` : ''}${emptyPageHint}`,
        );
      }

      case 'knowledge_scope': {
        const sourceId = readText(args.sourceId);
        if (sourceId && !isSourceInScope(context.scope, sourceId)) {
          return fail(
            'OUT_OF_SCOPE',
            `来源「${sourceId}」不在「${context.scope.label}」范围；可用：${listScopeValues(context.scope.sourceIds)}`,
          );
        }
        const inventory = await context.sourceLayer.scope({
          documentIds: context.scope.allDocuments
            ? undefined
            : [...context.scope.documentIds],
          sourceId,
        });
        return ok(
          { status: 'ok', scope: context.scope.id, ...inventory },
          `馆藏 ${inventory.totals.documents} 份文档、${inventory.totals.sections} 节、${inventory.totals.paragraphs} 段、${inventory.totals.tables} 张表（范围：${context.scope.label}）`,
        );
      }

      case 'find_food': {
        const search =
          typeof args.search === 'string' ? args.search.trim() : '';
        const nutrientKey =
          typeof args.nutrientKey === 'string'
            ? args.nutrientKey.trim()
            : '';
        if (!search && !nutrientKey) {
          return fail('INVALID_ARGUMENT', 'search 或 nutrientKey 至少给一个');
        }
        const candidates = await context.port.findFoods({
          search: search || undefined,
          nutrientKey: nutrientKey || undefined,
          limit: typeof args.limit === 'number' ? args.limit : undefined,
        });
        const label = nutrientKey ? `营养素 ${nutrientKey}` : `「${search}」`;
        return ok(
          candidates,
          candidates.length === 0
            ? `没有找到${label}，换个说法或先入库`
            : `找到 ${candidates.length} 条`,
        );
      }

      case 'edit_recipe': {
        const ops = Array.isArray(args.ops) ? args.ops : [];
        if (ops.length === 0) {
          return fail('INVALID_ARGUMENT', 'ops 不能为空');
        }
        const parsed = parseOps(ops);
        if (!parsed.ok) {
          return fail('INVALID_ARGUMENT', parsed.message);
        }
        const trackNutrients = Array.isArray(args.trackNutrients)
          ? args.trackNutrients
              .filter((item): item is string => typeof item === 'string')
              .map((item) => item.trim())
              .filter(Boolean)
              .slice(0, 12)
          : [];
        const trackOverrides = context.port.getLastTargetOverrides();
        const before =
          trackNutrients.length > 0
            ? await context.port.assess(trackOverrides)
            : null;
        const results = await context.port.editRecipe(parsed.ops);
        const failed = results.filter((item) => !item.ok);
        let impact:
          | Array<{
              key: string;
              label: string;
              before: number | null;
              after: number | null;
              deficitBefore: number | null;
              deficitAfter: number | null;
              doseGuidance?: string;
            }>
          | undefined;
        if (trackNutrients.length > 0) {
          const after = await context.port.assess(trackOverrides);
          impact = trackNutrients.map((key) => {
            const b = before?.gaps.find((gap) => gap.key === key);
            const a = after.gaps.find((gap) => gap.key === key);
            return {
              key,
              label: a?.label ?? b?.label ?? key,
              before: b?.value ?? null,
              after: a?.value ?? null,
              deficitBefore: b?.deficit ?? null,
              deficitAfter: a?.deficit ?? null,
              ...(a?.doseGuidance ? { doseGuidance: a.doseGuidance } : {}),
            };
          });
        }
        const summary =
          failed.length === 0
            ? `${results.length} 项已执行`
            : `${results.length - failed.length} 项成功，${failed.length} 项失败：${failed
                .map((item) => item.message)
                .join('；')}`;
        return {
          ok: failed.length === 0,
          data: impact ? { results, impact } : results,
          summary: impact
            ? `${summary}；${impact
                .map(
                  (item) =>
                    `${item.label}：${item.before ?? '?'} → ${item.after ?? '?'}，还差 ${item.deficitAfter ?? '?'}${item.doseGuidance ? `（${item.doseGuidance}）` : ''}`,
                )
                .join('；')}`
            : summary,
        };
      }

      case 'assess': {
        const rawOverrides = Array.isArray(args.targetOverrides)
          ? args.targetOverrides
          : [];
        const targetOverrides = [];
        for (const raw of rawOverrides.slice(0, 12)) {
          if (!isRecord(raw)) {
            return fail('INVALID_ARGUMENT', 'targetOverrides 的每一项必须是对象');
          }
          const nutrientKey = String(raw.nutrientKey ?? '').trim();
          const citationId = String(raw.citationId ?? '').trim();
          const basis = String(raw.basis ?? '').trim();
          if (!nutrientKey) {
            return fail('INVALID_ARGUMENT', 'targetOverrides 缺少 nutrientKey');
          }
          if (basis !== 'DM' && basis !== 'PER_1000_KCAL') {
            return fail(
              'INVALID_ARGUMENT',
              `targetOverrides.${nutrientKey} 的 basis 只能是 DM 或 PER_1000_KCAL`,
            );
          }
          if (!citationId || !context.citations.get(citationId)) {
            return fail(
              'INVALID_CITATION',
              `targetOverrides.${nutrientKey} 的 citationId「${citationId}」不在本次检索结果里`,
            );
          }
          const minValue =
            raw.minValue === null || raw.minValue === undefined
              ? null
              : Number(raw.minValue);
          const maxValue =
            raw.maxValue === null || raw.maxValue === undefined
              ? null
              : Number(raw.maxValue);
          if (
            (minValue !== null && !Number.isFinite(minValue)) ||
            (maxValue !== null && !Number.isFinite(maxValue))
          ) {
            return fail(
              'INVALID_ARGUMENT',
              `targetOverrides.${nutrientKey} 的上下限必须是数字或 null`,
            );
          }
          targetOverrides.push({
            nutrientKey,
            basis: basis as 'DM' | 'PER_1000_KCAL',
            minValue,
            maxValue,
            citationId,
          });
        }
        const summary = await context.port.assess(targetOverrides);
        const applied = targetOverrides.length;
        return ok(
          { ...summary, appliedTargetOverrides: targetOverrides },
          `${summarizeAssessment(summary)}${
            applied > 0 ? `；已应用 ${applied} 个目标覆盖` : ''
          }`,
        );
      }

      case 'write_copy': {
        const changed = await context.port.writeCopy({
          name: readText(args.name),
          coverTitle: readText(args.coverTitle),
          sellingPoint: readText(args.sellingPoint),
          description: readText(args.description),
        });
        return ok(
          changed,
          changed.length === 0 ? '没有需要写的内容' : `已写：${changed.join('、')}`,
        );
      }

      case 'ask': {
        const question = readText(args.question);
        if (!question) {
          return fail('INVALID_ARGUMENT', 'question 不能为空');
        }
        const options = Array.isArray(args.options)
          ? args.options.filter((item): item is string => typeof item === 'string')
          : [];
        context.onAsk(question, options);
        return ok({ question, options }, `已向用户提问：${question}`);
      }

      default:
        return fail('UNKNOWN_TOOL', `没有这个工具：${name}`);
    }
  } catch (error) {
    if (error instanceof AgentToolError) {
      return fail(error.code, error.message);
    }
    return fail('TOOL_FAILED', (error as Error).message || '工具执行失败');
  }
}

function parseOps(
  raw: unknown[],
): { ok: true; ops: RecipeEditOp[] } | { ok: false; message: string } {
  const ops: RecipeEditOp[] = [];
  for (const entry of raw) {
    if (!isRecord(entry)) {
      return { ok: false, message: 'ops 里的每一项必须是对象' };
    }
    const op = entry.op;
    if (op === 'add') {
      const nutritionFoodId = readText(entry.nutritionFoodId);
      const weightG = Number(entry.weightG);
      if (!nutritionFoodId || !Number.isFinite(weightG) || weightG <= 0) {
        return { ok: false, message: 'add 需要 nutritionFoodId 和 weightG' };
      }
      ops.push({
        op: 'add',
        nutritionFoodId,
        ingredientId: readText(entry.ingredientId),
        weightG,
        preparationMethod: readText(entry.preparationMethod),
      });
      continue;
    }
    if (op === 'set_weight') {
      const itemId = readText(entry.itemId);
      const weightG = Number(entry.weightG);
      if (!itemId || !Number.isFinite(weightG) || weightG <= 0) {
        return { ok: false, message: 'set_weight 需要 itemId 和 weightG' };
      }
      ops.push({ op: 'set_weight', itemId, weightG });
      continue;
    }
    if (op === 'remove') {
      const itemId = readText(entry.itemId);
      if (!itemId) return { ok: false, message: 'remove 需要 itemId' };
      ops.push({ op: 'remove', itemId });
      continue;
    }
    if (op === 'replace') {
      const itemId = readText(entry.itemId);
      const nutritionFoodId = readText(entry.nutritionFoodId);
      if (!itemId || !nutritionFoodId) {
        return { ok: false, message: 'replace 需要 itemId 和 nutritionFoodId' };
      }
      ops.push({
        op: 'replace',
        itemId,
        nutritionFoodId,
        ingredientId: readText(entry.ingredientId),
      });
      continue;
    }
    return { ok: false, message: `不认识的 op：${String(op)}` };
  }
  return { ok: true, ops };
}

function summarizeTaxonomy(result: unknown): string {
  const value = result as {
    kinds?: Array<{ name: string; nodeCount: number; seriesCount: number }>;
    kind?: { name: string };
    total?: number;
    node?: { path: string };
    series?: unknown[];
  };
  if (value.kinds) {
    const totalSeries = value.kinds.reduce(
      (sum, kind) => sum + kind.seriesCount,
      0,
    );
    return `${value.kinds.length} 个分类，共挂 ${totalSeries} 道：${value.kinds
      .map((kind) => `${kind.name} ${kind.nodeCount} 节点/${kind.seriesCount} 道`)
      .join('；')}`;
  }
  if ((value as { matches?: unknown[] }).matches) {
    const matches = (value as { matches: Array<{ path: string }> }).matches;
    return `命中 ${matches.length} 个节点，请确认是哪一个：${matches
      .map((item) => item.path)
      .join('、')}`;
  }
  if (value.node) {
    return `${value.node.path}：共 ${value.total ?? 0} 道，返回 ${value.series?.length ?? 0} 道`;
  }
  if (value.kind) {
    return `${value.kind.name}：${value.total ?? 0} 个节点`;
  }
  return '分类信息';
}

function summarizeDraft(summary: {
  name: string;
  itemCount: number;
  totalWeightG: number;
  scenario: string;
  lastAssessment: { isCompliant: boolean; stale: boolean } | null;
}): string {
  const assessment = summary.lastAssessment
    ? summary.lastAssessment.stale
      ? '上次评估已过期'
      : summary.lastAssessment.isCompliant
        ? '上次评估达标'
        : '上次评估未达标'
    : '还没评估过';
  return `${summary.name || '未命名'}：${summary.scenario}，${summary.itemCount} 项原料、共 ${Math.round(
    summary.totalWeightG,
  )}g；${assessment}`;
}

function summarizeAssessment(summary: {
  isCompliant: boolean;
  counts: { deficient: number; excess: number; missingData: number };
  gaps: Array<{
    label: string;
    value: number | null;
    min: number | null;
    max: number | null;
    unit: string;
    deficit?: number | null;
    doseGuidance?: string;
  }>;
  missingData?: Array<{
    label: string;
    missingItemCount: number;
    totalItemCount: number;
  }>;
  allergens: string[];
}): string {
  const parts = [
    summary.isCompliant ? '达标' : '未达标',
    `缺 ${summary.counts.deficient} 项 / 超 ${summary.counts.excess} 项 / 缺数据 ${summary.counts.missingData} 项`,
  ];
  if (summary.gaps.length > 0) {
    parts.push(
      `主要缺口：${summary.gaps
        .map((gap) => {
          const unit = gap.unit ? ` ${gap.unit}` : '';
          const actual =
            gap.value == null ? '未知' : `${gap.value}${unit}`;
          const target =
            gap.min == null && gap.max == null
              ? ''
              : `（目标 ${gap.min ?? '?'}–${gap.max ?? '?'}${unit}）`;
          const deficit =
            gap.deficit == null
              ? ''
              : `，还差 ${gap.deficit}${unit}`;
          const dose = gap.doseGuidance ? `；${gap.doseGuidance}` : '';
          return `${gap.label} ${actual}${target}${deficit}${dose}`;
        })
        .join('、')}`,
    );
  }
  if (summary.missingData && summary.missingData.length > 0) {
    parts.push(
      `缺数据：${summary.missingData
        .map(
          (item) =>
            `${item.label}（${item.missingItemCount}/${item.totalItemCount} 原料无数据）`,
        )
        .join('、')}`,
    );
  }
  if (summary.gaps.length > 0) {
    parts.push(
      '若该营养素受当前疾病影响，先查原文确认目标，再改配方',
    );
  }
  if (summary.allergens.length > 0) {
    parts.push(`⚠ 命中过敏原：${summary.allergens.join('、')}`);
  }
  return parts.join('；');
}

function readText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

/** 文档是否在当前范围：全库范围放行一切；否则必须在白名单里。 */
function isDocumentInScope(
  scope: KnowledgeScope,
  documentId: string | null | undefined,
): boolean {
  if (scope.allDocuments) return true;
  return scope.documentIds.includes(String(documentId ?? ''));
}

/** 来源是否在当前范围：全库放行；白名单为空时一律拒绝（fail closed）。 */
function isSourceInScope(scope: KnowledgeScope, sourceId: string): boolean {
  if (scope.allDocuments) return true;
  return scope.sourceIds.includes(sourceId);
}

/** 错误文案里列出可用值；全库范围直接说"全库"。 */
function listScopeValues(values: readonly string[]): string {
  return values.length > 0 ? values.join('、') : '（本领域未配置）';
}

/** 参数是否真的传了值（空字符串 / 空数组 / null 都算没传）。 */
function hasValue(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/**
 * 显式传了数组、清空后为空 —— 这是「范围为空」，不是「不限制」。
 * 必须和「没传」区分开，否则会退化成全库。
 */
function isExplicitEmpty(
  raw: unknown,
  parsed: string[] | undefined,
): boolean {
  return Array.isArray(raw) && (parsed?.length ?? 0) === 0;
}

/**
 * 读字符串数组参数：
 * - 字符串按单个值处理（模型偶尔把数组写成字符串）；
 * - 数组沿用原来的清洗逻辑；
 * - 传了别的类型（数字/对象/布尔）明确报错，不能静默当没传退化成全库。
 */
function readStringArray(
  value: unknown,
  name: string,
): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }
  if (!Array.isArray(value)) {
    throw new AgentToolError(
      'INVALID_ARGUMENT',
      `${name} 需要字符串数组`,
    );
  }
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
