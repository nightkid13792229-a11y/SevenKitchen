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

    if (order.paymentMethod !== 'WECHAT_PAY') {
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

  private toOutTradeNo(orderId: string) {
    return orderId.replace(/-/g, '');
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
