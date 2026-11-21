import {
  auditPlanCitations,
  collectKnowledgeCitationIds,
} from '../../../src/application/recipe-designer/agent/citation-audit';

describe('引用审计', () => {
  it('知识库页/锚点会变成可引用 id', () => {
    const ids = collectKnowledgeCitationIds('kb_find', {
      hits: [
        {
          documentId: 'doc-1',
          pageNo: 12,
          anchor: 'page-12',
          blockId: 'block-1',
        },
      ],
    });

    expect(ids).toEqual(
      expect.arrayContaining(['doc-1:12', 'doc-1#12', 'page-12', 'block-1']),
    );
  });

  it('对不上知识库的 citationId 标未核验，但不阻断', () => {
    const audit = auditPlanCitations(
      {
        summary: '方案',
        constraints: [
          {
            key: 'zinc',
            label: '锌',
            min: 15,
            max: null,
            unit: 'PER_1000_KCAL',
            basis: 'FEDIAF',
            source: 'FEDIAF 2025',
            citationId: 'doc-1:12',
            hard: true,
          },
          {
            key: 'iron',
            label: '铁',
            min: 10,
            max: null,
            unit: 'PER_1000_KCAL',
            basis: 'FEDIAF',
            source: 'FEDIAF 2025',
            citationId: 'fake:99',
            hard: true,
          },
        ],
        nonNutrient: [],
      },
      ['doc-1:12', 'doc-1#12'],
    );

    expect(audit.citedCount).toBe(2);
    expect(audit.verified).toEqual(['doc-1:12']);
    expect(audit.unverified).toEqual(['fake:99']);
  });
});
