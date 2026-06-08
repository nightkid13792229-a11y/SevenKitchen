jest.mock('uuid', () => ({
  v4: () => 'mock-uuid',
}));

import { AdminController } from '../../../src/interfaces/controllers/admin.controller';

describe('AdminController order customer dogs', () => {
  function createController(orderService: Record<string, any>) {
    return new AdminController(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      orderService as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
  }

  it('lists dogs owned by the order customer', async () => {
    const orderService = {
      listOrderCustomerDogs: jest.fn().mockResolvedValue([
        {
          id: 'dog-1',
          name: '七七',
          breedName: '柯基',
          currentWeightKg: 10.5,
          mealsPerDay: 2,
        },
      ]),
    };
    const controller = createController(orderService);

    const result = await (controller as any).listOrderCustomerDogs('order-1');

    expect(orderService.listOrderCustomerDogs).toHaveBeenCalledWith('order-1');
    expect(result.code).toBe(0);
    expect(result.data[0]).toMatchObject({
      id: 'dog-1',
      name: '七七',
      breedName: '柯基',
    });
  });

  it('switches the order dog to another dog owned by the same customer', async () => {
    const orderService = {
      switchOrderDog: jest
        .fn()
        .mockResolvedValue({ id: 'order-1', dogId: 'dog-2' }),
    };
    const controller = createController(orderService);

    const result = await (controller as any).switchOrderDog('order-1', {
      dogId: 'dog-2',
    });

    expect(orderService.switchOrderDog).toHaveBeenCalledWith('order-1', 'dog-2');
    expect(result.code).toBe(0);
    expect(result.data).toMatchObject({
      id: 'order-1',
      dogId: 'dog-2',
    });
  });

  it('updates an order item package plan for staff order corrections', async () => {
    const packagePlan = [
      { packageSpecG: 200, packageCount: 5 },
      { packageSpecG: 100, packageCount: 2 },
    ];
    const orderService = {
      updateOrderItemPackagePlan: jest.fn().mockResolvedValue({
        id: 'item-1',
        packagePlan,
      }),
    };
    const controller = createController(orderService);

    const result = await (controller as any).updateOrderItemPackagePlan(
      'order-1',
      'item-1',
      { packagePlan },
    );

    expect(orderService.updateOrderItemPackagePlan).toHaveBeenCalledWith(
      'order-1',
      'item-1',
      packagePlan,
    );
    expect(result.code).toBe(0);
    expect(result.data).toMatchObject({
      id: 'item-1',
      packagePlan,
    });
  });
});
