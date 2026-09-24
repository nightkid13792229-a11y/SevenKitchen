import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  SupplementShopConfigService,
  SUPPLEMENT_SHOP_CONFIG_ID,
} from '../../../src/application/supplement-shop/supplement-shop-config.service';
import { PrismaService } from '../../../src/infrastructure/prisma.service';

function buildRow(overrides: Record<string, unknown> = {}) {
  return {
    id: SUPPLEMENT_SHOP_CONFIG_ID,
    enabled: false,
    markupMultiplier: 2,
    serviceFeeMode: 'PER_ORDER',
    serviceFeeAmount: 9.9,
    packagingFeePerBag: 0,
    priceRoundingMode: 'CEIL_TO_0_1',
    minOrderAmount: 0,
    roundUpUsage: true,
    maxPortionMultiplier: 3,
    maxTotalDays: 90,
    shippingMode: 'FLAT_RATE',
    flatShippingFee: 8,
    shippingTemplateId: null,
    freeShippingThreshold: null,
    powderShelfLifeMonths: 6,
    solidShelfLifeMonths: 9,
    oilShelfLifeMonths: 6,
    minRemainingShelfLifeDays: 90,
    aftersalePolicy: null,
    createdAt: new Date('2026-09-18T00:00:00Z'),
    updatedAt: new Date('2026-09-18T00:00:00Z'),
    ...overrides,
  };
}

describe('SupplementShopConfigService', () => {
  let service: SupplementShopConfigService;

  const mockPrismaService = {
    supplementShopConfig: {
      findUnique: jest.fn(),
      create: jest.fn(),
      upsert: jest.fn(),
    },
    shippingTemplate: {
      findUnique: jest.fn(),
    },
  } as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SupplementShopConfigService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get(SupplementShopConfigService);
    jest.clearAllMocks();
  });

  it('首次读取时自动创建单例并落默认值', async () => {
    mockPrismaService.supplementShopConfig.findUnique.mockResolvedValue(null);
    mockPrismaService.supplementShopConfig.create.mockResolvedValue(buildRow());

    const config = await service.getConfig();

    expect(mockPrismaService.supplementShopConfig.create).toHaveBeenCalledWith({
      data: { id: SUPPLEMENT_SHOP_CONFIG_ID },
    });
    expect(config.markupMultiplier).toBe(2);
    expect(config.serviceFeeMode).toBe('PER_ORDER');
    expect(config.shippingMode).toBe('FLAT_RATE');
    expect(config.enabled).toBe(false);
  });

  it('已存在时直接返回，并把 Decimal 转成 number', async () => {
    mockPrismaService.supplementShopConfig.findUnique.mockResolvedValue(
      buildRow({
        markupMultiplier: '2.50',
        serviceFeeAmount: '12.00',
        freeShippingThreshold: '99.00',
      }),
    );

    const config = await service.getConfig();

    expect(config.markupMultiplier).toBe(2.5);
    expect(config.serviceFeeAmount).toBe(12);
    expect(config.freeShippingThreshold).toBe(99);
    expect(mockPrismaService.supplementShopConfig.create).not.toHaveBeenCalled();
  });

  it('加价倍率必须在合法区间内', async () => {
    await expect(
      service.updateConfig({ markupMultiplier: 0 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.updateConfig({ markupMultiplier: 21 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.updateConfig({ markupMultiplier: Number.NaN }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('金额类字段不能为负', async () => {
    await expect(
      service.updateConfig({ serviceFeeAmount: -1 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.updateConfig({ flatShippingFee: -1 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('分装有效期必须是 1~60 的整数月', async () => {
    await expect(
      service.updateConfig({ powderShelfLifeMonths: 0 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.updateConfig({ solidShelfLifeMonths: 3.5 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.updateConfig({ solidShelfLifeMonths: 61 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('加量字段能读出来并转成 number', async () => {
    mockPrismaService.supplementShopConfig.findUnique.mockResolvedValue(
      buildRow({ maxPortionMultiplier: 2, maxTotalDays: 60 }),
    );

    const config = await service.getConfig();

    expect(config.maxPortionMultiplier).toBe(2);
    expect(config.maxTotalDays).toBe(60);
  });

  it('加量字段能写进去', async () => {
    mockPrismaService.supplementShopConfig.upsert.mockResolvedValue(
      buildRow({ maxPortionMultiplier: 2, maxTotalDays: 60 }),
    );

    const updated = await service.updateConfig({
      maxPortionMultiplier: 2,
      maxTotalDays: 60,
    });

    expect(mockPrismaService.supplementShopConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          maxPortionMultiplier: 2,
          maxTotalDays: 60,
        }),
      }),
    );
    expect(updated.maxPortionMultiplier).toBe(2);
    expect(updated.maxTotalDays).toBe(60);
  });

  it('加量份数上限必须是 1~12 的整数', async () => {
    for (const bad of [0, -1, 1.5, 13]) {
      await expect(
        service.updateConfig({ maxPortionMultiplier: bad as number }),
      ).rejects.toThrow(/1~12 的整数/);
    }
  });

  it('加量总天数上限必须是 1~365 的整数', async () => {
    for (const bad of [0, -5, 3.3, 400]) {
      await expect(
        service.updateConfig({ maxTotalDays: bad as number }),
      ).rejects.toThrow(/1~365 的整数/);
    }
  });

  it('按重量计费时必须选择运费模板，且模板要存在并已启用', async () => {
    await expect(
      service.updateConfig({ shippingMode: 'TEMPLATE' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    mockPrismaService.shippingTemplate.findUnique.mockResolvedValue(null);
    await expect(
      service.updateConfig({
        shippingMode: 'TEMPLATE',
        shippingTemplateId: 'missing',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    mockPrismaService.shippingTemplate.findUnique.mockResolvedValue({
      id: 'tpl-1',
      isActive: false,
    });
    await expect(
      service.updateConfig({
        shippingMode: 'TEMPLATE',
        shippingTemplateId: 'tpl-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('选择启用中的运费模板时可以保存', async () => {
    mockPrismaService.shippingTemplate.findUnique.mockResolvedValue({
      id: 'tpl-1',
      isActive: true,
    });
    mockPrismaService.supplementShopConfig.upsert.mockResolvedValue(
      buildRow({ shippingMode: 'TEMPLATE', shippingTemplateId: 'tpl-1' }),
    );

    const config = await service.updateConfig({
      shippingMode: 'TEMPLATE',
      shippingTemplateId: 'tpl-1',
    });

    expect(config.shippingTemplateId).toBe('tpl-1');
    expect(mockPrismaService.supplementShopConfig.upsert).toHaveBeenCalled();
  });

  it('不支持的枚举值会被拒绝', async () => {
    await expect(
      service.updateConfig({ serviceFeeMode: 'PER_KG' as never }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.updateConfig({ priceRoundingMode: 'FLOOR' as never }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.updateConfig({ shippingMode: 'FREE' as never }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
