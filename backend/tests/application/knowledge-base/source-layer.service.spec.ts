import { SourceLayerService } from '../../../src/application/knowledge-base/source-layer.service';

/**
 * 原文层查询服务。
 *
 * 锁的是**接口形状与边界**，不是库里有多少数据：
 *   · 空查询直接返回空，不打数据库
 *   · limit 有上限，防止一次把几万段都吐出来
 *   · 取上下文按小节内位置切窗口
 *   · 条目出处能把段落和表格一起带出来
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
      sourceSection: { findUnique: jest.fn().mockResolvedValue(null) },
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
});
