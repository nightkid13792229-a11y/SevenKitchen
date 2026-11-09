jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));

import { InventoryHomeService } from 'src/application/inventory/inventory-home.service';

describe('InventoryHomeService', () => {
  it('aggregates balances, last movement and last stocktake in bulk', async () => {
    const prisma: any = {
      inventoryLedgerEntry: {
        groupBy: jest.fn().mockResolvedValue([
          { ingredientId: 'i1', _sum: { deltaG: 1200 } },
          { ingredientId: 'i2', _sum: { deltaG: 0 } },
        ]),
        findMany: jest.fn().mockResolvedValue([
          {
            ingredientId: 'i1',
            createdAt: new Date('2026-11-10T09:20:00.000Z'),
            deltaG: -300,
            sourceType: 'KITCHEN_TASK',
          },
        ]),
      },
      inventoryStocktake: {
        findFirst: jest.fn().mockResolvedValue({
          createdAt: new Date('2026-11-08T10:00:00.000Z'),
          appliedAt: new Date('2026-11-08T10:05:00.000Z'),
          status: 'APPLIED',
        }),
      },
    };
    const purchasing: any = {
      getStockReplenishmentIngredients: jest.fn().mockResolvedValue([
        { id: 'i1', stockStatus: 'NEEDS_REPLENISHMENT' },
        { id: 'i2', stockStatus: 'LOW_STOCK' },
        { id: 'i3', stockStatus: 'NO_POLICY' },
      ]),
    };

    const service = new InventoryHomeService(prisma, purchasing);
    const home = await service.getHome();

    expect(purchasing.getStockReplenishmentIngredients).toHaveBeenCalledWith(
      expect.objectContaining({
        includeDaily: true,
        balances: expect.any(Map),
      }),
    );
    const passed = purchasing.getStockReplenishmentIngredients.mock.calls[0][0];
    expect(passed.balances.get('i1')).toBe(1200);

    expect(home.summary).toEqual({
      needsReplenishment: 1,
      lowStock: 1,
      noPolicy: 1,
      lastStocktakeAt: '2026-11-08T10:05:00.000Z',
    });
    expect(home.items[0].lastMovement).toEqual({
      at: '2026-11-10T09:20:00.000Z',
      deltaBaseQuantity: -300,
      sourceLabel: '厨房领用',
    });
    expect(home.items[1].lastMovement).toBeNull();
  });
});
