import { Optional,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CustomRecipeStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma.service';
import { CustomRecipeConfigService } from './custom-recipe-config.service';
import { PlatformOptionsService } from '../platform-options/platform-options.service';
import { WechatService } from '../../infrastructure/wechat/wechat.service';
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

/** 每份交付各自的诉求说明（存 `CustomRecipeAftersale.recipeRequests`） */
export interface CustomRecipeAftersaleRecipeRequest {
  deliveryItemId: string;
  description: string;
  /** 这一份自己的附件（2026-10-25）；旧记录没有时为 [] */
  photos: string[];
}

/** 响应里"这次涉及哪几份"的统一形状（顾客端与后台共用） */
export interface CustomRecipeAftersaleSelectedItem {
  deliveryItemId: string;
  recipeId: string | null;
  recipeName: string | null;
}

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
 *
 * **四、多份订单按批次辨认真实交付（2026-10-21）。**
 * 整批交付只写批次表、不写老的单份交付表，所以这类售后 `deliveryId` 为空，
 * 改指向 `deliveryBatchId`；窗口也从批次交付时间起算。
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
    /** 订阅消息（需求 2.5.8）—— 同样是可选依赖，发不出去不影响处理结果 */
    @Optional()
    private readonly wechatService?: WechatService,
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
    /**
     * 多份订单可选：这次要调整哪几份（`CustomRecipeDeliveryItem.id`）。
     * 不传 = 整单售后（老行为）；传了就必须都属于最新批次，且不能为空数组。
     */
    deliveryItemIds?: string[] | null;
    /** 每份各自的诉求说明 `[{ deliveryItemId, description }]`（可选） */
    recipeRequests?: unknown;
    now?: Date;
  }): Promise<{
    id: string;
    type: string;
    typeLabel: string;
    status: string;
    statusLabel: string;
    deliveryBatchId: string | null;
    deliveryItemIds: string[];
    recipeRequests: CustomRecipeAftersaleRecipeRequest[];
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

    /**
     * 先解析"选了哪几份"，但真正的归属校验要等拿到批次明细之后 ——
     * 多份订单的交付在批次表里，不在老的单份交付表。
     */
    const {
      deliveryId,
      deliveryBatchId,
      deliveryItemIds,
      recipeRequests,
      deliveredAt,
    } = await this.resolveAftersaleTargets(order.id, input);

    /**
     * 窗口校验。超窗口**不允许新提**，但见下方：已提的照常处理到底。
     */
    const windowDays = await this.getWindowDays();
    if (windowDays > 0 && deliveredAt) {
      const closesAt = new Date(
        deliveredAt.getTime() + windowDays * 24 * 60 * 60 * 1000,
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
        type: 'ADJUST_RECIPE',
        status: { in: ['PENDING', 'ACCEPTED', 'PROCESSING'] },
      },
      select: { id: true },
    });
    if (open) {
      throw new BadRequestException(
        '你已经提交过一次调整，我们正在处理中。有新情况可以直接在客服里补充',
      );
    }

    const trimmed = (input.description || '').trim();
    if (!trimmed) {
      throw new BadRequestException('请说一下遇到的具体情况');
    }

    const typeLabel = await this.resolveTypeLabel(input.type);

    /**
     * 顶层 photos 存所有份的并集：老页面/后台列表仍按整单附件看，
     * 每份的精确归属在 `recipeRequests[].photos` 里。
     */
    const allPhotos = Array.from(
      new Set([
        ...(input.photos ?? []),
        ...recipeRequests.flatMap((request) => request.photos),
      ]),
    );

    const created = await this.prisma.customRecipeAftersale
      .create({
        data: {
        orderId: order.id,
        deliveryId,
        deliveryBatchId,
        deliveryItemIds,
        /** 没有逐份说明时不写这一列（保持 NULL = 老口径只有一句共用说明） */
        ...(recipeRequests.length > 0
          ? {
              recipeRequests:
                recipeRequests as unknown as Prisma.InputJsonValue,
            }
          : {}),
          type: input.type,
          description: trimmed,
          photos: allPhotos,
        },
      })
      .catch((error: any) => {
        if (error?.code === 'P2002') {
          throw new ConflictException(
            '你已经提交过一次调整，我们正在处理中。有新情况可以直接在客服里补充',
          );
        }
        throw error;
      });

    return {
      id: created.id,
      type: created.type,
      typeLabel,
      status: created.status,
      statusLabel: CUSTOM_RECIPE_AFTERSALE_STATUS_LABELS[created.status],
      /** 多份订单：这次售后针对哪一批 / 哪几份（老订单均为空） */
      deliveryBatchId: created.deliveryBatchId ?? null,
      deliveryItemIds: created.deliveryItemIds ?? [],
      recipeRequests,
    };
  }

  /**
   * 员工代客发起调整（2026-10-27）。
   *
   * ## 它补的是哪条路
   *
   * 此前「已交付 → 改稿 → 重交」这条链只挂在**顾客提交的售后单**上：
   * 顾客不满意但不会/不方便在小程序提单时，老板改好了也没有入口交回去。
   *
   * 这里允许员工替顾客开一张调整单，**直接进入 ACCEPTED**（处理人 = 发起人），
   * 后面的链路一个字都不改：售后页「修改食谱」→ 设计器改稿 → 加入本单待提交
   * → 售后页「重新交付并完成」。
   *
   * ## 三条与顾客提交不同的口径
   *
   * · **不占顾客免费次数**（商家主动改稿不该消耗顾客权益）；
   * · **不受售后窗口限制**（已自动完成的单也能改）；
   * · **创建即受理**，不占用「待受理」待办位。
   *
   * 其余规则与顾客提交完全一致：一次只能有一条进行中的调整、必须说明改什么。
   */
  async createByStaff(input: {
    orderIdOrId: string;
    operatorId: string;
    /** 给顾客看的调整说明（顾客端会显示成「调整总结」的正文） */
    description: string;
    /** 要调整哪几份；不传 = 最新批次里的全部份（单份订单即唯一那份） */
    deliveryItemIds?: string[] | null;
    now?: Date;
  }): Promise<{
    id: string;
    status: string;
    statusLabel: string;
    source: string;
    deliveryBatchId: string | null;
    deliveryItemIds: string[];
  }> {
    const now = input.now ?? new Date();

    const order = await this.prisma.customRecipeOrder.findFirst({
      where: {
        OR: [{ orderId: input.orderIdOrId }, { id: input.orderIdOrId }],
      },
      select: { id: true, orderId: true, status: true, deliveredAt: true },
    });
    if (!order) {
      throw new NotFoundException(`定制订单不存在: ${input.orderIdOrId}`);
    }
    if (order.status === CustomRecipeStatus.CANCELLED) {
      throw new BadRequestException('订单已取消，不能发起调整');
    }
    if (
      order.status !== CustomRecipeStatus.DELIVERED &&
      order.status !== CustomRecipeStatus.COMPLETED
    ) {
      throw new BadRequestException(
        '只有已经交付的订单才能代客发起调整；未交付的订单直接在设计器里改即可',
      );
    }

    const trimmed = (input.description || '').trim();
    if (!trimmed) {
      throw new BadRequestException(
        '请写一句这次要调整什么 —— 顾客会看到这句话',
      );
    }

    /**
     * 一次只能有一条进行中的调整：顾客已经提过一条时，员工应当直接处理那一条，
     * 再开一条只会让售后列表出现两条一模一样的待办。
     */
    const open = await this.prisma.customRecipeAftersale.findFirst({
      where: {
        orderId: order.id,
        type: 'ADJUST_RECIPE',
        status: { in: ['PENDING', 'ACCEPTED', 'PROCESSING'] },
      },
      select: { id: true },
    });
    if (open) {
      throw new BadRequestException(
        '这张订单已经有一条进行中的调整，请在售后列表里打开那条继续处理',
      );
    }

    const { deliveryId, deliveryBatchId, deliveryItemIds, recipeRequests } =
      await this.resolveAftersaleTargets(order.id, {
        deliveryItemIds: input.deliveryItemIds,
        recipeRequests: null,
      });

    /**
     * 多份订单没指定份数时，「整单」= 最新批次里的**全部份**。
     *
     * 顾客那条老口径里空数组表示「整单售后」，但改稿必须落到具体某一份
     * （`reopen-design` 要按 deliveryItemId 找交付明细）。所以这里补一次解析，
     * 否则员工发起的调整单会是一条「没有关联可修改食谱」的死单。
     */
    let targetItemIds = deliveryItemIds;
    if (targetItemIds.length === 0 && deliveryBatchId) {
      const batch = await this.prisma.customRecipeDeliveryBatch.findUnique({
        where: { id: deliveryBatchId },
        select: { items: { select: { id: true }, orderBy: { id: 'asc' } } },
      });
      targetItemIds = (batch?.items ?? []).map((item) => item.id);
    }

    /**
     * 先确认这份交付后面**确实有一份可回改的设计草稿**，再落库。
     *
     * 走「订单设计」新流程的订单才有槽位；老订单没有，只能回订单页用
     * 「重新交付」换食谱 —— 那种单如果在这里建了调整单，紧接着的
     * 「修改食谱」必然报错，售后列表就多一条永远处理不完的记录。
     */
    const targetRecipeId = await this.resolveDeliveredRecipeId({
      deliveryItemId: targetItemIds[0] ?? null,
      deliveryId,
    });
    const slotCount = targetRecipeId
      ? await this.prisma.orderRecipeDesign.count({
          where: { orderId: order.id, recipeId: targetRecipeId },
        })
      : 0;
    if (slotCount === 0) {
      throw new BadRequestException(
        '这张订单是「订单设计」之前下的单，没有可回改的设计草稿；请在订单页用「重新交付」换一份食谱',
      );
    }

    const created = await this.prisma.customRecipeAftersale.create({
      data: {
        orderId: order.id,
        deliveryId,
        deliveryBatchId,
        deliveryItemIds: targetItemIds,
        ...(recipeRequests.length > 0
          ? {
              recipeRequests:
                recipeRequests as unknown as Prisma.InputJsonValue,
            }
          : {}),
        type: 'ADJUST_RECIPE',
        source: 'STAFF',
        status: 'ACCEPTED',
        description: trimmed,
        photos: [],
        handlerId: input.operatorId,
        acceptedAt: now,
      },
    });

    return {
      id: created.id,
      status: created.status,
      statusLabel: CUSTOM_RECIPE_AFTERSALE_STATUS_LABELS[created.status],
      source: created.source,
      deliveryBatchId: created.deliveryBatchId ?? null,
      deliveryItemIds: created.deliveryItemIds ?? [],
    };
  }

  /**
   * 解析「这次售后针对哪一次交付、哪几份」。
   *
   * 顾客提交与员工代客发起**共用同一套判定**：多份订单看最新批次，
   * 老订单看当前有效的那一次单份交付。抽出来是为了不出现
   * 「顾客能选份、员工只能整单」这种两套口径。
   */
  private async resolveAftersaleTargets(
    orderId: string,
    input: { deliveryItemIds?: string[] | null; recipeRequests?: unknown },
  ): Promise<{
    deliveryId: string | null;
    deliveryBatchId: string | null;
    deliveryItemIds: string[];
    recipeRequests: CustomRecipeAftersaleRecipeRequest[];
    deliveredAt: Date | null;
  }> {
    const selection = this.parseDeliveryItemIds(input.deliveryItemIds);
    const requestShape = this.parseRecipeRequestsShape(input.recipeRequests);

    /**
     * 多份订单：最新批次就是这次售后针对的交付。
     *
     * 窗口从 `batch.deliveredAt` 起算（与顾客看到的"交付时间"同一个值）；
     * 老订单没有批次，仍走下面的单份交付路径，响应与以前完全一致。
     */
    const latestBatch = await this.prisma.customRecipeDeliveryBatch.findFirst({
      where: { orderId },
      orderBy: { version: 'desc' },
      select: {
        id: true,
        deliveredAt: true,
        items: { select: { id: true } },
      },
    });

    let deliveryId: string | null = null;
    let deliveryBatchId: string | null = null;
    let deliveryItemIds: string[] = [];
    const recipeRequests: CustomRecipeAftersaleRecipeRequest[] = [];
    let deliveredAt: Date | null = null;

    if (latestBatch) {
      deliveryBatchId = latestBatch.id;
      deliveredAt = latestBatch.deliveredAt;

      const batchItemIds = new Set(
        (latestBatch.items ?? []).map((item) => item.id),
      );

      /**
       * 选了就必须是**这一批里的**。传空数组视为"一份都没选" ——
       * 那等于表单没填完，不能落库成一条什么都不知道的售后，
       * 所以显式报错，而不是悄悄当成整单。
       */
      if (selection.provided && selection.ids.length === 0) {
        throw new BadRequestException('请至少选择一份要调整的食谱');
      }
      if (selection.ids.some((id) => !batchItemIds.has(id))) {
        throw new BadRequestException(
          '选中的食谱不在本次交付里，请刷新页面后重新选择',
        );
      }

      const selectedSet = new Set(selection.ids);
      for (const raw of requestShape) {
        const itemId = String(raw.deliveryItemId ?? '').trim();
        const requestDescription = String(raw.description ?? '').trim();

        if (!itemId) {
          throw new BadRequestException('每条调整说明要指明针对哪一份食谱');
        }
        if (!requestDescription) {
          throw new BadRequestException('请为选中的每一份食谱说明要调整什么');
        }
        if (!batchItemIds.has(itemId)) {
          throw new BadRequestException(
            '诉求对应的食谱不在本次交付里，请刷新页面后重新选择',
          );
        }
        /** 有"涉及食谱"选择器时，逐份说明不能跑到选择范围之外 */
        if (selection.provided && !selectedSet.has(itemId)) {
          throw new BadRequestException(
            '诉求对应的食谱不在本次选中的范围内，请重新勾选',
          );
        }

        const rawPhotos = Array.isArray(raw.photos) ? raw.photos : [];
        const requestPhotos = rawPhotos
          .map((photo) => String(photo ?? '').trim())
          .filter((photo): photo is string => photo.length > 0);

        recipeRequests.push({
          deliveryItemId: itemId,
          description: requestDescription,
          photos: requestPhotos,
        });
      }

      /**
       * 只传了逐份说明、没传"涉及食谱"时，说明里提到的那几份就是选中范围。
       * 两个都没传 → 整单售后，`deliveryItemIds` 留空（老行为）。
       */
      deliveryItemIds = selection.provided
        ? selection.ids
        : Array.from(
            new Set(recipeRequests.map((item) => item.deliveryItemId)),
          );
    } else {
      /**
       * 老的单份交付路径**一个字都不改**：没批次时行为与以前一致。
       * 只额外挡住"给单份订单指定了批次明细"这种明显用错的调用，
       * 避免静默丢掉顾客的选择。
       */
      if (selection.ids.length > 0 || requestShape.length > 0) {
        throw new BadRequestException(
          '这张订单不是多份交付，不能指定具体食谱',
        );
      }

      const currentDelivery = await this.prisma.customRecipeDelivery.findFirst({
        where: { orderId, replacedByDeliveryId: null },
        orderBy: { version: 'desc' },
        select: { id: true, deliveredAt: true },
      });

      if (!currentDelivery) {
        throw new BadRequestException('这张订单还没有交付，暂时不能提售后');
      }

      deliveryId = currentDelivery.id;
      deliveredAt = currentDelivery.deliveredAt;
    }

    return {
      deliveryId,
      deliveryBatchId,
      deliveryItemIds,
      recipeRequests,
      deliveredAt,
    };
  }

  /**
   * 这次调整要落到哪一份**食谱**上（用来确认后面有可回改的设计草稿）。
   *
   * 批次交付看交付明细，老订单看单份交付记录 —— 两条路的落点不同。
   */
  private async resolveDeliveredRecipeId(input: {
    deliveryItemId: string | null;
    deliveryId: string | null;
  }): Promise<string | null> {
    if (input.deliveryItemId) {
      const item = await this.prisma.customRecipeDeliveryItem.findUnique({
        where: { id: input.deliveryItemId },
        select: { recipeId: true },
      });
      return item?.recipeId ?? null;
    }
    if (input.deliveryId) {
      const delivery = await this.prisma.customRecipeDelivery.findUnique({
        where: { id: input.deliveryId },
        select: { recipeId: true },
      });
      return delivery?.recipeId ?? null;
    }
    return null;
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
      /**
       * 只返回“调整”类：这一页只做食谱调整。
       * 历史的问题/其他意见/退款单不混进调整记录，避免顾客以为它们也是调整。
       */
      where: { orderId: order.id, type: 'ADJUST_RECIPE' },
      orderBy: { createdAt: 'desc' },
    });

    const labels = await this.typeLabels();
    /** 这次售后涉及哪几份（多份订单才有；老订单为空数组） */
    const itemMap = await this.resolveSelectedItems(rows);

    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      typeLabel: labels[row.type] ?? row.type,
      /**
       * 谁发起的（2026-10-27）。顾客端据此把「商家主动帮你调整」和
       * 「你自己提的」区分开；顾客手工提单时的文案一个字都不用改。
       */
      source: row.source ?? 'CUSTOMER',
      sourceLabel: row.source === 'STAFF' ? '商家发起' : '顾客发起',
      status: row.status,
      statusLabel: CUSTOM_RECIPE_AFTERSALE_STATUS_LABELS[row.status],
      /** 顾客端状态：撤回显示“已撤销”，完成显示“已交付”，不直接复用后台的“已解决/未受理” */
      customerStatusLabel: this.customerStatusLabel(row),
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
      /**
       * 多份售后：针对哪一批、选了哪几份、每份说了什么（2026-10-21）。
       * 老订单这几项为空，字段仍然存在，前端不用分支判空对象。
       */
      ...this.describeSelection(row, itemMap),
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
        delivery: { select: { id: true, recipeId: true } },
      },
    });

    const labels = await this.typeLabels();
    const itemMap = await this.resolveSelectedItems(rows);

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
          /** 顾客提交 / 商家代客发起（2026-10-27）—— 后台列表要能一眼分开 */
          source: row.source ?? 'CUSTOMER',
          sourceLabel: row.source === 'STAFF' ? '商家发起' : '顾客发起',
          status: row.status,
          statusLabel: CUSTOM_RECIPE_AFTERSALE_STATUS_LABELS[row.status],
          description: row.description,
          photos: row.photos ?? [],
          deliveryId: row.deliveryId ?? null,
          deliveryRecipeId: row.delivery?.recipeId ?? null,
          createdAt: row.createdAt,
          acceptedAt: row.acceptedAt,
          resolvedAt: row.resolvedAt,
          /** 等了多久 —— 客服一眼看出哪条催得急 */
          hoursWaiting: urgency.hoursWaiting,
          /** 是不是"催得急"（后台标红）—— 阈值由后端定，前端不判断 */
          isUrgent: urgency.isUrgent,
          /**
           * 涉及哪几份食谱（2026-10-21 多份售后）。
           *
           * 后台必须一眼看出「这次要改的是鸡肉南瓜还是鸭肉西兰花」——
           * 只给明细 id 等于让客服自己去库里翻。老订单为空数组。
           */
          ...this.describeSelection(row, itemMap),
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
      select: { customerId: true, orderId: true, customer: { select: { wechatOpenid: true } } },
    });
    /**
     * 订阅消息（需求 2.5.8：**订阅消息 + 站内消息**，两个渠道都要）。
     *
     * 微信是一次性订阅 —— 顾客在**提交售后**那一刻申请过，
     * 正好接住这一条。他没申请过就发不出去，这时站内消息是唯一通道
     * （这正是消息中心值得做的原因）。
     *
     * 发失败不影响处理结果。
     */
    if (order?.customer?.wechatOpenid) {
      await this.wechatService
        ?.sendCustomRecipeOrderNotification(
          order.customer.wechatOpenid,
          order.orderId,
          'AFTERSALE_RESOLVED',
        )
        .catch(() => undefined);
    }

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
      /**
       * 只统计“调整”类：
       * - 旧的问题/其他意见/退款单不占调整次数，也不挡住调整提交；
       * - 顾客撤回、商家驳回（都是 REJECTED）都不算一次，没有实际调整。
       */
      where: { orderId: order.id, type: 'ADJUST_RECIPE' },
      select: {
        id: true,
        status: true,
        rejectReason: true,
        createdAt: true,
        source: true,
      },
    });

    /**
     * 只数**顾客自己提的**（2026-10-27）：
     * 员工代客发起是商家行为，不能扣顾客的免费次数；
     * 但它仍然算「有进行中的调整」，不能再提一条（否则后台两条一模一样的待办）。
     */
    const usedCount = rows.filter(
      (row) => row.source !== 'STAFF' && row.status !== 'REJECTED',
    ).length;
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
      reason = '你已经提交过一次调整，我们正在处理中';
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

  /**
   * 解析"涉及食谱"入参。
   *
   * `provided` 与 `ids` 分开：调用方要区分「没传」和「传了空数组」——
   * 没传 = 整单售后（老行为），传了空 = 表单没填完，应当报错。
   */
  private parseDeliveryItemIds(value: unknown): {
    provided: boolean;
    ids: string[];
  } {
    if (value === undefined || value === null) {
      return { provided: false, ids: [] };
    }
    if (!Array.isArray(value)) {
      throw new BadRequestException('deliveryItemIds 必须是数组');
    }
    const ids = Array.from(
      new Set(
        value
          .map((item) => String(item ?? '').trim())
          .filter((item): item is string => item.length > 0),
      ),
    );
    return { provided: true, ids };
  }

  /**
   * 解析逐份说明的**形状**（是不是数组、每项是不是对象）。
   * 内容校验（非空说明、属于本次交付）要拿到批次明细后再做。
   */
  private parseRecipeRequestsShape(value: unknown): Array<{
    deliveryItemId: unknown;
    description: unknown;
    photos: unknown;
  }> {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) {
      throw new BadRequestException('recipeRequests 必须是数组');
    }
    return value.map((entry) => {
      if (!entry || typeof entry !== 'object') {
        throw new BadRequestException('每条调整说明的格式不正确');
      }
      const record = entry as Record<string, unknown>;
      return {
        deliveryItemId: record.deliveryItemId,
        description: record.description,
        photos: record.photos,
      };
    });
  }

  /** 读出库里存的逐份说明（历史数据可能是 null / 脏数据，读时兜底） */
  private readRecipeRequests(
    value: unknown,
  ): CustomRecipeAftersaleRecipeRequest[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((entry) => {
      if (!entry || typeof entry !== 'object') return [];
      const record = entry as Record<string, unknown>;
      const deliveryItemId = String(record.deliveryItemId ?? '').trim();
      const description = String(record.description ?? '').trim();
      if (!deliveryItemId || !description) return [];
      const photos = Array.isArray(record.photos)
        ? record.photos
            .map((photo) => String(photo ?? '').trim())
            .filter((photo): photo is string => photo.length > 0)
        : [];
      return [{ deliveryItemId, description, photos }];
    });
  }

  /**
   * 把售后单里存的批次明细 id 翻成**能显示的名字**（顾客端 / 后台共用）。
   *
   * 只查一次：一批售后可能选了多份，逐条查会把列表页拖成 N+1。
   * 已删除的交付明细在结果里自然缺失，调用方用 `deliveryItemIds` 仍能看到原选择。
   */
  private async resolveSelectedItems(
    rows: Array<{ deliveryItemIds?: string[] | null }>,
  ): Promise<Map<string, CustomRecipeAftersaleSelectedItem>> {
    const ids = Array.from(
      new Set(
        rows.flatMap((row) =>
          Array.isArray(row.deliveryItemIds) ? row.deliveryItemIds : [],
        ),
      ),
    ).filter((id): id is string => Boolean(id));

    const map = new Map<string, CustomRecipeAftersaleSelectedItem>();
    if (ids.length === 0) return map;

    const items = await this.prisma.customRecipeDeliveryItem.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        recipe: { select: { recipeId: true, name: true } },
      },
    });

    for (const item of items) {
      map.set(item.id, {
        deliveryItemId: item.id,
        recipeId: item.recipe?.recipeId ?? null,
        recipeName: item.recipe?.name ?? null,
      });
    }
    return map;
  }

  /** 一条售后单对外的"涉及哪几份"字段（顾客端与后台同一套） */
  private describeSelection(
    row: {
      deliveryBatchId?: string | null;
      deliveryItemIds?: string[] | null;
      recipeRequests?: unknown;
    },
    itemMap: Map<string, CustomRecipeAftersaleSelectedItem>,
  ): {
    deliveryBatchId: string | null;
    deliveryItemIds: string[];
    items: CustomRecipeAftersaleSelectedItem[];
    recipeRequests: CustomRecipeAftersaleRecipeRequest[];
  } {
    const deliveryItemIds = Array.isArray(row.deliveryItemIds)
      ? row.deliveryItemIds
      : [];
    return {
      deliveryBatchId: row.deliveryBatchId ?? null,
      deliveryItemIds,
      items: deliveryItemIds
        .map((id) => itemMap.get(id))
        .filter((item): item is CustomRecipeAftersaleSelectedItem =>
          Boolean(item),
        ),
      recipeRequests: this.readRecipeRequests(row.recipeRequests),
    };
  }

  /**
   * 顾客端状态中文。
   *
   * 后台的 `statusLabel` 把 `REJECTED` 统一翻成“未受理”，
   * 但顾客自己撤回也走 REJECTED —— 顾客看到的应当是“已撤销”。
   * RESOLVED 在这页显示“已交付”，与“调整完成”语义一致。
   */
  private customerStatusLabel(row: {
    status: string;
    rejectReason?: string | null;
  }): string {
    if (row.status === 'RESOLVED') return '已交付';
    if (row.status === 'REJECTED') {
      return (row.rejectReason || '').includes('撤回') ? '已撤销' : '未受理';
    }
    return (
      CUSTOM_RECIPE_AFTERSALE_STATUS_LABELS[
        row.status as keyof typeof CUSTOM_RECIPE_AFTERSALE_STATUS_LABELS
      ] ?? row.status
    );
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
