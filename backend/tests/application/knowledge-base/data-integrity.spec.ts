import {
  checkAnchors,
  checkCounts,
  checkTableIds,
  findDuplicateSectionOrder,
  type ExpectedCounts,
} from '../../../src/application/knowledge-base/data-integrity';

/**
 * L0 数据完整性（全库计划 Task 4）。
 *
 * 计数不再写死在脚本里，而是对一份可复核的快照（_expected-counts.json）。
 * 快照变更必须走一次 `--record` 提交，评审时能看到数字为什么变。
 */

const expected: ExpectedCounts = {
  documents: 159,
  paragraphs: 27902,
  tables: 499,
  figures: 592,
  capturedAt: '2026-11-10',
  commit: 'abc1234',
};

describe('checkCounts', () => {
  it('一致就通过', () => {
    expect(checkCounts(expected, expected).ok).toBe(true);
  });

  it('少一段要指出字段名', () => {
    const result = checkCounts({ ...expected, paragraphs: 27901 }, expected);
    expect(result.ok).toBe(false);
    expect(result.mismatches.join()).toContain('paragraphs');
  });

  it('多一张表也要报', () => {
    const result = checkCounts({ ...expected, tables: 500 }, expected);
    expect(result.ok).toBe(false);
    expect(result.mismatches.join()).toContain('tables');
  });

  it('capturedAt/commit 不参与比较', () => {
    expect(
      checkCounts({ ...expected, capturedAt: '2026-12-01', commit: 'zzz' }, expected)
        .ok,
    ).toBe(true);
  });
});

describe('checkTableIds', () => {
  it('核心表缺失要报出来', () => {
    const result = checkTableIds(
      [{ id: 'T0253', pageNo: null }],
      ['T0253', 'T0497'],
      ['T0253'],
    );
    expect(result.missing).toEqual(['T0497']);
  });

  it('未在白名单里的 null 页码要报出来', () => {
    const result = checkTableIds(
      [
        { id: 'T0253', pageNo: null },
        { id: 'T0497', pageNo: null },
      ],
      ['T0253', 'T0497'],
      ['T0253'],
    );
    expect(result.pageNoViolations).toEqual(['T0497']);
  });
});

describe('findDuplicateSectionOrder', () => {
  it('同文档 sortOrder 重复要报', () => {
    expect(
      findDuplicateSectionOrder([
        { documentId: 'd1', sortOrder: 3 },
        { documentId: 'd1', sortOrder: 3 },
        { documentId: 'd2', sortOrder: 3 },
      ]),
    ).toEqual(['d1#3']);
  });
});

describe('checkAnchors', () => {
  it('锚点引用的段落不存在要报', () => {
    const result = checkAnchors(
      [
        { id: 'a1', paragraphIds: ['p1'] },
        { id: 'a2', paragraphIds: ['p2'] },
      ],
      new Set(['p1']),
    );
    expect(result.ok).toBe(false);
    expect(result.missingAnchors).toEqual(['a2']);
  });

  it('空引用也算坏锚点', () => {
    const result = checkAnchors([{ id: 'a1', paragraphIds: [] }], new Set());
    expect(result.missingAnchors).toEqual(['a1']);
  });
});
