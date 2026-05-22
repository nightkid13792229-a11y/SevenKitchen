import {
  normalizeSearchAliasSuggestionOutput,
} from '../../../src/application/search-governance/search-governance-agent.provider';

describe('search governance agent provider', () => {
  it('normalizes valid agent suggestions and drops malformed entries', () => {
    const result = normalizeSearchAliasSuggestionOutput({
      suggestions: [
        {
          domain: 'INGREDIENT',
          action: 'ADD_ALIAS',
          canonicalTerm: '鸡胸',
          aliases: ['鸡胸肉'],
          riskLevel: 'LOW',
          rationale: '用户高频搜索鸡胸肉后选择鸡胸。',
        },
        {
          domain: 'ORDER',
          action: 'CREATE_GROUP',
          canonicalTerm: '',
          aliases: [],
          riskLevel: 'LOW',
          rationale: 'invalid',
        },
      ],
    });

    expect(result).toEqual([
      {
        domain: 'INGREDIENT',
        action: 'ADD_ALIAS',
        payload: {
          canonicalTerm: '鸡胸',
          aliases: ['鸡胸肉'],
        },
        riskLevel: 'LOW',
        agentRationale: '用户高频搜索鸡胸肉后选择鸡胸。',
      },
    ]);
  });

  it('drops suggestions where aliases contain non-string values', () => {
    const result = normalizeSearchAliasSuggestionOutput({
      suggestions: [
        {
          domain: 'INGREDIENT',
          action: 'ADD_ALIAS',
          canonicalTerm: '鸡胸',
          aliases: ['鸡胸肉', { label: 'chicken breast' }],
          riskLevel: 'LOW',
          rationale: 'invalid alias object',
        },
      ],
    });

    expect(result).toEqual([]);
  });
});
