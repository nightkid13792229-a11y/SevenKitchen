/**
 * Phase 2：只读食谱目录（已发布 PUBLIC + 当前草稿）。
 *
 * 这些用例只覆盖适配器的数据边界：
 * - 目录只读 `status=PUBLIC && isCustomRecipe=false`，同一 recipeId 只取最高版本；
 * - 当前草稿只读绑定的这一份，别的 draftId 直接拒绝；
 * - 返回形状不含客户 / 订单 / 狗狗 / 主人等 PII 字段。
 */
import { RecipeDesignerAgentAdapter } from 'src/application/recipe-designer/agent/recipe-designer-agent.adapter';

const DRAFT_CREATED_AT = new Date('2026-10-01T08:00:00.000Z');
const DRAFT_UPDATED_AT = new Date('2026-10-24T08:00:00.000Z');
const RECIPE_UPDATED_AT = new Date('2026-10-20T08:00:00.000Z');

function createAdapter(service: any, prisma: any = {}) {
  return new RecipeDesignerAgentAdapter(
    service,
    prisma,
    { userId: 'u1', role: 'STAFF' },
    'draft-1',
  );
}

function draftItem(input: {
  id: string;
  name: string;
  nutritionProfileName: string;
  weightG: number;
  type?: 'FOOD' | 'SUPPLEMENT';
  cfctClass?: string;
}) {
  return {
    id: input.id,
    ingredientId: `ing-${input.id}`,
    nutritionFoodId: `nf-${input.id}`,
    weightG: input.weightG,
    includeInAssessment: true,
    ratioPercent: null,
    preparationMethod: '切块',
    preparationNote: null,
    nutrientTargetKey: null,
    nutrientTargetValue: null,
    sortOrder: 1,
    ingredient: {
      id: `ing-${input.id}`,
      name: input.name,
      type: input.type ?? 'FOOD',
      properties: { cfct_class: input.cfctClass ?? '禽肉类及制品' },
    },
    nutritionFood: {
      id: `nf-${input.id}`,
      name: `profile-${input.id}`,
      nameEn: `profile-${input.id}`,
      displayNameZh: input.nutritionProfileName,
      dataSource: 'CFCT',
      category: 'MEAT',
      status: 'VERIFIED',
      nutritionData: null,
    },
  };
}

function serviceDraft() {
  return {
    id: 'draft-1',
    name: '当前草稿鸭肉餐',
    contentRevision: 4,
    assessmentContentRevision: null,
    totalWeightG: 500,
    seriesId: null,
    series: null,
    status: 'DRAFT',
    fediafDogScenario: 'ADULT_MER_110',
    coverTitle: '草稿封面',
    sellingPoint: '草稿卖点',
    description: '草稿详情描述',
    coverImageUrl: 'https://img.test/draft-cover.jpg',
    detailImages: ['https://img.test/draft-detail.jpg'],
    videoUrl: null,
    energyDensityKcalPerKg: 1420,
    nutritionStandard: 'FEDIAF_2025',
    nutritionReportJson: { report: { totalEnergyKcal: 1000 } },
    targetHealthTags: ['低脂'],
    applicableLifeStages: ['HIGH_ACTIVITY_ADULT'],
    seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
    createdAt: DRAFT_CREATED_AT,
    updatedAt: DRAFT_UPDATED_AT,
    calculatedNutrition: {},
    complianceStatus: [],
    productionStepsJson: [],
    items: [
      draftItem({
        id: 'duck',
        name: '鸭腿肉',
        nutritionProfileName: '鸭腿肉（生）',
        weightG: 400,
      }),
      draftItem({
        id: 'pumpkin',
        name: '南瓜',
        nutritionProfileName: '南瓜（蒸制）',
        weightG: 100,
        cfctClass: '蔬菜类及制品',
      }),
    ],
  };
}

const EMPTY_STEPS = { draftId: 'draft-1', productionSteps: [] };

function draftService(overrides: Record<string, unknown> = {}) {
  return {
    getDraft: jest.fn().mockResolvedValue({ ...serviceDraft(), ...overrides }),
    getDraftProductionSteps: jest.fn().mockResolvedValue(EMPTY_STEPS),
  };
}

function publishedItem(input: {
  name: string;
  weightG: number;
  nutritionProfileName?: string;
  type?: 'FOOD' | 'SUPPLEMENT';
  cfctClass?: string;
}) {
  return {
    ingredientId: `ing-${input.name}`,
    nutritionFoodId: `nf-${input.name}`,
    exampleWeight: input.weightG,
    preparationMethod: '切块',
    preparationNote: null,
    sortOrder: 1,
    ingredient: {
      id: `ing-${input.name}`,
      name: input.name,
      type: input.type ?? 'FOOD',
      properties: { cfct_class: input.cfctClass ?? '禽肉类及制品' },
    },
    nutritionFood: {
      id: `nf-${input.name}`,
      name: `profile-${input.name}`,
      nameEn: `profile-${input.name}`,
      displayNameZh: input.nutritionProfileName ?? `${input.name}（生）`,
      dataSource: 'CFCT',
      category: 'MEAT',
    },
  };
}

function publishedRow(input: {
  id?: string;
  recipeId: string;
  version?: number;
  name: string;
  status?: string;
  isCustomRecipe?: boolean;
  applicableLifeStages?: string[];
  targetHealthTags?: string[];
  healthTagNames?: string[];
  items: ReturnType<typeof publishedItem>[];
  updatedAt?: Date;
}) {
  return {
    id: input.id ?? `row-${input.recipeId}-v${input.version ?? 1}`,
    recipeId: input.recipeId,
    version: input.version ?? 1,
    name: input.name,
    status: input.status ?? 'PUBLIC',
    isCustomRecipe: input.isCustomRecipe ?? false,
    applicableLifeStages: input.applicableLifeStages ?? ['HIGH_ACTIVITY_ADULT'],
    coverTitle: `${input.name}封面`,
    sellingPoint: `${input.name}卖点`,
    targetHealthTags: input.targetHealthTags ?? ['低脂'],
    updatedAt: input.updatedAt ?? RECIPE_UPDATED_AT,
    createdAt: DRAFT_CREATED_AT,
    description: `${input.name}描述`,
    coverImageUrl: 'https://img.test/cover.jpg',
    detailImages: ['https://img.test/detail-1.jpg'],
    videoUrl: 'https://img.test/video.mp4',
    energyDensityKcalPerKg: 1500,
    nutritionStandard: 'FEDIAF_2025',
    nutritionDetailedData: { report: { totalEnergyKcal: 2000 } },
    productionStepsJson: [
      {
        sortOrder: 1,
        instruction: '低温慢煮',
        durationMinutes: 30,
        temperatureC: 90,
        equipment: '炖锅',
      },
    ],
    designSource: 'MANUAL',
    seriesId: 'series-1',
    seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
    healthTagAssignments: (input.healthTagNames ?? []).map((name, index) => ({
      id: `assignment-${index}`,
      healthTag: { name },
    })),
    items: input.items,
  };
}

describe('RecipeDesignerAgentAdapter recipe catalog read', () => {
  it('目录搜索只查 PUBLIC 且非定制食谱，并按 recipeId 去重取最高版本', async () => {
    const service = draftService({ name: '不匹配的草稿' });
    const prisma = {
      recipe: {
        findMany: jest.fn().mockResolvedValue([
          publishedRow({
            recipeId: 'r1',
            version: 1,
            name: '目录鸭肉餐 v1',
            items: [publishedItem({ name: '鸭腿肉', weightG: 400 })],
          }),
          publishedRow({
            recipeId: 'r1',
            version: 3,
            name: '目录鸭肉餐 v3',
            items: [publishedItem({ name: '鸭腿肉', weightG: 400 })],
          }),
          publishedRow({
            recipeId: 'r2',
            version: 2,
            name: '目录南瓜餐',
            items: [publishedItem({ name: '南瓜', weightG: 300 })],
          }),
        ]),
      },
    };
    const adapter = createAdapter(service, prisma);

    const result = await adapter.searchRecipes({
      search: '目录',
      page: 1,
      limit: 20,
    });

    expect(prisma.recipe.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'PUBLIC', isCustomRecipe: false },
        // 数据库侧先按 recipeId 去重，避免把整个目录（含所有旧版本）搬回内存。
        distinct: ['recipeId'],
        orderBy: [{ recipeId: 'asc' }, { version: 'desc' }],
      }),
    );
    expect(result.total).toBe(2);
    expect(result.data.map((recipe) => recipe.name)).toEqual(
      expect.arrayContaining(['目录鸭肉餐 v3', '目录南瓜餐']),
    );
    expect(result.data[0]).toMatchObject({
      source: 'PUBLISHED',
      recipeId: expect.stringMatching(/^r[12]$/),
      version: expect.any(Number),
    });
    const latestDuck = result.data.find((recipe) => recipe.recipeId === 'r1');
    expect(latestDuck).toMatchObject({
      version: 3,
      id: 'row-r1-v3',
      name: '目录鸭肉餐 v3',
    });
    expect(result.data.map((recipe) => recipe.name)).not.toContain(
      '目录鸭肉餐 v1',
    );
  });

  it('即使查询返回了 PRIVATE_CUSTOM / 定制行，也不会出现在结果里', async () => {
    const service = draftService({ name: '不匹配的草稿' });
    const prisma = {
      recipe: {
        findMany: jest.fn().mockResolvedValue([
          publishedRow({
            recipeId: 'r-public',
            name: '公开鸭肉餐',
            applicableLifeStages: ['PUPPY_14_WEEKS_PLUS'],
            items: [publishedItem({ name: '鸭腿肉', weightG: 400 })],
          }),
          publishedRow({
            recipeId: 'r-private',
            name: '私密定制餐',
            status: 'PRIVATE_CUSTOM',
            applicableLifeStages: ['PUPPY_14_WEEKS_PLUS'],
            items: [publishedItem({ name: '鸭腿肉', weightG: 400 })],
          }),
          publishedRow({
            recipeId: 'r-custom',
            name: '定制标记餐',
            isCustomRecipe: true,
            applicableLifeStages: ['PUPPY_14_WEEKS_PLUS'],
            items: [publishedItem({ name: '鸭腿肉', weightG: 400 })],
          }),
        ]),
      },
    };
    const adapter = createAdapter(service, prisma);

    // 生命阶段与当前草稿区分开，避免草稿也进入断言；只验证目录侧过滤。
    const result = await adapter.searchRecipes({
      lifeStage: 'PUPPY_14_WEEKS_PLUS',
      page: 1,
      limit: 20,
    });

    expect(result.data.map((recipe) => recipe.name)).toEqual(['公开鸭肉餐']);
    expect(JSON.stringify(result.data)).not.toContain('私密定制餐');
  });

  it('ingredientName 按原料名 / 营养档案名过滤（大小写与空白不敏感）', async () => {
    const service = draftService({ name: '不匹配的草稿' });
    const prisma = {
      recipe: {
        findMany: jest.fn().mockResolvedValue([
          publishedRow({
            recipeId: 'r-duck',
            name: '鸭肉餐',
            items: [publishedItem({ name: '鸭腿肉', weightG: 400 })],
          }),
          publishedRow({
            recipeId: 'r-oats',
            name: '燕麦餐',
            items: [
              publishedItem({
                name: 'Oats',
                nutritionProfileName: '燕麦（水煮）',
                weightG: 200,
                cfctClass: '谷类及制品',
              }),
            ],
          }),
        ]),
      },
    };
    const adapter = createAdapter(service, prisma);

    const byIngredient = await adapter.searchRecipes({
      ingredientName: ' 鸭腿 ',
      page: 1,
      limit: 20,
    });
    expect(
      byIngredient.data
        .filter((recipe) => recipe.source === 'PUBLISHED')
        .map((recipe) => recipe.recipeId),
    ).toEqual(['r-duck']);
    // 当前草稿也有鸭腿肉，按同一口径一并命中。
    expect(
      byIngredient.data.some((recipe) => recipe.source === 'CURRENT_DRAFT'),
    ).toBe(true);

    const byProfile = await adapter.searchRecipes({
      ingredientName: '水煮',
      page: 1,
      limit: 20,
    });
    expect(
      byProfile.data
        .filter((recipe) => recipe.source === 'PUBLISHED')
        .map((recipe) => recipe.recipeId),
    ).toEqual(['r-oats']);
  });

  it('search 同时匹配菜名、原料名和营养档案名', async () => {
    const service = draftService({ name: '不匹配的草稿' });
    const prisma = {
      recipe: {
        findMany: jest.fn().mockResolvedValue([
          publishedRow({
            recipeId: 'r-name',
            name: '鲜鸭南瓜餐',
            items: [publishedItem({ name: '鸭腿肉', weightG: 400 })],
          }),
          publishedRow({
            recipeId: 'r-ingredient',
            name: '秋季套餐',
            items: [publishedItem({ name: '三文鱼', weightG: 200 })],
          }),
          publishedRow({
            recipeId: 'r-profile',
            name: '低脂套餐',
            items: [
              publishedItem({
                name: '鸡胸肉',
                nutritionProfileName: '鸡胸肉（蒸制）',
                weightG: 200,
              }),
            ],
          }),
        ]),
      },
    };
    const adapter = createAdapter(service, prisma);

    const byName = await adapter.searchRecipes({
      search: '鲜鸭',
      page: 1,
      limit: 20,
    });
    expect(byName.data.map((recipe) => recipe.recipeId)).toEqual(['r-name']);

    const byIngredient = await adapter.searchRecipes({
      search: '三文鱼',
      page: 1,
      limit: 20,
    });
    expect(byIngredient.data.map((recipe) => recipe.recipeId)).toEqual([
      'r-ingredient',
    ]);

    const byProfile = await adapter.searchRecipes({
      search: '蒸制',
      page: 1,
      limit: 20,
    });
    expect(
      byProfile.data
        .filter((recipe) => recipe.source === 'PUBLISHED')
        .map((recipe) => recipe.recipeId),
    ).toEqual(['r-profile']);
    // 当前草稿的南瓜档案也是「蒸制」，同一搜索口径下应一起命中。
    expect(
      byProfile.data.some((recipe) => recipe.source === 'CURRENT_DRAFT'),
    ).toBe(true);
  });

  it('无筛选时把当前草稿作为 CURRENT_DRAFT 一起返回，字段完整且没有 PII', async () => {
    const service = draftService();
    const prisma = {
      recipe: {
        findMany: jest.fn().mockResolvedValue([
          publishedRow({
            recipeId: 'r1',
            name: '目录鸭肉餐',
            items: [publishedItem({ name: '鸭腿肉', weightG: 400 })],
          }),
        ]),
      },
    };
    const adapter = createAdapter(service, prisma);

    const result = await adapter.searchRecipes({ page: 1, limit: 20 });

    expect(result.total).toBe(2);
    const draft = result.data.find(
      (recipe) => recipe.source === 'CURRENT_DRAFT',
    );
    expect(draft).toMatchObject({
      source: 'CURRENT_DRAFT',
      id: 'draft-1',
      recipeId: null,
      version: null,
      name: '当前草稿鸭肉餐',
      status: 'DRAFT',
      applicableLifeStages: ['HIGH_ACTIVITY_ADULT'],
      coverTitle: '草稿封面',
      sellingPoint: '草稿卖点',
      targetHealthTags: ['低脂'],
      mainProteinName: '鸭腿肉',
    });
    expect(draft?.ingredientNames).toEqual(['鸭腿肉', '南瓜']);
    expect(draft?.updatedAt).toEqual(DRAFT_UPDATED_AT);
    expect(JSON.stringify(result.data)).not.toMatch(
      /customer|orderId|customerDog|owner/i,
    );
  });

  it('筛选条件同样作用于当前草稿；不匹配时不出现', async () => {
    const service = draftService();
    const prisma = {
      recipe: {
        findMany: jest.fn().mockResolvedValue([
          publishedRow({
            recipeId: 'r1',
            name: '目录鸭肉餐',
            applicableLifeStages: ['PUPPY_14_WEEKS_PLUS'],
            items: [publishedItem({ name: '鸭腿肉', weightG: 400 })],
          }),
        ]),
      },
    };
    const adapter = createAdapter(service, prisma);

    const matched = await adapter.searchRecipes({
      ingredientName: '南瓜',
      page: 1,
      limit: 20,
    });
    expect(matched.data.map((recipe) => recipe.source)).toEqual([
      'CURRENT_DRAFT',
    ]);

    const lifeStage = await adapter.searchRecipes({
      lifeStage: 'HIGH_ACTIVITY_ADULT',
      page: 1,
      limit: 20,
    });
    expect(lifeStage.data.map((recipe) => recipe.source)).toEqual([
      'CURRENT_DRAFT',
    ]);

    const notMatched = await adapter.searchRecipes({
      search: '完全不存在的关键词',
      page: 1,
      limit: 20,
    });
    expect(notMatched).toMatchObject({
      data: [],
      total: 0,
      page: 1,
      pageSize: 20,
      hasMore: false,
    });
  });

  it('分页只返回当前页，total / hasMore 按合并后的结果计算', async () => {
    const service = draftService({ name: '不匹配的草稿' });
    const prisma = {
      recipe: {
        findMany: jest.fn().mockResolvedValue(
          ['1', '2', '3', '4', '5'].map((index) =>
            publishedRow({
              recipeId: `r${index}`,
              name: `目录菜 ${index}`,
              items: [publishedItem({ name: '鸭腿肉', weightG: 400 })],
            }),
          ),
        ),
      },
    };
    const adapter = createAdapter(service, prisma);

    const secondPage = await adapter.searchRecipes({
      search: '目录菜',
      page: 2,
      limit: 2,
    });
    expect(secondPage).toMatchObject({
      page: 2,
      pageSize: 2,
      total: 5,
      hasMore: true,
    });
    expect(secondPage.data).toHaveLength(2);

    const lastPage = await adapter.searchRecipes({
      search: '目录菜',
      page: 3,
      limit: 2,
    });
    expect(lastPage.data).toHaveLength(1);
    expect(lastPage.hasMore).toBe(false);
  });

  it('已发布详情返回最高版本的全部只读字段和原料，且不含 PII', async () => {
    const service = draftService();
    const row = publishedRow({
      id: 'row-r1-v3',
      recipeId: 'logical-r1',
      version: 3,
      name: '鸭肉南瓜餐',
      targetHealthTags: ['低脂'],
      healthTagNames: ['低脂', '易消化'],
      items: [
        publishedItem({ name: '鸭腿肉', weightG: 400 }),
        publishedItem({
          name: '南瓜',
          weightG: 100,
          cfctClass: '蔬菜类及制品',
        }),
      ],
    });
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce({ recipeId: 'logical-r1' })
      .mockResolvedValueOnce(row);
    const prisma = { recipe: { findFirst } };
    const adapter = createAdapter(service, prisma);

    const detail = await adapter.getRecipeDetail({ recipeId: 'row-r1-v3' });

    expect(findFirst).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          id: 'row-r1-v3',
          status: 'PUBLIC',
          isCustomRecipe: false,
        },
      }),
    );
    expect(findFirst).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          recipeId: 'logical-r1',
          status: 'PUBLIC',
          isCustomRecipe: false,
        },
        orderBy: { version: 'desc' },
      }),
    );
    expect(detail).toMatchObject({
      source: 'PUBLISHED',
      id: 'row-r1-v3',
      recipeId: 'logical-r1',
      version: 3,
      name: '鸭肉南瓜餐',
      description: '鸭肉南瓜餐描述',
      coverImageUrl: 'https://img.test/cover.jpg',
      videoUrl: 'https://img.test/video.mp4',
      energyDensityKcalPerKg: 1500,
      nutritionStandard: 'FEDIAF_2025',
      seriesId: 'series-1',
      seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
      designSource: 'MANUAL',
    });
    expect(detail?.detailImages).toEqual(['https://img.test/detail-1.jpg']);
    expect(detail?.items).toHaveLength(2);
    expect(detail?.items[0]).toMatchObject({
      ingredientId: 'ing-鸭腿肉',
      nutritionFoodId: 'nf-鸭腿肉',
      name: '鸭腿肉',
      nutritionProfileName: '鸭腿肉（生）',
      ingredientType: 'FOOD',
      weightG: 400,
      preparationMethod: '切块',
      category: 'PROTEIN',
    });
    expect(detail?.productionSteps).toEqual([
      {
        sortOrder: 1,
        instruction: '低温慢煮',
        duration: '30 分钟',
        temperature: '90℃',
        equipment: '炖锅',
      },
    ]);
    expect(detail?.targetHealthTags).toEqual(['低脂', '易消化']);
    expect(JSON.stringify(detail)).not.toMatch(
      /customer|orderId|customerDog|owner/i,
    );
  });

  it('recipeId 可以是逻辑 recipeId：先按 id 查不到就按 recipeId 取最高版本', async () => {
    const service = draftService();
    const row = publishedRow({
      recipeId: 'logical-r2',
      version: 2,
      name: '逻辑鸭肉餐',
      items: [publishedItem({ name: '鸭腿肉', weightG: 400 })],
    });
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(row);
    const adapter = createAdapter(service, {
      recipe: { findFirst },
    });

    const detail = await adapter.getRecipeDetail({ recipeId: 'logical-r2' });

    expect(findFirst).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          recipeId: 'logical-r2',
          status: 'PUBLIC',
          isCustomRecipe: false,
        },
        orderBy: { version: 'desc' },
      }),
    );
    expect(detail).toMatchObject({
      recipeId: 'logical-r2',
      version: 2,
      name: '逻辑鸭肉餐',
    });
  });

  it('未找到 / PRIVATE_CUSTOM / 定制食谱都返回 null', async () => {
    const service = draftService();
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce({ recipeId: 'private-1' })
      .mockResolvedValueOnce(
        publishedRow({
          recipeId: 'private-1',
          name: '私密定制餐',
          status: 'PRIVATE_CUSTOM',
          items: [publishedItem({ name: '鸭腿肉', weightG: 400 })],
        }),
      )
      .mockResolvedValueOnce({ recipeId: 'custom-1' })
      .mockResolvedValueOnce(
        publishedRow({
          recipeId: 'custom-1',
          name: '定制标记餐',
          isCustomRecipe: true,
          items: [publishedItem({ name: '鸭腿肉', weightG: 400 })],
        }),
      )
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    const adapter = createAdapter(service, {
      recipe: { findFirst },
    });

    expect(
      await adapter.getRecipeDetail({ recipeId: 'private-row' }),
    ).toBeNull();
    expect(
      await adapter.getRecipeDetail({ recipeId: 'custom-row' }),
    ).toBeNull();
    expect(
      await adapter.getRecipeDetail({ recipeId: 'missing-row' }),
    ).toBeNull();
  });

  it('当前草稿详情报错复用 getDraft 快照并映射成只读详情', async () => {
    const service = draftService();
    const prisma = {
      recipe: { findFirst: jest.fn() },
    };
    const adapter = createAdapter(service, prisma);

    const detail = await adapter.getRecipeDetail({ draftId: 'draft-1' });

    expect(service.getDraft).toHaveBeenCalledWith('draft-1', {
      userId: 'u1',
      role: 'STAFF',
      customerId: undefined,
    });
    expect(prisma.recipe.findFirst).not.toHaveBeenCalled();
    expect(detail).toMatchObject({
      source: 'CURRENT_DRAFT',
      id: 'draft-1',
      recipeId: null,
      version: null,
      name: '当前草稿鸭肉餐',
      status: 'DRAFT',
      applicableLifeStages: ['HIGH_ACTIVITY_ADULT'],
      description: '草稿详情描述',
      coverImageUrl: 'https://img.test/draft-cover.jpg',
      videoUrl: null,
      energyDensityKcalPerKg: 1420,
      nutritionStandard: 'FEDIAF_2025',
      seriesId: null,
      seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
      designSource: null,
      createdAt: DRAFT_CREATED_AT,
      updatedAt: DRAFT_UPDATED_AT,
    });
    expect(detail?.detailImages).toEqual(['https://img.test/draft-detail.jpg']);
    expect(detail?.nutritionDetailedData).toEqual({
      report: { totalEnergyKcal: 1000 },
    });
    expect(detail?.items).toHaveLength(2);
    expect(detail?.items[1]).toMatchObject({
      name: '南瓜',
      nutritionProfileName: '南瓜（蒸制）',
      ingredientType: 'FOOD',
      weightG: 100,
      category: 'VEGETABLE',
    });
    expect(detail?.productionSteps).toEqual([]);
  });

  it('其他 draftId 不可读：返回 null 且不调用 getDraft', async () => {
    const service = draftService();
    const adapter = createAdapter(service, {
      recipe: { findFirst: jest.fn() },
    });

    await expect(
      adapter.getRecipeDetail({ draftId: 'other-draft' }),
    ).resolves.toBeNull();
    expect(service.getDraft).not.toHaveBeenCalled();
  });
});
