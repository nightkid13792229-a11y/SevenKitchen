import { IngredientCreationCandidateService } from '../../../src/application/ingredient-creation/ingredient-creation-candidate.service';
import { IngredientCreationCheckService } from '../../../src/application/ingredient-creation/ingredient-creation-check.service';
import { IngredientCreationDraftService } from '../../../src/application/ingredient-creation/ingredient-creation-draft.service';
import { IngredientCreationToolsService } from '../../../src/application/ingredient-creation/ingredient-creation-tools.service';
import type { PrismaService } from '../../../src/infrastructure/prisma.service';

const DRAFT_ID = 'draft-1';
const RUN_ID = 'run-1';

interface DraftFixture {
  id: string;
  name: string;
  type: 'FOOD';
  step: string;
  payload: Record<string, unknown>;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

function createTools(draftPayload: Record<string, unknown> = {}) {
  const draft: DraftFixture = {
    id: DRAFT_ID,
    name: '鸡肝',
    type: 'FOOD',
    step: 'INGREDIENT',
    payload: draftPayload,
    createdBy: 'admin-1',
    createdAt: new Date('2026-10-24T00:00:00.000Z'),
    updatedAt: new Date('2026-10-24T00:00:00.000Z'),
  };

  const draftService = {
    get: jest.fn(async () => draft),
    patch: jest.fn(async (_id: string, _step: string, payload: unknown) => ({
      ...draft,
      payload: { ...draft.payload, ...(payload as Record<string, unknown>) },
    })),
  };

  const tools = new IngredientCreationToolsService(
    {
      findCandidates: jest.fn(),
    } as unknown as IngredientCreationCandidateService,
    draftService as unknown as IngredientCreationDraftService,
    { runCheck: jest.fn() } as unknown as IngredientCreationCheckService,
    {
      nutritionSourceRecord: { findUnique: jest.fn() },
    } as unknown as PrismaService,
    {
      classifyNames: jest.fn(async (input: any) => ({
        results: input.items.map((item: { id: string }) => ({
          id: item.id,
          state: 'UNKNOWN',
          method: 'NONE',
          cutLabel: null,
          cutGroup: null,
          evidence: null,
          confidence: null,
        })),
        counts: {
          byState: { RAW: 0, COOKED: 0, UNKNOWN: input.items.length },
          byMethod: { BOILED: 0, STEAMED: 0, GRILLED: 0, FRIED: 0, OTHER: 0, NONE: input.items.length },
          byCutGroup: {},
        },
      })),
    } as never,
  );

  return { tools, draftService };
}

async function executeIngredient(
  tools: IngredientCreationToolsService,
  args: Record<string, unknown>,
) {
  const execution = await tools.execute({
    runId: RUN_ID,
    draftId: DRAFT_ID,
    name: 'writeIngredient',
    args: { fields: args },
  });

  return {
    ...execution,
    body: JSON.parse(execution.content) as {
      ok: boolean;
      error?: string;
      applied?: string[];
      skipped?: Array<{ field: string; reason: string }>;
      ingredient?: Record<string, unknown>;
    },
  };
}

describe('IngredientCreationToolsService · writeIngredient 原料卡', () => {
  it('工具定义存在：七个人工审核字段、类别与基准单位是枚举', () => {
    const { tools } = createTools();

    const definition = tools
      .getDefinitions()
      .find((tool) => tool.function.name === 'writeIngredient');

    expect(definition).toBeDefined();
    const properties = (
      definition?.function.parameters.properties as Record<
        string,
        { properties?: Record<string, { enum?: unknown[] }> }
      >
    ).fields?.properties as Record<string, { enum?: unknown[] }>;
    expect(Object.keys(properties)).toEqual(
      expect.arrayContaining([
        'name',
        'nameEn',
        'category',
        'baseUnit',
        'unitDisplayLabel',
        'cfctClass',
        'edibleYieldPercent',
      ]),
    );
    expect(properties.category?.enum).toEqual([
      'MEAT_ORGAN',
      'STARCHY_VEGETABLE',
      'OTHER',
    ]);
    expect(properties.baseUnit?.enum).toEqual(['G', 'ML', 'PCS']);
    expect(definition?.function.description).toContain('人工');
  });

  it('全部合法：一次 patch 写入原料卡，可食部 95% 存成 0.95', async () => {
    const { tools, draftService } = createTools();

    const result = await executeIngredient(tools, {
      name: '鸡肝',
      nameEn: 'Chicken liver',
      category: 'MEAT_ORGAN',
      baseUnit: 'G',
      unitDisplayLabel: '克',
      cfctClass: '禽肉类及制品',
      edibleYieldPercent: 95,
    });

    expect(result.ok).toBe(true);
    expect(result.body.applied).toEqual([
      'name',
      'nameEn',
      'category',
      'baseUnit',
      'unitDisplayLabel',
      'cfctClass',
      'edibleYieldPercent',
    ]);
    expect(draftService.patch).toHaveBeenCalledTimes(1);

    const [, step, payload] = draftService.patch.mock.calls[0];
    expect(step).toBe('INGREDIENT');
    expect((payload as any).ingredient).toEqual({
      name: '鸡肝',
      nameEn: 'Chicken liver',
      type: 'FOOD',
      category: 'MEAT_ORGAN',
      baseUnit: 'G',
      unitDisplayLabel: '克',
      cfctClass: '禽肉类及制品',
      edibleYieldRate: 0.95,
      manualFields: [],
    });
  });

  it('草稿已有原料卡时只改传入字段，其余保持原值', async () => {
    const { tools, draftService } = createTools({
      ingredient: {
        name: '鸡肝',
        nameEn: 'Chicken liver',
        type: 'FOOD',
        category: 'MEAT_ORGAN',
        baseUnit: 'G',
        unitDisplayLabel: '克',
        cfctClass: '禽肉类及制品',
        edibleYieldRate: 0.95,
        manualFields: [],
      },
    });

    const result = await executeIngredient(tools, {
      cfctClass: '畜肉类及制品',
    });

    expect(result.ok).toBe(true);
    expect(result.body.applied).toEqual(['cfctClass']);

    const ingredient = (draftService.patch.mock.calls[0][2] as any).ingredient;
    expect(ingredient).toMatchObject({
      name: '鸡肝',
      nameEn: 'Chicken liver',
      category: 'MEAT_ORGAN',
      baseUnit: 'G',
      unitDisplayLabel: '克',
      cfctClass: '畜肉类及制品',
      edibleYieldRate: 0.95,
    });
  });

  it('草稿是 30 字段全量卡时：只改写入字段，其余字段与 manualFields 原样保留', async () => {
    const fullCard = {
      name: '冷冻三文鱼',
      nameEn: 'Frozen salmon',
      type: 'FOOD',
      category: 'MEAT_ORGAN',
      notes: '带皮',
      baseUnit: 'G',
      unitDisplayLabel: '克',
      weightG: 150,
      maxCapacityG: 500,
      cfctClass: '禽肉类及制品',
      edibleYieldRate: 0.95,
      mainNutrientsDesc: '蛋白质、脂肪',
      procurementStrategy: 'DAILY_PURCHASE',
      purchaseUnit: '袋',
      purchaseToBaseRatio: 1000,
      currentPricePerPurchaseUnit: 128,
      brand: '××',
      productModel: '1kg/袋',
      purchaseChannel: '京东',
      safetyStock: 2,
      reorderPoint: 3,
      targetStock: 10,
      diyEnabled: false,
      addTiming: 'BEFORE_MIXING',
      productionLossRate: 1.05,
      tags: ['水产'],
      shelfLifeMonths: 12,
      storageCondition: '-18℃ 冷冻',
      openedShelfLifeDays: 3,
      isOilBased: false,
      manualFields: ['brand'],
    };

    const { tools, draftService } = createTools({ ingredient: fullCard });

    const result = await executeIngredient(tools, {
      cfctClass: '畜肉类及制品',
    });

    expect(result.ok).toBe(true);
    expect(result.body.applied).toEqual(['cfctClass']);

    const ingredient = (draftService.patch.mock.calls[0][2] as any)
      .ingredient as Record<string, unknown>;
    // 整张卡逐字段比对：只有 cfctClass 变，品牌 / 重量 / 保质期等一律不能丢。
    expect(ingredient).toEqual({
      ...fullCard,
      cfctClass: '畜肉类及制品',
    });
    expect(ingredient.manualFields).toEqual(['brand']);
    expect(ingredient.brand).toBe('××');
    expect(ingredient.weightG).toBe(150);
    expect(ingredient.shelfLifeMonths).toBe(12);
  });

  it('草稿没有原料卡时用草稿名与起手卡兜底', async () => {
    const { tools, draftService } = createTools({
      intake: {
        name: '牛肝',
        nameEn: 'Beef liver',
        aliases: [],
        confusables: [],
        category: 'MEAT_ORGAN',
        requiredStates: ['RAW'],
        suggestedStates: ['COOKED'],
      },
    });

    const result = await executeIngredient(tools, {
      unitDisplayLabel: '克',
    });

    expect(result.ok).toBe(true);
    expect(result.body.ingredient).toMatchObject({
      name: '牛肝',
      nameEn: 'Beef liver',
      category: 'MEAT_ORGAN',
      baseUnit: 'G',
      unitDisplayLabel: '克',
      cfctClass: null,
      edibleYieldRate: null,
    });
    // 值与兜底卡一致 → 不需要 patch
    expect(draftService.patch).not.toHaveBeenCalled();
  });

  it.each([
    ['非法类别', { category: 'FRUIT' }, 'MEAT_ORGAN'],
    ['非法基准单位', { baseUnit: 'KG' }, 'G'],
    ['可食部小于等于 0', { edibleYieldPercent: 0 }, '(0, 100]'],
    ['可食部大于 100', { edibleYieldPercent: 101 }, '(0, 100]'],
    ['可食部不是数字', { edibleYieldPercent: '九十五' }, 'edibleYieldPercent'],
    ['空名称', { name: '   ' }, 'name'],
    ['超长展示名', { unitDisplayLabel: '克'.repeat(51) }, 'unitDisplayLabel'],
  ])('%s：返回错误文本、不落库、不抛异常', async (_label, args, keyword) => {
    const { tools, draftService } = createTools();

    const result = await executeIngredient(tools, args);

    expect(result.ok).toBe(false);
    expect(result.body.ok).toBe(false);
    expect(result.body.error).toContain(keyword);
    expect(draftService.patch).not.toHaveBeenCalled();
  });

  it('字段白名单：传 brand 直接拒绝，绝不落进草稿', async () => {
    const { tools, draftService } = createTools();

    const result = await executeIngredient(tools, { brand: '某品牌' });

    expect(result.ok).toBe(false);
    expect(result.body.error).toContain('brand');
    expect(draftService.patch).not.toHaveBeenCalled();
  });

  it('一个字段都没传：拒绝，避免空 patch', async () => {
    const { tools, draftService } = createTools();

    const result = await executeIngredient(tools, {});

    expect(result.ok).toBe(false);
    expect(result.body.error).toContain('至少');
    expect(draftService.patch).not.toHaveBeenCalled();
  });

  it('人工审核改过的字段：AI 再写时跳过并说明，不覆盖人的判断', async () => {
    const { tools, draftService } = createTools({
      ingredient: {
        name: '鸡肝（人工核对）',
        nameEn: null,
        type: 'FOOD',
        category: 'MEAT_ORGAN',
        baseUnit: 'G',
        unitDisplayLabel: '克',
        cfctClass: null,
        edibleYieldRate: null,
        manualFields: ['name'],
      },
    });

    const result = await executeIngredient(tools, {
      name: '鸡肝',
      cfctClass: '禽肉类及制品',
    });

    expect(result.ok).toBe(true);
    expect(result.body.applied).toEqual(['cfctClass']);
    expect(result.body.skipped).toEqual([
      { field: 'name', reason: expect.stringContaining('人工') },
    ]);
    expect(result.body.ingredient).toMatchObject({
      name: '鸡肝（人工核对）',
      cfctClass: '禽肉类及制品',
      manualFields: ['name'],
    });
  });

  it('全部是人工改过的字段：返回 applied=0，不写库', async () => {
    const { tools, draftService } = createTools({
      ingredient: {
        name: '鸡肝（人工核对）',
        type: 'FOOD',
        baseUnit: 'G',
        unitDisplayLabel: '克',
        cfctClass: null,
        edibleYieldRate: null,
        manualFields: ['name'],
      },
    });

    const result = await executeIngredient(tools, { name: '鸡肝' });

    expect(result.ok).toBe(true);
    expect(result.body.applied).toEqual([]);
    expect(result.body.skipped).toHaveLength(1);
    expect(draftService.patch).not.toHaveBeenCalled();
  });

  it('重复写同一个值不算进展（progress 为空）', async () => {
    const { tools, draftService } = createTools({
      ingredient: {
        name: '鸡肝',
        type: 'FOOD',
        baseUnit: 'G',
        unitDisplayLabel: '克',
        cfctClass: null,
        edibleYieldRate: null,
        manualFields: [],
      },
    });

    const result = await executeIngredient(tools, { name: '鸡肝' });

    expect(result.ok).toBe(true);
    expect(result.body.applied).toEqual(['name']);
    // 值没变：不 patch、progress 为空（否则循环会误判成有进展）
    expect(result.progress?.writtenFieldPaths).toEqual([]);
    expect(draftService.patch).not.toHaveBeenCalled();
  });
});

describe('IngredientCreationToolsService · 进展信号只认真读', () => {
  function createProgressTools() {
    const listNutritionNames = jest.fn(async () => ({
      total: 2,
      names: [
        { id: 'rec-1', name: 'Chicken, liver, raw', sourceType: 'USDA_FDC' },
        { id: 'rec-2', name: 'Chicken, liver, cooked', sourceType: 'CFCT' },
      ],
      keywords: ['鸡肝'],
    }));
    const findUnique = jest.fn(async (input: any) => ({
      id: input.where.id,
      status: 'ACTIVE',
      foodName: 'Chicken, liver, raw',
      foodNameEn: 'Chicken liver raw',
      normalizedNutrition: {},
    }));

    const tools = new IngredientCreationToolsService(
      {
        findCandidates: jest.fn(),
        listNutritionNames,
      } as unknown as IngredientCreationCandidateService,
      {
        get: jest.fn(),
        patch: jest.fn(),
      } as unknown as IngredientCreationDraftService,
      { runCheck: jest.fn() } as unknown as IngredientCreationCheckService,
      {
        nutritionSourceRecord: { findUnique },
      } as unknown as PrismaService,
    );

    return { tools, findUnique };
  }

  async function executeTool(
    tools: IngredientCreationToolsService,
    name: string,
    args: Record<string, unknown>,
  ) {
    return tools.execute({ runId: RUN_ID, draftId: DRAFT_ID, name, args });
  }

  it('searchNames 只列清单不算已读；getRecord 才算真正读了这条记录', async () => {
    const { tools } = createProgressTools();

    const searched = await executeTool(tools, 'searchNames', {
      keyword: '鸡肝',
    });
    expect(searched.ok).toBe(true);
    // 只列了名字、没读记录：不能上报成「已见过的来源」。
    expect(searched.progress?.sourceRecordIds).toEqual([]);

    const read = await executeTool(tools, 'getRecord', { id: 'rec-1' });
    expect(read.ok).toBe(true);
    expect(read.progress?.sourceRecordIds).toEqual(['rec-1']);
  });
});
