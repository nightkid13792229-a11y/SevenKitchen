import { BadRequestException, ConflictException } from '@nestjs/common';
import { SupplementIngredientService } from '../../../src/application/ingredient-creation/supplement-ingredient.service';
import type { CreateSupplementIngredientInput } from '../../../src/application/ingredient-creation/supplement-ingredient.service';
import type { PrismaService } from '../../../src/infrastructure/prisma.service';

/**
 * 补剂建档：一条标准原料 + 一份已核验的营养档案 + 一个主映射 + 一条标签证据。
 *
 * 这里只钉四件在库里能验证的事：档案状态、主映射、缺项不补 0、重复不建第二套。
 * 每单位值只由服务端按「每份 ÷ 份数」算；客户端送来的 perUnitNutrients 一律忽略。
 */
type Tx = {
  ingredient: { create: jest.Mock; findFirst: jest.Mock };
  nutritionFood: { create: jest.Mock; findFirst: jest.Mock; findMany: jest.Mock };
  nutritionFoodMapping: { create: jest.Mock };
  supplementLabelEvidence: { create: jest.Mock; findFirst: jest.Mock };
  ingredientTag: { findFirst: jest.Mock; create: jest.Mock };
  ingredientTagAssignment: { create: jest.Mock };
};

function createTx(overrides: Partial<Tx> = {}): Tx {
  return {
    ingredient: {
      create: jest.fn().mockResolvedValue({ id: 'ing-1' }),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    nutritionFood: {
      create: jest.fn().mockResolvedValue({ id: 'nf-1' }),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    nutritionFoodMapping: {
      create: jest.fn().mockResolvedValue({ id: 'map-1' }),
    },
    supplementLabelEvidence: {
      create: jest.fn().mockResolvedValue({ id: 'ev-1' }),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    ingredientTag: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'tag-1', name: '油脂类' }),
    },
    ingredientTagAssignment: {
      create: jest.fn().mockResolvedValue({ id: 'assign-1' }),
    },
    ...overrides,
  };
}

function createPrisma(tx: Tx): PrismaService {
  return {
    $transaction: jest.fn(async (fn: (client: Tx) => Promise<unknown>) => fn(tx)),
    ingredient: tx.ingredient,
    nutritionFood: tx.nutritionFood,
    supplementLabelEvidence: tx.supplementLabelEvidence,
  } as unknown as PrismaService;
}

const input: CreateSupplementIngredientInput = {
  name: '鱼油（Omega-3）',
  brand: 'Nordic Naturals',
  productModel: '120 粒/瓶',
  purchaseChannel: 'iHerb',
  unitDisplayLabel: '粒',
  physicalForm: 'CAPSULE',
  purchaseUnit: '瓶',
  purchaseToBaseRatio: 120,
  currentPricePerPurchaseUnit: 398,
  addTiming: 'BEFORE_MIXING',
  productionLossRate: 1.05,
  diyEnabled: true,
  procurementEnabled: true,
  labelCategory: 'FEED_ADDITIVE',
  labelNames: ['鱼油'],
  labelNameSource: '饲料添加剂品种目录（2023 版）',
  tagNames: ['油脂类'],
  servingUnitsPerDose: 2,
  servingNutrients: { 'fattyAcids.epa': 650, 'fattyAcids.dha': 450 },
  evidence: { productUrl: 'https://www.iherb.com/pr/x', labelText: 'Serving Size 2 Softgels' },
  createdBy: 'user-1',
};

describe('SupplementIngredientService.create', () => {
  it('营养档案建档即已核验，不再留待验证', async () => {
    const tx = createTx();
    const service = new SupplementIngredientService(createPrisma(tx));

    const result = await service.create(input);

    expect(result.nutritionFoodStatus).toBe('VERIFIED');
    const created = tx.nutritionFood.create.mock.calls[0][0].data;
    expect(created.status).toBe('VERIFIED');
    expect(created.category).toBe('SUPPLEMENT');
    expect(created.verifiedBy).toBe('user-1');
  });

  it('映射建成立即为主档案', async () => {
    const tx = createTx();
    const service = new SupplementIngredientService(createPrisma(tx));

    await service.create(input);

    expect(tx.nutritionFoodMapping.create.mock.calls[0][0].data.isPrimary).toBe(true);
  });

  it('标签上没写的营养素留空，不写 0', async () => {
    const tx = createTx();
    const service = new SupplementIngredientService(createPrisma(tx));

    await service.create({ ...input, servingNutrients: { 'fattyAcids.epa': 650 } });

    const profile = tx.nutritionFood.create.mock.calls[0][0].data.nutritionData;
    expect(profile.fattyAcids.epa).toBe(325);
    expect(profile.fattyAcids.dha).toBeNull();
  });

  it('营养基准是「每份」，而且记下每份几粒', async () => {
    const tx = createTx();
    const service = new SupplementIngredientService(createPrisma(tx));

    await service.create(input);

    const profile = tx.nutritionFood.create.mock.calls[0][0].data.nutritionData;
    expect(profile.meta.rawBasisType).toBe('PER_SERVING');
    expect(profile.meta.servingUnitLabel).toBe('粒');
  });

  it('同名同品牌同规格再建一次时报冲突，不建第二套', async () => {
    const tx = createTx({
      ingredient: {
        create: jest.fn().mockRejectedValue({ code: 'P2002' }),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    });
    const service = new SupplementIngredientService(createPrisma(tx));

    await expect(service.create(input)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.nutritionFood.create).not.toHaveBeenCalled();
  });

  it('营养素字段路径不认识时报 400，并说出是哪个', async () => {
    const tx = createTx();
    const service = new SupplementIngredientService(createPrisma(tx));

    await expect(
      service.create({ ...input, servingNutrients: { 'nope.whatever': 2 } }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('证据里存下每份粒数与折算快照，事后能算回去', async () => {
    const tx = createTx();
    const service = new SupplementIngredientService(createPrisma(tx));

    await service.create(input);

    const evidence = tx.supplementLabelEvidence.create.mock.calls[0][0].data;
    expect(evidence.servingUnitsPerDose).toBe(2);
    expect(evidence.conversionSnapshot).toEqual({
      servingUnitsPerDose: 2,
      servingNutrients: { 'fattyAcids.epa': 650, 'fattyAcids.dha': 450 },
      perUnitNutrients: { 'fattyAcids.epa': 325, 'fattyAcids.dha': 225 },
      unitDisplayLabel: '粒',
    });
  });

  it('标签分类按名字落成关联；库里没有的标签当场建一个', async () => {
    const tx = createTx();
    const service = new SupplementIngredientService(createPrisma(tx));

    await service.create(input);

    expect(tx.ingredientTag.create).toHaveBeenCalledWith({
      data: { name: '油脂类' },
    });
    expect(tx.ingredientTagAssignment.create).toHaveBeenCalledWith({
      data: { ingredientId: 'ing-1', tagId: 'tag-1' },
    });
  });

  it('标签已存在时直接挂上，不重复建标签', async () => {
    const tx = createTx({
      ingredientTag: {
        findFirst: jest.fn().mockResolvedValue({ id: 'tag-9', name: '油脂类' }),
        create: jest.fn(),
      },
    });
    const service = new SupplementIngredientService(createPrisma(tx));

    await service.create(input);

    expect(tx.ingredientTag.create).not.toHaveBeenCalled();
    expect(tx.ingredientTagAssignment.create).toHaveBeenCalledWith({
      data: { ingredientId: 'ing-1', tagId: 'tag-9' },
    });
  });

  it('品牌和规格都空时也要认出来是同一条，不许建第二个', async () => {
    const tx = createTx({
      ingredient: {
        create: jest.fn(),
        findFirst: jest.fn().mockResolvedValue({ id: 'ing-existing' }),
      },
    });
    const service = new SupplementIngredientService(createPrisma(tx));

    await expect(
      service.create({ ...input, brand: null, productModel: null }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.ingredient.create).not.toHaveBeenCalled();
    expect(tx.ingredient.findFirst).toHaveBeenCalledWith({
      where: {
        type: 'SUPPLEMENT',
        name: input.name,
        brand: null,
        productModel: null,
      },
      select: { id: true, name: true, brand: true, productModel: true },
    });
  });

  it('一个营养素都没有时拒绝建档', async () => {
    const tx = createTx();
    const service = new SupplementIngredientService(createPrisma(tx));

    await expect(
      service.create({ ...input, servingNutrients: {} }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.ingredient.create).not.toHaveBeenCalled();
  });

  it('营养档案名带上品牌与规格，同名不同品牌不会撞唯一键', async () => {
    const tx = createTx();
    const service = new SupplementIngredientService(createPrisma(tx));

    await service.create(input);

    expect(tx.nutritionFood.create.mock.calls[0][0].data.name).toBe(
      '鱼油（Omega-3）（Nordic Naturals · 120 粒/瓶）',
    );
  });

  it('服务端按每份值自己折：写进档案的是每粒值', async () => {
    const tx = createTx();
    const service = new SupplementIngredientService(createPrisma(tx));

    await service.create({ ...input, servingNutrients: { 'fattyAcids.epa': 650 } });

    const profile = tx.nutritionFood.create.mock.calls[0][0].data.nutritionData;
    expect(profile.fattyAcids.epa).toBe(325);
  });

  it('客户端硬塞的每粒值一律忽略，档案按每份 ÷ 份数算', async () => {
    const tx = createTx();
    const service = new SupplementIngredientService(createPrisma(tx));

    await service.create({
      ...input,
      servingNutrients: { 'fattyAcids.epa': 650 },
      perUnitNutrients: { 'fattyAcids.epa': 300 },
    });

    const profile = tx.nutritionFood.create.mock.calls[0][0].data.nutritionData;
    expect(profile.fattyAcids.epa).toBe(325);
  });

  it('粉剂按克记：证据能存 0.9，档案基准是每 1 克，每克值由每份折出来', async () => {
    const tx = createTx();
    const service = new SupplementIngredientService(createPrisma(tx));

    await service.create({
      ...input,
      name: '牛磺酸粉',
      brand: null,
      productModel: null,
      baseUnit: 'G',
      unitDisplayLabel: 'g',
      physicalForm: 'POWDER',
      purchaseUnit: '袋',
      purchaseToBaseRatio: 1000,
      servingUnitsPerDose: 0.9,
      servingNutrients: { 'aminoAcids.taurine': 0.875 },
    });

    const evidence = tx.supplementLabelEvidence.create.mock.calls[0][0].data;
    expect(evidence.servingUnitsPerDose).toBe(0.9);
    const profile = tx.nutritionFood.create.mock.calls[0][0].data.nutritionData;
    expect(profile.meta.rawBasisType).toBe('PER_1_G');
    expect(profile.aminoAcids.taurine).toBeCloseTo(0.972222, 6);
  });

  it('液体按毫升记：档案基准是每 1 毫升', async () => {
    const tx = createTx();
    const service = new SupplementIngredientService(createPrisma(tx));

    await service.create({
      ...input,
      name: '液体锌',
      baseUnit: 'ML',
      unitDisplayLabel: 'ml',
      physicalForm: 'LIQUID',
      purchaseUnit: '瓶',
      purchaseToBaseRatio: 100,
      servingUnitsPerDose: 2.5,
      servingNutrients: { 'minerals.zinc': 12.5 },
    });

    const evidence = tx.supplementLabelEvidence.create.mock.calls[0][0].data;
    expect(evidence.servingUnitsPerDose).toBe(2.5);
    const profile = tx.nutritionFood.create.mock.calls[0][0].data.nutritionData;
    expect(profile.meta.rawBasisType).toBe('PER_1_ML');
    expect(profile.minerals.zinc).toBe(5);
  });

  it('上架/DIY 可选字段写进原料，properties 只在提供时补对应项', async () => {
    const tx = createTx();
    const service = new SupplementIngredientService(createPrisma(tx));

    await service.create({
      ...input,
      shelfLifeMonths: 24,
      openedShelfLifeDays: 60,
      storageCondition: '阴凉干燥处',
      isOilBased: true,
      supplementRetailEnabled: true,
      purchaseLink: { platform: 'IHERB', url: 'https://www.iherb.com/pr/x' },
      imageUrl: 'https://img.example.com/x.jpg',
      noSaleReason: null,
    });

    const created = tx.ingredient.create.mock.calls[0][0].data;
    expect(created.shelfLifeMonths).toBe(24);
    expect(created.openedShelfLifeDays).toBe(60);
    expect(created.storageCondition).toBe('阴凉干燥处');
    expect(created.isOilBased).toBe(true);
    expect(created.supplementRetailEnabled).toBe(true);
    expect(created.properties.purchase_link).toEqual({
      platform: 'IHERB',
      url: 'https://www.iherb.com/pr/x',
    });
    expect(created.properties.image_url).toBe('https://img.example.com/x.jpg');
    expect(created.properties.no_sale_reason).toBeUndefined();
  });

  it('证据能按原料查回来，带标签原文与每份几粒', async () => {
    const tx = createTx();
    tx.supplementLabelEvidence.findFirst.mockResolvedValue({
      id: 'ev-1',
      ingredientId: 'ing-1',
      nutritionFoodId: 'nf-1',
      servingUnitsPerDose: 2,
      labelText: 'Serving Size 2 Softgels',
      labelImageUrl: null,
      productUrl: 'https://www.iherb.com/pr/x',
      createdAt: new Date('2026-11-07T00:00:00Z'),
    });
    tx.nutritionFood.findFirst.mockResolvedValue({ id: 'nf-1', status: 'VERIFIED' });
    const service = new SupplementIngredientService(createPrisma(tx));

    const view = await service.getEvidence('ing-1');

    expect(view?.servingUnitsPerDose).toBe(2);
    expect(view?.labelText).toBe('Serving Size 2 Softgels');
    expect(view?.nutritionFoodStatus).toBe('VERIFIED');
  });

  it('待验证清单只列补剂、只列 PENDING', async () => {
    const tx = createTx();
    tx.nutritionFood.findMany.mockResolvedValue([
      {
        id: 'nf-1',
        name: '鱼油（Omega-3）',
        status: 'PENDING',
        createdAt: new Date('2026-11-07T00:00:00Z'),
        mappings: [{ ingredientId: 'ing-1', isPrimary: true }],
      },
    ]);
    const service = new SupplementIngredientService(createPrisma(tx));

    const list = await service.listPending();

    expect(list).toHaveLength(1);
    expect(list[0]).toEqual({
      nutritionFoodId: 'nf-1',
      ingredientId: 'ing-1',
      name: '鱼油（Omega-3）',
      createdAt: '2026-11-07T00:00:00.000Z',
    });
    const where = tx.nutritionFood.findMany.mock.calls[0][0].where;
    expect(where.status).toBe('PENDING');
    expect(where.category).toBe('SUPPLEMENT');
  });
});
