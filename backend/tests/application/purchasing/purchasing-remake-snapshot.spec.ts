/**
 * 重做单的采购取数
 *
 * 重做单是 0 元单，没有自己的定价快照；它是「同样的东西再做一份」，
 * 采购必须复用原单的原料明细，否则整单漏算。
 */
import { PurchasingService } from '../../../src/application/purchasing/purchasing.service';

jest.mock('uuid', () => ({
  v4: () => 'test-uuid',
}));

function buildService(orderRepository: any) {
  return new PurchasingService(
    orderRepository,
    { append: jest.fn() } as any,
    { findByIds: jest.fn().mockResolvedValue([]) } as any,
    { recommend: jest.fn() } as any,
    { getAvailabilityByIngredientIds: jest.fn().mockResolvedValue(new Map()) } as any,
    { batchFindActive: jest.fn().mockResolvedValue({}) } as any,
    { findMany: jest.fn() } as any,
    { create: jest.fn() } as any,
    undefined as any,
  );
}

describe('PurchasingService · 重做单取数', () => {
  it('重做单没有自己的定价快照时，复用原单的原料明细', async () => {
    const originalBreakdown = {
      ingredientDetails: [
        { ingredientId: 'ing-pork', name: '猪里脊', amount: 0.32 },
      ],
    };
    const orderRepository = {
      findById: jest.fn().mockResolvedValue({
        id: 'original-order',
        pricingBreakdownSnapshot: originalBreakdown,
      }),
    };
    const service = buildService(orderRepository);

    const breakdown = await (service as any).resolveOrderPricingBreakdown({
      id: 'remake-order',
      pricingBreakdownSnapshot: null,
      remakeFromOrderId: 'original-order',
    });

    expect(orderRepository.findById).toHaveBeenCalledWith('original-order');
    expect(breakdown).toBe(originalBreakdown);
  });

  it('普通订单直接用自己的快照，不去查原单', async () => {
    const ownBreakdown = { ingredientDetails: [] };
    const orderRepository = { findById: jest.fn() };
    const service = buildService(orderRepository);

    const breakdown = await (service as any).resolveOrderPricingBreakdown({
      id: 'normal-order',
      pricingBreakdownSnapshot: ownBreakdown,
      remakeFromOrderId: null,
    });

    expect(breakdown).toBe(ownBreakdown);
    expect(orderRepository.findById).not.toHaveBeenCalled();
  });

  it('原单也找不到快照时返回 null（保持跳过的旧行为，并记警告）', async () => {
    const orderRepository = {
      findById: jest.fn().mockResolvedValue({ id: 'original-order' }),
    };
    const service = buildService(orderRepository);

    const breakdown = await (service as any).resolveOrderPricingBreakdown({
      id: 'remake-order',
      pricingBreakdownSnapshot: null,
      remakeFromOrderId: 'original-order',
    });

    expect(breakdown).toBeNull();
  });
});
