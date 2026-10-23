/**
 * 内存版 `RecipeAgentDraftPort`（P0a Task 2）。
 *
 * 只用于单元测试：不连数据库、不调模型。默认草稿是一份七类齐全的鸭肉南瓜餐
 * （7 种原料、900g、内容版本 4、3 步制作步骤）；默认评估 34/34 全部达标，
 * 三条示例指标的余量分别为 32% / 25% / 21%。
 *
 * `getDraft` 的 `lastAssessment` 由 `createFakeRecipeAgentPort` 的 `assessment`
 * 决定：不传 = 默认评估，显式 `null` = 还没跑过评估。
 */
import type {
  AgentAssessmentView,
  AgentCatalogUsage,
  AgentDraftItem,
  AgentDraftSnapshot,
  AgentIngredientCandidate,
  AgentIngredientDetail,
} from 'src/application/recipe-designer/agent/agent-types';
import type { RecipeAgentDraftPort } from 'src/application/recipe-designer/agent/recipe-agent.port';
import { classifyFoodCategory } from 'src/domain/recipe-designer/food-category-map';

/** 七类必需类别各一条的默认草稿原料，总重 900g。 */
const DEFAULT_ITEMS: readonly AgentDraftItem[] = [
  {
    id: 'item-1',
    ingredientId: 'ing-1',
    nutritionFoodId: 'nf-1',
    name: '鸭腿肉',
    cfctClass: '禽肉类及制品',
    nutritionCategory: 'MEAT',
    category: 'PROTEIN',
    weightG: 450,
    ratioPercent: 50,
    preparationMethod: '去皮切块',
    preparationNote: '去掉可见脂肪',
  },
  {
    id: 'item-2',
    ingredientId: 'ing-2',
    nutritionFoodId: 'nf-2',
    name: '鸭心',
    cfctClass: '禽肉类及制品',
    nutritionCategory: 'ORGAN',
    category: 'ORGAN',
    weightG: 60,
    ratioPercent: 6.67,
    preparationMethod: '去筋膜切丁',
    preparationNote: null,
  },
  {
    id: 'item-3',
    ingredientId: 'ing-3',
    nutritionFoodId: 'nf-3',
    name: '燕麦',
    cfctClass: '谷类及制品',
    nutritionCategory: 'GRAIN',
    category: 'CARB',
    weightG: 160,
    ratioPercent: 17.78,
    preparationMethod: '提前浸泡',
    preparationNote: '浸泡 20 分钟',
  },
  {
    id: 'item-4',
    ingredientId: 'ing-4',
    nutritionFoodId: 'nf-4',
    name: '南瓜',
    cfctClass: '蔬菜类及制品',
    nutritionCategory: 'VEGETABLE',
    category: 'VEGETABLE',
    weightG: 120,
    ratioPercent: 13.33,
    preparationMethod: '去皮切块',
    preparationNote: null,
  },
  {
    id: 'item-5',
    ingredientId: 'ing-5',
    nutritionFoodId: 'nf-5',
    name: '香菇',
    cfctClass: '菌藻类',
    nutritionCategory: 'OTHER',
    category: 'MUSHROOM',
    weightG: 40,
    ratioPercent: 4.44,
    preparationMethod: '焯水切丁',
    preparationNote: null,
  },
  {
    id: 'item-6',
    ingredientId: 'ing-6',
    nutritionFoodId: 'nf-6',
    name: '亚麻籽',
    cfctClass: '坚果种子类',
    nutritionCategory: 'NUT',
    category: 'NUTS',
    weightG: 30,
    ratioPercent: 3.33,
    preparationMethod: '研磨成粉',
    preparationNote: null,
  },
  {
    id: 'item-7',
    ingredientId: 'ing-7',
    nutritionFoodId: 'nf-7',
    name: '鱼油',
    cfctClass: '油脂类',
    nutritionCategory: 'OIL',
    category: 'OIL',
    weightG: 40,
    ratioPercent: 4.44,
    preparationMethod: '直接拌入',
    preparationNote: '出锅后放凉至 40°C 以下再加',
  },
];

/** 默认原料库候选：两条菌藻类，均来自已验证的营养档案。 */
const DEFAULT_SEARCH_RESULTS: readonly AgentIngredientCandidate[] = [
  {
    ingredientId: 'ing-8',
    nutritionFoodId: 'nf-8',
    name: '香菇',
    nutritionProfileName: '香菇（鲜）',
    type: 'FOOD',
    cfctClass: '菌藻类',
    nutritionCategory: 'OTHER',
    verified: true,
  },
  {
    ingredientId: 'ing-9',
    nutritionFoodId: 'nf-9',
    name: '口蘑',
    nutritionProfileName: '口蘑（鲜）',
    type: 'FOOD',
    cfctClass: '菌藻类',
    nutritionCategory: 'OTHER',
    verified: true,
  },
];

/** 默认原料详情：对应 `nf-8` 香菇。 */
const DEFAULT_INGREDIENT_DETAIL: AgentIngredientDetail = {
  ingredientId: 'ing-8',
  nutritionFoodId: 'nf-8',
  name: '香菇',
  nutritionProfileName: '香菇（鲜）',
  type: 'FOOD',
  cfctClass: '菌藻类',
  nutritionCategory: 'OTHER',
  verified: true,
  nutritionSummary: {
    protein: 2.2,
    fat: 0.3,
    fiber: 3.3,
    calcium: 2,
    phosphorus: 53,
  },
  allergenNames: [],
  preparationMethods: ['切丁', '焯水'],
};

/** 默认目录证据：26 道已发布食谱，鸭肉出现 2 次。 */
const DEFAULT_CATALOG_USAGE: AgentCatalogUsage = {
  totalPublishedRecipes: 26,
  mainProteinCount: 2,
  recipes: [
    {
      recipeId: 'recipe-1',
      name: '南瓜鸭肉餐',
      mainProteinName: '鸭肉',
      overlappingCategories: ['PROTEIN', 'CARB'],
      overlappingIngredientNames: ['鸭腿肉', '燕麦'],
    },
    {
      recipeId: 'recipe-2',
      name: '鸭肉菌菇餐',
      mainProteinName: '鸭肉',
      overlappingCategories: ['PROTEIN', 'MUSHROOM'],
      overlappingIngredientNames: ['鸭腿肉', '香菇'],
    },
  ],
};

export interface FakeRecipeAgentPortOverrides {
  draft?: AgentDraftSnapshot;
  assessment?: AgentAssessmentView | null;
  searchResults?: AgentIngredientCandidate[];
  ingredientDetail?: AgentIngredientDetail | null;
  catalogUsage?: AgentCatalogUsage;
}

/** 默认草稿：七类齐全、900g、内容版本 4、文案与步骤都填好。 */
export function fakeDraftSnapshot(
  overrides: Partial<AgentDraftSnapshot> = {},
): AgentDraftSnapshot {
  return {
    draftId: 'draft-1',
    seriesId: 'series-1',
    name: '鸭肉南瓜成犬餐',
    scenario: '成犬 110ME',
    contentRevision: 4,
    totalWeightG: 900,
    items: DEFAULT_ITEMS.map((item) => ({ ...item })),
    copy: {
      coverTitle: '鲜鸭南瓜餐',
      sellingPoint: '鲜鸭配南瓜，肠胃舒服，体态轻盈',
      description:
        '选用鸭腿肉、南瓜和燕麦，低温慢煮；鸭心补充内脏类，香菇提供菌藻类，亚麻籽与鱼油补足油脂。适合日常成犬主食。',
      targetHealthTags: ['低脂'],
    },
    productionSteps: [
      {
        sortOrder: 1,
        instruction: '鸭腿肉去皮切块，冷水下锅焯去血沫。',
        duration: '8 分钟',
        temperature: '100°C',
        equipment: '汤锅',
      },
      {
        sortOrder: 2,
        instruction: '南瓜、香菇切丁，燕麦提前浸泡 20 分钟。',
        duration: '20 分钟',
        temperature: null,
        equipment: '砧板',
      },
      {
        sortOrder: 3,
        instruction: '所有原料入锅，小火慢煮至软烂，出锅前拌入亚麻籽粉和鱼油。',
        duration: '35 分钟',
        temperature: '90°C',
        equipment: '炖锅',
      },
    ],
    lastAssessment: null,
    ...overrides,
  };
}

/** 默认评估：34/34 达标；三条示例指标余量 32% / 25% / 21%。 */
export function fakeAssessment(
  overrides: Partial<AgentAssessmentView> = {},
): AgentAssessmentView {
  return {
    contentRevision: 4,
    compliant: 34,
    deficient: 0,
    excess: 0,
    missingData: 0,
    entries: [
      {
        key: 'protein',
        label: '粗蛋白',
        status: 'COMPLIANT',
        value: 26.4,
        min: 20,
        max: null,
        marginPercent: 32,
      },
      {
        key: 'fat',
        label: '粗脂肪',
        status: 'COMPLIANT',
        value: 12.5,
        min: 10,
        max: null,
        marginPercent: 25,
      },
      {
        key: 'calcium_phosphorus',
        label: '钙磷比',
        status: 'COMPLIANT',
        value: 1.21,
        min: 1,
        max: null,
        marginPercent: 21,
      },
    ],
    ...overrides,
  };
}

function cloneDraft(draft: AgentDraftSnapshot): AgentDraftSnapshot {
  return {
    ...draft,
    items: draft.items.map((item) => ({ ...item })),
    copy: {
      ...draft.copy,
      targetHealthTags: [...draft.copy.targetHealthTags],
    },
    productionSteps: draft.productionSteps.map((step) => ({ ...step })),
    lastAssessment: draft.lastAssessment
      ? {
          ...draft.lastAssessment,
          entries: draft.lastAssessment.entries.map((entry) => ({ ...entry })),
        }
      : null,
  };
}

function cloneAssessment(view: AgentAssessmentView): AgentAssessmentView {
  return {
    ...view,
    entries: view.entries.map((entry) => ({ ...entry })),
  };
}

/**
 * 造一个内存版草稿端口。默认方法都是 `jest.fn()`，读方法立即返回 fixture，
 * 写方法（除 `addItem` 外）只记录调用，不真的改草稿。
 */
export function createFakeRecipeAgentPort(
  overrides: FakeRecipeAgentPortOverrides = {},
): RecipeAgentDraftPort {
  const state = {
    draft: cloneDraft(overrides.draft ?? fakeDraftSnapshot()),
    lastAssessment:
      overrides.assessment === undefined
        ? fakeAssessment()
        : overrides.assessment === null
          ? null
          : cloneAssessment(overrides.assessment),
    searchResults: (overrides.searchResults ?? DEFAULT_SEARCH_RESULTS).map(
      (candidate) => ({ ...candidate }),
    ),
    ingredientDetail:
      overrides.ingredientDetail === undefined
        ? {
            ...DEFAULT_INGREDIENT_DETAIL,
            nutritionSummary: { ...DEFAULT_INGREDIENT_DETAIL.nutritionSummary },
            allergenNames: [...DEFAULT_INGREDIENT_DETAIL.allergenNames],
            preparationMethods: [
              ...DEFAULT_INGREDIENT_DETAIL.preparationMethods,
            ],
          }
        : overrides.ingredientDetail,
    catalogUsage: overrides.catalogUsage ?? DEFAULT_CATALOG_USAGE,
  };

  // 显式传 null 表示还没跑过评估，但真跑一次时仍要有一份可返回的基线结果。
  const assessmentTemplate = overrides.assessment ?? fakeAssessment();

  const getDraft = jest.fn(async (_draftId: string) => ({
    ...state.draft,
    lastAssessment: state.lastAssessment,
  }));

  const searchIngredients = jest.fn(async () =>
    state.searchResults.map((candidate) => ({ ...candidate })),
  );

  const getIngredient = jest.fn(async () => state.ingredientDetail);

  const getCatalogUsage = jest.fn(async () => state.catalogUsage);

  const addItem = jest.fn(
    async (
      _draftId: string,
      input: {
        nutritionFoodId: string;
        ingredientId?: string;
        weightG: number;
        preparationMethod?: string;
      },
    ): Promise<AgentDraftItem> => {
      const candidate =
        state.ingredientDetail?.nutritionFoodId === input.nutritionFoodId
          ? state.ingredientDetail
          : (state.searchResults.find(
              (item) => item.nutritionFoodId === input.nutritionFoodId,
            ) ?? null);
      const name = candidate?.name ?? '新原料';
      const cfctClass = candidate?.cfctClass ?? null;
      const nutritionCategory = candidate?.nutritionCategory ?? null;
      const item: AgentDraftItem = {
        id: `item-${state.draft.items.length + 1}`,
        ingredientId: input.ingredientId ?? candidate?.ingredientId ?? null,
        nutritionFoodId: input.nutritionFoodId,
        name,
        cfctClass,
        nutritionCategory,
        category: classifyFoodCategory({
          name,
          cfctClass,
          nutritionCategory,
          ingredientType: candidate?.type ?? 'FOOD',
        }),
        weightG: input.weightG,
        ratioPercent: null,
        preparationMethod: input.preparationMethod ?? null,
        preparationNote: null,
      };
      state.draft = {
        ...state.draft,
        contentRevision: state.draft.contentRevision + 1,
        totalWeightG: state.draft.totalWeightG + input.weightG,
        items: [...state.draft.items, item],
      };
      return item;
    },
  );

  const runAssessment = jest.fn(
    async (_draftId: string): Promise<AgentAssessmentView> => {
      const result: AgentAssessmentView = {
        ...assessmentTemplate,
        contentRevision: state.draft.contentRevision,
        entries: assessmentTemplate.entries.map((entry) => ({ ...entry })),
      };
      state.lastAssessment = result;
      return result;
    },
  );

  const port: RecipeAgentDraftPort = {
    getDraft,
    searchIngredients,
    getIngredient,
    getCatalogUsage,
    addItem,
    replaceItem: jest.fn(),
    updateWeight: jest.fn(),
    removeItem: jest.fn(),
    setPreparation: jest.fn(),
    setCopy: jest.fn(),
    setProductionSteps: jest.fn(),
    runAssessment,
  };
  return port;
}
