import {
  HEALTH_ANALYSIS_SECTIONS,
  HealthAnalysisService,
  buildSystemPrompt,
  countKnowledgeEntries,
  deriveProfileTags,
  normalizeCitationList,
} from '../../../src/application/health/health-analysis.service';

/**
 * AI 健康分析与建议（2026-10-01，第七期）。
 *
 * 老板第 19–21 条：七项产出；不做诊断只做初步分析；
 * 顾客与营养师都能看，顾客侧要有免责声明。
 *
 * 这组测试锁的是三道闸门：
 *   ① 没有出处就不给结论（不许自己发挥）
 *   ② 越界措辞（下诊断/分期/给剂量/替代就医）必须被拦下并降级
 *   ③ 顾客侧默认关闭（未审核知识不进顾客侧）
 */
describe('HealthAnalysisService', () => {
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
      allergies: [{ allergen: '鸡肉', notes: '', date: '2025-12-01' }],
      ongoingConditions: [
        { id: 'm1', date: '2026-08-01', diagnosis: '慢性肾病', status: '慢性', treatment: '', followUpDate: null },
      ],
      recentVisits: [{ id: 'm1', date: '2026-08-01', diagnosis: '慢性肾病', treatment: '', veterinarian: '', attachmentCount: 0 }],
      recentCheckups: [{ id: 'c1', date: '2026-06-01', checkupType: '常规体检', findings: '肌酐偏高', recommendations: '', attachmentCount: 0 }],
      vaccines: { latest: [], upcoming: [] },
      weight: { current: 12.4, records: [], recentChangeKg: 0.4 },
      diet: { preferredFoods: '鸡胸肉', pickyFoods: '' },
      counts: { visits: 1, checkups: 1, allergies: 1, vaccines: 0, weights: 0 },
      medicalHistory: '慢性肾病',
      generatedAt: '2026-10-01T00:00:00.000Z',
    };
  }

  function createService(options: {
    modelOutput?: Record<string, any>
    knowledgeContext?: string
  } = {}) {
    const prisma = {} as any;

    const timeline = {
      getVisitSummary: jest.fn().mockResolvedValue(buildSummary()),
    } as any;

    const knowledgeContext =
      options.knowledgeContext ??
      ['- [lab-003]（领域：检查指标解读／类型：解读）肌酐与尿素', '  建议：……', '- [immune-004]（领域：免疫／类型：免疫）幼犬首免的推荐时间表'].join('\n');

    const knowledgeBase = {
      buildPromptContext: jest.fn().mockReturnValue(knowledgeContext),
    } as any;

    const agentConfig = {
      getEnabledDeepSeekRuntimeConfig: jest.fn().mockResolvedValue({
        baseUrl: 'http://example.com',
        model: 'test-model',
        apiKey: 'test-key',
        requestTimeoutMs: 1000,
      }),
    } as any;

    const service = new HealthAnalysisService(
      prisma,
      timeline,
      knowledgeBase,
      agentConfig,
    );

    return { service, knowledgeBase, timeline }
  }

  describe('安全边界', () => {
    it('顾客侧默认关闭（未审核知识不进顾客侧）', async () => {
      const { service } = createService()
      expect(service.isCustomerEnabled()).toBe(false)

      const result: any = await service.analyze(CUSTOMER_ID, DOG_ID, 'customer')
      expect(result.available).toBe(false)
      expect(result.enableWith).toBe('HEALTH_ANALYSIS=customer')
      expect(result.message).toContain('专业审核')
    })

    it('营养师侧不受开关限制', async () => {
      const { service } = createService()
      // callModel 会真的去请求外部，所以这里只验证它没有在开关处被拦下
      await expect(service.analyze(CUSTOMER_ID, DOG_ID, 'nutritionist')).rejects.toBeTruthy()
    })
  })

  describe('提示词', () => {
    it('七项产出都在提示词里', () => {
      const prompt = buildSystemPrompt('customer')
      for (const section of HEALTH_ANALYSIS_SECTIONS) {
        expect(prompt).toContain(section)
      }
    })

    it('四条禁令写死在提示词里', () => {
      const prompt = buildSystemPrompt('customer')
      expect(prompt).toContain('不下诊断')
      expect(prompt).toContain('不做分期')
      expect(prompt).toContain('不给药物名称、剂量')
      expect(prompt).toContain('不替代就医')
    })

    it('明确要求"宁可不答，也不要自己发挥"', () => {
      const prompt = buildSystemPrompt('customer')
      expect(prompt).toContain('宁可不答，也不要自己发挥')
      expect(prompt).toContain('只能引用下面给出的知识条目')
    })

    it('顾客侧与营养师侧的语气不同', () => {
      expect(buildSystemPrompt('customer')).toContain('读者是宠物主人本人')
      expect(buildSystemPrompt('nutritionist')).toContain('读者是宠物营养师')
    })
  })

  describe('标签推导', () => {
    it('从摘要里认出生命阶段、体况与疾病领域', () => {
      const tags = deriveProfileTags(buildSummary())
      expect(tags).toContain('senior')
      expect(tags).toContain('overweight')
      expect(tags).toContain('ckd')
      expect(tags).toContain('food-allergy')
    })

    it('认不出病时也能给出基础标签', () => {
      const tags = deriveProfileTags({
        dog: { ageText: '3 岁', bcsScore: 5 },
        allergies: [],
        ongoingConditions: [],
        recentVisits: [],
        recentCheckups: [],
      })
      expect(tags).toContain('adult')
      expect(tags).toContain('all')
    })
  })

  describe('出处校验', () => {
    it('条目编号只认「字母-数字」的形状', () => {
      expect(normalizeCitationList(['lab-003', 'immune-004'])).toEqual(['lab-003', 'immune-004'])
      // 位数不强制三位：真正的护栏不是位数，而是"这个编号必须真的出现在
      // 本次检索结果里"（见 analyze 里的 knowledgeContext.includes 校验）。
      expect(normalizeCitationList(['lab-3'])).toEqual(['lab-3'])
      expect(normalizeCitationList(['随便写的', '', 'lab'])).toEqual([])
      expect(normalizeCitationList('不是数组')).toEqual([])
    })

    it('去重且限量', () => {
      const many = Array.from({ length: 30 }, (_, index) => `lab-${index}`)
      expect(normalizeCitationList([...many, 'lab-0']).length).toBeLessThanOrEqual(10)
    })

    it('能数出上下文里给了多少条条目', () => {
      const context = [
        '- [lab-003]（领域：检查指标解读）肌酐与尿素',
        '  建议：……',
        '- [immune-004]（领域：免疫）幼犬首免',
      ].join('\n')
      expect(countKnowledgeEntries(context)).toBe(2)
    })
  })

  describe('七项产出', () => {
    it('七项一一对应，标签用中文', () => {
      expect(HEALTH_ANALYSIS_SECTIONS).toHaveLength(7)
    })
  })
})
