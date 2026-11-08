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

function seriesRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 's1',
    name: '三文鱼 · 南瓜糙米',
    status: 'ACTIVE',
    deletedAt: null,
    businessStatus: 'DRAFT',
    designMode: 'CATALOG',
    coverImageUrl: 'https://img.example.com/cover.jpg',
    coverTitle: null,
    sellingPoint: '鲜肉低敏',
    targetHealthTags: [],
    releaseDraft: null,
    releaseDraftUpdatedAt: null,
    taxonomyLinks: [],
    ...overrides,
  };
}

function createService(options: {
  nodes?: any[];
  missingIds?: string[];
  childCount?: number;
  series?: any;
  seriesRows?: any[];
  liveLinks?: Array<{ kindId: string; nodeId: string }>;
  releaseDraft?: unknown;
  badges?: Array<{ healthTagId: string }>;
}) {
  const tx = jest.fn(async (operations: unknown[]) => Promise.all(operations));
  const series = seriesRow({
    releaseDraft: options.releaseDraft ?? null,
    ...(options.series ?? {}),
  });
  const seriesRows = options.seriesRows ?? [series];

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
    recipeSeries: {
      findUnique: jest.fn().mockResolvedValue(series),
      findMany: jest.fn().mockResolvedValue(seriesRows),
      update: jest.fn(async ({ data }: any) => data),
    },
    recipeSeriesCoverBadge: {
      findMany: jest.fn().mockResolvedValue(options.badges ?? []),
    },
    recipeHealthTag: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    recipeSeriesTaxonomy: {
      findMany: jest.fn().mockResolvedValue(options.liveLinks ?? []),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    $transaction: tx,
  };

  return { prisma, service: new RecipeTaxonomyService(prisma as never) };
}

/** 从 update 调用里取出写进草稿的 taxonomy。 */
function draftTaxonomyOf(prisma: any) {
  const calls = prisma.recipeSeries.update.mock.calls;
  const last = calls[calls.length - 1]?.[0];
  return last?.data?.releaseDraft?.taxonomy;
}

describe('RecipeTaxonomyService.replaceSeriesLinks · 写发布草稿', () => {
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

  it('清空时把草稿里的归类也清空，不直接删线上归属', async () => {
    const { prisma, service } = createService({
      nodes: [],
      liveLinks: [{ kindId: 'k-protein', nodeId: 'n-salmon' }],
    });
    await service.replaceSeriesLinks('s1', [], null);
    expect(draftTaxonomyOf(prisma)).toEqual([]);
    expect(prisma.recipeSeriesTaxonomy.deleteMany).not.toHaveBeenCalled();
  });

  it('跨分类两个节点写进草稿，线上归属不动', async () => {
    const { prisma, service } = createService({
      nodes: [salmon, softStool],
    });
    await service.replaceSeriesLinks('s1', ['n-salmon', 'n-soft'], 'staff-1');
    expect(draftTaxonomyOf(prisma)).toEqual([
      { kindId: 'k-protein', nodeId: 'n-salmon' },
      { kindId: 'k-health', nodeId: 'n-soft' },
    ]);
    expect(prisma.recipeSeries.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: expect.objectContaining({
        releaseDraftUpdatedBy: 'staff-1',
      }),
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('订单定制系列仍直接写线上（不改交付流程）', async () => {
    const { prisma, service } = createService({
      nodes: [salmon],
      series: { designMode: 'ORDER' },
    });
    await service.replaceSeriesLinks('s1', ['n-salmon'], null);
    expect(prisma.recipeSeriesTaxonomy.createMany).toHaveBeenCalledWith({
      data: [
        {
          seriesId: 's1',
          kindId: 'k-protein',
          nodeId: 'n-salmon',
          createdBy: null,
        },
      ],
    });
    expect(prisma.recipeSeries.update).not.toHaveBeenCalled();
  });
});

describe('RecipeTaxonomyService.batchClassify · 写发布草稿', () => {
  it('把同一组节点写进多个系列的草稿', async () => {
    const { prisma, service } = createService({
      nodes: [salmon],
      seriesRows: [
        seriesRow({ id: 's1' }),
        seriesRow({ id: 's2' }),
      ],
    });
    const result = await service.batchClassify(
      ['s1', 's2'],
      ['n-salmon'],
      null,
    );
    expect(result.updated).toBe(2);
    expect(prisma.recipeSeries.update).toHaveBeenCalledTimes(2);
    expect(draftTaxonomyOf(prisma)).toEqual([
      { kindId: 'k-protein', nodeId: 'n-salmon' },
    ]);
  });

  it('批量传空数组等于清空这些系列的草稿归属', async () => {
    const { prisma, service } = createService({
      nodes: [],
      seriesRows: [seriesRow({ id: 's1' })],
      liveLinks: [{ kindId: 'k-protein', nodeId: 'n-salmon' }],
    });
    await service.batchClassify(['s1'], [], null);
    expect(draftTaxonomyOf(prisma)).toEqual([]);
    expect(prisma.recipeSeriesTaxonomy.deleteMany).not.toHaveBeenCalled();
  });

  it('系列列表为空时不做任何写入', async () => {
    const { prisma, service } = createService({ nodes: [salmon] });
    const result = await service.batchClassify([], ['n-salmon'], null);
    expect(result.updated).toBe(0);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.recipeSeries.update).not.toHaveBeenCalled();
  });
});
