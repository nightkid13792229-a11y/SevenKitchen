import { RecipeDesignerAgentAdapter } from 'src/application/recipe-designer/agent/recipe-designer-agent.adapter';

function createAdapter(service: any, prisma: any = {}) {
  return new RecipeDesignerAgentAdapter(
    service,
    prisma,
    { userId: 'u1', role: 'STAFF' },
    'draft-1',
  );
}

/**
 * 一份判分用的真实草稿形状：7 类原料 900g 的配方，但 items 现算只有 821g。
 *
 * `totalWeightG` / 每条 `ratioPercent` 故意保留旧值（900g 口径），
 * 用来验证适配器必须从当前 items 现算，不能信库里的缓存。
 * 每条 `nutritionFood.nutritionData` 都带每 100g 的水分/粗脂肪，
 * `calculatedNutrition` 只是“所有 item 都没档案”时的兜底。
 */
function serviceDraft() {
  return {
    id: 'draft-1',
    name: '鸭肉南瓜餐（草稿）',
    contentRevision: 4,
    assessmentContentRevision: 4,
    totalWeightG: 900,
    seriesId: 'series-1',
    fediafDogScenario: 'ADULT_MER_110',
    coverTitle: '草稿封面标题',
    sellingPoint: '草稿卖点',
    description: '鸭腿肉配南瓜和燕麦，低温慢煮。',
    targetHealthTags: ['低脂'],
    calculatedNutrition: { macros: { moisture: 600, crudeFat: 90 } },
    complianceStatus: [
      {
        nutrientKey: 'crudeProtein',
        label: '粗蛋白',
        status: 'COMPLIANT',
        currentValue: 26.4,
        minValue: 20,
        maxValue: null,
      },
      {
        nutrientKey: 'calcium',
        label: '钙',
        status: 'DEFICIENT',
        currentValue: 0.8,
        minValue: 1,
        maxValue: null,
      },
      {
        nutrientKey: 'vitaminD',
        label: '维生素 D',
        status: 'MISSING_DATA',
        currentValue: null,
        minValue: 1.5,
        maxValue: 8,
      },
    ],
    productionStepsJson: [],
    items: [
      {
        id: 'item-1',
        ingredientId: 'ing-1',
        nutritionFoodId: 'nf-1',
        weightG: 450,
        includeInAssessment: true,
        ratioPercent: 50,
        preparationMethod: '去皮切块',
        preparationNote: null,
        nutrientTargetKey: null,
        nutrientTargetValue: null,
        sortOrder: 1,
        ingredient: {
          id: 'ing-1',
          name: '鸭腿肉',
          type: 'FOOD',
          properties: { cfct_class: '禽肉类及制品' },
        },
        nutritionFood: {
          id: 'nf-1',
          name: 'duck_leg',
          displayNameZh: '鸭腿肉',
          category: 'MEAT',
          status: 'VERIFIED',
          nutritionData: {
            meta: { rawBasisType: 'PER_100_G' },
            macros: { moisture: 70, crudeFat: 10 },
          },
        },
      },
      {
        id: 'item-2',
        ingredientId: 'ing-2',
        nutritionFoodId: 'nf-2',
        weightG: 45,
        includeInAssessment: true,
        ratioPercent: 5,
        preparationMethod: '去筋膜切丁',
        preparationNote: null,
        nutrientTargetKey: null,
        nutrientTargetValue: null,
        sortOrder: 2,
        ingredient: {
          id: 'ing-2',
          name: '鸭胗',
          type: 'FOOD',
          properties: { cfct_class: '禽肉类及制品' },
        },
        nutritionFood: {
          id: 'nf-2',
          name: 'duck_gizzard',
          displayNameZh: '鸭胗',
          category: 'MEAT',
          status: 'VERIFIED',
          nutritionData: {
            meta: { rawBasisType: 'PER_100_G' },
            macros: { moisture: 75, crudeFat: 5 },
          },
        },
      },
      {
        id: 'item-3',
        ingredientId: 'ing-3',
        nutritionFoodId: 'nf-3',
        weightG: 135,
        includeInAssessment: true,
        ratioPercent: 15,
        preparationMethod: '提前浸泡',
        preparationNote: '浸泡 20 分钟',
        nutrientTargetKey: null,
        nutrientTargetValue: null,
        sortOrder: 3,
        ingredient: {
          id: 'ing-3',
          name: '燕麦',
          type: 'FOOD',
          properties: { cfct_class: '谷类及制品' },
        },
        nutritionFood: {
          id: 'nf-3',
          name: 'oats',
          displayNameZh: '燕麦',
          category: 'GRAIN',
          status: 'VERIFIED',
          nutritionData: {
            meta: { rawBasisType: 'PER_100_G' },
            macros: { moisture: 10, crudeFat: 7 },
          },
        },
      },
      {
        id: 'item-4',
        ingredientId: 'ing-4',
        nutritionFoodId: 'nf-4',
        weightG: 110,
        includeInAssessment: true,
        ratioPercent: 11,
        preparationMethod: '去皮切块',
        preparationNote: null,
        nutrientTargetKey: null,
        nutrientTargetValue: null,
        sortOrder: 4,
        ingredient: {
          id: 'ing-4',
          name: '南瓜',
          type: 'FOOD',
          properties: { cfct_class: '蔬菜类及制品' },
        },
        nutritionFood: {
          id: 'nf-4',
          name: 'pumpkin',
          displayNameZh: '南瓜',
          category: 'VEGETABLE',
          status: 'VERIFIED',
          nutritionData: {
            meta: { rawBasisType: 'PER_100_G' },
            macros: { moisture: 90, crudeFat: 0.5 },
          },
        },
      },
      {
        id: 'item-5',
        ingredientId: 'ing-5',
        nutritionFoodId: 'nf-5',
        weightG: 45,
        includeInAssessment: true,
        ratioPercent: 5,
        preparationMethod: '焯水切丁',
        preparationNote: null,
        nutrientTargetKey: null,
        nutrientTargetValue: null,
        sortOrder: 5,
        ingredient: {
          id: 'ing-5',
          name: '香菇',
          type: 'FOOD',
          properties: { cfct_class: '菌藻类' },
        },
        nutritionFood: {
          id: 'nf-5',
          name: 'shiitake',
          displayNameZh: '香菇',
          category: 'OTHER',
          status: 'VERIFIED',
          nutritionData: {
            meta: { rawBasisType: 'PER_100_G' },
            macros: { moisture: 90, crudeFat: 0.3 },
          },
        },
      },
      {
        id: 'item-6',
        ingredientId: 'ing-6',
        nutritionFoodId: 'nf-6',
        weightG: 27,
        includeInAssessment: true,
        ratioPercent: 3,
        preparationMethod: '研磨成粉',
        preparationNote: null,
        nutrientTargetKey: null,
        nutrientTargetValue: null,
        sortOrder: 6,
        ingredient: {
          id: 'ing-6',
          name: '亚麻籽',
          type: 'FOOD',
          properties: { cfct_class: '坚果种子类' },
        },
        nutritionFood: {
          id: 'nf-6',
          name: 'flaxseed',
          displayNameZh: '亚麻籽',
          category: 'NUT',
          status: 'VERIFIED',
          nutritionData: {
            meta: { rawBasisType: 'PER_100_G' },
            macros: { moisture: 7, crudeFat: 40 },
          },
        },
      },
      {
        id: 'item-7',
        ingredientId: 'ing-7',
        nutritionFoodId: 'nf-7',
        weightG: 9,
        includeInAssessment: true,
        ratioPercent: 1,
        preparationMethod: '直接拌入',
        preparationNote: '出锅后放凉再加',
        nutrientTargetKey: null,
        nutrientTargetValue: null,
        sortOrder: 7,
        ingredient: {
          id: 'ing-7',
          name: '鱼油',
          type: 'FOOD',
          properties: { cfct_class: '油脂类' },
        },
        nutritionFood: {
          id: 'nf-7',
          name: 'fish_oil',
          displayNameZh: '鱼油',
          category: 'OIL',
          status: 'VERIFIED',
          nutritionData: {
            meta: { rawBasisType: 'PER_100_G' },
            macros: { moisture: 0, crudeFat: 100 },
          },
        },
      },
    ],
  };
}

/** 一条已发布食谱行（`Recipe.items` 形状），多版本去重测试复用。 */
function catalogRecipe(input: {
  recipeId: string;
  version?: number;
  name: string;
  items: Array<{
    ingredientId: string;
    exampleWeight: number;
    name: string;
    cfctClass: string;
    category: string;
  }>;
}) {
  return {
    id: `row-${input.recipeId}-v${input.version ?? 1}`,
    recipeId: input.recipeId,
    version: input.version ?? 1,
    name: input.name,
    items: input.items.map((item) => ({
      ingredientId: item.ingredientId,
      exampleWeight: item.exampleWeight,
      ingredient: {
        name: item.name,
        properties: { cfct_class: item.cfctClass },
      },
      nutritionFood: {
        name: item.name,
        displayNameZh: item.name,
        category: item.category,
      },
    })),
  };
}

const CATALOG_DUCK = {
  ingredientId: 'i9',
  exampleWeight: 400,
  name: '鸭腿肉',
  cfctClass: '禽肉类及制品',
  category: 'MEAT',
};
const CATALOG_OATS = {
  ingredientId: 'i10',
  exampleWeight: 100,
  name: '燕麦',
  cfctClass: '谷类及制品',
  category: 'GRAIN',
};
const CATALOG_PUMPKIN = {
  ingredientId: 'i11',
  exampleWeight: 100,
  name: '南瓜',
  cfctClass: '蔬菜类及制品',
  category: 'VEGETABLE',
};

describe('RecipeDesignerAgentAdapter read', () => {
  it('适配器能构造，四个读方法都存在', () => {
    const adapter = createAdapter({}, {});
    expect(typeof adapter.getDraft).toBe('function');
    expect(typeof adapter.searchIngredients).toBe('function');
    expect(typeof adapter.getIngredient).toBe('function');
    expect(typeof adapter.getCatalogUsage).toBe('function');
  });

  it('getDraft 把草稿映射成 AgentDraftSnapshot', async () => {
    const service = {
      getDraft: jest.fn().mockResolvedValue(serviceDraft()),
      getDraftProductionSteps: jest
        .fn()
        .mockResolvedValue({ draftId: 'draft-1', productionSteps: [] }),
    };
    const prisma = {
      recipeSeries: {
        findUnique: jest.fn().mockResolvedValue({
          name: '鸭肉南瓜餐',
          coverTitle: '鲜鸭南瓜',
          sellingPoint: '鲜鸭配南瓜',
          targetHealthTags: ['低脂'],
        }),
      },
    };
    const adapter = createAdapter(service, prisma);
    const draft = await adapter.getDraft('draft-1');

    expect(prisma.recipeSeries.findUnique).toHaveBeenCalledWith({
      where: { id: 'series-1' },
      select: {
        name: true,
        coverTitle: true,
        sellingPoint: true,
        targetHealthTags: true,
      },
    });
    expect(draft.draftId).toBe('draft-1');
    expect(draft.seriesId).toBe('series-1');
    expect(draft.name).toBe('鸭肉南瓜餐');
    expect(draft.scenario).toBe('ADULT_MER_110');
    expect(draft.contentRevision).toBe(4);
    expect(draft.items).toHaveLength(7);
    expect(draft.items.find((i) => i.name === '鸭胗')?.category).toBe('ORGAN');
    expect(draft.items.find((i) => i.name === '南瓜')?.category).toBe(
      'VEGETABLE',
    );
    expect(draft.items.find((i) => i.name === '香菇')?.category).toBe(
      'MUSHROOM',
    );
    expect(draft.totalWeightG).toBe(821);
    expect(draft.items[0].ratioPercent).toBe(54.8);
    expect(draft.copy.coverTitle).toBe('鲜鸭南瓜');
    expect(draft.copy.sellingPoint).toBe('鲜鸭配南瓜');
    expect(draft.copy.description).toBe('鸭腿肉配南瓜和燕麦，低温慢煮。');
    expect(draft.copy.targetHealthTags).toEqual(['低脂']);
    expect(draft.productionSteps).toEqual([]);
    expect(draft.animalSpecies).toEqual(['鸭']);
    // 从 7 条 nutritionFood.nutritionData 现算（每 100g 值 × 克重），
    // 不是 calculatedNutrition 里的 600g / 90g。
    expect(draft.nutritionSummary?.moisturePercent).toBeCloseTo(61.3447, 3);
    expect(draft.nutritionSummary?.fatWetPercent).toBeCloseTo(9.4013, 3);
  });

  it('评估版本不一致时 lastAssessment 为 null', async () => {
    const service = {
      getDraft: jest
        .fn()
        .mockResolvedValue({ ...serviceDraft(), contentRevision: 5 }),
      getDraftProductionSteps: jest
        .fn()
        .mockResolvedValue({ draftId: 'draft-1', productionSteps: [] }),
    };
    const adapter = createAdapter(service, {
      recipeSeries: { findUnique: jest.fn().mockResolvedValue(null) },
    });

    const draft = await adapter.getDraft('draft-1');

    expect(draft.lastAssessment).toBeNull();
  });

  it('评估版本一致时映射条目与计数', async () => {
    const adapter = createAdapter(
      {
        getDraft: jest.fn().mockResolvedValue(serviceDraft()),
        getDraftProductionSteps: jest
          .fn()
          .mockResolvedValue({ draftId: 'draft-1', productionSteps: [] }),
      },
      { recipeSeries: { findUnique: jest.fn().mockResolvedValue(null) } },
    );

    const draft = await adapter.getDraft('draft-1');

    expect(draft.lastAssessment?.contentRevision).toBe(4);
    expect(draft.lastAssessment?.entries.length).toBe(3);
    expect(draft.lastAssessment?.entries[0]).toEqual({
      key: 'crudeProtein',
      label: '粗蛋白',
      status: 'COMPLIANT',
      value: 26.4,
      min: 20,
      max: null,
      marginPercent: null,
    });
    expect(draft.lastAssessment?.compliant).toBe(1);
    expect(draft.lastAssessment?.deficient).toBe(1);
    expect(draft.lastAssessment?.excess).toBe(0);
    expect(draft.lastAssessment?.missingData).toBe(1);
  });

  it('items 没有营养档案时回退到 calculatedNutrition', async () => {
    const draft: any = serviceDraft();
    for (const item of draft.items) {
      item.nutritionFood.nutritionData = null;
    }
    const adapter = createAdapter(
      {
        getDraft: jest.fn().mockResolvedValue(draft),
        getDraftProductionSteps: jest
          .fn()
          .mockResolvedValue({ draftId: 'draft-1', productionSteps: [] }),
      },
      { recipeSeries: { findUnique: jest.fn().mockResolvedValue(null) } },
    );

    const snapshot = await adapter.getDraft('draft-1');

    expect(snapshot.nutritionSummary?.moisturePercent).toBeCloseTo(
      (600 / 821) * 100,
      5,
    );
    expect(snapshot.nutritionSummary?.fatWetPercent).toBeCloseTo(
      (90 / 821) * 100,
      5,
    );
  });

  it('items 与 calculatedNutrition 都没有时 nutritionSummary 为 null', async () => {
    const draft: any = serviceDraft();
    for (const item of draft.items) {
      item.nutritionFood.nutritionData = null;
    }
    draft.calculatedNutrition = null;
    const adapter = createAdapter(
      {
        getDraft: jest.fn().mockResolvedValue(draft),
        getDraftProductionSteps: jest
          .fn()
          .mockResolvedValue({ draftId: 'draft-1', productionSteps: [] }),
      },
      { recipeSeries: { findUnique: jest.fn().mockResolvedValue(null) } },
    );

    const snapshot = await adapter.getDraft('draft-1');

    expect(snapshot.nutritionSummary).toEqual({
      fatWetPercent: null,
      moisturePercent: null,
    });
  });

  it('任一参与评估的 item 缺字段时该指标为 null', async () => {
    const draft: any = serviceDraft();
    // 燕麦缺粗脂肪，其余原料仍有水分；水分应照常算出，脂肪保守为 null。
    draft.items[2].nutritionFood.nutritionData = {
      macros: { moisture: 10 },
    };
    const adapter = createAdapter(
      {
        getDraft: jest.fn().mockResolvedValue(draft),
        getDraftProductionSteps: jest
          .fn()
          .mockResolvedValue({ draftId: 'draft-1', productionSteps: [] }),
      },
      { recipeSeries: { findUnique: jest.fn().mockResolvedValue(null) } },
    );

    const snapshot = await adapter.getDraft('draft-1');

    expect(snapshot.nutritionSummary?.moisturePercent).toBeCloseTo(61.3447, 3);
    expect(snapshot.nutritionSummary?.fatWetPercent).toBeNull();
  });

  it('searchIngredients 只收已验证档案，并按七类过滤', async () => {
    const service = {
      listIngredientOptions: jest.fn().mockResolvedValue({
        data: [
          {
            id: 'i1',
            name: '香菇',
            type: 'FOOD',
            defaultNutritionFoodId: 'nf1',
            nutritionProfiles: [
              {
                nutritionFoodId: 'nf1',
                name: '香菇',
                category: 'OTHER',
                status: 'VERIFIED',
                isPrimary: true,
              },
            ],
          },
          {
            id: 'i2',
            name: '坏档案',
            type: 'FOOD',
            defaultNutritionFoodId: 'nf2',
            nutritionProfiles: [
              {
                nutritionFoodId: 'nf2',
                name: '坏档案',
                category: 'OTHER',
                status: 'PENDING',
                isPrimary: true,
              },
            ],
          },
        ],
      }),
    };
    const prisma = {
      ingredient: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'i1', properties: { cfct_class: '菌藻类' } },
          { id: 'i2', properties: { cfct_class: '菌藻类' } },
        ]),
      },
    };
    const adapter = createAdapter(service, prisma);

    const result = await adapter.searchIngredients({
      category: 'MUSHROOM',
      limit: 10,
    });

    expect(result.map((c) => c.ingredientId)).toEqual(['i1']);
    expect(result[0].cfctClass).toBe('菌藻类');
  });

  it('getIngredient 找不到返回 null，找到时带价格/过敏原', async () => {
    const prisma = {
      nutritionFood: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({
            id: 'nf1',
            name: '鸭腿肉',
            displayNameZh: '鸭腿肉',
            status: 'VERIFIED',
            category: 'MEAT',
            nutritionData: { macros: { crudeProtein: 18, crudeFat: 6 } },
            mappings: [
              {
                ingredientId: 'i1',
                isPrimary: true,
                ingredient: {
                  id: 'i1',
                  name: '鸭腿肉',
                  type: 'FOOD',
                  properties: { cfct_class: '禽肉类及制品' },
                  currentPricePerPurchaseUnit: 30,
                  purchaseUnit: 'kg',
                  allergenTags: [{ allergenTag: { name: '鸭肉' } }],
                },
              },
            ],
          }),
      },
    };
    const adapter = createAdapter({}, prisma);

    expect(
      await adapter.getIngredient({ nutritionFoodId: 'missing' }),
    ).toBeNull();
    const detail = await adapter.getIngredient({ nutritionFoodId: 'nf1' });

    expect(detail?.category).toBe('PROTEIN');
    expect(detail?.allergenNames).toEqual(['鸭肉']);
    expect(detail?.pricePerPurchaseUnit).toBe(30);
  });

  it('getIngredient 没有采购原料映射时返回 null', async () => {
    const prisma = {
      nutritionFood: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'nf1',
          name: '鸭腿肉',
          displayNameZh: '鸭腿肉',
          status: 'VERIFIED',
          category: 'MEAT',
          nutritionData: { macros: { crudeProtein: 18 } },
          mappings: [],
        }),
      },
    };
    const adapter = createAdapter({}, prisma);

    expect(await adapter.getIngredient({ nutritionFoodId: 'nf1' })).toBeNull();
  });

  it('目录使用只算与当前草稿的交集，并统计主蛋白', async () => {
    const service = { getDraft: jest.fn().mockResolvedValue(serviceDraft()) };
    // 真实 schema：Recipe 的明细关系叫 items（不是 recipeItems），
    // 每条克重字段是 exampleWeight（RecipeItem 没有 weightG）。
    const prisma = {
      recipe: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'r1',
            recipeId: 'r1',
            version: 1,
            name: '旧鸭肉餐',
            items: [
              {
                ingredientId: 'i9',
                exampleWeight: 400,
                ingredient: {
                  name: '鸭腿肉',
                  properties: { cfct_class: '禽肉类及制品' },
                },
                nutritionFood: {
                  name: '鸭腿肉',
                  displayNameZh: '鸭腿肉',
                  category: 'MEAT',
                },
              },
              {
                ingredientId: 'i10',
                exampleWeight: 100,
                ingredient: {
                  name: '燕麦',
                  properties: { cfct_class: '谷类及制品' },
                },
                nutritionFood: {
                  name: '燕麦',
                  displayNameZh: '燕麦',
                  category: 'GRAIN',
                },
              },
            ],
          },
        ]),
      },
    };
    const adapter = createAdapter(service, prisma);

    const usage = await adapter.getCatalogUsage({ mainProteinName: '鸭腿肉' });

    expect(usage.totalPublishedRecipes).toBe(1);
    expect(usage.mainProteinCount).toBe(1);
    expect(usage.recipes).toHaveLength(1);
    expect(usage.recipes[0].recipeId).toBe('r1');
    expect(usage.recipes[0].mainProteinName).toBe('鸭腿肉');
    expect(usage.recipes[0].overlappingCategories).toEqual(
      expect.arrayContaining(['PROTEIN', 'CARB']),
    );
    expect(usage.recipes[0].overlappingIngredientNames).toEqual(
      expect.arrayContaining(['鸭腿肉', '燕麦']),
    );
    expect(service.getDraft).toHaveBeenCalledWith('draft-1', {
      userId: 'u1',
      role: 'STAFF',
      customerId: undefined,
    });
  });

  it('同一 recipeId 的多个已发布版本只算一次，取版本最高的', async () => {
    const service = { getDraft: jest.fn().mockResolvedValue(serviceDraft()) };
    const prisma = {
      recipe: {
        findMany: jest.fn().mockResolvedValue([
          catalogRecipe({
            recipeId: 'r1',
            version: 1,
            name: '旧鸭肉餐 v1',
            items: [CATALOG_DUCK, CATALOG_OATS],
          }),
          catalogRecipe({
            recipeId: 'r1',
            version: 3,
            name: '旧鸭肉餐 v3',
            items: [CATALOG_DUCK, CATALOG_OATS],
          }),
          catalogRecipe({
            recipeId: 'r2',
            name: '鸭肉南瓜餐',
            items: [CATALOG_DUCK, CATALOG_PUMPKIN],
          }),
        ]),
      },
    };
    const adapter = createAdapter(service, prisma);

    const usage = await adapter.getCatalogUsage({});

    expect(usage.totalPublishedRecipes).toBe(2);
    expect(usage.recipes.map((recipe) => recipe.recipeId)).toEqual([
      'r1',
      'r2',
    ]);
    expect(usage.recipes[0].name).toBe('旧鸭肉餐 v3');
    expect(usage.recipes.map((recipe) => recipe.name)).not.toContain(
      '旧鸭肉餐 v1',
    );
    expect(prisma.recipe.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'PUBLIC' },
        select: expect.objectContaining({ recipeId: true, version: true }),
      }),
    );
  });

  it('ingredientNames 按名字过滤已发布菜，不传则保持原逻辑', async () => {
    const service = { getDraft: jest.fn().mockResolvedValue(serviceDraft()) };
    const chicken = {
      ingredientId: 'i12',
      exampleWeight: 400,
      name: 'Chicken',
      cfctClass: '禽肉类及制品',
      category: 'MEAT',
    };
    const prisma = {
      recipe: {
        findMany: jest.fn().mockResolvedValue([
          catalogRecipe({
            recipeId: 'r1',
            name: '旧鸭肉餐',
            items: [CATALOG_DUCK, CATALOG_OATS],
          }),
          catalogRecipe({
            recipeId: 'r2',
            name: 'Chicken Dinner',
            items: [chicken, CATALOG_PUMPKIN],
          }),
        ]),
      },
    };
    const adapter = createAdapter(service, prisma);

    const all = await adapter.getCatalogUsage({});
    expect(all.recipes.map((recipe) => recipe.recipeId)).toEqual(['r1', 'r2']);

    // 去空白 + 大小写不敏感；目录总数仍按全目录去重口径。
    const oatsOnly = await adapter.getCatalogUsage({
      ingredientNames: [' 燕麦 '],
    });
    expect(oatsOnly.totalPublishedRecipes).toBe(2);
    expect(oatsOnly.recipes.map((recipe) => recipe.recipeId)).toEqual(['r1']);
    expect(oatsOnly.recipes[0].overlappingIngredientNames).toEqual(
      expect.arrayContaining(['燕麦']),
    );

    const chickenOnly = await adapter.getCatalogUsage({
      ingredientNames: [' CHICKEN '],
    });
    expect(chickenOnly.recipes.map((recipe) => recipe.recipeId)).toEqual([
      'r2',
    ]);
    expect(chickenOnly.recipes[0].mainProteinName).toBe('Chicken');
  });
});
