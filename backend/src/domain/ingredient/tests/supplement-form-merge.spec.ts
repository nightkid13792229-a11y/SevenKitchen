import { mergeCandidates, type KbCandidate, type MarketTerm } from '../supplement-form-candidates';

function kb(overrides: Partial<KbCandidate> = {}): KbCandidate {
  return {
    key: 'oxide',
    labelZh: '氧化物',
    dimension: 'FORM',
    citations: [
      { documentId: 'doc', documentName: 'SACN5', page: 10, quote: 'Oxides of iron should not be used' },
    ],
    verdict: 'AVOID',
    reason: '氧化物不应作为来源',
    ...overrides,
  };
}

function market(overrides: Partial<MarketTerm> = {}): MarketTerm {
  return {
    key: 'bisglycinate',
    labelZh: '双甘氨酸盐',
    dimension: 'FORM',
    count: 9,
    samples: ['Copper Bisglycinate 2 mg'],
    ...overrides,
  };
}

describe('mergeCandidates', () => {
  it('原文有 + 市场有 → EVIDENCED，带市场计数', () => {
    const [row] = mergeCandidates([kb({ key: 'bisglycinate' })], [market()]);
    expect(row.status).toBe('EVIDENCED');
    expect(row.market).toEqual({ count: 9, samples: ['Copper Bisglycinate 2 mg'] });
    expect(row.citations).toHaveLength(1);
  });

  it('只有市场 → MARKET_ONLY，结论强制证据不足', () => {
    const [row] = mergeCandidates([], [market()]);
    expect(row.status).toBe('MARKET_ONLY');
    expect(row.verdict).toBe('NO_EVIDENCE');
    expect(row.reason).toContain('知识库没查到依据');
    expect(row.citations).toHaveLength(0);
  });

  it('只有原文 → EVIDENCED，market 为 null', () => {
    const [row] = mergeCandidates([kb()], []);
    expect(row.status).toBe('EVIDENCED');
    expect(row.market).toBeNull();
  });

  it('两边都没有 → 不产生候选', () => {
    expect(mergeCandidates([], [])).toEqual([]);
  });

  it('大小写/连字符不同的同一个词 → 合并成一条，不重复', () => {
    const rows = mergeCandidates(
      [kb({ key: 'Bis-Glycinate', labelZh: '双甘氨酸盐', verdict: 'ACCEPTABLE', citations: [] })],
      [market({ key: 'bisglycinate' })],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].key).toBe('bisglycinate');
    expect(rows[0].status).toBe('EVIDENCED');
  });

  it('市场里同一个词出现两次也只留一条', () => {
    const rows = mergeCandidates(
      [],
      [market({ key: 'bisglycinate', count: 2 }), market({ key: 'BisGlycinate', count: 3 })],
    );
    expect(rows.filter((row) => row.key === 'bisglycinate')).toHaveLength(1);
  });
});
