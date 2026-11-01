import { KnowledgeSourceController } from '../../../src/interfaces/controllers/knowledge-source.controller';

/**
 * 原文层查询接口。
 *
 * 只锁两件事：路由能把参数正确转交给服务；查不到时返回 404 而不是抛异常。
 */
describe('KnowledgeSourceController', () => {
  function make(overrides: any = {}) {
    const service: any = {
      getScope: jest.fn().mockResolvedValue({ documents: 1, paragraphs: 2, tables: 3, figures: 4 }),
      listDocuments: jest.fn().mockResolvedValue([]),
      searchParagraphs: jest.fn().mockResolvedValue([{ id: 'p1' }]),
      getParagraph: jest.fn().mockResolvedValue({ id: 'p1', text: 'x' }),
      getParagraphContext: jest.fn().mockResolvedValue([]),
      searchTables: jest.fn().mockResolvedValue([]),
      getTable: jest.fn().mockResolvedValue(null),
      getFigure: jest.fn().mockResolvedValue(null),
      getEntryAnchors: jest.fn().mockResolvedValue([]),
      getEntryEvidence: jest.fn().mockResolvedValue([]),
      ...overrides,
    };
    return { controller: new KnowledgeSourceController(service), service };
  }

  it('scope 返回计数', async () => {
    const { controller } = make();
    const res: any = await controller.scope();
    expect(res.code).toBe(0);
    expect(res.data.paragraphs).toBe(2);
  });

  it('搜索参数会转交给服务（limit 转成数字）', async () => {
    const { controller, service } = make();
    await controller.search('calcium', 'd1', undefined, '5');
    expect(service.searchParagraphs).toHaveBeenCalledWith('calcium', {
      documentId: 'd1',
      sourceId: undefined,
      limit: 5,
    });
  });

  it('段落不存在返回 404 而不是抛错', async () => {
    const { controller } = make({ getParagraph: jest.fn().mockResolvedValue(null) });
    const res: any = await controller.paragraph('nope');
    expect(res.code).toBe(404);
  });

  it('表格不存在返回 404', async () => {
    const { controller } = make();
    const res: any = await controller.table('T9999');
    expect(res.code).toBe(404);
  });

  it('evidence 支持 perAnchor 参数', async () => {
    const { controller, service } = make();
    await controller.evidence('urolith-005', '2');
    expect(service.getEntryEvidence).toHaveBeenCalledWith('urolith-005', 2);
  });
});
