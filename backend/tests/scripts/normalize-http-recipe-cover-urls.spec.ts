import {
  parseNormalizeArgs,
  runNormalizeHttpCoverUrls,
  toHttpsUrl,
} from '../../scripts/normalize-http-recipe-cover-urls';

describe('normalize-http-recipe-cover-urls', () => {
  it('只把 http:// 前缀换成 https://，其余部分保持不变', () => {
    expect(
      toHttpsUrl('http://img.sevenkitchen.cloud/recipes/1767243972852-a51efe41.jpg'),
    ).toBe(
      'https://img.sevenkitchen.cloud/recipes/1767243972852-a51efe41.jpg',
    );
  });

  it('默认 dry-run，只有显式 --apply 才写库', () => {
    expect(parseNormalizeArgs([])).toEqual({ apply: false });
    expect(parseNormalizeArgs(['--apply'])).toEqual({ apply: true });
  });

  it('dry-run 不写库但仍然报告将处理的行数', async () => {
    const update = jest.fn();
    const counters = await runNormalizeHttpCoverUrls({
      prisma: {
        recipe: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'recipe-1',
              recipeId: 'chain-1',
              version: 2,
              name: '测试食谱',
              status: 'PUBLIC',
              coverImageUrl: 'http://img.sevenkitchen.cloud/recipes/a.jpg',
            },
          ]),
          update,
        },
      },
      apply: false,
      logger: { info: jest.fn(), error: jest.fn() },
    });

    expect(counters).toEqual({ scanned: 1, applied: 0, errors: 0 });
    expect(update).not.toHaveBeenCalled();
  });

  it('--apply 时把封面地址改写成 https', async () => {
    const update = jest.fn().mockResolvedValue({});
    const counters = await runNormalizeHttpCoverUrls({
      prisma: {
        recipe: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'recipe-1',
              recipeId: 'chain-1',
              version: 2,
              name: '测试食谱',
              status: 'PUBLIC',
              coverImageUrl: 'http://img.sevenkitchen.cloud/recipes/a.jpg',
            },
          ]),
          update,
        },
      },
      apply: true,
      logger: { info: jest.fn(), error: jest.fn() },
    });

    expect(counters).toEqual({ scanned: 1, applied: 1, errors: 0 });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'recipe-1' },
      data: {
        coverImageUrl: 'https://img.sevenkitchen.cloud/recipes/a.jpg',
      },
    });
  });
});
