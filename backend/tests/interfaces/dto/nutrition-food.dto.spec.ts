import { ValidationPipe } from '@nestjs/common';
import { NutritionFoodCategory } from '@prisma/client';
import { CreateNutritionFoodDto } from '../../../src/interfaces/dto/nutrition-food/nutrition-food.dto';

describe('CreateNutritionFoodDto validation', () => {
  it('preserves name when NutritionFoodController whitelist validation runs', async () => {
    const pipe = new ValidationPipe({ transform: true, whitelist: true });
    const payload = {
      name: '青口贝 手工档案 生 / 标准可食部 / 未加工 1779076835052',
      category: NutritionFoodCategory.OTHER,
      dataSource: 'MANUAL',
      nutritionData: {
        meta: {
          rawBasisType: 'PER_100_G',
          sourceType: 'MANUAL',
        },
        macros: {},
      },
    };

    const transformed = await pipe.transform(payload, {
      type: 'body',
      metatype: CreateNutritionFoodDto,
    });

    expect(transformed.name).toBe(payload.name);
  });
});
