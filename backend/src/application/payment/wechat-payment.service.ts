import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  createDecipheriv,
  createSign,
  randomBytes,
} from 'crypto';
import { PrismaService } from '../../infrastructure/prisma.service';
import { OrderService } from '../order/order.service';
import { OrderStatus } from '../../domain';
import { WechatShippingUploadService } from '../shipping/wechat-shipping-upload.service';

type RuntimePaymentConfig = {
  enabled: boolean;
  provider: string;
  mode: string;
  appId: string | null;
  mchId: string | null;
  merchantSerialNumber: string | null;
  apiV3Key: string | null;
  privateKeyPem: string | null;
  notifyUrl: string | null;
  refundNotifyUrl: string | null;
  paymentTimeoutMinutes: number;
  autoCloseUnpaid: boolean;
  allowRefund: boolean;
};

export interface WechatPayParams {
  provider: 'WECHAT_PAY';
  mode: string;
  orderId: string;
  status: string;
  amountTotal: number;
  paymentDeadline: string | null;
  paymentRemainingSeconds: number | null;
  paymentTimeoutMinutes: number;
  autoCloseUnpaid: boolean;
  payParams: {
    appId: string;
    timeStamp: string;
    nonceStr: string;
    package: string;
    signType: 'RSA';
    paySign: string;
  } | null;
  orderInfo?: WechatOrderInfo | null;
}

type WechatOrderInfo = {
  create_time: string;
  type: number;
  out_order_id: string;
  openid: string;
  path: string;
  out_user_id: string;
  order_detail: {
    product_infos: Array<{
      out_product_id: string;
      out_sku_id: string;
      product_cnt: number;
      sale_price: number;
      path: string;
      title: string;
      head_img?: string;
    }>;
    pay_info: {
      pay_method_type: number;
      prepay_id: string;
      prepay_time: string;
    };
    price_info: {
      order_price: number;
      freight: number;
    };
  };
};

@Injectable()
export class WechatPaymentService {
  private readonly logger = new Logger(WechatPaymentService.name);
  private readonly wechatPayBaseUrl = 'https://api.mch.weixin.qq.com';

  constructor(
    private readonly prisma: PrismaService,
    private readonly orderService: OrderService,
    private readonly wechatShippingUploadService: WechatShippingUploadService,
  ) {}

  async createJsapiPayment(
    orderId: string,
    customerId: string,
  ): Promise<WechatPayParams> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { customer: true, items: true },
    });

    if (!order || order.customerId !== customerId) {
      throw new NotFoundException('订单不存在');
    }

    const config = await this.getRuntimePaymentConfig();
    const paymentWindow = this.buildPaymentWindow(
      order.createdAt,
      config.paymentTimeoutMinutes,
      config.autoCloseUnpaid,
    );

    if (order.status === OrderStatus.PAID) {
      return {
        provider: 'WECHAT_PAY',
        mode: config.mode,
        orderId,
        status: order.status,
        amountTotal: this.toMoneyNumber(order.amountTotal),
        ...paymentWindow,
        paymentTimeoutMinutes: config.paymentTimeoutMinutes,
        autoCloseUnpaid: config.autoCloseUnpaid,
        payParams: null,
        orderInfo: null,
      };
    }

    if (order.status !== OrderStatus.PENDING_PAYMENT) {
      throw new BadRequestException('当前订单状态不允许发起支付');
    }

    if (
      config.autoCloseUnpaid &&
      paymentWindow.paymentRemainingSeconds !== null &&
      paymentWindow.paymentRemainingSeconds <= 0
    ) {
      await this.orderService.cancelOrder(
        order.id,
        '支付超时自动取消',
        'system',
        null,
      );
      throw new BadRequestException('订单已超过支付时间，已自动关闭');
    }

    this.assertConfigReady(config);

    const payerOpenid = await this.resolvePayerOpenid(
      order.customerId,
      config.appId!,
      order.customer.phone,
    );
    if (!payerOpenid) {
      throw new BadRequestException(
        '当前账号缺少当前小程序的微信身份，请先在新版小程序重新登录后再支付',
      );
    }

    const outTradeNo = this.toOutTradeNo(order.id);
    const totalFen = this.toFen(order.amountTotal);
    const description = this.buildOrderDescription(order);
    const requestBody = {
      appid: config.appId,
      mchid: config.mchId,
      description,
      out_trade_no: outTradeNo,
      notify_url: config.notifyUrl,
      amount: {
        total: totalFen,
        currency: 'CNY',
      },
      detail: {
        goods_detail: [
          {
            merchant_goods_id: outTradeNo,
            goods_name: description,
            quantity: 1,
            unit_price: totalFen,
          },
        ],
      },
      payer: {
        openid: payerOpenid,
      },
    };

    const response = await this.callWechatPay<{
      prepay_id?: string;
      message?: string;
    }>('POST', '/v3/pay/transactions/jsapi', requestBody, config);

    if (!response.prepay_id) {
      throw new BadRequestException('微信支付预下单失败：未返回 prepay_id');
    }

    const orderInfo = this.buildWechatOrderInfo(
      order,
      outTradeNo,
      totalFen,
      response.prepay_id,
      payerOpenid,
    );
    const timeStamp = Math.floor(Date.now() / 1000).toString();
    const nonceStr = this.createNonce();
    const packageValue = `prepay_id=${response.prepay_id}`;
    const paySign = this.sign(
      `${config.appId}\n${timeStamp}\n${nonceStr}\n${packageValue}\n`,
      config.privateKeyPem!,
    );

    return {
      provider: 'WECHAT_PAY',
      mode: config.mode,
      orderId,
      status: order.status,
      amountTotal: this.toMoneyNumber(order.amountTotal),
      ...paymentWindow,
      paymentTimeoutMinutes: config.paymentTimeoutMinutes,
      autoCloseUnpaid: config.autoCloseUnpaid,
      orderInfo,
      payParams: {
        appId: config.appId!,
        timeStamp,
        nonceStr,
        package: packageValue,
        signType: 'RSA',
        paySign,
      },
    };
  }

  async handleWechatNotify(payload: any) {
    const config = await this.getRuntimePaymentConfig();
    this.assertConfigReady(config);

    const resource = payload?.resource;
    if (
      !resource?.ciphertext ||
      !resource?.nonce ||
      !resource?.associated_data
    ) {
      throw new BadRequestException('微信支付通知参数不完整');
    }

    const decrypted = this.decryptResource(
      resource.ciphertext,
      resource.nonce,
      resource.associated_data,
      config.apiV3Key!,
    );

    const outTradeNo = String(decrypted.out_trade_no || '');
    const orderId = this.fromOutTradeNo(outTradeNo);
    const tradeState = String(decrypted.trade_state || '');
    const transactionId = String(decrypted.transaction_id || '');
    const paidFen = Number(decrypted.amount?.payer_total ?? decrypted.amount?.total);

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException('订单不存在');
    }

    const expectedFen = this.toFen(order.amountTotal);
    if (paidFen !== expectedFen) {
      this.logger.error(
        `Wechat notify amount mismatch: order=${order.id}, expected=${expectedFen}, paid=${paidFen}`,
      );
      throw new BadRequestException('支付金额与订单金额不一致');
    }

    if (tradeState !== 'SUCCESS') {
      this.logger.warn(
        `Wechat notify ignored: order=${order.id}, tradeState=${tradeState}`,
      );
      return { handled: false, tradeState };
    }

    await this.orderService.processPayment(
      order.id,
      'WECHAT_PAY',
      'system',
      null,
      transactionId || undefined,
    );

    this.reportSpecialShippingOrderAfterPayment(order.id);

    return { handled: true, tradeState };
  }

  private reportSpecialShippingOrderAfterPayment(orderId: string) {
    this.wechatShippingUploadService
      .reportSpecialOrderForOrder(orderId, 'system', null)
      .catch((error) => {
        this.logger.error(
          `Failed to report WeChat special shipping order after payment for ${orderId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });
  }

  async createRefund(input: {
    orderId: string;
    amount: number;
    reason: string;
    adminId?: string | null;
    source?: 'AFTERSALE_APPROVE' | 'ADMIN_RETRY';
  }) {
    const order = await this.prisma.order.findUnique({
      where: { id: input.orderId },
    });

    if (!order) {
      throw new NotFoundException('订单不存在');
    }

    const existingSuccess = await this.prisma.orderRefundRecord.findFirst({
      where: { orderId: order.id, success: true },
      orderBy: { createdAt: 'desc' },
    });
    if (existingSuccess) {
      return this.mapRefundRecordResult(existingSuccess, true);
    }

    const latestRecord = await this.prisma.orderRefundRecord.findFirst({
      where: { orderId: order.id },
      orderBy: { createdAt: 'desc' },
    });
    if (latestRecord && this.isRefundInFlight(latestRecord.status)) {
      return this.mapRefundRecordResult(latestRecord, true);
    }

    const legacySuccess = await this.prisma.orderSettlementAdjustment.findFirst({
      where: {
        orderId: order.id,
        sourceType: 'WECHAT_REFUND',
        status: 'SETTLED',
      },
      orderBy: { createdAt: 'desc' },
    });
    if (legacySuccess) {
      const metadata = (legacySuccess.metadata as Record<string, any> | null) ?? {};
      return {
        outRefundNo: String(legacySuccess.sourceId || metadata.outRefundNo || ''),
        refundId: metadata.refundId ?? null,
        status: metadata.refundStatus ?? metadata.wechatStatus ?? legacySuccess.status,
        adjustmentId: legacySuccess.id,
        recordId: null,
        reused: true,
      };
    }

    const isResolvedRefundOrder =
      order.status === OrderStatus.CANCELLED &&
      (order.cancellationReason || '').includes('售后退款');
    if (
      order.status !== OrderStatus.PAID &&
      order.status !== OrderStatus.AFTERSALE &&
      !isResolvedRefundOrder
    ) {
      throw new BadRequestException('只有已支付或售后中的订单可以发起线上退款');
    }

    if (order.paymentMethod !== 'WECHAT_PAY') {
      throw new BadRequestException('该订单不是微信线上支付订单，不能自动发起微信退款');
    }

    const config = await this.getRuntimePaymentConfig();
    this.assertConfigReady(config);

    if (!config.allowRefund) {
      throw new BadRequestException('线上退款未启用，请先在后台支付配置中开启');
    }

    const refundAmount = this.toMoneyNumber(input.amount);
    const orderAmount = this.toMoneyNumber(order.amountTotal);
    if (!Number.isFinite(refundAmount) || refundAmount <= 0) {
      throw new BadRequestException('退款金额必须大于 0');
    }
    if (refundAmount > orderAmount) {
      throw new BadRequestException('退款金额不能超过订单金额');
    }

    const operator = input.adminId
      ? await this.prisma.user.findUnique({
          where: { id: input.adminId },
          select: { nickname: true, phone: true, role: true },
        })
      : null;
    const operatorNameSnapshot =
      operator?.nickname || operator?.phone || operator?.role || null;

    const outTradeNo = this.toOutTradeNo(order.id);
    const outRefundNo = this.toOutRefundNo(order.id);
    const requestBody = {
      out_trade_no: outTradeNo,
      out_refund_no: outRefundNo,
      reason: input.reason.slice(0, 80),
      notify_url: config.refundNotifyUrl || config.notifyUrl,
      amount: {
        refund: this.toFen(refundAmount),
        total: this.toFen(order.amountTotal),
        currency: 'CNY',
      },
    };

    const record = await this.prisma.orderRefundRecord.create({
      data: {
        orderId: order.id,
        outTradeNo,
        outRefundNo,
        amount: refundAmount,
        totalAmount: orderAmount,
        reason: input.reason,
        source: input.source ?? 'ADMIN_RETRY',
        status: 'PENDING',
        statusText: this.getRefundStatusText('PENDING', false),
        operatorId: operator ? input.adminId ?? null : null,
        operatorNameSnapshot,
        requestPayload: requestBody,
      },
    });

    try {
      const response = await this.callWechatPay<any>(
        'POST',
        '/v3/refund/domestic/refunds',
        requestBody,
        config,
      );

      const responseStatus = String(response.status || 'PROCESSING');
      const success = responseStatus === 'SUCCESS';
      const successTime = this.parseWechatTime(response.success_time);

      const adjustment = await this.prisma.orderSettlementAdjustment.upsert({
        where: {
          orderId_sourceType_sourceId: {
            orderId: order.id,
            sourceType: 'WECHAT_REFUND',
            sourceId: outRefundNo,
          },
        },
        create: {
          orderId: order.id,
          sourceType: 'WECHAT_REFUND',
          sourceId: outRefundNo,
          adjustmentType: 'REFUND',
          amount: -refundAmount,
          reason: input.reason,
          status: success ? 'SETTLED' : 'PENDING',
          requiresCustomerPayment: false,
          visibleToCustomer: true,
          createdBy: 'admin',
          createdById: input.adminId ?? null,
          metadata: {
            outRefundNo,
            refundId: response.refund_id ?? null,
            wechatStatus: responseStatus,
            refundStatus: responseStatus,
            refundRecordId: record.id,
            successTime: successTime?.toISOString() ?? null,
          },
          settledAt: success ? successTime ?? new Date() : null,
        },
        update: {
          status: success ? 'SETTLED' : 'PENDING',
          metadata: {
            outRefundNo,
            refundId: response.refund_id ?? null,
            wechatStatus: responseStatus,
            refundStatus: responseStatus,
            refundRecordId: record.id,
            successTime: successTime?.toISOString() ?? null,
          },
          settledAt: success ? successTime ?? new Date() : undefined,
        },
      });

      const updatedRecord = await this.prisma.orderRefundRecord.update({
        where: { id: record.id },
        data: {
          refundId: response.refund_id ?? null,
          status: responseStatus,
          statusText: this.getRefundStatusText(responseStatus, success),
          success,
          responsePayload: response,
          adjustmentId: adjustment.id,
          successTime: success ? successTime ?? new Date() : null,
        },
      });

      return this.mapRefundRecordResult(updatedRecord, false);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '微信退款发起失败，请稍后重试';
      await this.prisma.orderRefundRecord.update({
        where: { id: record.id },
        data: {
          status: 'FAILED',
          statusText: '退款发起失败，未确认钱款退回',
          errorMessage: message,
        },
      });
      throw error;
    }
  }

  async handleWechatRefundNotify(payload: any) {
    const config = await this.getRuntimePaymentConfig();
    this.assertConfigReady(config);

    const resource = payload?.resource;
    if (
      !resource?.ciphertext ||
      !resource?.nonce ||
      !resource?.associated_data
    ) {
      throw new BadRequestException('微信退款通知参数不完整');
    }

    const decrypted = this.decryptResource(
      resource.ciphertext,
      resource.nonce,
      resource.associated_data,
      config.apiV3Key!,
    );

    const outTradeNo = String(decrypted.out_trade_no || '');
    const outRefundNo = String(decrypted.out_refund_no || '');
    const refundStatus = String(decrypted.refund_status || decrypted.status || '');
    const orderId = this.fromOutTradeNo(outTradeNo);

    const record = await this.prisma.orderRefundRecord.findUnique({
      where: { outRefundNo },
    });

    const adjustment = await this.prisma.orderSettlementAdjustment.findFirst({
      where: {
        orderId,
        sourceType: 'WECHAT_REFUND',
        sourceId: outRefundNo,
      },
    });

    if (!adjustment && !record) {
      this.logger.warn(
        `Wechat refund notify ignored: refund record not found, outRefundNo=${outRefundNo}`,
      );
      return { handled: false, refundStatus };
    }

    const successTime = this.parseWechatTime(decrypted.success_time);

    if (refundStatus === 'SUCCESS') {
      if (adjustment) {
        await this.prisma.orderSettlementAdjustment.update({
          where: { id: adjustment.id },
          data: {
            status: 'SETTLED',
            settledAt: successTime ?? new Date(),
            metadata: {
              ...(adjustment.metadata as Record<string, unknown> | null),
              refundStatus,
              successTime: decrypted.success_time ?? null,
              refundRecordId: record?.id ?? null,
            },
          },
        });
      }
      if (record) {
        await this.prisma.orderRefundRecord.update({
          where: { id: record.id },
          data: {
            refundId: decrypted.refund_id ?? record.refundId,
            status: refundStatus,
            statusText: this.getRefundStatusText(refundStatus, true),
            success: true,
            notifyPayload: decrypted,
            notifiedAt: new Date(),
            successTime: successTime ?? new Date(),
            adjustmentId: adjustment?.id ?? record.adjustmentId,
          },
        });
      }
      return { handled: true, refundStatus };
    }

    if (adjustment) {
      await this.prisma.orderSettlementAdjustment.update({
        where: { id: adjustment.id },
        data: {
          metadata: {
            ...(adjustment.metadata as Record<string, unknown> | null),
            refundStatus,
            refundRecordId: record?.id ?? null,
          },
        },
      });
    }

    if (record) {
      await this.prisma.orderRefundRecord.update({
        where: { id: record.id },
        data: {
          refundId: decrypted.refund_id ?? record.refundId,
          status: refundStatus || record.status,
          statusText: this.getRefundStatusText(refundStatus || record.status, false),
          notifyPayload: decrypted,
          notifiedAt: new Date(),
          adjustmentId: adjustment?.id ?? record.adjustmentId,
        },
      });
    }

    return { handled: false, refundStatus };
  }

  buildPaymentWindow(
    createdAt: Date,
    timeoutMinutes: number,
    autoCloseUnpaid: boolean,
  ) {
    if (!autoCloseUnpaid) {
      return {
        paymentDeadline: null,
        paymentRemainingSeconds: null,
      };
    }

    const safeTimeoutMinutes = Math.max(1, Number(timeoutMinutes || 30));
    const deadlineMs = createdAt.getTime() + safeTimeoutMinutes * 60 * 1000;
    const remainingSeconds = Math.max(
      0,
      Math.floor((deadlineMs - Date.now()) / 1000),
    );

    return {
      paymentDeadline: new Date(deadlineMs).toISOString(),
      paymentRemainingSeconds: remainingSeconds,
    };
  }

  async getPaymentWindowForOrder(createdAt: Date) {
    const config = await this.getRuntimePaymentConfig();
    return {
      ...this.buildPaymentWindow(
        createdAt,
        config.paymentTimeoutMinutes,
        config.autoCloseUnpaid,
      ),
      paymentTimeoutMinutes: config.paymentTimeoutMinutes,
      paymentAutoCloseEnabled: config.autoCloseUnpaid,
    };
  }

  private async getRuntimePaymentConfig(): Promise<RuntimePaymentConfig> {
    return this.prisma.paymentConfig.upsert({
      where: { id: 'singleton' },
      create: {},
      update: {},
      select: {
        enabled: true,
        provider: true,
        mode: true,
        appId: true,
        mchId: true,
        merchantSerialNumber: true,
        apiV3Key: true,
        privateKeyPem: true,
        notifyUrl: true,
        refundNotifyUrl: true,
        paymentTimeoutMinutes: true,
        autoCloseUnpaid: true,
        allowRefund: true,
      },
    });
  }

  private async resolvePayerOpenid(
    customerId: string,
    appId: string,
    phone?: string | null,
  ): Promise<string | null> {
    const identity = await this.prisma.userWechatIdentity.findFirst({
      where: {
        userId: customerId,
        appId,
      },
      orderBy: {
        lastLoginAt: 'desc',
      },
      select: {
        openid: true,
      },
    });

    if (identity?.openid) {
      return identity.openid;
    }

    const normalizedPhone = phone?.trim();
    if (!normalizedPhone) {
      return null;
    }

    const phoneIdentity = await this.prisma.userWechatIdentity.findFirst({
      where: {
        appId,
        user: {
          phone: normalizedPhone,
        },
      },
      orderBy: {
        lastLoginAt: 'desc',
      },
      select: {
        id: true,
        openid: true,
        userId: true,
      },
    });

    if (!phoneIdentity?.openid) {
      return null;
    }

    if (phoneIdentity.userId !== customerId) {
      await this.prisma.userWechatIdentity.update({
        where: { id: phoneIdentity.id },
        data: {
          userId: customerId,
          lastLoginAt: new Date(),
        },
      });
    }

    return phoneIdentity.openid;
  }

  private assertConfigReady(config: RuntimePaymentConfig) {
    if (!config.enabled) {
      throw new BadRequestException('支付配置未启用，请先在后台支付配置中开启');
    }

    if (config.provider !== 'WECHAT_PAY') {
      throw new BadRequestException('当前支付服务商不是微信支付');
    }

    const missing: string[] = [];
    if (!config.appId) missing.push('小程序 AppID');
    if (!config.mchId) missing.push('微信支付商户号');
    if (!config.merchantSerialNumber) missing.push('商户 API 证书序列号');
    if (!config.apiV3Key) missing.push('APIv3 密钥');
    if (!config.privateKeyPem) missing.push('商户 API 私钥');
    if (!config.notifyUrl) missing.push('支付回调地址');

    if (missing.length > 0) {
      throw new BadRequestException(
        `支付配置未完成，请在后台支付配置中补充：${missing.join('、')}`,
      );
    }
  }

  private async callWechatPay<T>(
    method: 'POST' | 'GET',
    path: string,
    body: unknown,
    config: RuntimePaymentConfig,
  ): Promise<T> {
    const bodyText = body ? JSON.stringify(body) : '';
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonceStr = this.createNonce();
    const signature = this.sign(
      `${method}\n${path}\n${timestamp}\n${nonceStr}\n${bodyText}\n`,
      config.privateKeyPem!,
    );

    const authorization =
      `WECHATPAY2-SHA256-RSA2048 mchid="${config.mchId}",` +
      `nonce_str="${nonceStr}",` +
      `signature="${signature}",` +
      `timestamp="${timestamp}",` +
      `serial_no="${config.merchantSerialNumber}"`;

    const response = await fetch(`${this.wechatPayBaseUrl}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        Authorization: authorization,
        'Content-Type': 'application/json',
        'User-Agent': 'SevenKitchen/1.0',
      },
      body: bodyText || undefined,
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) : {};

    if (!response.ok) {
      this.logger.error(
        `Wechat Pay API error ${response.status}: ${this.maskWechatError(data)}`,
      );
      throw new BadRequestException(
        `微信支付接口失败：${data?.message || data?.code || response.status}`,
      );
    }

    return data as T;
  }

  private decryptResource(
    ciphertext: string,
    nonce: string,
    associatedData: string,
    apiV3Key: string,
  ) {
    const ciphertextBuffer = Buffer.from(ciphertext, 'base64');
    const authTag = ciphertextBuffer.subarray(ciphertextBuffer.length - 16);
    const data = ciphertextBuffer.subarray(0, ciphertextBuffer.length - 16);
    const decipher = createDecipheriv(
      'aes-256-gcm',
      Buffer.from(apiV3Key, 'utf8'),
      Buffer.from(nonce, 'utf8'),
    );
    decipher.setAuthTag(authTag);
    decipher.setAAD(Buffer.from(associatedData, 'utf8'));
    const decoded = Buffer.concat([decipher.update(data), decipher.final()]);
    return JSON.parse(decoded.toString('utf8'));
  }

  private sign(message: string, privateKeyPem: string): string {
    const signer = createSign('RSA-SHA256');
    signer.update(message);
    signer.end();
    return signer.sign(privateKeyPem, 'base64');
  }

  private createNonce() {
    return randomBytes(16).toString('hex');
  }

  private toOutTradeNo(orderId: string) {
    return orderId.replace(/-/g, '');
  }

  private toOutRefundNo(orderId: string) {
    const suffix = new Date()
      .toISOString()
      .replace(/\D/g, '')
      .slice(0, 14);
    const random = randomBytes(2).toString('hex').toUpperCase();
    return `RF${this.toOutTradeNo(orderId)}${suffix}${random}`;
  }

  private fromOutTradeNo(outTradeNo: string) {
    const normalized = outTradeNo.trim();
    if (/^[0-9a-f]{32}$/i.test(normalized)) {
      return normalized.replace(
        /^(.{8})(.{4})(.{4})(.{4})(.{12})$/,
        '$1-$2-$3-$4-$5',
      );
    }
    return normalized;
  }

  private buildWechatOrderInfo(
    order: {
      id: string;
      customerId: string;
      createdAt: Date;
      amountTotal: unknown;
      amountShipping?: unknown;
      customer: {
        wechatOpenid?: string | null;
      };
      items?: Array<{
        id: string;
        recipeId?: string | null;
        recipeSnapshot?: unknown;
        packageCount?: number | null;
        totalPrice?: unknown;
      }>;
    },
    outTradeNo: string,
    totalFen: number,
    prepayId: string,
    payerOpenid: string,
  ): WechatOrderInfo {
    const productInfos = (order.items || []).map((item, index) => {
      const recipeId = item.recipeId || this.extractRecipeId(item.recipeSnapshot);
      const title = this.extractRecipeName(item.recipeSnapshot) || 'SevenKitchen 鲜食';
      const coverImageUrl = this.extractRecipeCoverImage(item.recipeSnapshot);
      const path = recipeId
        ? `pages/recipe-detail/index?id=${recipeId}`
        : `pages/order-detail/index?id=${outTradeNo}`;

      return {
        out_product_id: recipeId || item.id || `${outTradeNo}-${index + 1}`,
        out_sku_id: item.id || `${outTradeNo}-${index + 1}`,
        product_cnt: 1,
        sale_price: this.toFen(item.totalPrice ?? order.amountTotal),
        path,
        title: title.slice(0, 120),
        ...(coverImageUrl ? { head_img: coverImageUrl } : {}),
      };
    });

    return {
      create_time: this.formatWechatOrderTime(order.createdAt),
      type: 0,
      out_order_id: outTradeNo,
      openid: payerOpenid,
      path: `pages/order-detail/index?id=${outTradeNo}`,
      out_user_id: order.customerId,
      order_detail: {
        product_infos:
          productInfos.length > 0
            ? productInfos
            : [
                {
                  out_product_id: outTradeNo,
                  out_sku_id: outTradeNo,
                  product_cnt: 1,
                  sale_price: totalFen,
                  path: `pages/order-detail/index?id=${outTradeNo}`,
                  title: 'SevenKitchen 鲜食订单',
                },
              ],
        pay_info: {
          pay_method_type: 0,
          prepay_id: prepayId,
          prepay_time: this.formatWechatOrderTime(new Date()),
        },
        price_info: {
          order_price: totalFen,
          freight: this.toFen(order.amountShipping || 0),
        },
      },
    };
  }

  private formatWechatOrderTime(value: Date) {
    const pad = (part: number) => String(part).padStart(2, '0');
    return (
      [value.getFullYear(), pad(value.getMonth() + 1), pad(value.getDate())].join('-') +
      ` ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`
    );
  }

  private shortOrderNo(orderId: string) {
    return this.toOutTradeNo(orderId).slice(-8).toUpperCase();
  }

  private buildOrderDescription(order: {
    id: string;
    items?: Array<{
      recipeSnapshot?: unknown;
      packageCount?: number | null;
      quantityG?: number | null;
    }>;
  }) {
    const items = order.items || [];
    const firstItem = items[0];
    const recipeName = this.extractRecipeName(firstItem?.recipeSnapshot);
    const itemCount = items.length || 1;
    const packageCount = items.reduce(
      (sum, item) => sum + Math.max(0, Number(item.packageCount || 0)),
      0,
    );
    const quantityKg =
      items.reduce(
        (sum, item) => sum + Math.max(0, Number(item.quantityG || 0)),
        0,
      ) / 1000;

    const parts = [
      recipeName || '宠物鲜食',
      itemCount > 1 ? `等${itemCount}件` : '',
      packageCount > 0 ? `${packageCount}袋` : '',
      quantityKg > 0 ? `${Number(quantityKg.toFixed(1))}kg` : '',
    ].filter(Boolean);

    const description = `SevenKitchen ${parts.join(' ')}`.trim();
    return description.length > 127 ? description.slice(0, 127) : description;
  }

  private extractRecipeName(snapshot: unknown): string {
    if (!snapshot || typeof snapshot !== 'object') return '';
    const value = (snapshot as { name?: unknown }).name;
    return typeof value === 'string' ? value.trim() : '';
  }

  private extractRecipeId(snapshot: unknown): string {
    if (!snapshot || typeof snapshot !== 'object') return '';
    const value = (snapshot as { id?: unknown }).id;
    return typeof value === 'string' ? value.trim() : '';
  }

  private extractRecipeCoverImage(snapshot: unknown): string {
    if (!snapshot || typeof snapshot !== 'object') return '';
    const value = (snapshot as { coverImageUrl?: unknown }).coverImageUrl;
    return typeof value === 'string' ? value.trim() : '';
  }

  private toFen(value: unknown) {
    return Math.round(this.toMoneyNumber(value) * 100);
  }

  private toMoneyNumber(value: unknown) {
    if (typeof value === 'number') return Number(value.toFixed(2));
    if (value && typeof value === 'object' && 'toNumber' in value) {
      return Number((value as { toNumber: () => number }).toNumber().toFixed(2));
    }
    return Number(Number(value || 0).toFixed(2));
  }

  private isRefundInFlight(status: string | null | undefined) {
    return ['PENDING', 'PROCESSING'].includes(String(status || '').toUpperCase());
  }

  private getRefundStatusText(status: string, success: boolean): string {
    if (success) return '退款成功，钱款已原路退回';
    const statusMap: Record<string, string> = {
      PENDING: '退款处理中，等待微信确认',
      PROCESSING: '退款处理中，等待微信确认',
      ABNORMAL: '退款异常，请管理员到微信商户平台核查',
      CLOSED: '退款已关闭，请管理员核查',
      FAILED: '退款发起失败，未确认钱款退回',
    };
    return statusMap[status] || `退款状态：${status}`;
  }

  private parseWechatTime(value: unknown): Date | null {
    if (!value || typeof value !== 'string') return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private mapRefundRecordResult(record: {
    id: string;
    outRefundNo: string;
    refundId: string | null;
    status: string;
    adjustmentId: string | null;
  }, reused: boolean) {
    return {
      outRefundNo: record.outRefundNo,
      refundId: record.refundId ?? null,
      status: record.status,
      adjustmentId: record.adjustmentId,
      recordId: record.id,
      reused,
    };
  }

  private maskWechatError(data: any) {
    if (!data || typeof data !== 'object') {
      return String(data || '');
    }
    return JSON.stringify({
      code: data.code,
      message: data.message,
      detail: data.detail,
    });
  }
}
