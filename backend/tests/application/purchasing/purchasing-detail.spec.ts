jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));

import { PurchasingService } from '../../../src/application/purchasing/purchasing.service';

describe('PurchasingService.getPurchaseListDetail', () => {
  const purchaseListRepository = {
    findById: jest.fn(),
    findSourceOrderSummaries: jest.fn(),
  };

  const service = new PurchasingService(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    purchaseListRepository as any,
    {} as any,
    {} as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('attaches order number, dog and recipe for the detail page', async () => {
    purchaseListRepository.findById.mockResolvedValue({
      id: 'list-1',
      sourceOrderIds: ['order-1', 'order-2'],
    });
    purchaseListRepository.findSourceOrderSummaries.mockResolvedValue([
      {
        id: 'order-1',
        orderNo: 'SK20261102-004',
        dogName: '皮蛋',
        recipeNames: ['鸭胸猪里脊鸡蛋青花鱼'],
      },
      {
        id: 'order-2',
        orderNo: 'SK20261102-005',
        dogName: '皮蛋',
        recipeNames: ['糙米红薯青花鱼牛肉'],
      },
    ]);

    const detail = await service.getPurchaseListDetail('list-1');

    expect(detail.sourceOrders).toHaveLength(2);
    expect(detail.sourceOrders[0]).toEqual({
      id: 'order-1',
      orderNo: 'SK20261102-004',
      dogName: '皮蛋',
      recipeNames: ['鸭胸猪里脊鸡蛋青花鱼'],
    });
    expect(purchaseListRepository.findSourceOrderSummaries).toHaveBeenCalledWith([
      'order-1',
      'order-2',
    ]);
  });
});
