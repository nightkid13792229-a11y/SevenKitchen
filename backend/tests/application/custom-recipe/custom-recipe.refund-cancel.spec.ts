import { CustomRecipeService } from '../../../src/application/custom-recipe/custom-recipe.service';
import { PrismaService } from '../../../src/infrastructure/prisma.service';
import { TencentCosService } from '../../../src/infrastructure/services/tencent-cos.service';
import { CustomRecipeConfigService } from '../../../src/application/custom-recipe/custom-recipe-config.service';
import { CustomRecipePricingService } from '../../../src/application/custom-recipe/custom-recipe-pricing.service';

describe('CustomRecipeService · 退款成功后自动停单', () => {
  function createService(status: string) {
    const order = {
      id: 'order-pk-1',
      orderId: 'CR202610260001',
      status,
      scheduledDate: new Date('2026-10-28T00:00:00.000Z'),
      recipeQuantity: 2,
      amount: 598,
    };
    const tx = {
      customRecipeOrder: {
        update: jest.fn().mockResolvedValue(order),
      },
      customRecipeSchedule: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      customRecipeOrder: {
        findFirst: jest.fn().mockResolvedValue(order),
        findUnique: jest.fn().mockResolvedValue(order),
      },
      $transaction: jest.fn(async (cb: any) => cb(tx)),
    };
    const service = new CustomRecipeService(
      prisma as unknown as PrismaService,
      {} as TencentCosService,
      {} as CustomRecipeConfigService,
      {} as CustomRecipePricingService,
    );
    return { service, prisma, tx, order };
  }

  it('★ 制作中退款成功：订单取消、按份数释放排期、金额取订单实付', async () => {
    const { service, tx } = createService('IN_PROGRESS');

    const result = await service.cancelOrderAfterRefund('order-pk-1', {
      outRefundNo: 'CRR1',
      refundId: 'wx-refund-1',
      refundedAt: new Date('2026-10-26T04:00:00.000Z'),
    });

    expect(result.cancelled).toBe(true);
    expect(tx.customRecipeOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'order-pk-1' },
        data: expect.objectContaining({
          status: 'CANCELLED',
          refundStatus: 'SUCCESS',
          refundAmount: 598,
          refundOutNo: 'CRR1',
        }),
      }),
    );
    expect(tx.customRecipeSchedule.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { bookedCount: { decrement: 2 } },
      }),
    );
  });

  it('★ 已交付退款成功：只记退款，不取消订单、不释放排期', async () => {
    const { service, tx } = createService('DELIVERED');

    const result = await service.cancelOrderAfterRefund('order-pk-1', {
      outRefundNo: 'CRR1',
    });

    expect(result.cancelled).toBe(false);
    expect(tx.customRecipeOrder.update).not.toHaveBeenCalled();
    expect(tx.customRecipeSchedule.updateMany).not.toHaveBeenCalled();
  });
});
