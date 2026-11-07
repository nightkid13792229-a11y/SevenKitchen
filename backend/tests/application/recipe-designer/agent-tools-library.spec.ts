import { AGENT_TOOLS, executeTool } from '../../../src/application/recipe-designer/agent/tools';
import { CitationRegistry } from '../../../src/application/recipe-designer/agent/citation-registry';

describe('Agent 工具：search_knowledge_library', () => {
  it('已注册到 Agent 工具清单', () => {
    const names = AGENT_TOOLS.map((item) => item.function.name);
    expect(names).toContain('search_knowledge_library');
    expect(names).not.toContain('read_knowledge');
  });

  it('把原文段落和来源/页码回给模型', async () => {
    const search = jest.fn().mockResolvedValue([
      {
        id: 'sacn5-chapters-SACN5-37-p00149-1',
        text: 'Phosphorus 0.2 to 0.5% in foods for dogs.',
        truncated: false,
        sourceId: 'SACN5',
        sourceName: '小动物临床营养学（第5版）',
        documentId: 'sacn5-chapters-SACN5-37',
        documentTitle: 'SACN5_37.pdf',
        sectionId: 'sacn5-chapters-SACN5-37-s014',
        sectionTitle: '787 Chronic Kidney Disease',
        pageStart: 17,
        score: 10,
      },
    ]);
    const outcome = await executeTool(
      'search_knowledge_library',
      { query: 'CKD phosphorus', sourceIds: ['SACN5'], limit: 3 },
      {
        port: {} as any,
        catalog: {} as any,
        library: { search } as any,
        citations: new CitationRegistry(),
        onAsk: jest.fn(),
      },
    );

    expect(search).toHaveBeenCalledWith(
      'CKD phosphorus',
      expect.objectContaining({
        sourceIds: ['SACN5'],
        limit: 3,
        documentIds: expect.arrayContaining(['sacn5-chapters-SACN5-37']),
      }),
    );
    expect(outcome.ok).toBe(true);
    expect(outcome.data).toMatchObject({ count: 1 });
    expect(outcome.summary).toContain('SACN5');
    expect(outcome.summary).toContain('p17');
    expect(outcome.summary).toContain('[K1]');
    expect((outcome.data as any).passages[0].citationId).toBe('K1');
  });

  it('assess 摘要带出缺口数值和目标范围', async () => {
    const outcome = await executeTool(
      'assess',
      {},
      {
        port: {
          assess: jest.fn().mockResolvedValue({
            isCompliant: false,
            contentRevision: 35,
            totalEnergyKcal: 1681.58,
            counts: { compliant: 38, deficient: 1, excess: 0, missingData: 0 },
            gaps: [
              {
                key: 'phosphorus',
                label: '磷',
                status: 'DEFICIENT',
                value: 0.18,
                min: 0.2,
                max: 0.5,
                unit: '%DM',
              },
            ],
            allergens: [],
          }),
        } as any,
        catalog: {} as any,
        library: {} as any,
        citations: new CitationRegistry(),
        onAsk: jest.fn(),
      },
    );

    expect(outcome.ok).toBe(true);
    expect(outcome.summary).toContain('磷 0.18 %DM');
    expect(outcome.summary).toContain('目标 0.2–0.5 %DM');
  });

  it('assess 把目标覆盖传给评估，并要求引用存在', async () => {
    const assess = jest.fn().mockResolvedValue({
      isCompliant: false,
      contentRevision: 1,
      totalEnergyKcal: 1000,
      counts: { compliant: 1, deficient: 0, excess: 0, missingData: 0 },
      gaps: [],
      allergens: [],
    });
    const citations = new CitationRegistry();
    citations.register({
      id: 'p1',
      text: 'Phosphorus 0.2 to 0.5% DM.',
      truncated: false,
      sourceId: 'SACN5',
      sourceName: '小动物临床营养学（第5版）',
      documentId: 'd1',
      documentTitle: 'd1',
      sectionId: 's1',
      sectionTitle: 'CKD',
      pageStart: 17,
      score: 1,
    } as any);
    const outcome = await executeTool(
      'assess',
      {
        targetOverrides: [
          {
            nutrientKey: 'phosphorus',
            basis: 'DM',
            minValue: 0.2,
            maxValue: 0.5,
            citationId: 'K1',
          },
        ],
      },
      {
        port: { assess } as any,
        catalog: {} as any,
        library: {} as any,
        citations,
        onAsk: jest.fn(),
      },
    );

    expect(assess).toHaveBeenCalledWith([
      {
        nutrientKey: 'phosphorus',
        basis: 'DM',
        minValue: 0.2,
        maxValue: 0.5,
        citationId: 'K1',
      },
    ]);
    expect(outcome.summary).toContain('已应用 1 个目标覆盖');
  });

  it('目标覆盖引用不存在时直接报错', async () => {
    const assess = jest.fn();
    const outcome = await executeTool(
      'assess',
      {
        targetOverrides: [
          {
            nutrientKey: 'phosphorus',
            basis: 'DM',
            minValue: 0.2,
            maxValue: 0.5,
            citationId: 'K99',
          },
        ],
      },
      {
        port: { assess } as any,
        catalog: {} as any,
        library: {} as any,
        citations: new CitationRegistry(),
        onAsk: jest.fn(),
      },
    );
    expect(outcome.ok).toBe(false);
    expect(assess).not.toHaveBeenCalled();
  });

  it('缺 query 直接报错，不打库', async () => {
    const search = jest.fn();
    const outcome = await executeTool(
      'search_knowledge_library',
      {},
      {
        port: {} as any,
        catalog: {} as any,
        library: { search } as any,
        citations: new CitationRegistry(),
        onAsk: jest.fn(),
      },
    );

    expect(outcome.ok).toBe(false);
    expect(search).not.toHaveBeenCalled();
  });
});
