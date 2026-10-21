/**
 * 订单绑定食谱设计 · 最终提交（2026-10-22 · Task 4）。
 *
 * ## 它解决的问题
 *
 * 新版「订单设计」流程里，营养师把 N 份设计逐份「加入待提交」后生成私密食谱，
 * 但**不交付、不发通知**。真正的交付动作只发生在这里，且由管理员一次性完成：
 * 少一份不交、多一份不交、从别单混进来一份也不交。
 *
 * ## 三条口径
 *
 * **一、只认 READY 槽位。** 订单要有且只有 `recipeQuantity` 个 READY 槽位，
 * 每份的私密食谱 id 必须互不相同；有任何一份还在 EDITING，整单拒绝。
 *
 * **二、交付复用既有批次服务。** `CustomRecipeDeliveryService.deliverBatch`
 * 已经在一个事务里写完批次头 + N 份快照，本服务不复制那套逻辑，也不重新发布食谱 —
 * 槽位上的 `recipeId` 就是「加入待提交」时已经发布好的私密食谱。
 *
 * **三、先交付成功，再标 DELIVERED。** 交付事务失败时槽位保持 READY，重试即可；
 * 交付成功但槽位没来得及标记时，重试会识别「订单已交付 + 批次已存在」，
 * 只补标槽位并返回当前批次摘要，不会重复生成第二版。
 *
 * ## 为什么旧交付入口要拦
 *
 * 新流程订单如果还能从订单页 `deliver-recipe` / `deliver-batch` 单份交付，
 * 客服就能绕过「N 份齐了才交」的约束，顾客会收到不完整的一批。
 * 旧订单（没有任何设计槽位）的行为一个字都不变。
 */
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CustomRecipeStatus, OrderRecipeDesignStatus } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma.service';
import { CustomRecipeDeliveryService } from './custom-recipe-delivery.service';
import { CustomRecipeService } from './custom-recipe.service';

/** 最终提交返回的一份食谱摘要（recipeId 是对外业务编号）。 */
export interface OrderDesignSubmitRecipe {
  recipeId: string;
  recipeName: string;
  itemCodes: string[];
}

/**
 * 最终提交结果。
 *
 * 前 8 个字段与 `deliver-batch` / `deliverBatch()` 的返回保持一致，
 * 后台页面可以不分「新流程还是老流程」地渲染同一张交付摘要。
 */
export interface OrderDesignSubmitResult {
  orderId: string;
  batchId: string;
  version: number;
  deliveredAt: Date;
  autoCompleteAt: Date | null;
  recipeCount: number;
  recipes: OrderDesignSubmitRecipe[];
  legacyRecipeId: string;
  /**
   * 本次请求是否只是回放已完成的提交：
   *   · true  = 订单与槽位早已 DELIVERED，本次没有新的交付，不应再发通知；
   *   · false = 本次真的交付了，或补标了上次没来得及标记的槽位。
   */
  replayed: boolean;
}

interface SubmitOrder {
  id: string;
  orderId: string;
  customerId: string;
  dogId: string;
  status: CustomRecipeStatus;
  recipeQuantity: number;
  autoCompleteAt: Date | null;
}

interface SubmitSlot {
  id: string;
  orderId: string;
  dogId: string;
  status: OrderRecipeDesignStatus;
  recipeId: string | null;
}

type LatestBatchSummary = Omit<OrderDesignSubmitResult, 'replayed'> & {
  /** 批次明细里的 `recipe.id`（主键），用来核对槽位指向的是不是已交付的那份 */
  recipeRowIds: string[];
};

/** 只允许首次交付的订单状态；DELIVERED 走幂等回放，不在这里。 */
const SUBMITTABLE_ORDER_STATUSES = new Set<CustomRecipeStatus>([
  CustomRecipeStatus.PAID,
  CustomRecipeStatus.IN_PROGRESS,
]);

@Injectable()
export class OrderDesignSubmitService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customRecipeService: CustomRecipeService,
    private readonly deliveryService: CustomRecipeDeliveryService,
  ) {}

  /**
   * 管理员最终提交：把本单 N 份 READY 设计一次性交付给顾客。
   *
   * `orderIdOrId` 既接受对外业务单号，也接受订单主键 —— 与后台其他接口同口径。
   */
  async submitOrderDesigns(
    orderIdOrId: string,
    operatorId: string,
  ): Promise<OrderDesignSubmitResult> {
    const order = await this.resolveOrder(orderIdOrId);
    const slots = await this.loadSlots(order);

    if (slots.length === 0) {
      throw new BadRequestException(
        '该订单没有「订单设计」待提交记录；老订单请在订单页直接交付食谱',
      );
    }
    this.assertSlotsBelongToOrder(slots, order);

    /**
     * 已交付订单：只可能是「上次交付成功、槽位没标完」的重试。
     * 放在状态校验之前 —— 否则 DELIVERED 会被「订单已交付不能再提交」挡掉。
     */
    if (order.status === CustomRecipeStatus.DELIVERED) {
      return this.replayDeliveredOrder(order, slots);
    }

    this.assertOrderSubmittable(order);
    this.assertSlotsReady(order, slots);

    const recipeIds = slots.map((slot) => slot.recipeId as string);
    const batch = await this.deliveryService.deliverBatch({
      orderIdOrId: order.orderId,
      recipeIds,
      deliveredBy: operatorId,
    });

    /**
     * 批次事务已经成功，这里才标槽位。若这一次更新失败，订单已是 DELIVERED、
     * 槽位仍是 READY —— 下一次请求会走上面的幂等分支补标，不会重复交付。
     */
    await this.markSlotsDelivered(slots.map((slot) => slot.id));

    return {
      ...batch,
      replayed: false,
    };
  }

  /**
   * 旧交付入口（订单页 `deliver-recipe` / `deliver-batch`）的前置检查。
   *
   * 只要这张单出现过设计槽位，就说明它走的是新版「订单设计」流程，
   * 必须回工作台整批提交，不能从订单页单份交付。
   */
  async assertLegacyDeliveryAllowed(orderIdOrId: string): Promise<void> {
    const order = await this.resolveOrder(orderIdOrId);
    const designCount = await this.prisma.orderRecipeDesign.count({
      where: { orderId: order.id },
    });

    if (designCount > 0) {
      throw new BadRequestException(
        '该订单已使用新版「订单设计」流程，不能从订单页单独交付食谱；' +
          '请到订单设计工作台点击「提交设计」整批提交' +
          `（POST /api/v1/admin/custom-recipe/orders/${order.orderId}/submit-designs）`,
      );
    }
  }

  private async resolveOrder(orderIdOrId: string): Promise<SubmitOrder> {
    const normalized = orderIdOrId?.trim();
    if (!normalized) {
      throw new BadRequestException('缺少订单号');
    }

    // 复用定制订单服务的「对外单号 / uuid」解析口径
    const ref = await this.customRecipeService.resolveOrderRef(normalized);
    const order = await this.prisma.customRecipeOrder.findUnique({
      where: { id: ref.id },
      select: {
        id: true,
        orderId: true,
        customerId: true,
        dogId: true,
        status: true,
        recipeQuantity: true,
        autoCompleteAt: true,
      },
    });

    if (!order) {
      throw new NotFoundException(`定制订单不存在: ${normalized}`);
    }

    return order;
  }

  private async loadSlots(order: SubmitOrder): Promise<SubmitSlot[]> {
    return this.prisma.orderRecipeDesign.findMany({
      where: {
        orderId: order.id,
        status: { not: OrderRecipeDesignStatus.REMOVED },
      },
      select: {
        id: true,
        orderId: true,
        dogId: true,
        status: true,
        recipeId: true,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  /**
   * 防御跨订单 / 跨狗狗的脏数据：槽位必须落在本单 + 本单狗狗上。
   * 正常写入路径不会产生这种行，但最终交付是「一次交付 N 份」，
   * 不能把一个可疑槽位混进批次里。
   */
  private assertSlotsBelongToOrder(
    slots: SubmitSlot[],
    order: SubmitOrder,
  ): void {
    const foreign = slots.filter(
      (slot) => slot.orderId !== order.id || slot.dogId !== order.dogId,
    );
    if (foreign.length > 0) {
      throw new BadRequestException(
        '待提交食谱中有不属于该订单 / 该订单狗狗的槽位，不能整批提交',
      );
    }
  }

  private assertOrderSubmittable(order: SubmitOrder): void {
    if (SUBMITTABLE_ORDER_STATUSES.has(order.status)) {
      return;
    }

    if (order.status === CustomRecipeStatus.PENDING_PAYMENT) {
      throw new BadRequestException('该订单还没确认收款，不能提交设计');
    }
    if (order.status === CustomRecipeStatus.CANCELLED) {
      throw new BadRequestException('该订单已取消，不能提交设计');
    }
    if (order.status === CustomRecipeStatus.COMPLETED) {
      throw new BadRequestException('该订单已完成，不能再提交设计');
    }
    throw new BadRequestException('该订单当前状态不能提交设计');
  }

  private assertSlotsReady(order: SubmitOrder, slots: SubmitSlot[]): void {
    if (!Number.isInteger(order.recipeQuantity) || order.recipeQuantity <= 0) {
      throw new BadRequestException(
        `该订单的份数配置异常（${order.recipeQuantity}），无法提交设计；请检查订单数据`,
      );
    }

    const notReady = slots.filter(
      (slot) => slot.status !== OrderRecipeDesignStatus.READY,
    );
    if (notReady.length > 0) {
      throw new BadRequestException(
        `本单共 ${order.recipeQuantity} 份，还有 ${notReady.length} 份未加入待提交；` +
          '请把每一份设计加入待提交后，再由管理员整批提交',
      );
    }

    if (slots.length < order.recipeQuantity) {
      throw new BadRequestException(
        `本单共 ${order.recipeQuantity} 份，当前只有 ${slots.length} 份已就绪；` +
          '多份订单必须一次交齐，不能少交',
      );
    }
    if (slots.length > order.recipeQuantity) {
      throw new BadRequestException(
        `本单共 ${order.recipeQuantity} 份，当前待提交 ${slots.length} 份；` +
          '请先移除多余的草稿',
      );
    }

    const missingRecipe = slots.filter(
      (slot) => !slot.recipeId || slot.recipeId.trim().length === 0,
    );
    if (missingRecipe.length > 0) {
      throw new BadRequestException(
        '有已就绪的食谱缺少私密食谱版本，请重新加入待提交后再提交',
      );
    }

    const recipeIds = slots.map((slot) => slot.recipeId as string);
    if (new Set(recipeIds).size !== recipeIds.length) {
      throw new BadRequestException(
        '同一道食谱不能在一个批次里重复交付，请为每一份准备不同的食谱',
      );
    }
  }

  /**
   * 已交付订单的重试：
   *   · 槽位都已 DELIVERED → 纯回放，返回当前批次摘要，不发通知；
   *   · 还有 READY 槽位 → 补标 DELIVERED，返回摘要（本次没有新交付）。
   *
   * 若 READY 槽位指向的食谱不在已交付批次里，说明这条重试不是「上次没标完」，
   * 而是想替换已交付内容 —— 拒绝，售后改稿走重新交付。
   */
  private async replayDeliveredOrder(
    order: SubmitOrder,
    slots: SubmitSlot[],
  ): Promise<OrderDesignSubmitResult> {
    const summary = await this.loadLatestBatchSummary(order);
    if (!summary) {
      throw new BadRequestException(
        '订单已交付，但找不到对应的交付批次，无法重复提交设计',
      );
    }

    const pending = slots.filter(
      (slot) => slot.status !== OrderRecipeDesignStatus.DELIVERED,
    );
    if (pending.length === 0) {
      const { recipeRowIds: _recipeRowIds, ...result } = summary;
      return { ...result, replayed: true };
    }

    const invalid = pending.filter(
      (slot) =>
        slot.status !== OrderRecipeDesignStatus.READY ||
        !slot.recipeId ||
        slot.recipeId.trim().length === 0,
    );
    if (invalid.length > 0) {
      throw new BadRequestException(
        '订单已交付，但仍有未加入待提交的设计；不能重复提交，也不能覆盖已交付内容',
      );
    }

    const deliveredRecipeRowIds = new Set(summary.recipeRowIds);
    const notInBatch = pending.filter(
      (slot) => !deliveredRecipeRowIds.has(slot.recipeId as string),
    );
    if (notInBatch.length > 0) {
      throw new BadRequestException(
        '待提交的食谱不在订单已交付的批次里，不能覆盖已交付内容；' +
          '如需改稿请从售后走「重新交付」',
      );
    }

    await this.markSlotsDelivered(slots.map((slot) => slot.id));

    const { recipeRowIds: _recipeRowIds, ...result } = summary;
    return { ...result, replayed: false };
  }

  private async loadLatestBatchSummary(
    order: SubmitOrder,
  ): Promise<LatestBatchSummary | null> {
    const batch = await this.prisma.customRecipeDeliveryBatch.findFirst({
      where: { orderId: order.id },
      orderBy: { version: 'desc' },
      select: {
        id: true,
        version: true,
        deliveredAt: true,
        items: {
          select: {
            recipeId: true,
            items: true,
            recipe: { select: { recipeId: true, name: true } },
          },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        },
      },
    });

    if (!batch) {
      return null;
    }

    const items = batch.items.map((item) => ({
      rowId: item.recipeId,
      recipeId: item.recipe?.recipeId ?? item.recipeId,
      recipeName: item.recipe?.name ?? '',
      itemCodes: Array.isArray(item.items)
        ? (item.items as unknown[]).filter(
            (value): value is string => typeof value === 'string',
          )
        : [],
    }));

    return {
      orderId: order.orderId,
      batchId: batch.id,
      version: batch.version,
      deliveredAt: batch.deliveredAt,
      autoCompleteAt: order.autoCompleteAt,
      recipeCount: items.length,
      recipes: items.map(({ recipeId, recipeName, itemCodes }) => ({
        recipeId,
        recipeName,
        itemCodes,
      })),
      legacyRecipeId: items[0]?.rowId ?? '',
      recipeRowIds: items.map((item) => item.rowId),
    };
  }

  private async markSlotsDelivered(slotIds: string[]): Promise<void> {
    if (slotIds.length === 0) {
      return;
    }

    await this.prisma.orderRecipeDesign.updateMany({
      where: { id: { in: slotIds } },
      data: {
        status: OrderRecipeDesignStatus.DELIVERED,
        updatedAt: new Date(),
      },
    });
  }
}
