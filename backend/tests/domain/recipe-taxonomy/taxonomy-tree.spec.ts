import { buildTaxonomyTree } from 'src/domain/recipe-taxonomy/taxonomy-tree';

const kinds = [
  { id: 'k1', code: 'MAIN_PROTEIN', name: '主蛋白', sort: 10 },
];

const nodes = [
  {
    id: 'n1',
    kindId: 'k1',
    parentId: null,
    name: '鱼类',
    definition: 'd',
    sort: 10,
    status: 'ACTIVE' as const,
  },
  {
    id: 'n2',
    kindId: 'k1',
    parentId: 'n1',
    name: '三文鱼',
    definition: 'd',
    sort: 10,
    status: 'ACTIVE' as const,
  },
  {
    id: 'n3',
    kindId: 'k1',
    parentId: 'n1',
    name: '鳕鱼',
    definition: 'd',
    sort: 20,
    status: 'DISABLED' as const,
  },
];

describe('buildTaxonomyTree', () => {
  it('按 parentId 组装两层，并按 sort 升序', () => {
    const tree = buildTaxonomyTree(kinds, nodes, {});
    expect(tree).toHaveLength(1);
    expect(tree[0].nodes[0].children.map((child) => child.name)).toEqual([
      '三文鱼',
      '鳕鱼',
    ]);
  });

  it('父节点 rollup 等于子孙直接计数之和', () => {
    const tree = buildTaxonomyTree(kinds, nodes, { n2: 4, n3: 2 });
    expect(tree[0].nodes[0].children.map((child) => child.seriesCount)).toEqual([
      4, 2,
    ]);
    expect(tree[0].nodes[0].rollupSeriesCount).toBe(6);
    expect(tree[0].rollupSeriesCount).toBe(6);
  });

  it('孤儿节点（父不存在）提升为一级，不丢失', () => {
    const withOrphan = [
      ...nodes,
      {
        id: 'n9',
        kindId: 'k1',
        parentId: 'gone',
        name: '孤儿',
        definition: 'd',
        sort: 5,
        status: 'ACTIVE' as const,
      },
    ];
    const tree = buildTaxonomyTree(kinds, withOrphan, {});
    expect(tree[0].nodes.map((node) => node.name)).toContain('孤儿');
  });

  it('sort 相同时按名称排序，保证顺序稳定', () => {
    const sameSort = [
      {
        id: 'a1',
        kindId: 'k1',
        parentId: null,
        name: '乙',
        definition: 'd',
        sort: 10,
        status: 'ACTIVE' as const,
      },
      {
        id: 'a2',
        kindId: 'k1',
        parentId: null,
        name: '甲',
        definition: 'd',
        sort: 10,
        status: 'ACTIVE' as const,
      },
    ];
    const tree = buildTaxonomyTree(kinds, sameSort, {});
    expect(tree[0].nodes.map((node) => node.name)).toEqual(['乙', '甲']);
  });

  it('不修改入参数组', () => {
    const snapshot = JSON.stringify(nodes);
    buildTaxonomyTree(kinds, nodes, { n2: 1 });
    expect(JSON.stringify(nodes)).toBe(snapshot);
  });
});
