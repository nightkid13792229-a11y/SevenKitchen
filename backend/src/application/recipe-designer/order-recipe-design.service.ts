/**
 * 订单绑定食谱设计 · 订单设计工作台（2026-10-22 · Task 3）。
 *
 * 职责：
 *  · 解析订单上下文（对外单号 → 定制单主键），锁定订单与狗狗；
 *  · 一个槽位 = 一个订单绑定 `RecipeSeries` + 一个 `DesignRecipe` 草稿；
 *  · 从模板复制（复用 RecipeDesignerService 的复制逻辑，不重复映射原料）；
 *  · 「加入待提交」把草稿发布成私密定制食谱，但**不挂订单、不交付、不发通知**；
 *  · 移除未交付的槽位并清理系列 / 草稿 / 暂存食谱。
 *
 * 容量与状态口径（设计文档 §5.5 / §6.3）：
 *  · `PAID` / `IN_PROGRESS` 才允许设计；
 *  · 待提交槽位（EDITING + READY）不超过本单份数；
 *  · 已就绪（READY）份数不能超过本单份数；
 *  · 最终批量交付由 Task 4 负责，本服务绝不调用订单页的交付逻辑。
 */
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CustomRecipeStatus,
  OrderRecipeDesignStatus,
} from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma.service';
import { CustomRecipeService } from '../custom-recipe/custom-recipe.service';
import { OrderRecipeTemplateService } from './order-recipe-template.service';
import { RecipeDesignerService } from './recipe-designer.service';

/** 工作台里的一个待提交槽位。 */
export interface OrderDesignWorkspaceSlot {
  /** `order_recipe_design.id` */
  designId: string;
  seriesId: string;
  draftId: string;
  name: string;
  status: OrderRecipeDesignStatus;
  /** 加入待提交后生成的私密食谱 `recipe.id`（未就绪为 null） */
  recipeId: string | null;
  sourceRecipeId: string | null;
  stageWarning: string | null;
  updatedAt: Date;
}

export interface OrderDesignWorkspace {
  /** 对外订单号（不是 uuid） */
  orderId: string;
  dogId: string;
  dogName: string;
  /** 本单份数（`recipe_quantity`） */
  quantity: number;
  /** 已就绪份数（status = READY） */
  readyCount: number;
  slots: OrderDesignWorkspaceSlot[];
}

export interface CreateOrderDesignFromTemplateInput {
  /** 模板食谱版本行主键 `recipe.id` */
  sourceRecipeId: string;
  /** 可选自定义名称；不填则用「{狗名}定制 · {模板名}」 */
  name?: string;
}

export interface CreateOrderDesignResult {
  seriesId: string;
  draftId: string;
  stageWarning: string | null;
}

export interface StageOrderDesignResult {
  status: 'READY';
  /** 私密食谱 `recipe.id`（与 `order_recipe_design.recipe_id` 一致） */
  recipeId: string;
  readyCount: number;
}

interface OrderDesignContext {
  id: string;
  orderId: string;
  customerId: string;
  dogId: string;
  status: CustomRecipeStatus;
  recipeQuantity: number;
  dog: { id: string; name: string } | null;
}

const DESIGNABLE_ORDER_STATUSES = new Set<CustomRecipeStatus>([
  CustomRecipeStatus.PAID,
  CustomRecipeStatus.IN_PROGRESS,
]);

@Injectable()
export class OrderRecipeDesignService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customRecipeService: CustomRecipeService,
    private readonly recipeDesignerService: RecipeDesignerService,
    private readonly orderRecipeTemplateService: OrderRecipeTemplateService,
  ) {}

  /**
   * 订单设计工作台：订单 / 狗狗 / 份数 / 已就绪份数 + 全部槽位。
   *
   * 只读接口不限制订单状态（已交付订单仍可回看工作台），
   * 写操作统一走 `assertOrderAllowsDesign`。
   */
  async getWorkspace(orderId: string): Promise<OrderDesignWorkspace> {
    const order = await this.resolveOrder(orderId);
    const slots = await this.prisma.orderRecipeDesign.findMany({
      where: {
        orderId: order.id,
        status: { not: OrderRecipeDesignStatus.REMOVED },
      },
      include: {
        series: { select: { name: true } },
        designDraft: { select: { name: true, updatedAt: true } },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    return {
      orderId: order.orderId,
      dogId: order.dogId,
      dogName: order.dog?.name ?? '',
      quantity: order.recipeQuantity,
      readyCount: slots.filter(
        (slot) => slot.status === OrderRecipeDesignStatus.READY,
      ).length,
      slots: slots.map((slot) => ({
        designId: slot.id,
        seriesId: slot.seriesId,
        draftId: slot.designDraftId,
        name:
          slot.designDraft?.name?.trim() || slot.series?.name?.trim() || '',
        status: slot.status,
        recipeId: slot.recipeId,
        sourceRecipeId: slot.sourceRecipeId,
        stageWarning: slot.stageWarning,
        updatedAt: slot.designDraft?.updatedAt ?? slot.updatedAt,
      })),
    };
  }

  /**
   * 从已有食谱模板创建一个订单绑定草稿。
   *
   * 模板必须是 PUBLIC / PRIVATE_CUSTOM；原食谱不做任何修改。
   * 阶段不一致只把提示写进槽位（`stageWarning`），绝不阻断创建。
   */
  async createFromTemplate(
    orderId: string,
    input: CreateOrderDesignFromTemplateInput,
    operatorId: string,
  ): Promise<CreateOrderDesignResult> {
    const order = await this.resolveOrder(orderId);
    this.assertOrderAllowsDesign(order);
    const sourceRecipeId = input.sourceRecipeId?.trim();
    if (!sourceRecipeId) {
      throw new BadRequestException('请选择模板食谱');
    }

    await this.assertSlotCapacity(order);

    const comparison =
      await this.orderRecipeTemplateService.compareOrderTemplateStage(
        order.orderId,
        sourceRecipeId,
      );

    const created =
      await this.recipeDesignerService.createOrderBoundSeriesDesign({
        customOrderId: order.id,
        dogId: order.dogId,
        dogName: order.dog?.name ?? '',
        orderQuantity: order.recipeQuantity,
        createdBy: operatorId,
        name: input.name,
        sourceRecipeId,
        defaultLifeStage: comparison.dogStage,
      });

    try {
      await this.prisma.orderRecipeDesign.create({
        data: {
          orderId: order.id,
          dogId: order.dogId,
          seriesId: created.seriesId,
          designDraftId: created.draftId,
          sourceRecipeId: created.sourceRecipeId,
          sourceRecipeVersion: created.sourceRecipeVersion,
          sourceKind: created.sourceKind,
          status: OrderRecipeDesignStatus.EDITING,
          stageWarning: comparison.warning,
          createdBy: operatorId,
        },
      });
    } catch (error) {
      // 槽位没写成功就不要留下孤儿系列/草稿。
      await this.recipeDesignerService
        .deleteOrderBoundSeriesDesign(created.seriesId, created.draftId)
        .catch(() => undefined);
      if (String((error as any)?.message || '').includes('订单份数已满')) {
        throw new BadRequestException(
          `本单最多设计 ${order.recipeQuantity} 份，当前已经达到上限`,
        );
      }
      throw error;
    }

    return {
      seriesId: created.seriesId,
      draftId: created.draftId,
      stageWarning: comparison.warning,
    };
  }

  /** 创建空白订单绑定草稿（同一订单可有多份独立草稿）。 */
  async createBlank(
    orderId: string,
    operatorId: string,
  ): Promise<{ seriesId: string; draftId: string }> {
    const order = await this.resolveOrder(orderId);
    this.assertOrderAllowsDesign(order);
    await this.assertSlotCapacity(order);

    // 空白草稿默认用订单狗狗的当前阶段；阶段只是初始场景，可在编辑器里改。
    const dogStage = await this.orderRecipeTemplateService
      .compareStage(null, order.dogId)
      .then((comparison) => comparison.dogStage);

    const created =
      await this.recipeDesignerService.createOrderBoundSeriesDesign({
        customOrderId: order.id,
        dogId: order.dogId,
        dogName: order.dog?.name ?? '',
        orderQuantity: order.recipeQuantity,
        createdBy: operatorId,
        defaultLifeStage: dogStage,
      });

    try {
      await this.prisma.orderRecipeDesign.create({
        data: {
          orderId: order.id,
          dogId: order.dogId,
          seriesId: created.seriesId,
          designDraftId: created.draftId,
          status: OrderRecipeDesignStatus.EDITING,
          createdBy: operatorId,
        },
      });
    } catch (error) {
      await this.recipeDesignerService
        .deleteOrderBoundSeriesDesign(created.seriesId, created.draftId)
        .catch(() => undefined);
      if (String((error as any)?.message || '').includes('订单份数已满')) {
        throw new BadRequestException(
          `本单最多设计 ${order.recipeQuantity} 份，当前已经达到上限`,
        );
      }
      throw error;
    }

    return { seriesId: created.seriesId, draftId: created.draftId };
  }

  /**
   * 加入本单待提交仓库：
   *  · 生成/更新该草稿对应的私密定制食谱（不挂 customOrderId）；
   *  · 槽位转 READY，订单保持 IN_PROGRESS；
   *  · 不交付、不发通知。
   *
   * 幂等：槽位已经是 READY 且草稿此后没有修改时，直接返回原结果，
   * 不重复生成版本、不重复发任何通知。
   */
  /**
   * 售后改稿：重新打开已交付订单里的某一份设计。
   *
   * 只把对应 OrderRecipeDesign 从 DELIVERED 改回 EDITING；
   * 设计草稿 / 私密食谱保持原记录，重新入仓时沿用同一份草稿，
   * 私密食谱版本会递增，交付明细仍指向同一 recipe 行。
   */
  async reopenForAftersale(input: {
    aftersaleId: string;
    deliveryItemId?: string | null;
    operatorId: string;
  }): Promise<{
    orderId: string;
    orderUuid: string;
    designId: string;
    seriesId: string;
    draftId: string;
    deliveryItemId: string | null;
    recipeId: string;
  }> {
    const aftersale = await this.prisma.customRecipeAftersale.findUnique({
      where: { id: input.aftersaleId },
      include: {
        order: {
          select: {
            id: true,
            orderId: true,
            status: true,
          },
        },
      },
    });
    if (!aftersale) {
      throw new NotFoundException('售后单不存在');
    }
    if (!['ACCEPTED', 'PROCESSING'].includes(aftersale.status)) {
      throw new BadRequestException('请先受理售后，再修改食谱');
    }

    let deliveryItemIds = Array.isArray(aftersale.deliveryItemIds)
      ? aftersale.deliveryItemIds
      : [];
    let selectedDeliveryItemId = String(
      input.deliveryItemId ?? deliveryItemIds[0] ?? '',
    ).trim();

    /**
     * 售后提交后可能又发生过一次重新交付，旧明细 id 已不在最新批次。
     * 打开改稿时按 recipe 行映射到最新批次 id，避免后续重交时报
     * “选中的食谱不在本次交付里”。
     */
    if (deliveryItemIds.length > 0) {
      const [oldItems, latestBatch] = await Promise.all([
        this.prisma.customRecipeDeliveryItem.findMany({
          where: { id: { in: deliveryItemIds } },
          select: { id: true, recipeId: true },
        }),
        this.prisma.customRecipeDeliveryBatch.findFirst({
          where: { orderId: aftersale.order.id },
          orderBy: { version: 'desc' },
          select: {
            items: { select: { id: true, recipeId: true } },
          },
        }),
      ]);
      const oldById = new Map(oldItems.map((item) => [item.id, item]));
      const latestByRecipeId = new Map(
        (latestBatch?.items ?? []).map((item) => [item.recipeId, item.id]),
      );
      const mappedIds = deliveryItemIds.map((id) => {
        const recipeId = oldById.get(id)?.recipeId;
        return recipeId ? (latestByRecipeId.get(recipeId) ?? id) : id;
      });
      if (mappedIds.some((id, index) => id !== deliveryItemIds[index])) {
        const selectedIndex = deliveryItemIds.indexOf(selectedDeliveryItemId);
        deliveryItemIds = mappedIds;
        selectedDeliveryItemId =
          selectedIndex >= 0
            ? mappedIds[selectedIndex]
            : (mappedIds[0] ?? '');
        await this.prisma.customRecipeAftersale.update({
          where: { id: aftersale.id },
          data: { deliveryItemIds: mappedIds },
        });
      }
    }

    let deliveryRecipeId: string | null = null;
    if (deliveryItemIds.length > 0) {
      if (
        !selectedDeliveryItemId ||
        !deliveryItemIds.includes(selectedDeliveryItemId)
      ) {
        throw new BadRequestException('请选择本次售后要修改的那一份食谱');
      }
      const deliveryItem = await this.prisma.customRecipeDeliveryItem.findUnique({
        where: { id: selectedDeliveryItemId },
        select: { id: true, batchId: true, recipeId: true },
      });
      if (!deliveryItem) {
        throw new NotFoundException('交付明细不存在');
      }
      deliveryRecipeId = deliveryItem.recipeId;
    } else if (aftersale.deliveryId) {
      const legacyDelivery = await this.prisma.customRecipeDelivery.findUnique({
        where: { id: aftersale.deliveryId },
        select: { recipeId: true },
      });
      if (!legacyDelivery) {
        throw new NotFoundException('交付记录不存在');
      }
      deliveryRecipeId = legacyDelivery.recipeId;
    } else {
      throw new BadRequestException('这条售后没有关联可修改的交付食谱');
    }

    const slot = await this.prisma.orderRecipeDesign.findFirst({
      where: {
        orderId: aftersale.order.id,
        recipeId: deliveryRecipeId,
      },
      select: {
        id: true,
        seriesId: true,
        designDraftId: true,
        recipeId: true,
        status: true,
      },
    });
    if (!slot) {
      throw new NotFoundException('找不到这份交付对应的设计槽位');
    }

    /**
     * 售后改稿必须开新版本：旧 Recipe 行保持冻结，交付页继续读旧快照；
     * 只有重新交付时才把订单/批次切到新 Recipe。
     *
     * ## 但草稿已经是「可编辑」时不能再开修订（2026-10-28 修）
     *
     * 「订单设计」流程里的草稿在交付后仍是 NEEDS_REVIEW（交付的是它当时
     * 生成的私密 Recipe 快照，草稿本身没被正式发布）。此时再调用
     * `createRevisionDraft` 会被守卫挡下 ——「只有已发布食谱可以创建修订草稿」，
     * 结果就是员工在后台一点「修改食谱」就报错，改稿根本走不下去。
     *
     * 口径：
     *   · 草稿已 PUBLISHED（老的正式食谱）→ 照旧开修订，把线上那版冻结；
     *   · 草稿还没发布过（本单设计的工作稿）→ **直接复用**，
     *     它本来就是可编辑的，再复制一份只会让"当前该改哪一份"变得含糊。
     */
    const slotDraft = await this.prisma.designRecipe.findUnique({
      where: { id: slot.designDraftId },
      select: { id: true, status: true },
    });
    if (!slotDraft) {
      throw new NotFoundException('设计槽位指向的草稿已不存在');
    }

    const workingDraftId = this.isPublishedDraftStatus(slotDraft.status)
      ? (
          await this.recipeDesignerService.createRevisionDraft(
            slot.designDraftId,
            { userId: input.operatorId, role: 'ADMIN' },
          )
        ).id
      : slotDraft.id;

    await this.prisma.orderRecipeDesign.update({
      where: { id: slot.id },
      data: {
        status: OrderRecipeDesignStatus.EDITING,
        designDraftId: workingDraftId,
        revisionDeliveryItemId: selectedDeliveryItemId || null,
      },
    });

    return {
      orderId: aftersale.order.orderId,
      orderUuid: aftersale.order.id,
      designId: slot.id,
      seriesId: slot.seriesId,
      draftId: workingDraftId,
      deliveryItemId: selectedDeliveryItemId || null,
      recipeId: deliveryRecipeId,
    };
  }

  /** 草稿是否已是「正式发布」状态（只有这种才需要另开修订） */
  private isPublishedDraftStatus(status: string | null | undefined): boolean {
    return String(status ?? '').toUpperCase() === 'PUBLISHED';
  }

  async stageDraft(
    orderId: string,
    designId: string,
    operatorId: string,
  ): Promise<StageOrderDesignResult> {
    const order = await this.resolveOrder(orderId);

    const slot = await this.prisma.orderRecipeDesign.findUnique({
      where: { id: designId },
      include: {
        designDraft: { select: { updatedAt: true } },
      },
    });
    const normalizedSlot = this.assertSlotBelongsToOrder(slot, order.id);
    // 售后改稿：已交付订单只有在槽位被明确改回 EDITING 后才允许重新入仓。
    if (normalizedSlot.status !== OrderRecipeDesignStatus.EDITING) {
      this.assertOrderAllowsDesign(order);
    }
    if (normalizedSlot.status === OrderRecipeDesignStatus.DELIVERED) {
      throw new BadRequestException('该份食谱已交付，不能重复加入待提交');
    }
    if (normalizedSlot.status === OrderRecipeDesignStatus.REMOVED) {
      throw new NotFoundException('待提交食谱不存在');
    }
    const counts = await this.loadSlotCounts(order.id);

    if (
      normalizedSlot.status === OrderRecipeDesignStatus.READY &&
      normalizedSlot.recipeId
    ) {
      // 没改过草稿 = 幂等返回；改过则允许重新生成私密食谱版本（仍不通知）。
      if (
        !normalizedSlot.designDraft ||
        normalizedSlot.designDraft.updatedAt <= normalizedSlot.updatedAt
      ) {
        return {
          status: 'READY',
          recipeId: normalizedSlot.recipeId,
          readyCount: counts.ready,
        };
      }
    } else if (counts.ready >= order.recipeQuantity) {
      throw new BadRequestException(
        `本单共 ${order.recipeQuantity} 份，已全部就绪，等待管理员提交`,
      );
    }

    const published = await this.recipeDesignerService.publishOrderDesignSlot({
      draftId: normalizedSlot.designDraftId,
      customerId: order.customerId,
      dogId: order.dogId,
      operatorId,
    });

    await this.prisma.orderRecipeDesign.update({
      where: { id: normalizedSlot.id },
      data: {
        status: OrderRecipeDesignStatus.READY,
        recipeId: published.recipeRowId,
      },
    });

    return {
      status: 'READY',
      recipeId: published.recipeRowId,
      readyCount:
        normalizedSlot.status === OrderRecipeDesignStatus.READY
          ? counts.ready
          : counts.ready + 1,
    };
  }

  /**
   * 移除一个尚未最终交付的槽位。
   *
   *  · 只允许 EDITING / READY；
   *  · DELIVERED 不能移除；
   *  · 级联清理：槽位 → 暂存私密食谱 → 设计草稿 → 设计系列。
   */
  async removeSlot(
    orderId: string,
    designId: string,
    operatorId: string,
  ): Promise<void> {
    const order = await this.resolveOrder(orderId);
    this.assertOrderAllowsDesign(order);

    const slot = await this.prisma.orderRecipeDesign.findUnique({
      where: { id: designId },
      select: {
        id: true,
        orderId: true,
        seriesId: true,
        designDraftId: true,
        recipeId: true,
        status: true,
      },
    });
    const normalizedSlot = this.assertSlotBelongsToOrder(slot, order.id);

    if (normalizedSlot.status === OrderRecipeDesignStatus.DELIVERED) {
      throw new BadRequestException('该份食谱已交付，不能移除');
    }
    if (normalizedSlot.status === OrderRecipeDesignStatus.REMOVED) {
      throw new NotFoundException('待提交食谱不存在');
    }

    await this.prisma.$transaction(async (tx) => {
      // 先删槽位，解开 recipe / draft / series 的引用
      await tx.orderRecipeDesign.delete({ where: { id: normalizedSlot.id } });

      if (normalizedSlot.recipeId) {
        // 只删本草稿生成的暂存私密食谱，避免误删正式交付产物
        await tx.recipe.deleteMany({
          where: {
            id: normalizedSlot.recipeId,
            sourceDesignRecipeId: normalizedSlot.designDraftId,
          },
        });
      }

      await tx.designRecipeItem.deleteMany({
        where: { designRecipeId: normalizedSlot.designDraftId },
      });
      await tx.designRecipe.deleteMany({
        where: { id: normalizedSlot.designDraftId },
      });
      await tx.recipeSeries.deleteMany({
        where: { id: normalizedSlot.seriesId },
      });
    });

    // operatorId 目前只用于路由审计（现有槽位表无「移除人」列），
    // 保留参数是为了将来补审计字段时不改接口。
    void operatorId;
  }

  private async resolveOrder(orderId: string): Promise<OrderDesignContext> {
    const normalizedOrderId = orderId?.trim();
    if (!normalizedOrderId) {
      throw new BadRequestException('缺少订单号');
    }

    // 复用定制订单服务的「对外单号 / uuid」解析口径。
    const ref =
      await this.customRecipeService.resolveOrderRef(normalizedOrderId);
    const order = await this.prisma.customRecipeOrder.findUnique({
      where: { id: ref.id },
      select: {
        id: true,
        orderId: true,
        customerId: true,
        dogId: true,
        status: true,
        recipeQuantity: true,
        dog: { select: { id: true, name: true } },
      },
    });

    if (!order) {
      throw new NotFoundException(`定制订单不存在: ${normalizedOrderId}`);
    }

    return order;
  }

  private assertOrderAllowsDesign(order: OrderDesignContext): void {
    if (DESIGNABLE_ORDER_STATUSES.has(order.status)) {
      return;
    }
    if (order.status === CustomRecipeStatus.CANCELLED) {
      throw new BadRequestException('订单已取消，不能再设计食谱');
    }
    if (
      order.status === CustomRecipeStatus.DELIVERED ||
      order.status === CustomRecipeStatus.COMPLETED
    ) {
      throw new BadRequestException('订单已交付，不能再设计食谱');
    }
    throw new BadRequestException('订单还未付款，付款成功后才能开始设计');
  }

  /** 待提交槽位（EDITING + READY）不超过本单份数。 */
  private async assertSlotCapacity(order: OrderDesignContext): Promise<void> {
    const counts = await this.loadSlotCounts(order.id);
    if (counts.ready >= order.recipeQuantity) {
      throw new BadRequestException(
        `本单共 ${order.recipeQuantity} 份，已全部就绪，等待管理员提交`,
      );
    }
    if (counts.active >= order.recipeQuantity) {
      throw new BadRequestException(
        `本单待提交仓库已满（共 ${order.recipeQuantity} 份），请先移除不需要的草稿`,
      );
    }
  }

  private async loadSlotCounts(
    customOrderId: string,
  ): Promise<{ active: number; ready: number }> {
    const [active, ready] = await Promise.all([
      this.prisma.orderRecipeDesign.count({
        where: {
          orderId: customOrderId,
          status: {
            in: [
              OrderRecipeDesignStatus.EDITING,
              OrderRecipeDesignStatus.READY,
            ],
          },
        },
      }),
      this.prisma.orderRecipeDesign.count({
        where: {
          orderId: customOrderId,
          status: OrderRecipeDesignStatus.READY,
        },
      }),
    ]);
    return { active, ready };
  }

  private assertSlotBelongsToOrder<T extends { orderId: string } | null>(
    slot: T,
    customOrderId: string,
  ): NonNullable<T> {
    if (!slot || slot.orderId !== customOrderId) {
      throw new NotFoundException('待提交食谱不存在');
    }
    return slot as NonNullable<T>;
  }
}
