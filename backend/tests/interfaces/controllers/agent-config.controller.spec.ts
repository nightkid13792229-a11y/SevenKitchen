import { Test } from '@nestjs/testing';
import { AgentConfigService } from '../../../src/application/agent/agent-config.service';
import { JwtAuthService } from '../../../src/interfaces/auth';
import { AgentConfigController } from '../../../src/interfaces/controllers/agent-config.controller';

describe('AgentConfigController', () => {
  let controller: AgentConfigController;
  const service = {
    getSupplementImportConfig: jest.fn(),
    updateSupplementImportConfig: jest.fn(),
    testSupplementImportConfig: jest.fn(),
  };

  const view = {
    id: 'cfg-1',
    enabled: false,
    provider: 'OPENAI_COMPATIBLE',
    baseUrl: 'https://api.example.com/v1',
    apiKeyConfigured: true,
    visionModel: 'gpt-4.1-mini',
    textModel: 'gpt-4.1-mini',
    temperature: 0.1,
    timeoutMs: 30000,
    maxRetries: 1,
    promptVersion: 'supplement-import-v1',
    schemaVersion: 'supplement-import-schema-v1',
    lastTestStatus: null,
    lastTestMessage: null,
    updatedBy: 'admin-1',
    createdAt: '2026-05-27T00:00:00.000Z',
    updatedAt: '2026-05-27T00:00:00.000Z',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      controllers: [AgentConfigController],
      providers: [
        {
          provide: AgentConfigService,
          useValue: service,
        },
        {
          provide: JwtAuthService,
          useValue: { validateToken: jest.fn() },
        },
      ],
    }).compile();

    controller = moduleRef.get(AgentConfigController);
  });

  it('uses auth and admin guards', () => {
    expect(Reflect.getMetadata('__guards__', AgentConfigController)).toEqual(
      expect.arrayContaining([expect.any(Function), expect.any(Function)]),
    );
  });

  it('delegates get and returns success response', async () => {
    service.getSupplementImportConfig.mockResolvedValue(view);

    const response = await controller.get();

    expect(response.code).toBe(0);
    expect(response.data).toBe(view);
    expect(service.getSupplementImportConfig).toHaveBeenCalledWith();
  });

  it('delegates update with current user and returns success response', async () => {
    const dto = { enabled: true };
    service.updateSupplementImportConfig.mockResolvedValue({
      ...view,
      enabled: true,
    });

    const response = await controller.update(dto, {
      userId: 'admin-1',
      customerId: 'admin-1',
      role: 'ADMIN',
    });

    expect(response.code).toBe(0);
    expect(response.data?.enabled).toBe(true);
    expect(service.updateSupplementImportConfig).toHaveBeenCalledWith(
      dto,
      'admin-1',
    );
  });

  it('delegates test and returns success response', async () => {
    service.testSupplementImportConfig.mockResolvedValue({
      ok: true,
      message: 'Model endpoint is reachable',
    });

    const response = await controller.test({
      userId: 'admin-1',
      customerId: 'admin-1',
      role: 'ADMIN',
    });

    expect(response.code).toBe(0);
    expect(response.data?.ok).toBe(true);
    expect(service.testSupplementImportConfig).toHaveBeenCalledWith('admin-1');
  });
});
