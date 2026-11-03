import { AGENT_TOOLS, executeTool } from '../../../src/application/recipe-designer/agent/tools';

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
        onAsk: jest.fn(),
      },
    );

    expect(outcome.ok).toBe(true);
    expect(outcome.summary).toContain('磷 0.18 %DM');
    expect(outcome.summary).toContain('目标 0.2–0.5 %DM');
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
        onAsk: jest.fn(),
      },
    );

    expect(outcome.ok).toBe(false);
    expect(search).not.toHaveBeenCalled();
  });
});
