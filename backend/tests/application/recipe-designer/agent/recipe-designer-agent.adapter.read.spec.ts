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

const PROFILE_VERIFIED_AT = new Date('2026-10-01T08:00:00.000Z');
const PROFILE_CREATED_AT = new Date('2026-09-01T08:00:00.000Z');
const PROFILE_UPDATED_AT = new Date('2026-10-02T08:00:00.000Z');
const INGREDIENT_CREATED_AT = new Date('2026-08-01T08:00:00.000Z');
const INGREDIENT_UPDATED_AT = new Date('2026-10-03T08:00:00.000Z');

const SWEET_POTATO_RAW_NUTRITION = {
  meta: { rawBasisType: 'PER_100_G' },
  macros: { moisture: 75, crudeProtein: 1.6, crudeFat: 0.2 },
  minerals: { calcium: 30, phosphorus: 40 },
};
const SWEET_POTATO_COOKED_NUTRITION = {
  meta: { rawBasisType: 'PER_100_G' },
  macros: { moisture: 80, crudeProtein: 1.4, crudeFat: 0.1 },
  minerals: { calcium: 25, phosphorus: 35 },
};

/** 红薯的两个档案：生（主） + 水煮（次），模拟真实生产数据。 */
function sweetPotatoOption() {
  return {
    id: 'ing-sweet',
    name: '红薯',
    type: 'FOOD',
    defaultNutritionFoodId: 'nf-raw',
    nutritionProfiles: [
      {
        mappingId: 'map-raw',
        nutritionFoodId: 'nf-raw',
        name: '甘薯（生，未加工）',
        nameEn: 'Sweet potato, raw',
        displayNameZh: '甘薯（生，未加工）',
        category: 'OTHER',
        dataSource: 'CFCT',
        status: 'VERIFIED',
        preparationState: 'raw',
        preparationStateLabel: '生',
        yieldRate: 1,
        isPrimary: true,
        notes: '主档案',
      },
      {
        mappingId: 'map-cooked',
        nutritionFoodId: 'nf-cooked',
        name: '甘薯（水煮，去皮）',
        nameEn: 'Sweet potato, boiled',
        displayNameZh: '甘薯（水煮，去皮）',
        category: 'OTHER',
        dataSource: 'CFCT',
        status: 'VERIFIED',
        preparationState: 'boiled',
        preparationStateLabel: '水煮',
        yieldRate: 0.85,
        isPrimary: false,
        notes: '水煮后',
      },
    ],
  };
}

/** Prisma `ingredient.findFirst` 的详情行：全字段 + 同原料的两个档案。 */
function sweetPotatoIngredientRow() {
  return {
    id: 'ing-sweet',
    name: '红薯',
    type: 'FOOD',
    procurementStrategy: 'DAILY_PURCHASE',
    diyEnabled: true,
    procurementEnabled: true,
    brand: '田间',
    productModel: 'SP-1',
    purchaseChannel: '批发市场',
    notes: '内部备注：优先本地采购',
    baseUnit: 'G',
    unitDisplayLabel: 'g',
    nutritionProfile: { legacy: 'raw-json' },
    purchaseUnit: 'kg',
    purchaseToBaseRatio: 1000,
    currentPricePerPurchaseUnit: 8.5,
    effectivePricePerPurchaseUnit: 7.9,
    weightG: 500,
    maxCapacityG: 2000,
    safetyStock: 10,
    reorderPoint: 20,
    targetStock: 50,
    physicalForm: 'POWDER',
    isOilBased: false,
    supplementRetailEnabled: false,
    shelfLifeMonths: 12,
    storageCondition: '阴凉干燥',
    openedShelfLifeDays: 30,
    properties: { cfct_class: '薯类及制品', cfct_code: '05-1-101' },
    createdAt: INGREDIENT_CREATED_AT,
    updatedAt: INGREDIENT_UPDATED_AT,
    tags: [
      {
        tag: {
          id: 'tag-1',
          name: '高纤',
          description: '膳食纤维较高',
          parentId: null,
          sort: 1,
          color: '#4caf50',
        },
      },
    ],
    recommendedProducts: [
      {
        id: 'rp-1',
        name: '红薯粉',
        brand: '田间',
        productModel: 'SP-POWDER',
        purchaseChannel: '批发市场',
        purchaseLink: { url: 'https://example.test/sweet-potato' },
        imageUrl: 'https://example.test/sweet-potato.png',
        activeNutrients: ['膳食纤维'],
        displayUnit: '袋',
        isActive: true,
        sortOrder: 1,
        createdAt: INGREDIENT_CREATED_AT,
        updatedAt: INGREDIENT_UPDATED_AT,
      },
    ],
    allergenTags: [],
    nutritionFoodMappings: [
      {
        id: 'map-raw',
        nutritionFoodId: 'nf-raw',
        yieldRate: 1,
        isPrimary: true,
        notes: '主档案',
        createdAt: PROFILE_CREATED_AT,
        updatedAt: PROFILE_UPDATED_AT,
        nutritionFood: {
          id: 'nf-raw',
          name: 'sweet_potato_raw',
          nameEn: 'Sweet potato, raw',
          displayNameZh: '甘薯（生，未加工）',
          category: 'OTHER',
          dataSource: 'CFCT',
          externalId: '05-1-101',
          version: 2,
          status: 'VERIFIED',
          preparationState: 'raw',
          preparationStateLabel: '生',
          ediblePortionLabel: '去皮',
          processingLabel: '未加工',
          nutritionData: SWEET_POTATO_RAW_NUTRITION,
          defaultSupplementTargets: null,
          notes: '生档案备注',
          verifiedBy: 'u-verifier',
          verifiedAt: PROFILE_VERIFIED_AT,
          createdAt: PROFILE_CREATED_AT,
          updatedAt: PROFILE_UPDATED_AT,
        },
      },
      {
        id: 'map-cooked',
        nutritionFoodId: 'nf-cooked',
        yieldRate: 0.85,
        isPrimary: false,
        notes: '水煮后',
        createdAt: PROFILE_CREATED_AT,
        updatedAt: PROFILE_UPDATED_AT,
        nutritionFood: {
          id: 'nf-cooked',
          name: 'sweet_potato_boiled',
          nameEn: 'Sweet potato, boiled',
          displayNameZh: '甘薯（水煮，去皮）',
          category: 'OTHER',
          dataSource: 'CFCT',
          externalId: '05-1-102',
          version: 1,
          status: 'VERIFIED',
          preparationState: 'boiled',
          preparationStateLabel: '水煮',
          ediblePortionLabel: '去皮',
          processingLabel: '水煮',
          nutritionData: SWEET_POTATO_COOKED_NUTRITION,
          defaultSupplementTargets: null,
          notes: '水煮档案备注',
          verifiedBy: 'u-verifier',
          verifiedAt: PROFILE_VERIFIED_AT,
          createdAt: PROFILE_CREATED_AT,
          updatedAt: PROFILE_UPDATED_AT,
        },
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
    series: {
      id: 'series-1',
      name: '鸭肉南瓜餐',
      referenceDogId: null,
      designMode: 'CATALOG',
      orderId: null,
      orderQuantity: null,
    },
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
    // 产品线设计：designMode=CATALOG，没有订单上下文。
    expect(draft.designMode).toBe('CATALOG');
    expect(draft.orderId).toBeNull();
    expect(draft.orderQuantity).toBeNull();
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

  it('getDraft 把 ORDER 设计的订单上下文映射进快照', async () => {
    const draft: any = serviceDraft();
    draft.series = {
      id: 'series-1',
      name: '订单定制餐',
      referenceDogId: 'dog-1',
      designMode: 'ORDER',
      orderId: 'order-2026-001',
      orderQuantity: 3,
    };
    const service = {
      getDraft: jest.fn().mockResolvedValue(draft),
      getDraftProductionSteps: jest
        .fn()
        .mockResolvedValue({ draftId: 'draft-1', productionSteps: [] }),
    };
    const prisma = {
      recipeSeries: { findUnique: jest.fn().mockResolvedValue(null) },
    };

    const snapshot = await createAdapter(service, prisma).getDraft('draft-1');

    expect(snapshot.designMode).toBe('ORDER');
    expect(snapshot.orderId).toBe('order-2026-001');
    expect(snapshot.orderQuantity).toBe(3);
  });

  it('getDraft 在没有系列时把设计上下文设为 null', async () => {
    const draft: any = serviceDraft();
    draft.seriesId = null;
    draft.series = null;
    const service = {
      getDraft: jest.fn().mockResolvedValue(draft),
      getDraftProductionSteps: jest
        .fn()
        .mockResolvedValue({ draftId: 'draft-1', productionSteps: [] }),
    };

    const adapter = createAdapter(service, {});
    const snapshot = await adapter.getDraft('draft-1');

    expect(snapshot.designMode).toBeNull();
    expect(snapshot.orderId).toBeNull();
    expect(snapshot.orderQuantity).toBeNull();
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
      unit: null,
      basis: null,
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

  it('searchIngredients 返回所有有档案的原料，verified 跟随默认档案，并按七类过滤', async () => {
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

    expect(result.map((c) => c.ingredientId)).toEqual(['i1', 'i2']);
    expect(result[1].verified).toBe(false);
    expect(result[1].nutritionProfiles).toHaveLength(1);
    expect(result[0].cfctClass).toBe('菌藻类');
    expect(result[0].keyNutrients).toEqual({
      proteinPer100g: 18,
      fatPer100g: 5,
      calciumMgPer100g: 20,
      phosphorusMgPer100g: 180,
    });
  });

  it('searchIngredients 按 nutrientKey 搜索时把匹配量带回给模型', async () => {
    const service = {
      getDraft: jest.fn().mockResolvedValue({
        fediafDogScenario: 'ADULT_MER_110',
      }),
      listIngredientOptions: jest.fn().mockResolvedValue({
        data: [
          {
            id: 'i-zinc',
            name: '牛肝',
            type: 'FOOD',
            defaultNutritionFoodId: 'nf-zinc',
            nutrientMatch: {
              nutrientKey: 'zinc',
              label: '锌',
              amount: 8.2,
              unit: 'mg',
              basis: 'PER_100_G',
              basisLabel: '每100g',
              displayText: '8.2 mg / 100g',
              score: 8.2,
            },
            nutritionProfiles: [
              {
                nutritionFoodId: 'nf-zinc',
                name: '牛肝',
                category: 'OTHER',
                status: 'VERIFIED',
                isPrimary: true,
              },
            ],
          },
        ],
      }),
    };
    const prisma = {
      ingredient: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 'i-zinc', properties: { cfct_class: '畜肉类及制品' } },
          ]),
      },
      nutritionFood: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const adapter = createAdapter(service, prisma);

    const result = await adapter.searchIngredients({
      nutrientKey: 'zinc',
      type: 'FOOD',
    });

    expect(service.getDraft).toHaveBeenCalled();
    expect(service.listIngredientOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        nutrientKey: 'zinc',
        scenario: 'ADULT_MER_110',
        type: 'FOOD',
      }),
    );
    expect(result[0].nutrientMatch).toMatchObject({
      nutrientKey: 'zinc',
      amount: 8.2,
      unit: 'mg',
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

  it('searchIngredients 返回红薯的生 + 水煮全部营养档案，不只默认档案', async () => {
    const service = {
      listIngredientOptions: jest.fn().mockResolvedValue({
        data: [sweetPotatoOption()],
        hasMore: false,
      }),
    };
    const prisma = {
      ingredient: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'ing-sweet',
            properties: { cfct_class: '薯类及制品' },
          },
        ]),
      },
      nutritionFood: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 'nf-raw', nutritionData: SWEET_POTATO_RAW_NUTRITION },
          ]),
      },
    };
    const adapter = createAdapter(service, prisma);

    const result = await adapter.searchIngredients({
      search: '红薯',
      limit: 10,
    });

    expect(result).toHaveLength(1);
    const candidate = result[0] as any;
    expect(candidate.nutritionFoodId).toBe('nf-raw');
    expect(candidate.nutritionProfileName).toBe('甘薯（生，未加工）');
    expect(candidate.verified).toBe(true);
    expect(candidate.nutritionProfiles).toEqual([
      {
        nutritionFoodId: 'nf-raw',
        name: '甘薯（生，未加工）',
        displayNameZh: '甘薯（生，未加工）',
        status: 'VERIFIED',
        category: 'OTHER',
        dataSource: 'CFCT',
        isPrimary: true,
        preparationState: 'raw',
        preparationStateLabel: '生',
        verified: true,
      },
      {
        nutritionFoodId: 'nf-cooked',
        name: '甘薯（水煮，去皮）',
        displayNameZh: '甘薯（水煮，去皮）',
        status: 'VERIFIED',
        category: 'OTHER',
        dataSource: 'CFCT',
        isPrimary: false,
        preparationState: 'boiled',
        preparationStateLabel: '水煮',
        verified: true,
      },
    ]);
    expect(candidate.keyNutrients).toMatchObject({
      proteinPer100g: 1.6,
      fatPer100g: 0.2,
      calciumMgPer100g: 30,
      phosphorusMgPer100g: 40,
    });
  });

  it('searchIngredients 默认档案未验证但有其它档案时仍返回，verified 跟随默认档案', async () => {
    const option = sweetPotatoOption();
    option.nutritionProfiles[0].status = 'PENDING';
    const service = {
      listIngredientOptions: jest.fn().mockResolvedValue({
        data: [option],
        hasMore: false,
      }),
    };
    const prisma = {
      ingredient: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'ing-sweet', properties: {} }]),
      },
      nutritionFood: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const result = await createAdapter(service, prisma).searchIngredients({
      search: '红薯',
    });

    expect(result).toHaveLength(1);
    const candidate = result[0] as any;
    expect(candidate.verified).toBe(false);
    expect(candidate.nutritionProfiles).toHaveLength(2);
    expect(candidate.nutritionProfiles[1]).toMatchObject({
      nutritionFoodId: 'nf-cooked',
      status: 'VERIFIED',
      verified: true,
    });
  });

  it('getIngredient 按 ingredientId 返回全部档案和全部原料只读字段', async () => {
    const prisma = {
      ingredient: {
        findFirst: jest.fn().mockResolvedValue(sweetPotatoIngredientRow()),
      },
    };
    const adapter = createAdapter({}, prisma);

    const detail = (await adapter.getIngredient({
      ingredientId: 'ing-sweet',
    })) as any;

    expect(prisma.ingredient.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ing-sweet' },
        select: expect.objectContaining({
          brand: true,
          productModel: true,
          purchaseChannel: true,
          notes: true,
          procurementStrategy: true,
          diyEnabled: true,
          procurementEnabled: true,
          nutritionProfile: true,
          purchaseToBaseRatio: true,
          currentPricePerPurchaseUnit: true,
          effectivePricePerPurchaseUnit: true,
          weightG: true,
          maxCapacityG: true,
          safetyStock: true,
          reorderPoint: true,
          targetStock: true,
          physicalForm: true,
          isOilBased: true,
          supplementRetailEnabled: true,
          shelfLifeMonths: true,
          storageCondition: true,
          openedShelfLifeDays: true,
          properties: true,
          tags: expect.any(Object),
          recommendedProducts: expect.any(Object),
          createdAt: true,
          updatedAt: true,
        }),
      }),
    );

    expect(detail).toMatchObject({
      ingredientId: 'ing-sweet',
      nutritionFoodId: 'nf-raw',
      name: '红薯',
      nutritionProfileName: '甘薯（生，未加工）',
      type: 'FOOD',
      baseUnit: 'G',
      unitDisplayLabel: 'g',
      cfctClass: '薯类及制品',
      nutritionCategory: 'OTHER',
      category: 'CARB',
      verified: true,
      brand: '田间',
      productModel: 'SP-1',
      purchaseChannel: '批发市场',
      notes: '内部备注：优先本地采购',
      procurementStrategy: 'DAILY_PURCHASE',
      diyEnabled: true,
      procurementEnabled: true,
      nutritionProfile: { legacy: 'raw-json' },
      purchaseToBaseRatio: 1000,
      currentPricePerPurchaseUnit: 8.5,
      effectivePricePerPurchaseUnit: 7.9,
      pricePerPurchaseUnit: 8.5,
      purchaseUnit: 'kg',
      weightG: 500,
      maxCapacityG: 2000,
      safetyStock: 10,
      reorderPoint: 20,
      targetStock: 50,
      physicalForm: 'POWDER',
      isOilBased: false,
      supplementRetailEnabled: false,
      shelfLifeMonths: 12,
      storageCondition: '阴凉干燥',
      openedShelfLifeDays: 30,
      properties: { cfct_class: '薯类及制品', cfct_code: '05-1-101' },
      tags: [
        {
          id: 'tag-1',
          name: '高纤',
          description: '膳食纤维较高',
          parentId: null,
          sort: 1,
          color: '#4caf50',
        },
      ],
      recommendedProducts: [
        {
          id: 'rp-1',
          name: '红薯粉',
          brand: '田间',
          productModel: 'SP-POWDER',
          purchaseChannel: '批发市场',
          purchaseLink: { url: 'https://example.test/sweet-potato' },
          imageUrl: 'https://example.test/sweet-potato.png',
          activeNutrients: ['膳食纤维'],
          displayUnit: '袋',
          isActive: true,
          sortOrder: 1,
          createdAt: INGREDIENT_CREATED_AT,
          updatedAt: INGREDIENT_UPDATED_AT,
        },
      ],
      createdAt: INGREDIENT_CREATED_AT,
      updatedAt: INGREDIENT_UPDATED_AT,
    });
    expect(detail.nutritionProfiles).toHaveLength(2);
    expect(detail.nutritionProfiles[0]).toEqual({
      nutritionFoodId: 'nf-raw',
      mappingId: 'map-raw',
      name: '甘薯（生，未加工）',
      displayNameZh: '甘薯（生，未加工）',
      status: 'VERIFIED',
      category: 'OTHER',
      dataSource: 'CFCT',
      externalId: '05-1-101',
      version: 2,
      preparationState: 'raw',
      preparationStateLabel: '生',
      ediblePortionLabel: '去皮',
      processingLabel: '未加工',
      nutritionData: SWEET_POTATO_RAW_NUTRITION,
      defaultSupplementTargets: null,
      notes: '生档案备注',
      verifiedBy: 'u-verifier',
      verifiedAt: PROFILE_VERIFIED_AT,
      createdAt: PROFILE_CREATED_AT,
      updatedAt: PROFILE_UPDATED_AT,
      isPrimary: true,
      verified: true,
      yieldRate: 1,
      mappingNotes: '主档案',
    });
    expect(detail.nutritionProfiles[1]).toMatchObject({
      nutritionFoodId: 'nf-cooked',
      mappingId: 'map-cooked',
      name: '甘薯（水煮，去皮）',
      displayNameZh: '甘薯（水煮，去皮）',
      preparationState: 'boiled',
      preparationStateLabel: '水煮',
      isPrimary: false,
      yieldRate: 0.85,
      mappingNotes: '水煮后',
    });
    expect(detail.nutritionSummary).toEqual({
      moisture: 75,
      crudeProtein: 1.6,
      crudeFat: 0.2,
    });
  });

  it('getIngredient 按水煮 nutritionFoodId 选中熟档案，同时返回生档案', async () => {
    const prisma = {
      ingredient: {
        findFirst: jest.fn().mockResolvedValue(sweetPotatoIngredientRow()),
      },
    };
    const adapter = createAdapter({}, prisma);

    const detail = (await adapter.getIngredient({
      nutritionFoodId: 'nf-cooked',
    })) as any;

    expect(prisma.ingredient.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          nutritionFoodMappings: { some: { nutritionFoodId: 'nf-cooked' } },
        },
      }),
    );
    expect(detail.nutritionFoodId).toBe('nf-cooked');
    expect(detail.nutritionProfileName).toBe('甘薯（水煮，去皮）');
    expect(detail.verified).toBe(true);
    expect(detail.nutritionProfiles.map((p: any) => p.nutritionFoodId)).toEqual(
      ['nf-raw', 'nf-cooked'],
    );
    expect(detail.nutritionProfiles.map((p: any) => p.isPrimary)).toEqual([
      true,
      false,
    ]);
    expect(detail.nutritionSummary).toEqual({
      moisture: 80,
      crudeProtein: 1.4,
      crudeFat: 0.1,
    });
  });

  function duckIngredientRow() {
    return {
      id: 'i1',
      name: '鸭腿肉',
      type: 'FOOD',
      baseUnit: 'G',
      properties: { cfct_class: '禽肉类及制品' },
      currentPricePerPurchaseUnit: 30,
      purchaseUnit: 'kg',
      tags: [],
      recommendedProducts: [],
      allergenTags: [{ allergenTag: { name: '鸭肉' } }],
      nutritionFoodMappings: [
        {
          id: 'map1',
          nutritionFoodId: 'nf1',
          yieldRate: 1,
          isPrimary: true,
          notes: null,
          nutritionFood: {
            id: 'nf1',
            name: '鸭腿肉',
            displayNameZh: '鸭腿肉',
            status: 'VERIFIED',
            category: 'MEAT',
            dataSource: 'CFCT',
            nutritionData: { macros: { crudeProtein: 18, crudeFat: 6 } },
          },
        },
      ],
    };
  }

  it('getIngredient 找不到返回 null，找到时带价格/过敏原', async () => {
    const prisma = {
      ingredient: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(duckIngredientRow()),
      },
    };
    const adapter = createAdapter({}, prisma);

    expect(
      await adapter.getIngredient({ nutritionFoodId: 'missing' }),
    ).toBeNull();
    const detail = await adapter.getIngredient({ nutritionFoodId: 'nf1' });

    expect(detail?.category).toBe('PROTEIN');
    expect(detail?.baseUnit).toBe('G');
    expect(detail?.allergenNames).toEqual(['鸭肉']);
    expect(detail?.pricePerPurchaseUnit).toBe(30);
    // 食物详情只给宏量，矿物质/维生素交给评估报告算总账。
    expect(detail?.nutritionSummary).toEqual({ crudeProtein: 18, crudeFat: 6 });
    expect(detail?.nutritionBasis).toBeUndefined();
  });

  it('getIngredient 补剂返回矿物质/维生素明细和计量基准', async () => {
    const row = duckIngredientRow();
    const prisma = {
      ingredient: {
        findFirst: jest.fn().mockResolvedValue({
          ...row,
          id: 'i2',
          name: '碳酸钙粉',
          type: 'SUPPLEMENT',
          baseUnit: 'PCS',
          properties: {},
          currentPricePerPurchaseUnit: 120,
          purchaseUnit: '瓶',
          unitDisplayLabel: '粒',
          allergenTags: [],
          nutritionFoodMappings: [
            {
              id: 'map2',
              nutritionFoodId: 'nf2',
              yieldRate: 1,
              isPrimary: true,
              notes: null,
              nutritionFood: {
                id: 'nf2',
                name: '碳酸钙粉',
                displayNameZh: '碳酸钙粉',
                status: 'VERIFIED',
                category: 'MINERAL',
                dataSource: 'MANUAL',
                nutritionData: {
                  meta: { rawBasisType: 'PER_SERVING', servingWeightG: 1.2 },
                  macros: { moisture: 1 },
                  minerals: { calcium: 50000 },
                  vitamins: { vitaminD: 10000 },
                },
              },
            },
          ],
        }),
      },
    };
    const adapter = createAdapter({}, prisma);

    const detail = await adapter.getIngredient({ nutritionFoodId: 'nf2' });

    expect(detail?.type).toBe('SUPPLEMENT');
    expect(detail?.baseUnit).toBe('PCS');
    expect(detail?.nutritionSummary.moisture).toBe(1);
    expect(detail?.nutritionSummary['minerals.calcium']).toBe(50000);
    expect(detail?.nutritionSummary['vitamins.vitaminD']).toBe(10000);
    expect(detail?.nutritionBasis).toEqual({
      basisType: 'PER_SERVING',
      servingWeightG: 1.2,
      usageUnit: '粒',
    });
  });

  it('getIngredient 没有采购原料映射时返回 null', async () => {
    const prisma = {
      ingredient: {
        findFirst: jest.fn().mockResolvedValue({
          ...duckIngredientRow(),
          nutritionFoodMappings: [],
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
