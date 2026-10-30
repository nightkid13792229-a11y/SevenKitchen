import { RecipeTaxonomyService } from 'src/application/recipe-taxonomy/recipe-taxonomy.service';

function createService(overrides: {
  kinds?: unknown[];
  nodes?: unknown[];
  grouped?: unknown[];
}) {
  const prisma = {
    recipeTaxonomyKind: {
      findMany: jest.fn().mockResolvedValue(overrides.kinds ?? []),
    },
    recipeTaxonomyNode: {
      findMany: jest.fn().mockResolvedValue(overrides.nodes ?? []),
    },
    recipeSeriesTaxonomy: {
      groupBy: jest.fn().mockResolvedValue(overrides.grouped ?? []),
    },
  };
  return {
    prisma,
    service: new RecipeTaxonomyService(prisma as never),
  };
}

describe('RecipeTaxonomyService.getTree', () => {
  it('返回的分类按 sort 升序，节点带直接计数与 rollup', async () => {
    const { service } = createService({
      kinds: [
        { id: 'k2', code: 'SCENARIO', name: '场景', sort: 30 },
        { id: 'k1', code: 'MAIN_PROTEIN', name: '主蛋白', sort: 10 },
      ],
      nodes: [
        {
          id: 'n1',
          kindId: 'k1',
          parentId: null,
          name: '鱼类',
          definition: 'd',
          sort: 10,
          status: 'ACTIVE',
        },
        {
          id: 'n2',
          kindId: 'k1',
          parentId: 'n1',
          name: '三文鱼',
          definition: 'd',
          sort: 10,
          status: 'ACTIVE',
        },
      ],
      grouped: [{ nodeId: 'n2', _count: { _all: 3 } }],
    });

    const tree = await service.getTree();

    expect(tree.map((kind) => kind.code)).toEqual(['MAIN_PROTEIN', 'SCENARIO']);
    expect(tree[0].nodes[0].seriesCount).toBe(0);
    expect(tree[0].nodes[0].rollupSeriesCount).toBe(3);
    expect(tree[0].nodes[0].children[0].seriesCount).toBe(3);
    expect(tree[0].rollupSeriesCount).toBe(3);
  });

  it('没有任何归属时计数全为 0，不抛错', async () => {
    const { service } = createService({
      kinds: [{ id: 'k1', code: 'SCENARIO', name: '场景', sort: 30 }],
      nodes: [
        {
          id: 'n1',
          kindId: 'k1',
          parentId: null,
          name: '出行',
          definition: 'd',
          sort: 10,
          status: 'ACTIVE',
        },
      ],
      grouped: [],
    });

    const tree = await service.getTree();
    expect(tree[0].rollupSeriesCount).toBe(0);
  });
});
