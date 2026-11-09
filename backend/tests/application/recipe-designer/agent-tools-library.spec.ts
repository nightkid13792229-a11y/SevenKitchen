import {
  AGENT_TOOLS,
  executeTool,
  type ToolExecutionContext,
} from '../../../src/application/recipe-designer/agent/tools';
import { CitationRegistry } from '../../../src/application/recipe-designer/agent/citation-registry';
import type {
  LibraryPassage,
  SectionHit,
} from '../../../src/application/knowledge-base/knowledge-library.service';
import type {
  SectionView,
  TableView,
} from '../../../src/application/knowledge-base/source-layer.service';

const CKD_DOCUMENT = 'sacn5-chapters-SACN5-37';
const NON_CKD_DOCUMENT = 'aaha-AAHA-2010-Nutritional-Assessment-Guidelines';

function passage(
  id = 'p1',
  overrides: Partial<LibraryPassage> = {},
): LibraryPassage {
  return {
    id,
    text: 'Phosphorus 0.2 to 0.5% in foods for dogs.',
    truncated: false,
    sourceId: 'SACN5',
    sourceName: '小动物临床营养学（第5版）',
    documentId: CKD_DOCUMENT,
    documentTitle: 'SACN5_37.pdf',
    sectionId: 'sacn5-chapters-SACN5-37-s014',
    sectionTitle: '787 Chronic Kidney Disease',
    pageStart: 17,
    score: 10,
    ...overrides,
  };
}

function sectionHit(overrides: Partial<SectionHit> = {}): SectionHit {
  return {
    sectionId: 'sacn5-chapters-SACN5-37-s014',
    sectionTitle: '787 Chronic Kidney Disease',
    displayTitle: '小动物临床营养学（第5版） · 第37章 · p17',
    subheading: null,
    documentId: CKD_DOCUMENT,
    documentTitle: 'SACN5_37.pdf',
    sourceId: 'SACN5',
    sourceName: '小动物临床营养学（第5版）',
    sourceVersion: null,
    pageStart: 17,
    pageEnd: 18,
    score: 10,
    passages: [passage()],
    ...overrides,
  };
}

function tableView(overrides: Partial<TableView> = {}): TableView {
  return {
    tableId: 'T0497',
    caption: 'Table 37-9. Key nutritional factors for dogs with CKD',
    pageNo: 812,
    columns: ['Nutrient', 'Target'],
    rows: [['Phosphorus', '0.2–0.5% DM']],
    rowCount: 1,
    documentId: CKD_DOCUMENT,
    documentTitle: 'SACN5_37.pdf',
    sourceId: 'SACN5',
    sourceName: '小动物临床营养学（第5版）',
    ...overrides,
  };
}

function sectionView(overrides: Partial<SectionView> = {}): SectionView {
  return {
    sectionId: 'sacn5-chapters-SACN5-37-s014',
    title: '787 Chronic Kidney Disease',
    displayTitle: '小动物临床营养学（第5版） · 第37章 · p17',
    documentId: CKD_DOCUMENT,
    documentTitle: 'SACN5_37.pdf',
    sourceId: 'SACN5',
    sourceName: '小动物临床营养学（第5版）',
    sourceVersion: null,
    pageStart: 17,
    pageEnd: 18,
    paragraphs: [
      {
        id: 'p1',
        sectionId: 'sacn5-chapters-SACN5-37-s014',
        text: 'Phosphorus 0.2 to 0.5% DM.',
        pageStart: 17,
        pageEnd: 17,
      },
      {
        id: 'p2',
        sectionId: 'sacn5-chapters-SACN5-37-s014',
        text: 'Protein 14 to 20% DM.',
        pageStart: 18,
        pageEnd: 18,
      },
    ],
    totalParagraphs: 2,
    nextOffset: null,
    anchorFound: true,
    tables: [],
    previousSectionId: null,
    nextSectionId: null,
    ...overrides,
  };
}

function context(
  overrides: Partial<ToolExecutionContext> = {},
): ToolExecutionContext {
  return {
    port: {} as any,
    catalog: {} as any,
    library: {
      searchSections: jest.fn().mockResolvedValue([]),
    } as any,
    sourceLayer: {
      searchTableViews: jest.fn().mockResolvedValue([]),
    } as any,
    citations: new CitationRegistry(),
    onAsk: jest.fn(),
    ...overrides,
  };
}

describe('Agent 工具：知识库检索与打开', () => {
  it('工具清单含 open_knowledge / knowledge_scope，总数为 10', () => {
    const names = AGENT_TOOLS.map((item) => item.function.name);
    expect(names).toContain('search_knowledge_library');
    expect(names).toContain('open_knowledge');
    expect(names).toContain('knowledge_scope');
    expect(names).not.toContain('read_knowledge');
    expect(names).toHaveLength(10);
    const searchTool = AGENT_TOOLS.find(
      (item) => item.function.name === 'search_knowledge_library',
    );
    expect(
      (searchTool!.function.parameters as any).properties.scope,
    ).toBeUndefined();
  });

  it('search 返回节和段落，带 K 号与页码摘要', async () => {
    const searchSections = jest.fn().mockResolvedValue([sectionHit()]);
    const searchTableViews = jest.fn().mockResolvedValue([]);
    const outcome = await executeTool(
      'search_knowledge_library',
      { query: 'CKD phosphorus', sourceIds: ['SACN5'], limit: 3 },
      context({
        library: { searchSections } as any,
        sourceLayer: { searchTableViews } as any,
      }),
    );

    expect(searchSections).toHaveBeenCalledWith(
      'CKD phosphorus',
      expect.objectContaining({
        sourceIds: ['SACN5'],
        limit: 3,
        documentIds: expect.arrayContaining([CKD_DOCUMENT]),
      }),
    );
    expect(searchTableViews).toHaveBeenCalledWith(
      'CKD phosphorus',
      expect.objectContaining({
        sourceIds: ['SACN5'],
        limit: 3,
        documentIds: expect.arrayContaining([CKD_DOCUMENT]),
      }),
    );
    expect(outcome.ok).toBe(true);
    const data = outcome.data as any;
    expect(data.status).toBe('ok');
    expect(data.count).toBe(1);
    expect(data.sections[0].passages[0].citationId).toBe('K1');
    expect(data.tables).toEqual([]);
    expect(outcome.summary).toContain('p17');
    expect(outcome.summary).toContain('[K1]');
  });

  it('search 同时返回表格摘要，段落/表格都有 K 号', async () => {
    const searchSections = jest.fn().mockResolvedValue([sectionHit()]);
    const searchTableViews = jest
      .fn()
      .mockResolvedValue([tableView()]);
    const outcome = await executeTool(
      'search_knowledge_library',
      { query: 'CKD dog key nutritional factors phosphorus' },
      context({
        library: { searchSections } as any,
        sourceLayer: { searchTableViews } as any,
      }),
    );

    const data = outcome.data as any;
    expect(data.sections[0].passages[0].citationId).toBe('K1');
    expect(data.tables).toHaveLength(1);
    expect(data.tables[0]).toMatchObject({
      tableId: 'T0497',
      caption: expect.stringContaining('Table 37-9'),
      rowCount: 1,
      documentId: CKD_DOCUMENT,
      sourceId: 'SACN5',
      citationId: 'K2',
    });
    expect(outcome.summary).toContain('表格 1 张');
  });

  it('0 节返回 no_match 和未覆盖摘要', async () => {
    const outcome = await executeTool(
      'search_knowledge_library',
      { query: 'CKD dog biotin requirement' },
      context(),
    );
    const data = outcome.data as any;
    expect(data.status).toBe('no_match');
    expect(data.count).toBe(0);
    expect(data.sections).toEqual([]);
    expect(outcome.summary).toContain('知识库未覆盖');
  });

  it('把物种/分期/主题提示传给检索', async () => {
    const searchSections = jest.fn().mockResolvedValue([]);
    await executeTool(
      'search_knowledge_library',
      {
        query: 'phosphorus',
        species: 'dog',
        stage: 2,
        topics: ['phosphorus'],
      },
      context({ library: { searchSections } as any }),
    );

    expect(searchSections).toHaveBeenCalledWith(
      'phosphorus',
      expect.objectContaining({
        species: 'dog',
        stage: 2,
        topics: ['phosphorus'],
      }),
    );
  });

  it('query 里写了 stage 2 dog 时自动补提示', async () => {
    const searchSections = jest.fn().mockResolvedValue([]);
    await executeTool(
      'search_knowledge_library',
      { query: 'IRIS stage 2 dog phosphorus' },
      context({ library: { searchSections } as any }),
    );
    expect(searchSections).toHaveBeenCalledWith(
      'IRIS stage 2 dog phosphorus',
      expect.objectContaining({ species: 'dog', stage: 2 }),
    );
  });

  it('open_knowledge 打开表格并登记表格 K 号', async () => {
    const openTable = jest.fn().mockResolvedValue(tableView());
    const citations = new CitationRegistry();
    const outcome = await executeTool(
      'open_knowledge',
      { tableId: 'T0497' },
      context({
        sourceLayer: { openTable } as any,
        citations,
      }),
    );

    expect(openTable).toHaveBeenCalledWith('T0497');
    expect(outcome.ok).toBe(true);
    const data = outcome.data as any;
    expect(data.status).toBe('ok');
    expect(data.table.tableId).toBe('T0497');
    expect(data.citationId).toBe('K1');
    expect(citations.get('K1')?.kind).toBe('table');
    expect(citations.get('K1')?.recordId).toBe('T0497');
  });

  it('citationId 能重新打开被引用的表格', async () => {
    const citations = new CitationRegistry();
    citations.registerTable(tableView());
    const openTable = jest.fn().mockResolvedValue(tableView());
    const outcome = await executeTool(
      'open_knowledge',
      { citationId: 'K1' },
      context({ sourceLayer: { openTable } as any, citations }),
    );
    expect(openTable).toHaveBeenCalledWith('T0497');
    expect((outcome.data as any).citationId).toBe('K1');
  });

  it('open_knowledge 打开节，每段都登记 K 号', async () => {
    const openSection = jest.fn().mockResolvedValue(sectionView());
    const citations = new CitationRegistry();
    const outcome = await executeTool(
      'open_knowledge',
      { sectionId: 'sacn5-chapters-SACN5-37-s014', paragraphOffset: 0 },
      context({ sourceLayer: { openSection } as any, citations }),
    );

    expect(openSection).toHaveBeenCalledWith(
      'sacn5-chapters-SACN5-37-s014',
      expect.objectContaining({ paragraphOffset: 0 }),
    );
    const data = outcome.data as any;
    expect(data.status).toBe('ok');
    expect(data.section.paragraphs).toHaveLength(2);
    expect(data.section.paragraphs[0].citationId).toBe('K1');
    expect(data.section.paragraphs[1].citationId).toBe('K2');
    expect(data.citationIds).toEqual(['K1', 'K2']);
    expect(data.section.paragraphs[0].sourceId).toBe('SACN5');
    expect(data.section.paragraphs[0].documentTitle).toBe('SACN5_37.pdf');
    expect(citations.get('K1')?.sectionId).toBe(
      'sacn5-chapters-SACN5-37-s014',
    );
  });

  it('citationId 能按锚点重新打开被引用的段落所在节', async () => {
    const citations = new CitationRegistry();
    const record = citations.register(passage('p2'));
    const openSection = jest.fn().mockResolvedValue(sectionView());
    await executeTool(
      'open_knowledge',
      { citationId: record.citationId },
      context({ sourceLayer: { openSection } as any, citations }),
    );
    expect(openSection).toHaveBeenCalledWith(
      'sacn5-chapters-SACN5-37-s014',
      expect.objectContaining({ anchorParagraphId: 'p2' }),
    );
  });

  it('非 CKD 表格被拒，且不登记 K 号', async () => {
    const citations = new CitationRegistry();
    const openTable = jest
      .fn()
      .mockResolvedValue(tableView({ documentId: NON_CKD_DOCUMENT }));
    const outcome = await executeTool(
      'open_knowledge',
      { tableId: 'T0001' },
      context({ sourceLayer: { openTable } as any, citations }),
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.error?.message).toContain('CKD');
    expect(citations.records()).toHaveLength(0);
  });

  it('非 CKD 节被拒，且不登记 K 号', async () => {
    const citations = new CitationRegistry();
    const openSection = jest
      .fn()
      .mockResolvedValue(sectionView({ documentId: NON_CKD_DOCUMENT }));
    const outcome = await executeTool(
      'open_knowledge',
      { sectionId: 'other-section' },
      context({ sourceLayer: { openSection } as any, citations }),
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.error?.message).toContain('CKD');
    expect(citations.records()).toHaveLength(0);
  });

  it('knowledge_scope 只列 CKD 5 份文档', async () => {
    const ckdDocuments = [
      'sacn5-chapters-SACN5-37',
      'iris-IRIS-staging-guidelines-2026',
      'iris-IRIS-DOG-Treatment-Recommendations-may-2026',
      'iris-IRIS-Pocket-Guide-to-CKD-June-2026-cn6g',
      'aaha-AAHA-2021-Nutrition-and-Weight-Management-Guidelines',
    ];
    const scope = jest.fn().mockResolvedValue({
      documents: ckdDocuments.map((id) => ({
        id,
        title: id,
        sourceId: 'SACN5',
        sourceName: 'SACN5',
        sections: 1,
        paragraphs: 2,
        tables: 0,
        pageCount: 10,
      })),
      totals: { documents: 5, sections: 5, paragraphs: 10, tables: 0 },
    });
    const outcome = await executeTool(
      'knowledge_scope',
      {},
      context({ sourceLayer: { scope } as any }),
    );

    expect(scope).toHaveBeenCalledWith(
      expect.objectContaining({
        documentIds: expect.arrayContaining(ckdDocuments),
      }),
    );
    expect(scope.mock.calls[0][0].documentIds).toHaveLength(5);
    expect(scope.mock.calls[0][0].documentIds).toEqual(ckdDocuments);
    const data = outcome.data as any;
    expect(data.status).toBe('ok');
    expect(data.documents).toHaveLength(5);
    expect(outcome.summary).toContain('5 份文档');
  });

  it('open_knowledge 三选一缺失时报错', async () => {
    const outcome = await executeTool('open_knowledge', {}, context());
    expect(outcome.ok).toBe(false);
    expect(outcome.error?.message).toContain('三选一');
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
      context({ port: { findFoods } as any }),
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
      context({
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
      }),
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
    citations.register(passage());
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
      context({ port: { assess } as any, citations }),
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
      context({ port: { assess } as any }),
    );
    expect(outcome.ok).toBe(false);
    expect(assess).not.toHaveBeenCalled();
  });

  it('缺 query 直接报错，不打库', async () => {
    const searchSections = jest.fn();
    const outcome = await executeTool(
      'search_knowledge_library',
      {},
      context({ library: { searchSections } as any }),
    );

    expect(outcome.ok).toBe(false);
    expect(searchSections).not.toHaveBeenCalled();
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
      context({ port: port as any }),
    );

    expect(outcome.summary).toContain('还差 0.196 mg');
    expect(outcome.summary).toContain('1片');
    expect(outcome.summary).toContain('缺数据：氯（11/11 原料无数据）');
  });
});
