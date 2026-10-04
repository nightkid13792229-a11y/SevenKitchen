import {
  HEALTH_ANALYSIS_CACHE_MAX_ENTRIES,
  HEALTH_ANALYSIS_CACHE_TTL_MS,
  HealthAnalysisCache,
  HealthAnalysisService,
  buildAnalysisFingerprint,
  resolveCacheTtlMs,
} from '../../../src/application/health/health-analysis.service';

jest.mock('../../../src/application/recipe-designer/deepseek-chat', () => ({
  callDeepSeekJson: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { callDeepSeekJson } = require('../../../src/application/recipe-designer/deepseek-chat');

/**
 * 分析结果缓存（2026-10-02，老板要求"分析结果最好是做一个缓存"）。
 *
 * 这组测试锁四件事：
 *   ① 记录没变 → 第二次直接给上次的结果，**不再调模型**（这是省时间省钱的全部意义）
 *   ② 记录变了（指纹变）→ 必须重算，不许拿旧结论糊弄
 *   ③ 顾客与营养师分开存（两边可引用的知识不同，混用等于漏未审核内容）
 *   ④ TTL 兜底、条目有上限（不能让内存无限涨）
 */
describe('健康分析缓存', () => {
  const DOG_ID = 'dog-1';
  const CUSTOMER_ID = 'customer-1';

  function buildSummary() {
    return {
      dog: {
        id: DOG_ID,
        name: '面包',
        breedName: '比熊',
        gender: '公',
        isNeutered: true,
        ageText: '9 岁 2 个月',
        currentWeightKg: 12.4,
        bcsScore: 7,
        weightUpdatedAt: '2026-09-20',
      },
      allergies: [],
      ongoingConditions: [],
      recentVisits: [
        {
          id: 'm1',
          date: '2026-08-01',
          diagnosis: '慢性肾病',
          treatment: '',
          veterinarian: '',
          attachmentCount: 0,
        },
      ],
      recentCheckups: [],
      vaccines: { latest: [], upcoming: [] },
      weight: { current: 12.4, records: [], recentChangeKg: 0.4 },
      diet: { preferredFoods: '鸡胸肉', pickyFoods: '' },
      counts: { visits: 1, checkups: 0, allergies: 0, vaccines: 0, weights: 0 },
      medicalHistory: '慢性肾病',
      generatedAt: '2026-10-01T00:00:00.000Z',
    };
  }

  function modelOutput() {
    const out: Record<string, any> = {};
    for (const section of [
      'overview',
      'recordReading',
      'watchSignals',
      'nutritionAdvice',
      'followUpAdvice',
      'vaccineAdvice',
      'visitPrep',
    ]) {
      out[section] = { content: `${section} 的内容`, citations: ['lab-003'] };
    }
    return out;
  }

  function createService(summary: Record<string, any> = buildSummary()) {
    const knowledgeContext = '- [lab-003]（领域：检查指标解读）肌酐与尿素\n  建议：……';
    const service = new HealthAnalysisService(
      {} as any,
      { getVisitSummary: jest.fn().mockImplementation(async () => ({ ...summary })) } as any,
      {
        buildPromptContext: jest.fn().mockReturnValue(knowledgeContext),
        getAll: jest.fn().mockReturnValue([{ id: 'lab-003', title: '肌酐与尿素' }]),
      } as any,
      {
        getEnabledDeepSeekRuntimeConfig: jest.fn().mockResolvedValue({
          baseUrl: 'http://example.com',
          model: 'test-model',
          apiKey: 'test-key',
          requestTimeoutMs: 1000,
        }),
      } as any,
    );
    return service;
  }

  beforeEach(() => {
    callDeepSeekJson.mockReset();
    callDeepSeekJson.mockResolvedValue(modelOutput());
    process.env.HEALTH_ANALYSIS = 'customer';
  });

  afterAll(() => {
    delete process.env.HEALTH_ANALYSIS;
  });

  describe('指纹', () => {
    it('记录变了指纹就变，generatedAt 变了不算变', () => {
      const base = buildSummary();
      const sameRecordLater = { ...base, generatedAt: '2026-10-02T09:00:00.000Z' };
      expect(buildAnalysisFingerprint(sameRecordLater)).toBe(buildAnalysisFingerprint(base));

      const withNewVisit = {
        ...base,
        counts: { ...base.counts, visits: 2 },
        recentVisits: [
          { id: 'm2', date: '2026-09-30', diagnosis: '呕吐', treatment: '', veterinarian: '', attachmentCount: 0 },
          ...base.recentVisits,
        ],
      };
      expect(buildAnalysisFingerprint(withNewVisit)).not.toBe(
        buildAnalysisFingerprint(base),
      );
    })

    it('体重、体况、病史、饮食任何一处变了，指纹都要变', () => {
      const base = buildSummary();
      const baseFingerprint = buildAnalysisFingerprint(base);

      const weightChanged = {
        ...base,
        weight: { ...base.weight, current: 11.9 },
      };
      const bcsChanged = { ...base, dog: { ...base.dog, bcsScore: 6 } };
      const historyChanged = { ...base, medicalHistory: '慢性肾病 胰腺炎' };
      const dietChanged = { ...base, diet: { preferredFoods: '鸭肉', pickyFoods: '' } };

      for (const changed of [weightChanged, bcsChanged, historyChanged, dietChanged]) {
        expect(buildAnalysisFingerprint(changed)).not.toBe(baseFingerprint);
      }
    })

    it('摘要有字段顺序差异时不会误判（同一份记录两次读取指纹一致）', () => {
      const base = buildSummary();
      expect(buildAnalysisFingerprint(JSON.parse(JSON.stringify(base)))).toBe(
        buildAnalysisFingerprint(base),
      );
    })

    it('空摘要不炸', () => {
      expect(buildAnalysisFingerprint(null)).toBe('empty')
      expect(buildAnalysisFingerprint(undefined)).toBe('empty')
      expect(buildAnalysisFingerprint('不是对象')).toBe('empty')
    })
  })

  describe('命中与失效', () => {
    it('记录没变：第二次直接用上次结果，模型只调一次', async () => {
      const service = createService();

      const first: any = await service.analyze(CUSTOMER_ID, DOG_ID, 'customer');
      const second: any = await service.analyze(CUSTOMER_ID, DOG_ID, 'customer');

      expect(callDeepSeekJson).toHaveBeenCalledTimes(1);
      expect(first.fromCache).toBeUndefined();
      expect(second.fromCache).toBe(true);
      expect(second.items).toEqual(first.items);
      // 生成时间必须是**上一次真正生成**的时间，不能刷成"刚刚"
      expect(second.generatedAt).toBe(first.generatedAt);
    })

    it('新记了一条记录：指纹变，必须重算', async () => {
      let summary = buildSummary();
      const timeline = {
        getVisitSummary: jest.fn().mockImplementation(async () => ({ ...summary })),
      } as any;
      const service = new HealthAnalysisService(
        {} as any,
        timeline,
        {
          buildPromptContext: jest.fn().mockReturnValue('- [lab-003] 肌酐与尿素'),
          getAll: jest.fn().mockReturnValue([{ id: 'lab-003', title: '肌酐与尿素' }]),
        } as any,
        {
          getEnabledDeepSeekRuntimeConfig: jest.fn().mockResolvedValue({
            baseUrl: 'http://example.com',
            model: 'test-model',
            apiKey: 'test-key',
            requestTimeoutMs: 1000,
          }),
        } as any,
      );

      await service.analyze(CUSTOMER_ID, DOG_ID, 'customer');
      summary = {
        ...summary,
        counts: { ...summary.counts, visits: 2 },
      };
      const after: any = await service.analyze(CUSTOMER_ID, DOG_ID, 'customer');

      expect(callDeepSeekJson).toHaveBeenCalledTimes(2);
      expect(after.fromCache).toBeUndefined();
    })

    it('顾客与营养师分开存：不同 audience 各算各的', async () => {
      const service = createService();

      await service.analyze(CUSTOMER_ID, DOG_ID, 'customer');
      await service.analyze(CUSTOMER_ID, DOG_ID, 'nutritionist');
      await service.analyze(CUSTOMER_ID, DOG_ID, 'customer');

      // 顾客一次 + 营养师一次；第三次顾客命中缓存
      expect(callDeepSeekJson).toHaveBeenCalledTimes(2);
    })

    it('不同狗狗各存各的', async () => {
      const service = createService();

      await service.analyze(CUSTOMER_ID, 'dog-1', 'customer');
      await service.analyze(CUSTOMER_ID, 'dog-2', 'customer');
      await service.analyze(CUSTOMER_ID, 'dog-1', 'customer');

      expect(callDeepSeekJson).toHaveBeenCalledTimes(2);
    })
  })

  describe('缓存容器', () => {
    const result = { dogId: 'd', items: [], approvedKnowledgeCount: 0, insufficientSections: [], downgradedSections: [], audience: 'customer', generatedAt: 'x' } as any;

    it('过期就不再命中', () => {
      const cache = new HealthAnalysisCache(1000, 10);
      cache.set('k', 'f', result, 0);
      expect(cache.get('k', 'f', 999)).toBe(result);
      expect(cache.get('k', 'f', 1000)).toBeNull();
    })

    it('指纹不符就不命中，并且顺手清掉', () => {
      const cache = new HealthAnalysisCache(1000, 10);
      cache.set('k', 'f', result, 0);
      expect(cache.get('k', 'other', 1)).toBeNull();
      expect(cache.size).toBe(0);
    })

    it('超过上限淘汰最旧的，不会无限涨', () => {
      const cache = new HealthAnalysisCache(HEALTH_ANALYSIS_CACHE_TTL_MS, 3);
      for (let i = 0; i < 5; i += 1) {
        cache.set(`k${i}`, 'f', result, i);
      }
      expect(cache.size).toBe(3);
      expect(cache.get('k0', 'f', 10)).toBeNull();
      expect(cache.get('k4', 'f', 10)).toBe(result);
      expect(HEALTH_ANALYSIS_CACHE_MAX_ENTRIES).toBeGreaterThanOrEqual(3);
    })

    it('默认 30 分钟，可用环境变量覆盖；非法值退回默认', () => {
      expect(resolveCacheTtlMs({} as any)).toBe(HEALTH_ANALYSIS_CACHE_TTL_MS);
      expect(resolveCacheTtlMs({ HEALTH_ANALYSIS_CACHE_TTL_MINUTES: '5' } as any)).toBe(
        5 * 60 * 1000,
      );
      expect(resolveCacheTtlMs({ HEALTH_ANALYSIS_CACHE_TTL_MINUTES: '0' } as any)).toBe(
        HEALTH_ANALYSIS_CACHE_TTL_MS,
      );
      expect(resolveCacheTtlMs({ HEALTH_ANALYSIS_CACHE_TTL_MINUTES: 'abc' } as any)).toBe(
        HEALTH_ANALYSIS_CACHE_TTL_MS,
      );
    })
  })
})
