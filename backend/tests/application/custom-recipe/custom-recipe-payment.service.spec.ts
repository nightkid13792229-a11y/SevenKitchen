import {
  createCipheriv,
  generateKeyPairSync,
  randomBytes,
} from 'crypto';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { WechatPaymentService } from '../../../src/application/payment/wechat-payment.service';
import { OrderService } from '../../../src/application/order/order.service';
import { WechatShippingUploadService } from '../../../src/application/shipping/wechat-shipping-upload.service';
import { SupplementOrderService } from '../../../src/application/supplement-shop/supplement-order.service';
import { SupplementShopConfigService } from '../../../src/application/supplement-shop/supplement-shop-config.service';
import { CustomRecipeService } from '../../../src/application/custom-recipe/custom-recipe.service';
import { CustomRecipeConfigService } from '../../../src/application/custom-recipe/custom-recipe-config.service';
import { PrismaService } from '../../../src/infrastructure/prisma.service';

/**
 * 定制食谱订单的微信支付（2026-09-25 接入）。
 *
 * 三条业务线共用一套商户配置与回调入口，靠商户单号前缀分流：
 *   - 鲜食订单：32 位十六进制
 *   - 补剂订单：SP 前缀
 *   - 定制订单：CR 前缀
 * 这组测试专门盯住「CR 前缀必须走定制分支，且不能误伤另外两条线」。
 */

const API_V3_KEY = 'b'.repeat(32);
const CUSTOM_ORDER_NO = 'CR202609251234';
const CUSTOM_ORDER_UUID = 'cr-uuid-1';

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

function encryptResource(payload: Record<string, unknown>) {
  const nonce = randomBytes(6).toString('hex').slice(0, 12);
  const associatedData = 'transaction';
  const cipher = createCipheriv(
    'aes-256-gcm',
    Buffer.from(API_V3_KEY, 'utf8'),
    Buffer.from(nonce, 'utf8'),
  );
  cipher.setAAD(Buffer.from(associatedData, 'utf8'));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), 'utf8'),
    cipher.final(),
  ]);
  const ciphertext = Buffer.concat([encrypted, cipher.getAuthTag()]).toString(
    'base64',
  );
  return { ciphertext, nonce, associated_data: associatedData };
}

describe('WechatPaymentService · 定制食谱订单支付', () => {
  let service: WechatPaymentService;

  const customOrder = {
    id: CUSTOM_ORDER_UUID,
    orderId: CUSTOM_ORDER_NO,
    customerId: 'user-1',
    status: 'PENDING_PAYMENT',
    amount: 300,
    createdAt: new Date(Date.now() - 60 * 1000),
    customer: { phone: '18628258025' },
  };

  const buildPaymentConfig = (overrides: Record<string, unknown> = {}) => ({
    enabled: true,
    provider: 'WECHAT_PAY',
    mode: 'PRODUCTION',
    appId: 'wx-test-appid',
    mchId: '1900000001',
    merchantSerialNumber: 'SERIAL123',
    apiV3Key: API_V3_KEY,
    privateKeyPem: privateKey,
    notifyUrl: 'https://api.example.com/api/v1/payments/wechat/notify',
    refundNotifyUrl: null,
    paymentTimeoutMinutes: 30,
    autoCloseUnpaid: true,
    allowRefund: false,
    ...overrides,
  });

  const mockPrismaService = {
    paymentConfig: { upsert: jest.fn() },
    userWechatIdentity: { findFirst: jest.fn() },
    customRecipeOrder: { findFirst: jest.fn(), findUnique: jest.fn() },
    supplementOrder: { findUnique: jest.fn() },
    order: { findUnique: jest.fn() },
  } as any;

  const mockCustomRecipeService = {
    confirmPaymentFromWechat: jest.fn(),
    cancelOrder: jest.fn(),
  };

  const mockCustomRecipeConfigService = {
    getConfig: jest.fn().mockResolvedValue({ paymentTimeoutMinutes: 30 }),
  };

  const mockSupplementOrderService = {
    confirmPaymentFromWechat: jest.fn(),
    cancelOrder: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WechatPaymentService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: OrderService, useValue: {} },
        { provide: WechatShippingUploadService, useValue: {} },
        {
          provide: SupplementOrderService,
          useValue: mockSupplementOrderService,
        },
        {
          provide: SupplementShopConfigService,
          useValue: {
            getConfig: jest.fn().mockResolvedValue({ paymentTimeoutMinutes: 30 }),
          },
        },
        { provide: CustomRecipeService, useValue: mockCustomRecipeService },
        {
          provide: CustomRecipeConfigService,
          useValue: mockCustomRecipeConfigService,
        },
      ],
    }).compile();

    service = module.get(WechatPaymentService);
    jest.clearAllMocks();

    mockPrismaService.paymentConfig.upsert.mockResolvedValue(
      buildPaymentConfig(),
    );
    mockPrismaService.userWechatIdentity.findFirst.mockResolvedValue({
      openid: 'openid-abc',
    });
    mockPrismaService.customRecipeOrder.findFirst.mockResolvedValue({
      ...customOrder,
    });
    mockPrismaService.customRecipeOrder.findUnique.mockResolvedValue({
      ...customOrder,
    });
    mockCustomRecipeService.confirmPaymentFromWechat.mockResolvedValue({
      order: { status: 'PAID' },
      alreadyPaid: false,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('发起支付', () => {
    it('用 CR 订单号作为商户单号，并返回小程序可调起的支付参数', async () => {
      const fetchMock = jest
        .spyOn(global, 'fetch' as never)
        .mockResolvedValue({
          ok: true,
          text: async () => JSON.stringify({ prepay_id: 'prepay-cr-1' }),
        } as never);

      const result = await service.createCustomRecipeJsapiPayment(
        CUSTOM_ORDER_NO,
        'user-1',
      );

      const body = JSON.parse(String((fetchMock.mock.calls[0] as any)[1].body));
      expect(body.out_trade_no).toBe(CUSTOM_ORDER_NO);
      expect(body.amount.total).toBe(30000); // 300 元 = 30000 分
      expect(result.payParams?.package).toBe('prepay_id=prepay-cr-1');
      expect(result.amountTotal).toBe(300);
    });

    it('订单已支付时不再重复下单', async () => {
      mockPrismaService.customRecipeOrder.findFirst.mockResolvedValue({
        ...customOrder,
        status: 'PAID',
      });

      const result = await service.createCustomRecipeJsapiPayment(
        CUSTOM_ORDER_NO,
        'user-1',
      );

      expect(result.status).toBe('PAID');
      expect(result.payParams).toBeNull();
    });

    it('订单已关闭时明确拒绝发起支付', async () => {
      mockPrismaService.customRecipeOrder.findFirst.mockResolvedValue({
        ...customOrder,
        status: 'CANCELLED',
      });

      await expect(
        service.createCustomRecipeJsapiPayment(CUSTOM_ORDER_NO, 'user-1'),
      ).rejects.toThrow(/已关闭/);
    });

    it('别人的订单不允许发起支付', async () => {
      await expect(
        service.createCustomRecipeJsapiPayment(CUSTOM_ORDER_NO, 'user-other'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('支付超时取「食谱定制设置」，与鲜食/补剂各自独立', async () => {
      jest.spyOn(global, 'fetch' as never).mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ prepay_id: 'prepay-cr-1' }),
      } as never);

      mockPrismaService.paymentConfig.upsert.mockResolvedValue(
        buildPaymentConfig({ paymentTimeoutMinutes: 5 }),
      );
      mockCustomRecipeConfigService.getConfig.mockResolvedValue({
        paymentTimeoutMinutes: 120,
      });

      const result = await service.createCustomRecipeJsapiPayment(
        CUSTOM_ORDER_NO,
        'user-1',
      );

      expect(result.paymentTimeoutMinutes).toBe(120);
      expect(result.paymentRemainingSeconds).toBeGreaterThan(118 * 60);
    });

    it('支付超时配成 0 时不自动关单', async () => {
      jest.spyOn(global, 'fetch' as never).mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ prepay_id: 'prepay-cr-1' }),
      } as never);
      mockCustomRecipeConfigService.getConfig.mockResolvedValue({
        paymentTimeoutMinutes: 0,
      });

      const result = await service.createCustomRecipeJsapiPayment(
        CUSTOM_ORDER_NO,
        'user-1',
      );

      expect(result.autoCloseUnpaid).toBe(false);
      expect(result.paymentDeadline).toBeNull();
    });
  });

  describe('支付回调', () => {
    function buildNotifyPayload(status = 'SUCCESS', totalFen = 30000) {
      return {
        resource: encryptResource({
          out_trade_no: CUSTOM_ORDER_NO,
          trade_state: status,
          transaction_id: 'wx-txn-cr-1',
          amount: { total: totalFen, payer_total: totalFen },
        }),
      };
    }

    it('CR 前缀的单号会走定制分支并完成收款', async () => {
      const result = await service.handleWechatNotify(buildNotifyPayload());

      expect(result).toEqual({ handled: true, tradeState: 'SUCCESS' });
      expect(
        mockCustomRecipeService.confirmPaymentFromWechat,
      ).toHaveBeenCalledWith(CUSTOM_ORDER_NO, 'wx-txn-cr-1');
      // 不能误伤另外两条线
      expect(mockSupplementOrderService.confirmPaymentFromWechat).not.toHaveBeenCalled();
      expect(mockPrismaService.order.findUnique).not.toHaveBeenCalled();
    });

    it('金额不一致时拒绝入账', async () => {
      await expect(
        service.handleWechatNotify(buildNotifyPayload('SUCCESS', 100)),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(
        mockCustomRecipeService.confirmPaymentFromWechat,
      ).not.toHaveBeenCalled();
    });

    it('非成功状态忽略处理', async () => {
      const result = await service.handleWechatNotify(
        buildNotifyPayload('NOTPAY'),
      );

      expect(result).toEqual({ handled: false, tradeState: 'NOTPAY' });
      expect(
        mockCustomRecipeService.confirmPaymentFromWechat,
      ).not.toHaveBeenCalled();
    });

    it('单号找不到对应定制订单时报 404', async () => {
      mockPrismaService.customRecipeOrder.findUnique.mockResolvedValue(null);

      await expect(
        service.handleWechatNotify(buildNotifyPayload()),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('主动查单兜底', () => {
    it('微信侧已支付时补记收款', async () => {
      jest.spyOn(global, 'fetch' as never).mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify({
            trade_state: 'SUCCESS',
            transaction_id: 'wx-txn-cr-1',
            amount: { total: 30000 },
          }),
      } as never);

      const result = await service.syncCustomRecipePayment(
        CUSTOM_ORDER_NO,
        'user-1',
      );

      expect(result.paid).toBe(true);
      expect(
        mockCustomRecipeService.confirmPaymentFromWechat,
      ).toHaveBeenCalledWith(CUSTOM_ORDER_NO, 'wx-txn-cr-1');
    });

    it('微信侧未支付时保持原状态', async () => {
      jest.spyOn(global, 'fetch' as never).mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ trade_state: 'NOTPAY' }),
      } as never);

      const result = await service.syncCustomRecipePayment(
        CUSTOM_ORDER_NO,
        'user-1',
      );

      expect(result.paid).toBe(false);
      expect(
        mockCustomRecipeService.confirmPaymentFromWechat,
      ).not.toHaveBeenCalled();
    });
  });
});
