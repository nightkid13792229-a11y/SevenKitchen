import { BadRequestException } from '@nestjs/common';
import { DesignRecipeCoverImageService } from 'src/application/recipe-designer/design-recipe-cover-image.service';

describe('DesignRecipeCoverImageService', () => {
  const recipeDesignerService = { getDraft: jest.fn() };
  const coverImageService = {
    generate: jest.fn().mockResolvedValue({
      url: 'https://img.sevenkitchen.cloud/recipes/covers/custom.jpg',
      provider: 'ARK',
      model: 'doubao-seedream-5-0-pro-260628',
    }),
  };
  const service = new DesignRecipeCoverImageService(
    recipeDesignerService as never,
    coverImageService as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    coverImageService.generate.mockResolvedValue({
      url: 'https://img.sevenkitchen.cloud/recipes/covers/custom.jpg',
      provider: 'ARK',
      model: 'doubao-seedream-5-0-pro-260628',
    });
  });

  it('只取 FOOD、排除补剂/水、同名同预处理合并、占比归一化', async () => {
    recipeDesignerService.getDraft.mockResolvedValue({
      name: '定制鸭肉',
      items: [
        { weightG: 100, ratioPercent: 50, preparationMethod: '生', ingredient: { name: '鸭胸', type: 'FOOD' } },
        { weightG: 50, ratioPercent: 25, preparationMethod: '生', ingredient: { name: '南瓜', type: 'FOOD' } },
        { weightG: 100, ratioPercent: 25, preparationMethod: '生', ingredient: { name: '鸭胸', type: 'FOOD' } },
        { weightG: 5, ratioPercent: 0, preparationMethod: '', ingredient: { name: '钙粉', type: 'SUPPLEMENT' } },
        { weightG: 100, ratioPercent: 0, preparationMethod: '', ingredient: { name: '水', type: 'FOOD' } },
      ],
    });

    const result = await service.generateForDraft('draft-1', {
      userId: 'admin-1',
      role: 'ADMIN',
    });

    expect(recipeDesignerService.getDraft).toHaveBeenCalledWith('draft-1', {
      userId: 'admin-1',
      role: 'ADMIN',
    });
    const call = coverImageService.generate.mock.calls[0][0];
    expect(call.layout).toBe('COVER_16_9');
    expect(call.ingredients).toEqual([
      { name: '鸭胸', preparationMethod: '生', ratioPercent: 75 },
      { name: '南瓜', preparationMethod: '生', ratioPercent: 25 },
    ]);
    expect(result.foodNames).toEqual(['鸭胸', '南瓜']);
    expect(result.url).toContain('/recipes/covers/custom.jpg');
  });

  it('没有可用食材时拒绝，不调生图', async () => {
    recipeDesignerService.getDraft.mockResolvedValue({
      name: '空草稿',
      items: [
        { ingredient: { name: '钙粉', type: 'SUPPLEMENT' }, weightG: 10 },
      ],
    });

    await expect(
      service.generateForDraft('draft-1', { userId: 'admin-1', role: 'ADMIN' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(coverImageService.generate).not.toHaveBeenCalled();
  });
});
