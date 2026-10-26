import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { IngredientCreationCommitService } from '../../../src/application/ingredient-creation/ingredient-creation-commit.service';
import { IngredientCreationDraftService } from '../../../src/application/ingredient-creation/ingredient-creation-draft.service';
import { NutritionFoodService } from '../../../src/application/nutrition-food/nutrition-food.service';
import type {
  IngredientCreationDraftPayload,
  IngredientDraft,
  NutritionEvidenceEntry,
  ProfileDraft,
  ProposalSnapshot,
} from '../../../src/application/ingredient-creation/ingredient-creation.types';
import { PrismaService } from '../../../src/infrastructure/prisma.service';

interface DraftFixture {
  id: string;
  name: string;
  type: 'FOOD';
  step: string;
  payload: IngredientCreationDraftPayload;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

interface SourceRecordFixture {
  id: string;
  sourceType: string;
  sourceKey: string;
  sourceTitle: string;
  foodName: string;
  foodNameEn: string | null;
  status?: 'ACTIVE' | 'DEPRECATED';
}

interface ExistingIngredientFixture {
  id: string;
  name: string;
  brand: string | null;
  productModel: string | null;
}

interface HarnessOptions {
  draft?: DraftFixture | null;
  sourceRecords?: SourceRecordFixture[];
  existingIngredients?: ExistingIngredientFixture[];
}

interface Store {
  ingredients: Array<Record<string, any> & { id: string }>;
  nutritionFoods: Array<Record<string, any> & { id: string }>;
  mappings: Array<Record<string, any> & { id: string }>;
  audits: Array<Record<string, any> & { id: string }>;
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/**
 * 内存版 Prisma 假实现：事务用「快照 + 失败还原」模拟真库的回滚。
 *
 * 事务里的客户端是**另一个对象**：这样「咨询锁必须在事务内执行」才能被断言出来
 * （服务如果误用 `this.prisma`，外层 `$queryRaw` 会直接报错）。草稿行是可变的，
 * 提交成功后 `step` 会变成 `COMMIT`，用来验证幂等。
 */
function createPrismaMock(options: HarnessOptions = {}) {
  const store: Store = {
    ingredients: (options.existingIngredients ?? []).map((row) => ({ ...row })),
    nutritionFoods: [],
    mappings: [],
    audits: [],
  };
  const sourceRecords = options.sourceRecords ?? [];
  const draftState =
    options.draft === undefined || options.draft === null
      ? null
      : clone(options.draft);
  const queryRawLog = {
    insideTransaction: [] as boolean[],
    sqls: [] as string[],
    values: [] as unknown[][],
  };
  let transactionDepth = 0;
  const counters = new Map<string, number>();
  const nextId = (prefix: string): string => {
    const next = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, next);
    return `${prefix}-${next}`;
  };

  const client: any = {
    ingredientCreationDraft: {
      findUnique: jest.fn(async ({ where }: any) => {
        if (!draftState || draftState.id !== where.id) {
          return null;
        }
        return clone(draftState);
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        if (!draftState || draftState.id !== where.id) {
          return { count: 0 };
        }
        if (where?.step?.not === 'COMMIT' && draftState.step === 'COMMIT') {
          return { count: 0 };
        }
        draftState.step = data.step;
        return { count: 1 };
      }),
    },
    nutritionSourceRecord: {
      findMany: jest.fn(async ({ where }: any) => {
        const ids: string[] = where?.id?.in ?? [];
        return sourceRecords
          .filter((row) => ids.includes(row.id))
          .map((row) => ({ status: 'ACTIVE', ...clone(row) }));
      }),
    },
    ingredient: {
      findFirst: jest.fn(async ({ where }: any) => {
        const match = store.ingredients.find(
          (row) =>
            row.name === where.name &&
            (row.brand ?? null) === (where.brand ?? null) &&
            (row.productModel ?? null) === (where.productModel ?? null),
        );
        return match ? { id: match.id } : null;
      }),
      create: jest.fn(async ({ data }: any) => {
        const row = { id: nextId('ingredient'), ...clone(data) };
        store.ingredients.push(row);
        return { id: row.id };
      }),
    },
    nutritionFood: {
      create: jest.fn(async ({ data }: any) => {
        const row = { id: nextId('food'), ...clone(data) };
        store.nutritionFoods.push(row);
        return { id: row.id };
      }),
    },
    nutritionFoodMapping: {
      create: jest.fn(async ({ data }: any) => {
        const row = { id: nextId('mapping'), ...clone(data) };
        store.mappings.push(row);
        return { id: row.id };
      }),
    },
    ingredientCreationAudit: {
      create: jest.fn(async ({ data }: any) => {
        const row = { id: nextId('audit'), ...clone(data) };
        store.audits.push(row);
        return { id: row.id };
      }),
    },
    // 锁只能走事务客户端；外层客户端一旦被调用就是实现写错了。
    $queryRaw: jest.fn(async () => {
      throw new Error('pg_advisory_xact_lock 必须在事务客户端上执行');
    }),
  };

  const txQueryRaw = jest.fn(
    async (strings: TemplateStringsArray, ...values: unknown[]) => {
      queryRawLog.insideTransaction.push(transactionDepth > 0);
      queryRawLog.sqls.push(strings.join('?'));
      queryRawLog.values.push(values);
      return [{ pg_advisory_xact_lock: null }];
    },
  );
  const tx: any = {
    ingredientCreationDraft: client.ingredientCreationDraft,
    ingredient: client.ingredient,
    nutritionFood: client.nutritionFood,
    nutritionFoodMapping: client.nutritionFoodMapping,
    ingredientCreationAudit: client.ingredientCreationAudit,
    $queryRaw: txQueryRaw,
  };

  client.$transaction = jest.fn(
    async (callback: (transaction: any) => Promise<any>) => {
      const snapshot = clone(store);
      const draftStepSnapshot = draftState?.step;
      transactionDepth += 1;
      try {
        return await callback(tx);
      } catch (error) {
        store.ingredients = snapshot.ingredients;
        store.nutritionFoods = snapshot.nutritionFoods;
        store.mappings = snapshot.mappings;
        store.audits = snapshot.audits;
        if (draftState && draftStepSnapshot !== undefined) {
          draftState.step = draftStepSnapshot;
        }
        throw error;
      } finally {
        transactionDepth -= 1;
      }
    },
  );

  return { client, store, tx, txQueryRaw, queryRawLog };
}

function buildEvidenceEntry(
  fieldPath: string,
  finalValue: number | null,
  overrides: Partial<NutritionEvidenceEntry> = {},
): NutritionEvidenceEntry {
  return {
    fieldPath,
    finalValue,
    unit: 'g',
    status: 'DIRECT',
    sourceRecordId: 'src-usda-raw',
    sourceValue: finalValue,
    sourceUnit: 'g',
    formula: null,
    confirmedBy: 'admin-1',
    confirmedAt: '2026-10-22T10:00:00.000Z',
    ...overrides,
  };
}

const ingredientDraft: IngredientDraft = {
  name: '鸡肝',
  type: 'FOOD',
  baseUnit: 'G',
  unitDisplayLabel: 'g',
  cfctClass: '禽肉类',
  edibleYieldRate: 0.95,
};

/** 只带必填项的原料卡：全量字段用例在它上面逐项覆盖。 */
const baseIngredient: IngredientDraft = {
  name: '冷冻三文鱼',
  type: 'FOOD',
  baseUnit: 'G',
  unitDisplayLabel: '克',
};

const sourceRecords: SourceRecordFixture[] = [
  {
    id: 'src-usda-raw',
    sourceType: 'USDA',
    sourceKey: 'USDA:05025',
    sourceTitle: 'Chicken, liver, all classes, raw',
    foodName: 'Chicken, liver, all classes, raw',
    foodNameEn: 'Chicken, liver, all classes, raw',
  },
  {
    id: 'src-nzfcd-cooked',
    sourceType: 'NZFCD',
    sourceKey: 'NZFCD:CHICKEN-LIVER-COOKED',
    sourceTitle: 'Chicken liver, cooked',
    foodName: 'Chicken liver, cooked',
    foodNameEn: null,
  },
];

/**
 * AI 原始缝合方案（提案快照）：
 * 铁是冲突行（没有最终值）、钙是主来源直接给的。
 * 之后的「最终档案」里，铁被人裁决成 12mg、脂肪被人改过、钙被删掉、锌与牛磺酸是人补的。
 */
const aiMergeSnapshot: ProposalSnapshot = {
  kind: 'MERGE',
  createdAt: '2026-10-22T09:30:00.000Z',
  primarySourceRecordId: 'src-usda-raw',
  rows: [
    {
      fieldPath: 'macros.crudeProtein',
      value: 20.4,
      unit: 'g',
      status: 'DIRECT',
      sourceRecordId: 'src-usda-raw',
      sourceValue: 20.4,
      sourceUnit: 'g',
    },
    {
      fieldPath: 'macros.crudeFat',
      value: 4.8,
      unit: 'g',
      status: 'DIRECT',
      sourceRecordId: 'src-usda-raw',
      sourceValue: 4.8,
      sourceUnit: 'g',
    },
    {
      fieldPath: 'minerals.iron',
      value: null,
      unit: 'mg',
      status: 'CONFLICT',
      sourceRecordId: null,
      sourceValue: null,
      sourceUnit: null,
    },
    {
      fieldPath: 'minerals.calcium',
      value: 10,
      unit: 'mg',
      status: 'DIRECT',
      sourceRecordId: 'src-usda-raw',
      sourceValue: 10,
      sourceUnit: 'mg',
    },
  ],
  conflicts: [
    {
      fieldPath: 'minerals.iron',
      candidates: [
        {
          sourceRecordId: 'src-usda-raw',
          value: 8.8,
          unit: 'mg',
          sourceValue: 8.8,
          sourceUnit: 'mg',
        },
        {
          sourceRecordId: 'src-cfct-raw',
          value: 12,
          unit: 'mg',
          sourceValue: 12000,
          sourceUnit: 'µg',
        },
      ],
    },
  ],
} as ProposalSnapshot;

const rawProfile: ProfileDraft = {
  preparationState: 'RAW',
  sourceRecordId: 'src-usda-raw',
  notes: '生档案按 USDA 生鸡肝',
  entries: [
    buildEvidenceEntry('macros.crudeProtein', 20.4),
    buildEvidenceEntry('macros.crudeFat', 5.2, { status: 'MANUAL' }),
    buildEvidenceEntry('minerals.iron', 12, {
      unit: 'mg',
      status: 'MANUAL',
      sourceRecordId: 'src-cfct-raw',
      sourceValue: 12,
      sourceUnit: 'mg',
    }),
    buildEvidenceEntry('minerals.zinc', 2.1, {
      unit: 'mg',
      status: 'MANUAL',
      sourceValue: null,
      sourceUnit: null,
    }),
    buildEvidenceEntry('custom.taurine', 0.1, {
      status: 'MANUAL',
      sourceValue: null,
      sourceUnit: null,
    }),
  ],
};

const cookedProfile: ProfileDraft = {
  preparationState: 'COOKED',
  sourceRecordId: 'src-nzfcd-cooked',
  notes: null,
  entries: [
    buildEvidenceEntry('macros.crudeProtein', 24, {
      status: 'MANUAL',
      sourceRecordId: 'src-nzfcd-cooked',
      sourceValue: null,
      sourceUnit: null,
    }),
  ],
};

function buildDraft(
  payload: IngredientCreationDraftPayload = {
    proposalHistory: [aiMergeSnapshot],
    mergePlan: {
      primarySourceRecordId: 'src-usda-raw',
      rows: [],
      conflicts: [],
      missingFields: [],
    },
    verify: {
      exceptions: [
        {
          code: 'REQUIRED_STATE_MISSING',
          reason: '暂时只有生档案',
          approvedBy: 'admin-1',
          approvedAt: '2026-10-22T10:00:00.000Z',
        },
      ],
    },
  },
): DraftFixture {
  return {
    id: 'draft-1',
    name: '鸡肝',
    type: 'FOOD',
    step: 'INGREDIENT',
    payload,
    createdBy: 'admin-1',
    createdAt: new Date('2026-10-22T09:00:00.000Z'),
    updatedAt: new Date('2026-10-22T10:00:00.000Z'),
  };
}

async function createHarness(options: HarnessOptions = {}) {
  const { client, store, tx, txQueryRaw, queryRawLog } = createPrismaMock({
    draft: options.draft === undefined ? buildDraft() : options.draft,
    sourceRecords: options.sourceRecords ?? sourceRecords,
    existingIngredients: options.existingIngredients,
  });

  const moduleRef: TestingModule = await Test.createTestingModule({
    providers: [
      IngredientCreationCommitService,
      IngredientCreationDraftService,
      { provide: PrismaService, useValue: client },
    ],
  }).compile();

  return {
    service: moduleRef.get(IngredientCreationCommitService),
    prisma: client,
    store,
    tx,
    txQueryRaw,
    queryRawLog,
  };
}

const baseInput = {
  draftId: 'draft-1',
  userId: 'admin-1',
  ingredient: ingredientDraft,
  profiles: [rawProfile, cookedProfile],
  primaryProfileIndex: 0,
};

describe('IngredientCreationCommitService', () => {
  it('一次事务里建原料、两份 PENDING 档案、主映射与审计', async () => {
    const { service, prisma, store, txQueryRaw, queryRawLog } =
      await createHarness();

    const result = await service.commit(baseInput);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      ingredientId: 'ingredient-1',
      nutritionFoodIds: ['food-1', 'food-2'],
      auditId: 'audit-1',
    });

    // 同名提交先拿事务级咨询锁，再查重：真实库唯一索引把 NULL 当互不相等，
    // 没有锁的话两个 brand/productModel 都为 null 的并发提交都能通过 findFirst。
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(txQueryRaw).toHaveBeenCalledTimes(1);
    expect(queryRawLog.insideTransaction).toEqual([true]);
    expect(queryRawLog.sqls[0]).toContain('pg_advisory_xact_lock');
    expect(queryRawLog.sqls[0]).toContain('hashtext');
    expect(queryRawLog.values[0]).toEqual(['鸡肝']);
    expect(txQueryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.ingredient.findFirst.mock.invocationCallOrder[0],
    );

    // 提交成功把草稿标成 COMMIT（幂等：同一草稿不能再提交一次）
    expect(prisma.ingredientCreationDraft.updateMany).toHaveBeenCalledWith({
      where: { id: 'draft-1', step: { not: 'COMMIT' } },
      data: { step: 'COMMIT' },
    });

    // 查重走 name + brand + productModel 的组合键（向导不填品牌与规格）
    expect(prisma.ingredient.findFirst).toHaveBeenCalledWith({
      where: { name: '鸡肝', brand: null, productModel: null },
      select: { id: true },
    });

    const ingredientData = prisma.ingredient.create.mock.calls[0][0].data;
    expect(ingredientData).toMatchObject({
      name: '鸡肝',
      type: 'FOOD',
      baseUnit: 'G',
      unitDisplayLabel: 'g',
      purchaseUnit: 'g',
      purchaseToBaseRatio: 1,
      currentPricePerPurchaseUnit: 0,
      brand: null,
      productModel: null,
      diyEnabled: false,
      procurementEnabled: false,
    });
    expect(ingredientData.properties).toMatchObject({
      cfct_class: '禽肉类',
      edible_yield_rate: 0.95,
      ingredientCreationDraftId: 'draft-1',
    });

    // 两份档案都必须是 PENDING，且绝不能带 verifiedBy / verifiedAt
    const rawFoodData = prisma.nutritionFood.create.mock.calls[0][0].data;
    expect(rawFoodData).toMatchObject({
      name: '鸡肝（生）',
      category: 'OTHER',
      dataSource: 'USDA',
      externalId: 'USDA:05025',
      status: 'PENDING',
      preparationState: 'RAW',
      preparationStateLabel: '生',
      createdBy: 'admin-1',
    });
    expect(rawFoodData.verifiedBy).toBeUndefined();
    expect(rawFoodData.verifiedAt).toBeUndefined();

    const cookedFoodData = prisma.nutritionFood.create.mock.calls[1][0].data;
    expect(cookedFoodData).toMatchObject({
      name: '鸡肝（熟）',
      dataSource: 'NZFCD',
      externalId: 'NZFCD:CHICKEN-LIVER-COOKED',
      status: 'PENDING',
      preparationState: 'COOKED',
      preparationStateLabel: '熟',
      createdBy: 'admin-1',
    });

    // 原料自己的 nutritionProfile 跟主档案一致（与既有主映射写入路径一致）
    expect(ingredientData.nutritionProfile).toEqual(rawFoodData.nutritionData);

    // 营养数据按字段目录组装：有值的进对应 tab，没给的保持 null，绝不补 0
    expect(rawFoodData.nutritionData.macros.crudeProtein).toBe(20.4);
    expect(rawFoodData.nutritionData.macros.crudeFat).toBe(5.2);
    expect(rawFoodData.nutritionData.minerals.iron).toBe(12);
    expect(rawFoodData.nutritionData.minerals.zinc).toBe(2.1);
    expect(rawFoodData.nutritionData.minerals.calcium).toBeNull();
    expect(rawFoodData.nutritionData.macros.carbohydrate).toBeNull();
    expect(rawFoodData.nutritionData.macros.energyKcal).toBeNull();
    expect(rawFoodData.nutritionData.meta).toMatchObject({
      rawBasisType: 'PER_100_G',
      sampleState: 'RAW',
      sourceRecordId: 'src-usda-raw',
    });
    // 目录之外的字段不静默丢弃，落到 customItems
    expect(rawFoodData.nutritionData.customItems).toEqual([
      expect.objectContaining({
        name: 'custom.taurine',
        value: 0.1,
        unit: 'g',
      }),
    ]);

    // 只有主档案 isPrimary
    expect(prisma.nutritionFoodMapping.create).toHaveBeenCalledTimes(2);
    const mappingData = prisma.nutritionFoodMapping.create.mock.calls.map(
      (call: any[]) => call[0].data,
    );
    expect(mappingData).toEqual([
      expect.objectContaining({
        ingredientId: 'ingredient-1',
        nutritionFoodId: 'food-1',
        isPrimary: true,
        yieldRate: 1,
      }),
      expect.objectContaining({
        ingredientId: 'ingredient-1',
        nutritionFoodId: 'food-2',
        isPrimary: false,
        yieldRate: 1,
      }),
    ]);

    expect(store.nutritionFoods.map((row) => row.status)).toEqual([
      'PENDING',
      'PENDING',
    ]);
    expect(store.audits).toHaveLength(1);
  });

  it('原料名按 NFKC + 空白归一后查重、加锁、入库', async () => {
    const { service, prisma, queryRawLog } = await createHarness();
    const ingredient = { ...ingredientDraft, name: '  Chicken　Liver  ' };

    await service.commit({ ...baseInput, ingredient });

    // 锁 key 是归一后的小写名（全角空格已归一成普通空格）
    expect(queryRawLog.values[0]).toEqual(['chicken liver']);
    expect(prisma.ingredient.findFirst).toHaveBeenCalledWith({
      where: { name: 'Chicken Liver', brand: null, productModel: null },
      select: { id: true },
    });
    expect(prisma.ingredient.create.mock.calls[0][0].data.name).toBe(
      'Chicken Liver',
    );
    expect(prisma.nutritionFood.create.mock.calls[0][0].data.name).toBe(
      'Chicken Liver（生）',
    );
  });

  it('审计保存本次 AI 提案快照，并按 profile + 字段列出人工改动与裁决', async () => {
    const draft = buildDraft();
    const { service, prisma } = await createHarness({ draft });

    await service.commit(baseInput);

    const auditData =
      prisma.ingredientCreationAudit.create.mock.calls[0][0].data;
    expect(auditData).toMatchObject({
      draftId: 'draft-1',
      ingredientId: 'ingredient-1',
      nutritionFoodIds: ['food-1', 'food-2'],
      committedBy: 'admin-1',
      proposals: draft.payload.proposalHistory,
    });

    const changes = auditData.changes as {
      fields: Array<Record<string, any>>;
      exceptions: Array<Record<string, any>>;
    };
    expect(changes.exceptions).toEqual(draft.payload.verify?.exceptions);

    const findChange = (profileIndex: number, fieldPath: string) =>
      changes.fields.find(
        (row) =>
          row.profileIndex === profileIndex && row.fieldPath === fieldPath,
      );

    // 与提案完全一致、且来源没变的字段不算「改过」
    expect(findChange(0, 'macros.crudeProtein')).toBeUndefined();

    expect(findChange(0, 'macros.crudeFat')).toMatchObject({
      change: 'VALUE_CHANGED',
      aiValue: 4.8,
      finalValue: 5.2,
      finalStatus: 'MANUAL',
    });

    // 冲突行：AI 没写最终值，人裁决成 CFCT 的 12mg
    expect(findChange(0, 'minerals.iron')).toMatchObject({
      change: 'CONFLICT_RESOLVED',
      aiValue: null,
      aiCandidates: [
        {
          sourceRecordId: 'src-usda-raw',
          value: 8.8,
          unit: 'mg',
          sourceValue: 8.8,
          sourceUnit: 'mg',
        },
        {
          sourceRecordId: 'src-cfct-raw',
          value: 12,
          unit: 'mg',
          sourceValue: 12000,
          sourceUnit: 'µg',
        },
      ],
      finalValue: 12,
      finalSourceRecordId: 'src-cfct-raw',
    });

    // AI 提了、最终档案里没有的字段
    expect(findChange(0, 'minerals.calcium')).toMatchObject({
      change: 'REMOVED_FROM_FINAL',
      aiValue: 10,
      finalValue: null,
    });

    // 提案里没有、由人补上的字段
    expect(findChange(0, 'minerals.zinc')).toMatchObject({
      change: 'MANUALLY_ADDED',
      aiValue: null,
      finalValue: 2.1,
    });
    expect(findChange(0, 'custom.taurine')).toMatchObject({
      change: 'MANUALLY_ADDED',
      finalValue: 0.1,
    });

    // 熟档案没有对应的 MERGE 提案快照：人工录入的字段同样留痕
    expect(findChange(1, 'macros.crudeProtein')).toMatchObject({
      change: 'MANUALLY_ADDED',
      aiValue: null,
      finalValue: 24,
      preparationState: 'COOKED',
      sourceRecordId: 'src-nzfcd-cooked',
    });

    expect(changes.fields).toHaveLength(6);
  });

  it('提交审计记录人工改过的原料卡字段（manualFields）', async () => {
    const draft = buildDraft({
      ingredient: {
        ...ingredientDraft,
        nameEn: 'Chicken liver',
        category: 'MEAT_ORGAN',
        manualFields: ['name', 'edibleYieldPercent', 'name'],
      },
    });
    const { service, prisma } = await createHarness({ draft });

    await service.commit({
      ...baseInput,
      ingredient: {
        ...ingredientDraft,
        nameEn: 'Chicken liver',
        category: 'MEAT_ORGAN',
      },
    });

    const changes = prisma.ingredientCreationAudit.create.mock.calls[0][0].data
      .changes as { ingredientFields: string[] };
    // 去重后原样进审计：营养字段靠 MANUAL 证据行，原料卡靠这份清单。
    expect(changes.ingredientFields).toEqual(['name', 'edibleYieldPercent']);

    const ingredientData = prisma.ingredient.create.mock.calls[0][0].data;
    expect(ingredientData.properties).toMatchObject({
      name_en: 'Chicken liver',
      coverage_category: 'MEAT_ORGAN',
    });
  });

  it('写入全量采购 / 计量 / 储存字段，该进 properties 的 7 项也不再漏', async () => {
    const { service, store } = await createHarness();

    const result = await service.commit({
      draftId: 'draft-1',
      userId: 'admin-1',
      ingredient: {
        ...baseIngredient,
        notes: '分装冷冻',
        procurementStrategy: 'STOCK_REPLENISHMENT',
        brand: '××水产',
        productModel: '1kg/袋',
        purchaseChannel: '京东',
        purchaseUnit: '袋',
        purchaseToBaseRatio: 1000,
        currentPricePerPurchaseUnit: 128,
        weightG: 150,
        maxCapacityG: 500,
        shelfLifeMonths: 12,
        storageCondition: '-18℃ 冷冻',
        openedShelfLifeDays: 3,
        isOilBased: false,
        diyEnabled: true,
        category: 'OTHER',
        cfctClass: '鱼虾蟹贝类',
        edibleYieldRate: 0.75,
        mainNutrientsDesc: '高蛋白',
        addTiming: 'BEFORE_MEAL',
        // 生产损耗率是倍数（1.05 = 5%），不是 0–1 的比率。
        productionLossRate: 1.05,
        nameEn: 'Atlantic Salmon',
      },
      profiles: [rawProfile],
      primaryProfileIndex: 0,
    });

    const row = store.ingredients.find((i) => i.id === result.ingredientId)!;
    expect(row).toMatchObject({
      notes: '分装冷冻',
      procurementStrategy: 'STOCK_REPLENISHMENT',
      brand: '××水产',
      productModel: '1kg/袋',
      purchaseChannel: '京东',
      purchaseUnit: '袋',
      purchaseToBaseRatio: 1000,
      currentPricePerPurchaseUnit: 128,
      weightG: 150,
      maxCapacityG: 500,
      shelfLifeMonths: 12,
      storageCondition: '-18℃ 冷冻',
      openedShelfLifeDays: 3,
      isOilBased: false,
      diyEnabled: true,
      // 采购开关是另一个决策：本阶段始终关着。
      procurementEnabled: false,
    });
    expect(row.properties).toMatchObject({
      ingredientCreationDraftId: 'draft-1',
      name_en: 'Atlantic Salmon',
      coverage_category: 'OTHER',
      cfct_class: '鱼虾蟹贝类',
      edible_yield_rate: 0.75,
      main_nutrients_desc: '高蛋白',
      add_timing: 'BEFORE_MEAL',
      production_loss_rate: 1.05,
    });

    // 库存三项本阶段不写：不能因为「有同名字段」就顺手落列。
    expect(row.safetyStock).toBeUndefined();
    expect(row.reorderPoint).toBeUndefined();
    expect(row.targetStock).toBeUndefined();
  });

  it('没传的字段保持默认，0 不被当成空', async () => {
    const { service, store } = await createHarness();

    const result = await service.commit({
      draftId: 'draft-1',
      userId: 'admin-1',
      // 0 是有效值：采购价为 0 时不能因为「假值」被默认值覆盖；
      // 重量 / 容量用 0 钉住，避免默认值同样是 0 时测试假通过。
      ingredient: {
        ...baseIngredient,
        currentPricePerPurchaseUnit: 0,
        weightG: 0,
        maxCapacityG: 0,
      },
      profiles: [rawProfile],
      primaryProfileIndex: 0,
    });

    const row = store.ingredients.find((i) => i.id === result.ingredientId)!;
    expect(row.brand).toBeNull();
    expect(row.productModel).toBeNull();
    expect(row.purchaseUnit).toBe('克');
    expect(row.purchaseToBaseRatio).toBe(1);
    expect(row.currentPricePerPurchaseUnit).toBe(0);
    expect(row.weightG).toBe(0);
    expect(row.maxCapacityG).toBe(0);
    expect(row.diyEnabled).toBe(false);
    expect(row.procurementEnabled).toBe(false);
    expect(row.properties).toEqual({
      ingredientCreationDraftId: 'draft-1',
    });
  });

  it('字符串列写入前 trim，纯空白按没填处理', async () => {
    const { service, store } = await createHarness();

    const result = await service.commit({
      draftId: 'draft-1',
      userId: 'admin-1',
      ingredient: {
        ...baseIngredient,
        unitDisplayLabel: ' 克 ',
        // 纯空白的采购单位不能顶掉 unitDisplayLabel 的回退
        purchaseUnit: '   ',
        brand: '  ××水产  ',
        productModel: '   ',
        purchaseChannel: ' 京东 ',
        storageCondition: '  -18℃  ',
        notes: '  分装冷冻  ',
        nameEn: '  Atlantic Salmon  ',
      },
      profiles: [rawProfile],
      primaryProfileIndex: 0,
    });

    const row = store.ingredients.find((i) => i.id === result.ingredientId)!;
    expect(row.unitDisplayLabel).toBe('克');
    expect(row.purchaseUnit).toBe('克');
    expect(row.brand).toBe('××水产');
    expect(row.productModel).toBeNull();
    expect(row.purchaseChannel).toBe('京东');
    expect(row.storageCondition).toBe('-18℃');
    expect(row.notes).toBe('分装冷冻');
    expect(row.properties).toMatchObject({
      name_en: 'Atlantic Salmon',
    });
  });

  it('契约外的键不会落进 properties', async () => {
    const { service, store } = await createHarness();

    const result = await service.commit({
      draftId: 'draft-1',
      userId: 'admin-1',
      ingredient: { ...baseIngredient, rawPageHtml: '<html>' } as never,
      profiles: [rawProfile],
      primaryProfileIndex: 0,
    });

    const row = store.ingredients.find((i) => i.id === result.ingredientId)!;
    expect(row.properties).not.toHaveProperty('rawPageHtml');
    expect(row).not.toHaveProperty('rawPageHtml');
  });

  it('manualFields 里 brand 这类新字段也能进审计（不只是旧的 7 键）', async () => {
    const draft = buildDraft({
      ingredient: {
        ...baseIngredient,
        manualFields: ['brand', 'name'],
      },
    });
    const { service, prisma } = await createHarness({ draft });

    await service.commit({
      ...baseInput,
      ingredient: { ...baseIngredient, brand: '××水产' },
    });

    const changes = prisma.ingredientCreationAudit.create.mock.calls[0][0].data
      .changes as { ingredientFields: string[] };
    expect(changes.ingredientFields).toEqual(['brand', 'name']);
  });

  it('没有提案快照时退回草稿的缝合方案，status=MANUAL 的行仍算人工裁决', async () => {
    const draft = buildDraft({
      mergePlan: {
        primarySourceRecordId: 'src-usda-raw',
        rows: [
          {
            fieldPath: 'macros.crudeProtein',
            value: 20.4,
            unit: 'g',
            status: 'DIRECT',
            sourceRecordId: 'src-usda-raw',
            sourceValue: 20.4,
            sourceUnit: 'g',
          },
          {
            fieldPath: 'minerals.iron',
            value: 12,
            unit: 'mg',
            status: 'MANUAL',
            sourceRecordId: 'src-cfct-raw',
            sourceValue: 12000,
            sourceUnit: 'µg',
          },
        ],
        conflicts: [],
        missingFields: [],
      },
      verify: { exceptions: [] },
    });
    const { service, prisma } = await createHarness({ draft });

    await service.commit(baseInput);

    const changes = prisma.ingredientCreationAudit.create.mock.calls[0][0].data
      .changes as { fields: Array<Record<string, any>> };
    const findChange = (fieldPath: string) =>
      changes.fields.find(
        (row) => row.profileIndex === 0 && row.fieldPath === fieldPath,
      );

    expect(findChange('minerals.iron')).toMatchObject({
      change: 'CONFLICT_RESOLVED',
      aiValue: 12,
      finalValue: 12,
      finalSourceRecordId: 'src-cfct-raw',
    });
    // 与提案完全一致、来源也没变的字段仍然不算改动
    expect(findChange('macros.crudeProtein')).toBeUndefined();
  });

  it('AI 给过值、最终值相同（账本仍是 DIRECT）→ 不产生改动记录', async () => {
    // 没有 proposalHistory / mergePlan：基线找不到，但账本里 DIRECT 明确表示
    // 这个值来自来源（AI 缝合），不是人填的 —— 不能记成「人工新增」。
    const draft = buildDraft({});
    const profile: ProfileDraft = {
      preparationState: 'RAW',
      sourceRecordId: 'src-usda-raw',
      notes: null,
      entries: [
        buildEvidenceEntry('macros.crudeProtein', 20.4),
        buildEvidenceEntry('minerals.phosphorus', 300, {
          unit: 'mg',
          sourceUnit: 'mg',
        }),
      ],
    };
    const { service, prisma } = await createHarness({ draft });

    await service.commit({
      ...baseInput,
      profiles: [profile],
      primaryProfileIndex: 0,
    });

    const changes = prisma.ingredientCreationAudit.create.mock.calls[0][0].data
      .changes as { fields: unknown[] };
    expect(changes.fields).toEqual([]);
  });

  it('两份档案都标了 isPrimary → BadRequest，且不写任何数据', async () => {
    const { service, prisma, store } = await createHarness();
    const profiles = [
      { ...rawProfile, isPrimary: true },
      { ...cookedProfile, isPrimary: true },
    ];

    await expect(
      service.commit({ ...baseInput, profiles }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.ingredient.create).not.toHaveBeenCalled();
    expect(prisma.nutritionFood.create).not.toHaveBeenCalled();
    expect(prisma.ingredientCreationAudit.create).not.toHaveBeenCalled();
    expect(store.ingredients).toHaveLength(0);
  });

  it('profiles 为空 → BadRequest，且不写任何数据', async () => {
    const { service, prisma } = await createHarness();

    await expect(
      service.commit({ ...baseInput, profiles: [] }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.ingredient.create).not.toHaveBeenCalled();
  });

  it('primaryProfileIndex 指向不存在的档案 → BadRequest', async () => {
    const { service, prisma } = await createHarness();

    await expect(
      service.commit({ ...baseInput, primaryProfileIndex: 5 }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('任一份档案 entries 为空 → BadRequest，且不写任何数据', async () => {
    const { service, prisma } = await createHarness();
    const profiles = [rawProfile, { ...cookedProfile, entries: [] }];

    await expect(
      service.commit({ ...baseInput, profiles }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.nutritionFood.create).not.toHaveBeenCalled();
  });

  it('档案状态不是 RAW / COOKED → BadRequest，且不写任何数据', async () => {
    const { service, prisma } = await createHarness();
    const profiles = [
      { ...rawProfile, preparationState: 'raw' as any },
      cookedProfile,
    ];

    await expect(
      service.commit({ ...baseInput, profiles }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.ingredient.create).not.toHaveBeenCalled();
  });

  it('同名同品牌同规格已存在时抛冲突，事务回滚不留半条数据', async () => {
    const { service, prisma, store } = await createHarness({
      existingIngredients: [
        { id: 'existing-1', name: '鸡肝', brand: null, productModel: null },
      ],
    });

    await expect(service.commit(baseInput)).rejects.toBeInstanceOf(
      ConflictException,
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.ingredient.create).not.toHaveBeenCalled();
    expect(prisma.nutritionFood.create).not.toHaveBeenCalled();
    expect(prisma.nutritionFoodMapping.create).not.toHaveBeenCalled();
    expect(prisma.ingredientCreationAudit.create).not.toHaveBeenCalled();
    expect(store.ingredients).toHaveLength(1);
    expect(store.ingredients[0].id).toBe('existing-1');
    expect(store.nutritionFoods).toHaveLength(0);
    expect(store.audits).toHaveLength(0);
  });

  it('并发下原料唯一键被抢占（P2002）同样转成 ConflictException，并回滚', async () => {
    const { service, prisma, store } = await createHarness();
    const uniqueViolation = Object.assign(
      new Error('Unique constraint failed'),
      {
        code: 'P2002',
        meta: { target: ['name', 'brand', 'productModel'] },
      },
    );
    prisma.ingredient.create.mockRejectedValueOnce(uniqueViolation);

    await expect(service.commit(baseInput)).rejects.toBeInstanceOf(
      ConflictException,
    );

    expect(store.ingredients).toHaveLength(0);
    expect(store.nutritionFoods).toHaveLength(0);
    expect(store.audits).toHaveLength(0);
  });

  it('草稿不存在 → NotFoundException，且不开事务', async () => {
    const { service, prisma } = await createHarness({ draft: null });

    await expect(service.commit(baseInput)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.ingredient.create).not.toHaveBeenCalled();
  });

  it('档案引用的来源记录不存在 → BadRequest，且不写任何数据', async () => {
    const { service, prisma } = await createHarness({
      sourceRecords: [sourceRecords[1]],
    });

    await expect(service.commit(baseInput)).rejects.toBeInstanceOf(
      BadRequestException,
    );

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('来源记录已停用（非 ACTIVE）→ BadRequest，且不写任何数据', async () => {
    const { service, prisma } = await createHarness({
      sourceRecords: [
        sourceRecords[0],
        { ...sourceRecords[1], status: 'DEPRECATED' },
      ],
    });

    await expect(service.commit(baseInput)).rejects.toThrow('已停用');

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.ingredient.create).not.toHaveBeenCalled();
  });

  it('同一生熟状态出现两份档案 → BadRequest，且不写任何数据', async () => {
    const { service, prisma } = await createHarness();
    const profiles = [
      rawProfile,
      { ...rawProfile, sourceRecordId: 'src-nzfcd-cooked' },
    ];

    await expect(
      service.commit({ ...baseInput, profiles }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.nutritionFood.create).not.toHaveBeenCalled();
  });

  it('entries 的 finalValue 是字符串 / undefined → BadRequest；显式 null 放行（缺失≠0）', async () => {
    const { service, prisma } = await createHarness();
    const stringValueProfiles = [
      {
        ...rawProfile,
        entries: [buildEvidenceEntry('macros.crudeProtein', '0.55' as any)],
      },
      cookedProfile,
    ];
    const undefinedValueProfiles = [
      {
        ...rawProfile,
        entries: [buildEvidenceEntry('macros.crudeProtein', undefined as any)],
      },
      cookedProfile,
    ];

    await expect(
      service.commit({ ...baseInput, profiles: stringValueProfiles }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.commit({ ...baseInput, profiles: undefinedValueProfiles }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.nutritionFood.create).not.toHaveBeenCalled();

    // 显式 null 表示「这个字段没有值」：允许提交，营养数据里保持 null，绝不补 0
    const nullValueProfiles = [
      {
        ...rawProfile,
        entries: [
          buildEvidenceEntry('macros.crudeProtein', 20.4),
          buildEvidenceEntry('macros.crudeFat', null),
        ],
      },
      cookedProfile,
    ];
    await service.commit({ ...baseInput, profiles: nullValueProfiles });

    const rawFoodData = prisma.nutritionFood.create.mock.calls[0][0].data;
    expect(rawFoodData.nutritionData.macros.crudeProtein).toBe(20.4);
    expect(rawFoodData.nutritionData.macros.crudeFat).toBeNull();
  });

  it('原料基础字段不合法 → BadRequest，且不写任何数据', async () => {
    const { service, prisma } = await createHarness();
    const invalidIngredients = [
      { ...ingredientDraft, name: '   ' },
      { ...ingredientDraft, type: 'SUPPLEMENT' as any },
      { ...ingredientDraft, baseUnit: 'KG' as any },
      { ...ingredientDraft, edibleYieldRate: 0 },
      { ...ingredientDraft, edibleYieldRate: 1.2 },
    ];

    for (const ingredient of invalidIngredients) {
      await expect(
        service.commit({ ...baseInput, ingredient }),
      ).rejects.toBeInstanceOf(BadRequestException);
    }

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.ingredient.create).not.toHaveBeenCalled();
  });

  it('营养档案撞唯一键（P2002）→ ConflictException，用档案自己的文案', async () => {
    const { service, prisma, store } = await createHarness();
    prisma.nutritionFood.create.mockRejectedValueOnce(
      Object.assign(new Error('Unique constraint failed'), {
        code: 'P2002',
        meta: { target: ['name', 'data_source', 'version'] },
      }),
    );

    await expect(service.commit(baseInput)).rejects.toThrow(
      '同名营养档案已存在（同来源同版本）',
    );

    expect(store.ingredients).toHaveLength(0);
    expect(store.nutritionFoods).toHaveLength(0);
    expect(store.mappings).toHaveLength(0);
    expect(store.audits).toHaveLength(0);
  });

  it('来源编号超过 external_id 长度时截断，并在 notes 留原文', async () => {
    const longKey = `CFCT:${'9'.repeat(120)}`;
    const profile: ProfileDraft = {
      preparationState: 'RAW',
      sourceRecordId: 'src-long',
      notes: null,
      entries: [buildEvidenceEntry('macros.crudeProtein', 20.4)],
    };
    const { service, prisma } = await createHarness({
      draft: buildDraft({}),
      sourceRecords: [
        {
          id: 'src-long',
          sourceType: 'CFCT',
          sourceKey: longKey,
          sourceTitle: '超长编号来源',
          foodName: '鸡肝',
          foodNameEn: null,
        },
      ],
    });

    await service.commit({
      ...baseInput,
      profiles: [profile],
      primaryProfileIndex: 0,
    });

    const foodData = prisma.nutritionFood.create.mock.calls[0][0].data;
    expect(foodData.externalId).toHaveLength(100);
    expect(foodData.externalId).toBe(longKey.slice(0, 100));
    expect(foodData.notes).toContain(longKey);
    // meta 里保留完整来源编号（JSON 没有列长度限制）
    expect(foodData.nutritionData.meta.externalId).toBe(longKey);
  });

  it('草稿已提交过（step=COMMIT）→ ConflictException，不开事务', async () => {
    const { service, prisma } = await createHarness({
      draft: { ...buildDraft(), step: 'COMMIT' },
    });

    await expect(service.commit(baseInput)).rejects.toThrow(
      '这份草稿已经提交过了',
    );

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.ingredient.create).not.toHaveBeenCalled();
  });

  it('同一草稿提交成功后再次提交 → ConflictException，不建第二套数据', async () => {
    const { service, prisma, store } = await createHarness();

    await service.commit(baseInput);
    await expect(service.commit(baseInput)).rejects.toThrow(
      '这份草稿已经提交过了',
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(store.ingredients).toHaveLength(1);
    expect(store.nutritionFoods).toHaveLength(2);
    expect(store.audits).toHaveLength(1);
  });

  it('事务内认领草稿失败（并发提交抢先）→ ConflictException，且回滚', async () => {
    const { service, prisma, store } = await createHarness();
    prisma.ingredientCreationDraft.updateMany.mockResolvedValueOnce({
      count: 0,
    });

    await expect(service.commit(baseInput)).rejects.toThrow(
      '这份草稿已经提交过了',
    );

    expect(store.ingredients).toHaveLength(0);
    expect(store.nutritionFoods).toHaveLength(0);
    expect(store.audits).toHaveLength(0);
  });

  it('提交返回的每个 nutritionFoodId 都能被「确认可用」写成 VERIFIED', async () => {
    const { service, store } = await createHarness();

    const committed = await service.commit(baseInput);

    // 提交只负责落 PENDING；「确认可用」是另一个动作，逐份验证。
    expect(committed.nutritionFoodIds).toHaveLength(2);
    expect(
      store.nutritionFoods.every((food) => food.status === 'PENDING'),
    ).toBe(true);

    const verifyPrisma = {
      nutritionFood: {
        findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
          return (
            store.nutritionFoods.find((food) => food.id === where.id) ?? null
          );
        }),
        update: jest.fn(
          async ({
            where,
            data,
          }: {
            where: { id: string };
            data: Record<string, unknown>;
          }) => {
            const food = store.nutritionFoods.find(
              (row) => row.id === where.id,
            )!;
            Object.assign(food, data);
            return { ...food, mappings: [] };
          },
        ),
      },
    } as any;
    const nutritionFoodService = new NutritionFoodService(verifyPrisma);

    for (const nutritionFoodId of committed.nutritionFoodIds) {
      const verified = await nutritionFoodService.verify(
        nutritionFoodId,
        'admin-1',
      );
      expect(verified.status).toBe('VERIFIED');
    }

    expect(verifyPrisma.nutritionFood.update).toHaveBeenCalledTimes(2);
    expect(
      store.nutritionFoods.every(
        (food) =>
          food.status === 'VERIFIED' &&
          food.verifiedBy === 'admin-1' &&
          food.verifiedAt instanceof Date,
      ),
    ).toBe(true);
  });
});
