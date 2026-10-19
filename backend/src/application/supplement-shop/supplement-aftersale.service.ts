import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../infrastructure/prisma.service';
import { TimezoneUtil } from '../../utils/timezone.util';
import { SupplementOrderService } from './supplement-order.service';
import { WechatPaymentService } from '../payment/wechat-payment.service';
import { SupplementNotificationService } from './supplement-notification.service';

type CaseRow = Prisma.AftersaleCaseGetPayload<{}>;

export interface AftersaleCaseView {
  id: string;
  caseNo: string;
  orderType: string;
  orderId: string;
  orderNo: string | null;
  customerId: string;
  status: string;
  requestType: string;
  requestedReason: string;
  requestedPhotos: string[];
  resolutionType: string | null;
  refundAmount: number | null;
  refundStatus: string | null;
  refundOutNo: string | null;
  refundId: string | null;
  refundedAt: string | null;
  reshipOrderNo: string | null;
  handlingNote: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * 补剂售后（2026-10-20）
 *
 * 规则（需求 v2 3.8 + 老板确认的 PACKED 边界）：
 * - 一单同时只允许一条未完结；部分唯一索引兜底
 * - SHIPPED/COMPLETED：退款/补发都允许；原订单履约状态不变
 * - PACKED：只允许全额退款；不允许补发；有未完结退款时禁止发货；
 *   退款成功后订单 CANCELLED；库存已在分装时消耗，不释放
 * - 退款逐笔、累计不超实付；每个 case 最多一张补发单
 * - 资金动作只允许管理员
 */
@Injectable()
export class SupplementAftersaleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly supplementOrderService: SupplementOrderService,
    private readonly wechatPaymentService: WechatPaymentService,
    @Optional()
    private readonly notificationService?: SupplementNotificationService,
  ) {}

  async createForCustomer(
    userId: string,
    orderId: string,
    dto: {
      requestType: 'REFUND' | 'RESHIP' | 'OTHER';
      reason: string;
      photos?: string[];
      amount?: number;
    },
  ): Promise<AftersaleCaseView> {
    const order = await this.loadOrder(orderId);
    if (order.userId !== userId) throw new NotFoundException('补剂订单不存在');

    if (!['PACKED', 'SHIPPED', 'COMPLETED'].includes(order.status)) {
      throw new BadRequestException(
        '只有已分装/已发货/已完成的订单可以申请售后；未分装请先取消订单',
      );
    }

    await this.assertWindow(order);
    await this.assertNoOpenCase(order.id);

    if (dto.requestType === 'RESHIP' && order.status === 'PACKED') {
      throw new BadRequestException(
        '订单还未发货，不能补发；请等待发货，或申请全额退款',
      );
    }

    const rejected = await this.prisma.aftersaleCase.count({
      where: {
        orderType: 'SUPPLEMENT',
        orderId: order.id,
        status: 'REJECTED',
        requestedReason: dto.reason.trim(),
      },
    });
    if (rejected >= 2) {
      throw new BadRequestException(
        '同一原因已被驳回 2 次；如仍有问题请联系客服',
      );
    }

    const paid = Number(order.amountTotal);
    let refundAmount: number | null = null;
    if (dto.requestType === 'REFUND') {
      if (order.status === 'PACKED') {
        if (dto.amount !== undefined && Number(dto.amount) !== paid) {
          throw new BadRequestException('未发货订单只支持全额退款');
        }
        refundAmount = paid;
      } else {
        refundAmount = dto.amount === undefined ? paid : Number(dto.amount);
        await this.assertRefundAvailable(order.id, refundAmount);
      }
    }

    const caseNo = await this.generateCaseNo();
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const row = await tx.aftersaleCase.create({
          data: {
            caseNo,
            orderType: 'SUPPLEMENT',
            orderId: order.id,
            orderNo: order.orderNo,
            customerId: order.userId,
            status: 'PENDING',
            requestType: dto.requestType,
            requestedReason: dto.reason.trim(),
            requestedPhotos: dto.photos ?? [],
            source: 'CUSTOMER',
            refundAmount,
          },
        });
        await tx.supplementOrderEvent.create({
          data: {
            orderId: order.id,
            type: 'AFTERSALE_CREATED',
            actorType: 'CUSTOMER',
            actorId: userId,
            reason: dto.reason.trim(),
            metadata: { caseId: row.id, requestType: dto.requestType },
          },
        });
        return row;
      });
      await this.notificationService?.notify(order.id, 'AFTERSALE');
      return this.toView(created);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new BadRequestException('该订单已有未完结售后');
      }
      throw error;
    }
  }

  /**
   * PAID 未分装取消：走全额退款 case，退款成功后才取消订单。
   * 退款失败时订单仍 PAID，packOrder 会被未完结退款拦住，可重试。
   */
  async cancelPaidOrder(
    userId: string,
    orderId: string,
    reason?: string,
  ): Promise<AftersaleCaseView> {
    const order = await this.loadOrder(orderId);
    if (order.userId !== userId) throw new NotFoundException('补剂订单不存在');
    if (order.status !== 'PAID') {
      throw new BadRequestException('只有已付款未分装的订单可以走取消退款');
    }
    if (order.paymentMethod !== 'WECHAT_PAY') {
      throw new BadRequestException('该订单不是微信支付，请联系客服线下退款');
    }
    await this.assertNoOpenCase(order.id);

    const paid = Number(order.amountTotal);
    const caseNo = await this.generateCaseNo();
    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.aftersaleCase.create({
        data: {
          caseNo,
          orderType: 'SUPPLEMENT',
          orderId: order.id,
          orderNo: order.orderNo,
          customerId: order.userId,
          status: 'PENDING',
          requestType: 'REFUND',
          requestedReason: reason?.trim() || '未分装取消',
          requestedPhotos: [],
          source: 'CUSTOMER',
          refundAmount: paid,
        },
      });
      await tx.supplementOrderEvent.create({
        data: {
          orderId: order.id,
          type: 'AFTERSALE_CREATED',
          actorType: 'CUSTOMER',
          actorId: userId,
          reason: reason?.trim() || '未分装取消',
          metadata: { caseId: row.id, requestType: 'REFUND' },
        },
      });
      return row;
    });

    await this.wechatPaymentService.createSupplementRefundForCase({
      caseId: created.id,
      amount: paid,
      reason: reason?.trim() || '未分装取消',
      adminId: null,
    });
    return this.toView(
      (await this.prisma.aftersaleCase.findUnique({
        where: { id: created.id },
      }))!,
    );
  }

  /** 旧后台「登记售后」适配：复用顾客校验，但标记来源 ADMIN */
  async createForAdmin(
    orderId: string,
    dto: {
      requestType: 'REFUND' | 'RESHIP' | 'OTHER';
      reason: string;
      amount?: number;
    },
  ): Promise<AftersaleCaseView> {
    const order = await this.loadOrder(orderId);
    const view = await this.createForCustomer(order.userId, orderId, dto);
    await this.prisma.aftersaleCase.update({
      where: { id: view.id },
      data: { source: 'ADMIN' },
    });
    return view;
  }

  async listCases(
    query: {
      status?: string;
      keyword?: string;
      page?: number;
      pageSize?: number;
    },
    actor: { role?: string } = {},
  ): Promise<{
    items: AftersaleCaseView[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
    const where: Prisma.AftersaleCaseWhereInput = {
      orderType: 'SUPPLEMENT',
      ...(query.status ? { status: query.status as never } : {}),
      ...(query.keyword
        ? {
            OR: [
              { caseNo: { contains: query.keyword, mode: 'insensitive' } },
              { orderNo: { contains: query.keyword, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.aftersaleCase.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.aftersaleCase.count({ where }),
    ]);
    const items = rows.map((row) => this.toView(row));
    if (actor.role === 'STAFF') {
      // 员工不能看退款金额/退款流水；只保留处理所需的状态
      for (const item of items) {
        item.refundAmount = null;
        item.refundOutNo = null;
        item.refundId = null;
      }
    }
    return { items, total, page, pageSize };
  }

  async listForOrder(
    userId: string,
    orderId: string,
  ): Promise<AftersaleCaseView[]> {
    const order = await this.loadOrder(orderId);
    if (order.userId !== userId) throw new NotFoundException('补剂订单不存在');
    const rows = await this.prisma.aftersaleCase.findMany({
      where: { orderType: 'SUPPLEMENT', orderId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => this.toView(row));
  }

  async getCase(userId: string, caseId: string): Promise<AftersaleCaseView> {
    const row = await this.prisma.aftersaleCase.findUnique({
      where: { id: caseId },
    });
    if (!row || row.customerId !== userId) {
      throw new NotFoundException('售后记录不存在');
    }
    return this.toView(row);
  }

  async cancelByCustomer(
    userId: string,
    caseId: string,
  ): Promise<AftersaleCaseView> {
    const row = await this.prisma.aftersaleCase.findUnique({
      where: { id: caseId },
    });
    if (!row || row.customerId !== userId) {
      throw new NotFoundException('售后记录不存在');
    }
    if (row.status !== 'PENDING') {
      throw new BadRequestException('只有待受理的售后可以撤回');
    }
    const updated = await this.prisma.aftersaleCase.update({
      where: { id: caseId },
      data: { status: 'CANCELLED' },
    });
    return this.toView(updated);
  }

  async resolve(
    adminId: string,
    caseId: string,
    dto: {
      resolutionType: 'REFUND' | 'RESHIP' | 'REGISTER_ONLY' | 'REJECT';
      refundAmount?: number;
      note?: string;
      rejectReason?: string;
    },
  ): Promise<AftersaleCaseView> {
    const row = await this.prisma.aftersaleCase.findUnique({
      where: { id: caseId },
    });
    if (!row) throw new NotFoundException('售后记录不存在');
    if (!['PENDING', 'PROCESSING'].includes(row.status)) {
      throw new BadRequestException('该售后已处理，不能重复操作');
    }

    const order = await this.loadOrder(row.orderId);

    if (dto.resolutionType === 'REFUND') {
      if (order.status === 'PACKED') {
        const paid = Number(order.amountTotal);
        if (
          dto.refundAmount !== undefined &&
          Number(dto.refundAmount) !== paid
        ) {
          throw new BadRequestException('未发货订单只支持全额退款');
        }
      }
      const amount =
        dto.refundAmount === undefined
          ? Number(row.refundAmount ?? order.amountTotal)
          : Number(dto.refundAmount);
      await this.prisma.aftersaleCase.update({
        where: { id: caseId },
        data: {
          status: 'PROCESSING',
          handlerId: adminId,
          handlingNote: dto.note?.trim() || null,
          resolutionType: 'REFUND',
          refundAmount: amount,
        },
      });
      await this.wechatPaymentService.createSupplementRefundForCase({
        caseId,
        amount,
        reason: row.requestedReason,
        adminId,
      });
      return this.toView(
        (await this.prisma.aftersaleCase.findUnique({
          where: { id: caseId },
        }))!,
      );
    }

    if (dto.resolutionType === 'RESHIP') {
      if (!['SHIPPED', 'COMPLETED'].includes(order.status)) {
        throw new BadRequestException('只有已发货/已完成的订单可以补发');
      }
      await this.supplementOrderService.createReshipForCase(
        caseId,
        adminId,
        dto.note?.trim() || row.requestedReason,
      );
      await this.notificationService?.notify(order.id, 'RESHIPPED');
      return this.toView(
        (await this.prisma.aftersaleCase.findUnique({
          where: { id: caseId },
        }))!,
      );
    }

    const now = new Date();
    const updated = await this.prisma.aftersaleCase.update({
      where: { id: caseId },
      data: {
        status: dto.resolutionType === 'REJECT' ? 'REJECTED' : 'RESOLVED',
        handlerId: adminId,
        handlingNote:
          dto.note?.trim() || dto.rejectReason?.trim() || null,
        resolutionType: dto.resolutionType,
        resolvedAt: dto.resolutionType === 'REJECT' ? null : now,
        rejectedAt: dto.resolutionType === 'REJECT' ? now : null,
      },
    });
    return this.toView(updated);
  }

  /** 发货前守卫：PACKED 有未完结 REFUND 时不允许发货 */
  async hasOpenRefund(orderId: string): Promise<boolean> {
    const count = await this.prisma.aftersaleCase.count({
      where: {
        orderType: 'SUPPLEMENT',
        orderId,
        requestType: 'REFUND',
        status: { in: ['PENDING', 'PROCESSING'] },
      },
    });
    return count > 0;
  }

  /** 微信退款成功回调：更新 case；PACKED 全额退款成功时取消订单 */
  async markRefundSucceeded(
    caseId: string,
    input: { refundId?: string | null; successTime?: Date | null },
  ): Promise<void> {
    const row = await this.prisma.aftersaleCase.findUnique({
      where: { id: caseId },
    });
    if (!row) return;
    const order = await this.prisma.supplementOrder.findUnique({
      where: { id: row.orderId },
    });
    const now = input.successTime ?? new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.aftersaleCase.update({
        where: { id: caseId },
        data: {
          status: 'RESOLVED',
          refundStatus: 'SUCCESS',
          refundId: input.refundId ?? row.refundId,
          refundedAt: now,
          resolvedAt: now,
        },
      });
      if (order?.status === 'PACKED') {
        await tx.supplementOrder.update({
          where: { id: order.id },
          data: {
            status: 'CANCELLED',
            cancelledAt: now,
            cancellationReason: '未发货全额退款',
          },
        });
      }
      await tx.supplementOrderEvent.create({
        data: {
          orderId: row.orderId,
          type: 'REFUNDED',
          actorType: 'SYSTEM',
          reason: '微信退款成功',
          metadata: { caseId, refundId: input.refundId ?? null },
        },
      });
    });
  }

  async markRefundFailed(
    caseId: string,
    input: { refundStatus: string; reason?: string | null },
  ): Promise<void> {
    const row = await this.prisma.aftersaleCase.findUnique({
      where: { id: caseId },
    });
    if (!row) return;
    await this.prisma.aftersaleCase.update({
      where: { id: caseId },
      data: {
        status: 'PROCESSING',
        refundStatus: input.refundStatus,
        handlingNote: input.reason?.slice(0, 1000) ?? row.handlingNote,
      },
    });
  }

  private async loadOrder(orderId: string) {
    const order = await this.prisma.supplementOrder.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('补剂订单不存在');
    return order;
  }

  private async assertWindow(order: {
    status: string;
    shippedAt: Date | null;
    items: Array<{ packedAt: Date | null }>;
  }): Promise<void> {
    const config = await this.prisma.supplementShopConfig.findUnique({
      where: { id: 'singleton' },
      select: { aftersaleWindowDays: true },
    });
    const days = Math.max(0, Number(config?.aftersaleWindowDays ?? 7));
    const start =
      order.status === 'PACKED'
        ? order.items
            .map((item) => item.packedAt)
            .filter((value): value is Date => Boolean(value))
            .sort((a, b) => b.getTime() - a.getTime())[0] ?? null
        : order.shippedAt;
    if (!start) return;
    const deadline = TimezoneUtil.addDays(
      TimezoneUtil.toShanghaiDateOnly(start),
      days,
    );
    if (TimezoneUtil.toShanghaiDateOnly(new Date()).getTime() > deadline.getTime()) {
      throw new BadRequestException('已超过售后窗口，请联系客服');
    }
  }

  private async assertNoOpenCase(orderId: string): Promise<void> {
    const count = await this.prisma.aftersaleCase.count({
      where: {
        orderType: 'SUPPLEMENT',
        orderId,
        status: { in: ['PENDING', 'PROCESSING'] },
      },
    });
    if (count > 0) throw new BadRequestException('该订单已有未完结售后');
  }

  private async assertRefundAvailable(
    orderId: string,
    amount: number,
  ): Promise<void> {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('退款金额必须大于 0');
    }
    const order = await this.prisma.supplementOrder.findUnique({
      where: { id: orderId },
      select: { amountTotal: true },
    });
    if (!order) throw new NotFoundException('补剂订单不存在');
    const paid = Number(order.amountTotal);
    const cases = await this.prisma.aftersaleCase.findMany({
      where: { orderType: 'SUPPLEMENT', orderId },
      select: {
        refundAmount: true,
        refundStatus: true,
        status: true,
        resolutionType: true,
      },
    });
    let used = 0;
    for (const item of cases) {
      const refundStatus = String(item.refundStatus || '').toUpperCase();
      const isRefund =
        item.resolutionType === 'REFUND' ||
        ['SUCCESS', 'PENDING', 'PROCESSING'].includes(refundStatus);
      const isActive = ['PENDING', 'PROCESSING'].includes(item.status);
      if (refundStatus === 'SUCCESS' || (isRefund && isActive)) {
        used += Number(item.refundAmount ?? 0);
      }
    }
    if (amount > paid - used) {
      throw new BadRequestException(
        `退款金额超过可退余额（已占用 ${used.toFixed(2)} / 实付 ${paid.toFixed(2)}）`,
      );
    }
  }

  private async generateCaseNo(): Promise<string> {
    const date = TimezoneUtil.shanghaiDateKey(new Date()).replace(/-/g, '');
    for (let i = 0; i < 5; i += 1) {
      const suffix = randomBytes(3).toString('hex').toUpperCase();
      const caseNo = `AS${date}${suffix}`;
      const exists = await this.prisma.aftersaleCase.findUnique({
        where: { caseNo },
        select: { id: true },
      });
      if (!exists) return caseNo;
    }
    throw new BadRequestException('售后单号生成失败，请重试');
  }

  private toView(row: CaseRow): AftersaleCaseView {
    return {
      id: row.id,
      caseNo: row.caseNo,
      orderType: row.orderType,
      orderId: row.orderId,
      orderNo: row.orderNo,
      customerId: row.customerId,
      status: row.status,
      requestType: row.requestType,
      requestedReason: row.requestedReason,
      requestedPhotos: row.requestedPhotos,
      resolutionType: row.resolutionType,
      refundAmount:
        row.refundAmount === null ? null : Number(row.refundAmount),
      refundStatus: row.refundStatus,
      refundOutNo: row.refundOutNo,
      refundId: row.refundId,
      refundedAt: row.refundedAt ? row.refundedAt.toISOString() : null,
      reshipOrderNo: row.reshipOrderNo,
      handlingNote: row.handlingNote,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
