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
  /** 只看赠送单（2026-10-30）；只对食谱定制生效 */
  gift?: boolean;
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
  /** 是否有**未完结**的售后（待受理 / 处理中）；有才标成橙色 */
  hasOpenAftersale: boolean;
  /**
   * 卡片上的售后文案，2026-10-30 起补剂也带「已结束」的：
   * 退款中 / 售后中（进行中）· 售后已解决 / 售后已驳回 / 售后已撤回（已结束）。
   * 为空 = 这单从来没提过售后。
   */
  aftersaleLabel: string | null;
  /**
   * 这道订单的食谱名（2026-10-30）。
   *
   * 老板要求列表卡片**不显示顾客名和手机号**，改显示食谱名 —— 员工是按
   * "要做什么菜"干活的，不是按"谁买的"。
   * 拿不到就返回 null（补剂单大多没有绑定食谱），前端整行不显示，不要占位。
   */
  recipeName: string | null;
  /**
   * 员工端「看食谱 / 看狗狗」的跳转依据（2026-10-30）。
   *
   * 为什么放在读模型里：员工在列表上就要能一键进详情，
   * 不能让小程序再拿订单号去换一次 id（多一次请求、还容易对不上）。
   * 三个字段都可能为空，前端只在有值时才显示入口，**不置灰**。
   */
  /** 鲜食单的订单项 id：取「下单那一版」的食谱快照要靠它 */
  itemId: string | null;
  /** 可打开的食谱 id；空 = 这单没有可看的食谱（多数补剂单） */
  recipeId: string | null;
  /** 可打开的狗狗档案 id；空 = 这单没关联狗 */
  dogId: string | null;
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

/** 卡片标签用的售后摘要：一单取最新那条 */
interface SupplementCaseBrief {
  status: string;
  requestType: string;
}

/**
 * 已结束的售后在卡片上怎么说（2026-10-30）。
 *
 * 进行中的沿用原来的「退款中 / 售后中」，口径不动；
 * 这里只补「已经结束」的写法 —— 以前这些单根本不出现在订单中心，
 * 现在会带着灰标出现，员工一眼能分清是「还在处理」还是「早就结完了」。
 */
const CLOSED_AFTERSALE_LABELS: Record<string, string> = {
  RESOLVED: '售后已解决',
  REJECTED: '售后已驳回',
  CANCELLED: '售后已撤回',
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

  /**
   * 员工端「下单那一版食谱」快照（只读，2026-10-30）。
   *
   * 为什么不复用顾客侧的 `/orders/items/:itemId/snapshot`：
   *   · 那个接口**没有鉴权**；
   *   · 它是遍历所有订单去找 item（代码里自己标了 inefficient）。
   *
   * 员工入口的输入就是 itemId，直接按主键取一条最快；
   * 顺手把订单号 / 顾客 / 狗狗 / 下单时间一起带出来，
   * 小程序只发一次请求就能把整页渲染完。
   *
   * 这里是**历史快照**：库存、价格、配方都是下单那一刻的，
   * 不代表当前最新配方 —— 页面必须把这句话写给员工看。
   */
  async getItemSnapshot(itemId: string) {
    const item = await this.prisma.orderItem.findUnique({
      where: { id: itemId },
      select: {
        id: true,
        orderId: true,
        dogId: true,
        quantityG: true,
        packageCount: true,
        packageSpecG: true,
        dailyIntakeG: true,
        recipeSnapshot: true,
        order: {
          select: {
            orderNo: true,
            createdAt: true,
            targetProductionDate: true,
            customer: { select: { nickname: true } },
          },
        },
      },
    });
    if (!item) return null;

    const dog = item.dogId
      ? await this.prisma.dog.findUnique({
          where: { id: item.dogId },
          select: { id: true, name: true },
        })
      : null;

    return {
      itemId: item.id,
      orderId: item.orderId,
      orderNo: item.order.orderNo,
      customerName: item.order.customer?.nickname ?? null,
      createdAt: item.order.createdAt.toISOString(),
      targetProductionDate: item.order.targetProductionDate
        ? TimezoneUtil.shanghaiDateKey(item.order.targetProductionDate)
        : null,
      dog: dog ? { id: dog.id, name: dog.name } : null,
      quantityG: item.quantityG,
      packageCount: item.packageCount,
      packageSpecG: item.packageSpecG,
      dailyIntakeG: item.dailyIntakeG,
      snapshot: item.recipeSnapshot,
    };
  }

  async list(query: OrderCenterQuery, actor: { role?: string } = {}) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
    const fetchSize = Math.min(500, page * pageSize);

    const keywordUserIds = await this.resolveKeywordUserIds(query.keyword);
    const dateWhere = this.buildDateWhere(query);
    const want = (type: OrderCenterType) =>
      !query.type || query.type === type;

    /**
     * 「只看赠送单」只对食谱定制有意义（2026-10-30）。
     *
     * 赠送是定制单的结算方式，鲜食/补剂没有这个概念；
     * 开关打开时列表只查定制单且只查 isGift，但顶部三个数量仍按原口径统计，
     * 否则切到这个筛选，鲜食/补剂会显示 0，像是数据丢了。
     */
    const onlyGift = query.gift === true;
    const wantRows = (type: OrderCenterType) =>
      onlyGift ? type === 'CUSTOM_RECIPE' : want(type);
    /**
     * 补剂售后收口到订单中心（2026-10-30）。
     *
     * 以前这里只取「待受理 / 处理中」的售后单，于是**已经处理完的售后**
     * 在订单中心里彻底看不见 —— 退款成功还会把订单改成「已取消」，
     * 卡片上连「这单退过款」都没有。补剂售后独立页撤掉之后，
     * 订单中心就是员工唯一能看到售后的地方，所以口径改成：
     * **这单提过售后就会出现**，再用卡片标签区分「进行中 / 已结束」。
     *
     * 一单可能有多条售后（被驳回后重新申请、退款后又补发），
     * 卡片上取最新那条；完整历史在补剂订单详情的「售后记录」里。
     */
    const supplementCaseIndex = await this.resolveSupplementCaseIndex();
    const supplementAftersaleIds = Array.from(supplementCaseIndex.keys());
    /**
     * 定制的售后走的是**自己那张表**（`custom_recipe_aftersale`：改稿/退款），
     * 不是鲜食的订单状态、也不是补剂的售后单。
     *
     * 2026-10-30 之前这里直接返回空 → 「只看售后」一开，
     * 定制的售后单会**静默消失**，员工会以为没有单子。现在补上。
     *
     * ⚠️ 无论有没有开「只看售后」都要查：卡片上的「售后处理中」标记
     * 跟筛选是两回事（和补剂的标记口径保持一致）。
     */
    const customOpenCaseMap = await this.resolveCustomOpenCaseMap();
    const customOpenIds = Array.from(customOpenCaseMap.keys());

    const [
      foodRows,
      customRows,
      supplementRows,
      foodTotal,
      customTotal,
      supplementTotal,
    ] = await Promise.all([
      wantRows('FOOD')
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
              dogId: true,
              /**
               * 为什么要带 items：鲜食单的「下单那一版食谱」只存在
               * `order_item.recipe_snapshot` 里，没有别的表能还原。
               * 一次下单只有一项（下单链路写死了单商品），取第一条即可。
               */
              items: {
                // dogId 也带上：订单级 dogId 理论上够用，但订单项这一份才是
                // 「这道食谱是给哪只狗的」，两边不一致时以订单项为准
                select: { id: true, dogId: true, recipeSnapshot: true },
                take: 1,
              },
            },
            orderBy: { createdAt: 'desc' },
            take: fetchSize,
          })
        : Promise.resolve([]),
      wantRows('CUSTOM_RECIPE')
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
              ...(query.aftersale
                ? {
                    id: {
                      in: customOpenIds.length ? customOpenIds : ['__none__'],
                    },
                  }
                : {}),
              ...(onlyGift ? { isGift: true } : {}),
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
              /** 交付后的食谱（未交付为 null）：员工端「看食谱」靠它 */
              recipeId: true,
              /** 卡片上要显示的是食谱名，不是顾客名 */
              recipe: { select: { name: true } },
              dogId: true,
            },
            orderBy: { createdAt: 'desc' },
            take: fetchSize,
          })
        : Promise.resolve([]),
      wantRows('SUPPLEMENT')
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
                      in: supplementAftersaleIds.length
                        ? supplementAftersaleIds
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
              /** 补剂单可能从食谱/制作单带过来；为空就是纯补剂单，前端不显示入口 */
              recipeId: true,
              /** 补剂单自带了食谱名快照，不用再连表 */
              recipeName: true,
              dogId: true,
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
            where: this.customCountWhere(
              query,
              keywordUserIds,
              customOpenIds,
            ),
          })
        : 0,
      want('SUPPLEMENT')
        ? this.prisma.supplementOrder.count({
            where: this.supplementCountWhere(
              query,
              keywordUserIds,
              supplementAftersaleIds,
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

    const items: OrderCenterItem[] = [
      ...foodRows.map((row) => this.mapFood(row, userMap)),
      ...customRows.map((row) =>
        this.mapCustom(row, userMap, customOpenCaseMap),
      ),
      ...supplementRows.map((row) =>
        this.mapSupplement(row, userMap, supplementCaseIndex),
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

  /**
   * 补剂售后索引：orderId → 最新那条售后单（状态 + 诉求）。
   *
   * 取**全状态**，不只未完结的：补剂售后独立页撤掉后，
   * 「只看售后」是员工查历史退过款 / 补过发的唯一入口。
   * 一单可能有多条（驳回后重提），按创建时间倒序，只留最新那条做卡片标签；
   * 完整历史在补剂订单详情的「售后记录」里看。
   *
   * 代价是每次列表都扫一遍补剂售后单（按 orderType 过滤）。
   * 目前售后单是个位数量级；哪天到几千条，再改成只查当前页的订单。
   */
  private async resolveSupplementCaseIndex(): Promise<
    Map<string, SupplementCaseBrief>
  > {
    const rows = await this.prisma.aftersaleCase.findMany({
      where: { orderType: 'SUPPLEMENT' },
      orderBy: { createdAt: 'desc' },
      select: { orderId: true, status: true, requestType: true },
    });
    const index = new Map<string, SupplementCaseBrief>();
    for (const row of rows) {
      if (!index.has(row.orderId)) {
        index.set(row.orderId, {
          status: row.status,
          requestType: row.requestType,
        });
      }
    }
    return index;
  }

  /**
   * 定制售后的未完结单：orderId → 状态。
   *
   * `custom_recipe_aftersale` 的未完结态是 PENDING / ACCEPTED / PROCESSING
   * （RESOLVED、REJECTED 已结束，不该再出现在「只看售后」里）。
   */
  private async resolveCustomOpenCaseMap(): Promise<Map<string, string>> {
    const rows = await this.prisma.customRecipeAftersale.findMany({
      where: { status: { in: ['PENDING', 'ACCEPTED', 'PROCESSING'] } },
      select: { orderId: true, status: true },
    });
    const map = new Map<string, string>();
    for (const row of rows) map.set(row.orderId, row.status);
    return map;
  }

  private mapFood(row: any, users: Map<string, any>): OrderCenterItem {
    const group = this.foodGroup(row.status, row.shippedAt);
    /** 鲜食单一项一道食谱；下单链路写死单商品，这里取第一条 */
    const firstItem = Array.isArray(row.items) ? row.items[0] : null;
    const snapshot = (firstItem?.recipeSnapshot ?? null) as any;
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
      itemId: firstItem?.id ?? null,
      /** 注意：鲜食要看的是 `recipeSnapshot`（下单那一版），不是这条 recipeId */
      recipeId: snapshot?.id ?? null,
      /** 卡片主行显示的是食谱名（老板 2026-10-30 定的口径） */
      recipeName: snapshot?.name ?? null,
      dogId: row.dogId ?? firstItem?.dogId ?? null,
    });
  }

  private mapCustom(
    row: any,
    users: Map<string, any>,
    openCaseMap: Map<string, string>,
  ): OrderCenterItem {
    const group = this.customGroup(row.status);
    const openStatus = openCaseMap.get(row.id);
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
      hasOpenAftersale: Boolean(openStatus),
      aftersaleLabel: openStatus
        ? openStatus === 'PENDING'
          ? '售后待处理'
          : '售后处理中'
        : null,
      itemId: null,
      /**
       * 定制单下单时还没有食谱（营养师下单后才设计），
       * 所以这里只可能是**交付后**的食谱；未交付为 null，前端不显示入口。
       */
      recipeId: row.recipeId ?? null,
      recipeName: row.recipe?.name ?? null,
      dogId: row.dogId ?? null,
    });
  }

  private mapSupplement(
    row: any,
    users: Map<string, any>,
    caseIndex: Map<string, SupplementCaseBrief>,
  ): OrderCenterItem {
    const group = this.supplementGroup(row.status, row.shippedAt);
    const caseInfo = caseIndex.get(row.id);
    const caseOpen =
      caseInfo?.status === 'PENDING' || caseInfo?.status === 'PROCESSING';
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
      hasOpenAftersale: caseOpen || row.status === 'AFTERSALE',
      aftersaleLabel: caseInfo
        ? caseOpen
          ? caseInfo.requestType === 'REFUND'
            ? '退款中'
            : '售后中'
          : (CLOSED_AFTERSALE_LABELS[caseInfo.status] ?? '售后已结束')
        : row.status === 'AFTERSALE'
          ? '售后中'
          : null,
      itemId: null,
      recipeId: row.recipeId ?? null,
      /** 补剂单没有绑定食谱时这里是空，卡片上那行直接不显示 */
      recipeName: row.recipeName ?? null,
      dogId: row.dogId ?? null,
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
    itemId: string | null;
    recipeId: string | null;
    recipeName: string | null;
    dogId: string | null;
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
      itemId: input.itemId,
      recipeId: input.recipeId,
      recipeName: input.recipeName,
      dogId: input.dogId,
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
    openIds: string[],
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
      ...(query.aftersale
        ? { id: { in: openIds.length ? openIds : ['__none__'] } }
        : {}),
      // 总数必须跟着「只看赠送单」一起收窄，否则页码会按 7 条算
      ...(query.gift ? { isGift: true } : {}),
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
