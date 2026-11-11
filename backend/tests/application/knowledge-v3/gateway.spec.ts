import { Logger } from '@nestjs/common';
import { KnowledgeCatalogService } from '../../../src/application/knowledge-v3/knowledge-catalog.service';
import { KnowledgeFindService } from '../../../src/application/knowledge-v3/knowledge-find.service';
import { KnowledgeGatewayService } from '../../../src/application/knowledge-v3/knowledge-gateway.service';
import { KnowledgeReadService } from '../../../src/application/knowledge-v3/knowledge-read.service';

/**
 * 工具网关：参数校验 + 错误归一 + 调用日志（设计 §6）。
 *
 * 3 个数据服务全部 mock，只验证网关自己的行为：
 * - 空 query / 缺 documentId / 未知工具 / 非法 limit / 非法页码 / 非法预算 → INVALID_ARGUMENT；
 * - `documentIds: []` 表示范围为空，直接 0 命中，不退回全库、不调用数据层；
 * - 成功返回 `{ ok: true, data }`，未知异常返回 `INTERNAL_ERROR`；
 * - 每次 execute 都写一条 `{ tool, ok, documentId?, pages?, ms }` 日志。
 */

const sourceSummary = {
  id: 'doc-1',
  collection: 'SACN5',
  title: 'SACN5 2017',
  publisher: null,
  version: null,
  publishedYear: 2017,
  status: 'current',
  license: null,
  pageCount: 21,
  hasTextLayer: true,
};

const findHit = {
  documentId: 'doc-1',
  pageNo: 18,
  chapter: null,
  blockId: null,
  kind: 'page' as const,
  snippet: 'phosphorus …',
  score: 0.5,
  anchor: 'doc-1/p18',
};

const readPage = {
  pageNo: 17,
  text: 'Phosphorus',
  blocks: [],
  imagePath: 'doc-1/p0017.jpg',
  imageMime: 'image/jpeg' as const,
  imageBase64: null,
  anchor: 'doc-1/p17',
};

describe('knowledge v3 gateway', () => {
  const list = jest.fn();
  const get = jest.fn();
  const find = jest.fn();
  const read = jest.fn();
  const logger = { log: jest.fn(), error: jest.fn() };
  let gateway: KnowledgeGatewayService;

  beforeEach(() => {
    jest.resetAllMocks();
    gateway = new KnowledgeGatewayService(
      { list, get } as unknown as KnowledgeCatalogService,
      { find } as unknown as KnowledgeFindService,
      { read } as unknown as KnowledgeReadService,
      logger as unknown as Logger,
    );
  });

  describe('parameter validation', () => {
    it('rejects an empty query without calling the find service', async () => {
      const result = await gateway.execute('kb_find', { query: '   ' });

      expect(result).toEqual({
        ok: false,
        error: { code: 'INVALID_ARGUMENT', message: expect.any(String) },
      });
      expect(find).not.toHaveBeenCalled();
    });

    it('rejects a missing query', async () => {
      const result = await gateway.execute('kb_find', {});

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'INVALID_ARGUMENT' },
      });
      expect(find).not.toHaveBeenCalled();
    });

    it('rejects an unknown tool', async () => {
      const result = await gateway.execute('kb_open', { documentId: 'doc-1' });

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'INVALID_ARGUMENT' },
      });
      expect(list).not.toHaveBeenCalled();
      expect(get).not.toHaveBeenCalled();
      expect(find).not.toHaveBeenCalled();
      expect(read).not.toHaveBeenCalled();
    });

    it('rejects kb_read without documentId', async () => {
      const result = await gateway.execute('kb_read', {});

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'INVALID_ARGUMENT' },
      });
      expect(read).not.toHaveBeenCalled();
    });

    it('rejects a limit outside 1–30', async () => {
      const result = await gateway.execute('kb_find', {
        query: 'phosphorus',
        limit: 99,
      });

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'INVALID_ARGUMENT' },
      });
      expect(find).not.toHaveBeenCalled();
    });

    it('rejects a page number below 1', async () => {
      const result = await gateway.execute('kb_read', {
        documentId: 'doc-1',
        pageFrom: 0,
      });

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'INVALID_ARGUMENT' },
      });
      expect(read).not.toHaveBeenCalled();
    });

    it('rejects pageTo smaller than pageFrom', async () => {
      const result = await gateway.execute('kb_read', {
        documentId: 'doc-1',
        pageFrom: 5,
        pageTo: 4,
      });

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'INVALID_ARGUMENT' },
      });
      expect(read).not.toHaveBeenCalled();
    });

    it('rejects a budget outside 1–200000', async () => {
      const result = await gateway.execute('kb_read', {
        documentId: 'doc-1',
        budgetTokens: 0,
      });

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'INVALID_ARGUMENT' },
      });
      expect(read).not.toHaveBeenCalled();
    });

    it('rejects a non-object rawArgs for kb_find', async () => {
      const result = await gateway.execute('kb_find', 'phosphorus');

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'INVALID_ARGUMENT' },
      });
      expect(find).not.toHaveBeenCalled();
    });
  });

  describe('empty scope', () => {
    it('returns zero hits for documentIds: [] instead of searching the whole library', async () => {
      const result = await gateway.execute('kb_find', {
        query: 'phosphorus',
        documentIds: [],
      });

      expect(result).toEqual({
        ok: true,
        data: { hits: [], searched: { documents: 0, pages: 0 } },
      });
      expect(find).not.toHaveBeenCalled();
    });

    it('returns zero hits for collections: []', async () => {
      const result = await gateway.execute('kb_find', {
        query: 'phosphorus',
        collections: [],
      });

      expect(result).toEqual({
        ok: true,
        data: { hits: [], searched: { documents: 0, pages: 0 } },
      });
      expect(find).not.toHaveBeenCalled();
    });
  });

  describe('successful calls', () => {
    it('lists sources when kb_catalog has no documentId', async () => {
      list.mockResolvedValue([sourceSummary]);

      const result = await gateway.execute('kb_catalog', {});

      expect(result).toEqual({ ok: true, data: { sources: [sourceSummary] } });
      expect(list).toHaveBeenCalledWith(undefined);
      expect(get).not.toHaveBeenCalled();
    });

    it('returns toc when kb_catalog has a documentId', async () => {
      get.mockResolvedValue({
        sources: [sourceSummary],
        toc: [{ id: 'toc-1', title: 'Chapter', level: 1, pageFrom: 17, pageTo: 21 }],
      });

      const result = await gateway.execute('kb_catalog', {
        documentId: 'doc-1',
      });

      expect(result).toEqual({
        ok: true,
        data: {
          sources: [sourceSummary],
          toc: [
            { id: 'toc-1', title: 'Chapter', level: 1, pageFrom: 17, pageTo: 21 },
          ],
        },
      });
      expect(get).toHaveBeenCalledWith('doc-1');
    });

    it('passes a trimmed query and limit to kb_find', async () => {
      find.mockResolvedValue({
        hits: [findHit],
        searched: { documents: 1, pages: 21 },
      });

      const result = await gateway.execute('kb_find', {
        query: '  phosphorus  ',
        documentIds: ['doc-1'],
        limit: 5,
      });

      expect(result).toEqual({
        ok: true,
        data: { hits: [findHit], searched: { documents: 1, pages: 21 } },
      });
      expect(find).toHaveBeenCalledWith({
        query: 'phosphorus',
        documentIds: ['doc-1'],
        limit: 5,
      });
    });

    it('reads pages and logs the call shape', async () => {
      read.mockResolvedValue({
        documentId: 'doc-1',
        pages: [readPage],
        nextCursor: null,
        version: 'v1',
      });

      const result = await gateway.execute('kb_read', {
        documentId: ' doc-1 ',
        pageFrom: 17,
        pageTo: 21,
        includeImages: true,
        budgetTokens: 30000,
      });

      expect(result).toEqual({
        ok: true,
        data: {
          documentId: 'doc-1',
          pages: [readPage],
          nextCursor: null,
          version: 'v1',
        },
      });
      expect(read).toHaveBeenCalledWith({
        documentId: 'doc-1',
        pageFrom: 17,
        pageTo: 21,
        includeImages: true,
        budgetTokens: 30000,
      });
      expect(logger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          tool: 'kb_read',
          ok: true,
          documentId: 'doc-1',
          pages: 1,
          ms: expect.any(Number),
        }),
      );
    });

    it('lets the cursor win over page args', async () => {
      read.mockResolvedValue({
        documentId: 'doc-1',
        pages: [readPage],
        nextCursor: null,
        version: 'v1',
      });

      const result = await gateway.execute('kb_read', {
        documentId: 'doc-1',
        cursor: 'cursor-1',
        pageFrom: 3,
        pageTo: 4,
      });

      expect(result.ok).toBe(true);
      expect(read).toHaveBeenCalledWith({
        documentId: 'doc-1',
        cursor: 'cursor-1',
      });
    });

    it('lets tocId win over page args', async () => {
      read.mockResolvedValue({
        documentId: 'doc-1',
        pages: [readPage],
        nextCursor: null,
        version: 'v1',
      });

      const result = await gateway.execute('kb_read', {
        documentId: 'doc-1',
        tocId: 'toc-1',
        pageFrom: 3,
      });

      expect(result.ok).toBe(true);
      expect(read).toHaveBeenCalledWith({
        documentId: 'doc-1',
        tocId: 'toc-1',
      });
    });
  });

  describe('error normalization', () => {
    it('maps an unknown exception to INTERNAL_ERROR', async () => {
      get.mockRejectedValue(new Error('connection reset'));

      const result = await gateway.execute('kb_catalog', {
        documentId: 'doc-1',
      });

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'INTERNAL_ERROR' },
      });
      expect(logger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          tool: 'kb_catalog',
          ok: false,
          documentId: 'doc-1',
          ms: expect.any(Number),
        }),
      );
    });

    it('logs failed validation calls', async () => {
      await gateway.execute('kb_find', { query: '' });

      expect(logger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          tool: 'kb_find',
          ok: false,
          ms: expect.any(Number),
        }),
      );
    });
  });
});
