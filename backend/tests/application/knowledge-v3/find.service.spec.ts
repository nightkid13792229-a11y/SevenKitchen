import {
  KnowledgeFindService,
  isCjkQuery,
  makeSnippet,
} from '../../../src/application/knowledge-v3/knowledge-find.service';
import { KnowledgeToolError } from '../../../src/application/knowledge-v3/knowledge-v3.errors';
import type { KbFindArgs } from '../../../src/application/knowledge-v3/knowledge-v3.types';
import { PrismaService } from '../../../src/infrastructure/prisma.service';

/**
 * `kb_find`：页级检索（设计 §6.3）。
 *
 * Prisma 全 mock，不连真实 DB。只验证服务自己的行为：
 * - 英文查询走 `websearch_to_tsquery` + `ts_rank_cd`，CJK 走 `ILIKE` 兜底；
 * - 页命中 `kind='page'`，表/图命中返回 `blockId` + 对应 kind；
 * - 同一文档同一页去重、保留最高分；
 * - `documentIds: []` / `collections: []` 是空范围，不退回全库；
 * - 0 命中只返回 `hits: []`，不出现 `no_match` / “未覆盖”。
 */

const pageRow = (overrides: Record<string, unknown> = {}) => ({
  source_id: 'doc-1',
  page_no: 17,
  text:
    'Table 37-9 phosphorus 0.2-0.5% DM. ' +
    'The remainder of this page is filler text. '.repeat(20),
  block_id: null,
  kind: 'page',
  score: 0.9,
  ...overrides,
});

const tableRow = (overrides: Record<string, unknown> = {}) => ({
  source_id: 'doc-1',
  page_no: 21,
  text: 'Table 37-9. Phosphorus content of common ingredients',
  block_id: 'doc-1-p0021-b0003',
  kind: 'table',
  score: 0.8,
  ...overrides,
});

describe('knowledge v3 find service', () => {
  const queryRaw = jest.fn();
  const sourceCount = jest.fn();
  const pageCount = jest.fn();
  const prisma = {
    $queryRaw: queryRaw,
    kbSource: { count: sourceCount },
    kbPage: { count: pageCount },
  };
  let service: KnowledgeFindService;

  beforeEach(() => {
    jest.resetAllMocks();
    queryRaw.mockResolvedValue([]);
    sourceCount.mockResolvedValue(8);
    pageCount.mockResolvedValue(857);
    service = new KnowledgeFindService(prisma as unknown as PrismaService);
  });

  describe('makeSnippet', () => {
    it('centers the window on the matched term', () => {
      const text = `${'a'.repeat(400)} phosphorus 0.2-0.5% DM ${'b'.repeat(400)}`;

      const snippet = makeSnippet(text, 'phosphorus');

      expect(snippet).toContain('phosphorus');
      expect(snippet.length).toBeLessThanOrEqual(162);
    });

    it('matches the term case-insensitively', () => {
      expect(makeSnippet('... Phosphorus 0.2 ...', 'phosphorus')).toContain(
        'Phosphorus',
      );
    });

    it('falls back to the first 160 characters when the term is absent', () => {
      const text = 'x'.repeat(500);

      const snippet = makeSnippet(text, 'zebra');

      expect(snippet.slice(0, 160)).toBe('x'.repeat(160));
      expect(snippet.startsWith('…')).toBe(false);
      expect(snippet.length).toBeLessThanOrEqual(161);
    });

    it('returns an empty snippet for empty text', () => {
      expect(makeSnippet('', 'phosphorus')).toBe('');
    });
  });

  describe('isCjkQuery', () => {
    it('detects CJK queries', () => {
      expect(isCjkQuery('犬 磷 目标')).toBe(true);
      expect(isCjkQuery('肾脏处方粮')).toBe(true);
    });

    it('treats latin queries as non-CJK', () => {
      expect(isCjkQuery('CKD phosphorus')).toBe(false);
      expect(isCjkQuery('vitamin k')).toBe(false);
    });
  });

  describe('find', () => {
    it('returns page hits with anchor, snippet and searched counts', async () => {
      queryRaw.mockResolvedValueOnce([pageRow()]).mockResolvedValueOnce([]);

      const result = await service.find({ query: 'phosphorus' });

      expect(result.hits).toHaveLength(1);
      expect(result.hits[0]).toMatchObject({
        documentId: 'doc-1',
        pageNo: 17,
        chapter: null,
        blockId: null,
        kind: 'page',
        score: 0.9,
        anchor: 'doc-1/p17',
      });
      expect(result.hits[0].snippet).toContain('phosphorus');
      expect(result.searched).toEqual({ documents: 8, pages: 857 });
    });

    it('queries pages with full-text search and blocks with ILIKE', async () => {
      queryRaw
        .mockResolvedValueOnce([pageRow()])
        .mockResolvedValueOnce([tableRow()]);

      await service.find({ query: 'phosphorus' });

      const [pageSql] = queryRaw.mock.calls[0];
      expect(pageSql.join(' ')).toContain('websearch_to_tsquery');
      expect(pageSql.join(' ')).toContain('ts_rank_cd');

      const [blockSql] = queryRaw.mock.calls[1];
      expect(blockSql.join(' ')).toContain('kb_block');
      expect(blockSql.join(' ')).toContain('ILIKE');
    });

    it('uses the ILIKE fallback for CJK queries', async () => {
      queryRaw
        .mockResolvedValueOnce([
          pageRow({ page_no: 3, text: '犬 磷 目标：0.2-0.5% DM', score: 0.01 }),
        ])
        .mockResolvedValueOnce([]);

      const result = await service.find({ query: '犬 磷' });

      expect(result.hits).toHaveLength(1);
      const [pageSql] = queryRaw.mock.calls[0];
      expect(pageSql.join(' ')).toContain('ILIKE');
      expect(pageSql.join(' ')).not.toContain('websearch_to_tsquery');
    });

    it('returns table and figure block hits with blockId and kind', async () => {
      queryRaw.mockResolvedValueOnce([pageRow()]).mockResolvedValueOnce([
        tableRow(),
        {
          source_id: 'doc-1',
          page_no: 22,
          text: 'Figure 3. Phosphorus digestibility',
          block_id: 'doc-1-p0022-b0001',
          kind: 'figure',
          score: 0.7,
        },
      ]);

      const result = await service.find({ query: 'phosphorus' });

      expect(result.hits.map((hit) => hit.kind)).toEqual([
        'page',
        'table',
        'figure',
      ]);

      const table = result.hits.find((hit) => hit.kind === 'table');
      expect(table).toMatchObject({
        documentId: 'doc-1',
        pageNo: 21,
        blockId: 'doc-1-p0021-b0003',
        anchor: 'doc-1/p21',
      });

      const figure = result.hits.find((hit) => hit.kind === 'figure');
      expect(figure).toMatchObject({
        pageNo: 22,
        blockId: 'doc-1-p0022-b0001',
        anchor: 'doc-1/p22',
      });
    });

    it('dedupes page and block hits by document + page, keeping the highest score', async () => {
      queryRaw.mockResolvedValueOnce([pageRow()]).mockResolvedValueOnce([
        tableRow({ page_no: 17, score: 0.95 }),
        tableRow({
          page_no: 17,
          block_id: 'doc-1-p0017-b0009',
          kind: 'figure',
          score: 0.5,
        }),
      ]);

      const result = await service.find({ query: 'phosphorus' });

      expect(result.hits).toHaveLength(1);
      expect(result.hits[0]).toMatchObject({
        pageNo: 17,
        kind: 'table',
        blockId: 'doc-1-p0021-b0003',
        score: 0.95,
      });
    });

    it('caps the merged result at limit', async () => {
      queryRaw
        .mockResolvedValueOnce([
          pageRow(),
          pageRow({ page_no: 18, score: 0.8 }),
        ])
        .mockResolvedValueOnce([]);

      const result = await service.find({ query: 'phosphorus', limit: 1 });

      expect(result.hits).toHaveLength(1);
      expect(result.hits[0].pageNo).toBe(17);
    });

    it('defaults limit to 10 and passes an explicit limit through', async () => {
      queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      await service.find({ query: 'phosphorus' });
      const defaultValues = queryRaw.mock.calls[0].slice(1);
      expect(defaultValues).toContain(10);

      queryRaw.mockClear();
      queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      await service.find({ query: 'phosphorus', limit: 3 });
      const customValues = queryRaw.mock.calls[0].slice(1);
      expect(customValues).toContain(3);
    });

    it('throws INVALID_ARGUMENT for an empty or whitespace-only query', async () => {
      await expect(service.find({ query: '' })).rejects.toMatchObject({
        code: 'INVALID_ARGUMENT',
      });
      await expect(service.find({ query: '   ' })).rejects.toBeInstanceOf(
        KnowledgeToolError,
      );
      expect(queryRaw).not.toHaveBeenCalled();
    });

    it.each([0, 31, -1, 1.5, Number.NaN])(
      'throws INVALID_ARGUMENT for limit %p',
      async (limit) => {
        await expect(
          service.find({ query: 'phosphorus', limit }),
        ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
        expect(queryRaw).not.toHaveBeenCalled();
      },
    );

    it('returns hits: [] and searched counts when nothing matches', async () => {
      queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      const result = await service.find({ query: 'zebra' });

      expect(result.hits).toEqual([]);
      expect(result.searched).toEqual({ documents: 8, pages: 857 });
      expect('no_match' in result).toBe(false);
      expect(JSON.stringify(result)).not.toContain('未覆盖');
    });

    it.each([
      ['documentIds', { documentIds: [] }],
      ['collections', { collections: [] }],
    ])(
      'treats %s: [] as an empty scope without querying the library',
      async (_label, scope) => {
        const result = await service.find({
          query: 'phosphorus',
          ...scope,
        });

        expect(result).toEqual({
          hits: [],
          searched: { documents: 0, pages: 0 },
        });
        expect(queryRaw).not.toHaveBeenCalled();
        expect(sourceCount).not.toHaveBeenCalled();
        expect(pageCount).not.toHaveBeenCalled();
      },
    );

    it('counts the searched scope using collection and document filters', async () => {
      queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      await service.find({
        query: 'phosphorus',
        collections: ['SACN5'],
        documentIds: ['doc-1'],
        limit: 5,
      });

      expect(sourceCount).toHaveBeenCalledWith({
        where: {
          id: { in: ['doc-1'] },
          collection: { in: ['SACN5'] },
        },
      });
      expect(pageCount).toHaveBeenCalledWith({
        where: {
          sourceId: { in: ['doc-1'] },
          source: { collection: { in: ['SACN5'] } },
        },
      });
    });

    it('does not run searches when the filtered scope contains no documents', async () => {
      sourceCount.mockResolvedValue(0);
      pageCount.mockResolvedValue(0);

      const result = await service.find({
        query: 'phosphorus',
        documentIds: ['missing'],
      });

      expect(result).toEqual({
        hits: [],
        searched: { documents: 0, pages: 0 },
      });
      expect(queryRaw).not.toHaveBeenCalled();
    });
  });
});
