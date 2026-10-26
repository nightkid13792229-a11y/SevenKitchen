import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma.service';
import { WechatPaymentService } from '../payment/wechat-payment.service';
import { CustomRecipeService } from './custom-recipe.service';
import { CustomerMessageService } from '../message/customer-message.service';

/**
 * 已交付/制作中订单的退款申请。
 *
 * 未开始制作（PAID）仍然走「取消 + 全额原路退回」，不在这里留下审核记录；
 * 这里只处理已经投入制作、需要人工判断的退款。
 */
const REFUND_REQUESTABLE_STATUSES = new Set([
  'IN_PROGRESS',
  'DELIVERED',
  'COMPLETED',
]);

const OPEN_STATUSES = ['PENDING', 'PROCESSING'];

const STATUS_LABELS: Record<string, string> = {
  PENDING: '审核中',
  PROCESSING: '退款处理中',
  REFUNDED: '退款成功',
  REJECTED: '未通过',
  FAILED: '退款失败',
};

export interface CustomerRefundRequestView {
  id: string;
  orderId: string;
  status: string;
  statusLabel: string;
  reasonCode: string;
  reasonLabel: string;
  description: string;
  photos: string[];
  amount: number;
  adminNote: string | null;
  refundStatus: string | null;
  refundOutNo: string | null;
  refundId: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

@Injectable()
export class CustomRecipeRefundService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wechatPaymentService: WechatPaymentService,
    /**
     * 退款成功后自动停单/取消（2026-10-26）。
     * 可选注入，避免既有单测一次性改构造签名。
     */
    private readonly customRecipeService?: CustomRecipeService,
    /** 审核结果站内消息；不发微信订阅消息 */
    private readonly customerMessages?: CustomerMessageService,
  ) {}

  /**
   * 顾客提交退款申请。
   *
   * 已有一条待审核/处理中的申请时直接返回它 —— 顾客没看到变化会再点一次，
   * 不能因此产生两条后台待办。
   */
  async createForCustomer(
    orderIdOrId: string,
    customerId: string,
    input: {
      reasonCode: string;
      reasonLabel: string;
      description: string;
      photos?: string[];
    },
  ): Promise<{ request: CustomerRefundRequestView; reused: boolean }> {
    const order = await this.prisma.customRecipeOrder.findFirst({
      where: { OR: [{ orderId: orderIdOrId }, { id: orderIdOrId }] },
      select: {
        id: true,
        orderId: true,
        customerId: true,
        status: true,
        amount: true,
        paymentConfirmedAt: true,
        paymentTransactionId: true,
        refundStatus: true,
      },
    });

    if (!order) throw new NotFoundException(`定制订单不存在: ${orderIdOrId}`);
    if (order.customerId !== customerId) {
      throw new ForbiddenException('无权操作此订单');
    }
    if (order.status === 'PAID') {
      throw new BadRequestException(
        '订单还未开始制作，可以直接申请全额退款',
      );
    }
    if (!REFUND_REQUESTABLE_STATUSES.has(String(order.status))) {
      throw new BadRequestException('当前订单状态不能申请退款');
    }
    if (!order.paymentConfirmedAt && !order.paymentTransactionId) {
      throw new BadRequestException('该定制订单尚未支付，无需退款');
    }
    const currentRefundStatus = String(order.refundStatus || '').toUpperCase();
    if (['SUCCESS', 'PROCESSING', 'PENDING'].includes(currentRefundStatus)) {
      throw new BadRequestException('这笔订单已经退款或正在退款，无需重复申请');
    }

    const reasonCode = String(input.reasonCode || '').trim();
    const reasonLabel = String(input.reasonLabel || '').trim();
    const description = String(input.description || '').trim();
    if (!reasonCode || !reasonLabel) {
      throw new BadRequestException('请选择退款原因');
    }
    if (!description) {
      throw new BadRequestException('请说明具体情况');
    }

    const existing = await this.prisma.customRecipeRefundRequest.findFirst({
      where: { orderId: order.id, status: { in: OPEN_STATUSES as never } },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) {
      return {
        request: this.toCustomerView(existing as any, order.orderId),
        reused: true,
      };
    }

    const photos = this.normalizePhotos(input.photos);
    const created = await this.prisma.customRecipeRefundRequest.create({
      data: {
        orderId: order.id,
        customerId,
        reasonCode,
        reasonLabel,
        description: description.slice(0, 1000),
        photos,
        amount: Number(order.amount),
        status: 'PENDING',
      },
    });

    return {
      request: this.toCustomerView(created as any, order.orderId),
      reused: false,
    };
  }

  /** 顾客看最新一条退款申请（没有就 null）。 */
  async getForCustomer(
    orderIdOrId: string,
    customerId: string,
  ): Promise<CustomerRefundRequestView | null> {
    const order = await this.prisma.customRecipeOrder.findFirst({
      where: { OR: [{ orderId: orderIdOrId }, { id: orderIdOrId }] },
      select: { id: true, orderId: true, customerId: true },
    });
    if (!order) throw new NotFoundException(`定制订单不存在: ${orderIdOrId}`);
    if (order.customerId !== customerId) {
      throw new ForbiddenException('无权访问此订单');
    }

    const row = await this.prisma.customRecipeRefundRequest.findFirst({
      where: { orderId: order.id },
      orderBy: { createdAt: 'desc' },
    });
    return row ? this.toCustomerView(row as any, order.orderId) : null;
  }

  /** 后台退款申请列表。 */
  async listForAdmin(status?: string) {
    const rows = await this.prisma.customRecipeRefundRequest.findMany({
      where: status ? { status: status as never } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        order: {
          select: {
            orderId: true,
            status: true,
            dog: { select: { name: true } },
            customer: {
              select: {
                nickname: true,
                phone: true,
                guestContactName: true,
                guestContactPhone: true,
              },
            },
          },
        },
      },
    });

    return rows.map((row: any) => ({
      ...this.toCustomerView(row, row.order?.orderId ?? null),
      orderStatus: row.order?.status ?? null,
      dogName: row.order?.dog?.name ?? null,
      customerName:
        row.order?.customer?.nickname ??
        row.order?.customer?.guestContactName ??
        null,
      customerPhone:
        row.order?.customer?.phone ??
        row.order?.customer?.guestContactPhone ??
        null,
    }));
  }

  /**
   * 后台审核通过：调微信全额原路退款，再把申请标成处理中/成功。
   *
   * 退款失败时**抛出去、不改申请状态** —— 让后台看到真实失败原因并重试，
   * 绝不能把“钱没退”标成“已退款”。
   */
  async approve(
    requestId: string,
    adminId: string,
    note = '',
  ): Promise<CustomerRefundRequestView> {
    const row = await this.mustFind(requestId);
    if (row.status !== 'PENDING') {
      throw new BadRequestException('这条退款申请已经处理过了');
    }

    const order = await this.prisma.customRecipeOrder.findFirst({
      where: { id: row.orderId },
      select: { orderId: true },
    });
    if (!order) throw new NotFoundException('订单不存在');

    const refund = await this.wechatPaymentService.createCustomRecipeRefund({
      orderId: order.orderId,
      reason: `退款申请：${row.reasonLabel}`,
    });

    const status = this.mapRefundStatus(refund.status);
    const updated = await this.prisma.customRecipeRefundRequest.update({
      where: { id: row.id },
      data: {
        status: status as never,
        refundStatus: String(refund.status || '').toUpperCase(),
        refundOutNo: refund.outRefundNo ?? null,
        refundId: refund.refundId ?? null,
        adminNote: String(note || '').trim() || null,
        reviewedBy: adminId,
        reviewedAt: new Date(),
      },
    });

    /**
     * 退款成功才停单：微信返回 PROCESSING 时先等回调，不能提前取消。
     * 取消失败不回滚退款（钱已经退出去了），只记录日志；后台仍可手工处理。
     */
    let cancelled = false;
    if (status === 'REFUNDED' && this.customRecipeService) {
      try {
        const result = await this.customRecipeService.cancelOrderAfterRefund(
          row.orderId,
          {
            outRefundNo: refund.outRefundNo ?? null,
            refundId: refund.refundId ?? null,
            refundedAt: new Date(),
            reason: '退款申请审核通过，已全额退款，自动停单取消',
          },
        );
        cancelled = Boolean(result?.cancelled);
      } catch (error) {
        console.error(
          '[CustomRecipeRefund] 退款成功但自动停单失败:',
          error,
        );
      }
    }

    await this.sendReviewMessage({
      customerId: row.customerId,
      orderNo: order.orderId,
      amount: Number(row.amount),
      status,
      cancelled,
      adminNote: String(note || '').trim(),
    });

    return this.toCustomerView(updated as any, order.orderId);
  }

  /** 后台驳回：必须写原因，顾客端要能看懂为什么没通过。 */
  async reject(
    requestId: string,
    adminId: string,
    reason: string,
  ): Promise<CustomerRefundRequestView> {
    const row = await this.mustFind(requestId);
    if (row.status !== 'PENDING') {
      throw new BadRequestException('这条退款申请已经处理过了');
    }
    const adminNote = String(reason || '').trim();
    if (!adminNote) throw new BadRequestException('请填写驳回原因');

    const order = await this.prisma.customRecipeOrder.findFirst({
      where: { id: row.orderId },
      select: { orderId: true },
    });

    const updated = await this.prisma.customRecipeRefundRequest.update({
      where: { id: row.id },
      data: {
        status: 'REJECTED',
        adminNote,
        reviewedBy: adminId,
        reviewedAt: new Date(),
      },
    });

    await this.customerMessages
      ?.send({
        customerId: row.customerId,
        category: 'AFTERSALE',
        title: '退款申请未通过',
        body: adminNote,
        linkType: 'ORDER',
        linkId: order?.orderId ?? null,
      })
      .catch(() => false);

    return this.toCustomerView(updated as any, order?.orderId ?? null);
  }

  /**
   * 批量取多张订单各自最新的一条退款申请。
   *
   * 统一订单列表一次最多几十张定制单，不能逐单查（N+1）；
   * 一次 findMany 后按 orderId 取第一条（createdAt desc）。
   */
  async getLatestForOrderPks(
    orderPks: string[],
  ): Promise<Record<string, CustomerRefundRequestView>> {
    const ids = Array.from(
      new Set((orderPks || []).map((id) => String(id || '').trim()).filter(Boolean)),
    );
    if (ids.length === 0) return {};

    const rows = await this.prisma.customRecipeRefundRequest.findMany({
      where: { orderId: { in: ids } },
      orderBy: { createdAt: 'desc' },
    });

    const result: Record<string, CustomerRefundRequestView> = {};
    for (const row of rows as any[]) {
      if (!result[row.orderId]) {
        result[row.orderId] = this.toCustomerView(row, null);
      }
    }
    return result;
  }

  /** 订单详情用：最新一条申请摘要（没有就 null）。 */
  async getLatestForOrderPk(orderPk: string) {
    const row = await this.prisma.customRecipeRefundRequest.findFirst({
      where: { orderId: orderPk },
      orderBy: { createdAt: 'desc' },
    });
    return row ? this.toCustomerView(row as any, null) : null;
  }

  /**
   * 审核结果站内消息。只写站内信，不调用微信订阅消息。
   */
  private async sendReviewMessage(input: {
    customerId: string;
    orderNo: string;
    amount: number;
    status: string;
    cancelled: boolean;
    adminNote: string;
  }): Promise<void> {
    if (!this.customerMessages) return;

    const amount = `¥${Number(input.amount || 0).toFixed(2)}`;
    let title = '退款申请审核结果';
    let body = '';

    if (input.status === 'REFUNDED') {
      title = input.cancelled
        ? '退款申请已通过，订单已取消'
        : '退款申请已通过，退款已到账';
      body = input.cancelled
        ? `订单 ${input.orderNo} 的 ${amount} 已原路退回；制作已停止，订单已取消。`
        : `订单 ${input.orderNo} 的 ${amount} 已原路退回，到账时间以微信为准。`;
    } else if (input.status === 'PROCESSING') {
      title = '退款申请已通过，退款处理中';
      body = `订单 ${input.orderNo} 的 ${amount} 正在原路退回；制作中的订单会在退款成功后自动停单取消。`;
    } else if (input.status === 'FAILED') {
      title = '退款申请审核通过，但退款失败';
      body = `订单 ${input.orderNo} 的退款暂未成功，请联系客服处理。`;
    } else {
      title = '退款申请审核结果';
      body = `订单 ${input.orderNo} 的退款申请已有处理结果。`;
    }

    if (input.adminNote) {
      body += ` 审核备注：${input.adminNote}`;
    }

    await this.customerMessages
      .send({
        customerId: input.customerId,
        category: 'AFTERSALE',
        title,
        body,
        linkType: 'ORDER',
        linkId: input.orderNo,
      })
      .catch(() => false);
  }

  private async mustFind(requestId: string) {
    const row = await this.prisma.customRecipeRefundRequest.findUnique({
      where: { id: requestId },
    });
    if (!row) throw new NotFoundException('退款申请不存在');
    return row;
  }

  private mapRefundStatus(status: string): string {
    const normalized = String(status || '').toUpperCase();
    if (normalized === 'SUCCESS') return 'REFUNDED';
    if (normalized === 'PROCESSING' || normalized === 'PENDING') {
      return 'PROCESSING';
    }
    return 'FAILED';
  }

  private normalizePhotos(value?: string[]): string[] {
    return Array.from(
      new Set(
        (Array.isArray(value) ? value : [])
          .map((photo) => String(photo || '').trim())
          .filter(Boolean),
      ),
    ).slice(0, 6);
  }

  private toCustomerView(row: any, orderId: string | null): CustomerRefundRequestView {
    return {
      id: row.id,
      orderId: orderId ?? row.orderId,
      status: row.status,
      statusLabel: STATUS_LABELS[row.status] ?? row.status,
      reasonCode: row.reasonCode,
      reasonLabel: row.reasonLabel,
      description: row.description,
      photos: Array.isArray(row.photos) ? row.photos : [],
      amount: Number(row.amount),
      adminNote: row.adminNote ?? null,
      refundStatus: row.refundStatus ?? null,
      refundOutNo: row.refundOutNo ?? null,
      refundId: row.refundId ?? null,
      createdAt:
        row.createdAt instanceof Date
          ? row.createdAt.toISOString()
          : String(row.createdAt || ''),
      reviewedAt:
        row.reviewedAt instanceof Date
          ? row.reviewedAt.toISOString()
          : row.reviewedAt ?? null,
    };
  }
}
