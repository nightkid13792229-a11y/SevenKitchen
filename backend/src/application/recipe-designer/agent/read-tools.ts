/**
 * 只读工具（P0a Task 2）。
 *
 * 四个工具都只读：`get_draft` / `search_ingredients` / `get_ingredient` /
 * `get_catalog_usage`。校验失败不抛异常，统一返回 `{ ok: false, error }`，
 * 让模型自己改参数；成功时带一句给人看的 `summary`。
 */
import type { FoodCategory } from '../../../domain/recipe-designer/food-category-map';
import type {
  AgentCatalogUsage,
  AgentDraftSnapshot,
  AgentIngredientCandidate,
  AgentIngredientDetail,
  AgentToolErrorCode,
  AgentToolResult,
} from './agent-types';
import type { RecipeAgentDraftPort } from './recipe-agent.port';

const DEFAULT_SEARCH_LIMIT = 20;
const MIN_SEARCH_LIMIT = 1;
const MAX_SEARCH_LIMIT = 50;

type IngredientType = 'FOOD' | 'SUPPLEMENT';

interface SearchIngredientsArgs {
  search?: string;
  category?: FoodCategory;
  type?: IngredientType;
  limit?: number;
}

interface GetIngredientArgs {
  nutritionFoodId: string;
}

interface GetCatalogUsageArgs {
  mainProteinName?: string;
  ingredientNames?: string[];
}

interface SearchIngredientsInput {
  search?: string;
  category?: FoodCategory;
  type?: IngredientType;
  limit: number;
}

const CATEGORY_LABELS: Record<FoodCategory, string> = {
  PROTEIN: '蛋白',
  ORGAN: '内脏',
  CARB: '碳水',
  VEGETABLE: '蔬菜',
  MUSHROOM: '菌藻',
  NUTS: '坚果种子',
  OIL: '油脂',
  FRUIT: '水果',
  DAIRY: '乳',
  EGG: '蛋',
  LEGUME: '豆',
  SEASONING: '调味',
  SUPPLEMENT: '补剂',
  UNCLASSIFIED: '未归类',
};

const ok = <T>(data: T, summary: string): AgentToolResult<T> => ({
  ok: true,
  data,
  summary,
});

const fail = <T>(
  code: AgentToolErrorCode,
  message: string,
): AgentToolResult<T> => ({
  ok: false,
  error: { code, message },
});

function describeSearchScope(input: {
  search?: string;
  category?: FoodCategory;
  type?: IngredientType;
}): string {
  const parts: string[] = [];
  if (input.search) parts.push(`关键词「${input.search}」`);
  if (input.category) {
    parts.push(CATEGORY_LABELS[input.category] ?? input.category);
  }
  if (input.type) parts.push(input.type === 'FOOD' ? '食材' : '补剂');
  return parts.join('、');
}

function summarizeDraft(draft: AgentDraftSnapshot): string {
  const parts = [
    `草稿「${draft.name}」：${draft.items.length} 种原料，共 ${draft.totalWeightG}g`,
    `内容版本 v${draft.contentRevision}`,
  ];
  const assessment = draft.lastAssessment;
  if (!assessment) {
    parts.push('还没跑评估');
  } else {
    const total =
      assessment.compliant +
      assessment.deficient +
      assessment.excess +
      assessment.missingData;
    const stale =
      assessment.contentRevision === draft.contentRevision
        ? ''
        : `（评估版本 v${assessment.contentRevision} 已落后，需重跑）`;
    parts.push(`上次评估 ${assessment.compliant}/${total} 项达标${stale}`);
  }
  return `${parts.join('；')}。`;
}

function summarizeIngredient(detail: AgentIngredientDetail): string {
  const verified = detail.verified ? '已验证' : '未验证';
  const preparation =
    detail.preparationMethods.length > 0
      ? `；预处理：${detail.preparationMethods.join('、')}`
      : '';
  return `${detail.name}：${detail.cfctClass ?? '未分类'}，营养档案${verified}${preparation}。`;
}

/**
 * 造四个只读工具。
 *
 * @param port 草稿端口（P0a 用内存假端口）
 * @param draftId 当前这份草稿的 id
 */
export function createReadTools(
  port: RecipeAgentDraftPort,
  draftId: string,
): {
  get_draft(): Promise<AgentToolResult<AgentDraftSnapshot>>;
  search_ingredients(
    args?: SearchIngredientsArgs,
  ): Promise<AgentToolResult<AgentIngredientCandidate[]>>;
  get_ingredient(
    args: GetIngredientArgs,
  ): Promise<AgentToolResult<AgentIngredientDetail>>;
  get_catalog_usage(
    args?: GetCatalogUsageArgs,
  ): Promise<AgentToolResult<AgentCatalogUsage>>;
} {
  return {
    async get_draft(): Promise<AgentToolResult<AgentDraftSnapshot>> {
      const draft = await port.getDraft(draftId);
      return ok(draft, summarizeDraft(draft));
    },

    async search_ingredients(
      args: SearchIngredientsArgs = {},
    ): Promise<AgentToolResult<AgentIngredientCandidate[]>> {
      const search = args.search?.trim();
      const { category, type } = args;
      if (!search && !category && !type) {
        return fail(
          'INVALID_ARGUMENT',
          '至少给一个条件：关键词、分类或原料类型。',
        );
      }

      const limit = args.limit ?? DEFAULT_SEARCH_LIMIT;
      if (
        !Number.isInteger(limit) ||
        limit < MIN_SEARCH_LIMIT ||
        limit > MAX_SEARCH_LIMIT
      ) {
        return fail(
          'INVALID_ARGUMENT',
          `limit 必须是 ${MIN_SEARCH_LIMIT}–${MAX_SEARCH_LIMIT} 的整数（默认 ${DEFAULT_SEARCH_LIMIT}）。`,
        );
      }

      const input: SearchIngredientsInput = { limit };
      if (search) input.search = search;
      if (category) input.category = category;
      if (type) input.type = type;

      const candidates = await port.searchIngredients(input);
      const scope = describeSearchScope(input);
      if (candidates.length === 0) {
        return ok(
          candidates,
          `没有找到候选原料（${scope}）；换个关键词或类别试试。`,
        );
      }

      const preview = candidates
        .slice(0, 5)
        .map((candidate) => candidate.name)
        .join('、');
      const suffix = candidates.length > 5 ? ` 等 ${candidates.length} 个` : '';
      return ok(
        candidates,
        `找到 ${candidates.length} 个候选（${scope}）：${preview}${suffix}。`,
      );
    },

    async get_ingredient(
      args: GetIngredientArgs,
    ): Promise<AgentToolResult<AgentIngredientDetail>> {
      const nutritionFoodId = args?.nutritionFoodId?.trim();
      if (!nutritionFoodId) {
        return fail('INVALID_ARGUMENT', 'nutritionFoodId 不能为空。');
      }

      const detail = await port.getIngredient({ nutritionFoodId });
      if (!detail) {
        return fail(
          'INGREDIENT_NOT_FOUND',
          `没有找到营养库 ID 为「${nutritionFoodId}」的原料。`,
        );
      }

      return ok(detail, summarizeIngredient(detail));
    },

    async get_catalog_usage(
      args: GetCatalogUsageArgs = {},
    ): Promise<AgentToolResult<AgentCatalogUsage>> {
      const mainProteinName = args.mainProteinName?.trim();
      const ingredientNames = (args.ingredientNames ?? [])
        .map((name) => name.trim())
        .filter((name) => name.length > 0);
      if (!mainProteinName && ingredientNames.length === 0) {
        return fail('INVALID_ARGUMENT', '至少给一个条件：主蛋白名或原料名。');
      }

      const input: GetCatalogUsageArgs = {};
      if (mainProteinName) input.mainProteinName = mainProteinName;
      if (ingredientNames.length > 0) input.ingredientNames = ingredientNames;

      const usage = await port.getCatalogUsage(input);
      const parts = [`目录 ${usage.totalPublishedRecipes} 道菜`];
      if (mainProteinName) {
        parts.push(
          `主蛋白「${mainProteinName}」出现 ${usage.mainProteinCount} 次`,
        );
      }
      if (ingredientNames.length > 0) {
        parts.push(`${ingredientNames.length} 个原料有重合记录`);
      }
      if (usage.recipes.length > 0) {
        parts.push(`${usage.recipes.length} 道菜重合`);
      }
      return ok(usage, `${parts.join('；')}。`);
    },
  };
}
