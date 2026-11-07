import { existsSync } from 'node:fs';
import { KnowledgeSearchService } from '../../../src/application/knowledge/knowledge-search.service';

/**
 * 拿真实语料验一次：这是模型"自己去查资料"的工具，
 * 如果它连锌的形态、铜的来源都召不回来，模型后面所有判断都是空中楼阁。
 */
/**
 * 语料 `docs/knowledge-base/chunks.jsonl` 是**被 gitignore 的本地产物**（17MB），
 * 工位和 CI 里都没有。所以这组用例在本机跑（可用 KNOWLEDGE_CHUNKS_PATH 指定）
 * 没有语料就整体跳过——**不用假数据冒充真实召回**。
 */
const corpusPath =
  process.env.KNOWLEDGE_CHUNKS_PATH ??
  '/Users/zhaochen/Documents/SevenKitchen/docs/knowledge-base/chunks.jsonl';

(existsSync(corpusPath) ? describe : describe.skip)(
  'KnowledgeSearchService（真实语料）',
  () => {
    process.env.KNOWLEDGE_CHUNKS_PATH = corpusPath;
    const service = new KnowledgeSearchService();

    it('语料能载入', () => {
      expect(service.isAvailable()).toBe(true);
    });

  it('问锌的形态，能召回 NRC/FEDIAF 这类权威段落', () => {
    const hits = service.search('zinc sulfate bioavailability chelate', 4);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((hit) => /nrc|fediaf|sacn/i.test(hit.docId))).toBe(true);
    // 头几条里必须真的出现 zinc（排名细节不钉死，别的地方会调）
    expect(hits.some((hit) => hit.text.toLowerCase().includes('zinc'))).toBe(true);
  });

  it('问氧化铜，能召回"不应作为铜源"那条依据', () => {
    const hits = service.search('copper oxide source of copper', 4);
    const texts = hits.map((hit) => hit.text.toLowerCase()).join(' ');
    expect(texts).toContain('copper oxide');
  });

  it('每条结果都带出处与段落号', () => {
    for (const hit of service.search('bioavailability', 3)) {
      expect(hit.docId).toBeTruthy();
      expect(hit.chunkId).toBeTruthy();
      expect(hit.text.length).toBeLessThanOrEqual(600);
    }
  });

    it('完全无关的查询返回空', () => {
      expect(service.search('zzzzqqqq')).toEqual([]);
    });
  }
);
