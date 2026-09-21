/**
 * Supplement Order Application Service
 *
 * 补剂订单：把「DIY 制作单上的补剂清单」变成可下单、可分装、可发货的独立订单。
 * 刻意独立于鲜食订单体系（Order/OrderItem 强依赖食谱快照，补剂塞不进去）。
 *
 * 设计文档：docs/plans/2026-09-18-supplement-shop-design.md
 */

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma.service';
import { TimezoneUtil } from '../../utils/timezone.util';
import { IngredientType } from '../../domain/ingredient/enums';
import {
  SupplementPricingService,
  type SupplementQuote,
  type SupplementQuoteLineInput,
} from './supplement-pricing.service';
import {
  SupplementShopConfigService,
  type SupplementShopConfigDto,
} from './supplement-shop-config.service';
import type { IngredientPhysicalFormCode } from './supplement-catalog.service';

/** 分装结果的有效期：取「原瓶到期日」与「分装日 + 效期系数」的较小值 */
export function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  const day = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  const lastDay = new Date(
    result.getFullYear(),
    result.getMonth() + 1,
    0,
  ).getDate();
  result.setDate(Math.min(day, lastDay));
  return result;
}

export function resolvePackedExpiryDate(
  packedAt: Date,
  shelfLifeMonths: number,
  sourceExpiryDate: Date,
): Date {
  const byRule = addMonths(packedAt, shelfLifeMonths);
  return sourceExpiryDate.getTime() < byRule.getTime()
    ? sourceExpiryDate
    : byRule;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** 标签默认储存条件（原料档案没填时兜底） */
const DEFAULT_STORAGE_CONDITION = '避光、密封、阴凉干燥处保存';

/** 标签上的合规声明 */
const LABEL_DISCLAIMER = '分装小样，非直接食用，请按食谱用量添加';

/** 袋内含食品级硅胶干燥剂时的提示 */
const LABEL_DESICCANT_NOTICE = '内含干燥剂，请勿食用';

/** 数值展示：整数不带小数点，否则最多两位小数 */
function formatAmount(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return Number.isInteger(value)
    ? String(value)
    : String(Math.round(value * 100) / 100);
}

export interface SupplementQuoteRequest {
  lines: Array<{ ingredientId: string; amount: number }>;
}

export interface CreateSupplementOrderRequest extends SupplementQuoteRequest {
  addressId: string;
  recipeId?: string;
  recipeName?: string;
  dogId?: string;
  dogName?: string;
  diySheetId?: string;
  cycleDays?: number;
  remark?: string;
}

export interface SupplementQuoteResponse {
  quote: SupplementQuote;
  /** 用户提交但当前不可购买的补剂（已下架 / 非补剂 / 无价） */
  unavailable: Array<{ ingredientId: string; name: string; reason: string }>;
  enabled: boolean;
}

export interface SupplementOrderItemView {
  id: string;
  ingredientId: string;
  name: string;
  brand: string | null;
  productModel: string | null;
  physicalForm: string | null;
  unit: string;
  requestedAmount: number;
  packedAmount: number;
  unitCost: number;
  cost: number;
  price: number;
  bags: number;
  shelfLifeMonths: number;
  storageCondition: string | null;
  batchNo: string | null;
  sourceExpiryDate: string | null;
  packedExpiryDate: string | null;
  packedAt: string | null;
}

export interface SupplementOrderView {
  id: string;
  orderNo: string;
  status: string;
  bagCount: number;
  amountSupplement: number;
  amountServiceFee: number;
  amountPackaging: number;
  amountGoods: number;
  amountShipping: number;
  amountTotal: number;
  shippingDescription: string | null;
  receiverName: string;
  receiverPhone: string;
  receiverRegion: string;
  receiverDetail: string;
  recipeId: string | null;
  recipeName: string | null;
  dogId: string | null;
  dogName: string | null;
  cycleDays: number | null;
  remark: string | null;
  paymentMethod: string | null;
  paymentStatus: string | null;
  paidAt: string | null;
  aftersaleType: string | null;
  aftersaleReason: string | null;
  refundStatus: string | null;
  refundAmount: number | null;
  refundOutNo: string | null;
  refundId: string | null;
  refundReason: string | null;
  refundedAt: string | null;
  reshipFromOrderNo: string | null;
  trackingNumber: string | null;
  carrierCode: string | null;
  shippedAt: string | null;
  createdAt: string;
  items: SupplementOrderItemView[];
}

export interface SupplementLabel {
  itemId: string;
  productName: string;
  amountText: string;
  packedDate: string;
  expiryDate: string;
  batchNo: string | null;
  storageCondition: string;
  sourceProduct: string;
  sourceExpiryDate: string;
  disclaimer: string;
}

export interface SupplementOrderLabels {
  orderNo: string;
  brandName: string;
  receiverName: string;
  labels: SupplementLabel[];
}

export interface ListSupplementOrdersQuery {
  status?: string;
  /** 仅后台使用：按订单号 / 收件人 / 手机号模糊搜索 */
  keyword?: string;
  page?: number;
  pageSize?: number;
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

@Injectable()
export class SupplementOrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricingService: SupplementPricingService,
    private readonly configService: SupplementShopConfigService,
  ) {}

  /**
   * 报价（无副作用）。
   * 价格永远由服务端按补剂档案现算，客户端只提供 ingredientId 与用量。
   */
  async quote(
    request: SupplementQuoteRequest,
  ): Promise<SupplementQuoteResponse> {
    const { quote, unavailable, config } = await this.buildQuote(request);
    return { quote, unavailable, enabled: config.enabled };
  }

  /** 创建补剂订单（价格服务端重算，不信任客户端传来的金额） */
  async createOrder(
    userId: string,
    request: CreateSupplementOrderRequest,
  ): Promise<SupplementOrderView> {
    const { quote, unavailable, config, meta } = await this.buildQuote(request);

    if (!config.enabled) {
      throw new BadRequestException('补剂商城暂未开放');
    }

    if (unavailable.length > 0) {
      throw new BadRequestException(
        `以下补剂当前不可购买，请先移除：${unavailable
          .map((item) => `${item.name}（${item.reason}）`)
          .join('；')}`,
      );
    }

    if (
      config.minOrderAmount > 0 &&
      quote.goodsSubtotal < config.minOrderAmount
    ) {
      throw new BadRequestException(
        `商品金额未达最低起送 ${config.minOrderAmount.toFixed(2)} 元`,
      );
    }

    const address = await this.prisma.address.findUnique({
      where: { id: request.addressId },
    });
    if (!address || address.userId !== userId) {
      throw new BadRequestException('收货地址不存在');
    }

    const region = (address.region || {}) as Record<string, unknown>;
    const shippingAddressSnapshot = {
      addressId: address.id,
      recipientName: address.recipientName,
      phone: address.phone,
      region: {
        province: String(region.province ?? ''),
        city: String(region.city ?? ''),
        district: region.district ? String(region.district) : undefined,
      },
      detail: address.detail,
    };

    const orderId = await this.prisma.$transaction(async (tx) => {
      const orderNo = await this.generateOrderNo(tx);

      const created = await tx.supplementOrder.create({
        data: {
          orderNo,
          userId,
          status: 'PENDING_PAYMENT',
          bagCount: quote.bagCount,
          amountSupplement: quote.supplementPrice,
          amountServiceFee: quote.serviceFee,
          amountPackaging: quote.packagingFee,
          amountGoods: quote.goodsSubtotal,
          amountShipping: quote.shippingFee,
          amountTotal: quote.total,
          supplementCost: quote.supplementCost,
          shippingDescription: quote.shippingDescription,
          pricingSnapshot: this.buildPricingSnapshot(config),
          shippingAddressSnapshot,
          recipeId: request.recipeId ?? null,
          recipeName: request.recipeName ?? null,
          dogId: request.dogId ?? null,
          dogName: request.dogName ?? null,
          diySheetId: request.diySheetId ?? null,
          cycleDays: request.cycleDays ?? null,
          remark: request.remark ?? null,
          items: {
            create: quote.lines.map((line) => ({
              ingredientId: line.ingredientId,
              name: line.name,
              brand: meta.get(line.ingredientId)?.brand ?? null,
              productModel: meta.get(line.ingredientId)?.productModel ?? null,
              physicalForm:
                line.physicalForm as unknown as
                  | 'POWDER'
                  | 'TABLET'
                  | 'CAPSULE'
                  | 'LIQUID',
              unit: line.unit,
              requestedAmount: line.requestedAmount,
              packedAmount: line.packedAmount,
              unitCost: line.unitCost,
              cost: line.cost,
              price: line.price,
              bags: line.bags,
              shelfLifeMonths: line.shelfLifeMonths,
              storageCondition:
                meta.get(line.ingredientId)?.storageCondition ||
                DEFAULT_STORAGE_CONDITION,
            })),
          },
        },
        select: { id: true },
      });

      return created.id;
    });

    return this.getOrder(userId, orderId);
  }

  async listOrders(
    userId: string,
    query: ListSupplementOrdersQuery = {},
  ): Promise<{ items: SupplementOrderView[]; total: number; page: number; pageSize: number }> {
    const { skip, take, page, pageSize } = this.normalizePaging(query);
    const where: Prisma.SupplementOrderWhereInput = {
      userId,
      ...(query.status ? { status: query.status as never } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.supplementOrder.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: { items: { orderBy: { createdAt: 'asc' } } },
      }),
      this.prisma.supplementOrder.count({ where }),
    ]);

    return {
      items: rows.map((row) => this.toOrderView(row)),
      total,
      page,
      pageSize,
    };
  }

  async getOrder(userId: string, orderId: string): Promise<SupplementOrderView> {
    const order = await this.prisma.supplementOrder.findFirst({
      where: { id: orderId, userId },
      include: { items: { orderBy: { createdAt: 'asc' } } },
    });

    if (!order) {
      throw new NotFoundException(`补剂订单不存在: ${orderId}`);
    }
    return this.toOrderView(order);
  }

  /** 后台：所有补剂订单 */
  async listAllOrders(
    query: ListSupplementOrdersQuery = {},
  ): Promise<{ items: SupplementOrderView[]; total: number; page: number; pageSize: number }> {
    const { skip, take, page, pageSize } = this.normalizePaging(query);
    const keyword = (query.keyword || '').trim();
    const where: Prisma.SupplementOrderWhereInput = {
      ...(query.status ? { status: query.status as never } : {}),
      ...(keyword
        ? {
            OR: [
              { orderNo: { contains: keyword, mode: 'insensitive' } },
              {
                shippingAddressSnapshot: {
                  path: ['recipientName'],
                  string_contains: keyword,
                },
              },
              {
                shippingAddressSnapshot: {
                  path: ['phone'],
                  string_contains: keyword,
                },
              },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.supplementOrder.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: { items: { orderBy: { createdAt: 'asc' } } },
      }),
      this.prisma.supplementOrder.count({ where }),
    ]);

    return {
      items: rows.map((row) => this.toOrderView(row)),
      total,
      page,
      pageSize,
    };
  }

  async getOrderById(orderId: string): Promise<SupplementOrderView> {
    const order = await this.prisma.supplementOrder.findUnique({
      where: { id: orderId },
      include: { items: { orderBy: { createdAt: 'asc' } } },
    });
    if (!order) {
      throw new NotFoundException(`补剂订单不存在: ${orderId}`);
    }
    return this.toOrderView(order);
  }

  // ---------------- 后台：收款 / 分装 / 发货 / 售后 ----------------

  /** 各状态的订单数，用于后台工作台角标 */
  async getStatusCounts(): Promise<Record<string, number>> {
    const rows = await this.prisma.supplementOrder.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    const counts: Record<string, number> = {};
    for (const row of rows) {
      counts[row.status] = row._count._all;
    }
    return counts;
  }

  /**
   * 人工确认收款。
   * 微信支付接通前，先用它把「线下转账 → 开始分装」的闭环跑起来。
   */
  async confirmPayment(
    orderId: string,
    dto: { transactionId?: string } = {},
  ): Promise<SupplementOrderView> {
    const order = await this.requireOrder(orderId);
    this.assertStatus(order.status, ['PENDING_PAYMENT'], '确认收款');

    await this.prisma.supplementOrder.update({
      where: { id: orderId },
      data: {
        status: 'PAID',
        paymentMethod: 'MANUAL',
        paymentStatus: 'SUCCESS',
        transactionId: dto.transactionId?.trim() || null,
        paidAt: new Date(),
      },
    });

    return this.getOrderById(orderId);
  }

  /**
   * 微信支付回调确认收款（幂等）。
   * 与人工确认分开，便于区分收款渠道与对账。
   */
  async confirmPaymentFromWechat(
    orderId: string,
    transactionId: string,
  ): Promise<SupplementOrderView> {
    const order = await this.requireOrder(orderId);

    // 微信可能重复回调，已付款的直接返回，不报错也不重复写
    if (order.status === 'PAID') {
      return this.getOrderById(orderId);
    }

    this.assertStatus(order.status, ['PENDING_PAYMENT'], '确认收款');

    await this.prisma.supplementOrder.update({
      where: { id: orderId },
      data: {
        status: 'PAID',
        paymentMethod: 'WECHAT_PAY',
        paymentStatus: 'SUCCESS',
        transactionId: transactionId || null,
        paidAt: new Date(),
      },
    });

    return this.getOrderById(orderId);
  }

  /**
   * 完成分装：为每一袋填写原瓶到期日，系统算出标签效期。
   *
   * 守卫：
   * - 必须覆盖订单里全部袋子（漏填会被拒绝，避免发出没有标签效期的货）
   * - 原瓶剩余保质期低于配置阈值时拒绝分装（这种货应该退款或换货，而不是发出去）
   * - 标签效期 = min(原瓶到期日, 分装日 + 该形态的效期系数)
   */
  async packOrder(
    orderId: string,
    dto: {
      items: Array<{
        itemId: string;
        batchNo?: string;
        sourceExpiryDate: string;
      }>;
    },
  ): Promise<SupplementOrderView> {
    const order = await this.prisma.supplementOrder.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) {
      throw new NotFoundException(`补剂订单不存在: ${orderId}`);
    }
    this.assertStatus(order.status, ['PAID', 'PACKING'], '分装');

    const config = await this.configService.getConfig();
    const packedAt = new Date();
    const itemsById = new Map(order.items.map((item) => [item.id, item]));

    for (const input of dto.items) {
      if (!itemsById.has(input.itemId)) {
        throw new BadRequestException(
          `该分装行不属于这张订单: ${input.itemId}`,
        );
      }
    }

    const missing = order.items.filter(
      (item) => !dto.items.some((input) => input.itemId === item.id),
    );
    if (missing.length > 0) {
      throw new BadRequestException(
        `还有 ${missing.length} 袋没填原瓶到期日：${missing
          .map((item) => item.name)
          .join('、')}`,
      );
    }

    const planned = dto.items.map((input) => {
      const item = itemsById.get(input.itemId)!;
      const sourceExpiryDate = new Date(input.sourceExpiryDate);
      if (Number.isNaN(sourceExpiryDate.getTime())) {
        throw new BadRequestException(
          `「${item.name}」的原瓶到期日格式不正确`,
        );
      }

      const remainingDays = Math.floor(
        (sourceExpiryDate.getTime() - packedAt.getTime()) / MS_PER_DAY,
      );
      if (remainingDays < config.minRemainingShelfLifeDays) {
        throw new BadRequestException(
          `「${item.name}」原瓶只剩 ${remainingDays} 天保质期，低于 ${config.minRemainingShelfLifeDays} 天的下限，不允许分装发货。请改走退款或换货。`,
        );
      }

      return {
        itemId: item.id,
        batchNo: input.batchNo?.trim() || null,
        sourceExpiryDate,
        packedExpiryDate: resolvePackedExpiryDate(
          packedAt,
          item.shelfLifeMonths,
          sourceExpiryDate,
        ),
      };
    });

    await this.prisma.$transaction(async (tx) => {
      for (const row of planned) {
        await tx.supplementOrderItem.update({
          where: { id: row.itemId },
          data: {
            batchNo: row.batchNo,
            sourceExpiryDate: row.sourceExpiryDate,
            packedExpiryDate: row.packedExpiryDate,
            packedAt,
          },
        });
      }
      await tx.supplementOrder.update({
        where: { id: orderId },
        data: { status: 'PACKED' },
      });
    });

    return this.getOrderById(orderId);
  }

  /** 发货：只有已完成分装的订单才能填单号 */
  async shipOrder(
    orderId: string,
    dto: { trackingNumber: string; carrierCode?: string },
  ): Promise<SupplementOrderView> {
    const order = await this.requireOrder(orderId);
    this.assertStatus(order.status, ['PACKED'], '发货');

    const trackingNumber = (dto.trackingNumber || '').trim();
    if (!trackingNumber) {
      throw new BadRequestException('请填写快递单号');
    }

    await this.prisma.supplementOrder.update({
      where: { id: orderId },
      data: {
        status: 'SHIPPED',
        trackingNumber,
        carrierCode: dto.carrierCode?.trim() || null,
        shippedAt: new Date(),
      },
    });

    return this.getOrderById(orderId);
  }

  /** 取消订单（已发货的不能直接取消，要走售后） */
  async cancelOrder(
    orderId: string,
    dto: { reason?: string } = {},
  ): Promise<SupplementOrderView> {
    const order = await this.requireOrder(orderId);
    this.assertStatus(order.status, ['PENDING_PAYMENT', 'PAID'], '取消');

    await this.prisma.supplementOrder.update({
      where: { id: orderId },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancellationReason: dto.reason?.trim() || '后台取消',
      },
    });

    return this.getOrderById(orderId);
  }

  /**
   * 登记售后：缺货 / 发错 / 破损 / 量不对 → 无理由退款或免费补发。
   * 退款与补发的资金/物流动作在后续版本接入（微信退款、生成补发单）。
   */
  async markAftersale(
    orderId: string,
    dto: { type: 'REFUND' | 'RESHIP'; reason: string },
  ): Promise<SupplementOrderView> {
    const order = await this.requireOrder(orderId);
    this.assertStatus(
      order.status,
      ['PAID', 'PACKING', 'PACKED', 'SHIPPED', 'COMPLETED'],
      '登记售后',
    );

    const reason = (dto.reason || '').trim();
    if (!reason) {
      throw new BadRequestException('请填写售后原因');
    }

    await this.prisma.supplementOrder.update({
      where: { id: orderId },
      data: {
        status: 'AFTERSALE',
        aftersaleType: dto.type,
        aftersaleReason: reason,
        aftersaleAt: new Date(),
      },
    });

    return this.getOrderById(orderId);
  }

  /**
   * 分装标签数据。
   * 一个补剂一袋，一袋一张标签；效期在分装环节已算好，未分装不允许打印。
   */
  async getOrderLabels(orderId: string): Promise<SupplementOrderLabels> {
    const order = await this.prisma.supplementOrder.findUnique({
      where: { id: orderId },
      include: { items: { orderBy: { createdAt: 'asc' } } },
    });
    if (!order) {
      throw new NotFoundException(`补剂订单不存在: ${orderId}`);
    }

    if (order.items.some((item) => !item.packedAt)) {
      throw new BadRequestException('请先完成分装，再打印标签');
    }

    const config = await this.configService.getConfig();

    return {
      orderNo: order.orderNo,
      brandName: config.labelBrandName,
      receiverName: this.readReceiverName(order.shippingAddressSnapshot),
      labels: order.items.map((item) => ({
        itemId: item.id,
        productName: item.name,
        amountText: `${formatAmount(item.packedAmount)}${item.unit}`,
        packedDate: this.toDateText(item.packedAt),
        expiryDate: this.toDateText(item.packedExpiryDate),
        batchNo: item.batchNo,
        storageCondition: item.storageCondition || DEFAULT_STORAGE_CONDITION,
        sourceProduct: [item.brand, item.productModel]
          .filter(Boolean)
          .join(' · '),
        sourceExpiryDate: this.toDateText(item.sourceExpiryDate),
        disclaimer: config.labelIncludeDesiccantNotice
          ? `${LABEL_DISCLAIMER}；${LABEL_DESICCANT_NOTICE}`
          : LABEL_DISCLAIMER,
      })),
    };
  }

  private toDateText(value: Date | null): string {
    return value ? value.toISOString().slice(0, 10) : '';
  }

  private readReceiverName(snapshot: unknown): string {
    const address = (snapshot || {}) as { recipientName?: string };
    return address.recipientName || '';
  }

  // ---------------- 售后：线上退款 / 免费补发 ----------------

  /** 记录退款已发起（微信返回后落库） */
  async recordRefundRequest(
    orderId: string,
    input: {
      outRefundNo: string;
      amount: number;
      reason: string;
      status: string;
    },
  ): Promise<SupplementOrderView> {
    await this.requireOrder(orderId);

    await this.prisma.supplementOrder.update({
      where: { id: orderId },
      data: {
        status: 'AFTERSALE',
        aftersaleType: 'REFUND',
        aftersaleReason: input.reason,
        aftersaleAt: new Date(),
        refundStatus: input.status,
        refundAmount: input.amount,
        refundOutNo: input.outRefundNo,
        refundReason: input.reason,
        refundRequestedAt: new Date(),
      },
    });

    return this.getOrderById(orderId);
  }

  /** 微信退款结果回调（幂等） */
  async applyRefundResult(
    orderId: string,
    input: {
      status: string;
      refundId?: string | null;
      successTime?: Date | null;
    },
  ): Promise<SupplementOrderView> {
    const order = await this.requireOrder(orderId);
    const status = String(input.status || '').toUpperCase();

    // 已经退款成功的不再重复写
    if (order.refundStatus === 'SUCCESS' && status === 'SUCCESS') {
      return this.getOrderById(orderId);
    }

    await this.prisma.supplementOrder.update({
      where: { id: orderId },
      data: {
        refundStatus: status,
        ...(input.refundId ? { refundId: input.refundId } : {}),
        ...(status === 'SUCCESS'
          ? { refundedAt: input.successTime ?? new Date() }
          : {}),
      },
    });

    return this.getOrderById(orderId);
  }

  /**
   * 免费补发：按原单原样生成一张 0 元补发单，直接进入待分装。
   * 原单标记为售后中，并记录了补发关系，避免重复补发。
   */
  async reshipOrder(
    orderId: string,
    reason: string,
  ): Promise<{ original: SupplementOrderView; reship: SupplementOrderView }> {
    const original = await this.prisma.supplementOrder.findUnique({
      where: { id: orderId },
      include: { items: { orderBy: { createdAt: 'asc' } } },
    });
    if (!original) {
      throw new NotFoundException(`补剂订单不存在: ${orderId}`);
    }
    if (original.status === 'CANCELLED') {
      throw new BadRequestException('已取消的订单不能补发');
    }

    const existing = await this.prisma.supplementOrder.findFirst({
      where: { reshipFromOrderNo: original.orderNo },
    });
    if (existing) {
      throw new BadRequestException(
        `该订单已经补发过（补发单 ${existing.orderNo}），不能重复补发`,
      );
    }

    const reasonText = (reason || '').trim() || '免费补发';
    const now = new Date();

    const reshipId = await this.prisma.$transaction(async (tx) => {
      const orderNo = await this.generateOrderNo(tx);

      const created = await tx.supplementOrder.create({
        data: {
          orderNo,
          userId: original.userId,
          // 补发不需要付款，直接进入待分装
          status: 'PAID',
          bagCount: original.bagCount,
          amountSupplement: 0,
          amountServiceFee: 0,
          amountPackaging: 0,
          amountGoods: 0,
          amountShipping: 0,
          amountTotal: 0,
          supplementCost: original.supplementCost,
          shippingDescription: '免费补发，不收运费',
          pricingSnapshot: (original.pricingSnapshot ??
            undefined) as Prisma.InputJsonValue | undefined,
          shippingAddressSnapshot:
            original.shippingAddressSnapshot as Prisma.InputJsonValue,
          recipeId: original.recipeId,
          recipeName: original.recipeName,
          dogId: original.dogId,
          dogName: original.dogName,
          cycleDays: original.cycleDays,
          remark: `免费补发（原单 ${original.orderNo}）：${reasonText}`,
          paymentMethod: 'RESHIP',
          paymentStatus: 'SUCCESS',
          paidAt: now,
          reshipFromOrderNo: original.orderNo,
          items: {
            create: original.items.map((item) => ({
              ingredientId: item.ingredientId,
              name: item.name,
              brand: item.brand,
              productModel: item.productModel,
              physicalForm: item.physicalForm,
              unit: item.unit,
              requestedAmount: item.requestedAmount,
              packedAmount: item.packedAmount,
              unitCost: item.unitCost,
              cost: item.cost,
              // 补发给用户，不再收费
              price: 0,
              bags: item.bags,
              shelfLifeMonths: item.shelfLifeMonths,
              storageCondition: item.storageCondition,
            })),
          },
        },
        select: { id: true },
      });

      await tx.supplementOrder.update({
        where: { id: original.id },
        data: {
          status: 'AFTERSALE',
          aftersaleType: 'RESHIP',
          aftersaleReason: reasonText,
          aftersaleAt: now,
        },
      });

      return created.id;
    });

    return {
      original: await this.getOrderById(original.id),
      reship: await this.getOrderById(reshipId),
    };
  }

  private async requireOrder(orderId: string) {
    const order = await this.prisma.supplementOrder.findUnique({
      where: { id: orderId },
    });
    if (!order) {
      throw new NotFoundException(`补剂订单不存在: ${orderId}`);
    }
    return order;
  }

  private assertStatus(
    current: string,
    allowed: string[],
    action: string,
  ): void {
    if (!allowed.includes(current)) {
      throw new BadRequestException(
        `订单当前状态为 ${current}，不能${action}`,
      );
    }
  }

  // ---------------- 内部工具 ----------------

  /** 报价的公共路径：解析补剂行 → 现价计算。meta 只在下单时用得到。 */
  private async buildQuote(request: SupplementQuoteRequest): Promise<{
    quote: SupplementQuote;
    unavailable: Array<{ ingredientId: string; name: string; reason: string }>;
    config: SupplementShopConfigDto;
    meta: Map<
      string,
      {
        brand: string | null;
        productModel: string | null;
        storageCondition: string | null;
      }
    >;
  }> {
    const requested = this.normalizeRequestedLines(request.lines);
    const { available, unavailable, meta } =
      await this.resolveAvailableLines(requested);

    if (available.length === 0) {
      throw new BadRequestException(
        unavailable.length > 0
          ? `当前没有可购买的补剂：${unavailable
              .map((item) => `${item.name}（${item.reason}）`)
              .join('；')}`
          : '补剂清单为空，无法报价',
      );
    }

    const config = await this.configService.getConfig();
    const quote = await this.pricingService.previewQuote({
      lines: available,
      totalWeightG: this.estimateWeightG(available),
    });

    return { quote, unavailable, config, meta };
  }

  private normalizeRequestedLines(
    lines: Array<{ ingredientId: string; amount: number }>,
  ): Array<{ ingredientId: string; amount: number }> {
    if (!Array.isArray(lines) || lines.length === 0) {
      throw new BadRequestException('补剂清单不能为空');
    }

    const merged = new Map<string, number>();
    for (const line of lines) {
      const ingredientId = String(line?.ingredientId ?? '').trim();
      const amount = Number(line?.amount);
      if (!ingredientId) {
        throw new BadRequestException('补剂清单存在缺少 ingredientId 的行');
      }
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new BadRequestException('补剂用量必须大于 0');
      }
      // 同一补剂多次出现时合并，避免重复分装
      merged.set(ingredientId, (merged.get(ingredientId) || 0) + amount);
    }

    return Array.from(merged.entries()).map(([ingredientId, amount]) => ({
      ingredientId,
      amount,
    }));
  }

  /** 把 ingredientId 解析成可售的补剂行；不可售的单独返回原因 */
  private async resolveAvailableLines(
    requested: Array<{ ingredientId: string; amount: number }>,
  ): Promise<{
    available: SupplementQuoteLineInput[];
    unavailable: Array<{ ingredientId: string; name: string; reason: string }>;
    meta: Map<
      string,
      {
        brand: string | null;
        productModel: string | null;
        storageCondition: string | null;
      }
    >;
  }> {
    const ids = requested.map((line) => line.ingredientId);
    const ingredients = await this.prisma.ingredient.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        name: true,
        brand: true,
        productModel: true,
        type: true,
        baseUnit: true,
        unitDisplayLabel: true,
        purchaseUnit: true,
        purchaseToBaseRatio: true,
        currentPricePerPurchaseUnit: true,
        physicalForm: true,
        isOilBased: true,
        supplementRetailEnabled: true,
        storageCondition: true,
        properties: true,
      },
    });

    const byId = new Map(ingredients.map((item) => [item.id, item]));
    const available: SupplementQuoteLineInput[] = [];
    const unavailable: Array<{
      ingredientId: string;
      name: string;
      reason: string;
    }> = [];

    const meta = new Map<
      string,
      {
        brand: string | null;
        productModel: string | null;
        storageCondition: string | null;
      }
    >();

    for (const line of requested) {
      const ingredient = byId.get(line.ingredientId);
      if (!ingredient) {
        unavailable.push({
          ingredientId: line.ingredientId,
          name: line.ingredientId,
          reason: '补剂不存在',
        });
        continue;
      }

      const reason = this.findUnavailableReason(ingredient);
      if (reason) {
        unavailable.push({
          ingredientId: ingredient.id,
          name: ingredient.name,
          reason,
        });
        continue;
      }

      const properties = (ingredient.properties || {}) as Record<string, unknown>;
      const displayUnit =
        (ingredient.unitDisplayLabel || '').trim() ||
        (typeof properties.display_unit === 'string'
          ? properties.display_unit.trim()
          : '') ||
        (ingredient.purchaseUnit || '').trim() ||
        ingredient.baseUnit;

      const price = Number(ingredient.currentPricePerPurchaseUnit || 0);
      const ratio = Number(ingredient.purchaseToBaseRatio || 0);

      meta.set(ingredient.id, {
        brand: ingredient.brand,
        productModel: ingredient.productModel,
        storageCondition: ingredient.storageCondition,
      });

      available.push({
        ingredientId: ingredient.id,
        name: ingredient.name,
        unit: displayUnit,
        amount: line.amount,
        unitCost: price / ratio,
        physicalForm: ingredient.physicalForm as IngredientPhysicalFormCode,
        isOilBased: ingredient.isOilBased === true,
      });
    }

    return { available, unavailable, meta };
  }

  private findUnavailableReason(ingredient: {
    type: string;
    supplementRetailEnabled: boolean;
    currentPricePerPurchaseUnit: unknown;
    purchaseToBaseRatio: number;
    physicalForm: string | null;
  }): string | null {
    if (ingredient.type !== IngredientType.SUPPLEMENT) {
      return '不是补剂';
    }
    if (!ingredient.supplementRetailEnabled) {
      return '暂未开放购买';
    }
    if (Number(ingredient.currentPricePerPurchaseUnit || 0) <= 0) {
      return '尚未定价';
    }
    if (!Number(ingredient.purchaseToBaseRatio || 0)) {
      return '规格换算缺失';
    }
    if (!ingredient.physicalForm) {
      return '物理形态未配置';
    }
    if (ingredient.physicalForm === 'LIQUID') {
      return '液体补剂暂不支持分装';
    }
    return null;
  }

  /** 运费模板按重量计费时的粗略估算（一口价模式下不影响结果） */
  private estimateWeightG(lines: SupplementQuoteLineInput[]): number {
    const BAG_OVERHEAD_G = 100;
    const body = lines.reduce((sum, line) => {
      const unit = (line.unit || '').toLowerCase();
      if (line.physicalForm === 'POWDER' && unit.includes('g')) {
        return sum + line.amount;
      }
      if (line.physicalForm === 'POWDER') {
        // 平勺类：1 平勺 ≈ 0.1g
        return sum + line.amount * 0.1;
      }
      // 片剂/胶囊：按 1.2g/单位 估
      return sum + line.amount * 1.2;
    }, 0);
    return Math.max(Math.round(BAG_OVERHEAD_G + body), BAG_OVERHEAD_G);
  }

  private buildPricingSnapshot(config: SupplementShopConfigDto) {
    return {
      markupMultiplier: config.markupMultiplier,
      serviceFeeMode: config.serviceFeeMode,
      serviceFeeAmount: config.serviceFeeAmount,
      packagingFeePerBag: config.packagingFeePerBag,
      priceRoundingMode: config.priceRoundingMode,
      roundUpUsage: config.roundUpUsage,
      shippingMode: config.shippingMode,
      flatShippingFee: config.flatShippingFee,
      shippingTemplateId: config.shippingTemplateId,
      freeShippingThreshold: config.freeShippingThreshold,
      powderShelfLifeMonths: config.powderShelfLifeMonths,
      solidShelfLifeMonths: config.solidShelfLifeMonths,
    } as unknown as Prisma.InputJsonValue;
  }

  private async generateOrderNo(
    tx: Prisma.TransactionClient,
  ): Promise<string> {
    const dateKey = TimezoneUtil.toShanghaiDateString(new Date()).replace(
      /-/g,
      '',
    );
    const seq = await tx.orderSequence.upsert({
      where: { dateKey },
      update: { lastSeq: { increment: 1 } },
      create: { dateKey, lastSeq: 1 },
    });
    // SP = Supplement，和鲜食订单共用当日序列，保证编号不冲突
    return `SP${dateKey}-${String(seq.lastSeq).padStart(3, '0')}`;
  }

  private normalizePaging(query: ListSupplementOrdersQuery) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Number(query.pageSize) || DEFAULT_PAGE_SIZE),
    );
    return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
  }

  private toOrderView(row: {
    id: string;
    orderNo: string;
    status: string;
    bagCount: number;
    amountSupplement: unknown;
    amountServiceFee: unknown;
    amountPackaging: unknown;
    amountGoods: unknown;
    amountShipping: unknown;
    amountTotal: unknown;
    shippingDescription: string | null;
    shippingAddressSnapshot: unknown;
    recipeId: string | null;
    recipeName: string | null;
    dogId: string | null;
    dogName: string | null;
    cycleDays: number | null;
    remark: string | null;
    paymentMethod: string | null;
    paymentStatus: string | null;
    paidAt: Date | null;
    aftersaleType: string | null;
    aftersaleReason: string | null;
    refundStatus: string | null;
    refundAmount: unknown;
    refundOutNo: string | null;
    refundId: string | null;
    refundReason: string | null;
    refundedAt: Date | null;
    reshipFromOrderNo: string | null;
    trackingNumber: string | null;
    carrierCode: string | null;
    shippedAt: Date | null;
    createdAt: Date;
    items: Array<{
      id: string;
      ingredientId: string;
      name: string;
      brand: string | null;
      productModel: string | null;
      physicalForm: string | null;
      unit: string;
      requestedAmount: number;
      packedAmount: number;
      unitCost: unknown;
      cost: unknown;
      price: unknown;
      bags: number;
      shelfLifeMonths: number;
      storageCondition: string | null;
      batchNo: string | null;
      sourceExpiryDate: Date | null;
      packedExpiryDate: Date | null;
      packedAt: Date | null;
    }>;
  }): SupplementOrderView {
    const address = (row.shippingAddressSnapshot || {}) as {
      recipientName?: string;
      phone?: string;
      region?: { province?: string; city?: string; district?: string };
      detail?: string;
    };
    const region = address.region || {};

    return {
      id: row.id,
      orderNo: row.orderNo,
      status: row.status,
      bagCount: row.bagCount,
      amountSupplement: Number(row.amountSupplement),
      amountServiceFee: Number(row.amountServiceFee),
      amountPackaging: Number(row.amountPackaging),
      amountGoods: Number(row.amountGoods),
      amountShipping: Number(row.amountShipping),
      amountTotal: Number(row.amountTotal),
      shippingDescription: row.shippingDescription,
      receiverName: address.recipientName ?? '',
      receiverPhone: address.phone ?? '',
      receiverRegion: [region.province, region.city, region.district]
        .filter(Boolean)
        .join(' '),
      receiverDetail: address.detail ?? '',
      recipeId: row.recipeId,
      recipeName: row.recipeName,
      dogId: row.dogId,
      dogName: row.dogName,
      cycleDays: row.cycleDays,
      remark: row.remark,
      paymentMethod: row.paymentMethod,
      paymentStatus: row.paymentStatus,
      paidAt: row.paidAt ? row.paidAt.toISOString() : null,
      aftersaleType: row.aftersaleType,
      aftersaleReason: row.aftersaleReason,
      refundStatus: row.refundStatus,
      refundAmount:
        row.refundAmount === null || row.refundAmount === undefined
          ? null
          : Number(row.refundAmount),
      refundOutNo: row.refundOutNo,
      refundId: row.refundId,
      refundReason: row.refundReason,
      refundedAt: row.refundedAt ? row.refundedAt.toISOString() : null,
      reshipFromOrderNo: row.reshipFromOrderNo,
      trackingNumber: row.trackingNumber,
      carrierCode: row.carrierCode,
      shippedAt: row.shippedAt ? row.shippedAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
      items: row.items.map((item) => ({
        id: item.id,
        ingredientId: item.ingredientId,
        name: item.name,
        brand: item.brand,
        productModel: item.productModel,
        physicalForm: item.physicalForm,
        unit: item.unit,
        requestedAmount: item.requestedAmount,
        packedAmount: item.packedAmount,
        unitCost: Number(item.unitCost),
        cost: Number(item.cost),
        price: Number(item.price),
        bags: item.bags,
        shelfLifeMonths: item.shelfLifeMonths,
        storageCondition: item.storageCondition,
        batchNo: item.batchNo,
        sourceExpiryDate: item.sourceExpiryDate
          ? item.sourceExpiryDate.toISOString()
          : null,
        packedExpiryDate: item.packedExpiryDate
          ? item.packedExpiryDate.toISOString()
          : null,
        packedAt: item.packedAt ? item.packedAt.toISOString() : null,
      })),
    };
  }
}
