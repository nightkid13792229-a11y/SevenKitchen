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
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma.service';
import { TimezoneUtil } from '../../utils/timezone.util';
import { IngredientType } from '../../domain/ingredient/enums';
import {
  SupplementPricingService,
  resolveMaxPortionMultiplier,
  type SupplementQuote,
  type SupplementQuoteLineInput,
} from './supplement-pricing.service';
import {
  SupplementShopConfigService,
  type SupplementShopConfigDto,
} from './supplement-shop-config.service';
import type { IngredientPhysicalFormCode } from './supplement-catalog.service';
import { SupplementSchedulingService } from './supplement-scheduling.service';
import { SupplementInventoryService } from './supplement-inventory.service';
import { SupplementSnapshotService } from './supplement-snapshot.service';
import { SupplementNotificationService } from './supplement-notification.service';
import {
  SupplementCandidateService,
  type SupplementCandidateItem,
} from './supplement-candidate.service';
import { computeSheetTotalWeightG } from './supplement-sheet-weight.util';
import {
  isSupplementUnitOneToOne,
  toSupplementBaseQuantity,
} from './supplement-unit.util';

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
  /**
   * 旧协议：{ ingredientId, amount }（客户端算量）；
   * 新协议：{ ingredientId, recipeItemId }（服务端算量，amount 可省略）。
   */
  lines: Array<{
    ingredientId: string;
    amount?: number;
    recipeItemId?: string;
  }>;
  /**
   * 加量份数（1 = 不加量）。每份 = 每个补剂多做一袋同样规格的小袋。
   * 服务端会按配置的份数上限与总天数上限校验，越界直接拒绝。
   */
  portionMultiplier?: number;
  /**
   * 制作单覆盖的天数。加量要靠它算总天数与"每天成本"，
   * 也是"总天数 ≤ 效期安全线"这条校验的必需输入。
   */
  cycleDays?: number;
  /** 新协议必须带：制作单 ID（算量、版本锚定、冻结快照都靠它） */
  diySheetId?: string;
}

export interface CreateSupplementOrderRequest extends SupplementQuoteRequest {
  addressId: string;
  recipeId?: string;
  recipeName?: string;
  dogId?: string;
  dogName?: string;
  reorderFromOrderNo?: string;
  remark?: string;
}

export interface SupplementQuoteResponse {
  quote: SupplementQuote;
  /** 用户提交但当前不可购买的补剂（已下架 / 非补剂 / 无价） */
  unavailable: Array<{ ingredientId: string; name: string; reason: string }>;
  enabled: boolean;
  /** 库存系统验收前的软提示；不阻止下单 */
  inventoryWarnings: string[];
}

export interface SupplementOrderItemView {
  id: string;
  ingredientId: string;
  recipeItemId?: string | null;
  sourceIngredientId?: string | null;
  dosageSnapshot?: unknown | null;
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
  /** 员工端：金额字段已被后端脱敏，前端不要展示金额区 */
  amountsRedacted?: boolean;
  /** 是否有未完结补剂售后（新 case，不依赖订单旧 aftersaleType） */
  hasOpenAftersale?: boolean;
  openAftersaleLabel?: string | null;
  /** 库存系统验收前的软提示：本次分装缺料，但不阻断 */
  inventoryWarnings?: string[];
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
  /** 本单买了几份（1 = 未加量） */
  portionMultiplier: number;
  /** 本单覆盖的总天数（下单时快照） */
  totalDays: number | null;
  remark: string | null;
  paymentMethod: string | null;
  paymentStatus: string | null;
  paidAt: string | null;
  /** 分装日（预计发货日）；null = 待排期 */
  packingDate: string | null;
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
  /**
   * 这单的全部售后记录（2026-10-30，新→旧）。
   *
   * 为什么放在订单详情里：补剂售后独立页撤掉后，订单中心卡片只知道
   * 「这单有没有售后、到哪一步」，具体的诉求 / 原因 / 补发单号，
   * 以及「一单提过两条售后」这种情况，都靠这里展开。
   * 员工端脱敏：不给退款金额。
   */
  aftersaleCases?: SupplementOrderAftersaleCaseView[];
  items: SupplementOrderItemView[];
}

/** 订单详情里的一条售后记录（员工只看流程，不看钱） */
export interface SupplementOrderAftersaleCaseView {
  id: string;
  caseNo: string;
  status: string;
  requestType: string;
  requestedReason: string;
  resolutionType: string | null;
  reshipOrderNo: string | null;
  createdAt: string;
  /** 仅管理员可见；员工端为 null */
  refundAmount: number | null;
}

export interface SupplementLabel {
  /** 标签唯一标识：同一个补剂有多袋时各不相同，列表 key 用它 */
  labelId: string;
  itemId: string;
  productName: string;
  amountText: string;
  /** 这是该补剂的第几袋（从 1 开始） */
  bagIndex: number;
  /** 该补剂一共几袋。加量后 > 1，此时每袋都要贴一张标签 */
  bagTotal: number;
  packedDate: string;
  expiryDate: string;
  batchNo: string | null;
  storageCondition: string;
  sourceProduct: string;
  sourceExpiryDate: string;
  /** 标签「用法」：按制作单的每日用量生成 */
  usageText: string;
  /** 标签「分装者」：第一版用品牌名，后续可接操作人 */
  packerName: string;
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
    @Optional()
    private readonly schedulingService?: SupplementSchedulingService,
    @Optional()
    private readonly inventoryService?: SupplementInventoryService,
    @Optional()
    private readonly snapshotService?: SupplementSnapshotService,
    @Optional()
    private readonly notificationService?: SupplementNotificationService,
    @Optional()
    private readonly candidateService?: SupplementCandidateService,
  ) {}

  /**
   * 报价（无副作用）。
   * 价格永远由服务端按补剂档案现算，客户端只提供 ingredientId 与用量。
   */
  async quote(
    request: SupplementQuoteRequest,
    userId?: string,
  ): Promise<SupplementQuoteResponse> {
    const { quote, unavailable, config } = await this.buildQuote(request, userId);
    return {
      quote,
      unavailable,
      enabled: config.enabled,
      inventoryWarnings: await this.buildInventoryWarnings(quote),
    };
  }

  /** 创建补剂订单（价格服务端重算，不信任客户端传来的金额） */
  async createOrder(
    userId: string,
    request: CreateSupplementOrderRequest,
  ): Promise<SupplementOrderView> {
    const { quote, unavailable, config, meta, dosage } =
      await this.buildQuote(request, userId);

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

    if (request.reorderFromOrderNo) {
      const source = await this.prisma.supplementOrder.findUnique({
        where: { orderNo: request.reorderFromOrderNo },
        select: { id: true, userId: true },
      });
      if (!source || source.userId !== userId) {
        throw new BadRequestException('再次购买的来源订单不存在');
      }
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
          reorderFromOrderNo: request.reorderFromOrderNo ?? null,
          // 加量信息：份数取报价里已校验收敛过的值，总天数用报价算出来的那个
          // （它已经把 cycleDays 与份数乘好了，且受效期上限约束）。
          portionMultiplier: quote.portionMultiplier,
          totalDays: quote.totalDays,
          remark: request.remark ?? null,
          items: {
            create: quote.lines.map((line) => {
              const dosageLines = (dosage?.byIngredient.get(
                line.ingredientId,
              ) ?? []) as any[];
              return {
              ingredientId: line.ingredientId,
              recipeItemId: dosageLines[0]?.recipeItemId ?? null,
              sourceIngredientId:
                dosageLines[0]?.sourceIngredientId ?? null,
              dosageSnapshot: dosageLines.length
                ? ({
                    totalWeightG: dosage?.totalWeightG ?? null,
                    weightSource: dosage?.weightSource ?? 'DIY_SHEET',
                    lines: dosageLines,
                  } as Prisma.InputJsonValue)
                : undefined,
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
              };
            }),
          },
        },
        select: { id: true },
      });

      if (request.diySheetId) {
        await this.snapshotService?.freezeForOrder(tx, {
          orderId: created.id,
          userId,
          diySheetId: request.diySheetId,
        });
      }

      if (request.reorderFromOrderNo && tx.supplementOrderEvent) {
        await tx.supplementOrderEvent.create({
          data: {
            orderId: created.id,
            type: 'REORDERED',
            actorType: 'CUSTOMER',
            actorId: userId,
            reason: `再次购买，来源 ${request.reorderFromOrderNo}`,
            metadata: { sourceOrderNo: request.reorderFromOrderNo },
          },
        });
      }

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

    const items = await this.decorateOpenAftersale(
      rows.map((row) => this.toOrderView(row)),
    );
    return { items, total, page, pageSize };
  }

  async getOrder(userId: string, orderId: string): Promise<SupplementOrderView> {
    const order = await this.prisma.supplementOrder.findFirst({
      where: { id: orderId, userId },
      include: { items: { orderBy: { createdAt: 'asc' } } },
    });

    if (!order) {
      throw new NotFoundException(`补剂订单不存在: ${orderId}`);
    }
    const [view] = await this.decorateOpenAftersale([this.toOrderView(order)]);
    return view;
  }

  /** 后台：所有补剂订单 */
  async listAllOrders(
    query: ListSupplementOrdersQuery = {},
    actor: { role?: string } = {},
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

    const items = await this.decorateOpenAftersale(
      rows.map((row) => this.toOrderView(row, actor.role === 'STAFF')),
    );
    return { items, total, page, pageSize };
  }

  async getOrderById(
    orderId: string,
    actor: { role?: string } = {},
  ): Promise<SupplementOrderView> {
    const order = await this.prisma.supplementOrder.findUnique({
      where: { id: orderId },
      include: { items: { orderBy: { createdAt: 'asc' } } },
    });
    if (!order) {
      throw new NotFoundException(`补剂订单不存在: ${orderId}`);
    }
    const [view] = await this.decorateOpenAftersale([
      this.toOrderView(order, actor.role === 'STAFF'),
    ]);
    view.aftersaleCases = await this.loadAftersaleCases(
      orderId,
      actor.role === 'STAFF',
    );
    return view;
  }

  /**
   * 这单的全部售后记录（2026-10-30）。
   *
   * 和 `decorateOpenAftersale` 一样用可选链兜底：旧库/测试环境没有
   * `aftersale_case` 表时，订单详情照常打开，只是没有售后区块，
   * 不能因为查售后把整页拖黑。
   * 员工端不给退款金额 —— 和售后列表的口径保持一致。
   */
  private async loadAftersaleCases(
    orderId: string,
    redact: boolean,
  ): Promise<SupplementOrderAftersaleCaseView[]> {
    try {
      const rows = await (this.prisma as any).aftersaleCase?.findMany?.({
        where: { orderType: 'SUPPLEMENT', orderId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          caseNo: true,
          status: true,
          requestType: true,
          requestedReason: true,
          resolutionType: true,
          reshipOrderNo: true,
          createdAt: true,
          refundAmount: true,
        },
      });
      if (!Array.isArray(rows)) return [];
      return rows.map((row: any) => ({
        id: row.id,
        caseNo: row.caseNo,
        status: row.status,
        requestType: row.requestType,
        requestedReason: row.requestedReason ?? '',
        resolutionType: row.resolutionType ?? null,
        reshipOrderNo: row.reshipOrderNo ?? null,
        createdAt:
          row.createdAt instanceof Date
            ? row.createdAt.toISOString()
            : String(row.createdAt ?? ''),
        refundAmount:
          redact || row.refundAmount === null || row.refundAmount === undefined
            ? null
            : Number(row.refundAmount),
      }));
    } catch {
      return [];
    }
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

    await this.scheduleAfterPayment(orderId);
    return this.getOrderById(orderId);
  }

  /**
   * 微信支付回调确认收款（幂等）。
   * 与人工确认分开，便于区分收款渠道与对账。
   */
  async confirmPaymentFromWechat(
    orderId: string,
    transactionId: string,
    successTime?: Date | null,
  ): Promise<SupplementOrderView> {
    const order = await this.requireOrder(orderId);

    // 微信可能重复回调：已付款但仍未排期时，补一次排期；不重复写收款
    if (order.status === 'PAID') {
      await this.scheduleAfterPayment(orderId);
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
        // 用微信 success_time，而不是回调到达时间；拿不到才用当前时间
        paidAt: successTime ?? new Date(),
      },
    });

    await this.scheduleAfterPayment(orderId);
    return this.getOrderById(orderId);
  }

  /**
   * 排期是支付后的后续动作：失败不能把已确认的收款回滚。
   * 失败时排期服务会写 SCHEDULE_FAILED，定时任务会重试。
   */
  private async scheduleAfterPayment(orderId: string): Promise<void> {
    if (!this.schedulingService) return;
    try {
      await this.schedulingService.scheduleOrder(orderId, { type: 'SYSTEM' });
    } catch {
      // 排期服务已记录事件；这里只保证支付确认成功
    }
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
      force?: boolean;
      forceReason?: string;
    },
    actor: { type: 'STAFF' | 'ADMIN'; id?: string | null } = { type: 'STAFF' },
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

    const force = dto.force === true;
    if (force && actor.type !== 'ADMIN') {
      throw new BadRequestException('只有管理员可以强制分装');
    }
    if (force && !dto.forceReason?.trim()) {
      throw new BadRequestException('强制分装必须填写原因');
    }

    let inventoryWarnings: string[] = [];
    await this.prisma.$transaction(async (tx) => {
      // 条件更新先抢订单：并发分装第二次会拿到 count=0
      if (typeof (tx.supplementOrder as any).updateMany === 'function') {
        const claimed = await tx.supplementOrder.updateMany({
          where: {
            id: orderId,
            status: { in: ['PAID', 'PACKING'] },
          },
          data: { status: 'PACKED' },
        });
        if (claimed.count !== 1) {
          throw new BadRequestException('订单已被其他人处理，请刷新后再试');
        }
      }

      const shortages = this.inventoryService
        ? await this.inventoryService.getShortages(tx, orderId)
        : [];
      // 库存系统尚未验收：缺料只提示，不阻断分装。
      // 管理员“强制分装”仍保留，用于语义上的显式确认/留痕。
      inventoryWarnings = shortages.map(
        (item) =>
          `${item.name}需 ${item.required}，账面 ${item.onHand}，已占用 ${item.allocated}`,
      );

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
      await this.inventoryService?.consumeForOrder(tx, orderId, {
        // 当前阶段不因库存/预占缺失阻断分装；缺料在响应和事件中提示
        allowMissing: true,
      });
      if (typeof (tx.supplementOrder as any).updateMany !== 'function') {
        await tx.supplementOrder.update({
          where: { id: orderId },
          data: { status: 'PACKED' },
        });
      }
      if (tx.supplementOrderEvent) {
        await tx.supplementOrderEvent.create({
          data: {
            orderId,
            type: force ? 'FORCE_PACKED' : 'PACKED',
            fromValue: order.status,
            toValue: 'PACKED',
            actorType: actor.type,
            actorId: actor.id ?? null,
            reason: force ? dto.forceReason!.trim() : null,
            metadata:
              shortages.length > 0
                ? ({
                    shortages,
                    inventoryWarnings: true,
                    forced: force,
                  } as Prisma.InputJsonValue)
                : undefined,
          },
        });
      }
    });

    const view = await this.getOrderById(orderId);
    if (inventoryWarnings.length > 0) {
      view.inventoryWarnings = inventoryWarnings;
    }
    return view;
  }

  /** 管理员手动完成：仅 SHIPPED；正常情况仍由 10 天自动完成 */
  async completeOrder(
    orderId: string,
    adminId: string | null,
  ): Promise<SupplementOrderView> {
    const order = await this.requireOrder(orderId);
    this.assertStatus(order.status, ['SHIPPED'], '完成');
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.supplementOrder.update({
        where: { id: orderId },
        data: { status: 'COMPLETED', completedAt: now },
      });
      if (tx.supplementOrderEvent) {
        await tx.supplementOrderEvent.create({
          data: {
            orderId,
            type: 'COMPLETED',
            fromValue: 'SHIPPED',
            toValue: 'COMPLETED',
            actorType: 'ADMIN',
            actorId: adminId,
            reason: '管理员手动完成',
          },
        });
      }
    });
    await this.notificationService?.notify(orderId, 'COMPLETED');
    return this.getOrderById(orderId);
  }

  /** 发货：只有已完成分装的订单才能填单号；PACKED 有未完结退款时拒绝 */
  /**
   * 补剂发货（2026-10-31 与鲜食统一口径）。
   *
   *   · NORMAL        —— 正常寄快递：单号必填，实际运费必填
   *   · NOT_REQUIRED  —— 无需发货（自用单）：直接结案，不产生物流信息
   */
  async shipOrder(
    orderId: string,
    dto: {
      shippingType?: 'NORMAL' | 'NOT_REQUIRED';
      trackingNumber?: string;
      carrierCode?: string;
      actualShippingFee?: number | null;
    },
    actor: { type: 'STAFF' | 'ADMIN' | 'SYSTEM'; id?: string | null } = {
      type: 'STAFF',
    },
  ): Promise<SupplementOrderView> {
    const order = await this.requireOrder(orderId);
    this.assertStatus(order.status, ['PACKED'], '发货');

    if (await this.hasOpenSupplementRefund(orderId)) {
      throw new BadRequestException(
        '该订单有未完结退款，不能发货；请先处理退款或驳回',
      );
    }

    // 无需发货：自用单直接结案，没有单号也没有运费
    if (dto.shippingType === 'NOT_REQUIRED') {
      await this.prisma.supplementOrder.update({
        where: { id: orderId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          noShippingRequired: true,
          trackingNumber: null,
          carrierCode: null,
          shippedAt: null,
          actualShippingFee: null,
        },
      });

      try {
        await this.prisma.supplementOrderEvent.create({
          data: {
            orderId,
            type: 'COMPLETED',
            fromValue: 'PACKED',
            toValue: 'COMPLETED',
            actorType: actor.type,
            actorId: actor.id ?? null,
            metadata: { shippingType: 'NOT_REQUIRED' },
          },
        });
      } catch {
        // 审计失败不影响结案
      }

      return this.getOrderById(orderId);
    }

    const trackingNumber = (dto.trackingNumber || '').trim();
    if (!trackingNumber) {
      throw new BadRequestException('请填写快递单号');
    }

    const actualShippingFee =
      typeof dto.actualShippingFee === 'number' && Number.isFinite(dto.actualShippingFee)
        ? Number(dto.actualShippingFee.toFixed(2))
        : null;

    await this.prisma.supplementOrder.update({
      where: { id: orderId },
      data: {
        status: 'SHIPPED',
        trackingNumber,
        carrierCode: dto.carrierCode?.trim() || null,
        actualShippingFee: actualShippingFee === null ? null : actualShippingFee.toFixed(2),
        shippedAt: new Date(),
      },
    });

    try {
      await this.prisma.supplementOrderEvent.create({
        data: {
          orderId,
          type: 'SHIPPED',
          fromValue: 'PACKED',
          toValue: 'SHIPPED',
          actorType: actor.type,
          actorId: actor.id ?? null,
          metadata: { trackingNumber, carrierCode: dto.carrierCode ?? null },
        },
      });
    } catch {
      // 审计失败不影响发货；日志/告警在后续统一接
    }

    await this.notificationService?.notify(orderId, 'SHIPPED');

    // 补发单发货后，售后 case 自动 RESOLVED
    try {
      const caseRow = await (this.prisma as any).aftersaleCase?.findFirst?.({
        where: { reshipOrderId: orderId, status: 'PROCESSING' },
      });
      if (caseRow?.id) {
        await (this.prisma as any).aftersaleCase.update({
          where: { id: caseRow.id },
          data: { status: 'RESOLVED', resolvedAt: new Date() },
        });
      }
    } catch {
      // 售后回写失败不影响发货；后台可手工处理
    }

    return this.getOrderById(orderId);
  }

  private async hasOpenSupplementRefund(orderId: string): Promise<boolean> {
    const delegate = (this.prisma as any).aftersaleCase;
    if (!delegate?.count) return false;
    const count = await delegate.count({
      where: {
        orderType: 'SUPPLEMENT',
        orderId,
        requestType: 'REFUND',
        status: { in: ['PENDING', 'PROCESSING'] },
      },
    });
    return count > 0;
  }

  /** 取消订单（已发货的不能直接取消，要走售后） */
  /**
   * 找出「超过支付时限、仍是待付款」的补剂订单。
   *
   * 给定时任务自动关单用。放在 service 里而不是让定时任务直接查库：
   * 数据访问收敛在一处，超时口径（用哪个字段、算多长时间）也只有这里定义。
   */
  async findExpiredUnpaidOrders(
    timeoutMinutes: number,
    limit = 200,
  ): Promise<Array<{ id: string; orderNo: string; createdAt: Date }>> {
    if (!Number.isFinite(timeoutMinutes) || timeoutMinutes <= 0) return [];
    return this.prisma.supplementOrder.findMany({
      where: {
        status: 'PENDING_PAYMENT',
        createdAt: { lt: new Date(Date.now() - timeoutMinutes * 60 * 1000) },
      },
      select: { id: true, orderNo: true, createdAt: true },
      take: limit,
      orderBy: { createdAt: 'asc' },
    });
  }

  async cancelOrder(
    orderId: string,
    dto: { reason?: string } = {},
    customerId?: string,
    actor: { type: 'CUSTOMER' | 'ADMIN' | 'SYSTEM'; id?: string | null } = {
      type: 'ADMIN',
    },
  ): Promise<SupplementOrderView> {
    const order = await this.requireOrder(orderId);
    if (customerId && order.userId !== customerId) {
      throw new NotFoundException('补剂订单不存在');
    }
    // PAID 必须走售后全额退款；只有退款成功后的 SYSTEM 内部收尾可以直接取消
    this.assertStatus(
      order.status,
      actor.type === 'SYSTEM' ||
      (order.reshipFromOrderNo && Number(order.amountTotal) === 0)
        ? ['PENDING_PAYMENT', 'PAID']
        : ['PENDING_PAYMENT'],
      '取消',
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.supplementOrder.update({
        where: { id: orderId },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancellationReason: dto.reason?.trim() || '后台取消',
        },
      });
      await this.inventoryService?.releaseForOrder(tx, orderId);
      // 取消补发单：把售后 case 放回 PROCESSING 并解除补发单绑定，允许重新补发
      if (order.reshipFromOrderNo) {
        const original = await tx.supplementOrder.findUnique({
          where: { orderNo: order.reshipFromOrderNo },
          select: { id: true },
        });
        if (original) {
          await tx.aftersaleCase.updateMany({
            where: {
              orderType: 'SUPPLEMENT',
              orderId: original.id,
              reshipOrderId: orderId,
            },
            data: {
              status: 'PROCESSING',
              reshipOrderId: null,
              reshipOrderNo: null,
            },
          });
        }
      }
      if (tx.supplementOrderEvent) {
        await tx.supplementOrderEvent.create({
          data: {
            orderId,
            type: 'CANCELLED',
            fromValue: order.status,
            toValue: 'CANCELLED',
            actorType: actor.type,
            actorId: actor.id ?? null,
            reason: dto.reason?.trim() || null,
          },
        });
      }
    });

    return this.getOrderById(orderId);
  }

  /** 未发货自助改地址；已打面单提示重打 */
  async updateAddress(
    userId: string,
    orderId: string,
    dto: { addressId: string; setAsDefault?: boolean },
  ): Promise<{ order: SupplementOrderView; needsReprint: boolean }> {
    const order = await this.requireOrder(orderId);
    if (order.userId !== userId) throw new NotFoundException('补剂订单不存在');
    if (!['PENDING_PAYMENT', 'PAID', 'PACKED'].includes(order.status)) {
      throw new BadRequestException('已发货订单不能修改地址，请联系客服/快递');
    }

    const address = await this.prisma.address.findUnique({
      where: { id: dto.addressId },
    });
    if (!address || address.userId !== userId) {
      throw new BadRequestException('收货地址不存在');
    }
    const region = (address.region || {}) as Record<string, unknown>;
    const snapshot = {
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

    const needsReprint = order.status === 'PACKED';
    const oldAddress = order.shippingAddressSnapshot ?? null;
    await this.prisma.$transaction(async (tx) => {
      await tx.supplementOrder.update({
        where: { id: orderId },
        data: { shippingAddressSnapshot: snapshot },
      });
      if (dto.setAsDefault) {
        await tx.address.updateMany({
          where: { userId },
          data: { isDefault: false },
        });
        await tx.address.update({
          where: { id: address.id },
          data: { isDefault: true },
        });
      }
      try {
        await tx.supplementOrderEvent.create({
          data: {
            orderId,
            type: 'ADDRESS_CHANGED',
            actorType: 'CUSTOMER',
            actorId: userId,
            metadata: {
              needsReprint,
              oldAddress,
              newAddress: snapshot,
            } as Prisma.InputJsonValue,
          },
        });
      } catch {
        // 事件失败不影响改地址
      }
    });

    return {
      order: await this.getOrderById(orderId),
      needsReprint,
    };
  }

  /** 补剂订单关联的制作单快照；旧单无快照时返回 null + 标记 */
  async getOrderSnapshot(orderId: string, userId?: string) {
    const order = await this.prisma.supplementOrder.findUnique({
      where: { id: orderId },
      select: { id: true, orderNo: true, userId: true, diySheetId: true },
    });
    if (!order) throw new NotFoundException('补剂订单不存在');
    if (userId && order.userId !== userId) {
      throw new NotFoundException('补剂订单不存在');
    }
    if (!order.diySheetId) {
      return { orderNo: order.orderNo, snapshot: null, snapshotAt: null, legacy: true };
    }
    const sheet = await this.prisma.dIYSheet.findUnique({
      where: { id: order.diySheetId },
      select: {
        id: true,
        recipeVersion: true,
        snapshot: true,
        snapshotAt: true,
      },
    });
    if (!sheet?.snapshot) {
      return { orderNo: order.orderNo, snapshot: null, snapshotAt: null, legacy: true };
    }
    return {
      orderNo: order.orderNo,
      sheetId: sheet.id,
      recipeVersion: sheet.recipeVersion,
      snapshot: sheet.snapshot,
      snapshotAt: sheet.snapshotAt?.toISOString() ?? null,
      legacy: false,
    };
  }

  /** 管理员代改地址：保留原/新快照，写 ADMIN 审计 */
  async adminUpdateAddress(
    orderId: string,
    dto: {
      recipientName: string;
      phone: string;
      province: string;
      city: string;
      district?: string;
      detail: string;
      reason?: string;
    },
    adminId: string | null,
  ): Promise<{ order: SupplementOrderView; needsReprint: boolean }> {
    const order = await this.requireOrder(orderId);
    if (!['PENDING_PAYMENT', 'PAID', 'PACKED'].includes(order.status)) {
      throw new BadRequestException('已发货订单不能修改地址');
    }
    const oldAddress = order.shippingAddressSnapshot ?? null;
    const snapshot = {
      addressId: null,
      recipientName: dto.recipientName.trim(),
      phone: dto.phone.trim(),
      region: {
        province: dto.province.trim(),
        city: dto.city.trim(),
        district: dto.district?.trim() || undefined,
      },
      detail: dto.detail.trim(),
    };
    if (
      !snapshot.recipientName ||
      !snapshot.phone ||
      !snapshot.region.province ||
      !snapshot.region.city ||
      !snapshot.detail
    ) {
      throw new BadRequestException('收件人、手机号、省市和详细地址不能为空');
    }
    const needsReprint = order.status === 'PACKED';
    await this.prisma.$transaction(async (tx) => {
      await tx.supplementOrder.update({
        where: { id: orderId },
        data: { shippingAddressSnapshot: snapshot },
      });
      if (tx.supplementOrderEvent) {
        await tx.supplementOrderEvent.create({
          data: {
            orderId,
            type: 'ADDRESS_CHANGED',
            actorType: 'ADMIN',
            actorId: adminId,
            reason: dto.reason?.trim() || null,
            metadata: {
              needsReprint,
              oldAddress,
              newAddress: snapshot,
            } as Prisma.InputJsonValue,
          },
        });
      }
    });
    return { order: await this.getOrderById(orderId), needsReprint };
  }

  /** 再次购买：按原单/快照清单重新报价，不直接建单 */
  async repurchase(userId: string, orderId: string) {
    const order = await this.prisma.supplementOrder.findUnique({
      where: { id: orderId },
      include: { items: { orderBy: { createdAt: 'asc' } } },
    });
    if (!order || order.userId !== userId) {
      throw new NotFoundException('补剂订单不存在');
    }
    if (order.items.length === 0) {
      throw new BadRequestException('原订单没有可复购的补剂');
    }

    const lines: SupplementQuoteLineInput[] = order.items.map((item) => ({
      ingredientId: item.ingredientId,
      name: item.name,
      unit: item.unit,
      amount: item.requestedAmount,
      unitCost: Number(item.unitCost),
      physicalForm: (item.physicalForm ?? 'POWDER') as IngredientPhysicalFormCode,
    }));
    const { quote, unavailable, config } = await this.buildQuote({
      lines,
      cycleDays: order.cycleDays ?? undefined,
      portionMultiplier: order.portionMultiplier ?? 1,
    });

    return {
      quote,
      unavailable,
      enabled: config.enabled,
      sourceOrderNo: order.orderNo,
      sourceOrderId: order.id,
      remark: order.remark,
    };
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
  /** 标签补打留痕；同一张多次打印会累计 printCount */
  async recordLabelsPrinted(
    orderId: string,
    labelIds: string[],
    actor: { type: 'STAFF' | 'ADMIN'; id?: string | null } = { type: 'STAFF' },
  ): Promise<{ printCount: number; reprint: boolean }> {
    const order = await this.prisma.supplementOrder.findUnique({
      where: { id: orderId },
      select: { id: true },
    });
    if (!order) throw new NotFoundException('补剂订单不存在');

    const previous = await this.prisma.supplementOrderEvent.count({
      where: { orderId, type: 'LABEL_PRINTED' },
    });
    const cleanIds = Array.from(new Set(labelIds.filter(Boolean))).slice(0, 100);
    await this.prisma.supplementOrderEvent.create({
      data: {
        orderId,
        type: 'LABEL_PRINTED',
        actorType: actor.type,
        actorId: actor.id ?? null,
        reason: previous > 0 ? '标签补打' : '标签打印',
        metadata: {
          labelIds: cleanIds,
          labelCount: cleanIds.length,
          printCount: previous + 1,
          reprint: previous > 0,
        },
      },
    });
    return { printCount: previous + 1, reprint: previous > 0 };
  }

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

    let packerName = config.labelBrandName;
    try {
      const event = await (this.prisma as any).supplementOrderEvent?.findFirst?.({
        where: {
          orderId,
          type: { in: ['PACKED', 'FORCE_PACKED'] },
          actorId: { not: null },
        },
        orderBy: { createdAt: 'desc' },
        select: { actorId: true },
      });
      if (event?.actorId) {
        const actor = await this.prisma.user.findUnique({
          where: { id: event.actorId },
          select: { nickname: true },
        });
        if (actor?.nickname) packerName = actor.nickname;
      }
    } catch {
      // 旧单/测试环境没有事件表时回退品牌名
    }

    return {
      orderNo: order.orderNo,
      brandName: config.labelBrandName,
      receiverName: this.readReceiverName(order.shippingAddressSnapshot),
      // 加量的语义是「同一个补剂多做几袋**同样规格**的小袋」，所以一个补剂
      // 对应 bags 袋、需要 bags 张标签（内容相同，只差第几袋的序号）。
      // 展开放在这里做，免得每个调用方各自实现一遍、然后有人漏掉 —— 之前
      // 就是每个补剂只出一条记录，买 3 份的订单会有 2 袋没标签可贴。
      labels: order.items.flatMap((item) => {
        const bagTotal = Math.max(1, item.bags ?? 1);
        const shared = {
          itemId: item.id,
          productName: item.name,
          // packedAmount 是**每袋**的量（加量乘的是成本，不是量），
          // 所以同一补剂的每一袋标签写同一个数。
          amountText: `${formatAmount(item.packedAmount)}${item.unit}`,
          packedDate: item.packedAt
            ? TimezoneUtil.shanghaiDateKey(item.packedAt)
            : '',
          expiryDate: this.toDateText(item.packedExpiryDate),
          batchNo: item.batchNo,
          storageCondition: item.storageCondition || DEFAULT_STORAGE_CONDITION,
          sourceProduct: [item.brand, item.productModel]
            .filter(Boolean)
            .join(' · '),
          sourceExpiryDate: this.toDateText(item.sourceExpiryDate),
          usageText: `每日 ${formatAmount(item.requestedAmount)}${item.unit}`,
          packerName,
          disclaimer: config.labelIncludeDesiccantNotice
            ? `${LABEL_DISCLAIMER}；${LABEL_DESICCANT_NOTICE}`
            : LABEL_DISCLAIMER,
        };

        return Array.from({ length: bagTotal }, (_, index) => ({
          ...shared,
          labelId: `${item.id}#${index + 1}`,
          bagIndex: index + 1,
          bagTotal,
        }));
      }),
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
   * 按售后 case 补发：每个 case 最多一张补发单。
   * 原订单履约状态不变；case 由 PROCESSING 等到补发单发货后 RESOLVED。
   */
  async createReshipForCase(
    caseId: string,
    adminId: string,
    reason: string,
  ): Promise<SupplementOrderView> {
    const caseRow = await this.prisma.aftersaleCase.findUnique({
      where: { id: caseId },
    });
    if (!caseRow || caseRow.orderType !== 'SUPPLEMENT') {
      throw new NotFoundException('售后记录不存在');
    }
    if (!['PENDING', 'PROCESSING'].includes(caseRow.status)) {
      throw new BadRequestException('该售后已处理，不能重复补发');
    }
    if (caseRow.reshipOrderId) {
      throw new BadRequestException(
        `该售后已经补发过（补发单 ${caseRow.reshipOrderNo ?? ''}），不能重复补发`,
      );
    }

    const original = await this.prisma.supplementOrder.findUnique({
      where: { id: caseRow.orderId },
      include: { items: { orderBy: { createdAt: 'asc' } } },
    });
    if (!original) throw new NotFoundException('补剂订单不存在');
    if (!['SHIPPED', 'COMPLETED'].includes(original.status)) {
      throw new BadRequestException('只有已发货/已完成的订单可以补发');
    }

    const reasonText = (reason || '').trim() || '免费补发';
    const now = new Date();

    const reshipId = await this.prisma.$transaction(async (tx) => {
      const orderNo = await this.generateOrderNo(tx);
      const created = await tx.supplementOrder.create({
        data: {
          orderNo,
          userId: original.userId,
          status: 'PAID',
          bagCount: original.bagCount,
          portionMultiplier: original.portionMultiplier,
          totalDays: original.totalDays,
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
          diySheetId: original.diySheetId,
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
              price: 0,
              bags: item.bags,
              shelfLifeMonths: item.shelfLifeMonths,
              storageCondition: item.storageCondition,
            })),
          },
        },
        select: { id: true, orderNo: true },
      });

      await tx.aftersaleCase.update({
        where: { id: caseId },
        data: {
          status: 'PROCESSING',
          resolutionType: 'RESHIP',
          handlerId: adminId,
          handlingNote: reasonText,
          acceptedAt: caseRow.acceptedAt ?? now,
          reshipOrderId: created.id,
          reshipOrderNo: created.orderNo,
        },
      });
      if (tx.supplementOrderEvent) {
        await tx.supplementOrderEvent.create({
          data: {
            orderId: original.id,
            type: 'RESHIPPED',
            actorType: 'ADMIN',
            actorId: adminId,
            reason: reasonText,
            metadata: {
              caseId,
              reshipOrderNo: created.orderNo,
            } as Prisma.InputJsonValue,
          },
        });
      }

      return created.id;
    });

    try {
      await this.schedulingService?.scheduleOrder(reshipId, { type: 'SYSTEM' });
    } catch {
      // 排期失败会写 SCHEDULE_FAILED；补发单仍在待排期，由定时任务重试
    }

    return this.getOrderById(reshipId);
  }

  /**
   * 免费补发：按原单原样生成一张 0 元补发单，直接进入待分装。
   * 原单标记为售后中，并记录了补发关系，避免重复补发。
   *
   * @deprecated 新代码用 createReshipForCase；保留此方法给旧接口过渡。
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
  private async buildQuote(
    request: SupplementQuoteRequest,
    userId?: string,
  ): Promise<{
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
    dosage: {
      totalWeightG: number;
      weightSource: 'DIY_SHEET';
      byIngredient: Map<string, any[]>;
    } | null;
  }> {
    const dosage = await this.resolveServerDosageLines(request, userId);
    const requested = this.normalizeRequestedLines(
      dosage ? dosage.lines : request.lines,
    );
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

    /**
     * 加量份数校验（服务端说了算，不信客户端）。
     *
     * 为什么在这里拒绝、而不是让 pricing service 静默收敛：
     * 客户端只会在响应里拿到 maxPortionMultiplier，然后据此渲染选项；
     * 如果它仍然传来一个越界值，那是 bug 或篡改 —— 静默改成 3 份会让用户
     * 看到的金额与实际下单金额不一致。直接报错最清楚。
     */
    const cycleDays =
      Number.isFinite(Number(request.cycleDays)) &&
      Number(request.cycleDays) > 0
        ? Math.floor(Number(request.cycleDays))
        : null;
    const requestedMultiplier = request.portionMultiplier;
    if (requestedMultiplier !== undefined && requestedMultiplier !== null) {
      if (
        !Number.isInteger(requestedMultiplier) ||
        requestedMultiplier < 1
      ) {
        throw new BadRequestException('加量份数必须是不小于 1 的整数');
      }
      const maxPortionMultiplier = resolveMaxPortionMultiplier(
        config,
        cycleDays,
      );
      if (requestedMultiplier > maxPortionMultiplier) {
        throw new BadRequestException(
          cycleDays === null
            ? `加量份数最多 ${maxPortionMultiplier} 份`
            : `这张制作单是 ${cycleDays} 天量，最多只能买 ${maxPortionMultiplier} 份（分装效期所限）`,
        );
      }
    }

    const quote = await this.pricingService.previewQuote({
      lines: available,
      totalWeightG: this.estimateWeightG(available),
      portionMultiplier: requestedMultiplier ?? 1,
      cycleDays,
    });

    return { quote, unavailable, config, meta, dosage };
  }

  /**
   * 新协议：按制作单 + 食谱版本 + 被选原料，服务端算量。
   *
   * 旧协议（没有任何 recipeItemId）返回 null，行为完全不变。
   * 这里同时复核“被选原料是不是这一行允许的候选”，
   * 防止客户端把任意补剂塞进某一行。
   */
  private async resolveServerDosageLines(
    request: SupplementQuoteRequest,
    userId?: string,
  ): Promise<{
    lines: Array<{ ingredientId: string; amount: number }>;
    totalWeightG: number;
    weightSource: 'DIY_SHEET';
    byIngredient: Map<string, any[]>;
  } | null> {
    const rawLines = request.lines ?? [];
    const withRecipeItem = rawLines.filter((line) => line.recipeItemId);
    if (withRecipeItem.length === 0) {
      return null;
    }
    if (withRecipeItem.length !== rawLines.length) {
      throw new BadRequestException('补剂清单不能混用新旧格式');
    }
    if (!request.diySheetId) {
      throw new BadRequestException('新协议必须带制作单 ID');
    }
    if (!this.candidateService) {
      throw new BadRequestException('补剂候选服务未启用');
    }

    const sheet = await this.prisma.dIYSheet.findUnique({
      where: { id: request.diySheetId },
      select: {
        id: true,
        userId: true,
        recipeId: true,
        recipeVersion: true,
        packagePlan: true,
        dailyIntakeG: true,
        cycleDays: true,
      },
    });
    if (!sheet) {
      throw new BadRequestException('制作单不存在');
    }
    if (userId && sheet.userId !== userId) {
      throw new BadRequestException('制作单不属于当前用户');
    }

    const totalWeightG = computeSheetTotalWeightG(sheet);
    if (!(totalWeightG > 0)) {
      throw new BadRequestException('制作单缺少批次总重，无法计算补剂用量');
    }

    let recipeVersion = sheet.recipeVersion ?? null;
    if (!recipeVersion) {
      const latest = await this.prisma.recipe.findFirst({
        where: { recipeId: sheet.recipeId },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      if (!latest) {
        throw new BadRequestException('制作单对应的食谱不存在');
      }
      recipeVersion = latest.version;
    }

    const resolved = await this.candidateService.resolveForRecipe({
      recipeBusinessId: sheet.recipeId,
      recipeVersion,
      totalWeightG,
      weightSource: 'DIY_SHEET',
      audience: 'CUSTOMER',
    });
    const itemMap = new Map(
      resolved.items.map((item) => [item.recipeItemId, item]),
    );
    const byIngredient = new Map<string, any[]>();
    const lines: Array<{ ingredientId: string; amount: number }> = [];

    for (const line of rawLines) {
      const item = line.recipeItemId
        ? itemMap.get(line.recipeItemId)
        : undefined;
      if (!item) {
        throw new BadRequestException('食谱已更新，请刷新制作单');
      }

      const candidate = item.candidates.find(
        (option) => option.ingredientId === line.ingredientId,
      );

      let amount: number | null = candidate?.dosage.amount ?? null;
      let dosage = candidate?.dosage;
      let selectionSource:
        | 'EQUIVALENCE_GROUP'
        | 'RECIPE_ALTERNATIVE'
        | 'DEFAULT'
        | 'RATIO' = 'DEFAULT';

      if (candidate) {
        selectionSource =
          candidate.ingredientId === item.sourceIngredientId
            ? 'DEFAULT'
            : item.source === 'EQUIVALENCE_GROUP'
              ? 'EQUIVALENCE_GROUP'
              : 'RECIPE_ALTERNATIVE';
      } else if (
        line.ingredientId === item.sourceIngredientId &&
        item.fallbackAmount !== null
      ) {
        amount = item.fallbackAmount;
        dosage = item.defaultIngredient.dosage;
        selectionSource = 'RATIO';
      } else {
        throw new BadRequestException(
          item.unavailableReason ?? '该补剂已调整，请刷新制作单',
        );
      }

      if (amount === null || !Number.isFinite(amount) || amount <= 0) {
        throw new BadRequestException(
          `「${item.defaultIngredient.name}」用量暂不可算，请联系客服`,
        );
      }

      lines.push({ ingredientId: line.ingredientId, amount });

      const bucket = byIngredient.get(line.ingredientId) ?? [];
      bucket.push({
        recipeItemId: item.recipeItemId,
        sourceIngredientId: item.sourceIngredientId,
        selectionSource,
        group: item.group,
        targets: dosage?.targets ?? [],
        concentrations: dosage?.concentrations ?? [],
        calculatedAmount: amount,
        submittedAmount: line.amount ?? null,
        unit: dosage?.unit ?? item.defaultIngredient.displayUnit,
      });
      byIngredient.set(line.ingredientId, bucket);
    }

    return {
      lines,
      totalWeightG,
      weightSource: 'DIY_SHEET',
      byIngredient,
    };
  }

  private normalizeRequestedLines(
    lines: Array<{ ingredientId: string; amount?: number }>,
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

  /**
   * 库存软提示（不阻断）：库存系统尚未验收，只在报价页告诉顾客
   * 当前账面可能不够，最终以分装时实物为准。
   */
  private async buildInventoryWarnings(
    quote: SupplementQuote,
  ): Promise<string[]> {
    if (process.env.SUPPLEMENT_INVENTORY_RESERVATION_ENABLED !== 'true') {
      return [];
    }
    const lines = quote.lines || [];
    if (lines.length === 0) return [];
    const ids = Array.from(new Set(lines.map((line) => line.ingredientId)));
    const ingredients = await this.prisma.ingredient.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, baseUnit: true },
    });
    const byId = new Map(ingredients.map((item) => [item.id, item]));
    const balances = await this.prisma.inventoryLedgerEntry.groupBy({
      by: ['ingredientId'],
      where: { ingredientId: { in: ids } },
      _sum: { deltaG: true },
    });
    const balanceMap = new Map(
      balances.map((row) => [
        row.ingredientId,
        Number(row._sum.deltaG ?? 0),
      ]),
    );
    const warnings: string[] = [];
    for (const line of lines) {
      const ingredient = byId.get(line.ingredientId);
      if (!ingredient) continue;
      let required: number;
      try {
        required = await toSupplementBaseQuantity(
          line.unit,
          Number(line.packedAmount) * Math.max(1, Number(line.bags) || 1),
          ingredient.baseUnit,
          ingredient.name,
        );
      } catch {
        continue;
      }
      const onHand = balanceMap.get(line.ingredientId) ?? 0;
      if (onHand < required) {
        warnings.push(
          `${line.name}账面 ${onHand}${ingredient.baseUnit}，本单约需 ${required}${ingredient.baseUnit}`,
        );
      }
    }
    return warnings;
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

      if (!isSupplementUnitOneToOne(displayUnit, ingredient.baseUnit)) {
        unavailable.push({
          ingredientId: ingredient.id,
          name: ingredient.name,
          reason: `展示单位「${displayUnit}」与库存单位 ${ingredient.baseUnit} 不能 1:1 换算`,
        });
        continue;
      }

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
      // 2 = 商品小计只算补剂商品；服务费/包邮门槛都按商品小计
      pricingVersion: 2,
      markupMultiplier: config.markupMultiplier,
      serviceFeeMode: config.serviceFeeMode,
      serviceFeeAmount: config.serviceFeeAmount,
      freeServiceThreshold: config.freeServiceThreshold,
      packagingFeePerBag: config.packagingFeePerBag,
      priceRoundingMode: config.priceRoundingMode,
      roundUpUsage: config.roundUpUsage,
      shippingMode: config.shippingMode,
      flatShippingFee: config.flatShippingFee,
      shippingTemplateId: config.shippingTemplateId,
      freeShippingThreshold: config.freeShippingThreshold,
      powderShelfLifeMonths: config.powderShelfLifeMonths,
      solidShelfLifeMonths: config.solidShelfLifeMonths,
      oilShelfLifeMonths: config.oilShelfLifeMonths,
      dailyCutoffTime: config.dailyCutoffTime,
      dailyPackingCapacity: config.dailyPackingCapacity,
      aftersaleWindowDays: config.aftersaleWindowDays,
      autoCompleteDays: config.autoCompleteDays,
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

  private async decorateOpenAftersale(
    views: SupplementOrderView[],
  ): Promise<SupplementOrderView[]> {
    const ids = views.map((view) => view.id);
    if (ids.length === 0) return views;
    try {
      const cases = await (this.prisma as any).aftersaleCase?.findMany?.({
        where: {
          orderType: 'SUPPLEMENT',
          orderId: { in: ids },
          status: { in: ['PENDING', 'PROCESSING'] },
        },
        select: { orderId: true, requestType: true },
      });
      if (!cases?.length) return views;
      const byOrder = new Map<string, string>();
      for (const item of cases) byOrder.set(item.orderId, item.requestType);
      for (const view of views) {
        const requestType = byOrder.get(view.id);
        if (requestType) {
          view.hasOpenAftersale = true;
          view.openAftersaleLabel = requestType === 'REFUND' ? '退款中' : '售后中';
        }
      }
    } catch {
      // 旧库/测试环境没有 case 表时不影响订单读取
    }
    return views;
  }

  private toOrderView(
    row: {
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
    portionMultiplier: number;
    totalDays: number | null;
    remark: string | null;
    paymentMethod: string | null;
    paymentStatus: string | null;
    paidAt: Date | null;
    packingDate: Date | null;
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
  },
  redact = false,
  ): SupplementOrderView {
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
      amountSupplement: redact ? 0 : Number(row.amountSupplement),
      amountServiceFee: redact ? 0 : Number(row.amountServiceFee),
      amountPackaging: redact ? 0 : Number(row.amountPackaging),
      amountGoods: redact ? 0 : Number(row.amountGoods),
      amountShipping: redact ? 0 : Number(row.amountShipping),
      amountTotal: redact ? 0 : Number(row.amountTotal),
      amountsRedacted: redact || undefined,
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
      portionMultiplier: row.portionMultiplier ?? 1,
      totalDays: row.totalDays ?? null,
      remark: row.remark,
      paymentMethod: row.paymentMethod,
      paymentStatus: row.paymentStatus,
      paidAt: row.paidAt ? row.paidAt.toISOString() : null,
      packingDate: row.packingDate
        ? row.packingDate.toISOString().slice(0, 10)
        : null,
      aftersaleType: row.aftersaleType,
      aftersaleReason: row.aftersaleReason,
      refundStatus: redact ? null : row.refundStatus,
      refundAmount: redact
        ? null
        : row.refundAmount === null || row.refundAmount === undefined
          ? null
          : Number(row.refundAmount),
      refundOutNo: redact ? null : row.refundOutNo,
      refundId: redact ? null : row.refundId,
      refundReason: redact ? null : row.refundReason,
      refundedAt: row.refundedAt ? row.refundedAt.toISOString() : null,
      reshipFromOrderNo: row.reshipFromOrderNo,
      trackingNumber: row.trackingNumber,
      carrierCode: row.carrierCode,
      shippedAt: row.shippedAt ? row.shippedAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
      items: row.items.map((item) => ({
        id: item.id,
        ingredientId: item.ingredientId,
        recipeItemId: (item as any).recipeItemId ?? null,
        sourceIngredientId: (item as any).sourceIngredientId ?? null,
        dosageSnapshot: (item as any).dosageSnapshot ?? null,
        name: item.name,
        brand: item.brand,
        productModel: item.productModel,
        physicalForm: item.physicalForm,
        unit: item.unit,
        requestedAmount: item.requestedAmount,
        packedAmount: item.packedAmount,
        unitCost: redact ? 0 : Number(item.unitCost),
        cost: redact ? 0 : Number(item.cost),
        price: redact ? 0 : Number(item.price),
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
