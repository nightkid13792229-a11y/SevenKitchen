/**
 * 过敏原检测报告识别（AI）· 2026-09-27
 *
 * 老板批准「先只做过敏原检测报告这一个」。这组测试锁住几条不能退让的约束：
 *   1. 识别失败要抛错，让前端降级为手工填写（A2）—— 不能返回一个空结果让人以为成功
 *   2. 报告里写"阴性/无过敏"时不得编造过敏原
 *   3. 结果只是候选，服务本身**绝不写库**（写库必须经顾客确认，见决策 5/9）
 */

import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  HealthReportExtractionService,
  applyProductReview,
  buildProductReviewPrompt,
  buildProductReviewRows,
  normalizeDrafts,
  resolveHealthDocumentFileKind,
  HEALTH_REPORT_OCR_PROVIDER,
  buildNotMedicalWarning,
  buildSystemPrompt,
  filterContradictoryWarnings,
  isHealthReportVisionEnabled,
  normalizeDocumentType,
  normalizeDrafts,
  normalizeAllergyGroup,
  resolveAutoDocumentType,
  resolveHealthReportVisionModel,
} from 'src/application/health/health-report-extraction.service';
import { AgentProviderConfigService } from 'src/application/nutrition-governance/agent-provider-config.service';

const okJsonResponse = (payload: Record<string, unknown>) => ({
  ok: true,
  json: async () => ({
    choices: [{ message: { content: JSON.stringify(payload) } }],
  }),
});

describe('HealthReportExtractionService', () => {
  let service: HealthReportExtractionService;
  let ocrProvider: { recognizeImage: jest.Mock };
  let agentConfig: {
    getEnabledDeepSeekRuntimeConfig: jest.Mock;
    getConfiguredPurposeModel: jest.Mock;
  };

  // 既有用例测的都是「OCR 认字 → 文本模型整理」这条路，
  // 所以这里默认关掉视觉；视觉那条路单独一组用例打开它测。
  const originalVision = process.env.HEALTH_REPORT_VISION;
  const originalVisionModel = process.env.HEALTH_REPORT_VISION_MODEL;

  beforeEach(async () => {
    process.env.HEALTH_REPORT_VISION = 'off';
    delete process.env.HEALTH_REPORT_VISION_MODEL;
    ocrProvider = { recognizeImage: jest.fn() };
    agentConfig = {
      getEnabledDeepSeekRuntimeConfig: jest.fn().mockResolvedValue({
        provider: 'deepseek',
        baseUrl: 'https://api.deepseek.com',
        model: 'deepseek-v4-flash',
        reviewModel: 'deepseek-v4-pro',
        apiKey: 'test-key',
        maxConcurrency: 1,
        requestTimeoutMs: 5000,
        retryCount: 0,
      }),
      // 没有单独配「健康 · 报告识别」时返回 null → 用内置默认的视觉模型
      getConfiguredPurposeModel: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthReportExtractionService,
        { provide: HEALTH_REPORT_OCR_PROVIDER, useValue: ocrProvider },
        { provide: AgentProviderConfigService, useValue: agentConfig },
      ],
    }).compile();

    service = module.get(HealthReportExtractionService);
    jest.restoreAllMocks();
  });

  afterEach(() => {
    if (originalVision === undefined) delete process.env.HEALTH_REPORT_VISION;
    else process.env.HEALTH_REPORT_VISION = originalVision;
    if (originalVisionModel === undefined) delete process.env.HEALTH_REPORT_VISION_MODEL;
    else process.env.HEALTH_REPORT_VISION_MODEL = originalVisionModel;
  });

  const setFetchResponse = (payload: Record<string, unknown>) => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(okJsonResponse(payload)) as unknown as typeof fetch;
  };

  it('缺少图片地址时直接拒绝', async () => {
    await expect(
      service.extractFromReport({ imageUrl: '' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('OCR 读不出文字时抛错（前端据此降级为手工填写）', async () => {
    ocrProvider.recognizeImage.mockResolvedValue({ text: '   ' });
    // 2026-10-01：现在会先取一次模型配置（视觉优先），所以不能再断言"配置没被读"；
    // 真正要守的是**别白跑一次模型调用**。
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;

    await expect(
      service.extractFromReport({ imageUrl: 'https://cdn/x.jpg' }),
    ).rejects.toThrow('未能识别到报告文字');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('把 AI 提取的过敏原归一化：去空白、去重（忽略大小写）、限量', async () => {
    ocrProvider.recognizeImage.mockResolvedValue({ text: '过敏原检测报告…' });
    setFetchResponse({
      allergies: ['  鸡肉 ', '鸡肉', 'Chicken', 'chicken', '', '牛肉'],
      medicalConditions: ['  胰腺炎 '],
      confidence: 'HIGH',
      warnings: [],
    });

    const result = await service.extractFromReport({
      imageUrl: 'https://cdn/x.jpg',
    });

    expect(result.allergies).toEqual(['鸡肉', 'Chicken', '牛肉']);
    expect(result.medicalConditions).toEqual(['胰腺炎']);
    // 2026-10-08：不再要/不再返回 confidence（模型自评不可信，界面也不显示）
    expect((result as unknown as Record<string, unknown>).confidence).toBeUndefined();
    expect(result.ocrText).toContain('过敏原检测报告');
  });

  it('报告写明"未见异常"时不编造过敏原，并给出提示', async () => {
    ocrProvider.recognizeImage.mockResolvedValue({ text: '未见异常' });
    setFetchResponse({
      allergies: [],
      medicalConditions: [],
      confidence: 'HIGH',
      warnings: ['报告显示未见异常'],
    });

    const result = await service.extractFromReport({
      imageUrl: 'https://cdn/x.jpg',
    });

    expect(result.allergies).toEqual([]);
    expect(result.warnings).toContain('报告显示未见异常');
  });

  /**
   * 过敏报告的等级与分组（2026-10-05 第十一期，老板拿真实报告问出来的）。
   *
   * 三件事必须锁住：
   *   ① 判定区里写的"强阳性"要落成 POSITIVE（老提示词只列了"阳性"，
   *      模型不敢映射就整份退成 UNKNOWN —— 线上真实发生）
   *   ② "组胺（阳性对照）"不是过敏原，不能记进档案
   *   ③ 环境项要能被认出来（报告照抄的分组优先，报告没写就按名字兜底），
   *      定制食谱只该看见吃进去的东西
   */
  describe('过敏报告的等级与分组（2026-10-05 第十一期）', () => {
    it('提示词要求先找「结果判定」那一段，并把强阳性算成阳性', () => {
      const prompt = buildSystemPrompt('ALLERGY_REPORT');
      expect(prompt).toContain('结果判定');
      expect(prompt).toContain('强阳性');
      // 数值/颜色条不算结论 —— 这条边界不能松
      expect(prompt).toContain('数值大小一律不作为判断依据');
      // 对照项要丢
      expect(prompt).toContain('阳性对照');
    });

    it('提示词要求照抄分组，并说明食谱只关心食物组', () => {
      const prompt = buildSystemPrompt('ALLERGY_REPORT');
      expect(prompt).toContain('group');
      expect(prompt).toContain('FOOD 食物组');
      expect(prompt).toContain('ENVIRONMENT 环境组');
      expect(prompt).toContain('只许照抄');
    });

    it('提示词要求回答"这一张图有没有判定区"，没有就一律 UNKNOWN', () => {
      /**
       * 生产实测（老板那份两页报告）：第 1 页只有数值和颜色条，模型照颜色
       * 把一批"弱阳性"猜成了"阳性"；第 2 页才是真正的判定区。
       * 前端要把多页合起来，就必须知道哪一页的等级是报告写的。
       */
      const prompt = buildSystemPrompt('ALLERGY_REPORT');
      expect(prompt).toContain('hasVerdict');
      expect(prompt).toContain('没有判定区时，所有 level 一律填 UNKNOWN');
    });

    it('报告层面回传 hasVerdict（模型说是才有），前端据此定权威等级', async () => {
      ocrProvider.recognizeImage.mockResolvedValue({ text: '过敏原检测报告…' });
      setFetchResponse({
        drafts: [{ allergen: '小麦', level: 'WEAK_POSITIVE', group: 'FOOD' }],
        hasVerdict: true,
        testMethod: 'SERUM',
        testDate: '2025-10-20',
        warnings: [],
      });

      const withVerdict = await service.extractFromReport({
        imageUrl: 'https://cdn/x.jpg',
      });
      expect(withVerdict.reportMeta).toMatchObject({
        hasVerdict: true,
        testDate: '2025-10-20',
      });

      // 模型没说（或说了个别的值）→ 一律当"没有判定区"，不猜
      setFetchResponse({
        drafts: [{ allergen: '小麦', level: 'POSITIVE', group: 'FOOD' }],
        hasVerdict: 'yes',
        warnings: [],
      });
      const withoutVerdict = await service.extractFromReport({
        imageUrl: 'https://cdn/x.jpg',
      });
      expect(withoutVerdict.reportMeta.hasVerdict).toBe(false);
    });

    it('等级 / 分组 / 说明一起回给前端（前端靠它决定怎么记）', () => {
      const drafts = normalizeDrafts('ALLERGY_REPORT', {
        drafts: [
          { allergen: '鸡肉', level: 'POSITIVE', group: 'FOOD' },
          { allergen: '小麦', level: '强阳性', group: 'FOOD' },
          { allergen: '粉尘螨', level: 'POSITIVE', group: 'ENVIRONMENT' },
          { allergen: '玉米', level: '', group: '' },
        ],
      });

      const byName = Object.fromEntries(
        drafts.map((draft) => [draft.allergen, draft]),
      );
      expect(drafts).toHaveLength(4);
      expect(byName['鸡肉']).toMatchObject({ level: 'POSITIVE', group: 'FOOD' });
      // 模型直接回中文"强阳性"也要认（不能因为没照抄枚举就丢等级）
      expect(byName['小麦'].level).toBe('STRONG_POSITIVE');
      expect(byName['粉尘螨']).toMatchObject({ group: 'ENVIRONMENT' });
      // 报告没写分组 → 按名字认不出环境项的，留给家长自己看（不藏）
      expect(byName['玉米']).toMatchObject({ group: 'UNKNOWN' });
    });

    it('报告上的中文/符号写法都认（认不出来才是 UNKNOWN）', () => {
      const levels = normalizeDrafts('ALLERGY_REPORT', {
        drafts: [
          { allergen: '花生', level: '强阳性' },
          { allergen: '海带', level: '+++' },
          { allergen: '鸡蛋', level: '阳性' },
          { allergen: '小麦', level: '弱阳性' },
          { allergen: '大米', level: '±' },
          { allergen: '牛肉', level: '可疑' },
          { allergen: '牛奶', level: '阴性' },
          { allergen: '鸭肉', level: '不知道' },
        ],
      }).map((draft) => `${draft.allergen}:${draft.level}`);

      expect(levels).toEqual([
        '花生:STRONG_POSITIVE',
        '海带:STRONG_POSITIVE',
        '鸡蛋:POSITIVE',
        '小麦:WEAK_POSITIVE',
        '大米:WEAK_POSITIVE',
        '牛肉:SUSPECTED',
        '牛奶:NEGATIVE',
        '鸭肉:UNKNOWN',
      ]);
    });

    it('截断时先砍"没写结论"的：报告标了阳性/强阳性的必须留住', () => {
      /**
       * 老板实测（2026-10-05）：一份两页报告 50 多项，老代码 `slice(0, 30)`
       * 从尾巴上砍掉 20 多项，而被砍掉的正好是模型最后输出的、
       * 报告标了「阳性 / 强阳性」的花生与海带 —— 最不能丢的偏偏先丢。
       */
      const drafts = normalizeDrafts('ALLERGY_REPORT', {
        drafts: [
          ...Array.from({ length: 60 }, (_, index) => ({
            allergen: `没写结论${index}`,
            level: '',
            group: 'FOOD',
          })),
          { allergen: '花生', level: '强阳性', group: 'FOOD' },
          { allergen: '海带', level: '阳性', group: 'FOOD' },
        ],
      });

      expect(drafts).toHaveLength(62);
      expect(drafts.slice(0, 2).map((draft) => draft.allergen)).toEqual([
        '花生',
        '海带',
      ]);
    });

    it('条数上限放宽到 120（真实报告 50~100 项都放得下）', () => {
      const drafts = normalizeDrafts('ALLERGY_REPORT', {
        drafts: Array.from({ length: 130 }, (_, index) => ({
          allergen: `项目${index}`,
          level: 'WEAK_POSITIVE',
          group: 'FOOD',
        })),
      });

      expect(drafts).toHaveLength(120);
    });

    it('报告没写分组时按名字认出环境项（也认中文分组别名）', () => {
      const drafts = normalizeDrafts('ALLERGY_REPORT', {
        drafts: [
          { allergen: '粉尘螨' },
          { allergen: '柳树花粉' },
          { allergen: '猫皮屑' },
          { allergen: '羊肉' },
          { allergen: '棉絮', group: '吸入组' },
        ],
      });

      expect(drafts.map((draft) => draft.group)).toEqual([
        'ENVIRONMENT',
        'ENVIRONMENT',
        'ENVIRONMENT',
        'UNKNOWN',
        'ENVIRONMENT',
      ]);
    });

    it('报告自己写的 FOOD 优先：名字像环境项也不能替顾客丢掉', () => {
      expect(normalizeAllergyGroup('FOOD', '粉尘螨')).toBe('FOOD');
      expect(normalizeAllergyGroup('food', '鸡肉')).toBe('FOOD');
      expect(normalizeAllergyGroup('', '粉尘螨')).toBe('ENVIRONMENT');
    });

    it('对照组（组胺 / 阳性对照）不是过敏原，一律丢掉', () => {
      const drafts = normalizeDrafts('ALLERGY_REPORT', {
        drafts: [
          { allergen: '组胺（阳性对照）', level: 'POSITIVE' },
          { allergen: '阴性对照', level: 'NEGATIVE' },
          { allergen: '鸡肉', level: 'POSITIVE' },
        ],
      });

      expect(drafts.map((draft) => draft.allergen)).toEqual(['鸡肉']);
    });

    it('模型走旧的 allergies 数组时，对照组同样被丢掉', () => {
      const drafts = normalizeDrafts('ALLERGY_REPORT', {
        allergies: ['组胺（阳性对照）', '牛肉'],
      });

      expect(drafts.map((draft) => draft.allergen)).toEqual(['牛肉']);
    });
  });

  it('AI 什么都没给出时明确提示改用手工填写，而不是返回静默的空结果', async () => {
    ocrProvider.recognizeImage.mockResolvedValue({ text: '一张普通的照片' });
    setFetchResponse({});

    const result = await service.extractFromReport({
      imageUrl: 'https://cdn/x.jpg',
    });

    expect(result.allergies).toEqual([]);
    expect(result.warnings.join('')).toContain('手工补充');
  });

  it('异常字段类型不会导致崩溃（容错为默认值）', async () => {
    ocrProvider.recognizeImage.mockResolvedValue({ text: '报告' });
    setFetchResponse({
      allergies: '鸡肉',
      medicalConditions: null,
      confidence: 'SUPER_HIGH',
      warnings: '注意',
    });

    const result = await service.extractFromReport({
      imageUrl: 'https://cdn/x.jpg',
    });

    expect(result.allergies).toEqual([]);
    expect(result.medicalConditions).toEqual([]);
    // 模型多返回一个乱七八糟的 confidence 也不该影响我们（现在直接不认这个字段）
    expect((result as unknown as Record<string, unknown>).confidence).toBeUndefined();
    // 字段类型不对 → 归一化为空 → 触发"请手工补充"兜底提示（而不是静默返回空结果）
    expect(result.warnings.join('')).toContain('手工补充');
  });

  it('AI 未启用/未配置时抛错，交由前端降级（不阻断建档）', async () => {
    ocrProvider.recognizeImage.mockResolvedValue({ text: '报告' });
    agentConfig.getEnabledDeepSeekRuntimeConfig.mockRejectedValue(
      new BadRequestException('DeepSeek Agent 设置未启用'),
    );

    await expect(
      service.extractFromReport({ imageUrl: 'https://cdn/x.jpg' }),
    ).rejects.toThrow('DeepSeek Agent 设置未启用');
  });

  it('提示词明确禁止诊断（不得判断疾病名称/严重程度/过敏类型）', async () => {
    ocrProvider.recognizeImage.mockResolvedValue({ text: '报告' });
    let capturedBody = '';
    global.fetch = jest.fn().mockImplementation(async (_url, init) => {
      capturedBody = String(init?.body || '');
      return okJsonResponse({ allergies: [], medicalConditions: [] });
    }) as unknown as typeof fetch;

    await service.extractFromReport({ imageUrl: 'https://cdn/x.jpg' });

    expect(capturedBody).toContain('不得判断疾病名称、严重程度');
    // 只做照抄，不做推断
    expect(capturedBody).toContain('不得推断');
  });

  /**
   * 自动判断（2026-10-01）：两个拍照入口合并成一个「从相册选择」。
   * 顾客不再先选类型，改由 AI 判断；后端必须按**判断出的类型**归一化 drafts，
   * 并把真实类型回给前端 —— 前端靠它决定这条记录填进「病历」还是「体检」。
   */
  describe('就诊字段口径（2026-10-02 老板定稿）', () => {
    it('病历白名单接住医嘱/检查/体征三栏，不再把检查清单塞进医嘱', () => {
      const drafts = normalizeDrafts('MEDICAL_RECORD', {
        drafts: [
          {
          visitDate: '2026-02-11',
          chiefComplaint: '在家不够活泼，有点呕吐',
          diagnosis: '胆汁淤积',
          treatment: '回家后注意：注意心情调节，清淡饮食，按时吃药，定期复查',
          exams: '全腹部彩超、血常规、斯玛特16项生化、CRP C反应蛋白、DR×2',
          vitals: '体温 38.4℃、体重 6.70kg、BCS 3',
          medications: ['乐妥 1片/次 每日2次 共3天', '肝必康胶囊 1粒/次 每日1次'],
            labValues: '生化\nALT 144 U/L（偏高）',
          },
        ],
      });

      expect(drafts[0].treatment).toContain('回家后注意');
      expect(drafts[0].exams).toContain('全腹部彩超');
      expect(drafts[0].vitals).toContain('体温 38.4');
      expect(drafts[0].medications).toHaveLength(2);
    });

    it('只有检查清单/体征的病历页也算有内容（不再整页丢掉）', () => {
      expect(
        normalizeDrafts('MEDICAL_RECORD', { drafts: [{ exams: '腹部彩超' }] }),
      ).toHaveLength(1);
      expect(
        normalizeDrafts('MEDICAL_RECORD', { drafts: [{ vitals: '体温 39.1℃' }] }),
      ).toHaveLength(1);
    });

    it('提示词写死了三个字段各放什么，并要求连报告自己的高低标记一起抄', () => {
      const prompt = buildSystemPrompt('MEDICAL_RECORD');
      expect(prompt).toContain('treatment 写**医嘱/回家注意**');
      expect(prompt).toContain('exams 写**这次做的检查项目**');
      expect(prompt).toContain('vitals 写**体征**');
      expect(prompt).toContain('报告自己标了异常');
      // 药名 + 用法用量（老板批准的改动）
      expect(prompt).toContain('照抄药名 + 处方上写的用法用量');
    });

    it('体检报告的提示词同样要求照抄报告自己的偏高/偏低标记', () => {
      const prompt = buildSystemPrompt('CHECKUP_REPORT');
      expect(prompt).toContain('报告自己标了异常');
      expect(prompt).toContain('不要自己判断');
    });
  })

  describe('warnings 不许和已提取的内容打架（2026-10-02 老板实测）', () => {
    it('抄到了化验数值，就不再显示"化验结果值未在图中显示"', () => {
      const filtered = filterContradictoryWarnings(
        ['化验结果值未在图中显示', '第三行日期被印章遮挡'],
        { labValues: '生化\nALT 144 U/L' },
      );

      expect(filtered).toEqual(['第三行日期被印章遮挡']);
    });

    it('读到了动物名，就不再显示"动物名字未在图中显示"', () => {
      expect(
        filterContradictoryWarnings(['动物名字未在图中显示'], {
          patientName: 'seven',
        }),
      ).toEqual([]);
    });

    it('字段真的是空的时，提示照旧保留（不能把有用的提示也吞掉）', () => {
      const warnings = ['化验结果值未在图中显示'];
      expect(filterContradictoryWarnings(warnings, { labValues: '' })).toEqual(
        warnings,
      );
    });
  })

  describe('AUTO：由系统判断文档类型', () => {
    const autoRequest = () =>
      service.extractFromReport({
        imageUrl: 'https://cdn/x.jpg',
        documentType: 'AUTO',
      });

    it('AUTO 写法容错：大小写不敏感、允许前后空格、缺失仍按旧默认', () => {
      expect(normalizeDocumentType('AUTO')).toBe('AUTO');
      expect(normalizeDocumentType('  auto  ')).toBe('AUTO');
      // 白名单外的值 / 不传 → 沿用线上旧行为（过敏报告）
      expect(normalizeDocumentType('UNKNOWN')).toBe('ALLERGY_REPORT');
      expect(normalizeDocumentType(undefined)).toBe('ALLERGY_REPORT');
      // 显式类型不受影响
      expect(normalizeDocumentType(' checkup_report ')).toBe('CHECKUP_REPORT');
    });

    it('响应里的 documentType 认不出来（或缺失）时兜底为病历，且不抛错', () => {
      expect(resolveAutoDocumentType('UNKNOWN')).toBe('MEDICAL_RECORD');
      expect(resolveAutoDocumentType(undefined)).toBe('MEDICAL_RECORD');
      expect(resolveAutoDocumentType('')).toBe('MEDICAL_RECORD');
      expect(resolveAutoDocumentType('体检报告')).toBe('MEDICAL_RECORD');
      // 合法值大小写不敏感
      expect(resolveAutoDocumentType('vaccine_book')).toBe('VACCINE_BOOK');
    });

    it('模型回 CHECKUP_REPORT → drafts 走体检字段，返回真实类型', async () => {
      ocrProvider.recognizeImage.mockResolvedValue({ text: '体检报告…' });
      setFetchResponse({
        documentType: 'CHECKUP_REPORT',
        drafts: [
          {
            checkupDate: '2026-08-30',
            checkupType: 'ROUTINE',
            findings: '血常规与生化未见明显异常',
            recommendations: '半年后复查',
            // 模型串字段时不得混进体检草稿
            allergen: '鸡肉',
          },
        ],
        confidence: 'HIGH',
        warnings: [],
      });

      const result = await autoRequest();

      expect(result.documentType).toBe('CHECKUP_REPORT');
      expect(result.drafts).toHaveLength(1);
      expect(result.drafts[0].findings).toBe('血常规与生化未见明显异常');
      expect(result.drafts[0].checkupDate).toBe('2026-08-30');
      expect(result.drafts[0]).not.toHaveProperty('allergen');
      expect(result.drafts[0]).not.toHaveProperty('chiefComplaint');
      expect(result.allergies).toEqual([]);
    });

    it('模型回 MEDICAL_RECORD → drafts 走病历字段', async () => {
      ocrProvider.recognizeImage.mockResolvedValue({ text: '病历…' });
      setFetchResponse({
        documentType: 'MEDICAL_RECORD',
        drafts: [
          {
            visitDate: '2026-09-12',
            chiefComplaint: '呕吐两次',
            diagnosis: '急性胃炎',
            treatment: '禁食 12 小时后少量多餐',
            medications: ['速诺'],
            allergen: '鸡肉',
          },
        ],
        confidence: 'MEDIUM',
        warnings: [],
      });

      const result = await autoRequest();

      expect(result.documentType).toBe('MEDICAL_RECORD');
      expect(result.drafts[0].chiefComplaint).toBe('呕吐两次');
      expect(result.drafts[0].diagnosis).toBe('急性胃炎');
      expect(result.drafts[0].medications).toEqual(['速诺']);
      expect(result.drafts[0]).not.toHaveProperty('allergen');
    });

    it('模型回 NOT_MEDICAL（传了张身份证）→ 不给草稿，只说清"这不是宠物医疗资料"', async () => {
      ocrProvider.recognizeImage.mockResolvedValue({ text: '公民身份号码 …' });
      setFetchResponse({
        documentType: 'NOT_MEDICAL',
        drafts: [],
        confidence: 'LOW',
        warnings: [],
      });

      const result = await autoRequest();

      expect(result.documentType).toBe('NOT_MEDICAL');
      expect(result.drafts).toEqual([]);
      // 关键是这句话要准：不能说"照片不清楚"，照片清楚得很，只是不是这类资料
      expect(result.warnings[0]).toContain('不是宠物的病历或检查报告');
      expect(result.warnings[0]).not.toContain('未识别到可用内容');
    });

    it('模型回白名单外的值 → 按病历归一化并兜底病历，不抛错', async () => {
      ocrProvider.recognizeImage.mockResolvedValue({ text: '一份看不清的报告' });
      setFetchResponse({
        documentType: 'UNKNOWN',
        drafts: [{ visitDate: '2026-09-12', chiefComplaint: '皮肤瘙痒', allergen: '鸡肉' }],
        confidence: 'LOW',
        warnings: [],
      });

      const result = await autoRequest();

      expect(result.documentType).toBe('MEDICAL_RECORD');
      expect(result.drafts[0].chiefComplaint).toBe('皮肤瘙痒');
      // 归一到病历字段，过敏原字段被丢弃（不是过敏报告）
      expect(result.drafts[0]).not.toHaveProperty('allergen');
    });

    it('模型完全没回 documentType（或没回可用内容）→ 兜底病历并走"未识别到可用内容"那句', async () => {
      ocrProvider.recognizeImage.mockResolvedValue({ text: '一张普通照片' });
      setFetchResponse({});

      const result = await autoRequest();

      expect(result.documentType).toBe('MEDICAL_RECORD');
      expect(result.drafts).toEqual([]);
      expect(result.warnings.join('')).toContain('未识别到可用内容');
      expect(result.warnings.join('')).not.toContain('手工补充');
    });

    it('AUTO 判断为过敏报告时，allergies 仍从 drafts 的 allergen 取（去空白，行为与线上一致）', async () => {
      ocrProvider.recognizeImage.mockResolvedValue({ text: '过敏原检测报告…' });
      setFetchResponse({
        documentType: 'ALLERGY_REPORT',
        drafts: [{ allergen: ' 鸡肉 ', notes: '' }, { allergen: '牛肉', notes: '' }],
        confidence: 'HIGH',
        warnings: [],
      });

      const result = await autoRequest();

      expect(result.documentType).toBe('ALLERGY_REPORT');
      expect(result.allergies).toEqual(['鸡肉', '牛肉']);
    });

    it('请求体里带的是 AUTO，提示词与响应解析各司其职', async () => {
      ocrProvider.recognizeImage.mockResolvedValue({ text: '疫苗本…' });
      /*
       * ⚠️ 只捕获**第一次**请求体（2026-10-09）：
       * 疫苗本现在会多一次"再看一眼图"的复核调用，最后一次请求已经变成复核，
       * 这条测试要守的是**识别那一次**的请求体（里面该带 AUTO）。
       */
      let capturedBody = '';
      let callIndex = 0;
      global.fetch = jest.fn().mockImplementation(async (_url, init) => {
        callIndex += 1;
        if (callIndex === 1) {
          capturedBody = String(init?.body || '');
        }
        return okJsonResponse({
          documentType: 'VACCINE_BOOK',
          drafts: [
            { vaccineName: '犬四联', vaccinationDate: '2025-03-10', nextDueDate: '2026-03-10' },
            { vaccineName: '狂犬', vaccinationDate: '2025-04-01', nextDueDate: '' },
          ],
          confidence: 'HIGH',
          warnings: [],
        });
      }) as unknown as typeof fetch;

      const result = await autoRequest();

      expect(capturedBody).toContain('AUTO');
      expect(result.documentType).toBe('VACCINE_BOOK');
      expect(result.drafts).toHaveLength(2);
      expect(result.drafts[0].vaccineName).toBe('犬四联');
    });

    it('AUTO 提示词包含"自动判断"的说明与四个类型，且沿用既有铁律', () => {
      const prompt = buildSystemPrompt('AUTO');

      expect(prompt).toContain('自动判断');
      expect(prompt).toContain('MEDICAL_RECORD');
      expect(prompt).toContain('CHECKUP_REPORT');
      expect(prompt).toContain('VACCINE_BOOK');
      expect(prompt).toContain('ALLERGY_REPORT');
      expect(prompt).toContain('documentType');
      // 判断不了时的兜底
      expect(prompt).toContain('判断不了');
      // 四类文档的字段结构都要在（否则自动判断出来的字段名会和显式指定时不一致）
      expect(prompt).toContain('chiefComplaint');
      expect(prompt).toContain('diagnosis');
      expect(prompt).toContain('findings');
      expect(prompt).toContain('vaccineName');
      expect(prompt).toContain('allergen');
      // 共用铁律一段不得被改写
      expect(prompt).toContain('不得判断疾病名称、严重程度、过敏类型');
      expect(prompt).toContain('不得推断');
    });

    it('AUTO 里嵌的字段结构就是各显式类型那一套（防止两边日后走样）', () => {
      const auto = buildSystemPrompt('AUTO');

      for (const type of [
        'MEDICAL_RECORD',
        'CHECKUP_REPORT',
        'VACCINE_BOOK',
        'ALLERGY_REPORT',
      ] as const) {
        const explicit = buildSystemPrompt(type);
        // 显式提示词里「额外规则 + 输出 JSON 结构」整段必须原样出现在 AUTO 提示词里
        const fieldSpec = explicit.slice(explicit.indexOf('本类型的额外规则：'));
        expect(auto).toContain(fieldSpec);
      }
    });

    it('只看文档类型、不看 AUTO 时四种提示词各自独立（新增段落不串台）', () => {
      expect(buildSystemPrompt('CHECKUP_REPORT')).toContain('findings');
      expect(buildSystemPrompt('CHECKUP_REPORT')).not.toContain('chiefComplaint');
      expect(buildSystemPrompt('MEDICAL_RECORD')).toContain('chiefComplaint');
      expect(buildSystemPrompt('MEDICAL_RECORD')).not.toContain('findings');
    });
  });

  /** 回归：显式类型与"不传"两条老路必须与 AUTO 上线前完全一致 */
  describe('回归：显式类型与缺省行为不变', () => {
    it('显式传 CHECKUP_REPORT 仍照旧（不受 AUTO 影响）', async () => {
      ocrProvider.recognizeImage.mockResolvedValue({ text: '体检报告…' });
      setFetchResponse({
        // 模型多回一个 documentType 也不该改变显式指定的类型
        documentType: 'MEDICAL_RECORD',
        drafts: [
          {
            checkupDate: '2026-08-30',
            checkupType: 'ROUTINE',
            findings: '血常规未见明显异常',
            recommendations: '',
          },
        ],
        confidence: 'HIGH',
        warnings: [],
      });

      const result = await service.extractFromReport({
        imageUrl: 'https://cdn/x.jpg',
        documentType: 'CHECKUP_REPORT',
      });

      expect(result.documentType).toBe('CHECKUP_REPORT');
      expect(result.drafts).toHaveLength(1);
      expect(result.drafts[0].findings).toBe('血常规未见明显异常');
      expect(result.drafts[0]).not.toHaveProperty('allergen');
    });

    it('不传 documentType 仍默认过敏报告', async () => {
      ocrProvider.recognizeImage.mockResolvedValue({ text: '过敏原检测报告…' });
      setFetchResponse({
        // 旧形状：只有 allergies，没有 drafts
        allergies: ['鸡肉'],
        medicalConditions: [],
        confidence: 'HIGH',
        warnings: [],
      });

      const result = await service.extractFromReport({
        imageUrl: 'https://cdn/x.jpg',
      });

      expect(result.documentType).toBe('ALLERGY_REPORT');
      expect(result.allergies).toEqual(['鸡肉']);
    });

    it('不传 documentType 且模型没回内容时，仍用顾客熟悉的那句提示', async () => {
      ocrProvider.recognizeImage.mockResolvedValue({ text: '一张普通照片' });
      setFetchResponse({});

      const result = await service.extractFromReport({
        imageUrl: 'https://cdn/x.jpg',
      });

      expect(result.documentType).toBe('ALLERGY_REPORT');
      expect(result.warnings.join('')).toContain('手工补充');
    });
  });
});

/**
 * 视觉模型直接看图（2026-10-01）。
 *
 * 背景：老板实测上传照片报「服务未开通」——腾讯云 OCR 没开通，整条路废掉。
 * 改成优先让多模态模型直接看图（正式名 deepseek-flash = DeepSeek-V4.1-Flash，支持读图、
 * 单张图最多 384 token），OCR 退为兜底。这组用例锁住：
 *   · 默认走视觉：模型收到的是「文本 + 图片」两段，**不再调用 OCR**；
 *   · 视觉失败自动回退 OCR，顾客不会卡住；
 *   · HEALTH_REPORT_VISION=off 时回到原路（既有用例即为此）；
 *   · 看图版提示词明确让模型"自己看图"，且字段结构仍与文本版共用同一份常量。
 */
describe('HealthReportExtractionService · 视觉直读', () => {
  let service: HealthReportExtractionService;
  let ocrProvider: { recognizeImage: jest.Mock };
  let agentConfig: {
    getEnabledDeepSeekRuntimeConfig: jest.Mock;
    getConfiguredPurposeModel: jest.Mock;
  };

  beforeEach(async () => {
    delete process.env.HEALTH_REPORT_VISION;
    delete process.env.HEALTH_REPORT_VISION_MODEL;
    ocrProvider = { recognizeImage: jest.fn() };
    agentConfig = {
      getEnabledDeepSeekRuntimeConfig: jest.fn().mockResolvedValue({
        provider: 'deepseek',
        baseUrl: 'https://api.deepseek.com',
        model: 'deepseek-v4-pro',
        reviewModel: 'deepseek-v4-pro',
        apiKey: 'test-key',
        maxConcurrency: 1,
        requestTimeoutMs: 5000,
        retryCount: 0,
      }),
      // 没有单独配「健康 · 报告识别」时返回 null → 用内置默认的视觉模型
      getConfiguredPurposeModel: jest.fn().mockResolvedValue(null),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthReportExtractionService,
        { provide: HEALTH_REPORT_OCR_PROVIDER, useValue: ocrProvider },
        { provide: AgentProviderConfigService, useValue: agentConfig },
      ],
    }).compile();
    service = module.get(HealthReportExtractionService);
    jest.restoreAllMocks();
  });

  const mockFetchOk = (payload: Record<string, unknown>) => {
    const spy = jest.fn().mockResolvedValue(okJsonResponse(payload));
    global.fetch = spy as unknown as typeof fetch;
    return spy;
  };

  const requestBodyOf = (spy: jest.Mock) =>
    JSON.parse(String(spy.mock.calls[0]?.[1]?.body || '{}'));

  it('默认走视觉：模型收到文本 + 图片，且不调用 OCR', async () => {
    const fetchSpy = mockFetchOk({
      drafts: [{ checkupDate: '2026-08-30', findings: '血常规未见异常' }],
      confidence: 'HIGH',
      warnings: [],
    });

    const result = await service.extractFromReport({
      imageUrl: 'https://img.example.com/a.jpg',
      documentType: 'CHECKUP_REPORT',
    });

    expect(ocrProvider.recognizeImage).not.toHaveBeenCalled();
    const body = requestBodyOf(fetchSpy);
    expect(body.model).toBe('deepseek-flash');
    expect(body.messages[0].content).toContain('自己看图');
    const userContent = body.messages[1].content;
    expect(Array.isArray(userContent)).toBe(true);
    expect(userContent[0].type).toBe('text');
    expect(userContent[1]).toMatchObject({
      type: 'image_url',
      image_url: { url: 'https://img.example.com/a.jpg' },
    });
    expect(result.drafts[0].findings).toBe('血常规未见异常');
  });

  it('AUTO + 视觉：类型判断照旧由模型给出', async () => {
    mockFetchOk({
      documentType: 'MEDICAL_RECORD',
      drafts: [{ diagnosis: '急性胃炎' }],
      confidence: 'MEDIUM',
      warnings: [],
    });

    const result = await service.extractFromReport({
      imageUrl: 'https://img.example.com/b.jpg',
      documentType: 'AUTO',
    });

    expect(ocrProvider.recognizeImage).not.toHaveBeenCalled();
    expect(result.documentType).toBe('MEDICAL_RECORD');
    expect(result.drafts[0].diagnosis).toBe('急性胃炎');
  });

  it('视觉失败自动回退 OCR，不让顾客卡住', async () => {
    let call = 0;
    global.fetch = jest.fn().mockImplementation(async () => {
      call += 1;
      if (call === 1) {
        // 第一次（视觉）失败
        return { ok: false, status: 500, json: async () => ({ error: 'vision down' }) };
      }
      return okJsonResponse({
        drafts: [{ diagnosis: '急性胃炎' }],
        confidence: 'HIGH',
        warnings: [],
      });
    }) as unknown as typeof fetch;

    ocrProvider.recognizeImage.mockResolvedValue({ text: '诊断：急性胃炎' });

    const result = await service.extractFromReport({
      imageUrl: 'https://img.example.com/c.jpg',
      documentType: 'MEDICAL_RECORD',
    });

    expect(ocrProvider.recognizeImage).toHaveBeenCalled();
    expect(result.drafts[0].diagnosis).toBe('急性胃炎');
  });

  it('HEALTH_REPORT_VISION=off 时回到 OCR 路径', async () => {
    process.env.HEALTH_REPORT_VISION = 'off';
    mockFetchOk({ drafts: [{ diagnosis: 'x' }], confidence: 'HIGH', warnings: [] });
    ocrProvider.recognizeImage.mockResolvedValue({ text: '诊断：x' });

    await service.extractFromReport({
      imageUrl: 'https://img.example.com/d.jpg',
      documentType: 'MEDICAL_RECORD',
    });

    expect(ocrProvider.recognizeImage).toHaveBeenCalled();
    delete process.env.HEALTH_REPORT_VISION;
  });

  describe('开关与模型名', () => {
    it('默认开启，只有显式 off 才关', () => {
      expect(isHealthReportVisionEnabled({} as NodeJS.ProcessEnv)).toBe(true);
      expect(
        isHealthReportVisionEnabled({ HEALTH_REPORT_VISION: 'off' } as NodeJS.ProcessEnv),
      ).toBe(false);
      expect(
        isHealthReportVisionEnabled({ HEALTH_REPORT_VISION: 'ON' } as NodeJS.ProcessEnv),
      ).toBe(true);
    });

    it('模型名的三级来源：环境变量 > 后台配置 > 内置默认', () => {
      // 都没给 → 内置默认（已用生产密钥实测可读中文报告）
      expect(resolveHealthReportVisionModel({} as NodeJS.ProcessEnv)).toBe('deepseek-flash');
      // 后台「健康 · 报告识别」那条配置里填的模型
      expect(
        resolveHealthReportVisionModel({} as NodeJS.ProcessEnv, 'glm-4v-flash'),
      ).toBe('glm-4v-flash');
      // 环境变量优先级最高（临时救火用）
      expect(
        resolveHealthReportVisionModel(
          { HEALTH_REPORT_VISION_MODEL: 'some-other-vl' } as NodeJS.ProcessEnv,
          'glm-4v-flash',
        ),
      ).toBe('some-other-vl');
    });

    it('后台给「健康 · 报告识别」单独配了模型，识别就用那个模型', async () => {
      // 只有**确实单独配过**（有自己那一行）才生效；
      // 没配时不能被全局默认的纯文本模型顶掉 —— 那会让识别直接失败
      agentConfig.getConfiguredPurposeModel.mockResolvedValue('glm-4v-flash');
      const fetchSpy = mockFetchOk({
        drafts: [{ diagnosis: 'x' }],
        confidence: 'HIGH',
        warnings: [],
      });

      await service.extractFromReport({
        imageUrl: 'https://img.example.com/e.jpg',
        documentType: 'MEDICAL_RECORD',
      });

      expect(requestBodyOf(fetchSpy).model).toBe('glm-4v-flash');
    });
  });

  it('后台模型名写错时，用内置默认再试一次（不让一个错字废掉识别）', async () => {
    // 后台填了不存在的名字（老板实测过：deepseek-v41-flash）
    agentConfig.getConfiguredPurposeModel.mockResolvedValue('deepseek-v41-flash');

    const calls: string[] = [];
    global.fetch = jest.fn().mockImplementation(async (_url: string, init: any) => {
      const body = JSON.parse(String(init?.body || '{}'));
      calls.push(body.model);
      if (body.model === 'deepseek-v41-flash') {
        return {
          ok: false,
          status: 400,
          json: async () => ({ error: { message: 'model not supported' } }),
        };
      }
      return okJsonResponse({
        drafts: [{ diagnosis: '急性胃炎' }],
        confidence: 'HIGH',
        warnings: [],
      });
    }) as unknown as typeof fetch;

    const result = await service.extractFromReport({
      imageUrl: 'https://img.example.com/f.jpg',
      documentType: 'MEDICAL_RECORD',
    });

    // 先试后台填的（失败），再用内置默认（成功），OCR 不该被调用
    expect(calls).toEqual(['deepseek-v41-flash', 'deepseek-flash']);
    expect(ocrProvider.recognizeImage).not.toHaveBeenCalled();
    expect(result.drafts[0].diagnosis).toBe('急性胃炎');
  });

  it('后台填的就是内置默认时，只调一次（不做无谓重试）', async () => {
    agentConfig.getConfiguredPurposeModel.mockResolvedValue('deepseek-flash');
    const fetchSpy = mockFetchOk({
      drafts: [{ diagnosis: 'x' }],
      confidence: 'HIGH',
      warnings: [],
    });

    await service.extractFromReport({
      imageUrl: 'https://img.example.com/g.jpg',
      documentType: 'MEDICAL_RECORD',
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('结构化抽取一律关掉思考模式（开着会拖慢并可能把 token 配额耗光）', async () => {
    // 实测：deepseek-flash 默认开思考（effort=high）时，
    // 9.9s、输出 2000 tokens 全在思维链上、最终 content 为空 → 识别失败；
    // 关掉后 2.8s、190 tokens 正常返回。
    const bodies: any[] = [];
    global.fetch = jest.fn().mockImplementation(async (_url: string, init: any) => {
      bodies.push(JSON.parse(String(init?.body || '{}')));
      return okJsonResponse({
        drafts: [{ diagnosis: 'x' }],
        confidence: 'HIGH',
        warnings: [],
      });
    }) as unknown as typeof fetch;

    await service.extractFromReport({
      imageUrl: 'https://img.example.com/h.jpg',
      documentType: 'MEDICAL_RECORD',
    });

    expect(bodies[0].thinking).toEqual({ type: 'disabled' });
  });

  it('看图版提示词让模型自己看图，字段结构与文本版一致', () => {
    const imagePrompt = buildSystemPrompt('CHECKUP_REPORT', 'image');
    const ocrPrompt = buildSystemPrompt('CHECKUP_REPORT', 'ocr');

    expect(imagePrompt).toContain('自己看图');
    // 铁律与字段结构两版共用，逐字一致
    expect(imagePrompt).toContain('严格规则（任何情况都不得违反）');
    expect(imagePrompt).toContain('findings');
    expect(imagePrompt).toContain('checkupType');
    expect(ocrPrompt).toContain('识别文字');
    // 四类都有看图版开场白
    for (const type of ['MEDICAL_RECORD', 'CHECKUP_REPORT', 'VACCINE_BOOK', 'ALLERGY_REPORT'] as const) {
      expect(buildSystemPrompt(type, 'image')).toContain('自己看图');
    }
  });
});

/**
 * 不是宠物医疗资料时要说人话（2026-10-02 老板提的）。
 *
 * 老板传了一张身份证做试验，结果只回一句"未识别到内容" ——
 * 照片其实很清楚，问题在于它根本不是宠物的医疗资料。
 * 现在 AUTO 多一类 NOT_MEDICAL：模型拿不准就填它，别硬塞成病历。
 */
describe('识别 · 不是宠物医疗资料', () => {
  it('AUTO 判定 NOT_MEDICAL 时：不给草稿，只给一句准确的话', () => {
    expect(resolveAutoDocumentType('NOT_MEDICAL')).toBe('NOT_MEDICAL')
    expect(resolveAutoDocumentType('not_medical')).toBe('NOT_MEDICAL')
  })

  it('AUTO 提示词里写着"拿不准就别硬猜，填 NOT_MEDICAL"', () => {
    const prompt = buildSystemPrompt('AUTO', 'image')

    expect(prompt).toContain('NOT_MEDICAL')
    expect(prompt).toContain('拿不准就别硬猜')
    expect(prompt).toContain('身份证')
  })

  it('各入口的提示文案都要说清"这不是什么"', () => {
    expect(buildNotMedicalWarning('AUTO')).toContain('不是宠物的病历或检查报告')
    expect(buildNotMedicalWarning('VACCINE_BOOK')).toContain('不是疫苗本')
    expect(buildNotMedicalWarning('ALLERGY_REPORT')).toContain('不是过敏原检测报告')
  })

  it('认不出来的取值仍然兜底病历（老行为不变）', () => {
    expect(resolveAutoDocumentType('')).toBe('MEDICAL_RECORD')
    expect(resolveAutoDocumentType(undefined)).toBe('MEDICAL_RECORD')
    expect(resolveAutoDocumentType('身份证')).toBe('MEDICAL_RECORD')
  })
})

/**
 * 影像片（X 光/超声）：属于宠物医疗资料，但**没有文字可抄**（2026-10-02 老板实测）。
 *
 * 原来的判定是"不属于四类 → 硬塞成病历"，加了 NOT_MEDICAL 之后又变成
 * "这张看起来不是宠物的病历或检查报告…换一张" —— 对着一张 X 光片说这话很荒唐，
 * 而且家长的真实诉求是"把片子存进档案"。现在单列 IMAGING：
 * 照抄检查日期，不解读片子内容，原件由前端存成附件。
 */
describe('识别 · 影像片', () => {
  it('模型回 IMAGING 时认它（不再算成"不是宠物医疗资料"）', () => {
    expect(resolveAutoDocumentType('IMAGING')).toBe('IMAGING');
    expect(resolveAutoDocumentType('imaging')).toBe('IMAGING');
  })

  it('提示词把影像片单列一类，并明确"不要解读、不要写诊断"', () => {
    const prompt = buildSystemPrompt('AUTO', 'image');

    expect(prompt).toContain('IMAGING');
    expect(prompt).toContain('X 光片');
    expect(prompt).toContain('不要解读影像内容、不要写诊断');
    // 不能把片子归到"不是宠物医疗资料"那一类
    expect(prompt).toContain('这类**属于**宠物医疗资料（不要判成 NOT_MEDICAL）');
  });

  it('影像片照抄日期、给一句"不解读"的说明，草稿里没有诊断', () => {
    const drafts = normalizeDrafts('CHECKUP_REPORT', {
      drafts: [{ checkupDate: '2026-02-12', notes: '骨盆正位', patientName: '面包' }],
    });

    expect(drafts).toHaveLength(1);
    expect(drafts[0].checkupDate).toBe('2026-02-12');
    expect(drafts[0].notes).toBe('骨盆正位');
    expect(drafts[0].patientName).toBe('面包');
    // 没有任何"结论"被编出来
    expect(drafts[0].findings).toBe('');
    expect(drafts[0].labValues).toBe('');
  });
/**
 * PDF / Word 文档上传（2026-10-08 老板定）
 *
 * 老板："就诊报告、体检报告、过敏检测报告，有可能是 PDF 或者是 Word 文档，
 *        可能需要支持进入微信、选择文档上传。"
 *
 * 文档不能交给视觉模型（它不是图）→ 先抽文字，再用**同一套提示词**交给文本模型。
 * 抽不出文字（扫描件、图片型 PDF、某些生成器产出的怪 PDF）时，
 * 要给一句**能行动**的话，而不是技术错误。
 */
describe('文档（PDF / Word）识别', () => {
  const originalFetch = global.fetch
  // 这一组自带一个服务实例（它是顶层 describe，拿不到上面那个 service）
  let docService: HealthReportExtractionService

  beforeEach(async () => {
    process.env.HEALTH_REPORT_VISION = 'off'
    const moduleRef = await Test.createTestingModule({
      providers: [
        HealthReportExtractionService,
        { provide: HEALTH_REPORT_OCR_PROVIDER, useValue: { recognizeImage: jest.fn() } },
        {
          provide: AgentProviderConfigService,
          useValue: {
            getEnabledDeepSeekRuntimeConfig: jest.fn().mockResolvedValue({
              provider: 'deepseek',
              baseUrl: 'https://api.deepseek.com',
              model: 'deepseek-v4-flash',
              reviewModel: 'deepseek-v4-pro',
              apiKey: 'test-key',
              maxConcurrency: 1,
              requestTimeoutMs: 5000,
              retryCount: 0,
            }),
            getConfiguredPurposeModel: jest.fn().mockResolvedValue(null),
          },
        },
      ],
    }).compile()
    docService = moduleRef.get(HealthReportExtractionService)
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('认得出上传的是图片还是文档', () => {
    expect(resolveHealthDocumentFileKind('https://cdn/a/b.jpg')).toBe('image')
    expect(resolveHealthDocumentFileKind('https://cdn/a/report.pdf')).toBe('pdf')
    expect(
      resolveHealthDocumentFileKind('https://cdn/x', '免疫记录.DOCX'),
    ).toBe('docx')
    expect(resolveHealthDocumentFileKind('https://cdn/x', 'old.doc')).toBe('doc')
    // 带查询串也要认得出
    expect(
      resolveHealthDocumentFileKind('https://cdn/a/report.pdf?sign=abc'),
    ).toBe('pdf')
  })

  it('文档里抽不出文字时，告诉顾客改用拍照上传（不说技术黑话）', async () => {
    // 假 PDF：pdf-parse 解析不了 → 抽出的文字为空
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    }) as unknown as typeof fetch

    await expect(
      docService.extractFromReport({ imageUrl: 'https://cdn/broken.pdf' }),
    ).rejects.toThrow(/拍照上传/)
  })

  it('老版 .doc 直接说清楚怎么办（不硬啃）', async () => {
    await expect(
      docService.extractFromReport({
        imageUrl: 'https://cdn/x',
        originalFilename: '病历.doc',
      }),
    ).rejects.toThrow(/另存为 PDF 或 \.docx/)
  })
})

/**
 * 疫苗本 · 产品名"再看一眼图"的复核（2026-10-09 老板定）
 *
 * 老板的方案："每次都让模型再审一遍原图和代码的匹配结果，看有没有问题。"
 * 采纳，但问题必须**封闭**（问"本子上写的是什么"，不问"有没有问题"）——
 * 开放式问题会逼模型编（实测它编过"贴纸被手指遮挡"）。
 */
describe('疫苗本 · 产品名复核', () => {
  it('只复核抄到名字的行', () => {
    const rows = buildProductReviewRows([
      { vaccineName: '英特威®优免康', productName: '宠必威优免康', vaccinationDate: '2023-08-09' },
      { vaccineName: '', productName: '', vaccinationDate: '2024-01-01' },
      { vaccineName: '狂犬', productName: '', vaccinationDate: '2026-07-25' },
    ]);

    expect(rows.map((row) => row.index)).toEqual([0, 2]);
    expect(rows[0].ourProduct).toBe('宠必威优免康');
    expect(rows[1].ourProduct).toBe('');
  });

  it('提示词是封闭问题，并且只许从产品库里挑候选', () => {
    const prompt = buildProductReviewPrompt(['宠必威优免康', '宠必威锐必威']);

    expect(prompt).toContain('逐字照抄');
    expect(prompt).toContain('sameAsOurs');
    expect(prompt).toContain('产品库之外的名字一律不许编');
    expect(prompt).toContain('宠必威锐必威');
  });

  it('不一致的行带上"它读到的字 + 候选"，一致的只留标记', () => {
    const drafts: Record<string, any>[] = [
      { vaccineName: '英特威®优免康', productName: '宠必威优免康' },
      { vaccineName: '卫佳捌', productName: '卫佳捌' },
    ];

    const result = applyProductReview(
      drafts,
      {
        rows: [
          { index: 0, textOnBook: '宠必威锐必威', sameAsOurs: false, candidates: ['宠必威锐必威', '宠必威乐必妥'] },
          { index: 1, textOnBook: '卫佳捌', sameAsOurs: true, candidates: [] },
        ],
      },
      ['宠必威优免康', '宠必威锐必威', '宠必威乐必妥', '卫佳捌'],
    );

    expect(result).toEqual({ reviewed: 2, inconsistent: 1 });
    expect(drafts[0].productReview).toEqual({
      textOnBook: '宠必威锐必威',
      consistent: false,
      candidates: ['宠必威锐必威', '宠必威乐必妥'],
    });
    expect(drafts[1].productReview.consistent).toBe(true);
    expect(drafts[1].productReview.candidates).toEqual([]);
  });

  it('🔴 库里没有的候选一律丢掉（模型编的名字不许进界面）', () => {
    const drafts: Record<string, any>[] = [{ vaccineName: '英特威®优免康', productName: '' }];

    const result = applyProductReview(
      drafts,
      {
        rows: [
          {
            index: 0,
            textOnBook: '宠必威锐必威',
            sameAsOurs: false,
            candidates: ['不存在的苗', '宠必威优免康', '另一个编的'],
          },
        ],
      },
      ['宠必威优免康'],
    );

    expect(result.inconsistent).toBe(1);
    expect(drafts[0].productReview.candidates).toEqual(['宠必威优免康']);
  });

  it('候选去重、也要排除掉我们自己认定的那一支，最多 3 个', () => {
    const drafts: Record<string, any>[] = [
      { vaccineName: 'X', productName: '卫佳捌' },
    ];

    applyProductReview(
      drafts,
      {
        rows: [
          {
            index: 0,
            textOnBook: 'X',
            sameAsOurs: false,
            candidates: ['卫佳捌', '卫佳伍', '卫佳伍', '瑞比克', '宠必威优免康', '优乐康'],
          },
        ],
      },
      ['卫佳捌', '卫佳伍', '瑞比克', '宠必威优免康', '优乐康'],
    );

    expect(drafts[0].productReview.candidates).toEqual(['卫佳伍', '瑞比克', '宠必威优免康']);
  });

  it('🔴 我们没匹配上、而且它读到的字和我们抄的一样 → 不算不一致（避免误报）', () => {
    const drafts: Record<string, any>[] = [
      { vaccineName: '宠派纯® 狂犬病灭活疫苗', productName: '' },
      { vaccineName: '狂犬', productName: '' },
    ];

    const result = applyProductReview(
      drafts,
      {
        rows: [
          { index: 0, textOnBook: '宠派纯® 狂犬病灭活疫苗', sameAsOurs: false, candidates: ['瑞比克'] },
          { index: 1, textOnBook: '狂犬', sameAsOurs: false, candidates: ['瑞比克'] },
        ],
      },
      ['瑞比克'],
    );

    expect(result).toEqual({ reviewed: 2, inconsistent: 0 });
    expect(drafts[0].productReview.consistent).toBe(true);
    expect(drafts[0].productReview.candidates).toEqual([]);
  });

  it('我们没匹配上，但它读到的字**不一样** → 算不一致（这可能是真读错了）', () => {
    const drafts: Record<string, any>[] = [{ vaccineName: '英特威®优免康', productName: '' }];

    const result = applyProductReview(
      drafts,
      {
        rows: [
          { index: 0, textOnBook: '宠必威锐必威', sameAsOurs: false, candidates: ['宠必威锐必威'] },
        ],
      },
      ['宠必威锐必威'],
    );

    expect(result.inconsistent).toBe(1);
    expect(drafts[0].productReview.candidates).toEqual(['宠必威锐必威']);
  });

  it('模型没给答案时不算"不一致"（不许凭空给家长报警）', () => {
    const drafts: Record<string, any>[] = [{ vaccineName: 'X', productName: '' }];

    const result = applyProductReview(drafts, { rows: [{ index: 0 }] }, []);

    expect(result).toEqual({ reviewed: 1, inconsistent: 0 });
    expect(drafts[0].productReview.consistent).toBe(true);
  });

  it('复核结果为空/坏数据时什么都不做', () => {
    const drafts: Record<string, any>[] = [{ vaccineName: 'X', productName: '' }];

    expect(applyProductReview(drafts, null, [])).toEqual({ reviewed: 0, inconsistent: 0 });
    expect(applyProductReview(drafts, { rows: 'nope' } as any, [])).toEqual({
      reviewed: 0,
      inconsistent: 0,
    });
    expect(drafts[0].productReview).toBeUndefined();
  });
})
});


/**
 * 品牌一致性检查接在识别结果上（2026-10-09）
 */
describe('疫苗本 · 品牌对不上的行会带标记', () => {
  it('「英特威®瑞比克」这种矛盾会挂上 brandCheck.conflict', () => {
    const drafts = normalizeDrafts('VACCINE_BOOK', {
      drafts: [
        { vaccineName: '英特威®瑞比克', vaccinationDate: '2024-08-25' },
        { vaccineName: '卫佳®Vanguard® Plus 5/CV-L', vaccinationDate: '2025-08-18' },
      ],
    });

    expect(drafts[0].brandCheck.conflict).toBe(true);
    expect(drafts[0].brandCheck.textBrand).toBe('英特威');
    expect(drafts[1].brandCheck.conflict).toBe(false);
  });
});
