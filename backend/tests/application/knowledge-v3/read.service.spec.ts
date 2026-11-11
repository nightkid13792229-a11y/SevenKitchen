import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { KnowledgeReadService } from '../../../src/application/knowledge-v3/knowledge-read.service';
import { PageImageService } from '../../../src/application/knowledge-v3/page-image.service';
import { KnowledgeToolError } from '../../../src/application/knowledge-v3/knowledge-v3.errors';
import { PrismaService } from '../../../src/infrastructure/prisma.service';

/**
 * `kb_read`：页级读取（设计 §6.4）。
 *
 * Prisma 全 mock，不连真实 DB；页图用临时目录里的 1×1 JPEG fixture，
 * `KB_PAGE_IMAGE_ROOT` 指向该临时目录。只验证服务自己的行为：
 * - 范围：pageFrom/pageTo、默认 1..min(5,pageCount)、cursor 续读、tocId；
 * - 预算：默认/上限/非法值，至少返回 1 页，超预算给 nextCursor；
 * - blocks 只给结构（text=null），锚点为 `doc-1/p1`、`doc-1/p1#b0001`；
 * - 页图：includeImages 默认 true、前 5 张带 base64、false 时全 null；
 * - `../` 路径不能逃出 `KB_PAGE_IMAGE_ROOT`。
 */

const ONE_PIXEL_JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
  'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIy' +
  'MjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIA' +
  'AhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQA' +
  'AAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3' +
  'ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWm' +
  'p6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEA' +
  'AwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSEx' +
  'BhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElK' +
  'U1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3' +
  'uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iii' +
  'gD//2Q==';

const UPDATED_AT = new Date('2026-11-11T00:00:00Z');

const blockRow = {
  id: 'doc-1-p0001-b0001',
  pageId: 'doc-1-p0001',
  kind: 'paragraph',
  bbox: { x0: 0, y0: 0, x1: 1, y1: 1 },
  text: 'a'.repeat(3000),
  caption: null,
  orderIndex: 1,
};

const pageRows = [
  {
    id: 'doc-1-p0001',
    sourceId: 'doc-1',
    pageNo: 1,
    text: 'a'.repeat(3000),
    charCount: 3000,
    width: null,
    height: null,
    imagePath: 'doc-1/p0001.jpg',
    imageRenderedAt: null,
    blocks: [blockRow],
  },
  {
    id: 'doc-1-p0002',
    sourceId: 'doc-1',
    pageNo: 2,
    text: 'b'.repeat(3000),
    charCount: 3000,
    width: null,
    height: null,
    imagePath: null,
    imageRenderedAt: null,
    blocks: [],
  },
];

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
  createdAt: UPDATED_AT,
  updatedAt: UPDATED_AT,
};

describe('knowledge v3 read service', () => {
  const findUniqueSource = jest.fn();
  const findManyPages = jest.fn();
  const findUniqueToc = jest.fn();
  const findFirstPage = jest.fn();
  const prisma = {
    kbSource: { findUnique: findUniqueSource },
    kbPage: { findMany: findManyPages, findFirst: findFirstPage },
    kbToc: { findUnique: findUniqueToc },
  };

  let rootDir: string;
  let outsideDir: string;
  let previousRoot: string | undefined;
  let service: KnowledgeReadService;
  let images: PageImageService;

  beforeAll(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-read-images-'));
    outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-read-outside-'));
    fs.mkdirSync(path.join(rootDir, 'doc-1'), { recursive: true });
    fs.writeFileSync(
      path.join(rootDir, 'doc-1', 'p0001.jpg'),
      Buffer.from(ONE_PIXEL_JPEG_BASE64, 'base64'),
    );
    fs.writeFileSync(
      path.join(outsideDir, 'p0001.jpg'),
      Buffer.from(ONE_PIXEL_JPEG_BASE64, 'base64'),
    );
    previousRoot = process.env.KB_PAGE_IMAGE_ROOT;
    process.env.KB_PAGE_IMAGE_ROOT = rootDir;
  });

  afterAll(() => {
    if (previousRoot === undefined) {
      delete process.env.KB_PAGE_IMAGE_ROOT;
    } else {
      process.env.KB_PAGE_IMAGE_ROOT = previousRoot;
    }
    fs.rmSync(rootDir, { recursive: true, force: true });
    fs.rmSync(outsideDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    jest.resetAllMocks();
    findUniqueSource.mockResolvedValue(sourceRow);
    findManyPages.mockImplementation(({ where }) =>
      Promise.resolve(
        pageRows.filter(
          (page) =>
            page.pageNo >= where.pageNo.gte && page.pageNo <= where.pageNo.lte,
        ),
      ),
    );
    findUniqueToc.mockResolvedValue(null);
    findFirstPage.mockImplementation(({ where }) =>
      Promise.resolve(
        where.pageNo === 1 ? { imagePath: 'doc-1/p0001.jpg' } : null,
      ),
    );
    images = new PageImageService(prisma as unknown as PrismaService);
    service = new KnowledgeReadService(
      prisma as unknown as PrismaService,
      images,
    );
  });

  describe('read range and budget', () => {
    it('returns one page plus nextCursor when the budget only fits one page', async () => {
      const result = await service.read({
        documentId: 'doc-1',
        pageFrom: 1,
        pageTo: 2,
        budgetTokens: 1000,
      });

      expect(result.documentId).toBe('doc-1');
      expect(result.pages).toHaveLength(1);
      expect(result.pages[0].pageNo).toBe(1);
      expect(result.nextCursor).toEqual(expect.any(String));
      expect(result.version).toBe(UPDATED_AT.toISOString());
    });

    it('continues from nextCursor and stops at endPage', async () => {
      const first = await service.read({
        documentId: 'doc-1',
        pageFrom: 1,
        pageTo: 2,
        budgetTokens: 1000,
      });

      const second = await service.read({
        documentId: 'doc-1',
        cursor: first.nextCursor as string,
      });

      expect(second.pages.map((page) => page.pageNo)).toEqual([2]);
      expect(second.nextCursor).toBeNull();
    });

    it('returns at least one page even when that page exceeds the budget', async () => {
      const result = await service.read({
        documentId: 'doc-1',
        pageFrom: 1,
        pageTo: 1,
        budgetTokens: 1,
      });

      expect(result.pages).toHaveLength(1);
      expect(result.nextCursor).toBeNull();
    });

    it('defaults to pages 1..min(5, pageCount)', async () => {
      await service.read({ documentId: 'doc-1' });

      expect(findManyPages).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { sourceId: 'doc-1', pageNo: { gte: 1, lte: 2 } },
        }),
      );
    });

    it('treats only pageFrom as a 5-page window', async () => {
      findUniqueSource.mockResolvedValue({ ...sourceRow, pageCount: 10 });
      findManyPages.mockResolvedValue([pageRows[0]]);

      await service.read({ documentId: 'doc-1', pageFrom: 6 });

      expect(findManyPages).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { sourceId: 'doc-1', pageNo: { gte: 6, lte: 10 } },
        }),
      );
    });

    it('reads a toc range when the toc belongs to the document', async () => {
      findUniqueToc.mockResolvedValue({
        id: 't1',
        sourceId: 'doc-1',
        title: 'Chapter 2',
        level: 1,
        pageFrom: 2,
        pageTo: 2,
        orderIndex: 1,
      });

      const result = await service.read({ documentId: 'doc-1', tocId: 't1' });

      expect(findUniqueToc).toHaveBeenCalledWith({ where: { id: 't1' } });
      expect(result.pages.map((page) => page.pageNo)).toEqual([2]);
    });

    it('rejects a toc that does not belong to the document', async () => {
      findUniqueToc.mockResolvedValue({
        id: 't1',
        sourceId: 'other-doc',
        title: 'Chapter 2',
        level: 1,
        pageFrom: 1,
        pageTo: 1,
        orderIndex: 1,
      });

      await expect(
        service.read({ documentId: 'doc-1', tocId: 't1' }),
      ).rejects.toMatchObject({ code: 'TOC_NOT_FOUND' });
    });

    it('throws TOC_NOT_FOUND for a missing toc', async () => {
      await expect(
        service.read({ documentId: 'doc-1', tocId: 'missing' }),
      ).rejects.toMatchObject({ code: 'TOC_NOT_FOUND' });
      await expect(
        service.read({ documentId: 'doc-1', tocId: 'missing' }),
      ).rejects.toBeInstanceOf(KnowledgeToolError);
    });

    it('throws PAGE_OUT_OF_RANGE when pageFrom is beyond pageCount', async () => {
      await expect(
        service.read({ documentId: 'doc-1', pageFrom: 99 }),
      ).rejects.toMatchObject({ code: 'PAGE_OUT_OF_RANGE' });
    });

    it('throws PAGE_OUT_OF_RANGE when pageTo is beyond pageCount', async () => {
      await expect(
        service.read({ documentId: 'doc-1', pageFrom: 1, pageTo: 99 }),
      ).rejects.toMatchObject({ code: 'PAGE_OUT_OF_RANGE' });
    });

    it('throws SOURCE_NOT_FOUND for a missing document', async () => {
      findUniqueSource.mockResolvedValue(null);

      await expect(
        service.read({ documentId: 'missing' }),
      ).rejects.toMatchObject({ code: 'SOURCE_NOT_FOUND' });
    });

    it('throws INVALID_ARGUMENT for a non-positive budget', async () => {
      await expect(
        service.read({ documentId: 'doc-1', budgetTokens: 0 }),
      ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    });

    it('throws INVALID_ARGUMENT for a non-numeric budget', async () => {
      await expect(
        service.read({
          documentId: 'doc-1',
          budgetTokens: 'lots' as unknown as number,
        }),
      ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    });

    it('rejects a cursor issued for another document', async () => {
      const foreignCursor = Buffer.from(
        JSON.stringify({
          documentId: 'other-doc',
          nextPage: 2,
          endPage: 2,
          includeImages: true,
          budgetTokens: 1000,
        }),
        'utf8',
      ).toString('base64url');

      await expect(
        service.read({ documentId: 'doc-1', cursor: foreignCursor }),
      ).rejects.toMatchObject({ code: 'INVALID_CURSOR' });
    });
  });

  describe('blocks and anchors', () => {
    it('returns structural blocks without duplicating page text', async () => {
      const result = await service.read({
        documentId: 'doc-1',
        pageFrom: 1,
        pageTo: 1,
      });

      expect(result.pages[0].anchor).toBe('doc-1/p1');
      expect(result.pages[0].blocks).toEqual([
        {
          id: 'doc-1-p0001-b0001',
          kind: 'paragraph',
          bbox: { x0: 0, y0: 0, x1: 1, y1: 1 },
          text: null,
          caption: null,
          anchor: 'doc-1/p1#b0001',
        },
      ]);
    });
  });

  describe('page images', () => {
    it('returns imagePath, imageMime and a JPEG base64 payload', async () => {
      const result = await service.read({
        documentId: 'doc-1',
        pageFrom: 1,
        pageTo: 1,
      });

      expect(result.pages[0].imagePath).toBe('doc-1/p0001.jpg');
      expect(result.pages[0].imageMime).toBe('image/jpeg');
      expect(result.pages[0].imageBase64).toMatch(/^\/9j\//);
    });

    it('nils every image field when includeImages is false', async () => {
      const result = await service.read({
        documentId: 'doc-1',
        pageFrom: 1,
        pageTo: 1,
        includeImages: false,
      });

      expect(result.pages[0].imagePath).toBeNull();
      expect(result.pages[0].imageMime).toBeNull();
      expect(result.pages[0].imageBase64).toBeNull();
      expect(findFirstPage).not.toHaveBeenCalled();
    });

    it('nils every image field when the image file is missing', async () => {
      findFirstPage.mockResolvedValue({ imagePath: 'doc-1/absent.jpg' });

      const result = await service.read({
        documentId: 'doc-1',
        pageFrom: 1,
        pageTo: 1,
      });

      expect(result.pages[0].imagePath).toBeNull();
      expect(result.pages[0].imageMime).toBeNull();
      expect(result.pages[0].imageBase64).toBeNull();
    });
  });

  describe('PageImageService', () => {
    it('resolves an existing page image under the root', async () => {
      const resolved = await images.resolve('doc-1', 1);

      expect(resolved).toEqual({
        absolutePath: fs.realpathSync(path.join(rootDir, 'doc-1', 'p0001.jpg')),
        mime: 'image/jpeg',
      });
    });

    it('returns null when the page has no image path', async () => {
      findFirstPage.mockResolvedValue({ imagePath: null });

      await expect(images.resolve('doc-1', 1)).resolves.toBeNull();
    });

    it('returns null when the file does not exist', async () => {
      findFirstPage.mockResolvedValue({ imagePath: 'doc-1/absent.jpg' });

      await expect(images.resolve('doc-1', 1)).resolves.toBeNull();
    });

    it('does not escape KB_PAGE_IMAGE_ROOT with ../ paths', async () => {
      findFirstPage.mockResolvedValue({
        imagePath: `../${path.basename(outsideDir)}/p0001.jpg`,
      });

      await expect(images.resolve('doc-1', 1)).resolves.toBeNull();
    });

    it('does not accept absolute paths', async () => {
      findFirstPage.mockResolvedValue({
        imagePath: path.join(outsideDir, 'p0001.jpg'),
      });

      await expect(images.resolve('doc-1', 1)).resolves.toBeNull();
    });
  });
});
