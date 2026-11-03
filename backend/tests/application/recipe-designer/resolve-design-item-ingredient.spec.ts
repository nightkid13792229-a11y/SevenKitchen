import { BadRequestException } from '@nestjs/common';

import { RecipeDesignerService } from '../../../src/application/recipe-designer/recipe-designer.service';

describe('RecipeDesignerService · 自动反查标准原料', () => {
  function serviceWith(mappings: Array<{ ingredientId: string }>): any {
    const service = Object.create(RecipeDesignerService.prototype) as any;
    service.prisma = {
      nutritionFoodMapping: {
        findMany: jest.fn().mockResolvedValue(mappings),
        findFirst: jest.fn(),
      },
    };
    return service;
  }

  const resolve = (service: any, dto: any) =>
    service.resolveDesignItemIngredientId(dto);

  it('只传营养档案时，唯一映射自动带出标准原料', async () => {
    const service = serviceWith([{ ingredientId: 'ing-1' }]);
    await expect(
      resolve(service, { nutritionFoodId: 'food-1' }),
    ).resolves.toBe('ing-1');
  });

  it('多条映射不猜，要求显式指定', async () => {
    const service = serviceWith([
      { ingredientId: 'ing-1' },
      { ingredientId: 'ing-2' },
    ]);
    await expect(
      resolve(service, { nutritionFoodId: 'food-1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('没有映射时保持原行为，返回 null', async () => {
    const service = serviceWith([]);
    await expect(
      resolve(service, { nutritionFoodId: 'food-1' }),
    ).resolves.toBeNull();
  });

  it('显式传了 ingredientId 时校验映射', async () => {
    const service = serviceWith([]);
    (service as any).prisma.nutritionFoodMapping.findFirst.mockResolvedValue({
      id: 'mapping-1',
    });
    await expect(
      resolve(service, {
        ingredientId: 'ing-1',
        nutritionFoodId: 'food-1',
      }),
    ).resolves.toBe('ing-1');
  });
});
