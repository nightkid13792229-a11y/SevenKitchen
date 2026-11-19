import {
  NO_EVIDENCE_PREFIX,
  NO_RECOMMENDATION_REASON,
  enforceCitationRule,
  pageKey,
  type FormAdvice,
  type FormOption,
} from '../supplement-form-advice';

const DOC = 'fediaf-FEDIAF-2025';

function option(overrides: Partial<FormOption> = {}): FormOption {
  return {
    level: 'OXIDE',
    labelZh: '氧化物',
    examples: ['氧化铜'],
    verdict: 'AVOID',
    reason: '生物利用率低',
    citations: [
      {
        documentId: DOC,
        documentName: 'FEDIAF 2025',
        page: 42,
        quote: 'copper oxide should not be considered as a copper source',
      },
    ],
    ...overrides,
  };
}

function advice(overrides: Partial<FormAdvice> = {}): FormAdvice {
  return {
    nutrientKey: 'minerals.copper',
    nutrientLabel: '铜',
    options: [option()],
    recommendedLevel: 'OXIDE',
    recommendationReason: '只有它有原文',
    gaps: [],
    ...overrides,
  };
}

describe('enforceCitationRule', () => {
  it('引用了没读过的页 → 丢弃该引用并降级', () => {
    const result = enforceCitationRule(advice(), new Set([pageKey(DOC, 41)]));
    expect(result.options[0]!.citations).toHaveLength(0);
    expect(result.options[0]!.verdict).toBe('NO_EVIDENCE');
    expect(result.options[0]!.reason.startsWith(NO_EVIDENCE_PREFIX)).toBe(true);
  });

  it('引用全在读过页 → 原样通过，文档名照旧', () => {
    const result = enforceCitationRule(advice(), new Set([pageKey(DOC, 42)]));
    expect(result.options[0]!.verdict).toBe('AVOID');
    expect(result.options[0]!.citations).toHaveLength(1);
  });

  it('文档清单里没有的文档 id → 视为编造，丢弃', () => {
    const titles = new Map([['nrc-NRC-2006', 'NRC 2006']]);
    const result = enforceCitationRule(advice(), new Set([pageKey(DOC, 42)]), titles);
    expect(result.options[0]!.citations).toHaveLength(0);
    expect(result.options[0]!.verdict).toBe('NO_EVIDENCE');
  });

  it('文档名以知识库清单为准，不用模型写的', () => {
    const titles = new Map([[DOC, 'FEDIAF Nutritional Guidelines 2025']]);
    const result = enforceCitationRule(advice(), new Set([pageKey(DOC, 42)]), titles);
    expect(result.options[0]!.citations[0]!.documentName).toBe(
      'FEDIAF Nutritional Guidelines 2025',
    );
  });

  it('推荐档位被降级 → 不给推荐，理由改成让人判断', () => {
    const result = enforceCitationRule(advice(), new Set());
    expect(result.recommendedLevel).toBeNull();
    expect(result.recommendationReason).toBe(NO_RECOMMENDATION_REASON);
  });

  it('降级会在 gaps 里留一条，方便页面写「没覆盖到」', () => {
    const result = enforceCitationRule(advice(), new Set());
    expect(result.gaps.join(' ')).toContain('氧化物这一档没有可引用的原文');
  });

  it('本来就是 NO_EVIDENCE 的条目不动', () => {
    const result = enforceCitationRule(
      advice({
        options: [option({ verdict: 'NO_EVIDENCE', reason: '库里没有', citations: [] })],
        recommendedLevel: null,
        recommendationReason: '没有推荐',
      }),
      new Set(),
    );
    expect(result.options[0]!.reason).toBe('库里没有');
    expect(result.options[0]!.verdict).toBe('NO_EVIDENCE');
  });

  it('不修改传入对象', () => {
    const input = advice();
    enforceCitationRule(input, new Set());
    expect(input.options[0]!.verdict).toBe('AVOID');
    expect(input.recommendedLevel).toBe('OXIDE');
  });
});
