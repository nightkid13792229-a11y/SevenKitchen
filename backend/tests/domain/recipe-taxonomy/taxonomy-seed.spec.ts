import {
  TAXONOMY_SEED,
  TAXONOMY_KIND_CODES,
  flattenTaxonomySeed,
} from 'src/domain/recipe-taxonomy/taxonomy-seed.data';

describe('需求分类种子数据', () => {
  it('恰好五个分类，code 与约定一致', () => {
    expect(TAXONOMY_SEED.map((kind) => kind.code)).toEqual([
      ...TAXONOMY_KIND_CODES,
    ]);
  });

  it('每个节点都有定义，且不超过 200 字', () => {
    for (const node of flattenTaxonomySeed()) {
      expect(node.definition.trim().length).toBeGreaterThan(0);
      expect(node.definition.length).toBeLessThanOrEqual(200);
    }
  });

  it('同一分类内节点名不重复', () => {
    for (const kind of TAXONOMY_SEED) {
      const names = kind.nodes.flatMap((node) => [
        node.name,
        ...(node.children ?? []).map((child) => child.name),
      ]);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it('只有主蛋白和健康需求是两层，其余一层', () => {
    const twoLevel = TAXONOMY_SEED.filter((kind) =>
      kind.nodes.some((node) => (node.children ?? []).length > 0),
    ).map((kind) => kind.code);
    expect(twoLevel).toEqual(['MAIN_PROTEIN', 'HEALTH_NEED']);
  });

  it('节点总数与词典一致：82 个（含 14 个父节点）', () => {
    expect(flattenTaxonomySeed()).toHaveLength(82);
  });
});
