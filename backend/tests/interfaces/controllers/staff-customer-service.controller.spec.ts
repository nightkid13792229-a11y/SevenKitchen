import { StaffCustomerServiceController } from '../../../src/interfaces/controllers/staff-customer-service.controller';

describe('StaffCustomerServiceController customer and dog workflows', () => {
  function createController() {
    const prisma = {
      user: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      dog: {
        findUnique: jest.fn(),
      },
      address: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      recipe: {
        findMany: jest.fn(),
      },
      order: {
        findUnique: jest.fn(),
      },
      dogBreed: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'breed-1', name: '柯基' },
        ]),
      },
      customerServiceConversation: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const orderService = {
      createOrderDraft: jest.fn(),
      confirmOrder: jest.fn(),
      updateOrderAmount: jest.fn(),
      updateAdminRemark: jest.fn(),
      processPayment: jest.fn(),
      listDogFinishedFoodHistory: jest.fn(),
    };
    const controller = new StaffCustomerServiceController(
      prisma as any,
      orderService as any,
    );

    return { controller, prisma, orderService };
  }

  it('searches customers by keyword and returns dogs grouped under each customer', async () => {
    const { controller, prisma } = createController();
    prisma.user.findMany.mockResolvedValue([
      {
        id: 'customer-1',
        nickname: '王女士',
        phone: '13800000000',
        avatarUrl: null,
        dogs: [
          {
            id: 'dog-1',
            name: 'Seven',
            breedId: 'breed-1',
            customBreedName: null,
            currentWeightKg: 11.2,
            mealsPerDay: 2,
          },
        ],
      },
    ]);

    const result = await (controller as any).searchCustomers({
      keyword: 'Seven',
    });

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          role: 'CUSTOMER',
        }),
      }),
    );
    expect(result.code).toBe(0);
    expect(result.data[0]).toMatchObject({
      id: 'customer-1',
      nickname: '王女士',
      dogs: [
        {
          id: 'dog-1',
          name: 'Seven',
          breedName: '柯基',
          currentWeightKg: 11.2,
        },
      ],
    });
  });

  it('creates an assisted offline order and marks it paid without customer payment', async () => {
    const { controller, prisma, orderService } = createController();
    prisma.dog.findUnique.mockResolvedValue({
      id: 'dog-1',
      ownerId: 'customer-1',
    });
    prisma.address.findUnique.mockResolvedValue({
      id: 'address-1',
      userId: 'customer-1',
    });
    orderService.createOrderDraft.mockResolvedValue({
      id: 'order-1',
      status: 'INIT',
      amountTotal: 128,
      adminRemark: null,
    });
    orderService.confirmOrder.mockResolvedValue({
      id: 'order-1',
      status: 'PENDING_PAYMENT',
    });
    orderService.updateOrderAmount.mockResolvedValue({
      id: 'order-1',
      amountTotal: 118,
    });
    orderService.updateAdminRemark.mockResolvedValue({
      id: 'order-1',
      adminRemark: '[代客下单]',
    });
    orderService.processPayment.mockResolvedValue({
      id: 'order-1',
      status: 'PAID',
      paymentMethod: 'OFFLINE',
      amountTotal: 118,
    });

    const result = await (controller as any).createAssistedOrder(
      {
        customerId: 'customer-1',
        dogId: 'dog-1',
        addressId: 'address-1',
        type: 'FRESH_FOOD',
        actualAmount: 118,
        remark: '客户微信沟通确认',
        items: [
          {
            recipeId: 'recipe-1',
            quantityG: 1400,
            packageSpecG: 100,
            packageCount: 14,
            cycleDays: 7,
          },
        ],
      },
      { userId: 'staff-1', role: 'STAFF' },
    );

    expect(orderService.createOrderDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 'customer-1',
        dogId: 'dog-1',
        addressId: 'address-1',
        type: 'FRESH_FOOD',
      }),
    );
    expect(orderService.confirmOrder).toHaveBeenCalledWith(
      'order-1',
      'staff',
      'staff-1',
    );
    expect(orderService.updateOrderAmount).toHaveBeenCalledWith(
      'order-1',
      118,
    );
    expect(orderService.processPayment).toHaveBeenCalledWith(
      'order-1',
      'OFFLINE',
      'staff',
      'staff-1',
      expect.stringContaining('OFFLINE_'),
    );
    expect(result.code).toBe(0);
    expect(result.data).toMatchObject({
      id: 'order-1',
      status: 'PAID',
      paymentMethod: 'OFFLINE',
    });
  });

  it('lists customer addresses for the assisted order address selector', async () => {
    const { controller, prisma } = createController();
    prisma.user.findUnique.mockResolvedValue({
      id: 'customer-1',
      role: 'CUSTOMER',
    });
    prisma.address.findMany.mockResolvedValue([
      {
        id: 'address-1',
        userId: 'customer-1',
        recipientName: '王女士',
        phone: '13800000000',
        region: { province: '上海市', city: '上海市', district: '徐汇区' },
        detail: '漕溪北路 1 号',
        isDefault: true,
      },
    ]);

    const result = await (controller as any).listCustomerAddresses(
      'customer-1',
    );

    expect(prisma.address.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'customer-1' },
      }),
    );
    expect(result.code).toBe(0);
    expect(result.data[0]).toMatchObject({
      id: 'address-1',
      recipientName: '王女士',
      regionText: '上海市 上海市 徐汇区',
      detail: '漕溪北路 1 号',
      isDefault: true,
    });
  });

  it('lists public and customer-private finished-food recipe options for a dog selector', async () => {
    const { controller, prisma } = createController();
    prisma.dog.findUnique.mockResolvedValue({
      id: 'dog-1',
      ownerId: 'customer-1',
    });
    prisma.recipe.findMany.mockResolvedValue([
      {
        id: 'recipe-row-1',
        recipeId: 'recipe-public',
        version: 3,
        name: '鸡肉牛肉鲜食',
        status: 'PUBLIC',
        coverImageUrl: 'http://cdn.example.com/cover.jpg',
        applicableLifeStages: ['ADULT'],
        targetHealthTags: ['skin'],
        energyDensityKcalPerKg: 1250,
        customerOwnerId: null,
        customerDogId: null,
        isCustomRecipe: false,
        seriesLifeStage: 'ADULT',
      },
      {
        id: 'recipe-row-2',
        recipeId: 'recipe-private',
        version: 1,
        name: 'Seven 专属鲜食',
        status: 'PRIVATE_CUSTOM',
        coverImageUrl: null,
        applicableLifeStages: [],
        targetHealthTags: [],
        energyDensityKcalPerKg: 1180,
        customerOwnerId: 'customer-1',
        customerDogId: 'dog-1',
        isCustomRecipe: true,
        seriesLifeStage: null,
      },
    ]);

    const result = await (controller as any).listDogFinishedFoodRecipeOptions(
      'dog-1',
      { customerId: 'customer-1' },
    );

    expect(prisma.recipe.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.any(Array),
        }),
      }),
    );
    expect(result.code).toBe(0);
    expect(result.data).toEqual([
      expect.objectContaining({
        id: 'recipe-public',
        name: '鸡肉牛肉鲜食',
        status: 'PUBLIC',
        sourceLabel: '公开成品',
        coverImageUrl: 'https://cdn.example.com/cover.jpg',
      }),
      expect.objectContaining({
        id: 'recipe-private',
        name: 'Seven 专属鲜食',
        status: 'PRIVATE_CUSTOM',
        sourceLabel: '专属成品',
        customerDogId: 'dog-1',
      }),
    ]);
  });

  it('rejects assisted orders when the dog does not belong to the customer', async () => {
    const { controller, prisma, orderService } = createController();
    prisma.dog.findUnique.mockResolvedValue({
      id: 'dog-1',
      ownerId: 'other-customer',
    });

    const result = await (controller as any).createAssistedOrder(
      {
        customerId: 'customer-1',
        dogId: 'dog-1',
        addressId: 'address-1',
        type: 'FRESH_FOOD',
        items: [{ recipeId: 'recipe-1', quantityG: 1400 }],
      },
      { userId: 'staff-1', role: 'STAFF' },
    );

    expect(result.code).toBe(400);
    expect(orderService.createOrderDraft).not.toHaveBeenCalled();
  });

  it('rejects amount edits after shipment', async () => {
    const { controller, prisma, orderService } = createController();
    prisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      status: 'SHIPPED',
      paymentStatus: 'SUCCESS',
      paidAt: new Date('2026-06-11T10:00:00.000Z'),
      amountTotal: 128,
      adminRemark: null,
    });

    const result = await (controller as any).updateUnpaidOrderAmount(
      'order-1',
      { amount: 100, reason: '补录' },
      { userId: 'staff-1', role: 'STAFF' },
    );

    expect(result.code).toBe(400);
    expect(orderService.updateOrderAmount).not.toHaveBeenCalled();
  });

  it('allows offline paid order amount edits before shipment', async () => {
    const { controller, prisma, orderService } = createController();
    prisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      status: 'PAID',
      paymentMethod: 'OFFLINE',
      paymentStatus: 'SUCCESS',
      paidAt: new Date('2026-06-11T10:00:00.000Z'),
      amountTotal: 128,
      adminRemark: 'old note',
    });
    orderService.updateOrderAmount.mockResolvedValue({
      id: 'order-1',
      amountTotal: 108,
    });
    orderService.updateAdminRemark.mockResolvedValue({
      id: 'order-1',
      adminRemark: 'old note\n[客服改价]',
    });

    const result = await (controller as any).updateUnpaidOrderAmount(
      'order-1',
      { amount: 108, reason: '线下抹零' },
      { userId: 'staff-1', role: 'STAFF' },
    );

    expect(orderService.updateOrderAmount).toHaveBeenCalledWith(
      'order-1',
      108,
    );
    expect(orderService.updateAdminRemark).toHaveBeenCalledWith(
      'order-1',
      expect.stringContaining('线下抹零'),
    );
    expect(result.code).toBe(0);
  });

  it('returns staff-visible finished-food history for a dog', async () => {
    const { controller, orderService } = createController();
    orderService.listDogFinishedFoodHistory.mockResolvedValue([
      {
        orderId: 'order-1',
        recipeName: '鸡肉牛肉鲜食',
      },
    ]);

    const result = await (controller as any).listDogFinishedFoodHistory(
      'dog-1',
    );

    expect(orderService.listDogFinishedFoodHistory).toHaveBeenCalledWith(
      'dog-1',
    );
    expect(result.code).toBe(0);
    expect(result.data[0]).toMatchObject({
      orderId: 'order-1',
      recipeName: '鸡肉牛肉鲜食',
    });
  });
});
