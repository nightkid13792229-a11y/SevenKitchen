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
    dogId: 'd1',
    items: [
      { id: 'f1-item', recipeSnapshot: { id: 'r1', name: '鸡肉餐' } },
    ],
    ...overrides,
  };
}

function customRow(overrides: any = {}) {
  return {
    id: 'c1',
    orderId: 'CR-1',
    customerId: 'u1',
    status: 'IN_PROGRESS',
    amount: 299,
    createdAt: new Date('2026-10-21T00:00:00Z'),
    paymentConfirmedAt: new Date('2026-10-21T00:10:00Z'),
    deliveredAt: null,
    cancelledAt: null,
    isGift: false,
    recipeId: null,
    recipe: null,
    dogId: 'd1',
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
    customRecipeAftersale: { findMany: jest.fn() },
    orderItem: { findUnique: jest.fn() },
    dog: { findUnique: jest.fn() },
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
    prisma.customRecipeAftersale.findMany.mockResolvedValue([]);
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
      { orderId: 's1', status: 'PROCESSING', requestType: 'REFUND' },
    ]);
    const result = await service.list({ pageSize: 20 });
    const supplement = result.items.find((item) => item.type === 'SUPPLEMENT');
    expect(supplement?.hasOpenAftersale).toBe(true);
    expect(supplement?.aftersaleLabel).toBe('退款中');
  });

  it('★ 已结束的售后也要在订单中心看得见（退款成功会把订单改成已取消）', async () => {
    prisma.supplementOrder.findMany.mockResolvedValue([
      supplementRow({ status: 'CANCELLED' }),
    ]);
    prisma.aftersaleCase.findMany.mockResolvedValue([
      { orderId: 's1', status: 'RESOLVED', requestType: 'REFUND' },
    ]);

    const result = await service.list({
      type: 'SUPPLEMENT',
      pageSize: 20,
      aftersale: true,
    });

    const supplement = result.items.find((item) => item.type === 'SUPPLEMENT');
    expect(supplement).toBeTruthy();
    // 已结束不再是「退款中」，但要让员工知道这单退过款
    expect(supplement?.hasOpenAftersale).toBe(false);
    expect(supplement?.aftersaleLabel).toBe('售后已解决');

    // 筛选条件用的是「所有提过售后的订单」，不再只看未完结的
    const where = prisma.supplementOrder.findMany.mock.calls[0][0].where;
    expect(where.id).toEqual({ in: ['s1'] });
  });

  it('★ 已驳回的售后带灰标，且不会因为订单本身正常就消失', async () => {
    prisma.aftersaleCase.findMany.mockResolvedValue([
      { orderId: 's1', status: 'REJECTED', requestType: 'RESHIP' },
    ]);

    const result = await service.list({ type: 'SUPPLEMENT', pageSize: 20 });

    const supplement = result.items.find((item) => item.type === 'SUPPLEMENT');
    expect(supplement?.hasOpenAftersale).toBe(false);
    expect(supplement?.aftersaleLabel).toBe('售后已驳回');
  });

  it('★ 一单多条售后时，卡片只取最新那条', async () => {
    // 查询按 createdAt 倒序，所以数组第一条就是最新
    prisma.aftersaleCase.findMany.mockResolvedValue([
      { orderId: 's1', status: 'PROCESSING', requestType: 'RESHIP' },
      { orderId: 's1', status: 'REJECTED', requestType: 'REFUND' },
    ]);

    const result = await service.list({ type: 'SUPPLEMENT', pageSize: 20 });

    const supplement = result.items.find((item) => item.type === 'SUPPLEMENT');
    expect(supplement?.aftersaleLabel).toBe('售后中');
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

  it('★ 鲜食单带出 itemId / 下单快照的食谱 id / 狗狗 id', async () => {
    const result = await service.list({ pageSize: 20 });
    const food = result.items.find((item) => item.type === 'FOOD');

    expect(food?.itemId).toBe('f1-item');
    expect(food?.recipeId).toBe('r1');
    expect(food?.dogId).toBe('d1');
  });

  it('★ 补剂单没关联食谱/狗狗时两个 id 都是 null（前端就不显示入口）', async () => {
    const result = await service.list({ pageSize: 20 });
    const supplement = result.items.find((item) => item.type === 'SUPPLEMENT');

    expect(supplement?.recipeId).toBeNull();
    expect(supplement?.dogId).toBeNull();
  });

  it('★ 卡片主行显示食谱名：鲜食取快照名、补剂没绑食谱就为空', async () => {
    prisma.supplementOrder.findMany.mockResolvedValue([
      supplementRow({ recipeName: '关节养护' }),
    ]);

    const result = await service.list({ pageSize: 20 });
    const food = result.items.find((item) => item.type === 'FOOD');
    const supplement = result.items.find((item) => item.type === 'SUPPLEMENT');

    expect(food?.recipeName).toBe('鸡肉餐');
    expect(supplement?.recipeName).toBe('关节养护');

    prisma.supplementOrder.findMany.mockResolvedValue([supplementRow()]);
    const bare = await service.list({ pageSize: 20 });
    expect(
      bare.items.find((item) => item.type === 'SUPPLEMENT')?.recipeName,
    ).toBeNull();
  });

  it('★ 定制单的食谱名来自交付的食谱，未交付为空', async () => {
    prisma.customRecipeOrder.findMany.mockResolvedValue([
      customRow({ recipeId: 'r9', recipe: { name: '低脂护心餐' } }),
    ]);
    prisma.customRecipeOrder.count.mockResolvedValue(1);

    const result = await service.list({ pageSize: 20 });
    const custom = result.items.find((item) => item.type === 'CUSTOM_RECIPE');

    expect(custom?.recipeName).toBe('低脂护心餐');
  });

  it('★ 定制单交付前没有食谱可看，交付后才有', async () => {
    prisma.customRecipeOrder.findMany.mockResolvedValue([customRow()]);
    prisma.customRecipeOrder.count.mockResolvedValue(1);

    const before = await service.list({ pageSize: 20 });
    expect(
      before.items.find((item) => item.type === 'CUSTOM_RECIPE')?.recipeId,
    ).toBeNull();

    prisma.customRecipeOrder.findMany.mockResolvedValue([
      customRow({ recipeId: 'r9' }),
    ]);
    const after = await service.list({ pageSize: 20 });
    expect(
      after.items.find((item) => item.type === 'CUSTOM_RECIPE')?.recipeId,
    ).toBe('r9');
  });

  it('★ 只看售后时，定制的售后单必须被查出来（以前是 id in []，直接漏掉）', async () => {
    prisma.customRecipeAftersale.findMany.mockResolvedValue([
      { orderId: 'c1', status: 'PENDING' },
    ]);

    await service.list({ pageSize: 20, aftersale: true });

    const customWhere = prisma.customRecipeOrder.findMany.mock.calls[0][0].where;
    expect(customWhere.id).toEqual({ in: ['c1'] });
  });

  it('★ 定制售后未完结时，卡片上要有「售后处理中」标记', async () => {
    prisma.customRecipeOrder.findMany.mockResolvedValue([customRow()]);
    prisma.customRecipeOrder.count.mockResolvedValue(1);
    prisma.customRecipeAftersale.findMany.mockResolvedValue([
      { orderId: 'c1', status: 'PROCESSING' },
    ]);

    const result = await service.list({ pageSize: 20 });
    const custom = result.items.find((item) => item.type === 'CUSTOM_RECIPE');

    expect(custom?.hasOpenAftersale).toBe(true);
    expect(custom?.aftersaleLabel).toBe('售后处理中');
  });

  it('★ 员工端食谱快照按 itemId 直查，带订单与狗狗信息', async () => {
    prisma.orderItem.findUnique.mockResolvedValue({
      id: 'f1-item',
      orderId: 'f1',
      dogId: 'd1',
      quantityG: 1400,
      packageCount: 14,
      packageSpecG: 100,
      dailyIntakeG: 200,
      recipeSnapshot: { id: 'r1', name: '鸡肉餐', version: 3, items: [] },
      order: {
        orderNo: 'SK-1',
        createdAt: new Date('2026-10-30T06:30:00Z'),
        targetProductionDate: new Date('2026-10-31T00:00:00Z'),
        customer: { nickname: '张三' },
      },
    });
    prisma.dog.findUnique.mockResolvedValue({ id: 'd1', name: '旺财' });

    const data = await service.getItemSnapshot('f1-item');

    expect(data?.orderNo).toBe('SK-1');
    expect(data?.customerName).toBe('张三');
    expect(data?.dog).toEqual({ id: 'd1', name: '旺财' });
    expect(data?.targetProductionDate).toBe('2026-10-31');
    expect((data?.snapshot as any).version).toBe(3);
  });

  it('itemId 不存在时返回 null，不抛异常', async () => {
    prisma.orderItem.findUnique.mockResolvedValue(null);

    await expect(service.getItemSnapshot('nope')).resolves.toBeNull();
  });
});
