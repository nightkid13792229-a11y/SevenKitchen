import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CustomRecipeStatus } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma.service';
import { CustomRecipeConfigService } from './custom-recipe-config.service';
import { calculateDailyIntakeG } from '../../domain/dog/dog-calc.service';
import {
  assertTransition,
  timestampFieldFor,
} from '../../domain/custom-recipe/custom-recipe.state';
import {
  buildDeliverySnapshot,
  resolveDeliveryItems,
  type DeliveryContentSnapshot,
  type SnapshotRecipeItem,
  type SnapshotSupplement,
} from '../../domain/custom-recipe/custom-recipe.delivery';
import {
  buildShoppingList,
  toSnapshotShopping,
} from '../../domain/custom-recipe/custom-recipe.shopping';

/**
 * 定制食谱 · 交付服务（2026-10-16，批次 2.1）
 *
 * ## 它补上的是什么
 *
 * 在此之前，"交付"就是 `order.recipeId = 食谱; status = DELIVERED` ——
 * **不留交付记录、不留内容快照**。三个后果：
 *
 *   ① 顾客手里那份食谱，营养师之后一改配方就**跟着变**，查不到改了哪；
 *   ② 交付后系统再也不会有动作（`DELIVERED` 在旧流转表里是**死胡同**），
 *      "顾客确认收到"与"售后"无处安放；
 *   ③ 交付动作**绕过了状态机**，是四条能改状态的路径之一。
 *
 * ## 三条设计口径
 *
 * **一、交付是一次「冻结」。** 快照在这里生成，之后配方怎么改都不影响已交付那一版。
 * 重新交付 = 新版本 + 旧版本标记被替换，**旧版本仍可查**。
 *
 * **二、喂食量由后端算。** `每天吃多少克 = 每天需要多少千卡 ÷ 能量密度 × 1000`，
 * 用的是**下单时那份狗狗档案**算出来的需求，不是前端传上来的数字。
 * 前端传"每天 260g"的话，档案一改就对不上了。
 *
 * **三、状态流转走状态机。** 不再自己写 `status = 'DELIVERED'`。
 */
@Injectable()
export class CustomRecipeDeliveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: CustomRecipeConfigService,
  ) {}

  /**
   * 交付一道食谱到一张定制单。
   *
   * 会做四件事（在一个事务里）：
   *   ① 生成内容快照（冻结这一版）
   *   ② 建交付记录（版本号 = 该订单已有版本数 + 1）
   *   ③ 把上一版标记为"已被替换"
   *   ④ 订单转「已交付」并设置"自动完成闹钟"
   */
  async deliver(input: {
    orderIdOrId: string;
    recipeIdOrBizId: string;
    deliveredBy: string;
    /** 交付物清单；不传则按「配置 + 这一版实际有没有内容」算 */
    items?: string[];
    /**
     * 这一批做几天（批次 2.2）。
     *
     * 为什么让它当参数、而不是放全局配置：**"做多少天的量"是营养师
     * 每次交付的业务决定**（同一只狗，这次做 7 天的、下次做 14 天的），
     * 不是一个全局开关。不传时按 7 天算，并在快照里如实记下用了几天。
     */
    cycleDays?: number | null;
    /** 便于测试注入 */
    now?: Date;
  }): Promise<{
    orderId: string;
    recipeBizId: string;
    recipeName: string;
    version: number;
    redelivered: boolean;
    deliveryId: string;
    autoCompleteAt: Date | null;
    itemCodes: string[];
  }> {
    const now = input.now ?? new Date();

    const order = await this.resolveOrder(input.orderIdOrId);

    /**
     * 状态校验走**状态机**（批次 1.2 收敛的目标之一）。
     * 领域层抛的是普通 Error，这里翻译成 400 并给一句人话。
     */
    const redelivered = order.status === CustomRecipeStatus.DELIVERED;
    try {
      assertTransition(order.status, CustomRecipeStatus.DELIVERED);
    } catch (error) {
      throw new BadRequestException(
        order.status === CustomRecipeStatus.PENDING_PAYMENT
          ? '该订单还没确认收款，不能交付'
          : order.status === CustomRecipeStatus.CANCELLED
            ? '该订单已取消，不能交付'
            : error instanceof Error
              ? error.message
              : '该订单当前状态不能交付',
      );
    }

    const recipe = await this.resolveRecipe(input.recipeIdOrBizId, order);

    const snapshot = await this.buildSnapshot({
      order,
      recipe,
      now,
      cycleDays: input.cycleDays ?? null,
    });
    const itemCodes = input.items ?? (await this.configuredItemCodes(snapshot));

    const deliveryItems = resolveDeliveryItems(itemCodes, {
      hasRecipe: snapshot.recipe.items.length > 0,
      hasShoppingSop: snapshot.shopping.lines.length > 0,
      hasNutritionReport: snapshot.nutrition.energyDensityKcalPerKg !== null,
    });

    return this.prisma.$transaction(async (tx) => {
      /** 版本号 = 该订单已有交付数 + 1；唯一索引兜底防并发重号 */
      const existingCount = await tx.customRecipeDelivery.count({
        where: { orderId: order.id },
      });
      const version = existingCount + 1;

      const delivery = await tx.customRecipeDelivery.create({
        data: {
          orderId: order.id,
          version,
          recipeId: recipe.id,
          recipeVersion: recipe.version,
          contentSnapshot: snapshot as unknown as object,
          items: deliveryItems.map((item) => item.code),
          feedingParams: snapshot.feeding as unknown as object,
          deliveredBy: input.deliveredBy,
          deliveredAt: now,
          notifyStatus: 'PENDING',
          confirmChannel: null,
        },
      });

      /**
       * 旧版本标记"已被替换" —— 但**不删**。
       * 顾客与客服都要能翻回上一版看"当时给的是什么"。
       */
      if (version > 1) {
        await tx.customRecipeDelivery.updateMany({
          where: { orderId: order.id, version: { lt: version } },
          data: { replacedByDeliveryId: delivery.id },
        });
      }

      /** 自动完成闹钟 = 交付时间 + 配置的天数 */
      const autoCompleteDays = await this.getAutoCompleteDays();
      const autoCompleteAt =
        autoCompleteDays > 0
          ? new Date(now.getTime() + autoCompleteDays * 24 * 60 * 60 * 1000)
          : null;

      const timestampField = timestampFieldFor(CustomRecipeStatus.DELIVERED);
      await tx.customRecipeOrder.update({
        where: { id: order.id },
        data: {
          status: CustomRecipeStatus.DELIVERED,
          recipeId: recipe.id,
          ...(timestampField ? { [timestampField]: now } : {}),
          autoCompleteAt,
        },
      });

      return {
        orderId: order.orderId,
        recipeBizId: recipe.recipeId,
        recipeName: recipe.name,
        version,
        redelivered,
        deliveryId: delivery.id,
        autoCompleteAt,
        itemCodes: deliveryItems.map((item) => item.code),
      };
    });
  }

  /**
   * 顾客确认收到。
   *
   * 幂等：重复点不会报错，也不会把时间刷新成第二次点的时间
   * （"什么时候确认的"是售后窗口的起算依据，不能被刷新）。
   */
  async confirmReceipt(input: {
    orderIdOrId: string;
    deliveryId?: string;
    channel?: 'CUSTOMER' | 'AUTO';
    now?: Date;
  }): Promise<{ confirmed: boolean; alreadyConfirmed: boolean }> {
    const now = input.now ?? new Date();
    const order = await this.resolveOrder(input.orderIdOrId);

    const delivery = input.deliveryId
      ? await this.prisma.customRecipeDelivery.findFirst({
          where: { id: input.deliveryId, orderId: order.id },
        })
      : await this.prisma.customRecipeDelivery.findFirst({
          where: { orderId: order.id },
          orderBy: { version: 'desc' },
        });

    if (!delivery) {
      throw new NotFoundException('这张订单还没有交付记录，无法确认收到');
    }

    if (delivery.confirmedAt) {
      return { confirmed: true, alreadyConfirmed: true };
    }

    if (order.status === CustomRecipeStatus.CANCELLED) {
      throw new BadRequestException('订单已取消，不需要确认收到');
    }

    try {
      assertTransition(order.status, CustomRecipeStatus.COMPLETED);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : '当前状态不能确认收到',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.customRecipeDelivery.update({
        where: { id: delivery.id },
        data: {
          confirmedAt: now,
          confirmChannel: input.channel ?? 'CUSTOMER',
        },
      });

      const timestampField = timestampFieldFor(CustomRecipeStatus.COMPLETED);
      await tx.customRecipeOrder.update({
        where: { id: order.id },
        data: {
          status: CustomRecipeStatus.COMPLETED,
          ...(timestampField ? { [timestampField]: now } : {}),
          /** 完成后清掉闹钟，免得定时任务一直扫到这张单 */
          autoCompleteAt: null,
        },
      });

      return { confirmed: true, alreadyConfirmed: false };
    });
  }

  /** 列出某订单的全部交付版本（新→旧） */
  async listForOrder(orderIdOrId: string) {
    const order = await this.resolveOrder(orderIdOrId);
    return this.prisma.customRecipeDelivery.findMany({
      where: { orderId: order.id },
      orderBy: { version: 'desc' },
    });
  }

  /** 取当前有效的那一版交付（没有被替换的那一版） */
  async getCurrent(orderIdOrId: string) {
    const order = await this.resolveOrder(orderIdOrId);
    return this.prisma.customRecipeDelivery.findFirst({
      where: { orderId: order.id, replacedByDeliveryId: null },
      orderBy: { version: 'desc' },
    });
  }

  // ==================== 内部 ====================

  private async resolveOrder(orderIdOrId: string) {
    const order = await this.prisma.customRecipeOrder.findFirst({
      where: { OR: [{ orderId: orderIdOrId }, { id: orderIdOrId }] },
      select: {
        id: true,
        orderId: true,
        customerId: true,
        dogId: true,
        status: true,
        recipeId: true,
      },
    });
    if (!order) {
      throw new NotFoundException(`定制订单不存在: ${orderIdOrId}`);
    }
    return order;
  }

  /**
   * 取食谱，并守住那条隐私边界（2026-09-28 专门修过）：
   * **只能交付「这位顾客 + 这只狗」的私密定制食谱**。
   */
  private async resolveRecipe(
    recipeIdOrBizId: string,
    order: { id: string; orderId: string; customerId: string; dogId: string },
  ) {
    const recipe = await this.prisma.recipe.findFirst({
      where: { OR: [{ recipeId: recipeIdOrBizId }, { id: recipeIdOrBizId }] },
      include: {
        items: {
          include: { ingredient: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!recipe) {
      throw new NotFoundException('食谱不存在');
    }

    if (
      !recipe.isCustomRecipe ||
      recipe.customerOwnerId !== order.customerId ||
      recipe.customerDogId !== order.dogId
    ) {
      throw new BadRequestException(
        '这道食谱不属于该订单的顾客 / 狗狗，不能交付到这张定制单',
      );
    }

    /**
     * 一道定制食谱只能挂在**一张**定制单上（`recipe_id` 是唯一约束）。
     * 复用会让两单共用一份产出，而 ¥150 抵扣额度是绑在那道食谱上的。
     */
    const occupied = await this.prisma.customRecipeOrder.findFirst({
      where: { recipeId: recipe.id, id: { not: order.id } },
      select: { orderId: true },
    });

    if (occupied) {
      throw new BadRequestException(
        `这道食谱已经交付给另一张定制单（${occupied.orderId}），` +
          '一道定制食谱只能对应一张定制单。请在设计器里另存一版再交付，' +
          '或直接到那张单上做「重新交付」',
      );
    }

    return recipe;
  }

  /**
   * 生成内容快照。
   *
   * **喂食量在这里算**（不是前端传的）：`每天需要多少千卡 ÷ 能量密度 × 1000`。
   * 用的是下单时那份狗狗档案算出来的需求 —— 前端传数字的话，档案一改就对不上了。
   */
  private async buildSnapshot(input: {
    order: { id: string; orderId: string; dogId: string };
    recipe: {
      id: string;
      recipeId: string;
      version: number;
      name: string;
      coverImageUrl: string | null;
      energyDensityKcalPerKg: unknown;
      /** 生产损耗率 —— 存的是**系数**（1.07 = 多买 7%），不是比率 */
      productionLossRate: unknown;
      nutritionStandard: string | null;
      items: Array<{
        ratioPercent: number | null;
        exampleWeight: number | null;
        preparationMethod: string | null;
        ingredient: { name: string; type: string } | null;
      }>;
    };
    now: Date;
    cycleDays: number | null;
  }): Promise<DeliveryContentSnapshot> {
    const energyDensity = Number(input.recipe.energyDensityKcalPerKg);

    const items: SnapshotRecipeItem[] = input.recipe.items.map((item) => ({
      name: item.ingredient?.name ?? '未知食材',
      preparation: item.preparationMethod ?? null,
      ratioPercent:
        item.ratioPercent === null ? null : Number(item.ratioPercent),
      weightG:
        item.exampleWeight === null ? null : Number(item.exampleWeight),
      isSupplement: item.ingredient?.type === 'SUPPLEMENT',
    }));

    const feeding = await this.computeFeeding({
      dogId: input.order.dogId,
      energyDensityKcalPerKg: energyDensity,
      cycleDays: input.cycleDays,
    });

    /**
     * 补充剂单列一块（不与食材混）—— 顾客采购时"要吃多少"和"要加多少"是两件事。
     * 数量按"每 kg 食材加多少克"给，顾客才好按自己做的量换算。
     */
    const supplements: SnapshotSupplement[] = items
      .filter((item) => item.isSupplement)
      .map((item) => ({
        name: item.name,
        totalG: null,
        perKgG:
          item.ratioPercent === null || item.ratioPercent === undefined
            ? null
            : item.ratioPercent * 10,
        brand: null,
        timing: item.preparation,
      }));

    return buildDeliverySnapshot({
      recipe: {
        recipeId: input.recipe.recipeId,
        name: input.recipe.name,
        coverImageUrl: input.recipe.coverImageUrl,
        internalId: input.recipe.id,
        items,
      },
      feeding,
      nutrition: {
        standard: input.recipe.nutritionStandard,
        energyDensityKcalPerKg: Number.isFinite(energyDensity)
          ? energyDensity
          : null,
      },
      /**
       * 采购清单（批次 2.2）—— 这套算法原先在**小程序页面里**，
       * 也就是"买多少"是顾客手机上算出来的。现在搬到后端。
       *
       * 算不出来时（没有喂食量）给的是空清单而不是乱猜，
       * 原因记在订单日志里，前端只显示"暂时算不出要买多少"。
       */
      shopping: toSnapshotShopping(
        buildShoppingList({
          items: items.map((item) => ({
            name: item.name,
            ratioPercent: item.ratioPercent ?? null,
            isSupplement: item.isSupplement,
            preparation: item.preparation,
          })),
          dailyIntakeG: feeding.dailyIntakeG,
          cycleDays: feeding.cycleDays,
          /**
           * ⚠️ 这里传的是**系数**（1.07），不是比率（0.07）。
           * 库里 `production_loss_rate` 存的就是系数。
           */
          foodLossRate: Number(input.recipe.productionLossRate),
        }),
      ),
      supplements,
      steps: [],
      now: input.now,
    });
  }

  /**
   * 算喂食参数。
   *
   * 取不到狗狗档案时**全部给 null** —— 不猜。给一个猜出来的"每天 250g"
   * 会让顾客照着喂，喂多喂少都是我们造成的。
   */
  private async computeFeeding(input: {
    dogId: string;
    energyDensityKcalPerKg: number;
    cycleDays: number | null;
  }): Promise<{
    dailyIntakeG: number | null;
    mealsPerDay: number | null;
    perMealG: number | null;
    cycleDays: number | null;
  }> {
    const empty = {
      dailyIntakeG: null,
      mealsPerDay: null,
      perMealG: null,
      cycleDays: null,
    };

    if (
      !Number.isFinite(input.energyDensityKcalPerKg) ||
      input.energyDensityKcalPerKg <= 0
    ) {
      return empty;
    }

    try {
      const dog = await this.prisma.dog.findUnique({
        where: { id: input.dogId },
        select: { cachedTargetFoodKcal: true, mealsPerDay: true },
      });
      const cycleDays = positiveOrNull(input.cycleDays) ?? DEFAULT_CYCLE_DAYS;
      if (!dog) return { ...empty, cycleDays };

      const finalKcal =
        dog.cachedTargetFoodKcal === null ||
        dog.cachedTargetFoodKcal === undefined
          ? null
          : Number(dog.cachedTargetFoodKcal);
      if (finalKcal === null || !Number.isFinite(finalKcal) || finalKcal <= 0) {
        return {
          ...empty,
          mealsPerDay: dog.mealsPerDay ?? null,
          cycleDays,
        };
      }

      const dailyIntakeG = calculateDailyIntakeG(
        finalKcal,
        input.energyDensityKcalPerKg,
      );
      const mealsPerDay = dog.mealsPerDay ?? null;

      return {
        dailyIntakeG: round1(dailyIntakeG),
        mealsPerDay,
        perMealG:
          mealsPerDay && mealsPerDay > 0
            ? round1(dailyIntakeG / mealsPerDay)
            : null,
        cycleDays,
      };
    } catch {
      return empty;
    }
  }

  /** 按配置与"这一版实际有没有内容"算出交付物清单 */
  private async configuredItemCodes(
    snapshot: DeliveryContentSnapshot,
  ): Promise<string[]> {
    let configured: string[] = [];
    try {
      const config = await this.configService.getConfig();
      configured = Array.isArray(config.deliveryItemCodes)
        ? config.deliveryItemCodes
        : [];
    } catch {
      configured = [];
    }
    return resolveDeliveryItems(configured, {
      hasRecipe: snapshot.recipe.items.length > 0,
      hasShoppingSop: snapshot.shopping.lines.length > 0,
      hasNutritionReport: snapshot.nutrition.energyDensityKcalPerKg !== null,
    }).map((item) => item.code);
  }

  private async getAutoCompleteDays(): Promise<number> {
    try {
      const config = await this.configService.getConfig();
      const value = Number(config.autoCompleteDays);
      return Number.isInteger(value) && value > 0 ? value : 3;
    } catch {
      return 3;
    }
  }
}

/**
 * 交付时没指定"做几天"时的默认值。
 *
 * 取 7 是因为小程序 DIY 制作单的默认天数也是 7 —— 两边默认值必须一致，
 * 否则同一道食谱在两个入口会算出不同的采购量。
 */
const DEFAULT_CYCLE_DAYS = 7;

function positiveOrNull(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : null;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
