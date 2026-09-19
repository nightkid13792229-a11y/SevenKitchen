import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SupplementCatalogService } from '../../../src/application/supplement-shop/supplement-catalog.service';
import { PrismaService } from '../../../src/infrastructure/prisma.service';

interface IngredientFixture {
  id: string;
  name: string;
  type: string;
  brand: string | null;
  productModel: string | null;
  purchaseChannel: string | null;
  baseUnit: string;
  unitDisplayLabel: string | null;
  purchaseUnit: string;
  purchaseToBaseRatio: number;
  currentPricePerPurchaseUnit: number;
  physicalForm: string | null;
  supplementRetailEnabled: boolean;
  shelfLifeMonths: number | null;
  storageCondition: string | null;
  openedShelfLifeDays: number | null;
  properties: Record<string, unknown>;
}

function buildFixtures(): IngredientFixture[] {
  return [
    {
      id: 'kelp',
      name: '海藻粉',
      type: 'SUPPLEMENT',
      brand: 'NOW FOODS',
      productModel: '227g/瓶，450mcg碘/平勺，2522平勺/瓶',
      purchaseChannel: '天猫旗舰店',
      baseUnit: 'PCS',
      unitDisplayLabel: '平勺',
      purchaseUnit: '瓶',
      purchaseToBaseRatio: 2522,
      currentPricePerPurchaseUnit: 89.41,
      physicalForm: null,
      supplementRetailEnabled: false,
      shelfLifeMonths: null,
      storageCondition: null,
      openedShelfLifeDays: null,
      properties: { display_unit: '平勺' },
    },
    {
      id: 'psyllium',
      name: '洋车前子壳粉',
      type: 'SUPPLEMENT',
      brand: 'NOW FOODS',
      productModel: '340g/瓶',
      purchaseChannel: '天猫旗舰店',
      baseUnit: 'G',
      unitDisplayLabel: 'g',
      purchaseUnit: '瓶',
      purchaseToBaseRatio: 340,
      currentPricePerPurchaseUnit: 111.07,
      physicalForm: null,
      supplementRetailEnabled: false,
      shelfLifeMonths: null,
      storageCondition: null,
      openedShelfLifeDays: null,
      // 展示单位口径写错：应该跟 unit_display_label 一致
      properties: { display_unit: '瓶' },
    },
    {
      id: 'no-price',
      name: '海带片',
      type: 'SUPPLEMENT',
      brand: 'NOW FOODS',
      productModel: '150μg碘/片，200片/瓶',
      purchaseChannel: null,
      baseUnit: 'PCS',
      unitDisplayLabel: '片',
      purchaseUnit: '片',
      purchaseToBaseRatio: 1,
      currentPricePerPurchaseUnit: 0,
      physicalForm: null,
      supplementRetailEnabled: false,
      shelfLifeMonths: null,
      storageCondition: null,
      openedShelfLifeDays: null,
      properties: { display_unit: '片' },
    },
  ];
}

describe('SupplementCatalogService', () => {
  let service: SupplementCatalogService;
  let fixtures: IngredientFixture[];

  const mockPrismaService = {
    ingredient: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    recipeItem: {
      groupBy: jest.fn(),
    },
  } as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SupplementCatalogService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get(SupplementCatalogService);
    jest.clearAllMocks();

    fixtures = buildFixtures();

    mockPrismaService.ingredient.findMany.mockImplementation(async () =>
      fixtures.map((item) => ({ ...item })),
    );
    mockPrismaService.ingredient.findUnique.mockImplementation(
      async ({ where }: any) => {
        const found = fixtures.find((item) => item.id === where.id);
        return found ? { ...found } : null;
      },
    );
    mockPrismaService.ingredient.update.mockImplementation(
      async ({ where, data }: any) => {
        const index = fixtures.findIndex((item) => item.id === where.id);
        if (index < 0) throw new Error('fixture not found');
        fixtures[index] = { ...fixtures[index], ...data };
        return { ...fixtures[index] };
      },
    );
    mockPrismaService.recipeItem.groupBy.mockResolvedValue([
      { ingredientId: 'kelp', _count: { _all: 14 } },
    ]);
  });

  it('用 unit_display_label 优先作为展示单位，避免被 properties.display_unit 带偏', async () => {
    const { items } = await service.listCatalog();

    const psyllium = items.find((item) => item.id === 'psyllium')!;
    expect(psyllium.displayUnit).toBe('g');
    expect(psyllium.propertiesDisplayUnit).toBe('瓶');
  });

  it('体检能识别：单位口径不一致、缺价、缺形态、缺保质期、缺储存条件', async () => {
    const { items } = await service.listCatalog();

    const psyllium = items.find((item) => item.id === 'psyllium')!;
    expect(psyllium.issues.map((issue) => issue.code)).toContain(
      'UNIT_INCONSISTENT',
    );

    const noPrice = items.find((item) => item.id === 'no-price')!;
    const noPriceCodes = noPrice.issues.map((issue) => issue.code);
    expect(noPriceCodes).toContain('NO_PRICE');
    expect(noPriceCodes).toContain('FORM_MISSING');
    expect(noPriceCodes).toContain('SHELF_LIFE_MISSING');
    expect(noPriceCodes).toContain('STORAGE_MISSING');
    expect(noPrice.unitCost).toBeNull();
  });

  it('按换算比例算出单位成本，并从推荐品牌保质期给出预填建议', async () => {
    const { items } = await service.listCatalog();

    const kelp = items.find((item) => item.id === 'kelp')!;
    expect(kelp.unitCost).toBeCloseTo(89.41 / 2522, 6);
    expect(kelp.suggestedPhysicalForm).toBe('POWDER');
    expect(kelp.suggestedShelfLifeMonths).toBe(24);
    expect(kelp.recipeReferenceCount).toBe(14);
  });

  it('汇总数字与实际体检结果一致', async () => {
    const { summary } = await service.listCatalog();

    expect(summary.total).toBe(3);
    expect(summary.retailEnabled).toBe(0);
    expect(summary.readyToSell).toBe(0);
    expect(summary.blockedByError).toBe(3);
    expect(summary.missingForm).toBe(3);
    expect(summary.noPrice).toBe(1);
  });

  it('档案不全时不允许上架，并且上架开关会回滚为 false', async () => {
    await expect(
      service.updateCatalogItem('kelp', { supplementRetailEnabled: true }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const kelp = fixtures.find((item) => item.id === 'kelp')!;
    expect(kelp.supplementRetailEnabled).toBe(false);
  });

  it('档案补齐后可以正常上架，并标记为可直接售卖', async () => {
    const updated = await service.updateCatalogItem('kelp', {
      physicalForm: 'POWDER',
      shelfLifeMonths: 24,
      storageCondition: '避光、密封、阴凉干燥处保存',
    });

    expect(updated.issues.some((issue) => issue.level === 'ERROR')).toBe(false);

    const enabled = await service.updateCatalogItem('kelp', {
      supplementRetailEnabled: true,
    });
    expect(enabled.supplementRetailEnabled).toBe(true);
    expect(enabled.readyToSell).toBe(true);
  });

  it('批量预填只处理空白项，不覆盖已填内容', async () => {
    fixtures[0] = {
      ...fixtures[0],
      physicalForm: 'TABLET',
      shelfLifeMonths: 12,
      storageCondition: '冷藏',
    };

    const result = await service.applySuggestions();

    const kelp = fixtures.find((item) => item.id === 'kelp')!;
    expect(kelp.physicalForm).toBe('TABLET');
    expect(kelp.shelfLifeMonths).toBe(12);
    expect(kelp.storageCondition).toBe('冷藏');

    const psyllium = fixtures.find((item) => item.id === 'psyllium')!;
    expect(psyllium.physicalForm).toBe('POWDER');
    expect(psyllium.shelfLifeMonths).toBe(24);
    expect(result.updated).toBeGreaterThan(0);
  });

  it('原厂保质期必须是正整数', async () => {
    await expect(
      service.updateCatalogItem('kelp', { shelfLifeMonths: 0 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.updateCatalogItem('kelp', { shelfLifeMonths: 2.5 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
