import { readFileSync } from 'fs';
import * as path from 'path';
import {
  mapPageLayerToRows,
  validatePageLayerFile,
} from '../../../src/application/knowledge-v3/page-layer.mapper';

/**
 * page-layer JSON（解析器产物，设计 §8.3）→ Prisma 行。
 *
 * fixture 直接读盘：`tests/fixtures/kb-v3/sample.page-layer.json`（2 页），
 * 不引入 resolveJsonModule，保持与真实导入脚本同一条路径（fs 读文件）。
 */
const FIXTURE_PATH = path.join(
  __dirname,
  '../../fixtures/kb-v3/sample.page-layer.json',
);

const fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as Record<
  string,
  unknown
>;
const fixturePages = fixture.pages as unknown[];

describe('knowledge v3 page-layer mapper', () => {
  it('validates a well-formed page-layer file', () => {
    const file = validatePageLayerFile(fixture);

    expect(file.source.pageCount).toBe(2);
    expect(file.pages).toHaveLength(2);
    expect(file.pages[0].blocks[0].id).toBe('doc-1-p0001-b0001');
  });

  it('rejects a file with no pages', () => {
    expect(() => validatePageLayerFile({ ...fixture, pages: [] })).toThrow(
      'INVALID_ARGUMENT',
    );
  });

  it('rejects duplicate page numbers', () => {
    expect(() =>
      validatePageLayerFile({
        ...fixture,
        pages: [fixturePages[0], fixturePages[0]],
      }),
    ).toThrow('INVALID_ARGUMENT');
  });

  it('rejects a toc range outside the document', () => {
    expect(() =>
      validatePageLayerFile({
        ...fixture,
        toc: [
          {
            id: 'doc-1-toc-1',
            title: '全文 1..3',
            level: 1,
            pageFrom: 1,
            pageTo: 3,
            orderIndex: 1,
          },
        ],
      }),
    ).toThrow('INVALID_ARGUMENT');
  });

  it('maps to deterministic page/block/toc rows', () => {
    const rows = mapPageLayerToRows(validatePageLayerFile(fixture));

    expect(rows.source.id).toBe('doc-1');
    expect(rows.source.pageCount).toBe(2);

    expect(rows.pages).toHaveLength(2);
    expect(rows.pages.map((page) => page.id)).toEqual([
      'doc-1-p0001',
      'doc-1-p0002',
    ]);
    expect(rows.pages.every((page) => page.sourceId === 'doc-1')).toBe(true);
    expect(rows.pages[0].charCount).toBe(15);
    // fixture 第 2 页没有 charCount：回退成 text.length
    expect(rows.pages[1].text).toBe('第 2 页正文');
    expect(rows.pages[1].charCount).toBe('第 2 页正文'.length);
    // 页图保留相对路径，不做绝对化
    expect(rows.pages[0].imagePath).toBe('doc-1/p0001.jpg');

    expect(rows.blocks).toHaveLength(4);
    expect(rows.blocks[0]).toMatchObject({
      id: 'doc-1-p0001-b0001',
      pageId: 'doc-1-p0001',
      kind: 'paragraph',
      text: '第 1 页正文',
      orderIndex: 1,
    });
    expect(rows.blocks[1]).toMatchObject({
      id: 'doc-1-p0001-b0002',
      pageId: 'doc-1-p0001',
      kind: 'table',
      text: null,
      caption: '表 1：示例表',
    });
    expect(rows.blocks[3]).toMatchObject({
      id: 'doc-1-p0002-b0002',
      pageId: 'doc-1-p0002',
      kind: 'figure',
      caption: '图 1：示例图',
    });

    expect(rows.toc).toHaveLength(1);
    expect(rows.toc[0]).toMatchObject({
      id: 'doc-1-toc-1',
      sourceId: 'doc-1',
      title: '全文 1..2',
      level: 1,
      pageFrom: 1,
      pageTo: 2,
      orderIndex: 1,
    });
  });

  it('falls back to a whole-document toc entry when toc is empty', () => {
    const rows = mapPageLayerToRows(
      validatePageLayerFile({ ...fixture, toc: [] }),
    );

    expect(rows.toc).toHaveLength(1);
    expect(rows.toc[0]).toMatchObject({
      sourceId: 'doc-1',
      title: '全文 1..2',
      pageFrom: 1,
      pageTo: 2,
    });
  });
});
