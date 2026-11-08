import { ForbiddenException } from '@nestjs/common';
import { StaffCustomerServiceController } from 'src/interfaces/controllers/staff-customer-service.controller';
import { AdminGuard } from 'src/interfaces/guards/role.guard';

type PrismaMock = {
  recipe: { findMany: jest.Mock; findUnique?: jest.Mock };
  user: { findMany: jest.Mock; findUnique: jest.Mock };
  dog: { findMany: jest.Mock; findUnique: jest.Mock };
  dogBreed: { findMany: jest.Mock };
  recipeItem: { findMany: jest.Mock };
  recipeSeries: { findMany: jest.Mock };
  allergyRecord: { findMany: jest.Mock };
  address: { findMany: jest.Mock; findUnique: jest.Mock };
  orderOperationLog: { create: jest.Mock };
};

function buildPrisma(): PrismaMock {
  return {
    recipe: { findMany: jest.fn().mockResolvedValue([]) },
    user: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue({ id: 'cust-1', role: 'CUSTOMER' }),
    },
    dog: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue({ id: 'dog-1', ownerId: 'cust-1' }),
    },
    dogBreed: { findMany: jest.fn().mockResolvedValue([]) },
    recipeItem: { findMany: jest.fn().mockResolvedValue([]) },
    recipeSeries: { findMany: jest.fn().mockResolvedValue([]) },
    allergyRecord: { findMany: jest.fn().mockResolvedValue([]) },
    address: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue({ id: 'addr-1', userId: 'cust-1' }),
    },
    orderOperationLog: { create: jest.fn().mockResolvedValue({ id: 'log-1' }) },
  };
}

function buildOrderService() {
  return {
    previewPortionForDog: jest.fn().mockResolvedValue({
      dailyIntakeG: 447,
      perMealIntakeG: 224,
      mealsPerDay: 2,
      days: 7,
      totalG: 3129,
      suggestedPackagePlan: [{ packageSpecG: 224, packageCount: 14 }],
      minOrderG: 1000,
    }),
    previewPricing: jest.fn().mockResolvedValue({
      amountProduct: 428,
      amountShipping: 12,
      amountTotal: 440,
    }),
    createOrderDraft: jest.fn().mockResolvedValue({ id: 'order-1', amountTotal: 428 }),
    confirmOrder: jest.fn().mockResolvedValue({ id: 'order-1' }),
    updateOrderAmount: jest.fn().mockResolvedValue({ id: 'order-1' }),
    updateAdminRemark: jest.fn().mockResolvedValue({ id: 'order-1' }),
    processPayment: jest.fn().mockResolvedValue({ id: 'order-1' }),
  };
}

function buildAddressService() {
  return {
    createAddress: jest.fn().mockResolvedValue({
      id: 'addr-1',
      userId: 'cust-1',
      recipientName: '张三',
      phone: '13800000000',
      region: { province: '上海市', city: '上海市', district: '徐汇区' },
      detail: '田林路 1 号',
      isDefault: true,
    }),
  };
}

function buildController(overrides: {
  prisma?: Partial<PrismaMock>;
  orderService?: ReturnType<typeof buildOrderService>;
  addressService?: ReturnType<typeof buildAddressService>;
} = {}) {
  const prisma = { ...buildPrisma(), ...(overrides.prisma ?? {}) };
  const orderService = overrides.orderService ?? buildOrderService();
  const addressService = overrides.addressService ?? buildAddressService();
  const controller = new StaffCustomerServiceController(
    prisma as any,
    orderService as any,
    addressService as any,
  );
  return { controller, prisma, orderService, addressService };
}

const ADMIN = { userId: 'admin-1', role: 'ADMIN' } as any;

describe('staff assisted order controller', () => {
  it('代客下单相关接口挂了 AdminGuard（员工不能调）', () => {
    const guards = (method: string) =>
      Reflect.getMetadata('__guards__', (StaffCustomerServiceController.prototype as any)[method]) ?? [];
    expect(guards('createAssistedOrder')).toContain(AdminGuard);
    expect(guards('createCustomerAddress')).toContain(AdminGuard);
    expect(guards('previewAssistedPricing')).toContain(AdminGuard);
    expect(guards('previewPortion')).toContain(AdminGuard);
    expect(guards('listAssistedRecipeOptions')).toContain(AdminGuard);
  });

  it('AdminGuard 拒绝员工角色', () => {
    const guard = new AdminGuard({ getAllAndOverride: () => undefined } as any);
    const context = {
      getHandler: () => () => undefined,
      getClass: () => class {},
      switchToHttp: () => ({ getRequest: () => ({ user: { role: 'STAFF' } }) }),
    } as any;
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('食谱选项里能拿到别人家的定制食谱，并标成 OTHER_CUSTOM', async () => {
    const { controller, prisma } = buildController();
    prisma.recipe.findMany.mockResolvedValue([
      {
        id: 'internal-pub',
        recipeId: 'recipe-pub',
        version: 1,
        name: '低脂鸡肉南瓜餐',
        status: 'PUBLIC',
        coverImageUrl: null,
        applicableLifeStages: ['ADULT'],
        customerOwnerId: null,
        customerDogId: null,
        seriesId: null,
      },
      {
        id: 'internal-other',
        recipeId: 'recipe-other',
        version: 3,
        name: '豆豆的鸭肉低敏餐',
        status: 'PRIVATE_CUSTOM',
        coverImageUrl: null,
        applicableLifeStages: ['ADULT'],
        customerOwnerId: 'cust-2',
        customerDogId: 'dog-2',
        seriesId: 'series-1',
      },
    ]);
    prisma.user.findMany.mockResolvedValue([
      { id: 'cust-2', nickname: '李先生', phone: null, guestContactName: null, guestContactPhone: null },
    ]);
    prisma.dog.findMany.mockResolvedValue([
      { id: 'dog-2', name: '豆豆', breedId: 'breed-1' },
    ]);
    prisma.dogBreed.findMany.mockResolvedValue([{ id: 'breed-1', name: '泰迪' }]);

    const res = await controller.listAssistedRecipeOptions('dog-1', {
      customerId: 'cust-1',
      scope: 'all',
    });

    const items = (res as any).data.items;
    expect(items).toHaveLength(2);
    expect(items[0].ownership.kind).toBe('WINDOW');
    expect(items[1].ownership.kind).toBe('OTHER_CUSTOM');
    expect(items[1].ownership.dogName).toBe('豆豆');
  });

  it('顾客搜索把无账号顾客也带出来并标 isGuest', async () => {
    const { controller, prisma } = buildController();
    prisma.user.findMany.mockResolvedValue([
      {
        id: 'guest-1',
        nickname: '王女士',
        phone: null,
        avatarUrl: null,
        isGuest: true,
        guestContactName: '王女士',
        guestContactPhone: '13800001111',
        dogs: [],
      },
    ]);

    const res = await controller.searchCustomers({ keyword: '13800001111' });

    const where = prisma.user.findMany.mock.calls[0][0].where;
    const serialized = JSON.stringify(where);
    expect(serialized).toContain('guestContactPhone');
    expect(serialized).toContain('guestContactName');
    expect((res as any).data[0].isGuest).toBe(true);
  });

  it('给顾客建地址落在顾客名下', async () => {
    const { controller, addressService } = buildController();

    await controller.createCustomerAddress('cust-1', {
      recipientName: '张三',
      phone: '13800000000',
      region: { province: '上海市', city: '上海市', district: '徐汇区' },
      detail: '田林路 1 号',
      isDefault: true,
    });

    expect(addressService.createAddress).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'cust-1', detail: '田林路 1 号' }),
    );
  });

  it('饭量预览转调 OrderService', async () => {
    const { controller, orderService } = buildController();

    const res = await controller.previewPortion('dog-1', { recipeId: 'recipe-1', days: '7' });

    expect(orderService.previewPortionForDog).toHaveBeenCalledWith('dog-1', 'recipe-1', 7);
    expect((res as any).data.totalG).toBe(3129);
  });

  it('员工报价预览用顾客 ID 且走 STAFF_PREVIEW（不落快照）', async () => {
    const { controller, orderService } = buildController();

    await controller.previewAssistedPricing({
      customerId: 'cust-1',
      dogId: 'dog-1',
      addressId: 'addr-1',
      items: [{ recipeId: 'recipe-1', quantityG: 3136, packageCount: 14, packageSpecG: 224, cycleDays: 7 }],
    });

    expect(orderService.previewPricing).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 'cust-1',
        dogId: 'dog-1',
        pricingPurpose: 'STAFF_PREVIEW',
      }),
    );
  });

  it('实收金额与系统报价不一致且没写原因 → 400，不落金额', async () => {
    const { controller, orderService } = buildController();

    const res = await controller.createAssistedOrder(
      {
        customerId: 'cust-1',
        dogId: 'dog-1',
        addressId: 'addr-1',
        items: [{ recipeId: 'recipe-1', quantityG: 1000, packageCount: 5, packageSpecG: 200 }],
        actualAmount: 400,
      },
      ADMIN,
    );

    expect((res as any).code).toBe(400);
    expect(orderService.updateOrderAmount).not.toHaveBeenCalled();
  });

  it('写了差额原因就放行', async () => {
    const { controller, orderService } = buildController();

    const res = await controller.createAssistedOrder(
      {
        customerId: 'cust-1',
        dogId: 'dog-1',
        addressId: 'addr-1',
        items: [{ recipeId: 'recipe-1', quantityG: 1000, packageCount: 5, packageSpecG: 200 }],
        actualAmount: 400,
        amountAdjustReason: '老客户抹零',
      },
      ADMIN,
    );

    expect((res as any).code).toBe(0);
    expect(orderService.updateOrderAmount).toHaveBeenCalledWith('order-1', 400);
  });

  it('没传收货地址 → 400（鲜食必须冷链发货，接口层也要挡）', async () => {
    const { controller } = buildController();

    const res = await controller.createAssistedOrder(
      {
        customerId: 'cust-1',
        dogId: 'dog-1',
        items: [{ recipeId: 'recipe-1', quantityG: 1000, packageCount: 5, packageSpecG: 200 }],
        actualAmount: 428,
      },
      ADMIN,
    );

    expect((res as any).code).toBe(400);
    expect((res as any).message).toContain('收货地址');
  });

  it('ownership 过滤只返回该档的食谱（筛选不能只在前端做）', async () => {
    const { controller, prisma } = buildController();
    prisma.recipe.findMany.mockResolvedValue([
      {
        id: 'i1', recipeId: 'r-window', version: 1, name: '橱窗餐', status: 'PUBLIC',
        coverImageUrl: null, applicableLifeStages: [], customerOwnerId: null,
        customerDogId: null, seriesId: null,
      },
      {
        id: 'i2', recipeId: 'r-other', version: 2, name: '别人家的定制', status: 'PRIVATE_CUSTOM',
        coverImageUrl: null, applicableLifeStages: [], customerOwnerId: 'cust-2',
        customerDogId: null, seriesId: null,
      },
    ]);

    const res = await controller.listAssistedRecipeOptions('dog-1', {
      customerId: 'cust-1',
      ownership: 'OTHER_CUSTOM',
    });

    const items = (res as any).data.items;
    expect(items).toHaveLength(1);
    expect(items[0].ownership.kind).toBe('OTHER_CUSTOM');
    expect((res as any).data.total).toBe(1);
    // 四档计数按“筛档之前”的集合算：否则四个标签永远显示同一个数字
    expect((res as any).data.counts).toEqual({
      all: 2,
      window: 1,
      ownCustom: 0,
      otherCustom: 1,
    });
  });

  it('默认 NONE 的生命阶段按生日推算，不会满屏误报；文案里不出现英文枚举', async () => {
    const { controller, prisma } = buildController();
    prisma.dog.findUnique.mockResolvedValue({
      id: 'dog-1',
      ownerId: 'cust-1',
      name: '烟花',
      birthday: new Date('2022-01-01'),
      lifeStageOverride: 'NONE',
    });
    prisma.recipe.findMany.mockResolvedValue([
      {
        id: 'i1', recipeId: 'r-adult', version: 1, name: '成犬餐', status: 'PUBLIC',
        coverImageUrl: null, applicableLifeStages: ['HIGH_ACTIVITY_ADULT'],
        customerOwnerId: null, customerDogId: null, seriesId: null,
        updatedAt: new Date('2026-11-01T00:00:00Z'),
      },
      {
        id: 'i2', recipeId: 'r-puppy', version: 1, name: '幼犬餐', status: 'PUBLIC',
        coverImageUrl: null, applicableLifeStages: ['PUPPY_14_WEEKS_PLUS'],
        customerOwnerId: null, customerDogId: null, seriesId: null,
        updatedAt: new Date('2026-11-02T00:00:00Z'),
      },
    ]);

    const res = await controller.listAssistedRecipeOptions('dog-1', {
      customerId: 'cust-1',
    });
    const items = (res as any).data.items;
    const adult = items.find((item: any) => item.name === '成犬餐');
    const puppy = items.find((item: any) => item.name === '幼犬餐');

    // 「NONE」不是阶段：烟花是成犬，成犬配方不该亮红字
    expect(adult.fit.level).toBe('OK');
    expect(puppy.fit.level).toBe('WARN');
    expect(puppy.fit.reasons[0]).toBe('适合「幼犬（14 周以上）」，烟花目前是成犬');
    expect(puppy.fit.reasons[0]).not.toContain('PUPPY_14_WEEKS_PLUS');
    expect(puppy.fit.reasons[0]).not.toContain('NONE');
  });

  it('列表按最近更新时间倒序（recipeId 是随机 UUID，不能拿它当排序依据）', async () => {
    const { controller, prisma } = buildController();
    prisma.recipe.findMany.mockResolvedValue([
      {
        id: 'i1', recipeId: 'r-old', version: 1, name: '很早就没动过', status: 'PUBLIC',
        coverImageUrl: null, applicableLifeStages: [], customerOwnerId: null,
        customerDogId: null, seriesId: null,
        updatedAt: new Date('2026-10-01T00:00:00Z'),
      },
      {
        id: 'i2', recipeId: 'r-new', version: 1, name: '刚改过', status: 'PUBLIC',
        coverImageUrl: null, applicableLifeStages: [], customerOwnerId: null,
        customerDogId: null, seriesId: null,
        updatedAt: new Date('2026-11-08T12:00:00Z'),
      },
      {
        id: 'i3', recipeId: 'r-mid', version: 1, name: '中间改的', status: 'PUBLIC',
        coverImageUrl: null, applicableLifeStages: [], customerOwnerId: null,
        customerDogId: null, seriesId: null,
        updatedAt: new Date('2026-11-05T00:00:00Z'),
      },
    ]);

    const res = await controller.listAssistedRecipeOptions('dog-1', {
      customerId: 'cust-1',
    });

    expect((res as any).data.items.map((item: any) => item.name)).toEqual([
      '刚改过',
      '中间改的',
      '很早就没动过',
    ]);
  });

  it('给非顾客账号建地址 → 404（防止把地址挂到员工/老板身上）', async () => {
    const { controller, prisma, addressService } = buildController();
    prisma.user.findUnique.mockResolvedValue({ id: 'staff-1', role: 'STAFF' });

    const res = await controller.createCustomerAddress('staff-1', {
      recipientName: '张三',
      phone: '13800000000',
      region: { province: '上海市', city: '上海市', district: '徐汇区' },
      detail: '田林路 1 号',
    });

    expect((res as any).code).toBe(404);
    expect(addressService.createAddress).not.toHaveBeenCalled();
  });
});
