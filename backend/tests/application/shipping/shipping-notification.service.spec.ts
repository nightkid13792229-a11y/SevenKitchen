import { NotFoundException } from '@nestjs/common';
import {
  ShippingNotificationService,
  type ShippingNotificationChoice,
} from '../../../src/application/shipping/shipping-notification.service';
import { PrismaService } from '../../../src/infrastructure/prisma.service';
import { WechatService } from '../../../src/infrastructure/wechat/wechat.service';

describe('ShippingNotificationService', () => {
  const templateId = 'shipping-template-id';
  let service: ShippingNotificationService;
  let prisma: {
    order: {
      findFirst: jest.Mock;
      findUnique: jest.Mock;
    };
    orderShippingNotification: {
      findUnique: jest.Mock;
      upsert: jest.Mock;
      update: jest.Mock;
    };
  };
  let wechatService: {
    sendSubscriptionMessage: jest.Mock;
  };

  const orderForCustomer = {
    id: 'order-1',
    customerId: 'customer-1',
    status: 'PAID',
  };

  const shippableOrder = {
    id: 'order-1',
    customerId: 'customer-1',
    trackingNumber: 'SF1234567890',
    carrierCode: 'SF',
    shippedAt: new Date('2026-06-11T08:00:00.000Z'),
    customer: {
      id: 'customer-1',
      wechatOpenid: 'openid-1',
    },
    items: [
      {
        packageSpecG: 100,
        packageCount: 5,
        packagePlan: null,
        recipeSnapshot: {
          name: '牛肉南瓜鲜食',
          coverImageUrl: 'https://img.example.com/meal.jpg',
        },
      },
    ],
  };

  const noticeOrder = {
    ...shippableOrder,
    status: 'SHIPPED',
    items: [
      {
        packageSpecG: 80,
        packageCount: 2,
        packagePlan: [
          { packageSpecG: 80, packageCount: 2 },
          { packageSpecG: 150, packageCount: 3 },
          { packageSpecG: 300, packageCount: 1 },
          { packageSpecG: 450, packageCount: 1 },
        ],
        recipeSnapshot: {
          name: '牛肉南瓜鲜食',
          coverImageUrl: 'https://img.example.com/meal.jpg',
        },
      },
    ],
  };

  beforeEach(() => {
    prisma = {
      order: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
      },
      orderShippingNotification: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
      },
    };
    wechatService = {
      sendSubscriptionMessage: jest.fn(),
    };
    service = new ShippingNotificationService(
      prisma as unknown as PrismaService,
      wechatService as unknown as WechatService,
      { templateId },
    );
  });

  it('records the customer subscription choice for the matching order', async () => {
    prisma.order.findFirst.mockResolvedValue(orderForCustomer);
    prisma.orderShippingNotification.upsert.mockResolvedValue({
      orderId: 'order-1',
      customerId: 'customer-1',
      subscriptionStatus: 'ACCEPTED',
    });

    await service.recordCustomerChoice(
      'order-1',
      'customer-1',
      'ACCEPTED' satisfies ShippingNotificationChoice,
    );

    expect(prisma.order.findFirst).toHaveBeenCalledWith({
      where: { id: 'order-1', customerId: 'customer-1' },
      select: { id: true, customerId: true, status: true },
    });
    expect(prisma.orderShippingNotification.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orderId: 'order-1' },
        create: expect.objectContaining({
          orderId: 'order-1',
          customerId: 'customer-1',
          templateId,
          subscriptionStatus: 'ACCEPTED',
        }),
        update: expect.objectContaining({
          templateId,
          subscriptionStatus: 'ACCEPTED',
        }),
      }),
    );
  });

  it('rejects subscription choices for orders owned by another customer', async () => {
    prisma.order.findFirst.mockResolvedValue(null);

    await expect(
      service.recordCustomerChoice('order-1', 'other-customer', 'ACCEPTED'),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.orderShippingNotification.upsert).not.toHaveBeenCalled();
  });

  it('sends the shipping subscription message once after shipment', async () => {
    prisma.orderShippingNotification.findUnique.mockResolvedValue({
      orderId: 'order-1',
      customerId: 'customer-1',
      subscriptionStatus: 'ACCEPTED',
      sendStatus: 'NOT_SENT',
    });
    prisma.order.findUnique.mockResolvedValue(shippableOrder);
    wechatService.sendSubscriptionMessage.mockResolvedValue({
      success: true,
      msgid: 'msg-1',
    });

    const result = await service.sendForOrder('order-1');

    expect(result).toMatchObject({
      success: true,
      skipped: false,
      message: '发货订阅通知已发送',
    });
    expect(wechatService.sendSubscriptionMessage).toHaveBeenCalledWith({
      touser: 'openid-1',
      template_id: templateId,
      page: 'pages/order-shipping-notice/index?orderId=order-1',
      data: expect.objectContaining({
        thing2: { value: 'SevenKitchen订单' },
        thing5: { value: '顺丰速运' },
        character_string1: { value: 'SF1234567890' },
        thing6: { value: '点击查看加热保存说明' },
      }),
    });
    expect(prisma.orderShippingNotification.update).toHaveBeenCalledWith({
      where: { orderId: 'order-1' },
      data: expect.objectContaining({
        sendStatus: 'SENT',
        msgid: 'msg-1',
        errorMessage: null,
      }),
    });
  });

  it('does not send when the customer has not accepted the subscription', async () => {
    prisma.orderShippingNotification.findUnique.mockResolvedValue({
      orderId: 'order-1',
      customerId: 'customer-1',
      subscriptionStatus: 'REJECTED',
      sendStatus: 'NOT_SENT',
    });

    const result = await service.sendForOrder('order-1');

    expect(result).toMatchObject({
      success: false,
      skipped: true,
      message: '顾客未订阅发货通知',
    });
    expect(wechatService.sendSubscriptionMessage).not.toHaveBeenCalled();
  });

  it('does not send duplicate notifications for an order already marked sent', async () => {
    prisma.orderShippingNotification.findUnique.mockResolvedValue({
      orderId: 'order-1',
      customerId: 'customer-1',
      subscriptionStatus: 'ACCEPTED',
      sendStatus: 'SENT',
    });

    const result = await service.sendForOrder('order-1');

    expect(result).toMatchObject({
      success: true,
      skipped: true,
      message: '发货订阅通知此前已发送',
    });
    expect(wechatService.sendSubscriptionMessage).not.toHaveBeenCalled();
  });

  it('returns the customer shipping notification preference for an unpaid-to-unshipped order', async () => {
    prisma.order.findFirst.mockResolvedValue({
      id: 'order-1',
      customerId: 'customer-1',
      status: 'PAID',
    });
    prisma.orderShippingNotification.findUnique.mockResolvedValue(null);

    const preference = await service.getCustomerPreference(
      'order-1',
      'customer-1',
    );

    expect(preference).toEqual({
      orderId: 'order-1',
      templateId,
      subscriptionStatus: 'PENDING',
      sendStatus: 'NOT_SENT',
      canPrompt: true,
    });
  });

  it('builds a customer shipping notice with logistics and weight-specific cooking tips', async () => {
    prisma.order.findFirst.mockResolvedValue(noticeOrder);

    const notice = await service.getCustomerShippingNotice(
      'order-1',
      'customer-1',
    );

    expect(notice).toMatchObject({
      orderId: 'order-1',
      carrierCode: 'SF',
      carrierName: '顺丰速运',
      trackingNumber: 'SF1234567890',
      imageUrl: 'https://img.example.com/meal.jpg',
    });
    expect(notice.cookingTips).toContain('80g/袋：水开后蒸或炖 5-10 分钟');
    expect(notice.cookingTips).toContain('150g/袋：水开后蒸或炖 10-15 分钟');
    expect(notice.cookingTips).toContain('300g/袋：水开后蒸或炖 15-20 分钟');
    expect(notice.cookingTips).toContain('450g/袋：单袋重量较大，请充分解冻后加热');
    expect(notice.storageTips).toContain('-18℃ 冷冻保存，保质期 6 个月');
    expect(notice.damageReminder).toContain('无理由退换货');
  });
});
