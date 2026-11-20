import { canonicalFormLabel, mergeSynonymCandidates } from '../supplement-form-synonym';
import type { DimensionCandidate } from '../supplement-form-candidates';

function cand(overrides: Partial<DimensionCandidate> = {}): DimensionCandidate {
  return {
    key: 'x',
    labelZh: '甘氨酸铜',
    dimension: 'FORM',
    status: 'MARKET_ONLY',
    citations: [],
    verdict: 'NO_EVIDENCE',
    reason: '市场有',
    market: { count: 2, samples: ['t'] },
    ...overrides,
  };
}

describe('canonicalFormLabel', () => {
  it('去掉修饰词', () => {
    expect(canonicalFormLabel('甘氨酸螯合铜', '铜')).toBe('甘氨酸铜');
    expect(canonicalFormLabel('生物活性铜', '铜')).toBe('');
    expect(canonicalFormLabel('螯合铜', '铜')).toBe('');
  });

  it('只剩营养素名的泛称返回空串（表示丢弃）', () => {
    expect(canonicalFormLabel('铜', '铜')).toBe('');
  });

  it('前端传的是「矿物质 · 铜」也能认出营养素名', () => {
    expect(canonicalFormLabel('铜', '矿物质 · 铜')).toBe('');
  });
});

describe('mergeSynonymCandidates', () => {
  it('甘氨酸铜/双甘氨酸铜/甘氨酸螯合铜 并成一条，其余进 alsoKnownAs', () => {
    const rows = mergeSynonymCandidates(
      [
        cand({ key: 'a', labelZh: '甘氨酸铜' }),
        cand({ key: 'b', labelZh: '双甘氨酸铜', market: { count: 4, samples: ['t2'] } }),
        cand({ key: 'c', labelZh: '甘氨酸螯合铜' }),
      ],
      '铜',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].labelZh).toBe('甘氨酸铜');
    expect(rows[0].alsoKnownAs.sort()).toEqual(['二', '双甘氨酸铜', '甘氨酸螯合铜'].sort().filter((x) => x !== '二'));
  });

  it('泛称/营销词不占一行', () => {
    const rows = mergeSynonymCandidates(
      [cand({ labelZh: '螯合铜' }), cand({ labelZh: '生物活性铜' }), cand({ labelZh: '硫酸铜' })],
      '铜',
    );
    expect(rows.map((row) => row.labelZh)).toEqual(['硫酸铜']);
  });

  it('有原文的那条优先保留结论，引用合并', () => {
    const rows = mergeSynonymCandidates(
      [
        cand({ labelZh: '甘氨酸铜', status: 'MARKET_ONLY' }),
        cand({
          labelZh: '双甘氨酸铜',
          status: 'EVIDENCED',
          verdict: 'ACCEPTABLE',
          citations: [{ documentId: 'd', documentName: 'D', page: 3, quote: 'q' }],
        }),
      ],
      '铜',
    );
    expect(rows[0].status).toBe('EVIDENCED');
    expect(rows[0].verdict).toBe('ACCEPTABLE');
    expect(rows[0].citations).toHaveLength(1);
  });

  it('单字「铜」不会把所有带铜的名字吸成一行', () => {
    const rows = mergeSynonymCandidates(
      [
        cand({ labelZh: '铜', market: { count: 3, samples: [] } }),
        cand({ labelZh: '氧化铜' }),
        cand({ labelZh: '甘氨酸铜' }),
      ],
      '矿物质 · 铜',
    );
    expect(rows.map((row) => row.labelZh).sort()).toEqual(['氧化铜', '甘氨酸铜'].sort());
  });

  it('英文标签不按子串合并（bisglycinate 与 glycinate 不同）', () => {
    const rows = mergeSynonymCandidates(
      [cand({ labelZh: 'bisglycinate' }), cand({ labelZh: 'glycinate' })],
      'copper',
    );
    expect(rows).toHaveLength(2);
  });
});
