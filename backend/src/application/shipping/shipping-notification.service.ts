import {
  Injectable,
  Inject,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma.service';
import { WechatService } from '../../infrastructure/wechat/wechat.service';

export const SHIPPING_NOTIFICATION_OPTIONS = 'SHIPPING_NOTIFICATION_OPTIONS';

export type ShippingNotificationChoice = 'ACCEPTED' | 'REJECTED';

export interface ShippingNotificationResult {
  success: boolean;
  skipped: boolean;
  message: string;
}

export interface ShippingNotificationPreference {
  orderId: string;
  templateId: string;
  subscriptionStatus: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  sendStatus: 'NOT_SENT' | 'SENT' | 'FAILED' | 'SKIPPED';
  canPrompt: boolean;
}

export interface CustomerShippingNotice {
  orderId: string;
  carrierCode: string;
  carrierName: string;
  trackingNumber: string;
  imageUrl: string;
  cookingTips: string;
  storageTips: string;
  damageReminder: string;
}

interface ShippingNotificationOptions {
  templateId?: string;
}

@Injectable()
export class ShippingNotificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wechatService: WechatService,
    @Optional()
    @Inject(SHIPPING_NOTIFICATION_OPTIONS)
    private readonly options?: ShippingNotificationOptions,
  ) {}

  private get templateId(): string {
    return (
      this.options?.templateId ||
      process.env.WECHAT_TEMPLATE_SHIPPING_NOTICE ||
      ''
    ).trim();
  }

  async recordCustomerChoice(
    orderId: string,
    customerId: string,
    choice: ShippingNotificationChoice,
  ) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, customerId },
      select: { id: true, customerId: true, status: true },
    });

    if (!order) {
      throw new NotFoundException('订单不存在或无权操作');
    }

    const now = new Date();
    const data = {
      templateId: this.templateId || null,
      subscriptionStatus: choice,
      lastPromptedAt: now,
      subscribedAt: choice === 'ACCEPTED' ? now : null,
      declinedAt: choice === 'REJECTED' ? now : null,
    };

    return (this.prisma as any).orderShippingNotification.upsert({
      where: { orderId },
      create: {
        orderId,
        customerId,
        ...data,
      },
      update: data,
    });
  }

  async getCustomerPreference(
    orderId: string,
    customerId: string,
  ): Promise<ShippingNotificationPreference> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, customerId },
      select: { id: true, customerId: true, status: true },
    });

    if (!order) {
      throw new NotFoundException('订单不存在或无权查看');
    }

    const notification = await (this.prisma as any).orderShippingNotification.findUnique({
      where: { orderId },
    });

    return {
      orderId,
      templateId: this.templateId,
      subscriptionStatus: notification?.subscriptionStatus || 'PENDING',
      sendStatus: notification?.sendStatus || 'NOT_SENT',
      canPrompt: this.canPromptForStatus(order.status) && Boolean(this.templateId),
    };
  }

  async getCustomerShippingNotice(
    orderId: string,
    customerId: string,
  ): Promise<CustomerShippingNotice> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, customerId },
      include: { items: true },
    });

    if (!order) {
      throw new NotFoundException('订单不存在或无权查看');
    }

    return {
      orderId,
      carrierCode: order.carrierCode || '',
      carrierName: this.getCarrierName(order.carrierCode || ''),
      trackingNumber: order.trackingNumber || '',
      imageUrl: this.getNoticeImageUrl(order.items || []),
      cookingTips: this.buildCookingTips(order.items || []),
      storageTips:
        '保存方式：-18℃ 冷冻保存，保质期 6 个月；-4℃ 冷藏保存，保质期 2 天。拆袋后常温保存不超过 6 小时；拆袋后冷藏保存不超过 24 小时。',
      damageReminder:
        '货损提醒：收货后如发现产品已完全解冻甚至变质，请第一时间拍照或录像留证并联系客服，可无理由退换货。',
    };
  }

  async sendForOrder(orderId: string): Promise<ShippingNotificationResult> {
    const notification = await (this.prisma as any).orderShippingNotification.findUnique({
      where: { orderId },
    });

    if (!notification || notification.subscriptionStatus !== 'ACCEPTED') {
      return {
        success: false,
        skipped: true,
        message: '顾客未订阅发货通知',
      };
    }

    if (notification.sendStatus === 'SENT') {
      return {
        success: true,
        skipped: true,
        message: '发货订阅通知此前已发送',
      };
    }

    const templateId = notification.templateId || this.templateId;
    if (!templateId) {
      await this.markFailed(orderId, '发货通知模板未配置');
      return {
        success: false,
        skipped: true,
        message: '发货通知模板未配置',
      };
    }

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: {
          select: { id: true, wechatOpenid: true },
        },
        items: true,
      },
    });

    if (!order || !order.trackingNumber || !order.carrierCode) {
      await this.markFailed(orderId, '订单物流信息不完整');
      return {
        success: false,
        skipped: true,
        message: '订单物流信息不完整',
      };
    }

    if (!order.customer?.wechatOpenid) {
      await this.markFailed(orderId, '顾客缺少微信 openid');
      return {
        success: false,
        skipped: true,
        message: '顾客缺少微信 openid',
      };
    }

    const response = await this.wechatService.sendSubscriptionMessage({
      touser: order.customer.wechatOpenid,
      template_id: templateId,
      page: `pages/order-shipping-notice/index?orderId=${order.id}`,
      data: {
        thing1: { value: 'SevenKitchen订单' },
        thing2: { value: this.getCarrierName(order.carrierCode) },
        character_string3: { value: order.trackingNumber },
        time4: { value: this.formatWechatTime(order.shippedAt || new Date()) },
        thing5: { value: '点击查看加热保存说明' },
      },
    });

    if (!response.success) {
      await this.markFailed(orderId, response.error || '微信订阅消息发送失败');
      return {
        success: false,
        skipped: false,
        message: response.error || '微信订阅消息发送失败',
      };
    }

    await (this.prisma as any).orderShippingNotification.update({
      where: { orderId },
      data: {
        sendStatus: 'SENT',
        sentAt: new Date(),
        msgid: response.msgid || null,
        errorMessage: null,
      },
    });

    return {
      success: true,
      skipped: false,
      message: '发货订阅通知已发送',
    };
  }

  private async markFailed(orderId: string, errorMessage: string) {
    await (this.prisma as any).orderShippingNotification.update({
      where: { orderId },
      data: {
        sendStatus: 'FAILED',
        errorMessage,
      },
    });
  }

  private getCarrierName(carrierCode: string): string {
    const map: Record<string, string> = {
      SF: '顺丰速运',
      JD: '京东物流',
      YTO: '圆通速递',
      ZTO: '中通快递',
      YD: '韵达速递',
      EMS: 'EMS',
    };
    return map[carrierCode] || carrierCode;
  }

  private formatWechatTime(date: Date): string {
    const pad = (value: number) => String(value).padStart(2, '0');
    return [
      date.getFullYear(),
      pad(date.getMonth() + 1),
      pad(date.getDate()),
    ].join('-') + ` ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  private canPromptForStatus(status: string): boolean {
    return ['PAID', 'PURCHASING', 'IN_PRODUCTION', 'FREEZING'].includes(status);
  }

  private getNoticeImageUrl(items: any[]): string {
    for (const item of items) {
      const snapshot = item.recipeSnapshot || {};
      if (snapshot.coverImageUrl) {
        return snapshot.coverImageUrl;
      }
    }
    return '';
  }

  private buildCookingTips(items: any[]): string {
    const specs = this.collectPackageSpecs(items);
    const specLines = specs.map((weight) => this.buildCookingLine(weight));
    return [
      '建议优先采用蒸、炖或低温慢煮。不建议使用微波、炒、炸等高温烹饪方式，以免受热不均或影响口感。',
      ...specLines,
      '不同锅具和火力会有差异，请以食物中心不再出现血水作为熟透标准。',
    ].join('\n');
  }

  private collectPackageSpecs(items: any[]): number[] {
    const specs = new Set<number>();
    for (const item of items) {
      const packagePlan = Array.isArray(item.packagePlan)
        ? item.packagePlan
        : [];
      if (packagePlan.length > 0) {
        for (const row of packagePlan) {
          const weight = Number(row?.packageSpecG);
          if (Number.isFinite(weight) && weight > 0) {
            specs.add(weight);
          }
        }
      } else {
        const weight = Number(item.packageSpecG);
        if (Number.isFinite(weight) && weight > 0) {
          specs.add(weight);
        }
      }
    }
    return Array.from(specs).sort((a, b) => a - b);
  }

  private buildCookingLine(weight: number): string {
    if (weight < 100) {
      return `${weight}g/袋：水开后蒸或炖 5-10 分钟。`;
    }
    if (weight <= 200) {
      return `${weight}g/袋：水开后蒸或炖 10-15 分钟。`;
    }
    if (weight <= 400) {
      return `${weight}g/袋：水开后蒸或炖 15-20 分钟。`;
    }
    return `${weight}g/袋：单袋重量较大，请充分解冻后加热，具体时间以实际熟透为准。`;
  }
}
