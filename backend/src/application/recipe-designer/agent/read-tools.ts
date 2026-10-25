/**
 * 只读工具（P0a Task 2）。
 *
 * 六个工具都只读：`get_draft` / `search_ingredients` / `get_ingredient` /
 * `get_catalog_usage` / `web_search` / `web_fetch`。校验失败不抛异常，
 * 统一返回 `{ ok: false, error }`，让模型自己改参数；成功时带一句给人看的
 * `summary`。
 *
 * 入参来自模型（运行时会绕过 TypeScript 类型），所以所有字段先做 `typeof`
 * 守卫：非法值返回 `INVALID_ARGUMENT`，绝不让 `TypeError` 冒出去。
 *
 * 联网工具只依赖注入的 `RecipeAgentWebPort`：没有注入时返回
 * `CONTROL_NOT_AVAILABLE`，不会偷偷本地联网。URL 的 SSRF 校验在端口层
 * （`DeepSeekWebTools`）完成。
 */
import type { FoodCategory } from '../../../domain/recipe-designer/food-category-map';
import type {
  AgentCatalogUsage,
  AgentDraftSnapshot,
  AgentIngredientCandidate,
  AgentIngredientDetail,
  AgentRecipeDetail,
  AgentRecipeSearchPage,
  AgentRecipeSummary,
  AgentToolErrorCode,
  AgentToolResult,
} from './agent-types';
import type {
  AgentWebFetchResult,
  AgentWebSearchResult,
  RecipeAgentWebPort,
} from './deepseek-web-tools';
import { RecipeAgentWebError } from './deepseek-web-tools';
import type { RecipeAgentDraftPort } from './recipe-agent.port';

const DEFAULT_SEARCH_LIMIT = 20;
const MIN_SEARCH_LIMIT = 1;
const MAX_SEARCH_LIMIT = 50;
const MAX_WEB_QUERY_LENGTH = 128;
const MIN_WEB_SEARCH_COUNT = 1;
const MAX_WEB_SEARCH_COUNT = 50;
const MAX_WEB_SUMMARY_SOURCES = 3;
const DEFAULT_RECIPE_PAGE = 1;
const DEFAULT_RECIPE_PAGE_SIZE = 20;
const MIN_RECIPE_PAGE_SIZE = 1;
const MAX_RECIPE_PAGE_SIZE = 50;
const MAX_RECIPE_PAGE = 1000;

type IngredientType = 'FOOD' | 'SUPPLEMENT';

interface SearchIngredientsArgs {
  search?: string;
  nutrientKey?: string;
  category?: FoodCategory;
  type?: IngredientType;
  limit?: number;
}

interface SearchRecipesArgs {
  search?: string;
  ingredientName?: string;
  lifeStage?: string;
  page?: number;
  limit?: number;
}

interface GetRecipeArgs {
  recipeId?: string;
  draftId?: string;
}

interface GetIngredientArgs {
  nutritionFoodId?: string;
  ingredientId?: string;
}

interface GetCatalogUsageArgs {
  mainProteinName?: string;
  ingredientNames?: string[];
}

interface WebSearchArgs {
  query?: unknown;
  count?: unknown;
  need_content?: unknown;
}

interface WebFetchArgs {
  url?: unknown;
}

interface SearchIngredientsInput {
  search?: string;
  nutrientKey?: string;
  category?: FoodCategory;
  type?: IngredientType;
  limit: number;
}

type RawToolArgs = Record<string, unknown>;

const CATEGORY_LABELS: Record<FoodCategory, string> = {
  PROTEIN: '蛋白',
  ORGAN: '内脏',
  AQUATIC: '水产',
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

function asRawArgs(args: unknown): RawToolArgs | null {
  if (typeof args !== 'object' || args === null || Array.isArray(args)) {
    return null;
  }
  return args as RawToolArgs;
}

function isFoodCategory(value: string): value is FoodCategory {
  return Object.hasOwn(CATEGORY_LABELS, value);
}

function isIngredientType(value: string): value is IngredientType {
  return value === 'FOOD' || value === 'SUPPLEMENT';
}

/** 去空白、去空串、去重；重复的原料名只查一次。 */
function normalizeIngredientNames(names: readonly string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const name of names) {
    const trimmed = name.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    normalized.push(trimmed);
  }
  return normalized;
}

function summarizeWebSearch(result: AgentWebSearchResult): string {
  if (result.results.length === 0) {
    return `搜索「${result.query}」没有找到结果。`;
  }

  const top = result.results
    .slice(0, MAX_WEB_SUMMARY_SOURCES)
    .map((item) => {
      const title = item.title || item.url || '未命名来源';
      return item.url ? `${title}（${item.url}）` : title;
    })
    .join('、');
  const suffix = result.results.length > MAX_WEB_SUMMARY_SOURCES ? ' 等' : '';
  return `搜索「${result.query}」找到 ${result.results.length} 条结果：${top}${suffix}。`;
}

function summarizeWebFetch(result: AgentWebFetchResult): string {
  const title = result.title || result.url;
  const truncated = result.content.includes('内容已截断')
    ? '（内容已截断）'
    : '';
  return `已抓取「${title}」（${result.url}），正文 ${result.content.length} 字符${truncated}。`;
}

/**
 * 端口异常 → 工具结果。SSRF/参数类错误保留 `INVALID_ARGUMENT`；
 * 上游失败保留 WEB_SEARCH_FAILED / WEB_FETCH_FAILED。未知异常只给安全文案，
 * 不把原始 message（可能是上游响应/内部信息）透给模型。
 */
function webErrorResult<T>(
  error: unknown,
  fallbackCode: 'WEB_SEARCH_FAILED' | 'WEB_FETCH_FAILED',
): AgentToolResult<T> {
  if (error instanceof RecipeAgentWebError) {
    return fail(error.code, error.message);
  }
  return fail(
    fallbackCode,
    fallbackCode === 'WEB_SEARCH_FAILED'
      ? '网页搜索暂时失败，请稍后再试。'
      : '网页抓取暂时失败，请稍后再试。',
  );
}

function describeSearchScope(input: {
  search?: string;
  nutrientKey?: string;
  category?: FoodCategory;
  type?: IngredientType;
}): string {
  const parts: string[] = [];
  if (input.search) parts.push(`关键词「${input.search}」`);
  if (input.nutrientKey) parts.push(`营养素「${input.nutrientKey}」`);
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
  const profileCount = detail.nutritionProfiles?.length ?? 0;
  const profileNames = (detail.nutritionProfiles ?? [])
    .slice(0, 3)
    .map((profile) => profile.name)
    .join('、');
  const profiles =
    profileCount > 0
      ? `；共 ${profileCount} 个营养档案（${profileNames}${profileCount > 3 ? ' 等' : ''}）`
      : '';
  const preparation =
    detail.preparationMethods.length > 0
      ? `；预处理：${detail.preparationMethods.join('、')}`
      : '';
  return `${detail.name}：${detail.cfctClass ?? '未分类'}，当前档案「${detail.nutritionProfileName}」${verified}${profiles}${preparation}。`;
}

function describeRecipeScope(input: {
  search?: string;
  ingredientName?: string;
  lifeStage?: string;
}): string {
  const parts: string[] = [];
  if (input.search) parts.push(`关键词「${input.search}」`);
  if (input.ingredientName) parts.push(`原料「${input.ingredientName}」`);
  if (input.lifeStage) parts.push(`生命阶段「${input.lifeStage}」`);
  return parts.length > 0 ? parts.join('、') : '全部食谱（已发布、未发布草稿、顾客定制）';
}

/** 把只读来源翻成模型能直接写给人看的中文。 */
function recipeSourceLabel(source: AgentRecipeSummary['source']): string {
  switch (source) {
    case 'CURRENT_DRAFT':
      return '当前草稿';
    case 'DESIGN_DRAFT':
      return '设计草稿';
    case 'CUSTOM':
      return '定制食谱';
    case 'RECIPE_DRAFT':
      return '待发布食谱';
    default:
      return '已发布食谱';
  }
}

function summarizeRecipeSearch(
  page: AgentRecipeSearchPage,
  filters: {
    search?: string;
    ingredientName?: string;
    lifeStage?: string;
  },
): string {
  if (page.total === 0) {
    return `没有找到匹配的食谱（${describeRecipeScope(filters)}）；可读全部食谱（已发布、未发布草稿、顾客定制），不会返回客户/订单/狗信息。`;
  }

  const preview = page.data
    .slice(0, 5)
    .map((recipe) =>
      recipe.source === 'PUBLISHED'
        ? recipe.name
        : `${recipe.name}（${recipeSourceLabel(recipe.source)}）`,
    )
    .join('、');
  const suffix = page.total > page.data.length ? ' 等' : '';
  return `找到 ${page.total} 道食谱（${describeRecipeScope(filters)}），第 ${page.page} 页返回 ${page.data.length} 条：${preview}${suffix}。来源覆盖已发布、未发布草稿和顾客定制；不含客户/订单/狗信息。`;
}

function summarizeRecipeDetail(detail: AgentRecipeDetail): string {
  const label = `${recipeSourceLabel(detail.source)}「${detail.name}」${
    detail.version !== null ? `v${detail.version}` : ''
  }`;
  const totalWeightG =
    Math.round(detail.items.reduce((sum, item) => sum + item.weightG, 0) * 10) /
    10;
  return `${label}：${detail.items.length} 种原料，共 ${totalWeightG}g，${detail.productionSteps.length} 步制作步骤；只读详情，不含客户/订单信息。`;
}

/**
 * 造只读工具。
 *
 * @param port 草稿端口（P0a 用内存假端口）
 * @param draftId 当前这份草稿的 id
 */
export function createReadTools(
  port: RecipeAgentDraftPort,
  draftId: string,
  webTools?: RecipeAgentWebPort,
): {
  get_draft(): Promise<AgentToolResult<AgentDraftSnapshot>>;
  search_ingredients(
    args?: SearchIngredientsArgs | null,
  ): Promise<AgentToolResult<AgentIngredientCandidate[]>>;
  get_ingredient(
    args: GetIngredientArgs | null,
  ): Promise<AgentToolResult<AgentIngredientDetail>>;
  get_catalog_usage(
    args?: GetCatalogUsageArgs | null,
  ): Promise<AgentToolResult<AgentCatalogUsage>>;
  search_recipes(
    args?: SearchRecipesArgs | null,
  ): Promise<AgentToolResult<AgentRecipeSearchPage>>;
  get_recipe(
    args: GetRecipeArgs | null,
  ): Promise<AgentToolResult<AgentRecipeDetail>>;
  web_search(
    args?: WebSearchArgs | null,
  ): Promise<AgentToolResult<AgentWebSearchResult>>;
  web_fetch(
    args?: WebFetchArgs | null,
  ): Promise<AgentToolResult<AgentWebFetchResult>>;
} {
  return {
    async get_draft(): Promise<AgentToolResult<AgentDraftSnapshot>> {
      const draft = await port.getDraft(draftId);
      return ok(draft, summarizeDraft(draft));
    },

    async search_ingredients(
      args: SearchIngredientsArgs | null = {},
    ): Promise<AgentToolResult<AgentIngredientCandidate[]>> {
      const raw = asRawArgs(args);
      if (!raw) {
        return fail('INVALID_ARGUMENT', '参数必须是对象。');
      }

      const searchValue = raw.search;
      if (searchValue !== undefined && typeof searchValue !== 'string') {
        return fail('INVALID_ARGUMENT', 'search 必须是字符串。');
      }
      const nutrientKeyValue = raw.nutrientKey;
      if (
        nutrientKeyValue !== undefined &&
        typeof nutrientKeyValue !== 'string'
      ) {
        return fail('INVALID_ARGUMENT', 'nutrientKey 必须是字符串。');
      }
      const categoryValue = raw.category;
      if (
        categoryValue !== undefined &&
        (typeof categoryValue !== 'string' || !isFoodCategory(categoryValue))
      ) {
        return fail('INVALID_ARGUMENT', 'category 不是合法的食材分类。');
      }
      const typeValue = raw.type;
      if (
        typeValue !== undefined &&
        (typeof typeValue !== 'string' || !isIngredientType(typeValue))
      ) {
        return fail('INVALID_ARGUMENT', 'type 只允许 FOOD 或 SUPPLEMENT。');
      }
      const limitValue = raw.limit;
      if (limitValue !== undefined && typeof limitValue !== 'number') {
        return fail(
          'INVALID_ARGUMENT',
          `limit 必须是 ${MIN_SEARCH_LIMIT}–${MAX_SEARCH_LIMIT} 的整数（默认 ${DEFAULT_SEARCH_LIMIT}）。`,
        );
      }

      const search = searchValue?.trim();
      const category = categoryValue as FoodCategory | undefined;
      const type = typeValue as IngredientType | undefined;
      const nutrientKey = nutrientKeyValue?.trim();
      if (!search && !nutrientKey && !category && !type) {
        return fail(
          'INVALID_ARGUMENT',
          '至少给一个条件：关键词、营养素、分类或原料类型。',
        );
      }

      const limit = (limitValue as number | undefined) ?? DEFAULT_SEARCH_LIMIT;
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
      if (nutrientKey) input.nutrientKey = nutrientKey;
      if (category) input.category = category;
      if (type) input.type = type;

      const candidates = await port.searchIngredients(input);
      const scope = describeSearchScope(input);
      if (candidates.length === 0) {
        return ok(
          candidates,
          `没有找到候选原料（${scope}）；换个关键词或类别试试。每条候选都会带 nutritionProfiles（含生/熟等全部营养档案）。`,
        );
      }

      const preview = candidates
        .slice(0, 5)
        .map((candidate) => candidate.name)
        .join('、');
      const suffix = candidates.length > 5 ? ` 等 ${candidates.length} 个` : '';
      return ok(
        candidates,
        `找到 ${candidates.length} 个候选（${scope}）：${preview}${suffix}。每条候选都带 nutritionProfiles（该原料全部营养档案，含生/熟）；按实际做法选择 nutritionFoodId。`,
      );
    },

    async get_ingredient(
      args: GetIngredientArgs | null,
    ): Promise<AgentToolResult<AgentIngredientDetail>> {
      const raw = asRawArgs(args);
      if (!raw) {
        return fail(
          'INVALID_ARGUMENT',
          'nutritionFoodId 或 ingredientId 至少提供一个。',
        );
      }

      const nutritionFoodIdValue = raw.nutritionFoodId;
      const ingredientIdValue = raw.ingredientId;
      if (
        nutritionFoodIdValue !== undefined &&
        typeof nutritionFoodIdValue !== 'string'
      ) {
        return fail(
          'INVALID_ARGUMENT',
          'nutritionFoodId 或 ingredientId 必须是字符串。',
        );
      }
      if (
        ingredientIdValue !== undefined &&
        typeof ingredientIdValue !== 'string'
      ) {
        return fail(
          'INVALID_ARGUMENT',
          'nutritionFoodId 或 ingredientId 必须是字符串。',
        );
      }

      const nutritionFoodId =
        typeof nutritionFoodIdValue === 'string'
          ? nutritionFoodIdValue.trim()
          : '';
      const ingredientId =
        typeof ingredientIdValue === 'string' ? ingredientIdValue.trim() : '';
      if (!nutritionFoodId && !ingredientId) {
        return fail(
          'INVALID_ARGUMENT',
          'nutritionFoodId 或 ingredientId 至少提供一个。',
        );
      }

      const input: GetIngredientArgs = {};
      if (nutritionFoodId) input.nutritionFoodId = nutritionFoodId;
      if (ingredientId) input.ingredientId = ingredientId;

      const detail = await port.getIngredient(input);
      if (!detail) {
        return fail(
          'INGREDIENT_NOT_FOUND',
          `没有找到 nutritionFoodId「${nutritionFoodId || '-'}」/ ingredientId「${ingredientId || '-'}」对应的原料。`,
        );
      }

      return ok(detail, summarizeIngredient(detail));
    },

    async get_catalog_usage(
      args: GetCatalogUsageArgs | null = {},
    ): Promise<AgentToolResult<AgentCatalogUsage>> {
      const raw = asRawArgs(args);
      if (!raw) {
        return fail('INVALID_ARGUMENT', '参数必须是对象。');
      }

      const proteinValue = raw.mainProteinName;
      if (proteinValue !== undefined && typeof proteinValue !== 'string') {
        return fail('INVALID_ARGUMENT', 'mainProteinName 必须是字符串。');
      }
      const namesValue = raw.ingredientNames;
      if (namesValue !== undefined) {
        if (
          !Array.isArray(namesValue) ||
          namesValue.some((name) => typeof name !== 'string')
        ) {
          return fail('INVALID_ARGUMENT', 'ingredientNames 必须是字符串数组。');
        }
      }

      const mainProteinName = proteinValue?.trim();
      const ingredientNames = normalizeIngredientNames(
        (namesValue as string[] | undefined) ?? [],
      );
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
        // 命中/未命中必须从结果推，不能从输入推：输入里几个名字不等于有几条重合。
        parts.push(
          usage.recipes.length > 0
            ? `按 ${ingredientNames.length} 个原料查询，命中 ${usage.recipes.length} 道菜`
            : '没有重合记录',
        );
      } else if (usage.recipes.length === 0 && usage.mainProteinCount === 0) {
        parts.push('没有重合记录');
      }
      return ok(usage, `${parts.join('；')}。`);
    },

    async search_recipes(
      args: SearchRecipesArgs | null = {},
    ): Promise<AgentToolResult<AgentRecipeSearchPage>> {
      const raw = asRawArgs(args);
      if (!raw) {
        return fail('INVALID_ARGUMENT', '参数必须是对象。');
      }

      for (const field of ['search', 'ingredientName', 'lifeStage'] as const) {
        const value = raw[field];
        if (value !== undefined && typeof value !== 'string') {
          return fail('INVALID_ARGUMENT', `${field} 必须是字符串。`);
        }
      }

      const pageValue = raw.page;
      if (
        pageValue !== undefined &&
        (typeof pageValue !== 'number' ||
          !Number.isInteger(pageValue) ||
          pageValue < 1 ||
          pageValue > MAX_RECIPE_PAGE)
      ) {
        return fail(
          'INVALID_ARGUMENT',
          `page 必须是 1–${MAX_RECIPE_PAGE} 的整数（默认 1）。`,
        );
      }
      const limitValue = raw.limit;
      if (
        limitValue !== undefined &&
        (typeof limitValue !== 'number' ||
          !Number.isInteger(limitValue) ||
          limitValue < MIN_RECIPE_PAGE_SIZE ||
          limitValue > MAX_RECIPE_PAGE_SIZE)
      ) {
        return fail(
          'INVALID_ARGUMENT',
          `limit 必须是 ${MIN_RECIPE_PAGE_SIZE}–${MAX_RECIPE_PAGE_SIZE} 的整数（默认 ${DEFAULT_RECIPE_PAGE_SIZE}）。`,
        );
      }

      const filters: {
        search?: string;
        ingredientName?: string;
        lifeStage?: string;
      } = {};
      const search = (raw.search as string | undefined)?.trim();
      const ingredientName = (raw.ingredientName as string | undefined)?.trim();
      const lifeStage = (raw.lifeStage as string | undefined)?.trim();
      if (search) filters.search = search;
      if (ingredientName) filters.ingredientName = ingredientName;
      if (lifeStage) filters.lifeStage = lifeStage;

      const page = (pageValue as number | undefined) ?? DEFAULT_RECIPE_PAGE;
      const limit =
        (limitValue as number | undefined) ?? DEFAULT_RECIPE_PAGE_SIZE;
      const result = await port.searchRecipes({
        ...filters,
        page,
        limit,
      });
      return ok(result, summarizeRecipeSearch(result, filters));
    },

    async get_recipe(
      args: GetRecipeArgs | null,
    ): Promise<AgentToolResult<AgentRecipeDetail>> {
      const raw = asRawArgs(args);
      if (!raw) {
        return fail('INVALID_ARGUMENT', 'recipeId 或 draftId 至少提供一个。');
      }

      const recipeIdValue = raw.recipeId;
      const draftIdValue = raw.draftId;
      if (
        (recipeIdValue !== undefined && typeof recipeIdValue !== 'string') ||
        (draftIdValue !== undefined && typeof draftIdValue !== 'string')
      ) {
        return fail('INVALID_ARGUMENT', 'recipeId 或 draftId 必须是字符串。');
      }

      const recipeId =
        typeof recipeIdValue === 'string' ? recipeIdValue.trim() : '';
      const draftId =
        typeof draftIdValue === 'string' ? draftIdValue.trim() : '';
      if (!recipeId && !draftId) {
        return fail('INVALID_ARGUMENT', 'recipeId 或 draftId 至少提供一个。');
      }

      const input: GetRecipeArgs = {};
      if (recipeId) input.recipeId = recipeId;
      if (draftId) input.draftId = draftId;

      const detail = await port.getRecipeDetail(input);
      if (!detail) {
        return fail(
          'RECIPE_NOT_FOUND',
          `没有找到可读的食谱（recipeId「${recipeId || '-'}」/ draftId「${draftId || '-'}」）；可读全部食谱（含未发布草稿、顾客定制），不含客户/订单/狗信息。`,
        );
      }
      return ok(detail, summarizeRecipeDetail(detail));
    },

    async web_search(
      args: WebSearchArgs | null = {},
    ): Promise<AgentToolResult<AgentWebSearchResult>> {
      if (!webTools) {
        return fail(
          'CONTROL_NOT_AVAILABLE',
          '联网搜索未启用（缺少 webTools 依赖）。',
        );
      }

      const raw = asRawArgs(args);
      if (!raw) {
        return fail('INVALID_ARGUMENT', '参数必须是对象。');
      }

      if (typeof raw.query !== 'string') {
        return fail('INVALID_ARGUMENT', 'query 不能为空。');
      }
      const query = raw.query.trim();
      if (!query) {
        return fail('INVALID_ARGUMENT', 'query 不能为空。');
      }
      if (query.length > MAX_WEB_QUERY_LENGTH) {
        return fail(
          'INVALID_ARGUMENT',
          `query 最多 ${MAX_WEB_QUERY_LENGTH} 个字符。`,
        );
      }

      const countValue = raw.count;
      if (
        countValue !== undefined &&
        (typeof countValue !== 'number' ||
          !Number.isInteger(countValue) ||
          countValue < MIN_WEB_SEARCH_COUNT ||
          countValue > MAX_WEB_SEARCH_COUNT)
      ) {
        return fail(
          'INVALID_ARGUMENT',
          `count 必须是 ${MIN_WEB_SEARCH_COUNT}–${MAX_WEB_SEARCH_COUNT} 的整数。`,
        );
      }

      const needContentValue = raw.need_content;
      if (
        needContentValue !== undefined &&
        typeof needContentValue !== 'boolean'
      ) {
        return fail('INVALID_ARGUMENT', 'need_content 必须是布尔值。');
      }

      const input: {
        query: string;
        count?: number;
        needContent?: boolean;
      } = { query };
      if (typeof countValue === 'number') input.count = countValue;
      if (typeof needContentValue === 'boolean') {
        input.needContent = needContentValue;
      }

      try {
        const result = await webTools.search(input);
        return ok(result, summarizeWebSearch(result));
      } catch (error) {
        return webErrorResult(error, 'WEB_SEARCH_FAILED');
      }
    },

    async web_fetch(
      args: WebFetchArgs | null,
    ): Promise<AgentToolResult<AgentWebFetchResult>> {
      if (!webTools) {
        return fail(
          'CONTROL_NOT_AVAILABLE',
          '联网抓取未启用（缺少 webTools 依赖）。',
        );
      }

      const raw = asRawArgs(args);
      if (!raw) {
        return fail('INVALID_ARGUMENT', 'url 不能为空。');
      }
      if (typeof raw.url !== 'string') {
        return fail('INVALID_ARGUMENT', 'url 不能为空。');
      }
      const url = raw.url.trim();
      if (!url) {
        return fail('INVALID_ARGUMENT', 'url 不能为空。');
      }

      try {
        const result = await webTools.fetch({ url });
        return ok(result, summarizeWebFetch(result));
      } catch (error) {
        return webErrorResult(error, 'WEB_FETCH_FAILED');
      }
    },
  };
}
