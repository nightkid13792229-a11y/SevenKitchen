import {
  describeRecommendation,
  sortRecommendations,
  type RecommendationCandidate,
} from '../../../src/application/supplement-shop/supplement-equivalence-recommend.logic';

function candidate(
  overrides: Partial<RecommendationCandidate> = {},
): RecommendationCandidate {
  return {
    groupId: 'g1',
    code: 'IODINE_NATURAL',
    name: '碘 · 天然来源',
    status: 'APPROVED',
    memberCount: 3,
    sameUnit: true,
    nutrientLabel: '碘',
    nutrientUnit: 'μg',
    actualUnit: null,
    ...overrides,
  };
}

describe('等价组推荐 · 原因文案', () => {
  it('单位一致 + 已审核 → 说清「加入后要重新审核」，不说可以直接用', () => {
    const text = describeRecommendation(candidate());
    expect(text).toContain('重新审核');
    expect(text).not.toContain('可以直接用');
  });

  it('草稿组 → 明说加入后要审核通过才参与替换', () => {
    const text = describeRecommendation(candidate({ status: 'DRAFT' }));
    expect(text).toContain('草稿');
    expect(text).toContain('审核');
  });

  it('单成员 → 说明加入后就是 2 个成员，但仍要审核', () => {
    const text = describeRecommendation(candidate({ memberCount: 1 }));
    expect(text).toContain('2 个成员');
    expect(text).toContain('审核');
  });

  it('单位不一致 → 指出组要求与档案实际单位', () => {
    const text = describeRecommendation(
      candidate({ sameUnit: false, actualUnit: 'g' }),
    );
    expect(text).toContain('单位不一致');
    expect(text).toContain('μg');
    expect(text).toContain('g');
  });
});

describe('等价组推荐 · 排序', () => {
  it('已审核 + 单位一致的排最前（单成员也算：加入即凑够 2 人）', () => {
    const ranked = sortRecommendations([
      candidate({ groupId: 'draft', name: 'D', status: 'DRAFT' }),
      candidate({ groupId: 'single', name: 'S', memberCount: 1 }),
      candidate({ groupId: 'tiny', name: 'T', memberCount: 2 }),
      candidate({ groupId: 'big', name: 'B', memberCount: 5 }),
      candidate({ groupId: 'bad-unit', name: 'U', sameUnit: false }),
    ]);

    expect(ranked.map((item) => item.groupId)).toEqual([
      'big',
      'tiny',
      'single',
      'draft',
      'bad-unit',
    ]);
  });

  it('不修改入参顺序', () => {
    const list = [candidate({ groupId: 'b', name: 'B' }), candidate({ groupId: 'a', name: 'A' })];
    sortRecommendations(list);
    expect(list.map((item) => item.groupId)).toEqual(['b', 'a']);
  });
});
