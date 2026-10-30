import { CoverReferenceService } from 'src/application/recipe-designer/cover-reference.service';

describe('CoverReferenceService', () => {
  const prisma = {
    recipeSeries: { count: jest.fn() },
    designRecipe: { count: jest.fn() },
    recipe: { count: jest.fn() },
  };
  const service = new CoverReferenceService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.recipeSeries.count.mockResolvedValue(0);
    prisma.designRecipe.count.mockResolvedValue(0);
    prisma.recipe.count.mockResolvedValue(0);
  });

  it('三张表都没有引用时返回 false', async () => {
    await expect(
      service.isReferenced('https://img.sevenkitchen.cloud/recipes/covers/a.jpg'),
    ).resolves.toBe(false);
  });

  it('系列仍引用时返回 true', async () => {
    prisma.recipeSeries.count.mockResolvedValue(1);
    await expect(
      service.isReferenced('https://img.sevenkitchen.cloud/recipes/covers/a.jpg'),
    ).resolves.toBe(true);
  });

  it('草稿或已发布食谱仍引用时返回 true', async () => {
    prisma.designRecipe.count.mockResolvedValue(2);
    await expect(
      service.isReferenced('https://img.sevenkitchen.cloud/recipes/covers/a.jpg'),
    ).resolves.toBe(true);

    prisma.designRecipe.count.mockResolvedValue(0);
    prisma.recipe.count.mockResolvedValue(1);
    await expect(
      service.isReferenced('https://img.sevenkitchen.cloud/recipes/covers/a.jpg'),
    ).resolves.toBe(true);
  });

  it('空 URL 直接 false，不查库', async () => {
    await expect(service.isReferenced('')).resolves.toBe(false);
    expect(prisma.recipeSeries.count).not.toHaveBeenCalled();
  });
});
