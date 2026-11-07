import { tokenize, searchKnowledge, type KnowledgeChunk } from '../../../src/domain/knowledge/knowledge-search';

/**
 * 营养知识库检索。
 *
 * 这是模型"自己去查资料"的那个工具，所以它会不会**答得准**直接决定模型判断对不对。
 * 断言都用真实的营养学说法（锌的形态、铜的来源）当语料，而不是随便编句子。
 */
const corpus: KnowledgeChunk[] = [
  {
    chunkId: 'C1',
    docId: 'nrc',
    text: 'chelates with methionine or lysine have been reported to be as bioavailable as zinc sulfate in many species'
  },
  {
    chunkId: 'C2',
    docId: 'fediaf',
    text: 'Owing to its low availability copper oxide should not be considered as a copper source'
  },
  {
    chunkId: 'C3',
    docId: 'sacn5',
    text: 'zinc deficiency causes dermatosis; supplementation with zinc sulfate is common'
  },
  {
    chunkId: 'C4',
    docId: 'other',
    text: '维生素A缺乏会导致夜盲'
  }
];

describe('切词', () => {
  it('中文按二元组切，英文按整词', () => {
    expect(tokenize('锌的吸收')).toEqual(expect.arrayContaining(['锌的', '的吸', '吸收']));
    expect(tokenize('Zinc Sulfate')).toEqual(['zinc', 'sulfate']);
  });

  it('去重并丢掉停用词', () => {
    const tokens = tokenize('zinc and the zinc');
    expect(tokens.filter((t) => t === 'zinc')).toHaveLength(1);
    expect(tokens).not.toContain('and');
  });
});

describe('检索', () => {
  it('问"螯合锌和硫酸锌"能命中 NRC 那段', () => {
    const hits = searchKnowledge(corpus, 'zinc sulfate bioavailable chelates');
    expect(hits[0].chunkId).toBe('C1');
    expect(hits[0].docId).toBe('nrc');
  });

  it('问"氧化铜能不能用"能命中 FEDIAF 那段', () => {
    const hits = searchKnowledge(corpus, 'copper oxide source');
    expect(hits[0].chunkId).toBe('C2');
  });

  it('中文问题也能命中中文段落', () => {
    const hits = searchKnowledge(corpus, '维生素A 缺乏');
    expect(hits[0].chunkId).toBe('C4');
  });

  it('每条都带出处（chunkId + docId），好让模型引用', () => {
    for (const hit of searchKnowledge(corpus, 'zinc')) {
      expect(hit.chunkId).toBeTruthy();
      expect(hit.docId).toBeTruthy();
    }
  });

  it('没有任何命中时返回空，不硬凑', () => {
    expect(searchKnowledge(corpus, 'zzzz')).toEqual([]);
  });

  it('空查询返回空，不把整库倒出来', () => {
    expect(searchKnowledge(corpus, '   ')).toEqual([]);
  });

  it('limit 生效，默认不超过 4 条', () => {
    expect(searchKnowledge(corpus, 'zinc').length).toBeLessThanOrEqual(4);
    expect(searchKnowledge(corpus, 'zinc', { limit: 1 })).toHaveLength(1);
  });
});
