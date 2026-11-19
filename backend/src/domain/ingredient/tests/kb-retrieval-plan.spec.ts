import {
  looksLikeIndexPage,
  planRetrievalPages,
  type RetrievalHit,
  type RetrievalQueryHits,
} from '../kb-retrieval-plan';

function hit(documentId: string, pageNo: number, score = 1): RetrievalHit {
  return { documentId, pageNo, score, snippet: `snippet ${documentId} p${pageNo}` };
}

function q(query: string, hits: RetrievalHit[]): RetrievalQueryHits {
  return { query, hits };
}

describe('looksLikeIndexPage', () => {
  it('首行是 Index / 目录 / 索引 → 判为索引页', () => {
    expect(looksLikeIndexPage('Index\nAAFCO, 2001 ... 512')).toBe(true);
    expect(looksLikeIndexPage('目 录\n第一章 …… 1')).toBe(true);
    expect(looksLikeIndexPage('Contents\n1. Introduction 3')).toBe(true);
  });

  it('正文页不是索引页', () => {
    expect(
      looksLikeIndexPage('Iron oxide and carbonate demonstrate negligible bioavailability.'),
    ).toBe(false);
  });

  it('单行（snippet 被折叠过）也能认出索引页', () => {
    expect(
      looksLikeIndexPage(
        'Index AAFCO, 2001 ............ 512 Absorption of iron compounds ... 15',
      ),
    ).toBe(true);
    expect(looksLikeIndexPage('Contents 1. Introduction 3')).toBe(true);
  });

  it('大量“编号+点号”短行也判为索引页', () => {
    const text = [
      '1. AAFCO 2001 .......... 12',
      '2. Absorption of iron ... 15',
      '3. Bioavailability ...... 18',
      '4. Copper ............... 22',
      '5. Zinc ................. 30',
    ].join('\n');
    expect(looksLikeIndexPage(text)).toBe(true);
  });
});

describe('planRetrievalPages', () => {
  const opts = { totalPages: 4, perQueryMax: 2, perDocumentMax: 2 };

  it('三条查询轮流取：先各取 1 页，再回头补', () => {
    const result = planRetrievalPages(
      [
        q('a', [hit('docA', 1), hit('docA', 2), hit('docA', 3)]),
        q('b', [hit('docB', 1), hit('docB', 2), hit('docB', 3)]),
        q('c', [hit('docC', 1), hit('docC', 2), hit('docC', 3)]),
      ],
      opts,
    );

    expect(result.pages.map((page) => `${page.documentId}:${page.pageNo}`)).toEqual([
      'docA:1',
      'docB:1',
      'docC:1',
      'docA:2',
    ]);
    // 超过总数的那几页要有明确原因，不能悄悄消失
    expect(result.dropped.every((item) => !!item.reason)).toBe(true);
    expect(result.dropped.some((item) => item.reason === 'TOTAL_LIMIT')).toBe(true);
  });

  it('同一文档最多 2 页，第 3 页记 DOC_LIMIT', () => {
    const result = planRetrievalPages(
      [q('a', [hit('docA', 1), hit('docA', 2), hit('docA', 3)])],
      { totalPages: 5, perQueryMax: 5, perDocumentMax: 2 },
    );
    expect(result.pages).toHaveLength(2);
    expect(result.dropped.find((item) => item.pageNo === 3)?.reason).toBe('DOC_LIMIT');
  });

  it('同一页被两条查询命中只取一次，第二次记 DUPLICATE', () => {
    const result = planRetrievalPages(
      [q('a', [hit('docA', 1)]), q('b', [hit('docA', 1)])],
      { totalPages: 4, perQueryMax: 2, perDocumentMax: 2 },
    );
    expect(result.pages).toHaveLength(1);
    expect(result.dropped.some((item) => item.reason === 'DUPLICATE')).toBe(true);
  });

  it('索引页不读，记 INDEX_PAGE', () => {
    const result = planRetrievalPages(
      [
        q('a', [
          { ...hit('docA', 1), snippet: 'Index\nAAFCO 2001 ... 512' },
          hit('docA', 2),
        ]),
      ],
      { totalPages: 4, perQueryMax: 2, perDocumentMax: 2 },
    );
    expect(result.pages).toHaveLength(1);
    expect(result.dropped.find((item) => item.pageNo === 1)?.reason).toBe('INDEX_PAGE');
  });

  it('每条查询超过上限记 QUERY_LIMIT', () => {
    const result = planRetrievalPages(
      [q('a', [hit('docA', 1), hit('docB', 1), hit('docC', 1)])],
      { totalPages: 5, perQueryMax: 2, perDocumentMax: 5 },
    );
    expect(result.pages).toHaveLength(2);
    expect(result.dropped.some((item) => item.reason === 'QUERY_LIMIT')).toBe(true);
  });

  it('四条查询都落在同一本书时，每查询的首个候选不受文档上限限制', () => {
    const result = planRetrievalPages(
      [
        q('a', [hit('nrc', 10), hit('nrc', 12)]),
        q('b', [hit('nrc', 11)]),
        q('c', [hit('nrc', 13)]),
        q('d', [hit('nrc', 14)]),
      ],
      { totalPages: 4, perQueryMax: 2, perDocumentMax: 2 },
    );
    expect(result.pages.map((page) => page.pageNo).sort()).toEqual([10, 11, 13, 14]);
    expect(result.pages).toHaveLength(4);
  });

  it('同一页重复命中时按索引页优先解释，不记两次 DUPLICATE', () => {
    const indexHit = { ...hit('docA', 1), snippet: 'Index AAFCO ... 512' };
    const result = planRetrievalPages(
      [q('a', [indexHit]), q('b', [indexHit])],
      { totalPages: 4, perQueryMax: 2, perDocumentMax: 2 },
    );
    expect(result.dropped.filter((item) => item.pageNo === 1)).toHaveLength(1);
    expect(result.dropped[0].reason).toBe('INDEX_PAGE');
  });

  it('空输入不抛错', () => {
    expect(planRetrievalPages([], opts)).toEqual({ pages: [], dropped: [] });
  });

  it('保留分数与来源查询，方便复盘', () => {
    const result = planRetrievalPages([q('iron bioavailability', [hit('docA', 7, 0.42)])], opts);
    expect(result.pages[0]).toMatchObject({
      documentId: 'docA',
      pageNo: 7,
      score: 0.42,
      query: 'iron bioavailability',
    });
  });
});
