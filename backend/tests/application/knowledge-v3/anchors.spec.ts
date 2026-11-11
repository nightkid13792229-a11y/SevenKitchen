import {
  blockAnchor,
  parseAnchor,
  decodeReadCursor,
  encodeReadCursor,
  estimateTokens,
  pageAnchor,
} from '../../../src/application/knowledge-v3/knowledge-v3.anchors';

describe('knowledge v3 anchors/cursor', () => {
  it('builds stable page and block anchors', () => {
    expect(pageAnchor('sacn5-chapters-SACN5-37', 22)).toBe(
      'sacn5-chapters-SACN5-37/p22',
    );
    expect(blockAnchor('sacn5-chapters-SACN5-37', 22, 3)).toBe(
      'sacn5-chapters-SACN5-37/p22#b0003',
    );
  });

  it('parses page and block anchors', () => {
    expect(parseAnchor('doc-1/p22')).toEqual({ documentId: 'doc-1', pageNo: 22 });
    expect(parseAnchor('doc-1/p22#b0003')).toEqual({
      documentId: 'doc-1', pageNo: 22, blockOrder: 3,
    });
    expect(() => parseAnchor('bad')).toThrow('INVALID_ARGUMENT');
  });

  it('round-trips a read cursor', () => {
    const cursor = {
      documentId: 'doc-1',
      nextPage: 7,
      endPage: 21,
      includeImages: true,
      budgetTokens: 20000,
    };
    expect(decodeReadCursor(encodeReadCursor(cursor))).toEqual(cursor);
  });

  it('rejects a malformed cursor', () => {
    expect(() => decodeReadCursor('not-base64')).toThrow('INVALID_CURSOR');
  });

  it('estimates tokens conservatively', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('abcdef')).toBe(2);
    expect(estimateTokens('中文六个字')).toBe(5);
  });
});
