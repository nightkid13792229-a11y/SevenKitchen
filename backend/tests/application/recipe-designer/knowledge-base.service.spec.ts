import { KnowledgeBaseService } from '../../../src/application/recipe-designer/knowledge-base.service';
import { deriveKnowledgeTags } from '../../../src/application/recipe-designer/recipe-designer.service';
import {
  KNOWLEDGE_TAG_VOCABULARY,
  RETRIEVAL_TAGS,
  DESCRIPTIVE_TAGS,
  isKnownTag,
  isRetrievalTag,
} from '../../../src/domain/recipe-designer/knowledge-base/tag-vocabulary';

/**
 * 知识库回归测试。
 *
 * 为什么补这组测试：在 2026-09-30 之前，知识库一条测试都没有，
 * 于是两个问题长期存在且无人发现——
 *   ① SAFE（食品安全）领域 7 条知识的标签是系统永远不会产出的值，
 *      导致它们从未进入过任何一次 AI 提示词；
 *   ② ortho / hepatic 里有 oain（应为 pain）、hepato、he 三处错字断词标签。
 *
 * 这组测试的作用就是让这类"静默失效"在提交时就报错，而不是等几个月后才发现。
 */
describe('KnowledgeBaseService', () => {
  let service: KnowledgeBaseService;

  beforeEach(() => {
    service = new KnowledgeBaseService();
  });

  describe('启动校验', () => {
    it('构造时校验通过（无重复 id、无词表外标签、每条都至少有一个检索标签）', () => {
      expect(() => new KnowledgeBaseService()).not.toThrow();
    });

    it('标签受控词表内部无重复', () => {
      expect(new Set(KNOWLEDGE_TAG_VOCABULARY).size).toBe(
        KNOWLEDGE_TAG_VOCABULARY.length,
      );
    });

    it('检索词表与描述词表不重叠', () => {
      const retrieval = new Set(RETRIEVAL_TAGS);
      const overlap = DESCRIPTIVE_TAGS.filter((tag) => retrieval.has(tag));
      expect(overlap).toEqual([]);
    });

    it('isRetrievalTag / isKnownTag 能识别标签归属', () => {
      expect(isRetrievalTag('ckd')).toBe(true);
      expect(isKnownTag('ckd')).toBe(true);
      // 描述性标签在词表内，但不会被系统自动产出
      expect(isKnownTag('mycotoxin')).toBe(true);
      expect(isRetrievalTag('mycotoxin')).toBe(false);
      expect(isKnownTag('这不是一个标签')).toBe(false);
    });
  });

  describe('每条知识都必须可能被检索到', () => {
    it('所有条目 id 唯一', () => {
      const ids = service.getAll().map((entry) => entry.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('所有条目的标签都在受控词表内', () => {
      const offenders = service
        .getAll()
        .flatMap((entry) =>
          entry.applicableTo
            .filter((tag) => !isKnownTag(tag))
            .map((tag) => `${entry.id}:${tag}`),
        );
      expect(offenders).toEqual([]);
    });

    it('所有条目都至少有一个检索标签（否则永远检索不到）', () => {
      const unreachable = service
        .getAll()
        .filter(
          (entry) => !entry.applicableTo.some((tag) => isRetrievalTag(tag)),
        )
        .map((entry) => `${entry.id}[${entry.applicableTo.join(',')}]`);
      expect(unreachable).toEqual([]);
    });

    it('所有条目都有出处', () => {
      const missing = service
        .getAll()
        .filter((entry) => entry.citations.length === 0)
        .map((entry) => entry.id);
      expect(missing).toEqual([]);
    });
  });

  describe('标签错字回归', () => {
    it('不再出现 oain / hepato / he 这三个错字断词标签', () => {
      const vocab = new Set(KNOWLEDGE_TAG_VOCABULARY);
      expect(vocab.has('oain')).toBe(false);
      expect(vocab.has('hepato')).toBe(false);
      expect(vocab.has('he')).toBe(false);
    });

    it('ortho 领域用正确的 pain 标签', () => {
      const entry = service
        .getAll()
        .find((item) => item.applicableTo.includes('pain'));
      expect(entry).toBeDefined();
      expect(entry?.domain).toBe('ORTHO');
    });
  });

  describe('SAFE 领域可检索（2026-09-30 修复）', () => {
    it('食品安全标签现在会被检索到', () => {
      const matched = service.searchByTags(['safe', 'food-safety']);
      expect(matched.length).toBeGreaterThanOrEqual(7);
    });

    it('SAFE 领域 7 条知识全部可被标签检索到', () => {
      const safeEntries = service
        .getByDomain('SAFE')
        .map((entry) => entry.id)
        .sort();
      const matchedIds = new Set(
        service.searchByTags(['safe', 'food-safety']).map((entry) => entry.id),
      );
      expect(safeEntries.length).toBe(7);
      for (const id of safeEntries) {
        expect(matchedIds.has(id)).toBe(true);
      }
    });

    it('像普通成年犬这样没有疾病标签的档案，也能检索到食品安全知识', () => {
      const matched = service.searchByTags(['general', 'adult', 'safe']);
      const ids = matched.map((entry) => entry.id);
      expect(ids.some((id) => id.startsWith('safe-'))).toBe(true);
    });

    it('deriveKnowledgeTags 对每一只狗都产出食品安全标签', () => {
      // 关键点：标签由系统产出，条目的 safe / food-safety 才会被真正命中。
      // 只改条目标签、不改这里，SAFE 领域仍然是死知识。
      const { tags } = deriveKnowledgeTags({
        lifeStageLabel: '成年犬',
        ageMonths: 36,
        bcsScore: 5,
        currentWeightKg: 12,
        weightTrend: [],
        medicalHistory: null,
        checkups: [],
        medicalRecords: [],
      });
      expect(tags).toContain('safe');
      expect(tags).toContain('food-safety');

      // 端到端：健康成犬的标签能命中 SAFE 条目
      const matched = service.searchByTags(tags);
      expect(matched.some((entry) => entry.domain === 'SAFE')).toBe(true);
    });

    it('有病在身、有特殊阶段的狗同样能拿到食品安全知识', () => {
      const { tags } = deriveKnowledgeTags({
        lifeStageLabel: '老年犬',
        ageMonths: 96,
        bcsScore: 8,
        currentWeightKg: 20,
        weightTrend: [],
        medicalHistory: '慢性肾病，肌酐偏高',
        checkups: [],
        medicalRecords: [],
      });
      expect(tags).toContain('safe');
      expect(service.searchByTags(tags).some((e) => e.domain === 'SAFE')).toBe(
        true,
      );
    });
  });
});
