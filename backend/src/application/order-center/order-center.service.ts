import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma.service';
import { TimezoneUtil } from '../../utils/timezone.util';

export type OrderCenterType = 'FOOD' | 'CUSTOM_RECIPE' | 'SUPPLEMENT';
export type UnifiedStatusGroup =
  | 'PENDING'
  | 'PENDING_PAYMENT'
  | 'IN_PROGRESS'
  | 'TO_SHIP'
  | 'SHIPPED'
  | 'COMPLETED'
  | 'CANCELLED';

export interface OrderCenterQuery {
  type?: OrderCenterType;
  status?: UnifiedStatusGroup;
  dateFrom?: string;
  dateTo?: string;
  dateField?: 'created' | 'packing';
  keyword?: string;
  aftersale?: boolean;
  page?: number;
  pageSize?: number;
}

export interface OrderCenterItem {
  type: OrderCenterType;
  id: string;
  orderNo: string;
  customerId: string;
  customerName: string | null;
  customerPhone: string | null;
  /** 顾客账号角色（CUSTOMER / STAFF / ADMIN）；后台据此标「内部测试」 */
  customerRole: string | null;
  statusGroup: UnifiedStatusGroup;
  rawStatus: string;
  statusLabel: string;
  subtypeLabel: string | null;
  amountTotal: number | null;
  /** 赠送单（2026-10-30）：金额 0，列表上必须标出来，否则像价格出错 */
  isGift?: boolean;
  createdAt: string;
  paidAt: string | null;
  scheduledDate: string | null;
  shippedAt: string | null;
  completedAt: string | null;
  hasOpenAftersale: boolean;
  aftersaleLabel: string | null;
}

const GROUP_LABELS: Record<UnifiedStatusGroup, string> = {
  PENDING: '待处理',
  PENDING_PAYMENT: '待付款',
  IN_PROGRESS: '处理中',
  TO_SHIP: '待发货',
  SHIPPED: '已发货',
  COMPLETED: '已完成',
  CANCELLED: '已取消',
};

/**
 * 三类订单统一读模型（2026-10-20）
 *
 * 只读；不写任何业务表；不做统一详情。
 * 第一版三表查询 + 应用层合并，不建视图/汇总表。
 * 数据量 >5 万或 P95 >800ms 时再评估视图/搜索表。
 */
@Injectable()
export class OrderCenterService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: OrderCenterQuery, actor: { role?: string } = {}) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
    const fetchSize = Math.min(500, page * pageSize);

    const keywordUserIds = await this.resolveKeywordUserIds(query.keyword);
    const dateWhere = this.buildDateWhere(query);
    const want = (type: OrderCenterType) =>
      !query.type || query.type === type;
    const supplementOpenIds = await this.resolveSupplementOpenCaseIds(
      query.aftersale,
    );

    const [
      foodRows,
      customRows,
      supplementRows,
      foodTotal,
      customTotal,
      supplementTotal,
    ] = await Promise.all([
      want('FOOD')
        ? this.prisma.order.findMany({
            where: {
              ...dateWhere,
              ...(query.status
                ? { status: { in: this.foodStatuses(query.status) as never[] } }
                : {}),
              ...(query.keyword
                ? {
                    OR: [
                      { orderNo: { contains: query.keyword, mode: 'insensitive' } },
                      { id: { contains: query.keyword, mode: 'insensitive' } },
                      ...(keywordUserIds && keywordUserIds.length > 0
                        ? [{ customerId: { in: keywordUserIds } }]
                        : []),
                    ],
                  }
                : {}),
              ...(query.aftersale ? { status: 'AFTERSALE' as never } : {}),
            },
            select: {
              id: true,
              orderNo: true,
              customerId: true,
              status: true,
              type: true,
              amountTotal: true,
              createdAt: true,
              paidAt: true,
              shippedAt: true,
              completedAt: true,
              targetProductionDate: true,
              shippingAddressSnapshot: true,
            },
            orderBy: { createdAt: 'desc' },
            take: fetchSize,
          })
        : Promise.resolve([]),
      want('CUSTOM_RECIPE')
        ? this.prisma.customRecipeOrder.findMany({
            where: {
              ...dateWhere,
              ...(query.status
                ? { status: { in: this.customStatuses(query.status) as never[] } }
                : {}),
              ...(query.keyword
                ? {
                    OR: [
                      { orderId: { contains: query.keyword, mode: 'insensitive' } },
                      { id: { contains: query.keyword, mode: 'insensitive' } },
                      ...(keywordUserIds && keywordUserIds.length > 0
                        ? [{ customerId: { in: keywordUserIds } }]
                        : []),
                    ],
                  }
                : {}),
              ...(query.aftersale ? { id: { in: [] } } : {}),
            },
            select: {
              id: true,
              orderId: true,
              customerId: true,
              status: true,
              amount: true,
              createdAt: true,
              paymentConfirmedAt: true,
              deliveredAt: true,
              cancelledAt: true,
              /** 赠送单标记（2026-10-30）：列表要标出来，否则 ¥0 像价格异常 */
              isGift: true,
            },
            orderBy: { createdAt: 'desc' },
            take: fetchSize,
          })
        : Promise.resolve([]),
      want('SUPPLEMENT')
        ? this.prisma.supplementOrder.findMany({
            where: {
              ...(query.dateField === 'packing' && (query.dateFrom || query.dateTo)
                ? this.buildPackingDateWhere(query)
                : dateWhere),
              ...(query.status
                ? { status: { in: this.supplementStatuses(query.status) as never[] } }
                : {}),
              ...(query.keyword
                ? {
                    OR: [
                      { orderNo: { contains: query.keyword, mode: 'insensitive' } },
                      { id: { contains: query.keyword, mode: 'insensitive' } },
                      ...(keywordUserIds && keywordUserIds.length > 0
                        ? [{ userId: { in: keywordUserIds } }]
                        : []),
                    ],
                  }
                : {}),
              ...(query.aftersale
                ? {
                    id: {
                      in: supplementOpenIds.length
                        ? supplementOpenIds
                        : ['__none__'],
                    },
                  }
                : {}),
            },
            select: {
              id: true,
              orderNo: true,
              userId: true,
              status: true,
              amountTotal: true,
              createdAt: true,
              paidAt: true,
              packingDate: true,
              shippedAt: true,
              completedAt: true,
              shippingAddressSnapshot: true,
            },
            orderBy: { createdAt: 'desc' },
            take: fetchSize,
          })
        : Promise.resolve([]),
      want('FOOD')
        ? this.prisma.order.count({
            where: this.foodCountWhere(query, keywordUserIds),
          })
        : 0,
      want('CUSTOM_RECIPE')
        ? this.prisma.customRecipeOrder.count({
            where: this.customCountWhere(query, keywordUserIds),
          })
        : 0,
      want('SUPPLEMENT')
        ? this.prisma.supplementOrder.count({
            where: this.supplementCountWhere(
              query,
              keywordUserIds,
              supplementOpenIds,
            ),
          })
        : 0,
    ]);

    const userIds = Array.from(
      new Set(
        [...foodRows, ...customRows, ...supplementRows].map(
          (row: any) => row.customerId ?? row.userId,
        ),
      ),
    );
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, nickname: true, phone: true, role: true },
        })
      : [];
    const userMap = new Map(users.map((user) => [user.id, user]));

    const supplementIds = supplementRows.map((row) => row.id);
    const openCaseRows = supplementIds.length
      ? await this.prisma.aftersaleCase.findMany({
          where: {
            orderType: 'SUPPLEMENT',
            orderId: { in: supplementIds },
            status: { in: ['PENDING', 'PROCESSING'] },
          },
          select: { orderId: true, requestType: true },
        })
      : [];
    const openCaseMap = new Map(
      openCaseRows.map((row) => [row.orderId, row.requestType]),
    );

    const items: OrderCenterItem[] = [
      ...foodRows.map((row) => this.mapFood(row, userMap)),
      ...customRows.map((row) => this.mapCustom(row, userMap)),
      ...supplementRows.map((row) =>
        this.mapSupplement(row, userMap, openCaseMap),
      ),
    ]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice((page - 1) * pageSize, page * pageSize);

    if (actor.role === 'STAFF') {
      for (const item of items) item.amountTotal = null;
    }

    return {
      items,
      total: foodTotal + customTotal + supplementTotal,
      page,
      pageSize,
      counts: {
        FOOD: foodTotal,
        CUSTOM_RECIPE: customTotal,
        SUPPLEMENT: supplementTotal,
      },
    };
  }

  private buildDateWhere(query: OrderCenterQuery): {
    createdAt?: { gte?: Date; lt?: Date };
  } {
    if (!query.dateFrom && !query.dateTo) return {};
    const from = query.dateFrom
      ? TimezoneUtil.startOfShanghaiDay(
          TimezoneUtil.parseDateOnly(query.dateFrom),
        )
      : undefined;
    const to = query.dateTo
      ? TimezoneUtil.startOfShanghaiDay(
          TimezoneUtil.addDays(
            TimezoneUtil.parseDateOnly(query.dateTo),
            1,
          ),
        )
      : undefined;
    return { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } };
  }

  private buildPackingDateWhere(query: OrderCenterQuery): {
    packingDate?: { gte?: Date; lt?: Date };
  } {
    return {
      packingDate: {
        ...(query.dateFrom
          ? { gte: TimezoneUtil.parseDateOnly(query.dateFrom) }
          : {}),
        ...(query.dateTo
          ? {
              lt: TimezoneUtil.addDays(
                TimezoneUtil.parseDateOnly(query.dateTo),
                1,
              ),
            }
          : {}),
      },
    };
  }

  private async resolveKeywordUserIds(
    keyword?: string,
  ): Promise<string[] | null> {
    if (!keyword) return null;
    const users = await this.prisma.user.findMany({
      where: {
        OR: [
          { nickname: { contains: keyword, mode: 'insensitive' } },
          { phone: { contains: keyword, mode: 'insensitive' } },
        ],
      },
      select: { id: true },
      take: 50,
    });
    return users.map((user) => user.id);
  }

  private async resolveSupplementOpenCaseIds(
    onlyOpen: boolean | undefined,
  ): Promise<string[]> {
    if (!onlyOpen) return [];
    const rows = await this.prisma.aftersaleCase.findMany({
      where: {
        orderType: 'SUPPLEMENT',
        status: { in: ['PENDING', 'PROCESSING'] },
      },
      select: { orderId: true },
    });
    return Array.from(new Set(rows.map((row) => row.orderId)));
  }

  private mapFood(row: any, users: Map<string, any>): OrderCenterItem {
    const group = this.foodGroup(row.status, row.shippedAt);
    return this.baseItem({
      type: 'FOOD',
      id: row.id,
      orderNo: row.orderNo || row.id,
      row,
      userId: row.customerId,
      users,
      group,
      rawStatus: row.status,
      subtypeLabel:
        row.type === 'TASTING_PACK'
          ? '试吃装'
          : row.type === 'CUSTOM_SERVICE'
            ? '定制服务'
            : null,
      scheduledDate: row.targetProductionDate
        ? TimezoneUtil.shanghaiDateKey(row.targetProductionDate)
        : null,
      amount: Number(row.amountTotal ?? 0),
      hasOpenAftersale: row.status === 'AFTERSALE',
      aftersaleLabel: row.status === 'AFTERSALE' ? '售后中' : null,
    });
  }

  private mapCustom(row: any, users: Map<string, any>): OrderCenterItem {
    const group = this.customGroup(row.status);
    return this.baseItem({
      type: 'CUSTOM_RECIPE',
      id: row.id,
      orderNo: row.orderId,
      row,
      userId: row.customerId,
      users,
      group,
      rawStatus: row.status,
      subtypeLabel: '定制食谱',
      scheduledDate: null,
      amount: Number(row.amount ?? 0),
      isGift: row.isGift === true,
      hasOpenAftersale: false,
      aftersaleLabel: null,
    });
  }

  private mapSupplement(
    row: any,
    users: Map<string, any>,
    openCaseMap: Map<string, string>,
  ): OrderCenterItem {
    const group = this.supplementGroup(row.status, row.shippedAt);
    const openType = openCaseMap.get(row.id);
    return this.baseItem({
      type: 'SUPPLEMENT',
      id: row.id,
      orderNo: row.orderNo,
      row,
      userId: row.userId,
      users,
      group,
      rawStatus: row.status,
      subtypeLabel: '补剂',
      scheduledDate: row.packingDate
        ? TimezoneUtil.shanghaiDateKey(row.packingDate)
        : null,
      amount: Number(row.amountTotal ?? 0),
      hasOpenAftersale: Boolean(openType) || row.status === 'AFTERSALE',
      aftersaleLabel: openType
        ? openType === 'REFUND'
          ? '退款中'
          : '售后中'
        : row.status === 'AFTERSALE'
          ? '售后中'
          : null,
    });
  }

  private baseItem(input: {
    type: OrderCenterType;
    id: string;
    orderNo: string;
    row: any;
    userId: string;
    users: Map<string, any>;
    group: UnifiedStatusGroup;
    rawStatus: string;
    subtypeLabel: string | null;
    scheduledDate: string | null;
    amount: number;
    hasOpenAftersale: boolean;
    aftersaleLabel: string | null;
    isGift?: boolean;
  }): OrderCenterItem {
    const user = input.users.get(input.userId);
    const address = (input.row.shippingAddressSnapshot ?? {}) as Record<
      string,
      any
    >;
    return {
      type: input.type,
      id: input.id,
      orderNo: input.orderNo,
      customerId: input.userId,
      customerName: user?.nickname ?? address.recipientName ?? null,
      customerPhone: user?.phone ?? address.phone ?? null,
      customerRole: user?.role ?? null,
      statusGroup: input.group,
      rawStatus: input.rawStatus,
      statusLabel: GROUP_LABELS[input.group],
      subtypeLabel: input.subtypeLabel,
      amountTotal: input.amount,
      isGift: input.isGift === true,
      createdAt: input.row.createdAt.toISOString(),
      paidAt:
        input.row.paidAt?.toISOString?.() ??
        input.row.paymentConfirmedAt?.toISOString?.() ??
        null,
      scheduledDate: input.scheduledDate,
      shippedAt: input.row.shippedAt?.toISOString?.() ?? null,
      completedAt:
        input.row.completedAt?.toISOString?.() ??
        input.row.deliveredAt?.toISOString?.() ??
        null,
      hasOpenAftersale: input.hasOpenAftersale,
      aftersaleLabel: input.aftersaleLabel,
    };
  }

  private foodGroup(
    status: string,
    shippedAt: Date | null,
  ): UnifiedStatusGroup {
    if (status === 'INIT') return 'PENDING';
    if (status === 'PENDING_PAYMENT') return 'PENDING_PAYMENT';
    if (['PAID', 'PURCHASING', 'IN_PRODUCTION'].includes(status)) {
      return 'IN_PROGRESS';
    }
    if (status === 'FREEZING') return 'TO_SHIP';
    if (status === 'SHIPPED') return 'SHIPPED';
    if (status === 'COMPLETED') return 'COMPLETED';
    if (status === 'CANCELLED') return 'CANCELLED';
    if (status === 'AFTERSALE') return shippedAt ? 'SHIPPED' : 'IN_PROGRESS';
    return 'IN_PROGRESS';
  }

  private customGroup(status: string): UnifiedStatusGroup {
    if (status === 'PENDING_PAYMENT') return 'PENDING_PAYMENT';
    if (['PAID', 'IN_PROGRESS'].includes(status)) return 'IN_PROGRESS';
    if (['DELIVERED', 'COMPLETED'].includes(status)) return 'COMPLETED';
    if (status === 'CANCELLED') return 'CANCELLED';
    return 'IN_PROGRESS';
  }

  private supplementGroup(
    status: string,
    shippedAt: Date | null,
  ): UnifiedStatusGroup {
    if (status === 'PENDING_PAYMENT') return 'PENDING_PAYMENT';
    if (['PAID', 'PACKING'].includes(status)) return 'IN_PROGRESS';
    if (status === 'PACKED') return 'TO_SHIP';
    if (status === 'SHIPPED') return 'SHIPPED';
    if (status === 'COMPLETED') return 'COMPLETED';
    if (status === 'CANCELLED') return 'CANCELLED';
    if (status === 'AFTERSALE') return shippedAt ? 'SHIPPED' : 'IN_PROGRESS';
    return 'IN_PROGRESS';
  }

  private foodStatuses(group: UnifiedStatusGroup): string[] {
    switch (group) {
      case 'PENDING':
        return ['INIT'];
      case 'PENDING_PAYMENT':
        return ['PENDING_PAYMENT'];
      case 'IN_PROGRESS':
        return ['PAID', 'PURCHASING', 'IN_PRODUCTION', 'AFTERSALE'];
      case 'TO_SHIP':
        return ['FREEZING'];
      case 'SHIPPED':
        return ['SHIPPED'];
      case 'COMPLETED':
        return ['COMPLETED'];
      case 'CANCELLED':
        return ['CANCELLED'];
    }
  }

  private customStatuses(group: UnifiedStatusGroup): string[] {
    switch (group) {
      case 'PENDING_PAYMENT':
        return ['PENDING_PAYMENT'];
      case 'IN_PROGRESS':
        return ['PAID', 'IN_PROGRESS'];
      case 'COMPLETED':
        return ['DELIVERED', 'COMPLETED'];
      case 'CANCELLED':
        return ['CANCELLED'];
      default:
        return [];
    }
  }

  private supplementStatuses(group: UnifiedStatusGroup): string[] {
    switch (group) {
      case 'PENDING_PAYMENT':
        return ['PENDING_PAYMENT'];
      case 'IN_PROGRESS':
        return ['PAID', 'PACKING', 'AFTERSALE'];
      case 'TO_SHIP':
        return ['PACKED'];
      case 'SHIPPED':
        return ['SHIPPED'];
      case 'COMPLETED':
        return ['COMPLETED'];
      case 'CANCELLED':
        return ['CANCELLED'];
      default:
        return [];
    }
  }

  private foodCountWhere(
    query: OrderCenterQuery,
    userIds: string[] | null,
  ) {
    return {
      ...this.buildDateWhere(query),
      ...(query.status
        ? { status: { in: this.foodStatuses(query.status) as never[] } }
        : {}),
      ...(query.keyword
        ? {
            OR: [
              {
                orderNo: {
                  contains: query.keyword,
                  mode: 'insensitive' as const,
                },
              },
              {
                id: {
                  contains: query.keyword,
                  mode: 'insensitive' as const,
                },
              },
              ...(userIds && userIds.length > 0
                ? [{ customerId: { in: userIds } }]
                : []),
            ],
          }
        : {}),
      ...(query.aftersale ? { status: 'AFTERSALE' as never } : {}),
    };
  }

  private customCountWhere(
    query: OrderCenterQuery,
    userIds: string[] | null,
  ) {
    return {
      ...this.buildDateWhere(query),
      ...(query.status
        ? { status: { in: this.customStatuses(query.status) as never[] } }
        : {}),
      ...(query.keyword
        ? {
            OR: [
              {
                orderId: {
                  contains: query.keyword,
                  mode: 'insensitive' as const,
                },
              },
              {
                id: {
                  contains: query.keyword,
                  mode: 'insensitive' as const,
                },
              },
              ...(userIds && userIds.length > 0
                ? [{ customerId: { in: userIds } }]
                : []),
            ],
          }
        : {}),
      ...(query.aftersale ? { id: { in: [] } } : {}),
    };
  }

  private supplementCountWhere(
    query: OrderCenterQuery,
    userIds: string[] | null,
    openIds: string[],
  ) {
    return {
      ...(query.dateField === 'packing' && (query.dateFrom || query.dateTo)
        ? this.buildPackingDateWhere(query)
        : this.buildDateWhere(query)),
      ...(query.status
        ? { status: { in: this.supplementStatuses(query.status) as never[] } }
        : {}),
      ...(query.keyword
        ? {
            OR: [
              {
                orderNo: {
                  contains: query.keyword,
                  mode: 'insensitive' as const,
                },
              },
              {
                id: {
                  contains: query.keyword,
                  mode: 'insensitive' as const,
                },
              },
              ...(userIds && userIds.length > 0
                ? [{ userId: { in: userIds } }]
                : []),
            ],
          }
        : {}),
      ...(query.aftersale
        ? { id: { in: openIds.length ? openIds : ['__none__'] } }
        : {}),
    };
  }
}
