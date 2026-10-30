import { BadRequestException } from '@nestjs/common';
import { RecipeTaxonomyService } from 'src/application/recipe-taxonomy/recipe-taxonomy.service';

const salmon = {
  id: 'n-salmon',
  kindId: 'k-protein',
  name: '三文鱼',
  status: 'ACTIVE',
};
const chicken = {
  id: 'n-chicken',
  kindId: 'k-protein',
  name: '鸡',
  status: 'ACTIVE',
};
const softStool = {
  id: 'n-soft',
  kindId: 'k-health',
  name: '软便',
  status: 'ACTIVE',
};

function createService(options: {
  nodes?: unknown[];
  missingIds?: string[];
  childCount?: number;
}) {
  const tx = jest.fn(async (operations: unknown[]) => Promise.all(operations));

  const prisma = {
    recipeTaxonomyNode: {
      findMany: jest.fn(async ({ where }: any) => {
        const found = options.nodes ?? [];
        const missing = new Set(options.missingIds ?? []);
        return found.filter(
          (node: any) =>
            where.id.in.includes(node.id) && !missing.has(node.id),
        );
      }),
      count: jest.fn().mockResolvedValue(options.childCount ?? 0),
    },
    recipeSeriesTaxonomy: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    $transaction: tx,
  };

  return { prisma, service: new RecipeTaxonomyService(prisma as never) };
}

describe('RecipeTaxonomyService.replaceSeriesLinks', () => {
  it('同一分类传两个节点直接拒绝', async () => {
    const { service } = createService({ nodes: [salmon, chicken] });
    await expect(
      service.replaceSeriesLinks('s1', ['n-salmon', 'n-chicken'], null),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('传父节点拒绝', async () => {
    const { service } = createService({ nodes: [salmon], childCount: 2 });
    await expect(
      service.replaceSeriesLinks('s1', ['n-salmon'], null),
    ).rejects.toThrow(/叶子/);
  });

  it('停用节点拒绝', async () => {
    const { service } = createService({
      nodes: [{ ...salmon, status: 'DISABLED' }],
    });
    await expect(
      service.replaceSeriesLinks('s1', ['n-salmon'], null),
    ).rejects.toThrow(/停用/);
  });

  it('节点不存在拒绝', async () => {
    const { service } = createService({
      nodes: [salmon],
      missingIds: ['n-gone'],
    });
    await expect(
      service.replaceSeriesLinks('s1', ['n-gone'], null),
    ).rejects.toThrow(/不存在/);
  });

  it('清空时删掉这个系列的全部归属', async () => {
    const { prisma, service } = createService({ nodes: [] });
    await service.replaceSeriesLinks('s1', [], null);
    expect(prisma.recipeSeriesTaxonomy.deleteMany).toHaveBeenCalledWith({
      where: { seriesId: 's1' },
    });
    expect(prisma.recipeSeriesTaxonomy.createMany).not.toHaveBeenCalled();
  });

  it('跨分类两个节点一次写入，按分类各占一条', async () => {
    const { prisma, service } = createService({
      nodes: [salmon, softStool],
    });
    await service.replaceSeriesLinks('s1', ['n-salmon', 'n-soft'], 'staff-1');
    expect(prisma.recipeSeriesTaxonomy.deleteMany).toHaveBeenCalledWith({
      where: { seriesId: 's1', kindId: { in: ['k-protein', 'k-health'] } },
    });
    expect(prisma.recipeSeriesTaxonomy.createMany).toHaveBeenCalledWith({
      data: [
        {
          seriesId: 's1',
          kindId: 'k-protein',
          nodeId: 'n-salmon',
          createdBy: 'staff-1',
        },
        {
          seriesId: 's1',
          kindId: 'k-health',
          nodeId: 'n-soft',
          createdBy: 'staff-1',
        },
      ],
    });
  });
});

describe('RecipeTaxonomyService.batchClassify', () => {
  it('把同一组节点写到多个系列', async () => {
    const { prisma, service } = createService({ nodes: [salmon] });
    const result = await service.batchClassify(
      ['s1', 's2'],
      ['n-salmon'],
      null,
    );
    expect(result.updated).toBe(2);
    expect(prisma.recipeSeriesTaxonomy.createMany).toHaveBeenCalledWith({
      data: [
        { seriesId: 's1', kindId: 'k-protein', nodeId: 'n-salmon', createdBy: null },
        { seriesId: 's2', kindId: 'k-protein', nodeId: 'n-salmon', createdBy: null },
      ],
    });
  });

  it('批量传空数组等于清空这些系列的全部归属', async () => {
    const { prisma, service } = createService({ nodes: [] });
    await service.batchClassify(['s1'], [], null);
    expect(prisma.recipeSeriesTaxonomy.deleteMany).toHaveBeenCalledWith({
      where: { seriesId: { in: ['s1'] } },
    });
  });

  it('系列列表为空时不做任何写入', async () => {
    const { prisma, service } = createService({ nodes: [salmon] });
    const result = await service.batchClassify([], ['n-salmon'], null);
    expect(result.updated).toBe(0);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
