import {
  KNOWLEDGE_PROMPT_ENTRY_LIMIT,
  KnowledgeBaseService,
} from '../../../src/application/recipe-designer/knowledge-base.service';
import { deriveKnowledgeTags } from '../../../src/application/recipe-designer/recipe-designer.service';
import { KNOWLEDGE_SOURCES, isKnownSourceId, sourceOrganization } from '../../../src/domain/recipe-designer/knowledge-base/source-registry';
import { KNOWLEDGE_TAG_VOCABULARY } from '../../../src/domain/recipe-designer/knowledge-base/tag-vocabulary';
import { HEALTH_ONLY_DOMAINS } from '../../../src/domain/recipe-designer/knowledge-base/types';

/**
 * 知识库结构升级（2026-10-01）。
 *
 * 这一组测试锁的是**结构规则本身**，不是某条知识的内容：
 *   · 交叉验证按风险分级（高风险必须两个独立机构）
 *   · 分诊类必须写死紧急程度
 *   · 出处必须是登记过的来源 ID
 *   · 未审核的内容不得进顾客侧
 *   · 提示词有条数上限（改造前最坏情况 121 条 / 7.4 万 tokens）
 *   · 免疫/化验/就医时机不污染食谱设计的提示词
 */
describe('知识库结构升级', () => {
  let service: KnowledgeBaseService;

  beforeEach(() => {
    service = new KnowledgeBaseService();
  });

  describe('三个新领域', () => {
    it('免疫 / 检查指标解读 / 常见病与就医时机都已注册且有内容', () => {
      for (const domain of ['IMMUNE', 'LAB', 'CLINICAL'] as const) {
        expect(service.getByDomain(domain).length).toBeGreaterThanOrEqual(10);
      }
    });

    it('全库校验通过（含新增的结构化规则）', () => {
      expect(() => new KnowledgeBaseService()).not.toThrow();
    })
  })

  describe('第二批五个领域（预防 / 护理 / 就诊准备 / 品种风险 / 行为）', () => {
    it('都已注册且有内容', () => {
      for (const domain of [
        'PREVENTION',
        'NURSING',
        'VISITPREP',
        'BREEDRISK',
        'BEHAVIOR',
      ] as const) {
        expect(service.getByDomain(domain).length).toBeGreaterThanOrEqual(5);
      }
    })

    it('这五个领域的条目都带得上检索标签（否则永远检索不到）', () => {
      for (const domain of [
        'PREVENTION',
        'NURSING',
        'VISITPREP',
        'BREEDRISK',
        'BEHAVIOR',
      ] as const) {
        for (const entry of service.getByDomain(domain)) {
          expect(entry.applicableTo.length).toBeGreaterThan(0);
        }
      }
    })

    it('这五个领域都不进食谱设计的提示词', () => {
      const recipe = service.buildPromptContext(
        [
          'prevention',
          'nursing',
          'visit-prep',
          'breed-risk',
          'behavior',
          'lab',
          'clinical',
          'adult',
          'general',
        ],
        [],
        { purpose: 'recipe-design' },
      )

      expect(recipe).not.toMatch(/\[(prev|nurse|visit|breed|behav)-/)
    })
  })

  describe('来源结构', () => {
    it('出处全部是登记表里有的来源 ID', () => {
      const unknown = service
        .getAll()
        .flatMap((entry) => (entry.sources || []).map((s) => s.sourceId))
        .filter((sourceId) => !isKnownSourceId(sourceId))

      expect(unknown).toEqual([])
    })

    it('国内两类来源算不同主体（法律 vs 技术规范）', () => {
      expect(sourceOrganization('CN-EPIDEMIC-LAW')).not.toBe(
        sourceOrganization('CN-RABIES-TECH'),
      )
    })

    it('同机构的不同文档算同源', () => {
      expect(sourceOrganization('WSAVA-VACC-2024')).toBe(
        sourceOrganization('WSAVA-PAIN-2022'),
      )
    })

    it('来源登记表自身没有重复 ID', () => {
      const ids = KNOWLEDGE_SOURCES.map((source) => source.id)
      expect(new Set(ids).size).toBe(ids.length)
    })
  })

  describe('提示词条数上限', () => {
    const heavyProfile = {
      lifeStageLabel: '老年犬',
      ageMonths: 108,
      bcsScore: 8,
      currentWeightKg: 22,
      weightTrend: [],
      medicalHistory:
        '慢性肾病 肌酐偏高；胰腺炎病史；骨关节炎；牙周病；心脏病；甲状腺功能减退；贫血',
      checkups: [{ findings: '血常规与生化异常，尿蛋白', recommendations: '复查' }],
      medicalRecords: [{ diagnosis: '慢性肾病', chiefComplaint: '多饮多尿' }],
    }

    it('多系统疾病犬也不会把整库塞进提示词', () => {
      const { tags } = deriveKnowledgeTags(heavyProfile)

      const text = service.buildPromptContext(tags, [], {
        purpose: 'health',
      })

      const entries = (text.match(/^- \[/gm) || []).length
      expect(entries).toBeLessThanOrEqual(KNOWLEDGE_PROMPT_ENTRY_LIMIT)
    })

    it('上限可调（调用方需要更多时可以放宽）', () => {
      const { tags } = deriveKnowledgeTags(heavyProfile)

      const text = service.buildPromptContext(tags, [], {
        purpose: 'health',
        limit: 8,
      })

      expect((text.match(/^- \[/gm) || []).length).toBeLessThanOrEqual(8)
    })

    it('命中标签多的条目排在前面（相关度优先）', () => {
      const { tags } = deriveKnowledgeTags(heavyProfile)
      const matched = service.searchByTags(tags)

      expect(matched.length).toBeGreaterThan(1)
      const firstHits = matched[0].applicableTo.filter((tag) =>
        tags.map((item) => item.toLowerCase()).includes(tag.toLowerCase()),
      ).length
      const lastHits = matched[matched.length - 1].applicableTo.filter((tag) =>
        tags.map((item) => item.toLowerCase()).includes(tag.toLowerCase()),
      ).length

      expect(firstHits).toBeGreaterThanOrEqual(lastHits)
    })
  })

  describe('免疫/化验/就医时机不污染食谱设计', () => {
    it('食谱用途的提示词里没有这三个领域', () => {
      const { tags } = deriveKnowledgeTags({
        lifeStageLabel: '成年犬',
        ageMonths: 36,
        bcsScore: 5,
        currentWeightKg: 12,
        weightTrend: [],
        medicalHistory: null,
        checkups: [{ findings: '未见异常', recommendations: '' }],
        medicalRecords: [],
      })

      const recipe = service.buildPromptContext(tags, [], {
        purpose: 'recipe-design',
      })

      expect(recipe).not.toMatch(/\[(immune|lab|clinical)-/)
      expect(recipe).toMatch(/\[/) // 但营养类条目仍然在
    })

    it('默认用途是食谱设计（不改变既有调用方的行为）', () => {
      const { tags } = deriveKnowledgeTags({
        lifeStageLabel: '成年犬',
        ageMonths: 36,
        bcsScore: 5,
        currentWeightKg: 12,
        weightTrend: [],
        medicalHistory: null,
        checkups: [],
        medicalRecords: [],
      })

      const byDefault = service.buildPromptContext(tags, [])
      const explicit = service.buildPromptContext(tags, [], {
        purpose: 'recipe-design',
      })

      expect(byDefault).toBe(explicit)
    })
  })

  describe('受控词表涵盖新领域', () => {
    it('新领域用到的检索标签都在词表里', () => {
      const needed = ['vaccine', 'immune', 'prevention', 'clinical', 'red-flag', 'lab']
      for (const tag of needed) {
        expect(KNOWLEDGE_TAG_VOCABULARY).toContain(tag)
      }
    })

    it('第二批新增的检索标签也在词表里', () => {
      const needed = [
        'triage',
        'followup',
        'nursing',
        'visit-prep',
        'breed-risk',
        'behavior',
      ]
      for (const tag of needed) {
        expect(KNOWLEDGE_TAG_VOCABULARY).toContain(tag)
      }
    })

    it('系统会产出这些标签（否则条目永远检索不到）', () => {
      const { tags } = deriveKnowledgeTags({
        lifeStageLabel: '成年犬',
        ageMonths: 36,
        bcsScore: 5,
        currentWeightKg: 12,
        weightTrend: [],
        medicalHistory: null,
        checkups: [{ findings: '未见异常', recommendations: '' }],
        medicalRecords: [],
      })

      for (const tag of ['vaccine', 'immune', 'prevention', 'clinical', 'red-flag', 'lab']) {
        expect(tags).toContain(tag)
      }
    })

    it('没有检查记录时不产出 lab 标签（化验解读用不上）', () => {
      const { tags } = deriveKnowledgeTags({
        lifeStageLabel: '成年犬',
        ageMonths: 36,
        bcsScore: 5,
        currentWeightKg: 12,
        weightTrend: [],
        medicalHistory: null,
        checkups: [],
        medicalRecords: [],
      })

      expect(tags).not.toContain('lab')
    })
  })

  describe('LAB 领域不写死参考区间（第二批也要守）', () => {
    it('正文里没有"数值–数值 单位"这类区间写法', () => {
      // 允许举例（如"上次 2.0 这次 2.3"），但不允许出现带单位的区间，
      // 一旦出现就会被家长拿去套自己报告上印的区间
      const rangePattern =
        /\d+(\.\d+)?\s*[-–~]\s*\d+(\.\d+)?\s*(mg|g\/|mmol|µmol|umol|U\/L|IU|%|fL|pg|ng|mEq|mmol\/L|×10)/i

      const offenders = service
        .getByDomain('LAB')
        .filter((entry) =>
          rangePattern.test(
            [entry.summary, ...entry.details, ...(entry.caveats || [])].join(' '),
          ),
        )
        .map((entry) => entry.id)

      expect(offenders).toEqual([])
    })
  })

  describe('HEMO 自引与 AAHA 2014 降级（上一轮审计发现的问题）', () => {
    it('不再有"自己引自己"的出处', () => {
      const selfCitations = service
        .getAll()
        .flatMap((entry) =>
          entry.citations.filter((citation) => citation.source.includes('本知识库')),
        )

      expect(selfCitations).toEqual([])
    })

    it('HEMO 领域补上了 ACVIM 血液共识作为独立来源', () => {
      const hemoWithAcvim = service
        .getByDomain('HEMO')
        .filter((entry) =>
          entry.citations.some((citation) => citation.source.includes('ACVIM')),
        )

      expect(hemoWithAcvim.length).toBeGreaterThanOrEqual(4)
    })

    it('AAHA 2014 与 2021 版并用，且 2014 不再被描述为「已被取代」', () => {
      // 2026-11-01 更正：AAHA 2021 原文写明「详细减重方案请参阅 2014 指南」
      // （"We encourage readers to consult the 2014 Weight Management Guidelines
      //  for more complete information"）。2021 只是概览，二者是配套关系，
      // 不是「新版取代旧版」，所以出处里不应再出现「已被 2021 版取代」。
      const citations = service.getAll().flatMap((entry) => entry.citations)
      const aaha2014 = citations.filter((citation) =>
        citation.source.includes('AAHA 2014'),
      )
      const aaha2021 = citations.filter((citation) =>
        citation.source.includes('AAHA 2021'),
      )

      expect(aaha2014.length).toBeGreaterThan(0)
      expect(aaha2021.length).toBeGreaterThan(0)
      for (const citation of aaha2014) {
        expect(citation.source).not.toContain('已被 2021 版取代')
      }
    })
  })
})
