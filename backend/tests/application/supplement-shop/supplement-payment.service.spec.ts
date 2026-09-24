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
import { PrismaService } from '../../../src/infrastructure/prisma.service';

const API_V3_KEY = 'a'.repeat(32); // 必须是 32 字节
const MERCHANT_ORDER_NO = 'SP20260918-001';

/** 用一次性 RSA 密钥对，真实走一遍签名逻辑 */
const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

/** 按微信 APIv3 的规则加密回调资源，验证解密分支真的能跑通 */
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

describe('WechatPaymentService · 补剂订单支付', () => {
  let service: WechatPaymentService;

  const supplementOrder = {
    id: 'order-uuid-1',
    orderNo: MERCHANT_ORDER_NO,
    userId: 'user-1',
    status: 'PENDING_PAYMENT',
    bagCount: 2,
    amountTotal: 31.6,
    paymentStatus: null,
    createdAt: new Date(Date.now() - 60 * 1000),
    user: { phone: '18628258025' },
  };

  /**
   * 完整的支付配置工厂。
   * 测试里要改某个字段时用它覆盖，别手写整块 —— 漏一个字段就会撞上
   * 「支付配置未启用」这种跟当前用例无关的报错，白查半天。
   */
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
    userWechatIdentity: { findFirst: jest.fn(), update: jest.fn() },
    supplementOrder: { findUnique: jest.fn() },
    order: { findUnique: jest.fn() },
  } as any;

  const mockSupplementOrderService = {
    confirmPaymentFromWechat: jest.fn(),
    cancelOrder: jest.fn(),
  };

  /**
   * 补剂商城配置：补剂订单的支付超时已与鲜食解耦，改从这张配置读。
   * 默认 30 分钟，与解耦前的共享值一致。
   */
  const mockSupplementShopConfigService = {
    getConfig: jest.fn().mockResolvedValue({ paymentTimeoutMinutes: 30 }),
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
          useValue: mockSupplementShopConfigService,
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
    mockPrismaService.supplementOrder.findUnique.mockResolvedValue({
      ...supplementOrder,
    });
    mockSupplementOrderService.confirmPaymentFromWechat.mockResolvedValue({
      status: 'PAID',
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('支付超时与鲜食解耦（2026-09-24）', () => {
    it('补剂订单用「补剂商城设置」的超时，不用支付配置里的共享值', async () => {
      jest.spyOn(global, 'fetch' as never).mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ prepay_id: 'prepay-123' }),
      } as never);

      // 支付配置（鲜食用的）说 5 分钟，补剂商城说 120 分钟
      mockPrismaService.paymentConfig.upsert.mockResolvedValue(
        buildPaymentConfig({ paymentTimeoutMinutes: 5 }),
      );
      mockSupplementShopConfigService.getConfig.mockResolvedValue({
        paymentTimeoutMinutes: 120,
      });

      const result = await service.createSupplementJsapiPayment(
        'order-uuid-1',
        'user-1',
      );

      // 必须是补剂自己的 120 分钟 —— 共用一个值会让调一边影响另一边。
      // 剩余秒数用范围断言：订单创建于 60 秒前，跑测试时还会再过几秒，
      // 写死 119*60 会因为 1 秒的漂移偶发失败。118 分钟足够区分
      // 120 分钟和支付配置里的 5 分钟。
      expect(result.paymentTimeoutMinutes).toBe(120);
      expect(result.paymentRemainingSeconds).toBeGreaterThan(118 * 60);
    });

    it('超时配成 0 表示不自动关单：不给期限', async () => {
      jest.spyOn(global, 'fetch' as never).mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ prepay_id: 'prepay-123' }),
      } as never);
      mockSupplementShopConfigService.getConfig.mockResolvedValue({
        paymentTimeoutMinutes: 0,
      });

      const result = await service.createSupplementJsapiPayment(
        'order-uuid-1',
        'user-1',
      );

      expect(result.autoCloseUnpaid).toBe(false);
      expect(result.paymentDeadline).toBeNull();
      expect(result.paymentRemainingSeconds).toBeNull();
    });
  });

  describe('发起支付', () => {
    it('用 SP 订单号作为商户单号，并返回小程序可调起的支付参数', async () => {
      const fetchMock = jest
        .spyOn(global, 'fetch' as never)
        .mockResolvedValue({
          ok: true,
          text: async () => JSON.stringify({ prepay_id: 'prepay-123' }),
        } as never);

      const result = await service.createSupplementJsapiPayment(
        'order-uuid-1',
        'user-1',
      );

      // 请求体：商户单号必须是补剂订单号，金额换算成分
      const [url, init] = fetchMock.mock.calls[0] as [string, any];
      const body = JSON.parse(init.body);
      expect(url).toBe('https://api.mch.weixin.qq.com/v3/pay/transactions/jsapi');
      expect(body.out_trade_no).toBe(MERCHANT_ORDER_NO);
      expect(body.amount.total).toBe(3160);
      expect(body.payer.openid).toBe('openid-abc');
      expect(body.description).toContain('补剂分装小样');
      expect(init.headers.Authorization).toContain('WECHATPAY2-SHA256-RSA2048');

      expect(result.payParams).not.toBeNull();
      expect(result.payParams!.package).toBe('prepay_id=prepay-123');
      expect(result.payParams!.signType).toBe('RSA');
      expect(result.payParams!.paySign).toBeTruthy();
      expect(result.amountTotal).toBe(31.6);
      expect(result.status).toBe('PENDING_PAYMENT');
    });

    it('别人的订单不能发起支付', async () => {
      await expect(
        service.createSupplementJsapiPayment('order-uuid-1', 'user-2'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('已付款的订单不再返回支付参数', async () => {
      mockPrismaService.supplementOrder.findUnique.mockResolvedValue({
        ...supplementOrder,
        status: 'PAID',
        paymentStatus: 'SUCCESS',
      });

      const result = await service.createSupplementJsapiPayment(
        'order-uuid-1',
        'user-1',
      );

      expect(result.status).toBe('PAID');
      expect(result.payParams).toBeNull();
    });

    it('已发货的订单不允许再发起支付', async () => {
      mockPrismaService.supplementOrder.findUnique.mockResolvedValue({
        ...supplementOrder,
        status: 'SHIPPED',
      });

      await expect(
        service.createSupplementJsapiPayment('order-uuid-1', 'user-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('支付配置未启用时给出明确提示', async () => {
      mockPrismaService.paymentConfig.upsert.mockResolvedValue({
        enabled: false,
        provider: 'WECHAT_PAY',
        mode: 'SANDBOX',
        appId: null,
        mchId: null,
        merchantSerialNumber: null,
        apiV3Key: null,
        privateKeyPem: null,
        notifyUrl: null,
        refundNotifyUrl: null,
        paymentTimeoutMinutes: 30,
        autoCloseUnpaid: false,
        allowRefund: false,
      });

      await expect(
        service.createSupplementJsapiPayment('order-uuid-1', 'user-1'),
      ).rejects.toThrow(/支付配置未启用/);
    });
  });

  describe('支付回调', () => {
    function buildNotifyPayload(status = 'SUCCESS', totalFen = 3160) {
      return {
        resource: encryptResource({
          out_trade_no: MERCHANT_ORDER_NO,
          trade_state: status,
          transaction_id: 'wx-txn-999',
          amount: { total: totalFen, payer_total: totalFen },
        }),
      };
    }

    it('SP 前缀的单号会走补剂分支并完成收款', async () => {
      const result = await service.handleWechatNotify(buildNotifyPayload());

      expect(result).toEqual({ handled: true, tradeState: 'SUCCESS' });
      expect(
        mockSupplementOrderService.confirmPaymentFromWechat,
      ).toHaveBeenCalledWith('order-uuid-1', 'wx-txn-999');
      // 不应碰到鲜食订单
      expect(mockPrismaService.order.findUnique).not.toHaveBeenCalled();
    });

    it('金额不一致时拒绝入账', async () => {
      await expect(
        service.handleWechatNotify(buildNotifyPayload('SUCCESS', 100)),
      ).rejects.toThrow(/金额不一致/);
      expect(
        mockSupplementOrderService.confirmPaymentFromWechat,
      ).not.toHaveBeenCalled();
    });

    it('非成功状态忽略处理', async () => {
      const result = await service.handleWechatNotify(
        buildNotifyPayload('NOTPAY'),
      );

      expect(result).toEqual({ handled: false, tradeState: 'NOTPAY' });
      expect(
        mockSupplementOrderService.confirmPaymentFromWechat,
      ).not.toHaveBeenCalled();
    });

    it('单号找不到对应补剂订单时报 404', async () => {
      mockPrismaService.supplementOrder.findUnique.mockResolvedValue(null);

      await expect(
        service.handleWechatNotify(buildNotifyPayload()),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('主动同步支付结果（回调兜底）', () => {
    it('查到 SUCCESS 就补一次收款', async () => {
      jest.spyOn(global, 'fetch' as never).mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify({
            trade_state: 'SUCCESS',
            transaction_id: 'wx-txn-sync',
            amount: { total: 3160 },
          }),
      } as never);

      const result = await service.syncSupplementPayment(
        'order-uuid-1',
        'user-1',
      );

      expect(result.paid).toBe(true);
      expect(
        mockSupplementOrderService.confirmPaymentFromWechat,
      ).toHaveBeenCalledWith('order-uuid-1', 'wx-txn-sync');
    });

    it('还没付就原样返回', async () => {
      jest.spyOn(global, 'fetch' as never).mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ trade_state: 'NOTPAY' }),
      } as never);

      const result = await service.syncSupplementPayment(
        'order-uuid-1',
        'user-1',
      );

      expect(result.paid).toBe(false);
      expect(result.tradeState).toBe('NOTPAY');
      expect(
        mockSupplementOrderService.confirmPaymentFromWechat,
      ).not.toHaveBeenCalled();
    });

    it('订单已不是待付款时不再查微信', async () => {
      mockPrismaService.supplementOrder.findUnique.mockResolvedValue({
        ...supplementOrder,
        status: 'PAID',
        paymentStatus: 'SUCCESS',
      });
      const fetchMock = jest.spyOn(global, 'fetch' as never);

      const result = await service.syncSupplementPayment(
        'order-uuid-1',
        'user-1',
      );

      expect(result).toEqual({
        status: 'PAID',
        paid: true,
        tradeState: null,
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
