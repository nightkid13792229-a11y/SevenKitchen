import { Optional,
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CustomRecipeStatus } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma.service';
import { CustomRecipeConfigService } from './custom-recipe-config.service';
import { PlatformOptionsService } from '../platform-options/platform-options.service';
import { CustomerMessageService } from '../message/customer-message.service';
import { CUSTOM_RECIPE_AFTERSALE_TYPE_SET } from '../platform-options/option-sets.registry';
import {
  ALLOWED_AFTERSALE_TRANSITIONS,
  CUSTOM_RECIPE_AFTERSALE_STATUS_LABELS,
  aftersaleUrgency,
  canCustomerCancelAftersale,
  canTransitionAftersale,
  describeAftersaleProgress,
  isAftersaleOpen,
} from '../../domain/custom-recipe/custom-recipe.aftersale';

/**
 * 定制食谱 · 售后（2026-10-16，批次 2.5）
 *
 * ## 它补上的是什么
 *
 * 在此之前**售后完全没有**：通用售后页只认成品订单，定制单点进去是错的页面。
 * 顾客交付后不满意，只能微信找客服，**系统里一点痕迹都不留** ——
 * 谁提的、什么时候提的、怎么处理的，全靠聊天记录。
 *
 * ## 三条设计口径
 *
 * **一、售后独立于订单状态。** 不把"售后中"做成订单的一个状态 ——
 * 否则"已交付"与"售后中"会互相覆盖，跟原来 `DELIVERED` 是死胡同一样僵。
 * 一张已完成的单可以同时挂着一条售后单。
 *
 * **二、类型来自选项字典，不写死。** 老板想加一类"要发票"或改个说法，
 * 后台改一次就行，不用发版（这是批次 1.3 建字典的用处）。
 *
 * **三、窗口从交付时间起算。** 天数取配置 `aftersale_window_days`。
 * 超窗口不允许**新提**，但**已提的照常处理到底** ——
 * 不能因为窗口到了就把人家等着回复的售后单扔掉。
 */
@Injectable()
export class CustomRecipeAftersaleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: CustomRecipeConfigService,
    private readonly platformOptions: PlatformOptionsService,
    /**
     * 站内消息（2026-10-18 · 需求 2.9）。
     *
     * `@Optional()`：这条依赖是**通知**，不是业务主链路 ——
     * 发不出去也不该让"处理售后"失败。跟交付服务那边同一个处理。
     */
    @Optional()
    private readonly customerMessages?: CustomerMessageService,
  ) {}

  /**
   * 顾客提交售后。
   */
  async create(input: {
    orderIdOrId: string;
    customerId: string;
    type: string;
    description: string;
    photos?: string[];
    now?: Date;
  }): Promise<{
    id: string;
    type: string;
    typeLabel: string;
    status: string;
    statusLabel: string;
  }> {
    const now = input.now ?? new Date();

    const order = await this.prisma.customRecipeOrder.findFirst({
      where: {
        OR: [{ orderId: input.orderIdOrId }, { id: input.orderIdOrId }],
      },
      select: {
        id: true,
        orderId: true,
        customerId: true,
        status: true,
        deliveredAt: true,
      },
    });

    if (!order) {
      throw new NotFoundException(`定制订单不存在: ${input.orderIdOrId}`);
    }
    if (order.customerId !== input.customerId) {
      throw new ForbiddenException('无权操作此订单');
    }
    if (order.status === CustomRecipeStatus.CANCELLED) {
      throw new BadRequestException('订单已取消，不需要提售后');
    }

    const currentDelivery = await this.prisma.customRecipeDelivery.findFirst({
      where: { orderId: order.id, replacedByDeliveryId: null },
      orderBy: { version: 'desc' },
      select: { id: true, deliveredAt: true },
    });

    if (!currentDelivery) {
      throw new BadRequestException('这张订单还没有交付，暂时不能提售后');
    }

    /**
     * 窗口校验。超窗口**不允许新提**，但见下方：已提的照常处理到底。
     */
    const windowDays = await this.getWindowDays();
    if (windowDays > 0) {
      const closesAt = new Date(
        currentDelivery.deliveredAt.getTime() +
          windowDays * 24 * 60 * 60 * 1000,
      );
      if (now.getTime() > closesAt.getTime()) {
        throw new BadRequestException(
          `已超过售后受理期（交付后 ${windowDays} 天内），如需帮助请联系客服`,
        );
      }
    }

    /**
     * 免费次数校验（2026-10-18 · 需求 2.5.9「能提 2 次」）。
     *
     * ⚠️ 此前**完全没有这道校验** —— 顾客可以无限提，后台待办会一直涨。
     *
     * 撤回的不计数（2.5.9：「撤回算不算用掉 → 不算」）。
     */
    const quota = await this.getQuota(order.id, input.customerId);
    if (quota.freeRevisionsLeft <= 0) {
      throw new BadRequestException(
        quota.reason ||
          `免费调整次数已用完（共 ${quota.freeRevisionCount} 次），如需帮助请联系客服`,
      );
    }

    /**
     * 同一条售后单不许重复提。
     *
     * 为什么拦：顾客提完没看到变化，很可能再提一次 ——
     * 后台就会出现两条一模一样的待办，客服还得自己去重。
     * 只拦"还没处理完的"，已解决的可以再提（同一个问题复发了）。
     */
    const open = await this.prisma.customRecipeAftersale.findFirst({
      where: {
        orderId: order.id,
        status: { in: ['PENDING', 'ACCEPTED', 'PROCESSING'] },
      },
      select: { id: true },
    });
    if (open) {
      throw new BadRequestException(
        '你已经提交过售后，我们正在处理中。有新情况可以直接在客服里补充',
      );
    }

    const trimmed = (input.description || '').trim();
    if (!trimmed) {
      throw new BadRequestException('请说一下遇到的具体情况');
    }

    const typeLabel = await this.resolveTypeLabel(input.type);

    const created = await this.prisma.customRecipeAftersale.create({
      data: {
        orderId: order.id,
        deliveryId: currentDelivery.id,
        type: input.type,
        description: trimmed,
        photos: input.photos ?? [],
      },
    });

    return {
      id: created.id,
      type: created.type,
      typeLabel,
      status: created.status,
      statusLabel: CUSTOM_RECIPE_AFTERSALE_STATUS_LABELS[created.status],
    };
  }

  /**
   * 顾客看自己的售后单（含进度）。
   *
   * 返回的是**能直接渲染的形态** —— 状态中文、处理进展、能不能撤回
   * 都由后端算好，与订单详情那边的渲染契约同一套思路。
   */
  async listForCustomer(orderIdOrId: string, customerId: string) {
    const order = await this.prisma.customRecipeOrder.findFirst({
      where: { OR: [{ orderId: orderIdOrId }, { id: orderIdOrId }] },
      select: { id: true, customerId: true },
    });
    if (!order) {
      throw new NotFoundException(`定制订单不存在: ${orderIdOrId}`);
    }
    if (order.customerId !== customerId) {
      throw new ForbiddenException('无权访问此订单');
    }

    const rows = await this.prisma.customRecipeAftersale.findMany({
      where: { orderId: order.id },
      orderBy: { createdAt: 'desc' },
    });

    const labels = await this.typeLabels();

    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      typeLabel: labels[row.type] ?? row.type,
      status: row.status,
      statusLabel: CUSTOM_RECIPE_AFTERSALE_STATUS_LABELS[row.status],
      description: row.description,
      photos: row.photos ?? [],
      createdAt: row.createdAt,
      resolvedAt: row.resolvedAt,
      /**
       * 处理结果对顾客可见的部分。
       *
       * `handleNote` 是客服写的**对外说明**，可以直接给顾客看；
       * 内部备注（如果有）不会走这个接口。
       */
      handleNote: row.handleNote ?? null,
      rejectReason: row.rejectReason ?? null,
      /** 能不能撤回 —— 后端算好，前端不判断 */
      canCancel: canCustomerCancelAftersale(row.status),
      /** 进度时间轴（与订单进度同一套渲染思路） */
      progress: describeAftersaleProgress({
        status: row.status,
        createdAt: row.createdAt,
        acceptedAt: row.acceptedAt,
        resolvedAt: row.resolvedAt,
      }),
    }));
  }

  /**
   * 顾客撤回售后。
   *
   * 只在"还没人受理"时允许 —— 客服已经在处理了还抽走，
   * 会让客服白忙一轮。
   */
  async cancel(input: {
    aftersaleId: string;
    customerId: string;
  }): Promise<{ cancelled: boolean }> {
    const row = await this.prisma.customRecipeAftersale.findUnique({
      where: { id: input.aftersaleId },
      include: { order: { select: { customerId: true } } },
    });

    if (!row) {
      throw new NotFoundException('售后单不存在');
    }
    if (row.order.customerId !== input.customerId) {
      throw new ForbiddenException('无权操作');
    }
    if (!canCustomerCancelAftersale(row.status)) {
      throw new BadRequestException(
        isAftersaleOpen(row.status)
          ? '我们已经在处理了，如需补充情况请联系客服'
          : '这条售后已经处理完，不需要撤回',
      );
    }

    await this.prisma.customRecipeAftersale.update({
      where: { id: row.id },
      data: {
        status: 'REJECTED',
        rejectReason: '顾客自行撤回',
        resolvedAt: new Date(),
      },
    });

    return { cancelled: true };
  }

  // ==================== 后台 ====================

  /**
   * 后台待办列表。
   *
   * 默认只列**未处理完**的（客服打开就要看到"还有几件事没做"），
   * 按紧急度排序 —— 排序规则在领域层（`aftersaleUrgency`），
   * 不是藏在 SQL 里：**等太久的排前面，同等的"调整食谱"比"问个问题"急**
   * （前者顾客的狗可能正在吃着不合适的饭）。
   */
  /**
   * 这单有没有**还没处理完**的售后（批次 5.5）。
   *
   * 用途：后台订单详情要据此决定显不显示「处理售后」按钮。
   * 此前后台是自己在页面里判断的，与顾客端一样会出现"两套口径"。
   *
   * 只回一个布尔值，不回列表 —— 调用方只需要知道"有没有"，
   * 让它自己去遍历列表既慢又容易写错（比如忘了过滤已完成的）。
   */
  async hasOpenForOrder(orderId: string): Promise<boolean> {
    const row = await this.prisma.customRecipeAftersale.findFirst({
      where: { orderId, status: { in: ['PENDING', 'ACCEPTED', 'PROCESSING'] } },
      select: { id: true },
    });
    return Boolean(row);
  }

  async listForStaff(input?: {
    status?: string | null;
    includeClosed?: boolean;
    limit?: number;
    now?: Date;
  }) {
    const now = input?.now ?? new Date();
    const where: Record<string, unknown> = {};

    if (input?.status) {
      where.status = input.status;
    } else if (!input?.includeClosed) {
      where.status = { in: ['PENDING', 'ACCEPTED', 'PROCESSING'] };
    }

    const rows = await this.prisma.customRecipeAftersale.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      take: input?.limit ?? 100,
      include: {
        order: {
          select: {
            orderId: true,
            customerId: true,
            status: true,
            dog: { select: { name: true } },
            customer: { select: { nickname: true, phone: true } },
          },
        },
      },
    });

    const labels = await this.typeLabels();

    return rows
      .map((row) => {
        const urgency = aftersaleUrgency({
          status: row.status,
          type: row.type,
          createdAt: row.createdAt,
          now,
        });
        return {
          id: row.id,
          orderId: row.order.orderId,
          dogName: row.order.dog?.name ?? '',
          customerName: row.order.customer?.nickname ?? '',
          customerPhone: row.order.customer?.phone ?? '',
          orderStatus: row.order.status,
          type: row.type,
          typeLabel: labels[row.type] ?? row.type,
          status: row.status,
          statusLabel: CUSTOM_RECIPE_AFTERSALE_STATUS_LABELS[row.status],
          description: row.description,
          photos: row.photos ?? [],
          createdAt: row.createdAt,
          acceptedAt: row.acceptedAt,
          resolvedAt: row.resolvedAt,
          /** 等了多久 —— 客服一眼看出哪条催得急 */
          hoursWaiting: urgency.hoursWaiting,
          /** 是不是"催得急"（后台标红）—— 阈值由后端定，前端不判断 */
          isUrgent: urgency.isUrgent,
          /** 后台能做什么（与顾客侧渲染契约同一套思路） */
          actions: this.staffActions(row.status),
        };
      })
      .sort((a, b) => {
        const ua = aftersaleUrgency({
          status: a.status as never,
          type: a.type,
          createdAt: a.createdAt,
          now,
        });
        const ub = aftersaleUrgency({
          status: b.status as never,
          type: b.type,
          createdAt: b.createdAt,
          now,
        });
        return ub.score - ua.score;
      });
  }

  /** 受理 */
  async accept(input: { aftersaleId: string; handlerId: string }) {
    const row = await this.mustFind(input.aftersaleId);
    this.assertTransition(row.status, 'ACCEPTED');

    await this.prisma.customRecipeAftersale.update({
      where: { id: row.id },
      data: {
        status: 'ACCEPTED',
        handlerId: input.handlerId,
        acceptedAt: new Date(),
      },
    });
    return { status: 'ACCEPTED' };
  }

  /** 开始处理 */
  async startProcessing(input: { aftersaleId: string; handlerId: string }) {
    const row = await this.mustFind(input.aftersaleId);
    this.assertTransition(row.status, 'PROCESSING');

    await this.prisma.customRecipeAftersale.update({
      where: { id: row.id },
      data: { status: 'PROCESSING', handlerId: input.handlerId },
    });
    return { status: 'PROCESSING' };
  }

  /**
   * 处理完成。
   *
   * `handleNote` 是**给顾客看的说明**，所以必填 ——
   * 顾客收到"已处理"却不知道处理了什么，等于没处理。
   */
  async resolve(input: {
    aftersaleId: string;
    handlerId: string;
    handleNote: string;
    /** 结果是"调整食谱"时，指向重新交付的那一版 */
    linkedDeliveryId?: string | null;
  }) {
    const note = (input.handleNote || '').trim();
    if (!note) {
      throw new BadRequestException(
        '请写一句给顾客的处理说明 —— 顾客看到"已处理"但不知道处理了什么，等于没处理',
      );
    }

    const row = await this.mustFind(input.aftersaleId);
    this.assertTransition(row.status, 'RESOLVED');

    await this.prisma.customRecipeAftersale.update({
      where: { id: row.id },
      data: {
        status: 'RESOLVED',
        handlerId: input.handlerId,
        handleNote: note,
        resolvedAt: new Date(),
        ...(input.linkedDeliveryId
          ? { linkedDeliveryId: input.linkedDeliveryId }
          : {}),
      },
    });

    /**
     * 站内消息（2026-10-18 · 需求 2.9「要发的消息：交付通知、售后处理完成通知」）。
     *
     * 消息只存"一句摘要 + 一个指针"，点进去现查 ——
     * 存副本的话，处理结果被改过之后旧消息会跟实际不一致。
     *
     * 发失败**不影响处理结果**：售后已经处理完了，通知是锦上添花。
     */
    const order = await this.prisma.customRecipeOrder.findUnique({
      where: { id: row.orderId },
      select: { customerId: true, orderId: true },
    });
    if (order) {
      await this.customerMessages
        ?.send({
          customerId: order.customerId,
          category: 'AFTERSALE',
          title: '你的售后已处理完成',
          body: note,
          linkType: 'AFTERSALE',
          // 指向订单：售后页是按订单查的
          linkId: order.orderId,
        })
        .catch(() => false);
    }

    return { status: 'RESOLVED' };
  }

  /** 驳回（原因必填，顾客要知道为什么） */
  async reject(input: {
    aftersaleId: string;
    handlerId: string;
    reason: string;
  }) {
    const reason = (input.reason || '').trim();
    if (!reason) {
      throw new BadRequestException('请写明不受理的原因，顾客需要知道为什么');
    }

    const row = await this.mustFind(input.aftersaleId);
    this.assertTransition(row.status, 'REJECTED');

    await this.prisma.customRecipeAftersale.update({
      where: { id: row.id },
      data: {
        status: 'REJECTED',
        handlerId: input.handlerId,
        rejectReason: reason,
        resolvedAt: new Date(),
      },
    });
    return { status: 'REJECTED' };
  }

  /** 后台在某个状态下能做什么（前端照着渲染） */
  private staffActions(status: string) {
    const actions: Array<{
      code: string;
      label: string;
      enabled: boolean;
      style?: string;
    }> = [];
    const canTo = (to: never) =>
      canTransitionAftersale(status as never, to) ||
      (ALLOWED_AFTERSALE_TRANSITIONS[
        status as keyof typeof ALLOWED_AFTERSALE_TRANSITIONS
      ] ?? []
      ).includes(to);

    if (canTo('ACCEPTED' as never)) {
      actions.push({ code: 'ACCEPT', label: '受理', enabled: true, style: 'primary' });
    }
    if (canTo('PROCESSING' as never)) {
      actions.push({ code: 'PROCESSING', label: '标记处理中', enabled: true });
    }
    if (canTo('RESOLVED' as never)) {
      actions.push({ code: 'RESOLVE', label: '处理完成', enabled: true, style: 'primary' });
    }
    if (canTo('REJECTED' as never)) {
      actions.push({ code: 'REJECT', label: '不受理', enabled: true, style: 'line' });
    }
    return actions;
  }

  private async mustFind(id: string) {
    const row = await this.prisma.customRecipeAftersale.findUnique({
      where: { id },
    });
    if (!row) throw new NotFoundException('售后单不存在');
    return row;
  }

  /** 流转校验，不合法就抛（与订单状态机同一套思路） */
  private assertTransition(from: string, to: string): void {
    if (
      (ALLOWED_AFTERSALE_TRANSITIONS[
        from as keyof typeof ALLOWED_AFTERSALE_TRANSITIONS
      ] ?? []
      ).includes(to as never)
    ) {
      return;
    }
    throw new BadRequestException(
      `售后单当前是「${CUSTOM_RECIPE_AFTERSALE_STATUS_LABELS[from as never] ?? from}」，` +
        `不能改成「${CUSTOM_RECIPE_AFTERSALE_STATUS_LABELS[to as never] ?? to}」`,
    );
  }

  // ==================== 内部 ====================

  /**
   * 售后配额（2026-10-18 · 需求 2.5.7 / 2.5.9）
   *
   * ## 为什么必须给顾客看
   *
   * 需求 2.5.7 写死了：「**必须先显示两个数字** —— 窗口还剩几天、
   * 免费修改还剩几次。**不让顾客猜自己还能不能提。**」
   *
   * ## 「按顾客提的次数算」而不是「按成功处理算」
   *
   * 2.5.3：次数「按顾客提了几次」算 —— 提了就算用掉，
   * 哪怕最后我们驳回了也一样（否则会被无限刷）。
   *
   * ## 撤回**不算**
   *
   * 2.5.9：「撤回算不算用掉 → **不算**」。
   * 撤回在数据里是把状态写成 `REJECTED` 且 `rejectReason = '顾客自行撤回'`，
   * 所以统计时要把它排除掉。
   */
  async getQuota(orderIdOrId: string, customerId: string): Promise<{
    windowDays: number;
    windowDaysLeft: number | null;
    freeRevisionCount: number;
    freeRevisionsLeft: number;
    usedCount: number;
    hasOpen: boolean;
    canSubmit: boolean;
    /** 不能提时说清楚为什么（顾客不用猜） */
    reason: string | null;
  }> {
    const order = await this.prisma.customRecipeOrder.findFirst({
      where: { OR: [{ orderId: orderIdOrId }, { id: orderIdOrId }] },
      select: {
        id: true,
        customerId: true,
        status: true,
        deliveredAt: true,
      },
    });
    if (!order) {
      throw new NotFoundException(`定制订单不存在: ${orderIdOrId}`);
    }
    if (order.customerId !== customerId) {
      throw new ForbiddenException('无权访问此订单');
    }

    const config = await this.configService.getConfig();
    const windowDays = await this.getWindowDays();
    const freeRevisionCount = Number.isInteger(Number(config.freeRevisionCount))
      ? Number(config.freeRevisionCount)
      : 2;

    const rows = await this.prisma.customRecipeAftersale.findMany({
      where: { orderId: order.id },
      select: { id: true, status: true, rejectReason: true, createdAt: true },
    });

    /** 撤回过的 (`rejectReason = '顾客自行撤回'`) 不计数 */
    const withdrawn = (row: { rejectReason: string | null }) =>
      (row.rejectReason || '').includes('撤回');
    const usedCount = rows.filter((row) => !withdrawn(row)).length;
    const freeRevisionsLeft = Math.max(0, freeRevisionCount - usedCount);

    const hasOpen = rows.some((row) =>
      ['PENDING', 'ACCEPTED', 'PROCESSING'].includes(row.status),
    );

    /** 窗口还剩几天（向上取整 —— "还剩 0 天"会让顾客以为今天就是最后期限） */
    let windowDaysLeft: number | null = null;
    if (order.deliveredAt && windowDays > 0) {
      const closesAt = new Date(
        order.deliveredAt.getTime() + windowDays * 24 * 60 * 60 * 1000,
      );
      const leftMs = closesAt.getTime() - Date.now();
      windowDaysLeft = leftMs <= 0 ? 0 : Math.ceil(leftMs / (24 * 60 * 60 * 1000));
    }

    /** 能不能提 + 为什么不能（**后端算，前端不判断**） */
    let reason: string | null = null;
    if (!order.deliveredAt) {
      reason = '这张订单还没有交付，暂时不能提售后';
    } else if (windowDaysLeft !== null && windowDaysLeft <= 0) {
      reason = `已超过售后受理期（交付后 ${windowDays} 天内），如需帮助请联系客服`;
    } else if (hasOpen) {
      reason = '你已经提交过售后，我们正在处理中';
    } else if (freeRevisionsLeft <= 0) {
      reason = `免费调整次数已用完（共 ${freeRevisionCount} 次），如需帮助请联系客服`;
    }

    return {
      windowDays,
      windowDaysLeft,
      freeRevisionCount,
      freeRevisionsLeft,
      usedCount,
      hasOpen,
      canSubmit: reason === null,
      reason,
    };
  }

  private async getWindowDays(): Promise<number> {
    try {
      const config = await this.configService.getConfig();
      const value = Number(config.aftersaleWindowDays);
      return Number.isInteger(value) && value >= 0 ? value : 7;
    } catch {
      return 7;
    }
  }

  /** 类型码 → 中文（来自选项字典，不在这里写第二份） */
  private async typeLabels(): Promise<Record<string, string>> {
    try {
      const items = await this.platformOptions.listSet(
        CUSTOM_RECIPE_AFTERSALE_TYPE_SET,
      );
      const map: Record<string, string> = {};
      for (const item of items) map[item.code] = item.label;
      return map;
    } catch {
      return {};
    }
  }

  private async resolveTypeLabel(code: string): Promise<string> {
    const labels = await this.typeLabels();
    return labels[code] ?? code;
  }
}
