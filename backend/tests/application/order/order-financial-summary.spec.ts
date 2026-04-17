import { OrderService } from 'src/order.service';

describe('Order financial summary', () => {
  const createService = (prisma: any): OrderService =>
    new OrderService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      prisma as any,
    );

  it('returns estimated and actual order margin from the latest settlement', async () => {
    const prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'order-1',
          amountTotal: 120,
          pricingBreakdownSnapshot: {
            totalProductCost: 70,
            costIngredients: 50,
            costPackaging: 10,
            costLabor: 5,
            costOverhead: 5,
          },
          costSettlements: [
            {
              id: 'order-settlement-1',
              actualCost: 80,
              actualMargin: 40,
              suggestedAdjustmentAmount: -12,
              requiresCustomerPayment: false,
              plannedOutputG: 5000,
              actualOutputG: 4500,
              shortageG: 500,
              createdAt: new Date('2026-04-17T06:00:00.000Z'),
              productionBatchSettlement: {
                id: 'batch-settlement-1',
                productionBatchId: 'batch-1',
                settledAt: new Date('2026-04-17T06:00:00.000Z'),
              },
            },
          ],
        }),
      },
    };
    const service = createService(prisma);

    const summary = await service.getOrderFinancialSummary('order-1');

    expect(prisma.order.findUnique).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      include: {
        costSettlements: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            productionBatchSettlement: true,
          },
        },
      },
    });
    expect(summary).toEqual(
      expect.objectContaining({
        orderId: 'order-1',
        amountTotal: 120,
        revenue: 120,
        estimatedCost: 70,
        estimatedMargin: 50,
        actualCost: 80,
        actualMargin: 40,
        shortageAdjustmentAmount: -12,
        requiresCustomerPayment: false,
        settlementStatus: 'SETTLED',
      }),
    );
    expect(summary.latestSettlement).toEqual(
      expect.objectContaining({
        id: 'order-settlement-1',
        productionBatchId: 'batch-1',
        plannedOutputG: 5000,
        actualOutputG: 4500,
        shortageG: 500,
      }),
    );
  });
});
