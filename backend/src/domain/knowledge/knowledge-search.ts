/**
 * 营养知识库检索（纯函数）。
 *
 * 输入是 `docs/knowledge-base/chunks.jsonl` 里那种段落数组，输出最相关的几条，
 * **带出处**（文档名 + 段落号），好让模型引用、让人核对。
 *
 * 为什么不用向量检索：这个库只有两万段、领域词很硬（zinc sulfate / bioavailability），
 * 关键词打分已经够用，还能解释"为什么是这几条"。以后要换向量，换的是这个文件。
 */
export interface KnowledgeChunk {
  chunkId: string;
  docId: string;
  text: string;
}

export interface KnowledgeHit {
  chunkId: string;
  docId: string;
  /** 命中段落原文（截断到可读长度） */
  text: string;
  score: number;
}

export interface KnowledgeSearchOptions {
  limit?: number;
  /** 每条返回的最大字符数 */
  snippetChars?: number;
}

const STOP_WORDS = new Set([
  '的', '了', '和', '与', '及', '或', '在', '是', '有', '对', '吗', '呢', '这', '那',
  'the', 'and', 'for', 'with', 'that', 'this', 'are', 'was', 'were', 'from', 'not'
]);

/**
 * 中文按二元组切、英文按整词（含数字），都转小写。
 * 二元组是为了"生物利用率"这种长词也能被单个词组命中。
 */
export function tokenize(query: string): string[] {
  const lowered = query.toLowerCase();
  const tokens: string[] = [];

  for (const word of lowered.match(/[a-z][a-z0-9-]{1,}/g) ?? []) {
    if (!STOP_WORDS.has(word)) {
      tokens.push(word);
    }
  }

  for (const run of lowered.match(/[\u4e00-\u9fa5]+/g) ?? []) {
    if (run.length === 1) {
      tokens.push(run);
      continue;
    }
    for (let index = 0; index < run.length - 1; index += 1) {
      const bigram = run.slice(index, index + 2);
      if (!STOP_WORDS.has(bigram)) {
        tokens.push(bigram);
      }
    }
  }

  return [...new Set(tokens)];
}

/**
 * 打分：命中越多分越高；长词比短词值钱；正文里连续出现整句给一次额外加分。
 * 简单、可解释——这也是选它的原因。
 */
export function scoreChunk(chunk: KnowledgeChunk, tokens: string[], query: string): number {
  const haystack = chunk.text.toLowerCase();
  let score = 0;
  let matched = 0;
  for (const token of tokens) {
    let index = haystack.indexOf(token);
    if (index === -1) {
      continue;
    }
    matched += 1;
    let hits = 0;
    while (index !== -1 && hits < 5) {
      hits += 1;
      index = haystack.indexOf(token, index + token.length);
    }
    score += hits * Math.min(token.length, 8);
  }

  // 覆盖度：命中的词占查询词的比例越高质量越高。
  // 不这么算的话，"常见矿物质来源"这种大表格靠字多就能压过真正讲锌的段落。
  const coverage = tokens.length > 0 ? (matched / tokens.length) ** 2 : 0;
  score *= coverage;

  const phrase = query.trim().toLowerCase();
  if (phrase.length >= 4 && haystack.includes(phrase)) {
    score += 20;
  }
  return score;
}

export function searchKnowledge(
  chunks: readonly KnowledgeChunk[],
  query: string,
  options: KnowledgeSearchOptions = {}
): KnowledgeHit[] {
  const limit = Math.max(1, Math.min(options.limit ?? 4, 10));
  const snippetChars = Math.max(120, Math.min(options.snippetChars ?? 600, 2000));
  const tokens = tokenize(query);
  if (tokens.length === 0) {
    return [];
  }

  const hits: KnowledgeHit[] = [];
  for (const chunk of chunks) {
    const score = scoreChunk(chunk, tokens, query);
    if (score > 0) {
      hits.push({
        chunkId: chunk.chunkId,
        docId: chunk.docId,
        text: chunk.text.slice(0, snippetChars),
        score
      });
    }
  }

  return hits
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((hit) => ({ ...hit, score: Math.round(hit.score * 100) / 100 }));
}
