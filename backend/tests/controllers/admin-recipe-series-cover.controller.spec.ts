import { RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { AdminRecipeSeriesCoverController } from 'src/interfaces/controllers/admin-recipe-series-cover.controller';

const result = {
  url: 'https://cos.example.com/recipes/covers/a.jpg',
  provider: 'ZHIPU',
  model: 'glm-image',
  saved: false,
  foodNames: ['鸡胸肉'],
};

describe('AdminRecipeSeriesCoverController', () => {
  it('类路径与路由契约', () => {
    expect(
      Reflect.getMetadata(PATH_METADATA, AdminRecipeSeriesCoverController),
    ).toBe('api/v1/admin/recipe-series');

    const handler =
      AdminRecipeSeriesCoverController.prototype.generateSeriesAiCover;
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(
      ':seriesId/ai-cover',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
      RequestMethod.POST,
    );
  });

  it('类级守卫是 AuthGuard + AdminGuard', () => {
    const guards =
      Reflect.getMetadata(GUARDS_METADATA, AdminRecipeSeriesCoverController) ??
      [];
    expect(guards.map((guard: any) => guard.name)).toEqual(
      expect.arrayContaining(['AuthGuard', 'AdminGuard']),
    );
  });

  it('save 默认 false，显式 true 透传', async () => {
    const service = { generateForSeries: jest.fn().mockResolvedValue(result) };
    const controller = new AdminRecipeSeriesCoverController(service as any);

    const empty = await controller.generateSeriesAiCover('series-1', {});
    expect(service.generateForSeries).toHaveBeenCalledWith('series-1', {
      save: false,
    });
    expect(empty.data).toEqual(result);

    await controller.generateSeriesAiCover('series-1', { save: true });
    expect(service.generateForSeries).toHaveBeenLastCalledWith('series-1', {
      save: true,
    });
  });

  it('服务抛错不被吞', async () => {
    const service = {
      generateForSeries: jest.fn().mockRejectedValue(new Error('boom')),
    };
    const controller = new AdminRecipeSeriesCoverController(service as any);

    await expect(
      controller.generateSeriesAiCover('series-1', {}),
    ).rejects.toThrow('boom');
  });
});
