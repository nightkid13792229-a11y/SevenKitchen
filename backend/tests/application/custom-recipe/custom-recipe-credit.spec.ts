import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CustomRecipeService } from '../../../src/application/custom-recipe/custom-recipe.service';
import { CustomRecipeConfigService } from '../../../src/application/custom-recipe/custom-recipe-config.service';
import { PrismaService } from '../../../src/infrastructure/prisma.service';
import { TencentCosService } from '../../../src/infrastructure/services/tencent-cos.service';

/**
 * 定制费抵扣额度台账（2026-09-25）。
 *
 * 这是"钱"的台账，四个不变量必须锁死：
 *   1. 只有**付款之后**的定制单才有额度；
 *   2. 额度绑定它产出的那道定制食谱；
 *   3. 怎么算都不会**扣超**、也不会**还超**（并发下同样成立）；
 *   4. 余额可以结转，且按分对齐不出现浮点尾巴。
 */
describe('CustomRecipeService · 抵扣额度台账', () => {
  let service: CustomRecipeService;

  const mockPrismaService = {
    customRecipeOrder: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    recipe: {
      findFirst: jest.fn(),
    },
  } as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomRecipeService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: TencentCosService, useValue: {} },
        {
          provide: CustomRecipeConfigService,
          useValue: {
            getConfig: jest.fn().mockResolvedValue({ paymentTimeoutMinutes: 30 }),
          },
        },
      ],
    }).compile();

    service = module.get(CustomRecipeService);
    jest.clearAllMocks();
    // 默认查不到对应食谱：多数用例关心的是定制单侧的匹配逻辑
    mockPrismaService.recipe.findFirst.mockResolvedValue(null);
  });

  describe('findUsableCredit · 食谱 ID 归一化', () => {
    // 下单链路传的是「业务食谱号」（Recipe.recipeId），
    // 而定制单上存的是「食谱主键」（Recipe.id，因为它有指向 recipe 表的外键）。
    // 不归一化的话两边永远匹配不上，抵扣会静默失效。
    it('把业务食谱号解析成主键后再匹配定制单', async () => {
      mockPrismaService.recipe.findFirst.mockResolvedValue({
        id: 'recipe-pk-1',
      });
      mockPrismaService.customRecipeOrder.findFirst.mockResolvedValue({
        id: 'cr-uuid-1',
        orderId: 'CR1',
        creditAmount: 300,
        creditUsed: 0,
      });

      const result = await service.findUsableCredit({
        customerId: 'user-1',
        recipeId: 'recipe-business-1',
      });

      expect(mockPrismaService.recipe.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { recipeId: 'recipe-business-1' },
        }),
      );
      expect(
        mockPrismaService.customRecipeOrder.findFirst,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            recipeId: { in: ['recipe-pk-1', 'recipe-business-1'] },
          }),
        }),
      );
      expect(result?.remaining).toBe(300);
    });

    it('查不到食谱记录时退回用传入的 ID 匹配（兼容直接传主键）', async () => {
      mockPrismaService.recipe.findFirst.mockResolvedValue(null);
      mockPrismaService.customRecipeOrder.findFirst.mockResolvedValue(null);

      await service.findUsableCredit({
        customerId: 'user-1',
        recipeId: 'recipe-pk-direct',
      });

      expect(
        mockPrismaService.customRecipeOrder.findFirst,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            recipeId: { in: ['recipe-pk-direct'] },
          }),
        }),
      );
    });
  });

  describe('findUsableCredit', () => {
    it('没定制过就返回 null', async () => {
      mockPrismaService.customRecipeOrder.findFirst.mockResolvedValue(null);

      const result = await service.findUsableCredit({
        customerId: 'user-1',
        recipeId: 'recipe-1',
      });

      expect(result).toBeNull();
    });

    it('只认已付款/制作中/已交付的定制单', async () => {
      mockPrismaService.customRecipeOrder.findFirst.mockResolvedValue(null);

      await service.findUsableCredit({
        customerId: 'user-1',
        recipeId: 'recipe-1',
      });

      expect(
        mockPrismaService.customRecipeOrder.findFirst,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { in: ['PAID', 'IN_PROGRESS', 'DELIVERED'] },
          }),
        }),
      );
    });

    it('额度必须绑定这一道定制食谱', async () => {
      mockPrismaService.customRecipeOrder.findFirst.mockResolvedValue(null);

      await service.findUsableCredit({
        customerId: 'user-1',
        recipeId: 'recipe-1',
      });

      expect(
        mockPrismaService.customRecipeOrder.findFirst,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            customerId: 'user-1',
            // 归一化后是按候选集合匹配（业务食谱号 + 食谱主键）
            recipeId: { in: ['recipe-1'] },
          }),
        }),
      );
    });

    it('返回剩余额度（总额 − 已用）', async () => {
      mockPrismaService.customRecipeOrder.findFirst.mockResolvedValue({
        id: 'cr-uuid-1',
        orderId: 'CR1',
        creditAmount: 300,
        creditUsed: 120.5,
      });

      const result = await service.findUsableCredit({
        customerId: 'user-1',
        recipeId: 'recipe-1',
      });

      expect(result).toEqual({
        customRecipeOrderId: 'cr-uuid-1',
        orderId: 'CR1',
        remaining: 179.5,
      });
    });

    it('已经用完就返回 null（不再产生抵扣）', async () => {
      mockPrismaService.customRecipeOrder.findFirst.mockResolvedValue({
        id: 'cr-uuid-1',
        orderId: 'CR1',
        creditAmount: 300,
        creditUsed: 300,
      });

      const result = await service.findUsableCredit({
        customerId: 'user-1',
        recipeId: 'recipe-1',
      });

      expect(result).toBeNull();
    });
  });

  describe('consumeCredit', () => {
    beforeEach(() => {
      mockPrismaService.customRecipeOrder.findFirst.mockResolvedValue({
        id: 'cr-uuid-1',
        orderId: 'CR1',
      });
    });

    it('剩余额度不够时只扣剩下的（余额不会变成负数）', async () => {
      mockPrismaService.customRecipeOrder.findUnique.mockResolvedValue({
        creditAmount: 300,
        creditUsed: 250,
        status: 'PAID',
      });
      mockPrismaService.customRecipeOrder.updateMany.mockResolvedValue({
        count: 1,
      });

      const result = await service.consumeCredit({
        orderIdOrId: 'CR1',
        amount: 300,
      });

      expect(result).toEqual({ consumed: 50, remaining: 0 });
      expect(mockPrismaService.customRecipeOrder.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { creditUsed: 300 } }),
      );
    });

    it('额度已用完时不产生抵扣', async () => {
      mockPrismaService.customRecipeOrder.findUnique.mockResolvedValue({
        creditAmount: 300,
        creditUsed: 300,
        status: 'PAID',
      });

      const result = await service.consumeCredit({
        orderIdOrId: 'CR1',
        amount: 100,
      });

      expect(result).toEqual({ consumed: 0, remaining: 0 });
      expect(mockPrismaService.customRecipeOrder.updateMany).not.toHaveBeenCalled();
    });

    it('未付款的定制单不允许抵扣', async () => {
      mockPrismaService.customRecipeOrder.findUnique.mockResolvedValue({
        creditAmount: 300,
        creditUsed: 0,
        status: 'PENDING_PAYMENT',
      });

      await expect(
        service.consumeCredit({ orderIdOrId: 'CR1', amount: 100 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('并发下用 CAS 重试，最终只扣一次', async () => {
      mockPrismaService.customRecipeOrder.findUnique.mockResolvedValue({
        creditAmount: 300,
        creditUsed: 0,
        status: 'PAID',
      });
      // 第一次条件更新被别人抢先改掉（命中 0 行），第二次成功
      mockPrismaService.customRecipeOrder.updateMany
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 1 });

      const result = await service.consumeCredit({
        orderIdOrId: 'CR1',
        amount: 300,
      });

      expect(result).toEqual({ consumed: 300, remaining: 0 });
      expect(mockPrismaService.customRecipeOrder.updateMany).toHaveBeenCalledTimes(2);
    });

    it('多次抢不到时明确报冲突，而不是静默少扣', async () => {
      mockPrismaService.customRecipeOrder.findUnique.mockResolvedValue({
        creditAmount: 300,
        creditUsed: 0,
        status: 'PAID',
      });
      mockPrismaService.customRecipeOrder.updateMany.mockResolvedValue({
        count: 0,
      });

      await expect(
        service.consumeCredit({ orderIdOrId: 'CR1', amount: 100 }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('金额按分对齐，不产生浮点尾巴', async () => {
      mockPrismaService.customRecipeOrder.findUnique.mockResolvedValue({
        creditAmount: 300,
        creditUsed: 0.1,
        status: 'PAID',
      });
      mockPrismaService.customRecipeOrder.updateMany.mockResolvedValue({
        count: 1,
      });

      const result = await service.consumeCredit({
        orderIdOrId: 'CR1',
        amount: 0.2,
      });

      expect(result.remaining).toBe(299.7);
      expect(mockPrismaService.customRecipeOrder.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { creditUsed: 0.3 } }),
      );
    });
  });

  describe('restoreCredit（后台人工恢复）', () => {
    beforeEach(() => {
      mockPrismaService.customRecipeOrder.findFirst.mockResolvedValue({
        id: 'cr-uuid-1',
        orderId: 'CR1',
      });
    });

    it('不传金额时把已用的全部还回去', async () => {
      mockPrismaService.customRecipeOrder.findUnique.mockResolvedValue({
        creditAmount: 300,
        creditUsed: 300,
      });
      mockPrismaService.customRecipeOrder.updateMany.mockResolvedValue({
        count: 1,
      });

      const result = await service.restoreCredit({ orderIdOrId: 'CR1' });

      expect(result).toEqual({ restored: 300, remaining: 300 });
      expect(mockPrismaService.customRecipeOrder.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { creditUsed: 0 } }),
      );
    });

    it('传入金额大于已用时只还已用的部分（不会还超）', async () => {
      mockPrismaService.customRecipeOrder.findUnique.mockResolvedValue({
        creditAmount: 300,
        creditUsed: 120,
      });
      mockPrismaService.customRecipeOrder.updateMany.mockResolvedValue({
        count: 1,
      });

      const result = await service.restoreCredit({
        orderIdOrId: 'CR1',
        amount: 999,
      });

      expect(result).toEqual({ restored: 120, remaining: 300 });
    });

    it('没被用过的额度，恢复是空操作', async () => {
      mockPrismaService.customRecipeOrder.findUnique.mockResolvedValue({
        creditAmount: 300,
        creditUsed: 0,
      });

      const result = await service.restoreCredit({ orderIdOrId: 'CR1' });

      expect(result).toEqual({ restored: 0, remaining: 300 });
      expect(mockPrismaService.customRecipeOrder.updateMany).not.toHaveBeenCalled();
    });

    it('恢复金额为负时按 0 处理，不放大额度', async () => {
      mockPrismaService.customRecipeOrder.findUnique.mockResolvedValue({
        creditAmount: 300,
        creditUsed: 100,
      });

      const result = await service.restoreCredit({
        orderIdOrId: 'CR1',
        amount: -50,
      });

      expect(result).toEqual({ restored: 0, remaining: 200 });
      expect(mockPrismaService.customRecipeOrder.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('getCreditSummary', () => {
    it('返回总额/已用/剩余，供后台展示', async () => {
      mockPrismaService.customRecipeOrder.findFirst.mockResolvedValue({
        id: 'cr-uuid-1',
        orderId: 'CR1',
      });
      mockPrismaService.customRecipeOrder.findUnique.mockResolvedValue({
        orderId: 'CR1',
        creditAmount: 300,
        creditUsed: 180,
      });

      const summary = await service.getCreditSummary('CR1');

      expect(summary).toEqual({
        orderId: 'CR1',
        creditAmount: 300,
        creditUsed: 180,
        creditRemaining: 120,
      });
    });
  });
});
