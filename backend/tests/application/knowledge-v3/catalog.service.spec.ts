import { KnowledgeCatalogService } from '../../../src/application/knowledge-v3/knowledge-catalog.service';
import { KnowledgeToolError } from '../../../src/application/knowledge-v3/knowledge-v3.errors';
import { PrismaService } from '../../../src/infrastructure/prisma.service';

/**
 * `kb_catalog`：找书（list）+ 单本文档目录（get）。
 *
 * Prisma 全 mock；只验证服务自己的行为：字段映射、where 透传、
 * `{ sources: [source], toc }` 形状、缺失文档的错误码、目录按 orderIndex 排序。
 */

const sourceRow = {
  id: 'doc-1',
  collection: 'SACN5',
  title: 'SACN5 2017',
  publisher: null,
  version: null,
  publishedYear: null,
  status: 'current',
  license: null,
  checksum: 'a'.repeat(64),
  archivePath: 'archive/sacn5.pdf',
  pageCount: 2,
  hasTextLayer: true,
  createdAt: new Date('2026-11-11T00:00:00Z'),
  updatedAt: new Date('2026-11-11T00:00:00Z'),
};

const summary = {
  id: 'doc-1',
  collection: 'SACN5',
  title: 'SACN5 2017',
  publisher: null,
  version: null,
  publishedYear: null,
  status: 'current',
  license: null,
  pageCount: 2,
  hasTextLayer: true,
};

const tocRows = [
  {
    id: 't2',
    sourceId: 'doc-1',
    title: 'Chapter 2',
    level: 1,
    pageFrom: 2,
    pageTo: 2,
    orderIndex: 2,
  },
  {
    id: 't1',
    sourceId: 'doc-1',
    title: '全文',
    level: 1,
    pageFrom: 1,
    pageTo: 2,
    orderIndex: 1,
  },
];

describe('knowledge v3 catalog service', () => {
  const findMany = jest.fn();
  const findUnique = jest.fn();
  const prisma = { kbSource: { findMany, findUnique } };
  let service: KnowledgeCatalogService;

  beforeEach(() => {
    jest.resetAllMocks();
    findMany.mockResolvedValue([sourceRow]);
    findUnique.mockResolvedValue({ ...sourceRow, toc: tocRows });
    service = new KnowledgeCatalogService(prisma as unknown as PrismaService);
  });

  it('lists sources as summaries', async () => {
    const result = await service.list();

    expect(result).toEqual([summary]);
  });

  it('filters the list by collection', async () => {
    await service.list('SACN5');

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { collection: 'SACN5' },
        orderBy: [{ collection: 'asc' }, { id: 'asc' }],
      }),
    );
  });

  it('lists everything when no collection is given', async () => {
    await service.list();

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: undefined }),
    );
  });

  it('returns a single source plus its toc', async () => {
    const result = await service.get('doc-1');

    expect(result).toEqual({
      sources: [summary],
      toc: [
        { id: 't1', title: '全文', level: 1, pageFrom: 1, pageTo: 2 },
        { id: 't2', title: 'Chapter 2', level: 1, pageFrom: 2, pageTo: 2 },
      ],
    });
  });

  it('sorts toc entries by orderIndex', async () => {
    const result = await service.get('doc-1');

    expect(result.toc!.map((entry) => entry.id)).toEqual(['t1', 't2']);
    expect(result.toc!.map((entry) => entry.pageFrom)).toEqual([1, 2]);
  });

  it('throws SOURCE_NOT_FOUND for a missing document', async () => {
    findUnique.mockResolvedValue(null);

    await expect(service.get('missing')).rejects.toMatchObject({
      code: 'SOURCE_NOT_FOUND',
      message: expect.stringContaining('SOURCE_NOT_FOUND'),
    });
    await expect(service.get('missing')).rejects.toBeInstanceOf(
      KnowledgeToolError,
    );
  });
});
