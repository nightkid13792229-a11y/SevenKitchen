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

  it('把物种/分期/主题过滤传给检索', async () => {
    const search = jest.fn().mockResolvedValue([]);
    await executeTool(
      'search_knowledge_library',
      {
        query: 'phosphorus',
        species: 'dog',
        stage: 2,
        topics: ['phosphorus'],
      },
      {
        port: {} as any,
        catalog: {} as any,
        library: { search } as any,
        citations: new CitationRegistry(),
        onAsk: jest.fn(),
      },
    );

    expect(search).toHaveBeenCalledWith(
      'phosphorus',
      expect.objectContaining({
        species: 'dog',
        stage: 2,
        topics: ['phosphorus'],
      }),
    );
  });

  it('query 里写了 stage 2 dog 时自动补过滤', async () => {
    const search = jest.fn().mockResolvedValue([]);
    await executeTool(
      'search_knowledge_library',
      { query: 'IRIS stage 2 dog phosphorus' },
      {
        port: {} as any,
        catalog: {} as any,
        library: { search } as any,
        citations: new CitationRegistry(),
        onAsk: jest.fn(),
      },
    );
    expect(search).toHaveBeenCalledWith(
      'IRIS stage 2 dog phosphorus',
      expect.objectContaining({ species: 'dog', stage: 2 }),
    );
  });

  it('find_food 按 nutrientKey 找原料并透出含量', async () => {
    const findFoods = jest.fn().mockResolvedValue([
      {
        ingredientId: 'i1',
        nutritionFoodId: 'f1',
        name: '火麻仁',
        category: 'FOOD',
        preparationState: '生',
        isPrimary: true,
        nutrientMatch: {
          nutrientKey: 'magnesium',
          label: '镁',
          amount: 700,
          unit: 'mg',
          basis: 'PER_100_G',
          basisLabel: '/100g',
          displayText: '700mg/100g',
        },
      },
    ]);
    const outcome = await executeTool(
      'find_food',
      { nutrientKey: 'magnesium', limit: 5 },
      {
        port: { findFoods } as any,
        catalog: {} as any,
        library: {} as any,
        citations: new CitationRegistry(),
        onAsk: jest.fn(),
      },
    );

    expect(findFoods).toHaveBeenCalledWith({
      search: undefined,
      nutrientKey: 'magnesium',
      limit: 5,
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.data?.[0]?.nutrientMatch?.displayText).toBe('700mg/100g');
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


describe('assess 摘要的缺口与缺数据', () => {
  it('显示还差多少、剂量提示和缺数据覆盖', async () => {
    const port = {
      assess: jest.fn().mockResolvedValue({
        isCompliant: false,
        contentRevision: 1,
        totalEnergyKcal: 3515,
        counts: { compliant: 2, deficient: 1, excess: 0, missingData: 1 },
        gaps: [
          {
            key: 'iodine',
            label: '碘',
            status: 'DEFICIENT',
            value: 0.064,
            min: 0.26,
            max: 2.72,
            unit: 'mg',
            deficit: 0.196,
            doseGuidance: '1片 ≈ 0.064mg/1000kcal；目标 0.26mg；约需 4片',
          },
        ],
        missingData: [
          { key: 'chloride', label: '氯', missingItemCount: 11, totalItemCount: 11 },
        ],
        allergens: [],
      }),
    };
    const outcome = await executeTool(
      'assess',
      {},
      {
        port: port as any,
        catalog: {} as any,
        library: {} as any,
        citations: new CitationRegistry(),
        onAsk: jest.fn(),
      },
    );

    expect(outcome.summary).toContain('还差 0.196 mg');
    expect(outcome.summary).toContain('1片');
    expect(outcome.summary).toContain('缺数据：氯（11/11 原料无数据）');
  });
});
