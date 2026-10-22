import { NotFoundException } from '@nestjs/common';
import { NutritionFoodStatus } from '@prisma/client';
import { NutritionFoodService } from '../../../src/application/nutrition-food/nutrition-food.service';

describe('NutritionFoodService.verify', () => {
  const prisma = {
    nutritionFood: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  } as any;

  let service: NutritionFoodService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new NutritionFoodService(prisma);
  });

  it('把状态写成 VERIFIED，并记录 verifiedBy / verifiedAt', async () => {
    prisma.nutritionFood.findUnique.mockResolvedValue({ id: 'nf-1' });
    prisma.nutritionFood.update.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'nf-1',
        name: '鸡肝（生）',
        ...data,
        mappings: [],
      }),
    );

    const result = await service.verify('nf-1', 'admin-1');

    expect(prisma.nutritionFood.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'nf-1' },
        data: expect.objectContaining({
          status: NutritionFoodStatus.VERIFIED,
          verifiedBy: 'admin-1',
          verifiedAt: expect.any(Date),
        }),
      }),
    );
    expect(result.status).toBe(NutritionFoodStatus.VERIFIED);
    expect(result.verifiedBy).toBe('admin-1');
    expect(result.verifiedAt).toBeInstanceOf(Date);
  });

  it('档案不存在 → NotFoundException', async () => {
    prisma.nutritionFood.findUnique.mockResolvedValue(null);

    await expect(service.verify('missing', 'admin-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.nutritionFood.update).not.toHaveBeenCalled();
  });
});
