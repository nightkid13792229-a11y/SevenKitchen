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
  it('单位一致 + 已审核 + 多成员 → 可以直接用', () => {
    expect(describeRecommendation(candidate())).toContain('可以直接用');
  });

  it('草稿组 → 明说加入也不参与替换', () => {
    const text = describeRecommendation(candidate({ status: 'DRAFT' }));
    expect(text).toContain('草稿');
    expect(text).toContain('不参与替换');
  });

  it('单成员 → 明说只有 1 个成员', () => {
    expect(describeRecommendation(candidate({ memberCount: 1 }))).toContain(
      '只有 1 个成员',
    );
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
  it('能真正参与替换的排最前，其余按状态与成员数', () => {
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
      'bad-unit',
      'single',
      'draft',
    ]);
  });

  it('不修改入参顺序', () => {
    const list = [candidate({ groupId: 'b', name: 'B' }), candidate({ groupId: 'a', name: 'A' })];
    sortRecommendations(list);
    expect(list.map((item) => item.groupId)).toEqual(['b', 'a']);
  });
});
