import type { AgentDraftSnapshot } from 'src/application/recipe-designer/agent/agent-types';
import { DraftHealthTagPolicy } from 'src/application/recipe-designer/agent/draft-health-tag-policy';
import { RecipeDesignerAgentAdapter } from 'src/application/recipe-designer/agent/recipe-designer-agent.adapter';

function createAdapter(service: any, prisma: any = {}) {
  return new RecipeDesignerAgentAdapter(
    service,
    prisma,
    { userId: 'u1', role: 'STAFF' },
    'draft-1',
  );
}

/** 用快照事实构造健康标签策略，验证“读适配器 → 标签策略”的整条链。 */
function healthTagPolicy(snapshot: AgentDraftSnapshot) {
  return new DraftHealthTagPolicy({
    fatWetPercent: snapshot.nutritionSummary?.fatWetPercent ?? null,
    moisturePercent: snapshot.nutritionSummary?.moisturePercent ?? null,
    animalSpecies: snapshot.animalSpecies ?? [],
    unknownAnimalProtein: snapshot.unknownAnimalProtein,
  });
}

/** 一份由用例自己拼 items 的最小草稿（其余字段取不会触发额外查询的默认值）。 */
function draftWithItems(items: any[]) {
  return {
    id: 'draft-1',
    name: '测试草稿',
    contentRevision: 1,
    assessmentContentRevision: null,
    totalWeightG: 0,
    seriesId: null,
    fediafDogScenario: 'ADULT_MER_110',
    coverTitle: null,
    sellingPoint: null,
    description: null,
    targetHealthTags: [],
    calculatedNutrition: null,
    complianceStatus: [],
    productionStepsJson: [],
    items,
  };
}

/**
 * 一条草稿明细；`macros` 为每 100g 值（null 表示没有营养档案）。
 * `includeInAssessment` 不传按“参与评估”处理（service 的默认值）。
 */
function simpleItem(input: {
  id: string;
  name: string;
  weightG: number;
  /** 不传 = CFCT 缺失（七类落到 UNCLASSIFIED）。 */
  cfctClass?: string | null;
  category: string;
  type?: 'FOOD' | 'SUPPLEMENT';
  includeInAssessment?: boolean;
  unitDisplayLabel?: string | null;
  purchaseUnit?: string | null;
  macros?: { moisture?: number; crudeFat?: number } | null;
}) {
  return {
    id: input.id,
    ingredientId: `ing-${input.id}`,
    nutritionFoodId: `nf-${input.id}`,
    weightG: input.weightG,
    includeInAssessment: input.includeInAssessment ?? true,
    ratioPercent: 0,
    preparationMethod: null,
    preparationNote: null,
    nutrientTargetKey: null,
    nutrientTargetValue: null,
    sortOrder: 1,
    ingredient: {
      id: `ing-${input.id}`,
      name: input.name,
      type: input.type ?? 'FOOD',
      unitDisplayLabel: input.unitDisplayLabel ?? null,
      purchaseUnit: input.purchaseUnit ?? null,
      properties: input.cfctClass ? { cfct_class: input.cfctClass } : {},
    },
    nutritionFood: {
      id: `nf-${input.id}`,
      name: input.name,
      displayNameZh: input.name,
      category: input.category,
      status: 'VERIFIED',
      nutritionData: input.macros
        ? { meta: { rawBasisType: 'PER_100_G' }, macros: input.macros }
        : null,
    },
  };
}

/** 一条 `listIngredientOptions` 返回的原料行（唯一营养档案已验证）。 */
function ingredientOptionRow(input: { id: string; name: string }) {
  return {
    id: input.id,
    name: input.name,
    type: 'FOOD',
    defaultNutritionFoodId: `nf-${input.id}`,
    nutritionProfiles: [
      {
        nutritionFoodId: `nf-${input.id}`,
        name: input.name,
        category: 'OTHER',
        status: 'VERIFIED',
        isPrimary: true,
      },
    ],
  };
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
    type?: string;
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
        type: item.type ?? 'FOOD',
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

  it('animalSpecies 只从蛋白/内脏类识别，果蔬菌不误判', async () => {
    const baseItems = [
      simpleItem({
        id: 'duck',
        name: '鸭腿肉',
        weightG: 400,
        cfctClass: '禽肉类及制品',
        category: 'MEAT',
      }),
      // 名字里带「牛 / 羊 / 贝」，但都不是动物蛋白。
      simpleItem({
        id: 'avocado',
        name: '牛油果',
        weightG: 50,
        cfctClass: '水果类及制品',
        category: 'OTHER',
      }),
      simpleItem({
        id: 'morel',
        name: '羊肚菌',
        weightG: 30,
        cfctClass: '菌藻类',
        category: 'OTHER',
      }),
      simpleItem({
        id: 'pumpkin',
        name: '贝贝南瓜',
        weightG: 100,
        cfctClass: '蔬菜类及制品',
        category: 'VEGETABLE',
      }),
    ];
    const service = {
      getDraft: jest
        .fn()
        .mockResolvedValueOnce(draftWithItems(baseItems))
        .mockResolvedValueOnce(
          draftWithItems([
            ...baseItems,
            simpleItem({
              id: 'chicken',
              name: '鸡胸肉',
              weightG: 200,
              cfctClass: '禽肉类及制品',
              category: 'MEAT',
            }),
          ]),
        ),
      getDraftProductionSteps: jest
        .fn()
        .mockResolvedValue({ draftId: 'draft-1', productionSteps: [] }),
    };
    const adapter = createAdapter(service);

    const first = await adapter.getDraft('draft-1');
    expect(first.animalSpecies).toEqual(['鸭']);

    const second = await adapter.getDraft('draft-1');
    expect(second.animalSpecies).toEqual(['鸭', '鸡']);
  });

  it('UNCLASSIFIED 的鸡肉也计入物种，单一动物蛋白不再误开', async () => {
    // 鸡胸肉故意没有 CFCT 分类 → UNCLASSIFIED；只扫 PROTEIN/ORGAN 会漏掉它。
    const draft = draftWithItems([
      simpleItem({
        id: 'chicken',
        name: '鸡胸肉',
        weightG: 200,
        category: 'MEAT',
      }),
      simpleItem({
        id: 'duck',
        name: '鸭腿肉',
        weightG: 300,
        cfctClass: '禽肉类及制品',
        category: 'MEAT',
      }),
    ]);
    const adapter = createAdapter({
      getDraft: jest.fn().mockResolvedValue(draft),
      getDraftProductionSteps: jest
        .fn()
        .mockResolvedValue({ draftId: 'draft-1', productionSteps: [] }),
    });

    const snapshot = await adapter.getDraft('draft-1');

    expect(snapshot.animalSpecies).toEqual(['鸡', '鸭']);
    expect(snapshot.unknownAnimalProtein).toBe(false);
    expect(healthTagPolicy(snapshot).isAllowedTag('单一动物蛋白')).toBe(false);
  });

  it('识别不出物种的蛋白项让单一动物蛋白 fail closed', async () => {
    const draft = draftWithItems([
      simpleItem({
        id: 'duck',
        name: '鸭腿肉',
        weightG: 300,
        cfctClass: '禽肉类及制品',
        category: 'MEAT',
      }),
      // 是 PROTEIN，但名称不含任何物种词。
      simpleItem({
        id: 'mystery',
        name: '神秘肉',
        weightG: 100,
        cfctClass: '畜肉类及制品',
        category: 'MEAT',
      }),
    ]);
    const adapter = createAdapter({
      getDraft: jest.fn().mockResolvedValue(draft),
      getDraftProductionSteps: jest
        .fn()
        .mockResolvedValue({ draftId: 'draft-1', productionSteps: [] }),
    });

    const snapshot = await adapter.getDraft('draft-1');

    expect(snapshot.animalSpecies).toEqual(['鸭']);
    expect(snapshot.unknownAnimalProtein).toBe(true);
    expect(healthTagPolicy(snapshot).isAllowedTag('单一动物蛋白')).toBe(false);
  });

  it('物种词表覆盖驴/鸽/蛙/贝/蟹/虾/鹌鹑/鹿', async () => {
    const draft = draftWithItems([
      simpleItem({
        id: 'donkey',
        name: '驴肉',
        weightG: 100,
        cfctClass: '畜肉类及制品',
        category: 'MEAT',
      }),
      simpleItem({
        id: 'pigeon',
        name: '鸽胸肉',
        weightG: 100,
        cfctClass: '禽肉类及制品',
        category: 'MEAT',
      }),
      simpleItem({
        id: 'frog',
        name: '牛蛙',
        weightG: 100,
        cfctClass: '水产类',
        category: 'OTHER',
      }),
      simpleItem({
        id: 'scallop',
        name: '扇贝',
        weightG: 100,
        cfctClass: '水产类',
        category: 'OTHER',
      }),
      simpleItem({
        id: 'crab',
        name: '蟹肉',
        weightG: 100,
        cfctClass: '水产类',
        category: 'OTHER',
      }),
      simpleItem({
        id: 'shrimp',
        name: '虾仁',
        weightG: 100,
        cfctClass: '水产类',
        category: 'OTHER',
      }),
      simpleItem({
        id: 'quail',
        name: '鹌鹑肉',
        weightG: 100,
        cfctClass: '禽肉类及制品',
        category: 'MEAT',
      }),
      simpleItem({
        id: 'venison',
        name: '鹿肉',
        weightG: 100,
        cfctClass: '畜肉类及制品',
        category: 'MEAT',
      }),
    ]);
    const adapter = createAdapter({
      getDraft: jest.fn().mockResolvedValue(draft),
      getDraftProductionSteps: jest
        .fn()
        .mockResolvedValue({ draftId: 'draft-1', productionSteps: [] }),
    });

    const snapshot = await adapter.getDraft('draft-1');

    expect(snapshot.animalSpecies).toEqual([
      '驴',
      '鸽',
      '蛙',
      '贝',
      '蟹',
      '虾',
      '鹌鹑',
      '鹿',
    ]);
    expect(snapshot.unknownAnimalProtein).toBe(false);
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

  it('总重/占比/营养汇总只算参与评估的食品（排除项与补剂不进分母）', async () => {
    const draft = draftWithItems([
      simpleItem({
        id: 'included',
        name: '鸭腿肉',
        weightG: 100,
        cfctClass: '禽肉类及制品',
        category: 'MEAT',
        macros: { moisture: 50, crudeFat: 9.5 },
      }),
      // 30% 脂肪的排除项：旧口径分母 = 100 + 100 + 2 = 202g，
      // 而分子只有 9.5 + 2（补剂也进了分子）→ 11.5/202 ≈ 5.69%。
      simpleItem({
        id: 'excluded',
        name: '猪肥肉',
        weightG: 100,
        cfctClass: '畜肉类及制品',
        category: 'MEAT',
        includeInAssessment: false,
        macros: { moisture: 0, crudeFat: 30 },
      }),
      // 补剂按粒/片计数，克重不代表食物质量，也不进总重与分母。
      simpleItem({
        id: 'supplement',
        name: '鱼油软胶囊',
        weightG: 2,
        cfctClass: '油脂类',
        category: 'OIL',
        type: 'SUPPLEMENT',
        unitDisplayLabel: '粒',
        macros: { moisture: 0, crudeFat: 100 },
      }),
    ]);
    const adapter = createAdapter({
      getDraft: jest.fn().mockResolvedValue(draft),
      getDraftProductionSteps: jest
        .fn()
        .mockResolvedValue({ draftId: 'draft-1', productionSteps: [] }),
    });

    const snapshot = await adapter.getDraft('draft-1');

    // 三条都还在快照里，只有参与评估的那条进总重/占比。
    expect(snapshot.items).toHaveLength(3);
    expect(snapshot.nutritionSummary?.fatWetPercent).toBeCloseTo(9.5, 5);
    expect(snapshot.nutritionSummary?.moisturePercent).toBeCloseTo(50, 5);
    expect(snapshot.totalWeightG).toBe(100);
    expect(
      snapshot.items.find((item) => item.id === 'included')?.ratioPercent,
    ).toBe(100);
    expect(
      snapshot.items.find((item) => item.id === 'excluded')?.ratioPercent,
    ).toBeNull();
    expect(
      snapshot.items.find((item) => item.id === 'supplement')?.ratioPercent,
    ).toBeNull();
  });

  it('按克计量的补剂计入总重与营养摘要', async () => {
    const draft = draftWithItems([
      simpleItem({
        id: 'food',
        name: '鸭腿肉',
        weightG: 100,
        cfctClass: '禽肉类及制品',
        category: 'MEAT',
        macros: { moisture: 50, crudeFat: 5 },
      }),
      // 5g 鱼油按克计量：脂肪 5g，必须进分子和分母。
      simpleItem({
        id: 'oil',
        name: '鱼油',
        weightG: 5,
        cfctClass: '油脂类',
        category: 'OIL',
        type: 'SUPPLEMENT',
        unitDisplayLabel: 'g',
        macros: { moisture: 0, crudeFat: 100 },
      }),
    ]);
    const adapter = createAdapter({
      getDraft: jest.fn().mockResolvedValue(draft),
      getDraftProductionSteps: jest
        .fn()
        .mockResolvedValue({ draftId: 'draft-1', productionSteps: [] }),
    });

    const snapshot = await adapter.getDraft('draft-1');

    expect(snapshot.totalWeightG).toBe(105);
    expect(snapshot.nutritionSummary?.fatWetPercent).toBeCloseTo(
      (10 / 105) * 100,
      5,
    );
    expect(snapshot.nutritionSummary?.moisturePercent).toBeCloseTo(
      (50 / 105) * 100,
      5,
    );
    expect(
      snapshot.items.find((item) => item.id === 'oil')?.ratioPercent,
    ).toBeCloseTo(4.8, 5);
    // 水分 47.6% → 低脂上限 7%；脂肪 9.52% 超限。
    expect(healthTagPolicy(snapshot).isAllowedTag('低脂')).toBe(false);
  });

  it('按粒计量的补剂不计入总重与占比', async () => {
    const draft = draftWithItems([
      simpleItem({
        id: 'food',
        name: '鸭腿肉',
        weightG: 100,
        cfctClass: '禽肉类及制品',
        category: 'MEAT',
        macros: { moisture: 50, crudeFat: 5 },
      }),
      simpleItem({
        id: 'capsule',
        name: '鱼油软胶囊',
        weightG: 2,
        cfctClass: '油脂类',
        category: 'OIL',
        type: 'SUPPLEMENT',
        // unitDisplayLabel 缺失时回退到 purchaseUnit。
        purchaseUnit: '粒',
        macros: { moisture: 0, crudeFat: 100 },
      }),
    ]);
    const adapter = createAdapter({
      getDraft: jest.fn().mockResolvedValue(draft),
      getDraftProductionSteps: jest
        .fn()
        .mockResolvedValue({ draftId: 'draft-1', productionSteps: [] }),
    });

    const snapshot = await adapter.getDraft('draft-1');

    expect(snapshot.totalWeightG).toBe(100);
    expect(snapshot.nutritionSummary?.fatWetPercent).toBeCloseTo(5, 5);
    expect(snapshot.nutritionSummary?.moisturePercent).toBeCloseTo(50, 5);
    expect(
      snapshot.items.find((item) => item.id === 'capsule')?.ratioPercent,
    ).toBeNull();
    expect(healthTagPolicy(snapshot).isAllowedTag('低脂')).toBe(true);
  });

  it('补剂单位未知时营养摘要 fail closed', async () => {
    const draft = draftWithItems([
      simpleItem({
        id: 'food',
        name: '鸭腿肉',
        weightG: 100,
        cfctClass: '禽肉类及制品',
        category: 'MEAT',
        macros: { moisture: 50, crudeFat: 5 },
      }),
      // 没有 unitDisplayLabel / purchaseUnit：不能当成 0g 脂肪放过去。
      simpleItem({
        id: 'unknown-unit',
        name: '鱼油',
        weightG: 5,
        cfctClass: '油脂类',
        category: 'OIL',
        type: 'SUPPLEMENT',
        macros: { moisture: 0, crudeFat: 100 },
      }),
    ]);
    const adapter = createAdapter({
      getDraft: jest.fn().mockResolvedValue(draft),
      getDraftProductionSteps: jest
        .fn()
        .mockResolvedValue({ draftId: 'draft-1', productionSteps: [] }),
    });

    const snapshot = await adapter.getDraft('draft-1');

    expect(snapshot.nutritionSummary).toEqual({
      fatWetPercent: null,
      moisturePercent: null,
    });
    expect(
      snapshot.items.find((item) => item.id === 'unknown-unit')?.ratioPercent,
    ).toBeNull();
    expect(healthTagPolicy(snapshot).isAllowedTag('低脂')).toBe(false);
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
      nutritionFood: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'nf1',
            nutritionData: {
              meta: { rawBasisType: 'PER_100_G' },
              macros: { crudeProtein: 18, crudeFat: 5 },
              minerals: { calcium: 20, phosphorus: 180 },
            },
          },
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
    expect(result[0].keyNutrients).toEqual({
      proteinPer100g: 18,
      fatPer100g: 5,
      calciumMgPer100g: 20,
      phosphorusMgPer100g: 180,
    });
  });

  it('searchIngredients 翻完所有页，第 3 页的菌类也能找到', async () => {
    // 食材库约 118 条 FOOD：50 + 50 + 18，目标菌类故意放在第 3 页。
    const pageDescriptors = [
      Array.from({ length: 50 }, (_, i) => ({
        id: `g${i + 1}`,
        name: `谷类${i + 1}`,
        cfctClass: '谷类及制品',
      })),
      Array.from({ length: 50 }, (_, i) => ({
        id: `g${i + 51}`,
        name: `谷类${i + 51}`,
        cfctClass: '谷类及制品',
      })),
      [
        ...Array.from({ length: 17 }, (_, i) => ({
          id: `g${i + 101}`,
          name: `谷类${i + 101}`,
          cfctClass: '谷类及制品',
        })),
        { id: 'g118', name: '羊肚菌', cfctClass: '菌藻类' },
      ],
    ];
    const service = {
      listIngredientOptions: jest.fn((args: any) => {
        // 旧实现不传 page，这里按第 1 页处理，正好暴露“只看第一页”的截断。
        const page = args?.page ?? 1;
        const rows = pageDescriptors[page - 1] ?? [];
        return Promise.resolve({
          data: rows.map((item) =>
            ingredientOptionRow({ id: item.id, name: item.name }),
          ),
          hasMore: page < pageDescriptors.length,
          page,
          pageSize: 50,
        });
      }),
    };
    const cfctClassById = new Map(
      pageDescriptors.flat().map((item) => [item.id, item.cfctClass] as const),
    );
    const prisma = {
      ingredient: {
        findMany: jest.fn(async (args: any) => {
          const ids: string[] = args?.where?.id?.in ?? [];
          return ids.map((id) => ({
            id,
            properties: { cfct_class: cfctClassById.get(id) ?? null },
          }));
        }),
      },
      nutritionFood: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const adapter = createAdapter(service, prisma);

    const result = await adapter.searchIngredients({ category: 'MUSHROOM' });

    expect(result.map((candidate) => candidate.ingredientId)).toEqual(['g118']);
    expect(result[0].name).toBe('羊肚菌');
    expect(result[0].cfctClass).toBe('菌藻类');

    const calls = service.listIngredientOptions.mock.calls.map(
      ([args]: [any]) => args,
    );
    expect(calls.map((args) => args.page)).toEqual([1, 2, 3]);
    expect(calls.every((args) => args.pageSize === 50)).toBe(true);
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

  it('已发布食谱里的补剂归 SUPPLEMENT，不制造 PROTEIN 交集', async () => {
    // 补剂故意给一个“肉类”CFCT：只有读到 ingredient.type 才会归 SUPPLEMENT。
    const publishedRow = catalogRecipe({
      recipeId: 'r-supplement',
      name: '补剂餐',
      items: [
        {
          ingredientId: 'i-supplement',
          exampleWeight: 2,
          name: '鱼油软胶囊',
          cfctClass: '畜肉类及制品',
          category: 'OTHER',
          type: 'SUPPLEMENT',
        },
      ],
    });
    // 模拟 Prisma 的字段投影：select 没请求的字段，返回行里也不会有。
    const prisma = {
      recipe: {
        findMany: jest.fn(async (args: any) => {
          const selectsIngredientType =
            args?.select?.items?.select?.ingredient?.select?.type === true;
          return [
            {
              ...publishedRow,
              items: publishedRow.items.map((item) => ({
                ...item,
                ingredient: selectsIngredientType
                  ? item.ingredient
                  : {
                      name: item.ingredient.name,
                      properties: item.ingredient.properties,
                    },
              })),
            },
          ];
        }),
      },
    };
    const adapter = createAdapter(
      { getDraft: jest.fn().mockResolvedValue(serviceDraft()) },
      prisma,
    );

    const usage = await adapter.getCatalogUsage({});

    expect(usage.totalPublishedRecipes).toBe(1);
    // 草稿里有 PROTEIN；补剂若被误判成 PROTEIN 就会因分类交集被算进来。
    expect(usage.recipes).toEqual([]);
    expect(usage.mainProteinCount).toBe(0);
  });
});
