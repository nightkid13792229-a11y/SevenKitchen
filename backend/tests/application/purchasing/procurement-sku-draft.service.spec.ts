import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  ProcurementSkuDraftService,
  PROCUREMENT_SKU_DRAFT_MODEL,
} from '../../../src/application/purchasing/procurement-sku-draft.service';
import { ProcurementSkuDraftQuotaService } from '../../../src/application/purchasing/procurement-sku-draft-quota.service';
import { AgentProviderConfigService } from '../../../src/application/nutrition-governance/agent-provider-config.service';
import { PrismaService } from '../../../src/infrastructure/prisma.service';
import { PlatformOptionsService } from '../../../src/application/platform-options/platform-options.service';

describe('ProcurementSkuDraftService', () => {
  let service: ProcurementSkuDraftService;
  const model = { callDeepSeekJson: jest.fn() };
  const prisma = { ingredient: { findUnique: jest.fn() } } as any;
  const quota = { consume: jest.fn() };
  const agentConfig = {
    getEnabledDeepSeekRuntimeConfig: jest.fn(),
  };
  // 渠道字典：商品截图识别也只从这份清单里选
  const platformOptions = {
    listSet: jest.fn().mockResolvedValue([
      { code: '沃尔玛', label: '沃尔玛', extra: null },
      { code: '盒马鲜生', label: '盒马鲜生', extra: { aliases: ['盒马'] } },
    ]),
  };

  const draft = (overrides: Record<string, unknown> = {}) =>
    service.draftFromScreenshot({
      imageUrl: 'https://img.example.com/a.jpg',
      ingredientId: 'ing-1',
      userId: 'user-1',
      ...overrides,
    });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProcurementSkuDraftService,
        { provide: PrismaService, useValue: prisma },
        { provide: ProcurementSkuDraftQuotaService, useValue: quota },
        { provide: AgentProviderConfigService, useValue: agentConfig },
        { provide: PlatformOptionsService, useValue: platformOptions },
        { provide: PROCUREMENT_SKU_DRAFT_MODEL, useValue: model },
      ],
    }).compile();

    service = module.get(ProcurementSkuDraftService);
    jest.clearAllMocks();
    quota.consume.mockResolvedValue(undefined);
    agentConfig.getEnabledDeepSeekRuntimeConfig.mockResolvedValue({
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-flash',
      apiKey: 'sk-test',
      requestTimeoutMs: 60000,
    });
  });

  it('1kg 归一成 1000 克，packCount=1', async () => {
    prisma.ingredient.findUnique.mockResolvedValue({
      id: 'ing-1',
      type: 'FOOD',
      baseUnit: 'G',
    });
    model.callDeepSeekJson.mockResolvedValue({
      name: '沃集鲜 糙米 1kg',
      netContent: { value: 1, unit: 'kg' },
      packCount: 1,
      purchaseChannel: '沃尔玛',
      purchaseUnit: '袋',
      unitPrice: 14.99,
    });

    const result = await draft();

    expect(result.netContentPerPack).toBe(1000);
    expect(result.packCount).toBe(1);
    expect(result.missing).toEqual([]);
  });

  it('只读到单件规格 330ml 时 packCount 留 null 并进 missing', async () => {
    prisma.ingredient.findUnique.mockResolvedValue({
      id: 'ing-1',
      type: 'FOOD',
      baseUnit: 'ML',
    });
    model.callDeepSeekJson.mockResolvedValue({
      name: '椰汁',
      netContent: { value: 330, unit: 'ml' },
      purchaseUnit: '箱',
    });

    const result = await draft();

    expect(result.netContentPerPack).toBe(330);
    expect(result.packCount).toBeNull();
    expect(result.missing).toContain('packCount');
  });

  it('跨维度不换算，净含量判 missing', async () => {
    prisma.ingredient.findUnique.mockResolvedValue({
      id: 'ing-1',
      type: 'FOOD',
      baseUnit: 'G',
    });
    model.callDeepSeekJson.mockResolvedValue({
      name: '糙米',
      netContent: { value: 330, unit: 'ml' },
    });

    const result = await draft();

    expect(result.netContentPerPack).toBeNull();
    expect(result.missing).toContain('netContentPerPack');
  });

  it('识别成订单列表时抛 BadRequest 提示重新截图', async () => {
    prisma.ingredient.findUnique.mockResolvedValue({
      id: 'ing-1',
      type: 'FOOD',
      baseUnit: 'G',
    });
    model.callDeepSeekJson.mockResolvedValue({
      productList: [{ name: 'a' }, { name: 'b' }],
    });

    await expect(draft()).rejects.toBeInstanceOf(BadRequestException);
  });

  it('模型抛错时向上抛出，由控制器降级', async () => {
    prisma.ingredient.findUnique.mockResolvedValue({
      id: 'ing-1',
      type: 'FOOD',
      baseUnit: 'G',
    });
    model.callDeepSeekJson.mockRejectedValue(new Error('timeout'));

    await expect(draft()).rejects.toThrow('timeout');
  });

  it('非食材原料直接拒绝，不消耗配额也不调模型', async () => {
    prisma.ingredient.findUnique.mockResolvedValue({
      id: 'ing-9',
      type: 'SUPPLEMENT',
      baseUnit: 'G',
    });

    await expect(draft()).rejects.toBeInstanceOf(BadRequestException);
    expect(quota.consume).not.toHaveBeenCalled();
    expect(model.callDeepSeekJson).not.toHaveBeenCalled();
  });
});
