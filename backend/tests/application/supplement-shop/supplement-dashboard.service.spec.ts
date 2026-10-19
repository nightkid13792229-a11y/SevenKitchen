import { SupplementDashboardService } from '../../../src/application/supplement-shop/supplement-dashboard.service';

describe('SupplementDashboardService', () => {
  const prisma: any = {
    supplementOrder: {
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    aftersaleCase: {
      count: jest.fn(),
      aggregate: jest.fn(),
    },
    supplementShopConfig: { findUnique: jest.fn() },
  };
  let service: SupplementDashboardService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.supplementOrder.count
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(6);
    prisma.aftersaleCase.count.mockResolvedValue(1);
    prisma.aftersaleCase.aggregate.mockResolvedValue({
      _sum: { refundAmount: 88.5 },
    });
    prisma.supplementOrder.groupBy.mockResolvedValue([
      { status: 'PAID', _count: { _all: 2 } },
      { status: 'PACKED', _count: { _all: 6 } },
    ]);
    prisma.supplementShopConfig.findUnique.mockResolvedValue({
      dailyCutoffTime: '17:00',
      dailyPackingCapacity: 30,
      autoScheduleEnabled: true,
    });
    service = new SupplementDashboardService(prisma);
  });

  it('返回今日/待排/待发/售后/本月退款', async () => {
    const result = await service.getDashboard({ role: 'ADMIN' });
    expect(result.todayCreated).toBe(5);
    expect(result.todayPaid).toBe(4);
    expect(result.pendingSchedule).toBe(2);
    expect(result.todayPacking).toBe(3);
    expect(result.toShip).toBe(6);
    expect(result.openAftersale).toBe(1);
    expect(result.refundAmountMonth).toBe(88.5);
    expect(result.byStatus.PACKED).toBe(6);
  });

  it('员工看板不返回退款金额', async () => {
    const result = await service.getDashboard({ role: 'STAFF' });
    expect(result.refundAmountMonth).toBeNull();
  });
});
