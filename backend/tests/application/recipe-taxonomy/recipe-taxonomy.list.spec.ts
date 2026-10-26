import { RecipeTaxonomyService } from 'src/application/recipe-taxonomy/recipe-taxonomy.service';

const kinds = [
  { id: 'k-protein', code: 'MAIN_PROTEIN', name: '主蛋白', sort: 10 },
  { id: 'k-health', code: 'HEALTH_NEED', name: '健康需求', sort: 20 },
  { id: 'k-scenario', code: 'SCENARIO', name: '场景', sort: 30 },
  { id: 'k-season', code: 'SEASON', name: '季节', sort: 40 },
  { id: 'k-process', code: 'PROCESS', name: '工艺形态', sort: 50 },
];

function seriesRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 's1',
    name: '三文鱼 · 南瓜糙米',
    businessStatus: 'PUBLIC',
    updatedAt: new Date('2026-10-20T10:00:00Z'),
    taxonomyLinks: [],
    ...overrides,
  };
}

function linkRow(
  nodeId: string,
  name: string,
  kindId: string,
  status = 'ACTIVE',
) {
  const kind = kinds.find((item) => item.id === kindId)!;
  return {
    nodeId,
    kindId,
    node: { id: nodeId, name, kindId, status, kind },
  };
}

function createService(options: {
  rows?: unknown[];
  childNodes?: unknown[];
}) {
  const prisma = {
    recipeTaxonomyKind: {
      findMany: jest.fn().mockResolvedValue(kinds),
    },
    recipeTaxonomyNode: {
      findMany: jest.fn().mockResolvedValue(options.childNodes ?? []),
    },
    recipeSeries: {
      findMany: jest.fn().mockResolvedValue(options.rows ?? []),
      count: jest.fn().mockResolvedValue((options.rows ?? []).length),
    },
  };
  return { prisma, service: new RecipeTaxonomyService(prisma as never) };
}

describe('RecipeTaxonomyService.listSeries', () => {
  it('未归类：查询条件是「一条归属都没有」，五个分类全部出现在 missingKindCodes', async () => {
    const { prisma, service } = createService({ rows: [seriesRow()] });

    const result = await service.listSeries({ unclassified: true });

    expect(prisma.recipeSeries.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { taxonomyLinks: { none: {} } },
      }),
    );
    expect(result.items[0].missingKindCodes).toEqual([
      'MAIN_PROTEIN',
      'HEALTH_NEED',
      'SCENARIO',
      'SEASON',
      'PROCESS',
    ]);
  });

  it('已归部分分类时，其余分类出现在 missingKindCodes，且顺序按分类排序', async () => {
    const { service } = createService({
      rows: [
        seriesRow({
          taxonomyLinks: [linkRow('n-salmon', '三文鱼', 'k-protein')],
        }),
      ],
    });

    const result = await service.listSeries({ nodeId: 'n-salmon' });

    expect(result.items[0].links).toEqual([
      {
        kindId: 'k-protein',
        kindCode: 'MAIN_PROTEIN',
        kindName: '主蛋白',
        nodeId: 'n-salmon',
        nodeName: '三文鱼',
      },
    ]);
    expect(result.items[0].missingKindCodes).toEqual([
      'HEALTH_NEED',
      'SCENARIO',
      'SEASON',
      'PROCESS',
    ]);
  });

  it('查父节点时，条件里同时包含自己和子节点', async () => {
    const { prisma, service } = createService({
      rows: [seriesRow()],
      childNodes: [{ id: 'n-salmon' }, { id: 'n-cod' }],
    });

    await service.listSeries({ nodeId: 'n-fish' });

    expect(prisma.recipeSeries.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          taxonomyLinks: {
            some: { nodeId: { in: ['n-fish', 'n-salmon', 'n-cod'] } },
          },
        },
      }),
    );
  });

  it('节点停用后，归属仍然返回节点名', async () => {
    const { service } = createService({
      rows: [
        seriesRow({
          taxonomyLinks: [
            linkRow('n-cod', '鳕鱼', 'k-protein', 'DISABLED'),
          ],
        }),
      ],
    });

    const result = await service.listSeries({ nodeId: 'n-cod' });
    expect(result.items[0].links[0].nodeName).toBe('鳕鱼');
  });

  it('关键词走 name 模糊匹配，并带分页', async () => {
    const { prisma, service } = createService({ rows: [seriesRow()] });

    await service.listSeries({ keyword: '三文鱼', page: 2, pageSize: 10 });

    expect(prisma.recipeSeries.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { name: { contains: '三文鱼', mode: 'insensitive' } },
        skip: 10,
        take: 10,
      }),
    );
  });

  it('返回总数与系列基础信息', async () => {
    const { service } = createService({ rows: [seriesRow()] });
    const result = await service.listSeries({});
    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({
      id: 's1',
      name: '三文鱼 · 南瓜糙米',
      businessStatus: 'PUBLIC',
      updatedAt: '2026-10-20T10:00:00.000Z',
    });
  });
});
