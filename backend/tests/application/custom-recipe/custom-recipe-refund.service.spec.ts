import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { CustomRecipeRefundService } from '../../../src/application/custom-recipe/custom-recipe-refund.service';
import { PrismaService } from '../../../src/infrastructure/prisma.service';
import { WechatPaymentService } from '../../../src/application/payment/wechat-payment.service';

/**
 * 已交付/制作中订单的退款申请。
 *
 * 这组测试守着四件事：
 *   ① 未开始制作（PAID）不能走人工审核，应回全额退款路径；
 *   ② 别人的单不能看、不能提；
 *   ③ 同一条申请重复提交返回原申请，不产生两条待办；
 *   ④ 审核通过才调微信退款；退款失败不能把申请标成已退款。
 */
function buildOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order-pk-1',
    orderId: 'CR202610250001',
    customerId: 'customer-1',
    status: 'IN_PROGRESS',
    amount: 299,
    paymentConfirmedAt: new Date('2026-10-25T10:12:00+08:00'),
    paymentTransactionId: 'wx-tx-1',
    ...overrides,
  };
}

function buildRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: 'refund-1',
    orderId: 'order-pk-1',
    customerId: 'customer-1',
    reasonCode: 'NOT_EXPECTED',
    reasonLabel: '与预期不符',
    description: '狗狗吃了两天不太适应',
    photos: [],
    amount: 299,
    status: 'PENDING',
    adminNote: null,
    refundStatus: null,
    refundOutNo: null,
    refundId: null,
    reviewedBy: null,
    reviewedAt: null,
    createdAt: new Date('2026-10-25T10:24:00+08:00'),
    ...overrides,
  };
}

function createService(options: {
  order?: unknown;
  existing?: unknown;
  created?: unknown;
  request?: unknown;
  rows?: unknown[];
  refund?: unknown;
} = {}) {
  const prisma = {
    customRecipeOrder: {
      findFirst: jest.fn().mockResolvedValue(
        'order' in options ? options.order : buildOrder(),
      ),
    },
    customRecipeRefundRequest: {
      findFirst: jest.fn().mockResolvedValue(options.existing ?? null),
      findUnique: jest.fn().mockResolvedValue(options.request ?? buildRequest()),
      findMany: jest.fn().mockResolvedValue(options.rows ?? []),
      create: jest.fn().mockResolvedValue(options.created ?? buildRequest()),
      update: jest.fn().mockImplementation(async ({ data }: any) => ({
        ...buildRequest(),
        ...data,
      })),
    },
  };
  const wechat = {
    createCustomRecipeRefund: jest.fn().mockResolvedValue(
      options.refund ?? {
        status: 'SUCCESS',
        amount: 299,
        outRefundNo: 'CRR1',
        refundId: 'wx-refund-1',
        reused: false,
      },
    ),
  };
  return {
    service: new CustomRecipeRefundService(
      prisma as unknown as PrismaService,
      wechat as unknown as WechatPaymentService,
    ),
    prisma,
    wechat,
  };
}

describe('CustomRecipeRefundService · 顾客提交', () => {
  it('制作中订单可提交，金额取订单实付，初始为待审核', async () => {
    const { service, prisma } = createService();
    const result = await service.createForCustomer(
      'CR202610250001',
      'customer-1',
      {
        reasonCode: 'NOT_EXPECTED',
        reasonLabel: '与预期不符',
        description: '狗狗吃了两天不太适应',
      },
    );

    expect(result.reused).toBe(false);
    expect(result.request.status).toBe('PENDING');
    expect(result.request.statusLabel).toBe('审核中');
    expect(prisma.customRecipeRefundRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amount: 299,
          reasonCode: 'NOT_EXPECTED',
        }),
      }),
    );
  });

  it('★ 未开始制作（PAID）不能提人工退款，应走全额退款', async () => {
    const { service } = createService({
      order: buildOrder({ status: 'PAID' }),
    });
    await expect(
      service.createForCustomer('CR202610250001', 'customer-1', {
        reasonCode: 'OTHER',
        reasonLabel: '其他',
        description: '不想要了',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('★ 已退款/退款中的订单不能再提申请', async () => {
    const { service } = createService({
      order: buildOrder({ refundStatus: 'PROCESSING' }),
    });
    await expect(
      service.createForCustomer('CR202610250001', 'customer-1', {
        reasonCode: 'OTHER',
        reasonLabel: '其他',
        description: '再退一次',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('★ 别人的订单不能提', async () => {
    const { service } = createService();
    await expect(
      service.createForCustomer('CR202610250001', 'customer-2', {
        reasonCode: 'OTHER',
        reasonLabel: '其他',
        description: '不想要了',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('★ 已有待审核申请时返回原申请，不再建第二条', async () => {
    const { service, prisma } = createService({
      existing: buildRequest(),
    });
    const result = await service.createForCustomer(
      'CR202610250001',
      'customer-1',
      {
        reasonCode: 'OTHER',
        reasonLabel: '其他',
        description: '再提一次',
      },
    );
    expect(result.reused).toBe(true);
    expect(result.request.id).toBe('refund-1');
    expect(prisma.customRecipeRefundRequest.create).not.toHaveBeenCalled();
  });

  it('★ 批量取各订单最新退款申请，供统一订单列表展示', async () => {
    const { service, prisma } = createService();
    (prisma.customRecipeRefundRequest.findMany as jest.Mock).mockResolvedValue([
      buildRequest({
        id: 'refund-newest',
        orderId: 'order-pk-1',
        status: 'PROCESSING',
        createdAt: new Date('2026-10-25T10:30:00+08:00'),
      }),
      buildRequest({
        id: 'refund-older',
        orderId: 'order-pk-1',
        status: 'REJECTED',
        createdAt: new Date('2026-10-24T10:30:00+08:00'),
      }),
      buildRequest({
        id: 'refund-2',
        orderId: 'order-pk-2',
        status: 'PENDING',
        createdAt: new Date('2026-10-25T09:00:00+08:00'),
      }),
    ]);

    const map = await service.getLatestForOrderPks([
      'order-pk-1',
      'order-pk-2',
      'order-pk-3',
    ]);

    expect(map['order-pk-1']?.id).toBe('refund-newest');
    expect(map['order-pk-1']?.status).toBe('PROCESSING');
    expect(map['order-pk-2']?.id).toBe('refund-2');
    expect(map['order-pk-3']).toBeUndefined();
  });

  it('找不到订单给 404', async () => {
    const { service } = createService({ order: null });
    await expect(
      service.createForCustomer('missing', 'customer-1', {
        reasonCode: 'OTHER',
        reasonLabel: '其他',
        description: '不想要了',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('CustomRecipeRefundService · 后台审核', () => {
  it('审核通过调用微信全额退款，并记录退款单号', async () => {
    const { service, prisma, wechat } = createService();
    const result = await service.approve('refund-1', 'admin-1', '同意退款');

    expect(wechat.createCustomRecipeRefund).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: 'CR202610250001' }),
    );
    expect(prisma.customRecipeRefundRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'refund-1' },
        data: expect.objectContaining({
          status: 'REFUNDED',
          refundOutNo: 'CRR1',
          reviewedBy: 'admin-1',
        }),
      }),
    );
    expect(result.status).toBe('REFUNDED');
  });

  it('★ 微信退款失败时申请保持待审核，不能标成已退款', async () => {
    const { service, prisma } = createService();
    (
      prisma as any
    ).customRecipeRefundRequest.findUnique.mockResolvedValue(buildRequest());
    const wechat = (service as any).wechatPaymentService;
    wechat.createCustomRecipeRefund.mockRejectedValue(
      new Error('微信退款未启用'),
    );

    await expect(
      service.approve('refund-1', 'admin-1', '同意'),
    ).rejects.toThrow('微信退款未启用');
    expect(prisma.customRecipeRefundRequest.update).not.toHaveBeenCalled();
  });

  it('驳回写原因并标记 REJECTED', async () => {
    const { service, prisma } = createService();
    const result = await service.reject('refund-1', 'admin-1', '不符合退款条件');
    expect(prisma.customRecipeRefundRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'REJECTED',
          adminNote: '不符合退款条件',
        }),
      }),
    );
    expect(result.status).toBe('REJECTED');
  });
});
