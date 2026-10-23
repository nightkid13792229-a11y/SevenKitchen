import {
  INestApplication,
  Logger,
  ServiceUnavailableException,
  ValidationPipe,
} from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import {
  IngredientCreationIntakeService,
  type IntakeClassification,
} from '../../../src/application/ingredient-creation/ingredient-creation-intake.service';
import { IngredientCreationAuditService } from '../../../src/application/ingredient-creation/ingredient-creation-audit.service';
import { IngredientCreationCandidateService } from '../../../src/application/ingredient-creation/ingredient-creation-candidate.service';
import { IngredientCreationCheckService } from '../../../src/application/ingredient-creation/ingredient-creation-check.service';
import { IngredientCreationCommitService } from '../../../src/application/ingredient-creation/ingredient-creation-commit.service';
import { IngredientCreationDraftService } from '../../../src/application/ingredient-creation/ingredient-creation-draft.service';
import { IngredientCreationMergeService } from '../../../src/application/ingredient-creation/ingredient-creation-merge.service';
import { IngredientCreationOnlineService } from '../../../src/application/ingredient-creation/ingredient-creation-online.service';
import {
  AgentProviderConfigService,
  type AgentProviderSettingsView,
  type DeepSeekRuntimeConfig,
} from '../../../src/application/nutrition-governance/agent-provider-config.service';
import { AuthGuard } from '../../../src/interfaces/auth/auth.guard';
import { JwtAuthService } from '../../../src/interfaces/auth/jwt.service';
import { IngredientCreationController } from '../../../src/interfaces/controllers/ingredient-creation.controller';
import { AdminGuard } from '../../../src/interfaces/guards/role.guard';

const INTAKE_PURPOSE = 'INGREDIENT_INTAKE';
const PRIMARY_MODEL = 'deepseek-v4-flash';
const REVIEW_MODEL = 'deepseek-v4-pro';
const BASE_URL = 'https://api.deepseek.test';
const CLASSIFY_PATH = '/api/v1/admin/ingredient-creation/intake/classify';

const FOOD_RESULT: IntakeClassification = {
  kind: 'FOOD',
  reply: '这是食材。好，我们走食材这条路。',
  suggestions: [],
};

const SUPPLEMENT_RESULT: IntakeClassification = {
  kind: 'SUPPLEMENT',
  reply: '这是补剂。好，我们走补剂这条路。',
  suggestions: [],
};

const UNKNOWN_RESULT: IntakeClassification = {
  kind: 'UNKNOWN',
  reply: '我没太确定，你想加的是食材还是补剂？',
  suggestions: ['食材', '补剂', '我说的是牛肉'],
};

function buildSettings(
  overrides: Partial<AgentProviderSettingsView> = {},
): AgentProviderSettingsView {
  return {
    purpose: 'DEFAULT',
    provider: 'DEEPSEEK',
    enabled: true,
    baseUrl: BASE_URL,
    model: PRIMARY_MODEL,
    reviewModel: REVIEW_MODEL,
    apiKeyConfigured: true,
    apiKeyLast4: '1234',
    maxConcurrency: 1,
    requestTimeoutMs: 90_000,
    retryCount: 2,
    ...overrides,
  };
}

function buildRuntime(
  overrides: Partial<DeepSeekRuntimeConfig> = {},
): DeepSeekRuntimeConfig {
  return {
    provider: 'deepseek',
    baseUrl: BASE_URL,
    model: PRIMARY_MODEL,
    reviewModel: REVIEW_MODEL,
    apiKey: 'sk-test',
    maxConcurrency: 1,
    requestTimeoutMs: 90_000,
    retryCount: 2,
    ...overrides,
  };
}

function chatResponse(payload: unknown) {
  return {
    ok: true,
    status: 200,
    json: jest.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(payload) } }],
    }),
  } as unknown as Response;
}

function rawContentResponse(content: string) {
  return {
    ok: true,
    status: 200,
    json: jest.fn().mockResolvedValue({
      choices: [{ message: { content } }],
    }),
  } as unknown as Response;
}

function errorResponse(status = 500) {
  return {
    ok: false,
    status,
    json: jest.fn().mockResolvedValue({ error: 'upstream failed' }),
  } as unknown as Response;
}

async function createService(
  options: {
    settings?: Partial<AgentProviderSettingsView>;
    runtime?: Partial<DeepSeekRuntimeConfig>;
    runtimeError?: Error;
  } = {},
) {
  const configService = {
    getSettings: jest.fn().mockResolvedValue(buildSettings(options.settings)),
    getEnabledDeepSeekRuntimeConfig: options.runtimeError
      ? jest.fn().mockRejectedValue(options.runtimeError)
      : jest.fn().mockResolvedValue(buildRuntime(options.runtime)),
  };

  const moduleRef: TestingModule = await Test.createTestingModule({
    providers: [
      IngredientCreationIntakeService,
      { provide: AgentProviderConfigService, useValue: configService },
    ],
  }).compile();

  return {
    service: moduleRef.get(IngredientCreationIntakeService),
    configService,
  };
}

function sentModels(fetchMock: jest.Mock): string[] {
  return fetchMock.mock.calls.map(
    ([, init]) => JSON.parse(String(init.body)).model,
  );
}

function firstRequestBody(fetchMock: jest.Mock): any {
  const [, init] = fetchMock.mock.calls[0];
  return JSON.parse(String(init.body));
}

describe('IngredientCreationIntakeService', () => {
  const originalFetch = global.fetch;
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    // 非 2xx 时共享的 deepseek-chat 会 console.error 一次；测试里静音。
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('食材输入返回 FOOD 与确认话术', async () => {
    const fetchMock = jest.fn().mockResolvedValue(chatResponse(FOOD_RESULT));
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const { service, configService } = await createService();

    await expect(service.classify('牛肉')).resolves.toEqual(FOOD_RESULT);

    expect(configService.getSettings).toHaveBeenCalledWith(INTAKE_PURPOSE);
    expect(configService.getEnabledDeepSeekRuntimeConfig).toHaveBeenCalledWith({
      purpose: INTAKE_PURPOSE,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/chat/completions`);
    const body = firstRequestBody(fetchMock);
    expect(body.model).toBe(PRIMARY_MODEL);
    expect(body.temperature).toBe(0.2);
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.messages[0].content).toContain('食材');
    expect(body.messages[0].content).toContain('补剂');
    expect(body.messages[0].content).toContain('UNKNOWN');
    expect(body.messages[0].content).toContain('只输出 JSON');
    expect(JSON.parse(body.messages[1].content)).toEqual({ text: '牛肉' });
    expect(init.signal).toBeInstanceOf(AbortSignal);

    // 实际使用的模型名要进日志，便于排查是哪一路模型在判。
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining(PRIMARY_MODEL));
  });

  it('补剂输入返回 SUPPLEMENT 与确认话术', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(chatResponse(SUPPLEMENT_RESULT)) as any;

    const { service } = await createService();

    await expect(service.classify('葡萄糖酸锌')).resolves.toEqual(
      SUPPLEMENT_RESULT,
    );
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('拿不准时返回 UNKNOWN 与 2–3 个可点建议', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(chatResponse(UNKNOWN_RESULT)) as any;

    const { service } = await createService();

    const result = await service.classify('今天天气');

    expect(result.kind).toBe('UNKNOWN');
    expect(result.reply).toContain('？');
    expect(result.suggestions).toHaveLength(3);
  });

  it('主模型失败时自动切 reviewModel 重试一次', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(errorResponse(500))
      .mockResolvedValueOnce(chatResponse(SUPPLEMENT_RESULT));
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const { service } = await createService();

    await expect(service.classify('鱼油')).resolves.toEqual(SUPPLEMENT_RESULT);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sentModels(fetchMock)).toEqual([PRIMARY_MODEL, REVIEW_MODEL]);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(PRIMARY_MODEL),
    );
  });

  it('reviewModel 未配置时用同一个 model 再试一次', async () => {
    const fetchMock = jest
      .fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce(chatResponse(FOOD_RESULT));
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const { service } = await createService({ settings: { reviewModel: '' } });

    await expect(service.classify('牛肉')).resolves.toEqual(FOOD_RESULT);
    expect(sentModels(fetchMock)).toEqual([PRIMARY_MODEL, PRIMARY_MODEL]);
  });

  it('模型返回非 JSON 时视为失败并切备模型', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(rawContentResponse('我觉得这是食材'))
      .mockResolvedValueOnce(chatResponse(FOOD_RESULT));
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const { service } = await createService();

    await expect(service.classify('牛肉')).resolves.toEqual(FOOD_RESULT);
    expect(sentModels(fetchMock)).toEqual([PRIMARY_MODEL, REVIEW_MODEL]);
  });

  it('两个模型都失败时抛 503，不回退到规则判断', async () => {
    const fetchMock = jest.fn().mockRejectedValue(new Error('network down'));
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const { service } = await createService();

    let caught: unknown;
    try {
      await service.classify('牛肉');
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ServiceUnavailableException);
    expect((caught as ServiceUnavailableException).getStatus()).toBe(503);
    expect((caught as Error).message).toBe('AI 暂时不可用，请稍后重试');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining(PRIMARY_MODEL),
    );
  });

  it('AI 未启用时抛 503，提示去「Agent 设置」启用并配置模型', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const { service } = await createService({
      settings: { enabled: false },
    });

    let caught: unknown;
    try {
      await service.classify('牛肉');
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ServiceUnavailableException);
    expect((caught as ServiceUnavailableException).getStatus()).toBe(503);
    expect((caught as Error).message).toContain('Agent 设置');
    expect((caught as Error).message).toContain(
      'AI 当前不可用，请在「原料营养治理 → Agent 设置」里启用并配置模型',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('AI 已启用但没配 API Key 时也抛 503，不发起任何请求', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const { service } = await createService({
      settings: { apiKeyConfigured: false },
    });

    await expect(service.classify('牛肉')).rejects.toMatchObject({
      message: expect.stringContaining('Agent 设置'),
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('空白输入直接 400，不查配置也不发请求', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const { service, configService } = await createService();

    await expect(service.classify('   ')).rejects.toMatchObject({
      status: 400,
    });
    expect(configService.getSettings).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/admin/ingredient-creation/intake/classify', () => {
  let app: INestApplication;
  let intakeService: { classify: jest.Mock };

  beforeEach(async () => {
    intakeService = { classify: jest.fn() };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [IngredientCreationController],
      providers: [
        { provide: IngredientCreationDraftService, useValue: {} },
        { provide: IngredientCreationCandidateService, useValue: {} },
        { provide: IngredientCreationOnlineService, useValue: {} },
        { provide: IngredientCreationMergeService, useValue: {} },
        { provide: IngredientCreationCheckService, useValue: {} },
        { provide: IngredientCreationCommitService, useValue: {} },
        { provide: IngredientCreationAuditService, useValue: {} },
        { provide: IngredientCreationIntakeService, useValue: intakeService },
        {
          provide: JwtAuthService,
          useValue: {
            validateToken: jest.fn().mockReturnValue({
              userId: 'admin-1',
              customerId: 'admin-1',
              role: 'ADMIN',
            }),
          },
        },
        AuthGuard,
        AdminGuard,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  function http() {
    return request(app.getHttpServer());
  }

  it('未登录 → 401，且不调用分类服务', async () => {
    await http().post(CLASSIFY_PATH).send({ text: '牛肉' }).expect(401);

    expect(intakeService.classify).not.toHaveBeenCalled();
  });

  it('已登录时返回 ApiResponseDto 包裹的分类结果', async () => {
    intakeService.classify.mockResolvedValue(FOOD_RESULT);

    const response = await http()
      .post(CLASSIFY_PATH)
      .set('Authorization', 'Bearer admin-token')
      .send({ text: '牛肉' })
      .expect(201);

    expect(intakeService.classify).toHaveBeenCalledWith('牛肉');
    expect(response.body).toEqual({
      code: 0,
      message: 'Success',
      data: FOOD_RESULT,
    });
  });

  it('缺少 text → 400，且不调用分类服务', async () => {
    await http()
      .post(CLASSIFY_PATH)
      .set('Authorization', 'Bearer admin-token')
      .send({})
      .expect(400);

    expect(intakeService.classify).not.toHaveBeenCalled();
  });

  it('AI 未启用时接口返回 503，错误文案指向「Agent 设置」', async () => {
    intakeService.classify.mockRejectedValue(
      new ServiceUnavailableException(
        'AI 当前不可用，请在「原料营养治理 → Agent 设置」里启用并配置模型',
      ),
    );

    const response = await http()
      .post(CLASSIFY_PATH)
      .set('Authorization', 'Bearer admin-token')
      .send({ text: '牛肉' })
      .expect(503);

    expect(response.body.message).toContain('Agent 设置');
  });
});
