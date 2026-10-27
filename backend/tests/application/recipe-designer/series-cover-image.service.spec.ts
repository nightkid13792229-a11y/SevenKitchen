import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SeriesCoverImageService } from 'src/application/recipe-designer/series-cover-image.service';

/**
 * 系列封面生成（2026-10-27）：
 *  · 只认 CATALOG / ACTIVE / 非临时名 / AI 已配置；
 *  · 食材取「最近一份有可用食材的草稿」，排除补剂、去重、最多 5 个；
 *  · save=true 只在**未上线**系列落库；已上线强制按预览返回 saved=false；
 *  · 永远不写 Recipe 行、不传 applyToLive。
 */

const series = (overrides: Record<string, unknown> = {}) => ({
  id: 'series-1',
  name: '鸡肉南瓜餐',
  status: 'ACTIVE',
  deletedAt: null,
  designMode: 'CATALOG',
  businessStatus: 'DRAFT',
  ...overrides,
});

describe('SeriesCoverImageService', () => {
  const prisma = {
    recipeSeries: { findUnique: jest.fn(), update: jest.fn() },
    recipe: { count: jest.fn() },
    designRecipe: { findMany: jest.fn() },
  };
  const coverImageService = {
    isAvailable: jest.fn(),
    generate: jest.fn(),
  };
  let service: SeriesCoverImageService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.recipeSeries.findUnique.mockResolvedValue(series());
    prisma.recipe.count.mockResolvedValue(0);
    prisma.designRecipe.findMany.mockResolvedValue([]);
    prisma.recipeSeries.update.mockResolvedValue(series());
    coverImageService.isAvailable.mockResolvedValue(true);
    coverImageService.generate.mockResolvedValue({
      url: 'https://cos.example.com/ai.jpg',
      provider: 'ZHIPU',
      model: 'glm-image',
    });
    service = new SeriesCoverImageService(
      prisma as any,
      coverImageService as any,
    );
  });

  it('系列不存在 / 已删除 / 非 ACTIVE 都是 404', async () => {
    prisma.recipeSeries.findUnique.mockResolvedValueOnce(null);
    await expect(service.generateForSeries('series-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );

    prisma.recipeSeries.findUnique.mockResolvedValueOnce(
      series({ deletedAt: new Date() }),
    );
    await expect(service.generateForSeries('series-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );

    prisma.recipeSeries.findUnique.mockResolvedValueOnce(
      series({ status: 'DELETED' }),
    );
    await expect(service.generateForSeries('series-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('订单定制系列不支持，且不花钱', async () => {
    prisma.recipeSeries.findUnique.mockResolvedValue(series({ designMode: 'ORDER' }));

    await expect(service.generateForSeries('series-1')).rejects.toThrow(
      '订单定制系列不支持 AI 封面生成',
    );
    expect(coverImageService.generate).not.toHaveBeenCalled();
  });

  it('临时名 / 空名不生成', async () => {
    prisma.recipeSeries.findUnique.mockResolvedValue(
      series({ name: '未命名系列 · 10-27 11:00' }),
    );
    await expect(service.generateForSeries('series-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );

    prisma.recipeSeries.findUnique.mockResolvedValue(series({ name: '  ' }));
    await expect(service.generateForSeries('series-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(coverImageService.generate).not.toHaveBeenCalled();
  });

  it('AI 未配置：400，且不调 generate', async () => {
    coverImageService.isAvailable.mockResolvedValue(false);

    await expect(service.generateForSeries('series-1')).rejects.toThrow(
      'AI 生图还没配置',
    );
    expect(coverImageService.generate).not.toHaveBeenCalled();
  });

  it('取最近一份有可用食材的草稿：排除补剂、去重、最多 5 个', async () => {
    prisma.designRecipe.findMany.mockResolvedValue([
      { items: [] },
      {
        items: [
          { ingredient: { name: '鸡肉粉', type: 'SUPPLEMENT' }, nutritionFood: { name: '鸡肉粉' } },
          { ingredient: { name: '鸡胸肉', type: 'FOOD' }, nutritionFood: { name: '鸡胸肉' } },
          { ingredient: { name: '南瓜', type: 'FOOD' }, nutritionFood: { name: '南瓜' } },
          { ingredient: { name: '鸡胸肉', type: 'FOOD' }, nutritionFood: { name: '鸡胸肉' } },
          { ingredient: null, nutritionFood: { name: '糙米' } },
          { ingredient: { name: '三文鱼', type: 'FOOD' }, nutritionFood: { name: '三文鱼' } },
          { ingredient: { name: '牛肉', type: 'FOOD' }, nutritionFood: { name: '牛肉' } },
          { ingredient: { name: '鸭肉', type: 'FOOD' }, nutritionFood: { name: '鸭肉' } },
        ],
      },
    ]);

    await service.generateForSeries('series-1');

    expect(coverImageService.generate).toHaveBeenCalledWith({
      recipeName: '鸡肉南瓜餐',
      foodNames: ['鸡胸肉', '南瓜', '糙米', '三文鱼', '牛肉'],
      layout: 'COVER_16_9',
    });
  });

  it('没有带食材的草稿：只用系列名生成', async () => {
    const result = await service.generateForSeries('series-1');

    expect(coverImageService.generate).toHaveBeenCalledWith({
      recipeName: '鸡肉南瓜餐',
      foodNames: [],
      layout: 'COVER_16_9',
    });
    expect(result.foodNames).toEqual([]);
  });

  it('未上线 + save=true：只写系列封面，返回 saved=true', async () => {
    const result = await service.generateForSeries('series-1', { save: true });

    expect(prisma.recipeSeries.update).toHaveBeenCalledWith({
      where: { id: 'series-1' },
      data: { coverImageUrl: 'https://cos.example.com/ai.jpg' },
    });
    expect(result.saved).toBe(true);
  });

  it('已上线（businessStatus=PUBLIC）+ save=true：强制预览，不落库', async () => {
    prisma.recipeSeries.findUnique.mockResolvedValue(
      series({ businessStatus: 'PUBLIC' }),
    );

    const result = await service.generateForSeries('series-1', { save: true });

    expect(prisma.recipeSeries.update).not.toHaveBeenCalled();
    expect(result.saved).toBe(false);
  });

  it('已上线（有 PUBLIC 食谱行）+ save=true：强制预览，不落库', async () => {
    prisma.recipe.count.mockResolvedValue(2);

    const result = await service.generateForSeries('series-1', { save: true });

    expect(prisma.recipe.count).toHaveBeenCalledWith({
      where: { seriesId: 'series-1', status: 'PUBLIC' },
    });
    expect(prisma.recipeSeries.update).not.toHaveBeenCalled();
    expect(result.saved).toBe(false);
  });

  it('save=false：只预览，不写库', async () => {
    const result = await service.generateForSeries('series-1');

    expect(prisma.recipeSeries.update).not.toHaveBeenCalled();
    expect(result.saved).toBe(false);
  });

  it('生图失败：错误原样抛出，不写库', async () => {
    coverImageService.generate.mockRejectedValue(new Error('生图超时'));

    await expect(
      service.generateForSeries('series-1', { save: true }),
    ).rejects.toThrow('生图超时');
    expect(prisma.recipeSeries.update).not.toHaveBeenCalled();
  });
});
