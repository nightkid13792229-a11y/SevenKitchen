import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { IngredientCreationCommitService } from '../../../src/application/ingredient-creation/ingredient-creation-commit.service';
import { IngredientCreationDraftService } from '../../../src/application/ingredient-creation/ingredient-creation-draft.service';
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
 * 断言只看服务发了什么语句、以及回滚后库里还剩什么——不去断言数据库本身。
 */
function createPrismaMock(options: HarnessOptions = {}) {
  const store: Store = {
    ingredients: (options.existingIngredients ?? []).map((row) => ({ ...row })),
    nutritionFoods: [],
    mappings: [],
    audits: [],
  };
  const sourceRecords = options.sourceRecords ?? [];
  const draft = options.draft === undefined ? null : options.draft;
  const counters = new Map<string, number>();
  const nextId = (prefix: string): string => {
    const next = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, next);
    return `${prefix}-${next}`;
  };

  const client: any = {
    ingredientCreationDraft: {
      findUnique: jest.fn(async ({ where }: any) => {
        if (!draft || draft.id !== where.id) {
          return null;
        }
        return clone(draft);
      }),
    },
    nutritionSourceRecord: {
      findMany: jest.fn(async ({ where }: any) => {
        const ids: string[] = where?.id?.in ?? [];
        return sourceRecords
          .filter((row) => ids.includes(row.id))
          .map((row) => clone(row));
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
    $transaction: jest.fn(async (callback: (tx: any) => Promise<any>) => {
      const snapshot = clone(store);
      try {
        return await callback(client);
      } catch (error) {
        store.ingredients = snapshot.ingredients;
        store.nutritionFoods = snapshot.nutritionFoods;
        store.mappings = snapshot.mappings;
        store.audits = snapshot.audits;
        throw error;
      }
    }),
  };

  return { client, store };
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
    step: 'COMMIT',
    payload,
    createdBy: 'admin-1',
    createdAt: new Date('2026-10-22T09:00:00.000Z'),
    updatedAt: new Date('2026-10-22T10:00:00.000Z'),
  };
}

async function createHarness(options: HarnessOptions = {}) {
  const { client, store } = createPrismaMock({
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
    const { service, prisma, store } = await createHarness();

    const result = await service.commit(baseInput);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      ingredientId: 'ingredient-1',
      nutritionFoodIds: ['food-1', 'food-2'],
      auditId: 'audit-1',
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
});
