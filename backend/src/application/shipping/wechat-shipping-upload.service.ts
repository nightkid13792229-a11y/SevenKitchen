import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma.service';
import {
  WechatService,
  WechatShippingInfoPayload,
} from '../../infrastructure/wechat/wechat.service';

export interface WechatShippingUploadResult {
  success: boolean;
  skipped?: boolean;
  message: string;
  response?: unknown;
}

export interface WechatSpecialShippingReportResult {
  success: boolean;
  skipped?: boolean;
  message: string;
  response?: unknown;
}

export interface WechatShippingOrderStatusResult {
  success: boolean;
  skipped?: boolean;
  message: string;
  orderState?: 1 | 2 | 3 | 4 | 5;
  orderStateLabel?: string;
  inComplaint?: boolean;
  response?: unknown;
}

export const WECHAT_ORDER_STATE_LABELS: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: '待发货',
  2: '已发货',
  3: '确认收货',
  4: '交易完成',
  5: '已退款',
};

const WECHAT_ONLINE_PAYMENT_METHODS = ['WECHAT_PAY', 'WECHAT'];

function isWechatOnlinePaymentMethod(
  paymentMethod?: string | null,
): boolean {
  return WECHAT_ONLINE_PAYMENT_METHODS.includes(paymentMethod || '');
}

export interface WechatShippingUploadCandidate {
  orderId: string;
  status: string;
  paymentStatus: string | null;
  transactionId: string | null;
  trackingNumber: string | null;
  carrierCode: string | null;
  shippedAt: string | null;
  customerName: string | null;
  customerPhone: string | null;
  lastUploadAt: string | null;
  lastSuccess: boolean | null;
  lastSkipped: boolean | null;
  lastMessage: string | null;
  reason: 'NO_UPLOAD_RECORD' | 'UPLOAD_FAILED' | 'UPLOAD_SKIPPED';
}

export interface WechatShippingUploadPendingSummary {
  pendingCount: number;
  candidates: WechatShippingUploadCandidate[];
}

export interface WechatShippingBatchUploadResult {
  total: number;
  success: number;
  failed: number;
  skipped: number;
  results: Array<{
    orderId: string;
    success: boolean;
    skipped?: boolean;
    message: string;
  }>;
}

@Injectable()
export class WechatShippingUploadService {
  private readonly logger = new Logger(WechatShippingUploadService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wechatService: WechatService,
  ) {}

  async uploadForOrder(orderId: string): Promise<WechatShippingUploadResult> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: true,
        address: true,
        items: true,
      },
    });

    if (!order) {
      return {
        success: false,
        skipped: true,
        message: `订单不存在：${orderId}`,
      };
    }

    if (!isWechatOnlinePaymentMethod(order.paymentMethod)) {
      return {
        success: true,
        skipped: true,
        message: '非微信支付订单，无需上传微信发货信息',
      };
    }

    if (!order.customer.wechatOpenid) {
      return {
        success: false,
        skipped: true,
        message: '订单用户缺少微信 openid，无法上传微信发货信息',
      };
    }

    if (!order.trackingNumber || !order.carrierCode) {
      return {
        success: false,
        skipped: true,
        message: '订单缺少物流单号或物流公司，无法上传微信发货信息',
      };
    }

    const paymentConfig = await this.prisma.paymentConfig.upsert({
      where: { id: 'singleton' },
      create: {},
      update: {},
      select: {
        appId: true,
        mchId: true,
      },
    });

    if (!paymentConfig.mchId) {
      return {
        success: false,
        skipped: true,
        message: '后台支付配置缺少微信支付商户号，无法上传微信发货信息',
      };
    }

    const outTradeNo = this.toOutTradeNo(order.id);
    const payload: WechatShippingInfoPayload = {
      order_key: order.transactionId
        ? {
            order_number_type: 2,
            mchid: paymentConfig.mchId,
            transaction_id: order.transactionId,
          }
        : {
            order_number_type: 1,
            mchid: paymentConfig.mchId,
            out_trade_no: outTradeNo,
          },
      logistics_type: 1,
      delivery_mode: 1,
      is_all_delivered: true,
      shipping_list: [
        {
          tracking_no: order.trackingNumber,
          express_company: this.normalizeExpressCompany(order.carrierCode),
          item_desc: this.buildItemDesc(order.items),
          contact: this.buildContact(order.address?.phone),
        },
      ],
      upload_time: this.formatWechatTimestamp(new Date()),
      payer: {
        openid: order.customer.wechatOpenid,
      },
    };

    const response = await this.wechatService.uploadShippingInfo(
      payload,
      paymentConfig.appId || undefined,
    );

    this.logger.log(
      `Uploaded WeChat shipping info for order ${order.id}, tracking ${order.trackingNumber}`,
    );

    return {
      success: true,
      message: '微信发货信息已上传',
      response,
    };
  }

  async queryShippingOrderStatus(
    orderId: string,
  ): Promise<WechatShippingOrderStatusResult> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        paymentMethod: true,
        paymentStatus: true,
        transactionId: true,
      },
    });

    if (!order) {
      return {
        success: false,
        skipped: true,
        message: `订单不存在：${orderId}`,
      };
    }

    if (!isWechatOnlinePaymentMethod(order.paymentMethod)) {
      return {
        success: true,
        skipped: true,
        message: '非微信支付订单，无需查询微信发货订单状态',
      };
    }

    if (order.paymentStatus !== 'SUCCESS') {
      return {
        success: true,
        skipped: true,
        message: '订单尚未完成微信支付，无需查询微信发货订单状态',
      };
    }

    const paymentConfig = await this.prisma.paymentConfig.upsert({
      where: { id: 'singleton' },
      create: {},
      update: {},
      select: {
        appId: true,
        mchId: true,
      },
    });

    if (!paymentConfig.mchId) {
      return {
        success: false,
        skipped: true,
        message: '后台支付配置缺少微信支付商户号，无法查询微信发货订单状态',
      };
    }

    const response = await this.wechatService.getShippingOrder(
      order.transactionId
        ? {
            transactionId: order.transactionId,
            merchantId: paymentConfig.mchId,
          }
        : {
            merchantId: paymentConfig.mchId,
            merchantTradeNo: this.toOutTradeNo(order.id),
          },
      paymentConfig.appId || undefined,
    );
    const orderState = response.order?.order_state;

    if (orderState == null) {
      return {
        success: false,
        skipped: false,
        message: '微信发货订单状态响应缺少订单状态',
        response,
      };
    }

    return {
      success: true,
      message: '微信发货订单状态已查询',
      orderState,
      orderStateLabel: orderState
        ? WECHAT_ORDER_STATE_LABELS[orderState]
        : undefined,
      inComplaint: response.order?.in_complaint,
      response,
    };
  }

  async reportSpecialOrderForOrder(
    orderId: string,
    actor: 'customer' | 'staff' | 'admin' | 'system' = 'system',
    actorId?: string | null,
  ): Promise<WechatSpecialShippingReportResult> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: true,
      },
    });

    if (!order) {
      return {
        success: false,
        skipped: true,
        message: `订单不存在：${orderId}`,
      };
    }

    if (!isWechatOnlinePaymentMethod(order.paymentMethod)) {
      return {
        success: true,
        skipped: true,
        message: '非微信支付订单，无需报备微信未发货信息',
      };
    }

    if (order.paymentStatus !== 'SUCCESS' || !order.paidAt) {
      return {
        success: true,
        skipped: true,
        message: '订单尚未完成微信支付，无需报备微信未发货信息',
      };
    }

    if (['SHIPPED', 'COMPLETED', 'CANCELLED'].includes(order.status)) {
      return {
        success: true,
        skipped: true,
        message: '订单已发货、已完成或已取消，无需报备未发货信息',
      };
    }

    const latestSuccess = await this.prisma.orderStatusHistory.findFirst({
      where: {
        orderId: order.id,
        metadata: { path: ['event'], equals: 'WECHAT_SPECIAL_SHIPPING_REPORT' },
      },
      orderBy: { timestamp: 'desc' },
      select: { metadata: true },
    });
    const latestMetadata =
      latestSuccess?.metadata && typeof latestSuccess.metadata === 'object'
        ? (latestSuccess.metadata as Record<string, unknown>)
        : null;
    if (latestMetadata?.success === true && latestMetadata?.skipped !== true) {
      return {
        success: true,
        skipped: true,
        message: '微信未发货报备已完成，无需重复报备',
      };
    }

    const paymentConfig = await this.prisma.paymentConfig.upsert({
      where: { id: 'singleton' },
      create: {},
      update: {},
      select: {
        appId: true,
      },
    });

    const delayTo = this.resolveSpecialShippingDelayTo(order.paidAt);
    const payload = {
      order_id: order.transactionId || this.toOutTradeNo(order.id),
      type: 1 as const,
      delay_to: delayTo,
    };

    const response = await this.wechatService.reportSpecialShippingOrder(
      payload,
      paymentConfig.appId || undefined,
    );

    this.logger.log(
      `Reported WeChat special shipping order ${order.id}, delayTo=${delayTo}`,
    );

    await this.appendSpecialShippingReportHistory(order.id, order.status, actor, actorId, {
      event: 'WECHAT_SPECIAL_SHIPPING_REPORT',
      success: true,
      skipped: false,
      message: '微信未发货预计发货时间已报备',
      delayTo,
      payload,
      response,
    });

    return {
      success: true,
      message: '微信未发货预计发货时间已报备',
      response,
    };
  }

  async listPendingUploads(limit = 100): Promise<WechatShippingUploadPendingSummary> {
    const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
    const orders = await this.prisma.order.findMany({
      where: {
        status: 'SHIPPED',
        paymentMethod: { in: WECHAT_ONLINE_PAYMENT_METHODS },
        trackingNumber: { not: null },
        carrierCode: { not: null },
      },
      orderBy: { shippedAt: 'desc' },
      take: safeLimit,
      select: {
        id: true,
        status: true,
        paymentStatus: true,
        transactionId: true,
        trackingNumber: true,
        carrierCode: true,
        shippedAt: true,
        customer: {
          select: {
            nickname: true,
            phone: true,
          },
        },
        statusHistory: {
          where: {
            metadata: { path: ['event'], equals: 'WECHAT_SHIPPING_UPLOAD' },
          },
          orderBy: { timestamp: 'desc' },
          take: 1,
          select: {
            timestamp: true,
            metadata: true,
          },
        },
      },
    });

    const candidates = orders
      .map((order): WechatShippingUploadCandidate | null => {
        const latest = order.statusHistory[0];
        const metadata =
          latest?.metadata && typeof latest.metadata === 'object'
            ? (latest.metadata as Record<string, unknown>)
            : null;
        const lastSuccess =
          typeof metadata?.success === 'boolean' ? metadata.success : null;
        const lastSkipped =
          typeof metadata?.skipped === 'boolean' ? metadata.skipped : null;
        const lastMessage =
          typeof metadata?.message === 'string' ? metadata.message : null;

        if (lastSuccess === true && lastSkipped !== true) {
          return null;
        }

        const reason: WechatShippingUploadCandidate['reason'] = !latest
          ? 'NO_UPLOAD_RECORD'
          : lastSkipped === true
            ? 'UPLOAD_SKIPPED'
            : 'UPLOAD_FAILED';

        return {
          orderId: order.id,
          status: order.status,
          paymentStatus: order.paymentStatus,
          transactionId: order.transactionId,
          trackingNumber: order.trackingNumber,
          carrierCode: order.carrierCode,
          shippedAt: order.shippedAt?.toISOString() ?? null,
          customerName: order.customer?.nickname ?? null,
          customerPhone: order.customer?.phone ?? null,
          lastUploadAt: latest?.timestamp.toISOString() ?? null,
          lastSuccess,
          lastSkipped,
          lastMessage,
          reason,
        };
      })
      .filter((item): item is WechatShippingUploadCandidate => Boolean(item));

    return {
      pendingCount: candidates.length,
      candidates,
    };
  }

  async uploadPending(limit = 100): Promise<WechatShippingBatchUploadResult> {
    const pending = await this.listPendingUploads(limit);
    const results: WechatShippingBatchUploadResult['results'] = [];

    for (const candidate of pending.candidates) {
      const result = await this.uploadForOrder(candidate.orderId);
      results.push({
        orderId: candidate.orderId,
        success: result.success,
        skipped: result.skipped,
        message: result.message,
      });
    }

    return {
      total: results.length,
      success: results.filter((item) => item.success && !item.skipped).length,
      failed: results.filter((item) => !item.success).length,
      skipped: results.filter((item) => item.skipped).length,
      results,
    };
  }

  async reportPendingSpecialOrders(limit = 100): Promise<WechatShippingBatchUploadResult> {
    const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
    const orders = await this.prisma.order.findMany({
      where: {
        paymentMethod: { in: WECHAT_ONLINE_PAYMENT_METHODS },
        paymentStatus: 'SUCCESS',
        status: { in: ['PAID', 'PURCHASING', 'IN_PRODUCTION', 'FREEZING'] as any },
      },
      orderBy: { paidAt: 'desc' },
      take: safeLimit,
      select: { id: true },
    });

    const results: WechatShippingBatchUploadResult['results'] = [];
    for (const order of orders) {
      const result = await this.reportSpecialOrderForOrder(order.id, 'admin', null);
      results.push({
        orderId: order.id,
        success: result.success,
        skipped: result.skipped,
        message: result.message,
      });
    }

    return {
      total: results.length,
      success: results.filter((item) => item.success && !item.skipped).length,
      failed: results.filter((item) => !item.success).length,
      skipped: results.filter((item) => item.skipped).length,
      results,
    };
  }

  private toOutTradeNo(orderId: string) {
    return orderId.replace(/-/g, '');
  }

  private resolveSpecialShippingDelayTo(paidAt: Date) {
    const minimumDelayMs = 15 * 24 * 60 * 60 * 1000;
    const bufferMs = 60 * 60 * 1000;
    return Math.floor((paidAt.getTime() + minimumDelayMs + bufferMs) / 1000);
  }

  private async appendSpecialShippingReportHistory(
    orderId: string,
    status: string,
    actor: 'customer' | 'staff' | 'admin' | 'system',
    actorId: string | null | undefined,
    metadata: Record<string, unknown>,
  ) {
    try {
      await this.prisma.orderStatusHistory.create({
        data: {
          orderId,
          fromStatus: status as any,
          toStatus: status as any,
          actor,
          actorId: actorId ?? null,
          metadata: metadata as any,
        },
      });
    } catch (error) {
      this.logger.warn(
        `[WeChatShipping] Failed to append special report history for order ${orderId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private buildItemDesc(items: Array<{ recipeSnapshot: unknown }>) {
    const names = items
      .map((item) => this.extractRecipeName(item.recipeSnapshot))
      .filter((name): name is string => Boolean(name));

    const desc = names.length > 0 ? names.join('、') : 'SevenKitchen 鲜食订单';
    return desc.slice(0, 120);
  }

  private extractRecipeName(snapshot: unknown): string | null {
    if (!snapshot || typeof snapshot !== 'object') return null;
    const value = snapshot as Record<string, unknown>;
    const nestedRecipe = value.recipe as Record<string, unknown> | undefined;
    const candidates = [
      value.name,
      value.title,
      value.recipeName,
      nestedRecipe?.name,
    ];
    const name = candidates.find(
      (item) => typeof item === 'string' && item.trim(),
    );
    return typeof name === 'string' ? name.trim() : null;
  }

  private normalizeExpressCompany(carrierCode: string) {
    const normalized = carrierCode.trim();
    const upper = normalized.toUpperCase();
    const map: Record<string, string> = {
      顺丰: 'SF',
      顺丰速运: 'SF',
      京东: 'JD',
      京东物流: 'JD',
      中通: 'ZTO',
      中通快递: 'ZTO',
      圆通: 'YTO',
      圆通速递: 'YTO',
      韵达: 'YD',
      韵达速递: 'YD',
      申通: 'STO',
      申通快递: 'STO',
      EMS: 'EMS',
      SF: 'SF',
      JD: 'JD',
      ZTO: 'ZTO',
      YTO: 'YTO',
      YD: 'YD',
      STO: 'STO',
    };
    return map[normalized] || map[upper] || normalized;
  }

  private buildContact(phone?: string | null) {
    const normalized = (phone || '').trim();
    if (!normalized) return undefined;
    return {
      receiver_contact: normalized,
    };
  }

  private formatWechatTimestamp(value: Date) {
    const offsetMs = 8 * 60 * 60 * 1000;
    const local = new Date(value.getTime() + offsetMs);
    const base = local.toISOString().replace('Z', '');
    return `${base}+08:00`;
  }
}
