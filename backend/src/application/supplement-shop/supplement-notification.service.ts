import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma.service';
import { WechatService } from '../../infrastructure/wechat/wechat.service';

export type SupplementNoticeType =
  | 'SCHEDULED'
  | 'RESCHEDULED'
  | 'SHIPPED'
  | 'AFTERSALE'
  | 'REFUNDED'
  | 'RESHIPPED'
  | 'COMPLETED'
  | 'DELAY'
  | 'AFTERSALE_REJECTED'
  | 'AFTERSALE_RESOLVED';

/**
 * 补剂站内消息 + 订阅消息兜底。
 *
 * 站内消息一定写 CustomerMessage（分类 SHIPPING/AFTERSALE），
 * 订阅消息需要模板 ID + 用户授权；未配置/未授权只记日志，不影响主流程。
 */
@Injectable()
export class SupplementNotificationService {
  private readonly logger = new Logger(SupplementNotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly wechatService?: WechatService,
  ) {}

  /** 小程序 requestSubscribeMessage 需要的模板 ID（未配置的项为 null） */
  getTemplateIds(): Record<string, string | null> {
    const order = (process.env.WECHAT_TEMPLATE_SUPPLEMENT_ORDER || '').trim();
    return {
      scheduled: (process.env.WECHAT_TEMPLATE_SUPPLEMENT_SCHEDULED || order || '').trim() || null,
      shipped: (process.env.WECHAT_TEMPLATE_SUPPLEMENT_SHIPPED || order || '').trim() || null,
      delay: (process.env.WECHAT_TEMPLATE_SUPPLEMENT_DELAY || order || '').trim() || null,
      aftersale: (process.env.WECHAT_TEMPLATE_SUPPLEMENT_AFTERSALE || order || '').trim() || null,
    };
  }

  async notify(
    orderId: string,
    type: SupplementNoticeType,
    detail?: string,
  ): Promise<void> {
    const order = await this.prisma.supplementOrder.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNo: true,
        userId: true,
        packingDate: true,
        trackingNumber: true,
        carrierCode: true,
      },
    });
    if (!order) return;

    const content = this.buildContent(type, order, detail);
    try {
      await this.prisma.customerMessage.create({
        data: {
          customerId: order.userId,
          category: content.category,
          title: content.title,
          body: content.body,
          linkType: 'SUPPLEMENT_ORDER',
          linkId: order.id,
        },
      });
    } catch (error) {
      this.logger.warn(
        `[SupplementNotification] 站内消息写入失败 order=${orderId}: ${
          (error as Error).message
        }`,
      );
    }

    await this.sendSubscription(order, content);
  }

  private buildContent(
    type: SupplementNoticeType,
    order: {
      orderNo: string;
      packingDate: Date | null;
      trackingNumber: string | null;
      carrierCode: string | null;
    },
    detail?: string,
  ): { category: string; title: string; body: string } {
    const date = order.packingDate
      ? order.packingDate.toISOString().slice(0, 10)
      : null;
    switch (type) {
      case 'SCHEDULED':
        return {
          category: 'SHIPPING',
          title: '补剂订单已排期',
          body: `订单 ${order.orderNo} 的预计发货日期为 ${date ?? '待定'}，发货后会通知你。`,
        };
      case 'RESCHEDULED':
        return {
          category: 'SHIPPING',
          title: '补剂分装日期已调整',
          body: `订单 ${order.orderNo} 的预计发货日期调整为 ${date ?? '待定'}，请留意后续发货通知。`,
        };
      case 'SHIPPED':
        return {
          category: 'SHIPPING',
          title: '补剂订单已发货',
          body: `订单 ${order.orderNo} 已发货${
            order.carrierCode ? `（${order.carrierCode}）` : ''
          }，单号 ${order.trackingNumber ?? '—'}。点击查看详情。`,
        };
      case 'AFTERSALE':
        return {
          category: 'AFTERSALE',
          title: '补剂售后已受理',
          body: `订单 ${order.orderNo} 的售后申请已收到，处理结果会在这里通知你。`,
        };
      case 'REFUNDED':
        return {
          category: 'AFTERSALE',
          title: '补剂退款已处理',
          body: `订单 ${order.orderNo} 的退款已完成，请留意微信到账通知。`,
        };
      case 'RESHIPPED':
        return {
          category: 'AFTERSALE',
          title: '补剂补发已安排',
          body: `订单 ${order.orderNo} 的补发已安排，发出后会通知你。`,
        };
      case 'COMPLETED':
        return {
          category: 'SHIPPING',
          title: '补剂订单已完成',
          body: `订单 ${order.orderNo} 已完成。如还有问题，可在售后窗口内申请。`,
        };
      case 'DELAY':
        return {
          category: 'SHIPPING',
          title: '补剂发货时间调整',
          body: `订单 ${order.orderNo} 的发货时间需要延后${
            detail ? `：${detail}` : ''
          }。给你带来不便，抱歉。`,
        };
      case 'AFTERSALE_REJECTED':
        return {
          category: 'AFTERSALE',
          title: '补剂售后未通过',
          body: `订单 ${order.orderNo} 的售后申请未通过${
            detail ? `：${detail}` : ''
          }。如有疑问请联系客服。`,
        };
      case 'AFTERSALE_RESOLVED':
        return {
          category: 'AFTERSALE',
          title: '补剂售后已处理',
          body: `订单 ${order.orderNo} 的售后已处理完成${
            detail ? `：${detail}` : ''
          }。`,
        };
    }
  }

  async notifyDelay(orderId: string, reason?: string): Promise<void> {
    await this.notify(orderId, 'DELAY', reason?.trim() || undefined);
  }

  private templateForNotice(content: {
    category: string;
    title: string;
    body: string;
  }): string {
    const order = (process.env.WECHAT_TEMPLATE_SUPPLEMENT_ORDER || '').trim();
    if (content.title.includes('发货时间') || content.title.includes('延后')) {
      return (process.env.WECHAT_TEMPLATE_SUPPLEMENT_DELAY || order || '').trim();
    }
    if (content.category === 'AFTERSALE') {
      return (process.env.WECHAT_TEMPLATE_SUPPLEMENT_AFTERSALE || order || '').trim();
    }
    if (content.title.includes('发货')) {
      return (process.env.WECHAT_TEMPLATE_SUPPLEMENT_SHIPPED || order || '').trim();
    }
    return (process.env.WECHAT_TEMPLATE_SUPPLEMENT_SCHEDULED || order || '').trim();
  }

  private async sendSubscription(
    order: { id: string; orderNo: string; userId: string },
    content: { category: string; title: string; body: string },
  ): Promise<void> {
    const templateId = this.templateForNotice(content);
    if (!templateId || !this.wechatService) return;

    try {
      const user = await this.prisma.user.findUnique({
        where: { id: order.userId },
        select: { wechatOpenid: true },
      });
      if (!user?.wechatOpenid) return;
      await this.wechatService.sendSubscriptionMessage({
        touser: user.wechatOpenid,
        template_id: templateId,
        page: `pages/supplement-order-detail/index?orderId=${order.id}`,
        data: {
          thing1: { value: content.title.slice(0, 20) },
          thing2: { value: content.body.slice(0, 20) },
        },
      });
    } catch (error) {
      this.logger.log(
        `[SupplementNotification] 订阅消息未发送（未授权/模板不符）order=${order.orderNo}: ${
          (error as Error).message
        }`,
      );
    }
  }
}
