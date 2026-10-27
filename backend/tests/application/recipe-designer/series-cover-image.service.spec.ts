import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SeriesCoverImageService } from 'src/application/recipe-designer/series-cover-image.service';

/**
 * 系列封面取数（2026-10-27 老板口径）
 *
 * · 阶段优先级：普通成年犬 → 14 周以上幼犬 → 低能量成犬/老年犬 → 繁殖期；
 * · 取该阶段最新一份有食材的设计草稿；没有草稿再退回该阶段食谱；
 * · 四个优先阶段都没有 → 回退到最近一份有食材的草稿；
 * · 抽「名字 + 占比 + 部位/状态/预处理整串」，排除补剂/包材/零重量/水；
 * · 占比归一化；同一名字+预处理的合并。
 */

const series = (overrides: Record<string, unknown> = {}) => ({
  id: 'series-1',
  name: '鸭肉南瓜燕麦',
  status: 'ACTIVE',
  deletedAt: null,
  designMode: 'CATALOG',
  businessStatus: 'DRAFT',
  ...overrides,
});

const item = (overrides: Record<string, unknown> = {}) => ({
  weightG: 100,
  ratioPercent: null,
  preparationMethod: null,
  ingredient: { name: '鸡胸肉', type: 'FOOD' },
  nutritionFood: { name: '鸡胸肉' },
  ...overrides,
});

const draft = (stage: string | null, items: unknown[]) => ({
  id: `draft-${stage}`,
  seriesLifeStage: stage,
  updatedAt: new Date('2026-10-27T00:00:00.000Z'),
  items,
});

describe('SeriesCoverImageService', () => {
  const prisma = {
    recipeSeries: { findUnique: jest.fn(), update: jest.fn() },
    recipe: { count: jest.fn(), findFirst: jest.fn() },
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
    prisma.recipe.findFirst.mockResolvedValue(null);
    prisma.designRecipe.findMany.mockResolvedValue([
      draft('HIGH_ACTIVITY_ADULT', [
        item({
          ingredient: { name: '鸡胸肉', type: 'FOOD' },
          preparationMethod: '鸡胸/生/去皮',
          ratioPercent: 100,
        }),
      ]),
    ]);
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

  it('阶段优先级：普通成年犬优先，即使顺序靠后', async () => {
    prisma.designRecipe.findMany.mockResolvedValue([
      draft('REPRODUCTION', [item({ ingredient: { name: '繁殖期食材', type: 'FOOD' } })]),
      draft('LOW_ACTIVITY_ADULT_OR_SENIOR', [
        item({ ingredient: { name: '老年犬食材', type: 'FOOD' } }),
      ]),
      draft('PUPPY_14_WEEKS_PLUS', [
        item({ ingredient: { name: '幼犬食材', type: 'FOOD' } }),
      ]),
      draft('HIGH_ACTIVITY_ADULT', [
        item({ ingredient: { name: '成年犬食材', type: 'FOOD' } }),
      ]),
    ]);

    const result = await service.generateForSeries('series-1');

    expect(result.stageCode).toBe('HIGH_ACTIVITY_ADULT');
    expect(coverImageService.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        ingredients: [
          expect.objectContaining({ name: '成年犬食材', ratioPercent: 100 }),
        ],
        layout: 'COVER_16_9',
      }),
    );
  });

  it('普通成年犬没有可用食材 → 依次降级到幼犬 / 老年犬 / 繁殖期', async () => {
    prisma.designRecipe.findMany.mockResolvedValue([
      draft('HIGH_ACTIVITY_ADULT', [
        item({ ingredient: { name: '鸡肉粉', type: 'SUPPLEMENT' } }),
      ]),
      draft('PUPPY_14_WEEKS_PLUS', [
        item({ ingredient: { name: '幼犬食材', type: 'FOOD' } }),
      ]),
      draft('LOW_ACTIVITY_ADULT_OR_SENIOR', [
        item({ ingredient: { name: '老年犬食材', type: 'FOOD' } }),
      ]),
      draft('REPRODUCTION', [
        item({ ingredient: { name: '繁殖期食材', type: 'FOOD' } }),
      ]),
    ]);

    let result = await service.generateForSeries('series-1');
    expect(result.stageCode).toBe('PUPPY_14_WEEKS_PLUS');
    expect(result.foodNames).toEqual(['幼犬食材']);

    prisma.designRecipe.findMany.mockResolvedValue([
      draft('HIGH_ACTIVITY_ADULT', [
        item({ ingredient: { name: '鸡肉粉', type: 'SUPPLEMENT' } }),
      ]),
      draft('LOW_ACTIVITY_ADULT_OR_SENIOR', [
        item({ ingredient: { name: '老年犬食材', type: 'FOOD' } }),
      ]),
      draft('REPRODUCTION', [
        item({ ingredient: { name: '繁殖期食材', type: 'FOOD' } }),
      ]),
    ]);
    result = await service.generateForSeries('series-1');
    expect(result.stageCode).toBe('LOW_ACTIVITY_ADULT_OR_SENIOR');

    prisma.designRecipe.findMany.mockResolvedValue([
      draft('HIGH_ACTIVITY_ADULT', [
        item({ ingredient: { name: '鸡肉粉', type: 'SUPPLEMENT' } }),
      ]),
      draft('REPRODUCTION', [
        item({ ingredient: { name: '繁殖期食材', type: 'FOOD' } }),
      ]),
    ]);
    result = await service.generateForSeries('series-1');
    expect(result.stageCode).toBe('REPRODUCTION');
  });

  it('同一阶段有多份草稿：用最新一份有食材的', async () => {
    prisma.designRecipe.findMany.mockResolvedValue([
      draft('HIGH_ACTIVITY_ADULT', [
        item({ ingredient: { name: '最新食材', type: 'FOOD' } }),
      ]),
      draft('HIGH_ACTIVITY_ADULT', [
        item({ ingredient: { name: '旧食材', type: 'FOOD' } }),
      ]),
    ]);

    await service.generateForSeries('series-1');

    expect(coverImageService.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        ingredients: [expect.objectContaining({ name: '最新食材' })],
      }),
    );
  });

  it('该阶段没有设计草稿：退回该阶段已发布/草稿食谱', async () => {
    prisma.designRecipe.findMany.mockResolvedValue([]);
    prisma.recipe.findFirst.mockResolvedValue({
      seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
      items: [
        item({
          ingredient: { name: '食谱食材', type: 'FOOD' },
          preparationMethod: '部位/生/去骨',
          ratioPercent: 100,
        }),
      ],
    });

    const result = await service.generateForSeries('series-1');

    expect(prisma.recipe.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          seriesId: 'series-1',
          seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
        }),
      }),
    );
    expect(result.stageCode).toBe('HIGH_ACTIVITY_ADULT');
    expect(result.foodNames).toEqual(['食谱食材']);
  });

  it('四个优先阶段都没有：回退到最近一份有食材的草稿', async () => {
    prisma.designRecipe.findMany.mockResolvedValue([
      draft('PUPPY_UNDER_14_WEEKS', [
        item({ ingredient: { name: '小幼犬食材', type: 'FOOD' } }),
      ]),
    ]);

    const result = await service.generateForSeries('series-1');

    expect(result.stageCode).toBe('PUPPY_UNDER_14_WEEKS');
    expect(coverImageService.generate).toHaveBeenCalled();
  });

  it('一条可用食材都没有：400，不调 generate', async () => {
    prisma.designRecipe.findMany.mockResolvedValue([]);
    prisma.recipe.findFirst.mockResolvedValue(null);

    await expect(service.generateForSeries('series-1')).rejects.toThrow(
      '还没有可用于生成封面的食材',
    );
    expect(coverImageService.generate).not.toHaveBeenCalled();
  });

  it('抽名字 + 占比 + 部位/状态/预处理整串；排除补剂/包材/零重量/水；归一化', async () => {
    prisma.designRecipe.findMany.mockResolvedValue([
      draft('HIGH_ACTIVITY_ADULT', [
        item({
          ingredient: { name: '鸭胸肉', type: 'FOOD' },
          preparationMethod: '鸭胸/熟/去皮',
          ratioPercent: 30,
        }),
        item({
          ingredient: { name: '南瓜', type: 'FOOD' },
          preparationMethod: '生/去皮切块',
          ratioPercent: 20,
        }),
        item({
          ingredient: { name: '鸭胸肉', type: 'FOOD' },
          preparationMethod: '鸭胸/熟/去皮',
          ratioPercent: 10,
        }),
        item({ ingredient: { name: '鸡肉粉', type: 'SUPPLEMENT' }, ratioPercent: 30 }),
        item({ ingredient: { name: '包装袋', type: 'PACKAGING' }, ratioPercent: 5 }),
        item({ ingredient: { name: '水', type: 'FOOD' }, ratioPercent: 5 }),
        item({
          ingredient: { name: '零重量', type: 'FOOD' },
          weightG: 0,
          ratioPercent: 0,
        }),
      ]),
    ]);

    await service.generateForSeries('series-1');

    expect(coverImageService.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        ingredients: [
          {
            name: '鸭胸肉',
            preparationMethod: '鸭胸/熟/去皮',
            ratioPercent: 67,
          },
          { name: '南瓜', preparationMethod: '生/去皮切块', ratioPercent: 33 },
        ],
      }),
    );
  });

  it('没有占比时用重量算；没有部位/预处理时留空', async () => {
    prisma.designRecipe.findMany.mockResolvedValue([
      draft('HIGH_ACTIVITY_ADULT', [
        item({
          ingredient: { name: '鸡胸肉', type: 'FOOD' },
          weightG: 300,
          ratioPercent: null,
          preparationMethod: null,
        }),
        item({
          ingredient: { name: '南瓜', type: 'FOOD' },
          weightG: 100,
          ratioPercent: null,
          preparationMethod: '生/切块',
        }),
      ]),
    ]);

    await service.generateForSeries('series-1');

    expect(coverImageService.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        ingredients: [
          { name: '鸡胸肉', preparationMethod: null, ratioPercent: 75 },
          { name: '南瓜', preparationMethod: '生/切块', ratioPercent: 25 },
        ],
      }),
    );
  });

  it('未上线 + save=true：只写系列封面，返回 saved=true', async () => {
    const result = await service.generateForSeries('series-1', { save: true });
    expect(prisma.recipeSeries.update).toHaveBeenCalledWith({
      where: { id: 'series-1' },
      data: { coverImageUrl: 'https://cos.example.com/ai.jpg' },
    });
    expect(result.saved).toBe(true);
  });

  it('已上线 + save=true：强制预览，不落库', async () => {
    prisma.recipeSeries.findUnique.mockResolvedValue(
      series({ businessStatus: 'PUBLIC' }),
    );
    const result = await service.generateForSeries('series-1', { save: true });
    expect(prisma.recipeSeries.update).not.toHaveBeenCalled();
    expect(result.saved).toBe(false);
  });

  it('生成期间系列被发布：写库前再判一次，不落库', async () => {
    coverImageService.generate.mockImplementation(async () => {
      prisma.recipe.count.mockResolvedValue(1);
      return {
        url: 'https://cos.example.com/ai.jpg',
        provider: 'ZHIPU',
        model: 'glm-image',
      };
    });

    const result = await service.generateForSeries('series-1', { save: true });

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
