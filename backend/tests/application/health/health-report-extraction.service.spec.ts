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
  HEALTH_REPORT_OCR_PROVIDER,
  buildSystemPrompt,
  isHealthReportVisionEnabled,
  normalizeDocumentType,
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
    expect(result.confidence).toBe('HIGH');
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
    expect(result.confidence).toBe('LOW');
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
      let capturedBody = '';
      global.fetch = jest.fn().mockImplementation(async (_url, init) => {
        capturedBody = String(init?.body || '');
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
 * 改成优先让多模态模型直接看图（deepseek-v4-flash-vision-exp，与 Flash 同价、
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
    expect(body.model).toBe('deepseek-v4-flash-vision-exp');
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
      expect(resolveHealthReportVisionModel({} as NodeJS.ProcessEnv)).toBe(
        'deepseek-v4-flash-vision-exp',
      );
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
