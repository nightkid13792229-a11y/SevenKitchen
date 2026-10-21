import { OrderCenterService } from '../../../src/application/order-center/order-center.service';

function foodRow(overrides: any = {}) {
  return {
    id: 'f1',
    orderNo: 'FOOD-1',
    customerId: 'u1',
    status: 'IN_PRODUCTION',
    type: 'FRESH_FOOD',
    amountTotal: 100,
    createdAt: new Date('2026-10-19T00:00:00Z'),
    paidAt: new Date('2026-10-19T00:10:00Z'),
    shippedAt: null,
    completedAt: null,
    targetProductionDate: new Date('2026-10-21T00:00:00Z'),
    shippingAddressSnapshot: null,
    ...overrides,
  };
}

function supplementRow(overrides: any = {}) {
  return {
    id: 's1',
    orderNo: 'SP-1',
    userId: 'u1',
    status: 'PAID',
    amountTotal: 50,
    createdAt: new Date('2026-10-20T00:00:00Z'),
    paidAt: null,
    packingDate: new Date('2026-10-21T00:00:00Z'),
    shippedAt: null,
    completedAt: null,
    shippingAddressSnapshot: { recipientName: '收件人', phone: '13800000000' },
    ...overrides,
  };
}

describe('OrderCenterService', () => {
  const prisma: any = {
    order: { findMany: jest.fn(), count: jest.fn() },
    customRecipeOrder: { findMany: jest.fn(), count: jest.fn() },
    supplementOrder: { findMany: jest.fn(), count: jest.fn() },
    aftersaleCase: { findMany: jest.fn() },
    user: { findMany: jest.fn() },
  };
  let service: OrderCenterService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.order.findMany.mockResolvedValue([foodRow()]);
    prisma.order.count.mockResolvedValue(1);
    prisma.customRecipeOrder.findMany.mockResolvedValue([]);
    prisma.customRecipeOrder.count.mockResolvedValue(0);
    prisma.supplementOrder.findMany.mockResolvedValue([supplementRow()]);
    prisma.supplementOrder.count.mockResolvedValue(1);
    prisma.aftersaleCase.findMany.mockResolvedValue([]);
    prisma.user.findMany.mockResolvedValue([
      { id: 'u1', nickname: '张三', phone: '13800000000', role: 'CUSTOMER' },
    ]);
    service = new OrderCenterService(prisma);
  });

  it('合并三类订单并映射统一状态', async () => {
    const result = await service.list({ pageSize: 20 });

    expect(result.total).toBe(2);
    expect(result.items).toHaveLength(2);
    expect(result.items[0].type).toBe('SUPPLEMENT');
    expect(result.items[0].statusGroup).toBe('IN_PROGRESS');
    expect(result.items[0].scheduledDate).toBe('2026-10-21');
    expect(result.items[1].type).toBe('FOOD');
    expect(result.items[1].statusGroup).toBe('IN_PROGRESS');
    expect(result.items[1].customerName).toBe('张三');
  });

  it('员工端后端脱敏：金额为 null', async () => {
    const result = await service.list({ pageSize: 20 }, { role: 'STAFF' });
    expect(result.items.every((item) => item.amountTotal === null)).toBe(true);
  });

  it('补剂有未完结退款 → 标记退款中', async () => {
    prisma.aftersaleCase.findMany.mockResolvedValue([
      { orderId: 's1', requestType: 'REFUND' },
    ]);
    const result = await service.list({ pageSize: 20 });
    const supplement = result.items.find((item) => item.type === 'SUPPLEMENT');
    expect(supplement?.hasOpenAftersale).toBe(true);
    expect(supplement?.aftersaleLabel).toBe('退款中');
  });

  it('按顾客姓名搜索时把用户 ID 放进 OR，而不是和订单号 AND', async () => {
    await service.list({ pageSize: 20, keyword: '张三' });

    const where = prisma.order.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ customerId: { in: ['u1'] } }),
      ]),
    );
    expect(where.customerId).toBeUndefined();
  });

  it('只查补剂时不会碰鲜食/定制查询', async () => {
    const result = await service.list({
      type: 'SUPPLEMENT',
      pageSize: 20,
    });
    expect(result.items).toHaveLength(1);
    expect(prisma.order.findMany).not.toHaveBeenCalled();
    expect(prisma.customRecipeOrder.findMany).not.toHaveBeenCalled();
  });

  it('★ 每条订单都带 customerRole，内部账号可被后台标记', async () => {
    const result = await service.list({ pageSize: 20 });

    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items.every((item) => item.customerRole === 'CUSTOMER')).toBe(
      true,
    );
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ role: true }),
      }),
    );
  });

  it('★ 内部账号的订单映射为内部角色，不丢字段', async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: 'u1', nickname: '内部测试号', phone: '13900000000', role: 'ADMIN' },
    ]);

    const result = await service.list({ pageSize: 20 });

    expect(result.items).toHaveLength(2);
    for (const item of result.items) {
      expect(item.customerName).toBe('内部测试号');
      expect(item.customerRole).toBe('ADMIN');
    }
  });

  it('用户记录查不到时 customerRole 为 null，而不是报错', async () => {
    prisma.user.findMany.mockResolvedValue([]);

    const result = await service.list({ pageSize: 20 });

    expect(result.items.every((item) => item.customerRole === null)).toBe(true);
  });
});
