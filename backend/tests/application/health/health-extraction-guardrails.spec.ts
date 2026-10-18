/**
 * 识别的两道护栏（2026-10-16 上线前风险控制 B5）
 *
 *   ① **超限就要在调模型之前拒绝** —— 这是省钱的关键：
 *      拒绝发生在 fetch / OCR 之前，超限的那一次一分钱都不花 ✓
 *   ② **每次识别留一条成本日志**：哪一类文档、耗时、成没成功、用了哪个模型、
 *      多少 token（累积起来能算单次成本）—— 但**不许记识别出来的内容** ✗
 *
 * 上限怎么计数、并发穿不穿得过去，见 health-extraction-quota.spec.ts
 */

import { HttpException, Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  HealthReportExtractionService,
  HEALTH_REPORT_OCR_PROVIDER,
} from 'src/application/health/health-report-extraction.service';
import {
  HEALTH_EXTRACTION_QUOTA_MESSAGE,
  HealthExtractionQuotaService,
} from 'src/application/health/health-extraction-quota.service';
import { AgentProviderConfigService } from 'src/application/nutrition-governance/agent-provider-config.service';

const okJsonResponse = (
  payload: Record<string, unknown>,
  usage?: Record<string, unknown>,
) => ({
  ok: true,
  json: async () => ({
    choices: [{ message: { content: JSON.stringify(payload) } }],
    ...(usage ? { usage } : {}),
  }),
});

describe('识别 · 每日上限挡在调模型之前 + 成本日志', () => {
  let service: HealthReportExtractionService;
  let ocrProvider: { recognizeImage: jest.Mock };
  let agentConfig: {
    getEnabledDeepSeekRuntimeConfig: jest.Mock;
    getConfiguredPurposeModel: jest.Mock;
  };
  let quota: {
    assertWithinDailyLimit: jest.Mock;
    getTodayUsage: jest.Mock;
  };
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  const originalVision = process.env.HEALTH_REPORT_VISION;
  const originalVisionModel = process.env.HEALTH_REPORT_VISION_MODEL;

  beforeEach(async () => {
    // 这组用例都走"OCR 认字 → 文本模型整理"那条老路（视觉另有用例）
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
      getConfiguredPurposeModel: jest.fn().mockResolvedValue(null),
    };
    quota = {
      assertWithinDailyLimit: jest.fn().mockResolvedValue({
        limit: 500,
        used: 136,
        dateKey: '2026-10-16',
      }),
      getTodayUsage: jest
        .fn()
        .mockResolvedValue({ limit: 500, used: 136, dateKey: '2026-10-16' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthReportExtractionService,
        { provide: HEALTH_REPORT_OCR_PROVIDER, useValue: ocrProvider },
        { provide: AgentProviderConfigService, useValue: agentConfig },
        { provide: HealthExtractionQuotaService, useValue: quota },
      ],
    }).compile();

    service = module.get(HealthReportExtractionService);
    jest.restoreAllMocks();
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    if (originalVision === undefined) delete process.env.HEALTH_REPORT_VISION;
    else process.env.HEALTH_REPORT_VISION = originalVision;
    if (originalVisionModel === undefined)
      delete process.env.HEALTH_REPORT_VISION_MODEL;
    else process.env.HEALTH_REPORT_VISION_MODEL = originalVisionModel;
  });

  const loggedLines = () =>
    [...logSpy.mock.calls, ...warnSpy.mock.calls].map((call) =>
      String(call[0]),
    );

  it('🔴 超限后**不再调模型**：拒绝发生在 fetch 与 OCR 之前（省钱的关键）', async () => {
    quota.assertWithinDailyLimit.mockRejectedValue(
      Object.assign(
        new HttpException(HEALTH_EXTRACTION_QUOTA_MESSAGE, 429),
        // quota service 会把"用满了多少"挂在异常上（成本日志要用）
        { quota: { limit: 500, used: 500, dateKey: '2026-10-16' } },
      ),
    );
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;

    await expect(
      service.extractFromReport({
        imageUrl: 'https://cdn/vaccine-book.jpg',
        documentType: 'VACCINE_BOOK',
      }),
    ).rejects.toMatchObject({ status: 429 });

    // 模型（fetch）一次都没调 —— 这才是"省钱"的那条线
    expect(fetchSpy).not.toHaveBeenCalled();
    // OCR 也不许调：它同样要钱（腾讯云按次计费）
    expect(ocrProvider.recognizeImage).not.toHaveBeenCalled();
  });

  it('超限被拒也要留一行日志（能分辨"额度用完"和"图没读出来"）', async () => {
    quota.assertWithinDailyLimit.mockRejectedValue(
      Object.assign(
        new HttpException(HEALTH_EXTRACTION_QUOTA_MESSAGE, 429),
        { quota: { limit: 500, used: 500, dateKey: '2026-10-16' } },
      ),
    );
    global.fetch = jest.fn() as unknown as typeof fetch;

    await expect(
      service.extractFromReport({
        imageUrl: 'https://cdn/vaccine-book.jpg',
        documentType: 'VACCINE_BOOK',
      }),
    ).rejects.toMatchObject({ status: 429 });

    const failLine = loggedLines().find((line) =>
      line.includes('[Extraction][FAIL]'),
    );
    expect(failLine).toBeDefined();
    expect(failLine).toContain('ok=0');
    expect(failLine).toContain('type=VACCINE_BOOK');
    expect(failLine).toContain('今天的识别次数已经用完了');
    // 耗时要记（这一条是 0 秒级的拒绝，但字段必须在）
    expect(failLine).toMatch(/ms=\d+/);
    // 被拒的那一行也要写清"当天用满了"（限流排查靠它）
    expect(failLine).toContain('limit=500');
    expect(failLine).toContain('used=500');
  });

  it('成功时一行记全：类别 / 耗时 / 模型 / token / 当天用量', async () => {
    ocrProvider.recognizeImage.mockResolvedValue({ text: '疫苗本 卫佳伍 2026-01-01' });
    global.fetch = jest.fn().mockResolvedValue(
      okJsonResponse(
        {
          documentType: 'VACCINE_BOOK',
          drafts: [{ vaccineName: '卫佳伍', vaccinationDate: '2026-01-01' }],
        },
        { prompt_tokens: 1523, completion_tokens: 210 },
      ),
    ) as unknown as typeof fetch;

    await service.extractFromReport({
      imageUrl: 'https://cdn/vaccine-book.jpg',
      documentType: 'VACCINE_BOOK',
    });

    const line = loggedLines().find((l) => l.startsWith('[Extraction] '));
    expect(line).toBeDefined();
    expect(line).toContain('ok=1');
    expect(line).toContain('type=VACCINE_BOOK');
    expect(line).toContain('drafts=1');
    expect(line).toMatch(/ms=\d+/);
    expect(line).toContain('calls=1');
    expect(line).toContain('phase=ocr');
    expect(line).toContain('model=deepseek-v4-flash');
    // token = 成本的真正单位（成本 = in/out × 该模型单价）
    expect(line).toContain('in=1523');
    expect(line).toContain('out=210');
    // 当天用量：一眼看出离上限还有多远
    expect(line).toContain('limit=500');
    expect(line).toContain('used=136');
  });

  it('日志里**不许出现识别出来的内容**（疫苗名/日期都是用户数据）', async () => {
    ocrProvider.recognizeImage.mockResolvedValue({ text: '疫苗本 卫佳伍 2026-01-01' });
    global.fetch = jest.fn().mockResolvedValue(
      okJsonResponse({
        documentType: 'VACCINE_BOOK',
        drafts: [{ vaccineName: '卫佳伍', vaccinationDate: '2026-01-01' }],
      }),
    ) as unknown as typeof fetch;

    await service.extractFromReport({
      imageUrl: 'https://cdn/vaccine-book.jpg',
      documentType: 'VACCINE_BOOK',
    });

    const all = loggedLines().join('\n');
    expect(all).not.toContain('卫佳伍');
    expect(all).not.toContain('2026-01-01');
    expect(all).not.toContain('疫苗本 卫佳伍'); // OCR 原文也不许进日志
  });

  it('一条都没读出来时用 [Extraction][EMPTY] 标记（scan-failure-report.sh 靠它统计）', async () => {
    ocrProvider.recognizeImage.mockResolvedValue({ text: '一张模糊的纸' });
    global.fetch = jest.fn().mockResolvedValue(
      okJsonResponse({ documentType: 'VACCINE_BOOK', drafts: [], warnings: [] }),
    ) as unknown as typeof fetch;

    await service.extractFromReport({
      imageUrl: 'https://cdn/blur.jpg',
      documentType: 'VACCINE_BOOK',
    });

    const emptyLine = loggedLines().find((line) =>
      line.includes('[Extraction][EMPTY]'),
    );
    expect(emptyLine).toBeDefined();
    expect(emptyLine).toContain('type=VACCINE_BOOK');
    expect(emptyLine).toContain('drafts=0');
    // EMPTY 的行也必须带成本字段（它同样花了一次钱）
    expect(emptyLine).toContain('ms=');
    expect(emptyLine).toMatch(/calls=\d/);
  });

  it('模型这条路自己失败（没识别到文字）也会留一行 [Extraction][FAIL]', async () => {
    ocrProvider.recognizeImage.mockResolvedValue({ text: '   ' });
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;

    await expect(
      service.extractFromReport({
        imageUrl: 'https://cdn/x.jpg',
        documentType: 'CHECKUP_REPORT',
      }),
    ).rejects.toThrow('未能识别到报告文字');

    expect(fetchSpy).not.toHaveBeenCalled();
    const failLine = loggedLines().find((line) =>
      line.includes('[Extraction][FAIL]'),
    );
    expect(failLine).toContain('ok=0');
    expect(failLine).toContain('type=CHECKUP_REPORT');
    expect(failLine).toContain('phase=ocr');
    expect(failLine).toContain('reason=未能识别到报告文字');
  });

  it('一次识别**只占一次**额度（多占一次 = 上限提前一倍用完）', async () => {
    ocrProvider.recognizeImage.mockResolvedValue({ text: '疫苗本' });
    global.fetch = jest.fn().mockResolvedValue(
      okJsonResponse({
        documentType: 'VACCINE_BOOK',
        drafts: [{ vaccineName: '卫佳伍', vaccinationDate: '2026-01-01' }],
      }),
    ) as unknown as typeof fetch;

    await service.extractFromReport({
      imageUrl: 'https://cdn/vaccine-book.jpg',
      documentType: 'VACCINE_BOOK',
    });

    expect(quota.assertWithinDailyLimit).toHaveBeenCalledTimes(1);
  });
});
