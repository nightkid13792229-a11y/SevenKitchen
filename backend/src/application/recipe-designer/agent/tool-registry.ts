/**
 * Agent 工具注册表（P0a Task 5）。
 *
 * 把 Task 2–4 的读/写/查工具和 Task 5 的控制工具组装成一张表：
 * `AGENT_TOOL_DEFINITIONS` 是给模型看的 18 个工具定义，
 * `createAgentToolHandlers` 返回同名 handler。
 *
 * **审批安全边界**：`check_ready` / `finish_draft` 的 JSON schema 里没有
 * `exceptionApproved` / `confirmedOmissions`；handler 也不读模型参数，只从
 * `controlPort.getApprovalState()` 注入。模型只能 `request_exception`，不能自批。
 */
import { REQUIRED_FOOD_CATEGORIES } from '../../../domain/recipe-designer/food-category-map';
import type { FoodCategory } from '../../../domain/recipe-designer/food-category-map';
import type { AgentReadyResult, RecipeAgentCheckTools } from './check-tools';
import { createCheckTools } from './check-tools';
import { createControlTools } from './control-tools';
import { createReadTools } from './read-tools';
import type { AgentToolResult, HealthTagPolicy } from './agent-types';
import type {
  RecipeAgentControlPort,
  RecipeAgentDraftPort,
} from './recipe-agent.port';
import { createWriteTools } from './write-tools';

/** 工具定义：名字、中文说明、JSON Schema 参数。 */
export interface AgentToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

type RawToolArgs = Record<string, unknown>;

/**
 * 统一 handler 形状：模型传来的是未经校验的 JSON 对象，具体类型收窄在
 * 各工具内部完成（运行时会绕过 TypeScript 类型）。
 */
export type AgentToolHandler = (
  args?: RawToolArgs,
) => Promise<AgentToolResult<any>>;

export interface AgentToolHandlerDeps {
  port: RecipeAgentDraftPort;
  controlPort: RecipeAgentControlPort;
  tagPolicy: HealthTagPolicy;
  draftId: string;
}

/** 把异常转成给模型看的一句话。 */
function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}

const FOOD_CATEGORY_VALUES = [
  'PROTEIN',
  'ORGAN',
  'CARB',
  'VEGETABLE',
  'MUSHROOM',
  'NUTS',
  'OIL',
  'FRUIT',
  'DAIRY',
  'EGG',
  'LEGUME',
  'SEASONING',
  'SUPPLEMENT',
  'UNCLASSIFIED',
] as const satisfies readonly FoodCategory[];

const REQUIRED_CATEGORY_VALUES = [...REQUIRED_FOOD_CATEGORIES];

const NO_ARGS_SCHEMA = {
  type: 'object',
  properties: {},
  required: [],
  additionalProperties: false,
} as const;

/**
 * 18 个工具定义。描述用中文一句话说清“什么时候用”；
 * 参数 schema 与 Task 2–4 的运行时校验保持一致。
 */
export const AGENT_TOOL_DEFINITIONS: AgentToolDefinition[] = [
  {
    name: 'get_draft',
    description:
      '读取当前草稿的原料、克数、占比、文案、内容版本和上次评估；每次开始或内容被改过后先读它。',
    parameters: NO_ARGS_SCHEMA,
  },
  {
    name: 'search_ingredients',
    description:
      '按关键词、分类或原料类型搜索标准原料库；需要找可用的真实原料时用。',
    parameters: {
      type: 'object',
      properties: {
        search: { type: 'string', description: '关键词，如「鸭肉」「南瓜」。' },
        category: {
          type: 'string',
          enum: FOOD_CATEGORY_VALUES,
          description: '食材分类。',
        },
        type: {
          type: 'string',
          enum: ['FOOD', 'SUPPLEMENT'],
          description: 'FOOD 是食材，SUPPLEMENT 是补剂。',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 50,
          default: 20,
          description: '最多返回多少条，默认 20。',
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'get_ingredient',
    description:
      '查看某个真实原料的营养、过敏原和预处理方式；确定用它之前先查详情。',
    parameters: {
      type: 'object',
      properties: {
        nutritionFoodId: {
          type: 'string',
          description: '营养库的原料 ID。',
        },
      },
      required: ['nutritionFoodId'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_catalog_usage',
    description:
      '查看某个主蛋白或某套原料在已发布目录里的使用情况；定主蛋白和差异化策略前取证据。',
    parameters: {
      type: 'object',
      properties: {
        mainProteinName: {
          type: 'string',
          description: '主蛋白名，如「鸭肉」。',
        },
        ingredientNames: {
          type: 'array',
          items: { type: 'string' },
          description: '要查重合的原料名列表。',
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'add_ingredient',
    description: '往当前草稿加一个真实原料和克数；确认原料 ID 后用它落草稿。',
    parameters: {
      type: 'object',
      properties: {
        nutritionFoodId: {
          type: 'string',
          description: '营养库的原料 ID，必须真实。',
        },
        ingredientId: {
          type: 'string',
          description: '原料库 ID；通常不用传。',
        },
        weightG: {
          type: 'number',
          minimum: 0.1,
          maximum: 10000,
          description: '克数，0.1–10000g。',
        },
        preparationMethod: {
          type: 'string',
          description: '预处理方式，如「去皮切块」。',
        },
      },
      required: ['nutritionFoodId', 'weightG'],
      additionalProperties: false,
    },
  },
  {
    name: 'replace_ingredient',
    description: '用另一个真实原料替换草稿里的某一条；发现原料不合适时用。',
    parameters: {
      type: 'object',
      properties: {
        itemId: { type: 'string', description: '要替换的草稿原料条目 ID。' },
        nutritionFoodId: {
          type: 'string',
          description: '新原料的营养库 ID。',
        },
        ingredientId: {
          type: 'string',
          description: '新原料的原料库 ID；通常不用传。',
        },
        weightG: {
          type: 'number',
          minimum: 0.1,
          maximum: 10000,
          description: '新克数，0.1–10000g。',
        },
      },
      required: ['itemId', 'nutritionFoodId', 'weightG'],
      additionalProperties: false,
    },
  },
  {
    name: 'update_weight',
    description: '修改草稿里某条原料的克数；调整配比时用。',
    parameters: {
      type: 'object',
      properties: {
        itemId: { type: 'string', description: '草稿原料条目 ID。' },
        weightG: {
          type: 'number',
          minimum: 0.1,
          maximum: 10000,
          description: '新克数，0.1–10000g。',
        },
      },
      required: ['itemId', 'weightG'],
      additionalProperties: false,
    },
  },
  {
    name: 'remove_ingredient',
    description: '从草稿删除某条原料；发现重复或不需要时用，不能删到总重为 0。',
    parameters: {
      type: 'object',
      properties: {
        itemId: { type: 'string', description: '草稿原料条目 ID。' },
      },
      required: ['itemId'],
      additionalProperties: false,
    },
  },
  {
    name: 'set_preparation',
    description: '设置某条原料的预处理方式和备注；写制作流程前补齐处理方式。',
    parameters: {
      type: 'object',
      properties: {
        itemId: { type: 'string', description: '草稿原料条目 ID。' },
        method: { type: 'string', description: '预处理方式，如「焯水切丁」。' },
        note: {
          type: ['string', 'null'],
          description: '预处理备注，可选。',
        },
      },
      required: ['itemId', 'method'],
      additionalProperties: false,
    },
  },
  {
    name: 'set_copy',
    description:
      '写系列名、封面标题、卖点、描述和健康标签；文案定稿时用，会做合规校验。',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '系列名。' },
        coverTitle: { type: 'string', description: '封面标题。' },
        sellingPoint: { type: 'string', description: '卖点。' },
        description: { type: 'string', description: '描述。' },
        targetHealthTags: {
          type: 'array',
          items: { type: 'string' },
          description: '健康标签，必须在白名单内。',
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'set_production_steps',
    description: '写结构化的制作步骤；原料和配比定稿后用它。',
    parameters: {
      type: 'object',
      properties: {
        steps: {
          type: 'array',
          maxItems: 30,
          items: {
            type: 'object',
            properties: {
              sortOrder: {
                type: 'integer',
                minimum: 1,
                description: '步骤序号。',
              },
              instruction: {
                type: 'string',
                description: '这一步做什么。',
              },
              duration: {
                type: ['string', 'null'],
                description: '时长，可选。',
              },
              temperature: {
                type: ['string', 'null'],
                description: '温度，可选。',
              },
              equipment: {
                type: ['string', 'null'],
                description: '器具，可选。',
              },
            },
            required: ['sortOrder', 'instruction'],
            additionalProperties: false,
          },
        },
      },
      required: ['steps'],
      additionalProperties: false,
    },
  },
  {
    name: 'run_assessment',
    description: '在当前内容版本上运行营养评估；每次改完原料或文案后都要重跑。',
    parameters: NO_ARGS_SCHEMA,
  },
  {
    name: 'check_coverage',
    description: '检查七类食材覆盖和未归类原料；定骨架或判断缺类原因时用。',
    parameters: {
      type: 'object',
      properties: {
        confirmedOmissions: {
          type: 'array',
          items: { type: 'string', enum: REQUIRED_CATEGORY_VALUES },
          description: '人已经确认过的缺类，只用于展示。',
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'check_catalog_conflicts',
    description: '对比已发布目录，按硬/软规则列出相似菜；交付前看差异化。',
    parameters: {
      type: 'object',
      properties: {
        mainProteinName: {
          type: 'string',
          description: '要对比的主蛋白名；不传则取草稿里最大的蛋白原料。',
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'check_ready',
    description:
      '生成交付检查单；准备交付前必须调用，审批和缺类确认由后端注入，模型不能传。',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'ask_user',
    description:
      '停下来向人提问，最多两个问题、每问最多六个选项；需要人拍板或补充信息时用。',
    parameters: {
      type: 'object',
      properties: {
        questions: {
          type: 'array',
          minItems: 1,
          maxItems: 2,
          items: {
            type: 'object',
            properties: {
              question: {
                type: 'string',
                minLength: 1,
                maxLength: 200,
                description: '要问的问题。',
              },
              options: {
                type: 'array',
                maxItems: 6,
                items: { type: 'string', minLength: 1 },
                description: '可选项，最多 6 个。',
              },
            },
            required: ['question'],
            additionalProperties: false,
          },
        },
      },
      required: ['questions'],
      additionalProperties: false,
    },
  },
  {
    name: 'request_exception',
    description: '申请达标例外或缺类确认，等待人批准；只能申请，不能自批。',
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['COMPLIANCE', 'CATEGORY_OMISSION'],
          description:
            'COMPLIANCE 是达标例外（管理员批），CATEGORY_OMISSION 是缺类确认（营养师确认）。',
        },
        reason: {
          type: 'string',
          minLength: 1,
          maxLength: 500,
          description: '申请理由，必填。',
        },
        detail: {
          type: 'string',
          description: '补充说明，可选。',
        },
      },
      required: ['type', 'reason'],
      additionalProperties: false,
    },
  },
  {
    name: 'finish_draft',
    description:
      '生成交付确认卡；check_ready 不通过时会被拒绝，有警告时逐条列出。',
    parameters: {
      type: 'object',
      properties: {
        summary: {
          type: 'string',
          minLength: 1,
          description: '给人看的交付说明。',
        },
      },
      required: ['summary'],
      additionalProperties: false,
    },
  },
];

/**
 * 造全部 18 个 handler。
 *
 * `check_ready` 是唯一从 `getApprovalState()` 注入审批状态的入口；
 * `finish_draft` 在 control-tools 内部做同样的注入。
 */
export function createAgentToolHandlers(
  deps: AgentToolHandlerDeps,
): Record<string, AgentToolHandler> {
  const readTools = createReadTools(deps.port, deps.draftId);
  const writeTools = createWriteTools({
    port: deps.port,
    draftId: deps.draftId,
    tagPolicy: deps.tagPolicy,
  });
  const checkTools: RecipeAgentCheckTools = createCheckTools({
    port: deps.port,
    draftId: deps.draftId,
    tagPolicy: deps.tagPolicy,
  });
  const controlTools = createControlTools({
    controlPort: deps.controlPort,
    checkReady: (args) => checkTools.check_ready(args as never),
  });

  // 模型参数未经校验，具体 typeof 守卫在各工具内部；这里只做透传。
  return {
    get_draft: () => readTools.get_draft(),
    search_ingredients: (args) => readTools.search_ingredients(args as never),
    get_ingredient: (args) => readTools.get_ingredient(args as never),
    get_catalog_usage: (args) => readTools.get_catalog_usage(args as never),
    add_ingredient: (args) => writeTools.add_ingredient(args as never),
    replace_ingredient: (args) => writeTools.replace_ingredient(args as never),
    update_weight: (args) => writeTools.update_weight(args as never),
    remove_ingredient: (args) => writeTools.remove_ingredient(args as never),
    set_preparation: (args) => writeTools.set_preparation(args as never),
    set_copy: (args) => writeTools.set_copy(args as never),
    set_production_steps: (args) =>
      writeTools.set_production_steps(args as never),
    run_assessment: () => checkTools.run_assessment(),
    check_coverage: (args) => checkTools.check_coverage(args as never),
    check_catalog_conflicts: (args) =>
      checkTools.check_catalog_conflicts(args as never),
    check_ready: async (): Promise<AgentToolResult<AgentReadyResult>> => {
      // 模型传来的参数一律不读：审批状态只认后端。
      let approval: Awaited<
        ReturnType<RecipeAgentControlPort['getApprovalState']>
      >;
      try {
        approval = await deps.controlPort.getApprovalState();
      } catch (error) {
        const message = `读取审批状态失败，不能判断能否交付：${errorMessage(error)}`;
        return {
          ok: false,
          error: { code: 'CONTROL_NOT_AVAILABLE', message },
        };
      }
      return checkTools.check_ready({
        exceptionApproved: approval.approvedException,
        confirmedOmissions: approval.confirmedOmissions,
      });
    },
    ask_user: (args) => controlTools.ask_user(args as never),
    request_exception: (args) => controlTools.request_exception(args as never),
    finish_draft: (args) => controlTools.finish_draft(args as never),
  };
}
