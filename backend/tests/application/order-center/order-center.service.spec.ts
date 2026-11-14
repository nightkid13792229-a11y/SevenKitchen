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
    dog: { name: '旺财' },
    items: [
      {
        id: 'f1-item',
        recipeSnapshot: { id: 'r1', name: '鸡肉餐' },
        packageCount: 4,
        packageSpecG: 250,
        packagePlan: [{ packageSpecG: 250, packageCount: 4 }],
      },
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
    // 2026-11-08：补剂付了钱就能发货 → 统一组归「待发货」，卡片写「待发货」
    expect(result.items[0].statusGroup).toBe('TO_SHIP');
    expect(result.items[0].statusLabel).toBe('待发货');
    expect(result.items[0].stageLabel).toBe('待发货');
    expect(result.items[0].scheduledDate).toBe('2026-10-21');
    expect(result.items[1].type).toBe('FOOD');
    expect(result.items[1].statusGroup).toBe('IN_PROGRESS');
    // 鲜食不再统一写「处理中」，按真实阶段显示「生产中」
    expect(result.items[1].stageLabel).toBe('生产中');
    expect(result.items[1].customerName).toBe('张三');
  });

  it('★ 鲜食读模型带分装规格（卡片显示「4袋×250g」），其余两类为 null', async () => {
    const result = await service.list({ pageSize: 20 });

    const food = result.items.find((item) => item.type === 'FOOD');
    expect(food?.packageCount).toBe(4);
    expect(food?.packageSpecG).toBe(250);
    expect(food?.packagePlan).toEqual([{ packageSpecG: 250, packageCount: 4 }]);

    // 定制 / 补剂没有分装这回事，必须是 null，前端据此不显示规格
    const supplement = result.items.find((item) => item.type === 'SUPPLEMENT');
    expect(supplement?.packagePlan).toBeNull();
    expect(supplement?.packageCount).toBeNull();
  });

  it('鲜食查询把分装字段一起 select（否则卡片拿不到规格）', async () => {
    await service.list({ type: 'FOOD', pageSize: 20 });

    const itemsSelect = prisma.order.findMany.mock.calls[0][0].select.items;
    expect(itemsSelect.select).toMatchObject({
      packageCount: true,
      packageSpecG: true,
      packagePlan: true,
    });
  });

  it('★ 待发货 + 关键词：状态和关键词各占一个 AND 分支，count 与列表同口径', async () => {
    await service.list({
      type: 'FOOD',
      status: 'TO_SHIP',
      keyword: '旺财',
      pageSize: 20,
    });

    const listWhere = prisma.order.findMany.mock.calls[0][0].where;
    const countWhere = prisma.order.count.mock.calls[0][0].where;

    expect(listWhere.AND).toHaveLength(2);
    expect(listWhere.AND[0]).toEqual({
      OR: [{ status: 'FREEZING' }, { status: 'PAID', type: 'TASTING_PACK' }],
    });
    // 分页总数必须和列表完全同条件，否则会出现“第 2 页是空的”
    expect(countWhere).toEqual(listWhere);
  });

  it('★ 试吃装 PAID 进「待发货」，卡片写待发货，能走发货（2026-11-10）', async () => {
    prisma.order.findMany.mockResolvedValue([
      foodRow({
        id: 't1',
        orderNo: 'TP-1',
        type: 'TASTING_PACK',
        status: 'PAID',
      }),
    ]);

    const result = await service.list({
      type: 'FOOD',
      status: 'TO_SHIP',
      pageSize: 20,
    });

    const item = result.items.find((row) => row.type === 'FOOD');
    expect(item?.statusGroup).toBe('TO_SHIP');
    expect(item?.stageLabel).toBe('待发货');
    expect(item?.subtypeLabel).toBe('试吃装');
    // 筛选条件：FREEZING 或 试吃装 PAID
    expect(prisma.order.findMany.mock.calls[0][0].where.AND[0]).toEqual({
      OR: [{ status: 'FREEZING' }, { status: 'PAID', type: 'TASTING_PACK' }],
    });
  });

  it('员工端后端脱敏：金额为 null', async () => {
    const result = await service.list({ pageSize: 20 }, { role: 'STAFF' });
    expect(result.items.every((item) => item.amountTotal === null)).toBe(true);
  });

  it('★ 草稿单（INIT）不进订单中心：列表和总数都排除', async () => {
    await service.list({ pageSize: 20 });

    expect(prisma.order.findMany.mock.calls[0][0].where.AND[0].status).toEqual({
      not: 'INIT',
    });
    expect(prisma.order.count.mock.calls[0][0].where.AND[0].status).toEqual({
      not: 'INIT',
    });
  });

  it('★ 真实阶段筛选真的落到查询：PAID 只查 PAID，草稿「待处理」查空', async () => {
    await service.list({ type: 'FOOD', status: 'PAID', pageSize: 20 });
    expect(prisma.order.findMany.mock.calls[0][0].where.AND[0]).toEqual({
      status: 'PAID',
      type: { not: 'TASTING_PACK' },
    });

    await service.list({ type: 'FOOD', status: 'PENDING', pageSize: 20 });
    expect(
      prisma.order.findMany.mock.lastCall?.[0].where.AND[0].status,
    ).toEqual({
      in: [],
    });
  });

  it('★ 只看售后仍按 AFTERSALE 查，不被阶段条件覆盖', async () => {
    await service.list({
      type: 'FOOD',
      status: 'PAID',
      aftersale: true,
      pageSize: 20,
    });

    expect(prisma.order.findMany.mock.calls[0][0].where.AND[0].status).toBe(
      'AFTERSALE',
    );
  });

  it('★ 卡片阶段：售后中 / 已交付 / 分装中 都按原始状态取', async () => {
    prisma.order.findMany.mockResolvedValue([foodRow({ status: 'AFTERSALE' })]);
    prisma.customRecipeOrder.findMany.mockResolvedValue([
      customRow({ status: 'DELIVERED' }),
    ]);
    prisma.customRecipeOrder.count.mockResolvedValue(1);
    prisma.supplementOrder.findMany.mockResolvedValue([
      supplementRow({ status: 'PACKING' }),
    ]);

    const result = await service.list({ pageSize: 20 });

    expect(result.items.find((item) => item.type === 'FOOD')?.stageLabel).toBe(
      '售后中',
    );
    expect(
      result.items.find((item) => item.type === 'CUSTOM_RECIPE')?.stageLabel,
    ).toBe('已交付');
    expect(
      result.items.find((item) => item.type === 'SUPPLEMENT')?.stageLabel,
    ).toBe('分装中');
  });

  it('★ 退款待审核：只有鲜食「售后中 + 退款」才标，补发/投诉不标（2026-11-10）', async () => {
    prisma.order.findMany.mockResolvedValue([
      foodRow({ id: 'f-refund', status: 'AFTERSALE', aftersaleType: 'REFUND' }),
      foodRow({ id: 'f-remake', status: 'AFTERSALE', aftersaleType: 'REMAKE' }),
      foodRow({ id: 'f-normal', status: 'IN_PRODUCTION' }),
    ]);

    const result = await service.list({ type: 'FOOD', pageSize: 20 });
    const byId = (id: string) => result.items.find((item) => item.id === id);

    expect(byId('f-refund')?.needsRefundReview).toBe(true);
    expect(byId('f-remake')?.needsRefundReview).toBe(false);
    expect(byId('f-normal')?.needsRefundReview).toBe(false);
    // 查询里必须真的把售后类型带出来，否则上面的判断永远为 false
    expect(prisma.order.findMany.mock.lastCall?.[0].select.aftersaleType).toBe(
      true,
    );
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
    expect(where.AND[1].OR).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ customerId: { in: ['u1'] } }),
      ]),
    );
    expect(where.customerId).toBeUndefined();
  });

  it('★ 按狗狗名搜索：三类订单都带上狗名条件（老「后台订单」的搜索口径）', async () => {
    await service.list({ pageSize: 20, keyword: '旺财' });

    const foodWhere = prisma.order.findMany.mock.calls[0][0].where;
    const customWhere =
      prisma.customRecipeOrder.findMany.mock.calls[0][0].where;
    const supplementWhere =
      prisma.supplementOrder.findMany.mock.calls[0][0].where;

    expect(foodWhere.AND[1].OR).toEqual(
      expect.arrayContaining([
        { dog: { name: { contains: '旺财', mode: 'insensitive' } } },
      ]),
    );
    expect(customWhere.OR).toEqual(
      expect.arrayContaining([
        { dog: { name: { contains: '旺财', mode: 'insensitive' } } },
      ]),
    );
    expect(supplementWhere.OR).toEqual(
      expect.arrayContaining([
        { dogName: { contains: '旺财', mode: 'insensitive' } },
      ]),
    );
    // 总数也要按同一个条件收窄，否则分页会按「没搜索」的总数算
    expect(prisma.order.count.mock.calls[0][0].where.AND[1].OR).toEqual(
      expect.arrayContaining([
        { dog: { name: { contains: '旺财', mode: 'insensitive' } } },
      ]),
    );
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

  it('★ 鲜食单带出 itemId / 下单快照的食谱 id / 狗狗 id 和名字', async () => {
    const result = await service.list({ pageSize: 20 });
    const food = result.items.find((item) => item.type === 'FOOD');

    expect(food?.itemId).toBe('f1-item');
    expect(food?.recipeId).toBe('r1');
    expect(food?.dogId).toBe('d1');
    // 2026-11-02：鲜食卡片要显示顾客名和狗狗名
    expect(food?.customerName).toBe('张三');
    expect(food?.dogName).toBe('旺财');
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
      customRow({
        recipeId: 'recipe-pk',
        recipe: { recipeId: 'r9', name: '低脂护心餐' },
      }),
    ]);
    const after = await service.list({ pageSize: 20 });
    expect(
      after.items.find((item) => item.type === 'CUSTOM_RECIPE')?.recipeId,
    ).toBe('r9');
  });

  it('★ 定制单给前端的 recipeId 必须是业务编号，不能给主键（否则员工端看食谱打不开）', async () => {
    // 2026-11-08：员工端点「看食谱」传的是这个字段，食谱详情页只认
    // `recipe.recipe_id`（业务编号）。给主键会 404，页面一片空白。
    prisma.customRecipeOrder.findMany.mockResolvedValue([
      customRow({
        recipeId: '3180ba21-3f4e-4b3a-9d1f-0a2b3c4d5e6f',
        recipe: {
          recipeId: '819df2dd-f98b-41ee-8af8-6a7ca91ba96c',
          name: '多元搭配｜紫薯小米羊里脊',
        },
      }),
    ]);
    prisma.customRecipeOrder.count.mockResolvedValue(1);

    const result = await service.list({ pageSize: 20 });
    const custom = result.items.find((item) => item.type === 'CUSTOM_RECIPE');

    expect(custom?.recipeId).toBe('819df2dd-f98b-41ee-8af8-6a7ca91ba96c');
    // 查询本身也必须把业务编号取出来，否则线上永远是 null（单测用 mock 盖不住）
    const select = prisma.customRecipeOrder.findMany.mock.calls[0][0].select;
    expect(select.recipe.select.recipeId).toBe(true);
  });

  it('★ 只看售后时，定制的售后单必须被查出来（以前是 id in []，直接漏掉）', async () => {
    prisma.customRecipeAftersale.findMany.mockResolvedValue([
      { orderId: 'c1', status: 'PENDING' },
    ]);

    await service.list({ pageSize: 20, aftersale: true });

    const customWhere =
      prisma.customRecipeOrder.findMany.mock.calls[0][0].where;
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
