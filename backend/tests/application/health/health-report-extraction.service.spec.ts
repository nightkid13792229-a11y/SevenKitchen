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
  let agentConfig: { getEnabledDeepSeekRuntimeConfig: jest.Mock };

  beforeEach(async () => {
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

    await expect(
      service.extractFromReport({ imageUrl: 'https://cdn/x.jpg' }),
    ).rejects.toThrow('未能识别到报告文字');
    // 不该白跑一次 AI
    expect(agentConfig.getEnabledDeepSeekRuntimeConfig).not.toHaveBeenCalled();
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
});
