/**
 * 内存版 `RecipeAgentDraftPort`（P0a Task 2）。
 *
 * 只用于单元测试：不连数据库、不调模型。默认草稿是一份八类基础齐全的鸭肉南瓜餐
 * （8 种原料、940g、内容版本 4、3 步制作步骤）；默认评估 34/34 全部达标，
 * 三条示例指标的余量分别为 32% / 25% / 21%。
 *
 * `getDraft` 的 `lastAssessment` 由 `createFakeRecipeAgentPort` 的 `assessment`
 * 决定：不传 = 默认评估，显式 `null` = 还没跑过评估。
 */
import type {
  AgentAssessmentView,
  AgentCatalogUsage,
  AgentCopyPatch,
  AgentDogRecipeHistory,
  AgentDraftItem,
  AgentDraftSnapshot,
  AgentIngredientCandidate,
  AgentIngredientDetail,
  AgentProductionStep,
  AgentRecipeDetail,
  AgentRecipeSearchPage,
} from 'src/application/recipe-designer/agent/agent-types';
import type { RecipeAgentDraftPort } from 'src/application/recipe-designer/agent/recipe-agent.port';
import { classifyFoodCategory } from 'src/domain/recipe-designer/food-category-map';

/** 八类基础类别各一条的默认草稿原料，总重 940g。 */
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
  },
  {
    id: 'item-8',
    ingredientId: 'ing-8',
    nutritionFoodId: 'nf-8',
    name: '三文鱼',
    cfctClass: '水产类',
    nutritionCategory: 'SEAFOOD',
    category: 'AQUATIC',
    weightG: 40,
    ratioPercent: 4.26,
    preparationMethod: '去刺切丁',
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
    nutritionProfiles: [
      {
        nutritionFoodId: 'nf-8',
        name: '香菇（鲜）',
        displayNameZh: '香菇（鲜）',
        status: 'VERIFIED',
        category: 'OTHER',
        dataSource: 'CFCT',
        isPrimary: true,
        preparationState: 'raw',
        preparationStateLabel: '生',
        verified: true,
      },
      {
        nutritionFoodId: 'nf-8-cooked',
        name: '香菇（水煮）',
        displayNameZh: '香菇（水煮）',
        status: 'VERIFIED',
        category: 'OTHER',
        dataSource: 'CFCT',
        isPrimary: false,
        preparationState: 'boiled',
        preparationStateLabel: '水煮',
        verified: true,
      },
    ],
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
    nutritionProfiles: [
      {
        nutritionFoodId: 'nf-9',
        name: '口蘑（鲜）',
        displayNameZh: '口蘑（鲜）',
        status: 'VERIFIED',
        category: 'OTHER',
        dataSource: 'CFCT',
        isPrimary: true,
        preparationState: 'raw',
        preparationStateLabel: '生',
        verified: true,
      },
    ],
  },
];

const FAKE_DETAIL_CREATED_AT = new Date('2026-08-01T08:00:00.000Z');
const FAKE_DETAIL_UPDATED_AT = new Date('2026-10-03T08:00:00.000Z');
const FAKE_DRAFT_CREATED_AT = new Date('2026-10-01T08:00:00.000Z');
const FAKE_DRAFT_UPDATED_AT = new Date('2026-10-24T08:00:00.000Z');
const FAKE_DETAIL_NUTRITION_DATA = {
  meta: { rawBasisType: 'PER_100_G' },
  macros: { protein: 2.2, fat: 0.3, fiber: 3.3 },
  minerals: { calcium: 2, phosphorus: 53 },
};

/** 默认原料详情：对应 `nf-8` 香菇，带生/水煮两个档案。 */
const DEFAULT_INGREDIENT_DETAIL: AgentIngredientDetail = {
  ingredientId: 'ing-8',
  nutritionFoodId: 'nf-8',
  name: '香菇',
  nutritionProfileName: '香菇（鲜）',
  type: 'FOOD',
  baseUnit: 'G',
  cfctClass: '菌藻类',
  nutritionCategory: 'OTHER',
  category: 'MUSHROOM',
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
  pricePerPurchaseUnit: 12.5,
  purchaseUnit: 'kg',
  unitDisplayLabel: 'g',
  brand: null,
  productModel: null,
  purchaseChannel: null,
  notes: null,
  procurementStrategy: 'DAILY_PURCHASE',
  diyEnabled: false,
  procurementEnabled: true,
  nutritionProfile: null,
  purchaseToBaseRatio: 1000,
  currentPricePerPurchaseUnit: 12.5,
  effectivePricePerPurchaseUnit: null,
  weightG: null,
  maxCapacityG: null,
  safetyStock: null,
  reorderPoint: null,
  targetStock: null,
  physicalForm: null,
  isOilBased: false,
  supplementRetailEnabled: false,
  shelfLifeMonths: null,
  storageCondition: null,
  openedShelfLifeDays: null,
  properties: { cfct_class: '菌藻类' },
  tags: [],
  recommendedProducts: [],
  createdAt: FAKE_DETAIL_CREATED_AT,
  updatedAt: FAKE_DETAIL_UPDATED_AT,
  nutritionProfiles: [
    {
      nutritionFoodId: 'nf-8',
      mappingId: 'map-8-raw',
      name: '香菇（鲜）',
      displayNameZh: '香菇（鲜）',
      status: 'VERIFIED',
      category: 'OTHER',
      dataSource: 'CFCT',
      externalId: null,
      version: 1,
      preparationState: 'raw',
      preparationStateLabel: '生',
      ediblePortionLabel: null,
      processingLabel: null,
      nutritionData: FAKE_DETAIL_NUTRITION_DATA,
      defaultSupplementTargets: null,
      notes: null,
      verifiedBy: null,
      verifiedAt: null,
      createdAt: FAKE_DETAIL_CREATED_AT,
      updatedAt: FAKE_DETAIL_UPDATED_AT,
      isPrimary: true,
      verified: true,
      yieldRate: 1,
      mappingNotes: null,
    },
    {
      nutritionFoodId: 'nf-8-cooked',
      mappingId: 'map-8-cooked',
      name: '香菇（水煮）',
      displayNameZh: '香菇（水煮）',
      status: 'VERIFIED',
      category: 'OTHER',
      dataSource: 'CFCT',
      externalId: null,
      version: 1,
      preparationState: 'boiled',
      preparationStateLabel: '水煮',
      ediblePortionLabel: null,
      processingLabel: '水煮',
      nutritionData: FAKE_DETAIL_NUTRITION_DATA,
      defaultSupplementTargets: null,
      notes: null,
      verifiedBy: null,
      verifiedAt: null,
      createdAt: FAKE_DETAIL_CREATED_AT,
      updatedAt: FAKE_DETAIL_UPDATED_AT,
      isPrimary: false,
      verified: true,
      yieldRate: 1,
      mappingNotes: null,
    },
  ],
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
  recipeSearchPage?: AgentRecipeSearchPage;
  recipeDetail?: AgentRecipeDetail | null;
}

/** 默认草稿：八类基础齐全、940g、内容版本 4、文案与步骤都填好。 */
export function fakeDraftSnapshot(
  overrides: Partial<AgentDraftSnapshot> = {},
): AgentDraftSnapshot {
  return {
    draftId: 'draft-1',
    seriesId: 'series-1',
    designMode: 'CATALOG',
    orderId: null,
    orderQuantity: null,
    context: { kind: 'PRODUCT' },
    name: '鸭肉南瓜成犬餐',
    scenario: '成犬 110ME',
    contentRevision: 4,
    totalWeightG: 940,
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
    status: 'DRAFT',
    applicableLifeStages: ['HIGH_ACTIVITY_ADULT'],
    coverImageUrl: null,
    detailImages: [],
    videoUrl: null,
    energyDensityKcalPerKg: 1420,
    nutritionStandard: 'FEDIAF_2025',
    nutritionDetailedData: null,
    seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
    createdAt: FAKE_DRAFT_CREATED_AT,
    updatedAt: FAKE_DRAFT_UPDATED_AT,
    nutritionSummary: { fatWetPercent: 12, moisturePercent: 60 },
    animalSpecies: ['鸭'],
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
    allergenWarnings: [],
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
          allergenWarnings: (draft.lastAssessment.allergenWarnings ?? []).map(
            (warning) => ({ ...warning }),
          ),
        }
      : null,
  };
}

function cloneAssessment(view: AgentAssessmentView): AgentAssessmentView {
  return {
    ...view,
    entries: view.entries.map((entry) => ({ ...entry })),
    allergenWarnings: (view.allergenWarnings ?? []).map((warning) => ({
      ...warning,
    })),
  };
}

/**
 * 造一个内存版草稿端口。默认方法都是 `jest.fn()`，读方法立即返回 fixture；
 * 写方法会真的改内存草稿并把 `contentRevision` +1，这样“写完评估过期”
 * 这类链路在后续任务里能测出来。
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
            tags: [...DEFAULT_INGREDIENT_DETAIL.tags],
            recommendedProducts: [
              ...DEFAULT_INGREDIENT_DETAIL.recommendedProducts,
            ],
            nutritionProfiles: DEFAULT_INGREDIENT_DETAIL.nutritionProfiles.map(
              (profile) => ({ ...profile }),
            ),
          }
        : overrides.ingredientDetail,
    catalogUsage: overrides.catalogUsage ?? DEFAULT_CATALOG_USAGE,
    recipeSearchPage: overrides.recipeSearchPage ?? {
      data: [],
      page: 1,
      pageSize: 20,
      total: 0,
      hasMore: false,
    },
    recipeDetail:
      overrides.recipeDetail === undefined ? null : overrides.recipeDetail,
  };

  // 显式传 null 表示还没跑过评估，但真跑一次时仍要有一份可返回的基线结果。
  const assessmentTemplate = overrides.assessment ?? fakeAssessment();

  let nextItemNumber = state.draft.items.length + 1;

  const resolveCandidate = (
    nutritionFoodId: string,
  ): AgentIngredientCandidate | null => {
    if (state.ingredientDetail?.nutritionFoodId === nutritionFoodId) {
      return state.ingredientDetail;
    }
    return (
      state.searchResults.find(
        (candidate) => candidate.nutritionFoodId === nutritionFoodId,
      ) ?? null
    );
  };

  const describeIngredient = (nutritionFoodId: string) => {
    const candidate = resolveCandidate(nutritionFoodId);
    const name = candidate?.name ?? '新原料';
    const cfctClass = candidate?.cfctClass ?? null;
    const nutritionCategory = candidate?.nutritionCategory ?? null;
    return {
      ingredientId: candidate?.ingredientId ?? null,
      name,
      cfctClass,
      nutritionCategory,
      category: classifyFoodCategory({
        name,
        cfctClass,
        nutritionCategory,
        ingredientType: candidate?.type ?? 'FOOD',
      }),
    };
  };

  const findItemIndex = (itemId: string): number => {
    const index = state.draft.items.findIndex((item) => item.id === itemId);
    if (index < 0) {
      throw new Error(`fake port: 找不到原料「${itemId}」`);
    }
    return index;
  };

  /** 写入一条替换后的原料，内容版本 +1，并同步总重。 */
  const commitItem = (index: number, item: AgentDraftItem): AgentDraftItem => {
    const previous = state.draft.items[index];
    state.draft = {
      ...state.draft,
      contentRevision: state.draft.contentRevision + 1,
      totalWeightG: state.draft.totalWeightG - previous.weightG + item.weightG,
      items: state.draft.items.map((current, currentIndex) =>
        currentIndex === index ? item : current,
      ),
    };
    return item;
  };

  const getDraft = jest.fn(async (_draftId: string) => ({
    ...state.draft,
    lastAssessment: state.lastAssessment,
  }));

  const searchIngredients = jest.fn(async () =>
    state.searchResults.map((candidate) => ({ ...candidate })),
  );

  const getIngredient = jest.fn(async () => state.ingredientDetail);

  const getCatalogUsage = jest.fn(async () => state.catalogUsage);

  const searchRecipes = jest.fn(
    async (_input: {
      search?: string;
      ingredientName?: string;
      lifeStage?: string;
      page: number;
      limit: number;
    }) => state.recipeSearchPage,
  );

  const getRecipeDetail = jest.fn(async () => state.recipeDetail);

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
      const described = describeIngredient(input.nutritionFoodId);
      const item: AgentDraftItem = {
        id: `item-${nextItemNumber++}`,
        ingredientId: input.ingredientId ?? described.ingredientId,
        nutritionFoodId: input.nutritionFoodId,
        name: described.name,
        cfctClass: described.cfctClass,
        nutritionCategory: described.nutritionCategory,
        category: described.category,
        weightG: input.weightG,
        ratioPercent: null,
        // 缺省给「生」，免得后续 check_ready 因为新加的原料没预处理而误挂。
        preparationMethod: input.preparationMethod?.trim() || '生',
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

  const replaceItem = jest.fn(
    async (
      itemId: string,
      input: {
        nutritionFoodId: string;
        ingredientId?: string;
        weightG: number;
      },
    ): Promise<AgentDraftItem> => {
      const index = findItemIndex(itemId);
      const existing = state.draft.items[index];
      const described = describeIngredient(input.nutritionFoodId);
      return commitItem(index, {
        ...existing,
        ingredientId: input.ingredientId ?? described.ingredientId,
        nutritionFoodId: input.nutritionFoodId,
        name: described.name,
        cfctClass: described.cfctClass,
        nutritionCategory: described.nutritionCategory,
        category: described.category,
        weightG: input.weightG,
      });
    },
  );

  const updateWeight = jest.fn(
    async (itemId: string, weightG: number): Promise<AgentDraftItem> => {
      const index = findItemIndex(itemId);
      return commitItem(index, { ...state.draft.items[index], weightG });
    },
  );

  const removeItem = jest.fn(async (itemId: string): Promise<void> => {
    const index = findItemIndex(itemId);
    const removed = state.draft.items[index];
    state.draft = {
      ...state.draft,
      contentRevision: state.draft.contentRevision + 1,
      totalWeightG: state.draft.totalWeightG - removed.weightG,
      items: state.draft.items.filter(
        (_item, currentIndex) => currentIndex !== index,
      ),
    };
  });

  const setPreparation = jest.fn(
    async (
      itemId: string,
      input: { method: string },
    ): Promise<AgentDraftItem> => {
      const index = findItemIndex(itemId);
      const existing = state.draft.items[index];
      return commitItem(index, {
        ...existing,
        preparationMethod: input.method,
      });
    },
  );

  const setCopy = jest.fn(
    async (_draftId: string, patch: AgentCopyPatch): Promise<void> => {
      const copy = { ...state.draft.copy };
      if (patch.coverTitle !== undefined) copy.coverTitle = patch.coverTitle;
      if (patch.sellingPoint !== undefined) {
        copy.sellingPoint = patch.sellingPoint;
      }
      if (patch.description !== undefined) copy.description = patch.description;
      if (patch.targetHealthTags !== undefined) {
        copy.targetHealthTags = [...patch.targetHealthTags];
      }
      state.draft = {
        ...state.draft,
        name: patch.name ?? state.draft.name,
        copy,
        contentRevision: state.draft.contentRevision + 1,
      };
    },
  );

  const setProductionSteps = jest.fn(
    async (_draftId: string, steps: AgentProductionStep[]): Promise<void> => {
      state.draft = {
        ...state.draft,
        productionSteps: steps.map((step) => ({ ...step })),
        contentRevision: state.draft.contentRevision + 1,
      };
    },
  );

  const getDogRecipeHistory = jest.fn(
    async (): Promise<AgentDogRecipeHistory> => ({
      dogName: '测试狗',
      total: 0,
      recipes: [],
    }),
  );

  const port: RecipeAgentDraftPort = {
    getDraft,
    searchIngredients,
    getIngredient,
    getCatalogUsage,
    searchRecipes,
    getRecipeDetail,
    getDogRecipeHistory,
    addItem,
    replaceItem,
    updateWeight,
    removeItem,
    setPreparation,
    setCopy,
    setProductionSteps,
    runAssessment,
  };
  return port;
}
