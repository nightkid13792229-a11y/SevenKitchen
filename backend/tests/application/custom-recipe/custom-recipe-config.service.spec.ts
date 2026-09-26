import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  CustomRecipeConfigService,
  CUSTOM_RECIPE_CONFIG_ID,
} from '../../../src/application/custom-recipe/custom-recipe-config.service';
import { PrismaService } from '../../../src/infrastructure/prisma.service';

function buildRow(overrides: Record<string, unknown> = {}) {
  return {
    id: CUSTOM_RECIPE_CONFIG_ID,
    feeAmount: 300,
    creditAmount: 300,
    deliveryWorkDays: 3,
    dailyCapacity: 4,
    paymentTimeoutMinutes: 30,
    createdAt: new Date('2026-09-25T00:00:00Z'),
    updatedAt: new Date('2026-09-25T00:00:00Z'),
    ...overrides,
  };
}

describe('CustomRecipeConfigService', () => {
  let service: CustomRecipeConfigService;

  const mockPrismaService = {
    customRecipeConfig: {
      findUnique: jest.fn(),
      create: jest.fn(),
      upsert: jest.fn(),
    },
  } as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomRecipeConfigService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get(CustomRecipeConfigService);
    jest.clearAllMocks();
  });

  describe('getConfig', () => {
    it('creates the singleton with defaults on first access', async () => {
      mockPrismaService.customRecipeConfig.findUnique.mockResolvedValue(null);
      mockPrismaService.customRecipeConfig.create.mockResolvedValue(
        buildRow(),
      );

      const config = await service.getConfig();

      expect(mockPrismaService.customRecipeConfig.create).toHaveBeenCalledWith({
        data: { id: CUSTOM_RECIPE_CONFIG_ID },
      });
      expect(config.feeAmount).toBe(300);
      expect(config.creditAmount).toBe(300);
      expect(config.deliveryWorkDays).toBe(3);
      expect(config.dailyCapacity).toBe(4);
      expect(config.paymentTimeoutMinutes).toBe(30);
    });

    it('coerces Prisma Decimal values to numbers', async () => {
      mockPrismaService.customRecipeConfig.findUnique.mockResolvedValue(
        buildRow({ feeAmount: '300.5', creditAmount: '199.9' }),
      );

      const config = await service.getConfig();

      expect(config.feeAmount).toBe(300.5);
      expect(config.creditAmount).toBe(199.9);
    });
  });

  describe('getPublicConfig', () => {
    it('only exposes the fields the mini program needs', async () => {
      mockPrismaService.customRecipeConfig.findUnique.mockResolvedValue(
        buildRow({ feeAmount: 300, creditAmount: 200, dailyCapacity: 7 }),
      );

      const config = await service.getPublicConfig();

      expect(config).toEqual({
        feeAmount: 300,
        creditAmount: 200,
        deliveryWorkDays: 3,
      });
      // 内部产能参数不得对外暴露
      expect(config).not.toHaveProperty('dailyCapacity');
      expect(config).not.toHaveProperty('paymentTimeoutMinutes');
    });
  });

  describe('updateConfig', () => {
    it('rejects a credit amount above the fee', async () => {
      mockPrismaService.customRecipeConfig.findUnique.mockResolvedValue(
        buildRow({ feeAmount: 300, creditAmount: 300 }),
      );

      await expect(
        service.updateConfig({ creditAmount: 500 }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockPrismaService.customRecipeConfig.upsert).not.toHaveBeenCalled();
    });

    it('compares the credit against the fee submitted in the same request', async () => {
      // 同一次提交里把定制费降到 100、可抵扣仍写 300 —— 必须被拒，
      // 只拿单边比较会漏判这一种。
      mockPrismaService.customRecipeConfig.findUnique.mockResolvedValue(
        buildRow({ feeAmount: 300, creditAmount: 300 }),
      );

      await expect(
        service.updateConfig({ feeAmount: 100, creditAmount: 300 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('allows lowering both the fee and the credit together', async () => {
      mockPrismaService.customRecipeConfig.findUnique.mockResolvedValue(
        buildRow({ feeAmount: 300, creditAmount: 300 }),
      );
      mockPrismaService.customRecipeConfig.upsert.mockResolvedValue(
        buildRow({ feeAmount: 100, creditAmount: 0 }),
      );

      const config = await service.updateConfig({
        feeAmount: 100,
        creditAmount: 0,
      });

      expect(config.feeAmount).toBe(100);
      expect(config.creditAmount).toBe(0);
    });

    it('accepts credit equal to the fee', async () => {
      mockPrismaService.customRecipeConfig.findUnique.mockResolvedValue(
        buildRow({ feeAmount: 300, creditAmount: 300 }),
      );
      mockPrismaService.customRecipeConfig.upsert.mockResolvedValue(
        buildRow({ feeAmount: 399, creditAmount: 399 }),
      );

      await expect(
        service.updateConfig({ feeAmount: 399, creditAmount: 399 }),
      ).resolves.toMatchObject({ feeAmount: 399, creditAmount: 399 });
    });

    it('rejects a negative fee or credit', async () => {
      mockPrismaService.customRecipeConfig.findUnique.mockResolvedValue(
        buildRow(),
      );

      await expect(
        service.updateConfig({ feeAmount: -1 }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.updateConfig({ creditAmount: -1 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an out-of-range delivery work days value', async () => {
      mockPrismaService.customRecipeConfig.findUnique.mockResolvedValue(
        buildRow(),
      );

      await expect(
        service.updateConfig({ deliveryWorkDays: 0 }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.updateConfig({ deliveryWorkDays: 61 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an out-of-range daily capacity', async () => {
      mockPrismaService.customRecipeConfig.findUnique.mockResolvedValue(
        buildRow(),
      );

      await expect(
        service.updateConfig({ dailyCapacity: 0 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('accepts payment timeout 0 as "do not auto close"', async () => {
      mockPrismaService.customRecipeConfig.findUnique.mockResolvedValue(
        buildRow(),
      );
      mockPrismaService.customRecipeConfig.upsert.mockResolvedValue(
        buildRow({ paymentTimeoutMinutes: 0 }),
      );

      const config = await service.updateConfig({ paymentTimeoutMinutes: 0 });

      expect(config.paymentTimeoutMinutes).toBe(0);
    });

    it('rejects a payment timeout beyond 24 hours', async () => {
      mockPrismaService.customRecipeConfig.findUnique.mockResolvedValue(
        buildRow(),
      );

      await expect(
        service.updateConfig({ paymentTimeoutMinutes: 1441 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
