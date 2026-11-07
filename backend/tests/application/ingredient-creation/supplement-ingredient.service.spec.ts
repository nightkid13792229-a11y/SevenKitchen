import { BadRequestException, ConflictException } from '@nestjs/common';
import { SupplementIngredientService } from '../../../src/application/ingredient-creation/supplement-ingredient.service';
import type { CreateSupplementIngredientInput } from '../../../src/application/ingredient-creation/supplement-ingredient.service';
import type { PrismaService } from '../../../src/infrastructure/prisma.service';

/**
 * 补剂建档：一条标准原料 + 一份待验证的营养档案 + 一个主映射 + 一条标签证据。
 *
 * 这里只钉四件在库里能验证的事：档案状态、主映射、缺项不补 0、重复不建第二套。
 * 折算对不对不在这里判——那是入口的门禁，判完才调到这里。
 */
type Tx = {
  ingredient: { create: jest.Mock };
  nutritionFood: { create: jest.Mock };
  nutritionFoodMapping: { create: jest.Mock };
  supplementLabelEvidence: { create: jest.Mock };
  ingredientTag: { findFirst: jest.Mock; create: jest.Mock };
  ingredientTagAssignment: { create: jest.Mock };
};

function createTx(overrides: Partial<Tx> = {}): Tx {
  return {
    ingredient: {
      create: jest.fn().mockResolvedValue({ id: 'ing-1' }),
    },
    nutritionFood: {
      create: jest.fn().mockResolvedValue({ id: 'nf-1' }),
    },
    nutritionFoodMapping: {
      create: jest.fn().mockResolvedValue({ id: 'map-1' }),
    },
    supplementLabelEvidence: {
      create: jest.fn().mockResolvedValue({ id: 'ev-1' }),
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
  addTiming: 'DURING_PRODUCTION',
  productionLossRate: 1.05,
  diyEnabled: true,
  procurementEnabled: true,
  labelCategory: 'FEED_ADDITIVE',
  labelNames: ['鱼油'],
  labelNameSource: '饲料添加剂品种目录（2023 版）',
  tagNames: ['油脂类'],
  servingUnitsPerDose: 2,
  perUnitNutrients: { 'fattyAcids.epa': 325, 'fattyAcids.dha': 225 },
  evidence: { productUrl: 'https://www.iherb.com/pr/x', labelText: 'Serving Size 2 Softgels' },
  createdBy: 'user-1',
};

describe('SupplementIngredientService.create', () => {
  it('营养档案建成待验证，不是已核验', async () => {
    const tx = createTx();
    const service = new SupplementIngredientService(createPrisma(tx));

    const result = await service.create(input);

    expect(result.nutritionFoodStatus).toBe('PENDING');
    const created = tx.nutritionFood.create.mock.calls[0][0].data;
    expect(created.status).toBe('PENDING');
    expect(created.category).toBe('SUPPLEMENT');
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

    await service.create({ ...input, perUnitNutrients: { 'fattyAcids.epa': 325 } });

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
      service.create({ ...input, perUnitNutrients: { 'nope.whatever': 1 } }),
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
});
