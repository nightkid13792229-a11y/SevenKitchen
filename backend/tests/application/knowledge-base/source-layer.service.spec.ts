import { SourceLayerService } from '../../../src/application/knowledge-base/source-layer.service';
import { CKD_DOCUMENT_IDS } from '../../../src/application/knowledge-base/section-catalog.service';

/** 真实表 37-9 的形状（T0497；行为文本摘自导入产物，测试只锁结构）。 */
const CKD_T0497 = {
  id: 'T0497',
  documentId: 'sacn5-chapters-SACN5-37',
  pageNo: 17,
  caption:
    'Table 37-9. Key nutritional factors for dogs and cats with chronic kidney disease.*',
  columns: ['Factors', 'Dietary recommendations'],
  rowCount: 10,
  rows: [
    ['Water', 'Offer water free choice at all times'],
    ['Protein', '14 to 20% in foods for dogs\n28 to 35% in foods for cats'],
    ['Phosphorus', '0.2 to 0.5% in foods for dogs\n0.3 to 0.6% in foods for cats'],
    ['Sodium', '≤0.3% in foods for dogs\n≤0.4% in foods for cats'],
    ['Chloride', '1.5 x sodium levels in foods for dogs'],
    ['Potassium', '0.4 to 0.8% in foods for dogs'],
    ['Omega-3 fatty acids', '0.4 to 2.5% in foods for dogs and cats'],
    ['Antioxidants', ''],
    ['Vitamin E', '≥400 IU vitamin E/kg of food for dogs'],
    ['Vitamin C', '≥100 mg vitamin C/kg of food for dogs'],
  ],
};

/** AAHA 表 8（T0025）：只有 vitamin E/A/C，没有 vitamin K。 */
const CKD_T0025 = {
  id: 'T0025',
  documentId: 'aaha-AAHA-2021-Nutrition-and-Weight-Management-Guidelines',
  pageNo: null,
  caption:
    'TABLE 8 Nutrients of Concern for Diseases and Select Specific Conditions',
  columns: [
    'Disease Category',
    'Specific Conditions',
    'Nutrients of Concern',
    'Notes',
  ],
  rowCount: 20,
  rows: [
    [
      'Inflammatory skin condition',
      'Non-food-related skin condition',
      '• High vitamin A\n• High vitamin E\n• High zinc',
      '',
    ],
    [
      'Urolithiasis',
      'Calcium oxalate',
      '• Controlled calcium with appropriate calcium to phosphorus ratio\n• Avoid vitamin C supplementation',
      '',
    ],
  ],
};

/** 表 37-8 / 37-10：正文顺带提到 phosphorus/phosphate（排名应低于 37-9）。 */
const CKD_T0258 = {
  id: 'T0258',
  documentId: 'sacn5-chapters-SACN5-37',
  pageNo: null,
  caption:
    'Table 37-8. Potential etiopathogenic mechanisms in chronic kidney disease.*',
  columns: ['Mechanism', 'Consequence'],
  rowCount: 10,
  rows: [
    ['Phosphate retention', 'Phosphorus retention and hyperphosphatemia'],
    ['Proteinuria', 'Glomerular hypertension'],
  ],
};

const CKD_T0259 = {
  id: 'T0259',
  documentId: 'sacn5-chapters-SACN5-37',
  pageNo: null,
  caption:
    'Table 37-10. Summary of evidence for treatments of chronic kidney disease.*',
  columns: ['Treatment', 'Evidence'],
  rowCount: 5,
  rows: [
    ['Dietary phosphate restriction', 'Reduces phosphorus intake'],
    ['Protein restriction', 'Reduces proteinuria'],
  ],
};

/** 表 37-11：caption 有 key nutritional factors，但行里只有数值，没有 phosphorus 字样。 */
const CKD_T0260 = {
  id: 'T0260',
  documentId: 'sacn5-chapters-SACN5-37',
  pageNo: null,
  caption:
    'Table 37-11. Key nutritional factors in selected commercial veterinary therapeutic foods for dogs with chronic kidney disease compared to recommended levels.*',
  columns: ['', 'Protein (%)', 'P (%)', 'Na (%)'],
  rowCount: 2,
  rows: [
    ['Diet A', '14.5', '0.22', '0.18'],
    ['Diet B', '16.0', '0.28', '0.20'],
  ],
};

/** 非核心表：行标签也叫 Phosphorus，同分时不能把核心表 37-9 挤出前 3。 */
const CKD_T0262 = {
  id: 'T0262',
  documentId: 'sacn5-chapters-SACN5-37',
  pageNo: null,
  caption:
    'Table 37-13. Reassessment of patients with chronic kidney disease.*',
  columns: ['Parameter', 'Frequency'],
  rowCount: 22,
  rows: [
    ['Phosphorus', 'Monitor every 2 to 4 weeks'],
    ['Potassium', 'Monitor every 2 to 4 weeks'],
  ],
};

const CKD_T0263 = {
  id: 'T0263',
  documentId: 'sacn5-chapters-SACN5-37',
  pageNo: null,
  caption:
    'Table 1. Results of initial laboratory evaluation including phosphorus.*',
  columns: ['Parameter', 'Finding'],
  rowCount: 17,
  rows: [
    ['Phosphorus', 'Assess at each visit'],
    ['Creatinine', 'Assess at each visit'],
  ],
};

const TABLE_FIXTURES = [
  CKD_T0497,
  CKD_T0258,
  CKD_T0259,
  CKD_T0260,
  CKD_T0262,
  CKD_T0263,
  CKD_T0025,
];

function makeParagraphs(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const seq = String(index + 1).padStart(2, '0');
    return {
      id: `p${seq}`,
      sectionId: 's1',
      text: `paragraph ${seq}`,
      pageStart: 17,
      pageEnd: 17,
    };
  });
}

/**
 * 原文层查询服务。
 *
 * 锁的是**接口形状与边界**，不是库里有多少数据：
 *   · 空查询直接返回空，不打数据库
 *   · limit 有上限，防止一次把几万段都吐出来
 *   · 取上下文按小节内位置切窗口
 *   · 条目出处能把段落和表格一起带出来
 *   · 开节/开表/馆藏/表格视图的返回形状（Task 2）
 */
describe('SourceLayerService', () => {
  function makeService(overrides: any = {}) {
    const prisma: any = {
      sourceDocument: { count: jest.fn().mockResolvedValue(160), findMany: jest.fn().mockResolvedValue([]) },
      sourceParagraph: {
        count: jest.fn().mockResolvedValue(27909),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
      },
      sourceTable: { count: jest.fn().mockResolvedValue(484), findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn().mockResolvedValue(null) },
      sourceFigure: { count: jest.fn().mockResolvedValue(592), findUnique: jest.fn().mockResolvedValue(null) },
      sourceSection: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      knowledgeCitationAnchor: { findMany: jest.fn().mockResolvedValue([]) },
      ...overrides,
    };
    return { service: new SourceLayerService(prisma), prisma };
  }

  it('getScope 返回四类计数', async () => {
    const { service } = makeService();
    await expect(service.getScope()).resolves.toEqual({
      documents: 160,
      paragraphs: 27909,
      tables: 484,
      figures: 592,
    });
  });

  it('空查询不打数据库、直接返回空', async () => {
    const { service, prisma } = makeService();
    await expect(service.searchParagraphs('   ')).resolves.toEqual([]);
    expect(prisma.sourceParagraph.findMany).not.toHaveBeenCalled();
  });

  it('limit 会被压到上限以内', async () => {
    const { service, prisma } = makeService();
    await service.searchParagraphs('calcium oxalate', { limit: 999 });
    const arg = prisma.sourceParagraph.findMany.mock.calls[0][0];
    expect(arg.take).toBeLessThanOrEqual(30);
  });

  it('搜索结果带上小节标题', async () => {
    const { service } = makeService({
      sourceParagraph: {
        count: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([
          { id: 'p1', documentId: 'd1', sectionId: 's1', text: 'text', pageStart: 3, section: { title: 'PROTEIN' } },
        ]),
      },
    });
    const hits = await service.searchParagraphs('protein');
    expect(hits[0]).toMatchObject({ id: 'p1', sectionTitle: 'PROTEIN', pageStart: 3 });
  });

  it('取上下文按小节内位置切窗口', async () => {
    const rows = ['p1', 'p2', 'p3', 'p4', 'p5'].map((id) => ({
      id, documentId: 'd1', sectionId: 's1', text: id, pageStart: 1, section: { title: 'S' },
    }));
    const { service } = makeService({
      sourceParagraph: {
        count: jest.fn(),
        findUnique: jest.fn().mockResolvedValue({ sectionId: 's1' }),
        findMany: jest.fn().mockResolvedValue(rows),
      },
    });
    const win = await service.getParagraphContext('p3', 1, 1);
    expect(win.map((w) => w.id)).toEqual(['p2', 'p3', 'p4']);
  });

  it('取上下文：段落不存在时返回空', async () => {
    const { service } = makeService();
    await expect(service.getParagraphContext('nope')).resolves.toEqual([]);
  });

  it('条目出处能把段落和表格一起带出来', async () => {
    const { service } = makeService({
      knowledgeCitationAnchor: {
        findMany: jest.fn().mockResolvedValue([
          {
            entryId: 'urolith-005', sourceName: '小动物临床营养学（第5版）', locator: '第40章',
            documentId: 'd1', sectionId: 's1', paragraphIds: ['p1'], tableIds: ['T0012'],
            precision: 'paragraph', confidence: 'high', score: 0.62,
          },
        ]),
      },
      sourceParagraph: {
        count: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([
          { id: 'p1', documentId: 'd1', sectionId: 's1', text: 'protein raises urine calcium', pageStart: 4, section: { title: 'PROTEIN' } },
        ]),
      },
      sourceTable: {
        count: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([
          { id: 'T0012', documentId: 'd1', caption: 'TABLE 12-5', pageNo: 4, columns: ['a', 'b'], rowCount: 10 },
        ]),
      },
    });

    const evidence = await service.getEntryEvidence('urolith-005');
    expect(evidence).toHaveLength(1);
    expect(evidence[0].paragraphs[0].text).toContain('protein');
    expect(evidence[0].tables[0].caption).toBe('TABLE 12-5');
    expect(evidence[0].precision).toBe('paragraph');
  });

  it('打开节：≤12 段、nextOffset、显示标题、相邻节', async () => {
    const { service } = makeService({
      sourceSection: {
        findUnique: jest.fn().mockResolvedValue({
          id: 's1',
          documentId: 'sacn5-chapters-SACN5-37',
          title: '787 Chronic Kidney Disease',
          pageNo: 787,
          sortOrder: 3,
          document: {
            id: 'sacn5-chapters-SACN5-37',
            title: 'SACN5_37.pdf',
            sourceId: 'SACN5',
          },
        }),
        findMany: jest.fn().mockResolvedValue([
          { id: 's0', sortOrder: 2 },
          { id: 's1', sortOrder: 3 },
          { id: 's2', sortOrder: 4 },
        ]),
      },
      sourceParagraph: {
        count: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue(makeParagraphs(20)),
      },
      sourceTable: {
        count: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([
          { id: 'T0497', documentId: 'sacn5-chapters-SACN5-37', caption: 'Table 37-9', pageNo: 17, rowCount: 10 },
          { id: 'T0253', documentId: 'sacn5-chapters-SACN5-37', caption: 'Table 37-1', pageNo: null, rowCount: 5 },
          { id: 'T0260', documentId: 'sacn5-chapters-SACN5-37', caption: 'Table 37-11', pageNo: null, rowCount: 23 },
          { id: 'T0270', documentId: 'sacn5-chapters-SACN5-37', caption: 'Table 40-1', pageNo: 40, rowCount: 3 },
        ]),
      },
    });

    const view = await service.openSection('s1');
    expect(view?.paragraphs).toHaveLength(12);
    expect(view?.totalParagraphs).toBe(20);
    expect(view?.nextOffset).toBe(12);
    expect(view?.displayTitle).toContain('第37章');
    expect(view?.displayTitle).toContain('p787');
    expect(view?.previousSectionId).toBe('s0');
    expect(view?.nextSectionId).toBe('s2');
    // 页码落在节范围的表排第一，null 的也允许，最多 3 张
    expect(view?.tables).toHaveLength(3);
    expect(view?.tables[0].tableId).toBe('T0497');
    expect(view?.pageStart).toBe(17);
    expect(view?.pageEnd).toBe(17);
    expect(view?.sourceName).toBe('小动物临床营养学（第5版）');
  });

  it('打开节：anchorParagraphId 让被引用段出现在第一页', async () => {
    const { service } = makeService({
      sourceSection: {
        findUnique: jest.fn().mockResolvedValue({
          id: 's1',
          documentId: 'sacn5-chapters-SACN5-37',
          title: '787 Chronic Kidney Disease',
          pageNo: 787,
          sortOrder: 3,
          document: {
            id: 'sacn5-chapters-SACN5-37',
            title: 'SACN5_37.pdf',
            sourceId: 'SACN5',
          },
        }),
        findMany: jest.fn().mockResolvedValue([
          { id: 's0', sortOrder: 2 },
          { id: 's1', sortOrder: 3 },
          { id: 's2', sortOrder: 4 },
        ]),
      },
      sourceParagraph: {
        count: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue(makeParagraphs(20)),
      },
    });

    const view = await service.openSection('s1', { anchorParagraphId: 'p15' });
    expect(view?.paragraphs[0].id).toBe('p13');
    expect(view?.paragraphs.map((row) => row.id)).toContain('p15');
    expect(view?.totalParagraphs).toBe(20);
  });

  it('打开表：返回列/行/页码/文档标题', async () => {
    const { service } = makeService({
      sourceTable: {
        count: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn().mockResolvedValue({
          ...CKD_T0497,
          verify: null,
          method: null,
          document: {
            id: 'sacn5-chapters-SACN5-37',
            title: 'SACN5_37.pdf',
            sourceId: 'SACN5',
          },
        }),
      },
    });

    const table = await service.openTable('T0497');
    expect(table?.rowCount).toBe(10);
    expect(table?.pageNo).toBe(17);
    expect(table?.caption).toContain('37-9');
    expect(table?.columns).toEqual(['Factors', 'Dietary recommendations']);
    expect(table?.rows).toHaveLength(10);
    expect(table?.rows[2][0]).toBe('Phosphorus');
    expect(table?.documentTitle).toBe('SACN5_37.pdf');
    expect(table?.sourceId).toBe('SACN5');
    expect(table?.sourceName).toBe('小动物临床营养学（第5版）');
  });

  it('馆藏：传 CKD 5 份 documentIds 返回 5 份，按来源可收窄', async () => {
    const documents = [
      {
        id: 'sacn5-chapters-SACN5-37',
        title: 'SACN5_37.pdf',
        sourceId: 'SACN5',
        pageCount: 46,
        _count: { sections: 30, paragraphs: 424, tables: 12 },
      },
      {
        id: 'iris-IRIS-staging-guidelines-2026',
        title: 'IRIS_staging_guidelines-2026.pdf',
        sourceId: 'IRIS-CKD-2026',
        pageCount: 7,
        _count: { sections: 7, paragraphs: 46, tables: 0 },
      },
      {
        id: 'iris-IRIS-DOG-Treatment-Recommendations-may-2026',
        title: 'IRIS-DOG-Treatment_Recommendations_may-2026.pdf',
        sourceId: 'IRIS-CKD-2026',
        pageCount: 25,
        _count: { sections: 9, paragraphs: 190, tables: 0 },
      },
      {
        id: 'iris-IRIS-Pocket-Guide-to-CKD-June-2026-cn6g',
        title: 'IRIS_Pocket_Guide_to_CKD_June-2026-cn6g.pdf',
        sourceId: 'IRIS-CKD-2026',
        pageCount: 4,
        _count: { sections: 5, paragraphs: 19, tables: 0 },
      },
      {
        id: 'aaha-AAHA-2021-Nutrition-and-Weight-Management-Guidelines',
        title: 'AAHA-2021-Nutrition-and-Weight-Management-Guidelines.pdf',
        sourceId: 'AAHA-2021-NUTRITION',
        pageCount: 22,
        _count: { sections: 27, paragraphs: 178, tables: 11 },
      },
    ];
    const { service, prisma } = makeService({
      sourceDocument: {
        count: jest.fn(),
        findMany: jest
          .fn()
          .mockResolvedValueOnce(documents)
          .mockResolvedValueOnce(
            documents.filter((doc) => doc.sourceId === 'IRIS-CKD-2026'),
          ),
      },
    });

    const result = await service.scope({ documentIds: [...CKD_DOCUMENT_IDS] });
    expect(result.documents).toHaveLength(5);
    expect(result.totals.documents).toBe(5);
    expect(result.totals.sections).toBe(78);
    expect(result.totals.paragraphs).toBe(857);
    expect(result.totals.tables).toBe(23);
    expect(result.documents[0].sourceName).toBe('小动物临床营养学（第5版）');
    // Prisma 合法写法：documentIds → id: { in }
    const where = prisma.sourceDocument.findMany.mock.calls[0][0].where;
    expect(where).toEqual({ id: { in: CKD_DOCUMENT_IDS } });

    const narrowed = await service.scope({ sourceId: 'IRIS-CKD-2026' });
    expect(narrowed.documents).toHaveLength(3);
    expect(
      narrowed.documents.every((doc) => doc.sourceId === 'IRIS-CKD-2026'),
    ).toBe(true);
    expect(prisma.sourceDocument.findMany.mock.calls[1][0].where).toEqual({
      sourceId: 'IRIS-CKD-2026',
    });
  });

  it('表格视图：按行文本命中 T0497，焦点门禁排除 vitamin E 表', async () => {
    const { service, prisma } = makeService({
      sourceTable: {
        count: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue(TABLE_FIXTURES),
      },
    });

    const hits = await service.searchTableViews('phosphorus', {
      documentIds: [...CKD_DOCUMENT_IDS],
    });
    expect(hits.map((table) => table.tableId)).toContain('T0497');
    expect(hits.length).toBeLessThanOrEqual(3);
    expect(hits.map((table) => table.caption).join(' ')).toContain('37-9');
    expect(prisma.sourceTable.findMany.mock.calls[0][0].where).toEqual({
      documentId: { in: CKD_DOCUMENT_IDS },
    });

    const vitaminK = await service.searchTableViews('CKD dog vitamin K target', {
      documentIds: [...CKD_DOCUMENT_IDS],
    });
    expect(vitaminK.map((table) => table.tableId)).not.toContain('T0025');
    expect(vitaminK).toEqual([]);
  });
});
