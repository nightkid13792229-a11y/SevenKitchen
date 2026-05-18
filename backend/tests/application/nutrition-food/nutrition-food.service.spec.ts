import { NutritionFoodCategory } from '@prisma/client';
import { NutritionFoodService } from '../../../src/application/nutrition-food/nutrition-food.service';

describe('NutritionFoodService', () => {
  const prisma = {
    nutritionFood: {
      count: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  } as any;

  let service: NutritionFoodService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new NutritionFoodService(prisma);
  });

  it('searches by the formal Chinese display name', async () => {
    prisma.nutritionFood.count.mockResolvedValue(0);
    prisma.nutritionFood.findMany.mockResolvedValue([]);

    await service.findAll({ search: '三文鱼', page: 1, pageSize: 20 });

    expect(prisma.nutritionFood.count).toHaveBeenCalledWith({
      where: {
        OR: expect.arrayContaining([
          { displayNameZh: { contains: '三文鱼', mode: 'insensitive' } },
        ]),
      },
    });
  });

  it('stores manual Chinese display name metadata when creating a nutrition food', async () => {
    prisma.nutritionFood.findFirst.mockResolvedValue(null);
    prisma.nutritionFood.create.mockImplementation(async (args: any) => ({
      id: 'food-1',
      version: 1,
      status: 'PENDING',
      createdAt: new Date('2026-05-18T00:00:00.000Z'),
      updatedAt: new Date('2026-05-18T00:00:00.000Z'),
      mappings: [],
      ...args.data,
    }));

    const result = await service.create(
      {
        name: 'Fish, salmon, Atlantic, farmed, raw',
        displayNameZh: '  三文鱼，大西洋，养殖，生  ',
        category: NutritionFoodCategory.OTHER,
        dataSource: 'USDA',
        nutritionData: {},
      } as any,
      'staff-1',
    );

    expect(prisma.nutritionFood.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        displayNameZh: '三文鱼，大西洋，养殖，生',
        displayNameZhSource: 'MANUAL',
        displayNameZhReviewedAt: expect.any(Date),
        displayNameZhReviewedBy: 'staff-1',
      }),
      include: { mappings: true },
    });
    expect(result).toEqual(
      expect.objectContaining({
        displayNameZh: '三文鱼，大西洋，养殖，生',
        displayNameZhSource: 'MANUAL',
        displayNameZhReviewedBy: 'staff-1',
      }),
    );
  });

  it('updates and clears Chinese display name metadata explicitly', async () => {
    prisma.nutritionFood.findUnique.mockResolvedValue({ id: 'food-1' });
    prisma.nutritionFood.update.mockImplementation(async (args: any) => ({
      id: 'food-1',
      name: 'Fish, salmon, Atlantic, farmed, raw',
      nameEn: null,
      category: NutritionFoodCategory.OTHER,
      dataSource: 'USDA',
      externalId: null,
      version: 1,
      status: 'VERIFIED',
      nutritionData: {},
      notes: null,
      createdBy: null,
      verifiedBy: null,
      verifiedAt: null,
      createdAt: new Date('2026-05-18T00:00:00.000Z'),
      updatedAt: new Date('2026-05-18T00:00:00.000Z'),
      mappings: [],
      ...args.data,
    }));

    await (service as any).update(
      'food-1',
      { displayNameZh: '   ' },
      'staff-1',
    );

    expect(prisma.nutritionFood.update).toHaveBeenCalledWith({
      where: { id: 'food-1' },
      data: expect.objectContaining({
        displayNameZh: null,
        displayNameZhSource: null,
        displayNameZhReviewedAt: null,
        displayNameZhReviewedBy: null,
      }),
      include: expect.any(Object),
    });
  });
});
