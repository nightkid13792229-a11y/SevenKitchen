import { AGENT_TOOLS, executeTool } from '../../../src/application/recipe-designer/agent/tools';

describe('Agent 工具：search_knowledge_library', () => {
  it('已注册到 Agent 工具清单', () => {
    expect(AGENT_TOOLS.map((item) => item.function.name)).toContain(
      'search_knowledge_library',
    );
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
        knowledge: {} as any,
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

  it('缺 query 直接报错，不打库', async () => {
    const search = jest.fn();
    const outcome = await executeTool(
      'search_knowledge_library',
      {},
      {
        port: {} as any,
        catalog: {} as any,
        knowledge: {} as any,
        library: { search } as any,
        onAsk: jest.fn(),
      },
    );

    expect(outcome.ok).toBe(false);
    expect(search).not.toHaveBeenCalled();
  });
});
