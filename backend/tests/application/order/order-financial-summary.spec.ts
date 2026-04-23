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
          settlementAdjustments: [
            {
              id: 'settled-refund-1',
              sourceType: 'MANUAL',
              sourceId: 'settled-refund-1',
              adjustmentType: 'REFUND',
              amount: -5,
              reason: '已退小额差价',
              status: 'SETTLED',
              requiresCustomerPayment: false,
              visibleToCustomer: true,
              createdBy: 'admin',
              createdById: 'admin-1',
              metadata: null,
              settledAt: new Date('2026-04-17T08:00:00.000Z'),
              createdAt: new Date('2026-04-17T07:30:00.000Z'),
              updatedAt: new Date('2026-04-17T08:00:00.000Z'),
            },
            {
              id: 'manual-extra-1',
              sourceType: 'MANUAL',
              sourceId: 'manual-extra-1',
              adjustmentType: 'EXTRA_PAYMENT',
              amount: 20,
              reason: '补收特殊包材差价',
              status: 'PENDING',
              requiresCustomerPayment: true,
              visibleToCustomer: true,
              createdBy: 'admin',
              createdById: 'admin-1',
              metadata: null,
              settledAt: null,
              createdAt: new Date('2026-04-17T07:00:00.000Z'),
              updatedAt: new Date('2026-04-17T07:00:00.000Z'),
            },
            {
              id: 'refund-1',
              sourceType: 'PRODUCTION_SHORTAGE',
              sourceId: 'order-settlement-1',
              adjustmentType: 'REFUND',
              amount: -12,
              reason: '生产成品缺口 500g，建议退差价',
              status: 'PENDING',
              requiresCustomerPayment: false,
              visibleToCustomer: true,
              createdBy: 'system',
              createdById: null,
              metadata: null,
              settledAt: null,
              createdAt: new Date('2026-04-17T06:00:00.000Z'),
              updatedAt: new Date('2026-04-17T06:00:00.000Z'),
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
        settlementAdjustments: {
          orderBy: { createdAt: 'desc' },
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
        requiresCustomerPayment: true,
        settlementStatus: 'SETTLED',
      }),
    );
    expect(summary.adjustmentSummary).toEqual({
      totalIncreaseAmount: 20,
      totalDecreaseAmount: 17,
      pendingExtraPaymentAmount: 20,
      pendingRefundAmount: 12,
      settledExtraPaymentAmount: 0,
      settledRefundAmount: 5,
      netAdjustmentAmount: 3,
      netRevenue: 123,
    });
    expect(summary.adjustments).toEqual([
      expect.objectContaining({
        id: 'settled-refund-1',
        amount: -5,
        status: 'SETTLED',
      }),
      expect.objectContaining({
        id: 'manual-extra-1',
        amount: 20,
        status: 'PENDING',
        requiresCustomerPayment: true,
      }),
      expect.objectContaining({
        id: 'refund-1',
        amount: -12,
        status: 'PENDING',
      }),
    ]);
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

  it('creates multiple manual settlement adjustments without changing the order amount', async () => {
    const prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'order-1',
          amountTotal: 120,
        }),
      },
      orderSettlementAdjustment: {
        create: jest.fn().mockResolvedValue({
          id: 'manual-adjustment-1',
          orderId: 'order-1',
          sourceType: 'MANUAL',
          sourceId: 'manual-adjustment-1',
          adjustmentType: 'EXTRA_PAYMENT',
          amount: 15,
          reason: '补收定制分装差价',
          status: 'PENDING',
          requiresCustomerPayment: true,
          visibleToCustomer: true,
          createdBy: 'admin',
          createdById: 'admin-1',
          metadata: null,
          settledAt: null,
          createdAt: new Date('2026-04-17T09:00:00.000Z'),
          updatedAt: new Date('2026-04-17T09:00:00.000Z'),
        }),
      },
    };
    const service = createService(prisma);

    const adjustment = await service.createOrderSettlementAdjustment({
      orderId: 'order-1',
      amount: 15,
      reason: '补收定制分装差价',
      createdBy: 'admin',
      createdById: 'admin-1',
    });

    expect(prisma.order.findUnique).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      select: { id: true, amountTotal: true },
    });
    expect(prisma.orderSettlementAdjustment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderId: 'order-1',
          sourceType: 'MANUAL',
          adjustmentType: 'EXTRA_PAYMENT',
          amount: 15,
          reason: '补收定制分装差价',
          status: 'PENDING',
          requiresCustomerPayment: true,
          visibleToCustomer: true,
          createdBy: 'admin',
          createdById: 'admin-1',
        }),
      }),
    );
    expect(adjustment).toEqual(
      expect.objectContaining({
        id: 'manual-adjustment-1',
        amount: 15,
        status: 'PENDING',
        requiresCustomerPayment: true,
      }),
    );
  });
});
