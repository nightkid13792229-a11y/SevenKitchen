import {
  formatProductionStepsText,
  readProductionSteps,
} from '../../domain/recipe-designer/production-steps';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CustomRecipeStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma.service';
import { CustomRecipeConfigService } from './custom-recipe-config.service';
import { Optional } from '@nestjs/common';
import { CustomerMessageService } from '../message/customer-message.service';
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
    /**
     * 站内消息（2026-10-18）。
     *
     * 放**参数表最后**并 @Optional：既有测试按位置调用构造函数，
     * 插在中间会让它们全部错位（这个坑在本文件里踩过一次）。
     */
    @Optional()
    private readonly customerMessages?: CustomerMessageService,
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
    const dog = await this.resolveDogForSnapshot(order.dogId);

    const snapshot = await this.buildSnapshot({
      order,
      recipe,
      dog,
      now,
      cycleDays: input.cycleDays ?? null,
    });
    const itemCodes = input.items ?? (await this.configuredItemCodes(snapshot));

    const deliveryItems = resolveDeliveryItems(itemCodes, {
      hasRecipe: snapshot.recipe.items.length > 0,
      hasShoppingSop: snapshot.shopping.lines.length > 0,
      hasNutritionReport: snapshot.nutrition.energyDensityKcalPerKg !== null,
    });

    const result = await this.prisma.$transaction(async (tx) => {
      /**
       * 同一订单的交付串行化：锁住订单行后再数版本，避免两个管理员
       * 同时交付时都拿到 version=1。
       */
      await tx.$queryRaw`
        SELECT id FROM "custom_recipe_order" WHERE id = ${order.id} FOR UPDATE
      `;
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

      /**
       * 自动完成闹钟 = 交付时间 + **售后窗口天数**（2026-10-18 修正）。
       *
       * ⚠️ 此前用的是 `autoCompleteDays`（默认 **3 天**）——
       * 那是**旧的"顾客不点确认收到就自动完成"**机制，
       * 已被 2026-10-17 的 **V12 取消**。
       *
       * 需求 2.5.5 现在的口径是：
       *   「没有售后 → 交付后满 **7 天**（= 售后窗口）系统自动变已完成」
       *
       * 用 3 天会**在售后窗口还没关的时候就完成**，顾客那时还能提售后，
       * 状态却已经显示"已完成"—— 正是老板说的那种"他会以为被敷衍了"。
       *
       * 另外：有未处理完的售后时，定时任务那边会跳过（`decideAutoComplete`）。
       */
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
        customerId: order.customerId,
        itemCodes: deliveryItems.map((item) => item.code),
      };
    });

    /**
     * 站内消息（2026-10-18 加）。
     *
     * ## 为什么在这时候发
     *
     * 交付是顾客最需要知道的一件事 —— 而且顾客不一定点了订阅消息的"允许"，
     * 那时候订阅消息根本发不出去，且**失败不报错**。
     * 站内消息是唯一"一定送得到"的渠道。
     *
     * ## 为什么在事务**外面**发
     *
     * 消息写失败不该回滚已经完成的交付 —— 食谱已经交出去了，
     * 因为一条通知没写成功就把交易回滚，是本末倒置。
     * `CustomerMessageService.send` 内部已经吞掉异常并打日志。
     *
     * ## 为什么正文不写食谱名之外的细节
     *
     * 消息只存"一句摘要 + 一个指针"，点进去现查。
     * 存副本的话，重新交付之后旧消息会跟实际不一致。
     */
    await this.customerMessages
      ?.send({
        customerId: result.customerId,
        category: 'DELIVERY',
        title:
          result.version > 1
            ? `你的专属食谱已重新交付（第 ${result.version} 版）`
            : '你的专属食谱已交付',
        body: `${result.recipeName} 已交付，点开看完整食谱。`,
        linkType: 'DELIVERY',
        // 指向**订单**而不是交付记录：重新交付后顾客仍应落到最新那版
        linkId: result.orderId,
      })
      .catch(() => false);

    return result;
  }

  /**
   * 一次性交付 N 份食谱（多份购买 · 第二阶段，2026-10-21）。
   *
   * 与 `deliver()` 的分工：
   *   · `deliver()` 仍走老的单份交付表，供老订单 / 老页面 / 重新交付使用；
   *   · `deliverBatch()` 只做**首次整批交付**：把 N 份食谱连同各自的内容快照
   *     写进 `CustomRecipeDeliveryBatch` + `CustomRecipeDeliveryItem`。
   *
   * 为什么整批必须在一个事务里：少一份都不行 —— 批次头建了、明细只写了一半，
   * 顾客会看到「买了 5 份只收到 2 份」。事务保证要么全有、要么全无。
   *
   * 订单上的 `recipeId` 只写**第一份**：它是老页面 / 老接口仍在读的兼容字段，
   * 不代表「这张单只有一份」。
   */
  async deliverBatch(input: {
    orderIdOrId: string;
    recipeIds: string[];
    deliveredBy: string;
    /** 便于测试注入 */
    now?: Date;
  }): Promise<{
    orderId: string;
    batchId: string;
    version: number;
    deliveredAt: Date;
    /** 自动完成闹钟：now + 售后窗口天数（与老 deliver 同源） */
    autoCompleteAt: Date | null;
    recipeCount: number;
    recipes: Array<{
      recipeId: string;
      recipeName: string;
      itemCodes: string[];
    }>;
    legacyRecipeId: string;
  }> {
    const now = input.now ?? new Date();
    const order = await this.resolveOrder(input.orderIdOrId);

    /**
     * 只允许首次交付。重新交付（DELIVERED / COMPLETED）暂不做 ——
     * 一张多份订单要重新交付时，涉及「替换哪几份、旧批次怎么标记」，
     * 那是下一个切片的事，不能在这里顺手放开。
     */
    this.assertBatchDeliverable(order.status);

    const expectedCount = order.recipeQuantity ?? 1;
    /**
     * 份数是从库里读的；万一数据损坏成 0 / 负数，不能让它走到
     * `recipes[0].id` 那里炸成 TypeError —— 给一句能定位问题的 400。
     */
    if (!Number.isInteger(expectedCount) || expectedCount <= 0) {
      throw new BadRequestException(
        `该订单的份数配置异常（${expectedCount}），无法交付；请检查订单数据`,
      );
    }
    const requestedIds = Array.isArray(input.recipeIds) ? input.recipeIds : [];

    if (requestedIds.length !== expectedCount) {
      throw new BadRequestException(
        `本单需要交付 ${expectedCount} 份食谱，实际提供了 ${requestedIds.length} 份；` +
          '多份订单必须一次性交齐，不能少交也不能多交',
      );
    }

    if (new Set(requestedIds).size !== requestedIds.length) {
      throw new BadRequestException(
        '同一道食谱不能在一个批次里重复交付，请为每一份选择不同的食谱',
      );
    }

    /**
     * 逐份取食谱并校验归属：复用 `resolveRecipe`，守住
     * 「只能是这张订单的顾客 + 狗狗的私密食谱」这条边界。
     */
    const recipes = await Promise.all(
      requestedIds.map((recipeIdOrBizId) =>
        this.resolveRecipe(recipeIdOrBizId, order),
      ),
    );

    /**
     * 同一道食谱可能用「业务 id」和「主键」各传一次 —— 两个字符串不同，
     * 但落库是同一道食谱。这里按解析后的主键再查一次重。
     */
    if (new Set(recipes.map((recipe) => recipe.id)).size !== recipes.length) {
      throw new BadRequestException(
        '同一道食谱不能在一个批次里重复交付，请为每一份选择不同的食谱',
      );
    }

    /**
     * ★ 一道食谱只能对应一张定制单（N 份都要查）。
     *
     * `resolveRecipe` 里的占用检查看的是 `custom_recipe_order.recipe_id` ——
     * 但那一列只记得住第一份。第二份及以后是通过批次明细交付的，老检查看不到，
     * 不补这一查就会把同一道食谱重复卖给两张单。
     *
     * 不加全局唯一约束：重新交付（同单新版本）是合法需求，约束会把它挡死。
     */
    const occupiedItem = await this.prisma.customRecipeDeliveryItem.findFirst({
      where: {
        recipeId: { in: recipes.map((recipe) => recipe.id) },
        batch: { orderId: { not: order.id } },
      },
      select: {
        recipeId: true,
        recipe: { select: { name: true } },
        batch: { select: { orderId: true } },
      },
    });

    if (occupiedItem) {
      throw new BadRequestException(
        `食谱「${occupiedItem.recipe?.name ?? occupiedItem.recipeId}」` +
          `已经交付给另一张定制单（${occupiedItem.batch?.orderId ?? '未知订单'}），` +
          '一道定制食谱只能对应一张定制单，不能重复交付',
      );
    }

    const dog = await this.resolveDogForSnapshot(order.dogId);

    /** 每份各自生成快照 —— 共用一个就等于「只交了一份，却告诉顾客交了两份」 */
    const prepared = await Promise.all(
      recipes.map(async (recipe) => {
        const snapshot = await this.buildSnapshot({
          order,
          recipe,
          dog,
          now,
          cycleDays: null,
        });
        return {
          recipe,
          snapshot,
          itemCodes: await this.configuredItemCodes(snapshot),
        };
      }),
    );

    /**
     * 自动完成闹钟 —— 与老 `deliver()` **同一个来源**（售后窗口天数）。
     *
     * 不设的话，多份订单交付后会永远停在 DELIVERED：顾客不点「确认收到」
     * 就没人把它推到 COMPLETED，售后窗口也永远不会关闭。
     */
    const autoCompleteDays = await this.getAutoCompleteDays();
    const autoCompleteAt =
      autoCompleteDays > 0
        ? new Date(now.getTime() + autoCompleteDays * 24 * 60 * 60 * 1000)
        : null;

    return this.prisma.$transaction(async (tx) => {
      /** 同一订单的批次交付串行化。 */
      await tx.$queryRaw`
        SELECT id FROM "custom_recipe_order" WHERE id = ${order.id} FOR UPDATE
      `;
      /** 版本号 = 该订单已有批次数 + 1；唯一索引兜底防并发重号 */
      const existingCount = await tx.customRecipeDeliveryBatch.count({
        where: { orderId: order.id },
      });
      const version = existingCount + 1;

      const batch = await tx.customRecipeDeliveryBatch.create({
        data: {
          orderId: order.id,
          version,
          deliveredBy: input.deliveredBy,
          deliveredAt: now,
          /**
           * 只标记「待通知」，**不在这里发**：
           * 通知渠道与文案由后续控制器 / 定时任务决定，
           * 交付动作本身不该依赖消息服务是否可用。
           */
          notifyStatus: 'PENDING',
        },
      });

      await tx.customRecipeDeliveryItem.createMany({
        data: prepared.map(({ recipe, snapshot, itemCodes }, sortOrder) => ({
          batchId: batch.id,
          recipeId: recipe.id,
          recipeVersion: recipe.version,
          contentSnapshot: snapshot as unknown as object,
          items: itemCodes,
          sortOrder,
          feedingParams: snapshot.feeding as unknown as object,
        })),
      });

      /**
       * 老字段兼容：只写第一份。
       * 尚未改造的后台 / 顾客端仍从 `order.recipeId` 取「那份食谱」；
       * 不写会让它们显示空，而多份又放不下（老外键只有一列）。
       */
      await tx.customRecipeOrder.update({
        where: { id: order.id },
        data: {
          status: CustomRecipeStatus.DELIVERED,
          deliveredAt: now,
          recipeId: recipes[0].id,
          autoCompleteAt,
        },
      });

      return {
        orderId: order.orderId,
        batchId: batch.id,
        version,
        deliveredAt: now,
        autoCompleteAt,
        recipeCount: prepared.length,
        recipes: prepared.map(({ recipe, itemCodes }) => ({
          recipeId: recipe.recipeId,
          recipeName: recipe.name,
          itemCodes,
        })),
        legacyRecipeId: recipes[0].id,
      };
    });
  }

  /**
   * 按选中份重新交付（多份购买 · 第三阶段售后，2026-10-21）。
   *
   * ## 与 `deliverBatch` / `deliver` 的分工
   *
   *   · `deliverBatch()` 只做首次整批交付；
   *   · `deliver()` 仍走老的单份交付表，供老订单 / 老页面使用；
   *   · 这个方法只服务**多份订单的售后改稿**：顾客只对其中几份不满意，
   *     营养师改完那几份后，只刷新那几份的内容，其余份原样带过去。
   *
   * ## 为什么新批次仍然包含**全部**份
   *
   * 批次表达的是「这一单这一版交付了哪几份」。如果只写被选中的 2 份，
   * 顾客下次打开订单会看到「买了 3 份只剩 2 份」，售后记录指向的旧明细
   * 也会从最新批次里消失。所以新批次 = 最新批次的全集：
   *   · 选中的份 → 用**当前食谱**重新生成快照；
   *   · 未选中的份 → 原样复制旧批次的快照 / 交付物 / 喂食参数 / 食谱版本。
   *
   * ## 通知不在这里发
   *
   * 与 `deliverBatch` 同一口径：批次只标记 `notifyStatus = PENDING`，
   * 由控制器决定发几条、发什么。服务层不依赖消息渠道是否可用。
   */
  async redeliverBatchItems(input: {
    orderIdOrId: string;
    /** 要重新生成快照的交付明细 id（`CustomRecipeDeliveryItem.id`） */
    deliveryItemIds: string[];
    deliveredBy: string;
    /** 便于测试注入 */
    now?: Date;
  }): Promise<{
    orderId: string;
    batchId: string;
    version: number;
    deliveredAt: Date;
    autoCompleteAt: Date | null;
    /** 新批次一共几份（含未选中的复制项） */
    recipeCount: number;
    /** 本次刷新了快照的那几份（旧的交付明细 id，按入参顺序） */
    selectedItemIds: string[];
    /** 选中份的摘要 —— 控制器用它取第一份的业务编号发通知 */
    selectedRecipes: Array<{
      deliveryItemId: string;
      /** 食谱业务编号（不是主键） */
      recipeId: string;
      recipeName: string;
      itemCodes: string[];
    }>;
    /** 订单上兼容老页面的 `recipeId`（新批次第一份的主键） */
    legacyRecipeId: string;
  }> {
    const now = input.now ?? new Date();
    const order = await this.resolveOrder(input.orderIdOrId);

    /**
     * 只允许**已经交付过**的订单（DELIVERED / COMPLETED）。
     *
     * 为什么不能直接复用 `assertBatchDeliverable`：那个守卫显式拒绝
     * DELIVERED / COMPLETED —— 它是给首次整批交付用的，重新交付正是从
     * 这两个状态出发。这里反过来：先挡掉还没交付的状态，再让状态机兜底。
     */
    this.assertBatchRedeliverable(order.status);

    const selectedIds = this.resolveRedeliverItemIds(input.deliveryItemIds);

    /** 最新批次 = 版本号最高的一批；重新交付基于它派生下一版 */
    const latestBatch = await this.prisma.customRecipeDeliveryBatch.findFirst({
      where: { orderId: order.id },
      orderBy: { version: 'desc' },
      select: {
        id: true,
        version: true,
        items: {
          select: {
            id: true,
            recipeId: true,
            recipeVersion: true,
            contentSnapshot: true,
            items: true,
            feedingParams: true,
          },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        },
      },
    });

    if (!latestBatch) {
      throw new BadRequestException(
        '这张订单还没有多份交付批次，不能按份重新交付',
      );
    }
    if (latestBatch.items.length === 0) {
      throw new BadRequestException(
        '这张订单的交付批次没有明细，无法重新交付，请联系技术处理',
      );
    }

    /**
     * 选中的必须是**最新批次**里的明细。
     *
     * 不能用 `findMany({ id: { in } })` 反查：那会把别的订单、或本单更早
     * 批次里的明细也放进来 —— 顾客已经看过的旧版本不该被售后重刷。
     */
    const latestById = new Map(
      latestBatch.items.map((item) => [item.id, item]),
    );
    const unknownIds = selectedIds.filter((id) => !latestById.has(id));
    if (unknownIds.length > 0) {
      throw new BadRequestException(
        '选中的食谱不在本次交付里，请刷新页面后重新选择',
      );
    }

    const dog = await this.resolveDogForSnapshot(order.dogId);

    /**
     * 只给选中的份重新生成快照。
     *
     * 走的是与首次交付**完全同一条** `buildSnapshot` 路径：喂食量、采购量、
     * 营养数据都在后端重算，不允许前端传一份"新快照"上来。
     */
    const refreshed = new Map<
      string,
      {
        recipeRowId: string;
        recipeId: string;
        recipeName: string;
        recipeVersion: number;
        snapshot: DeliveryContentSnapshot;
        itemCodes: string[];
      }
    >();

    await Promise.all(
      selectedIds.map(async (deliveryItemId) => {
        const item = latestById.get(deliveryItemId)!;
        /**
         * 售后改稿会创建新 Recipe 版本，并把这个交付明细 id 记在
         * OrderRecipeDesign.revisionDeliveryItemId。重新交付时必须用新行，
         * 不能再用旧批次里的 recipeId —— 否则顾客永远看不到改后的内容。
         */
        const revision = await this.prisma.orderRecipeDesign.findFirst({
          where: {
            orderId: order.id,
            revisionDeliveryItemId: deliveryItemId,
            recipeId: { not: null },
          },
          select: { recipeId: true },
        });
        const recipe = await this.resolveRecipe(
          revision?.recipeId ?? item.recipeId,
          order,
        );
        const snapshot = await this.buildSnapshot({
          order,
          recipe,
          dog,
          now,
          cycleDays: null,
        });
        const itemCodes = await this.configuredItemCodes(snapshot);

        refreshed.set(deliveryItemId, {
          recipeRowId: recipe.id,
          recipeId: recipe.recipeId,
          recipeName: recipe.name,
          recipeVersion: recipe.version,
          snapshot,
          itemCodes,
        });
      }),
    );

    /**
     * 新批次的明细 = 最新批次的**全集**，顺序保持不变。
     * 选中的用刚生成的快照；未选中的逐字段复制，一个都不重算。
     */
    const preparedItems = latestBatch.items.map((item) => {
      const fresh = refreshed.get(item.id);
      if (fresh) {
        return {
          recipeId: fresh.recipeRowId,
          recipeVersion: fresh.recipeVersion,
          contentSnapshot: fresh.snapshot as unknown as Prisma.InputJsonValue,
          items: fresh.itemCodes as unknown as Prisma.InputJsonValue,
          feedingParams:
            fresh.snapshot.feeding as unknown as Prisma.InputJsonValue,
        };
      }

      return {
        recipeId: item.recipeId,
        recipeVersion: item.recipeVersion,
        contentSnapshot: toInputJson(item.contentSnapshot),
        items: toInputJson(item.items),
        /**
         * `feedingParams` 可空：库里是 SQL NULL 就继续写 NULL，
         * 不要写成 JSON `null`（读出来会从"没算"变成"算了个空"）。
         */
        feedingParams:
          item.feedingParams === null
            ? Prisma.DbNull
            : (item.feedingParams as Prisma.InputJsonValue),
      };
    });

    /** 自动完成闹钟与首次交付同源：now + 售后窗口天数 */
    const autoCompleteDays = await this.getAutoCompleteDays();
    const autoCompleteAt =
      autoCompleteDays > 0
        ? new Date(now.getTime() + autoCompleteDays * 24 * 60 * 60 * 1000)
        : null;

    /**
     * 版本号在事务内、锁住订单行后再确定，避免两个处理人同时
     * 按同一个 latestBatch 派生同一版本。
     */
    /**
     * 老字段兼容：取**新批次第一份**，与 `deliverBatch` 同一口径。
     * 老页面 / 老接口只认这一列，它代表"这张单的那份食谱"，不代表只有一份。
     */
    const legacyRecipeId =
      preparedItems[0]?.recipeId ?? latestBatch.items[0].recipeId;

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT id FROM "custom_recipe_order" WHERE id = ${order.id} FOR UPDATE
      `;
      const currentLatest = await tx.customRecipeDeliveryBatch.findFirst({
        where: { orderId: order.id },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      if ((currentLatest?.version ?? 0) !== latestBatch.version) {
        throw new ConflictException(
          '这笔订单刚刚被其他人重新交付过，请刷新后重试',
        );
      }
      const version = latestBatch.version + 1;
      const batch = await tx.customRecipeDeliveryBatch.create({
        data: {
          orderId: order.id,
          version,
          deliveredBy: input.deliveredBy,
          deliveredAt: now,
          /** 只标记待通知；发几条、发什么由控制器决定 */
          notifyStatus: 'PENDING',
        },
      });

      await tx.customRecipeDeliveryItem.createMany({
        data: preparedItems.map((item, sortOrder) => ({
          batchId: batch.id,
          sortOrder,
          ...item,
        })),
      });

      /**
       * 与老 `deliver()` / `deliverBatch()` 一样走状态机时间戳：
       * `deliveredAt` 由 `timestampFieldFor` 决定，避免这里手写字段名。
       */
      const timestampField = timestampFieldFor(CustomRecipeStatus.DELIVERED);
      await tx.customRecipeOrder.update({
        where: { id: order.id },
        data: {
          status: CustomRecipeStatus.DELIVERED,
          recipeId: legacyRecipeId,
          ...(timestampField ? { [timestampField]: now } : {}),
          autoCompleteAt,
        },
      });

      return {
        orderId: order.orderId,
        batchId: batch.id,
        version,
        deliveredAt: now,
        autoCompleteAt,
        recipeCount: preparedItems.length,
        selectedItemIds: selectedIds,
        /** 摘要按**入参顺序**给：通知要落在顾客刚选的第一份上 */
        selectedRecipes: selectedIds.map((deliveryItemId) => {
          const fresh = refreshed.get(deliveryItemId)!;
          return {
            deliveryItemId,
            recipeId: fresh.recipeId,
            recipeName: fresh.recipeName,
            itemCodes: fresh.itemCodes,
          };
        }),
        legacyRecipeId,
      };
    });
  }

  /**
   * 顾客确认收到。
   *
   * 幂等：重复点不会报错，也不会把时间刷新成第二次点的时间
   * （"什么时候确认的"是售后窗口的起算依据，不能被刷新）。
   *
   * ## 多份批次（2026-10-21）
   *
   * 多份订单整批交付时**不写老的单份交付表**，所以不能先找老记录 ——
   * 那会让多份订单的确认收到直接 404。这里先看有没有交付批次：
   * 有就确认**整批**（一次确认代表 N 份全部收到），没有才走老的单份路径。
   * `deliveryId` 是多份功能之前就有的入参，传了它仍按老路径处理。
   */
  async confirmReceipt(input: {
    orderIdOrId: string;
    deliveryId?: string;
    channel?: 'CUSTOMER' | 'AUTO';
    now?: Date;
  }): Promise<{ confirmed: boolean; alreadyConfirmed: boolean }> {
    const now = input.now ?? new Date();
    const order = await this.resolveOrder(input.orderIdOrId);

    if (!input.deliveryId) {
      const batch = await this.prisma.customRecipeDeliveryBatch.findFirst({
        where: { orderId: order.id },
        orderBy: { version: 'desc' },
        select: { id: true, confirmedAt: true },
      });

      if (batch) {
        if (batch.confirmedAt) {
          return { confirmed: true, alreadyConfirmed: true };
        }

        this.assertOrderConfirmable(order.status);

        return this.prisma.$transaction(async (tx) => {
          await tx.customRecipeDeliveryBatch.update({
            where: { id: batch.id },
            data: {
              confirmedAt: now,
              confirmChannel: input.channel ?? 'CUSTOMER',
            },
          });

          await this.markOrderCompleted(tx, order.id, now);

          return { confirmed: true, alreadyConfirmed: false };
        });
      }
    }

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

    this.assertOrderConfirmable(order.status);

    return this.prisma.$transaction(async (tx) => {
      await tx.customRecipeDelivery.update({
        where: { id: delivery.id },
        data: {
          confirmedAt: now,
          confirmChannel: input.channel ?? 'CUSTOMER',
        },
      });

      await this.markOrderCompleted(tx, order.id, now);

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

  /**
   * 顾客视角取交付内容（批次 2.4）。
   *
   * 与 `getCurrent` 的区别：这个用**订单主键**（调用方已经从订单详情那边
   * 做过归属校验了），并且支持按版本号回看历史 —— 重新交付之后，
   * 顾客与客服都可能要翻回上一版看"当时给的是什么"。
   */
  async findForCustomer(input: {
    orderId: string;
    version?: number | null;
  }) {
    if (input.version) {
      return this.prisma.customRecipeDelivery.findFirst({
        where: { orderId: input.orderId, version: input.version },
      });
    }
    return this.prisma.customRecipeDelivery.findFirst({
      where: { orderId: input.orderId, replacedByDeliveryId: null },
      orderBy: { version: 'desc' },
    });
  }

  /**
   * 订单详情用：取某订单**最新交付批次**的摘要（2026-10-21 · 顾客交付切片）。
   *
   * 与 `findBatchForCustomer` 的区别：**不取内容快照** ——
   * 快照几十 KB，而详情页只需要「交了哪几份、各叫什么、包含哪些交付物」。
   * 老订单没有批次，返回 null，调用方保持原来的 `delivery` 字段不变。
   */
  async findLatestBatchForOrder(orderId: string) {
    return this.prisma.customRecipeDeliveryBatch.findFirst({
      where: { orderId },
      orderBy: { version: 'desc' },
      select: {
        id: true,
        version: true,
        deliveredAt: true,
        confirmedAt: true,
        items: {
          select: {
            id: true,
            items: true,
            recipe: {
              select: { recipeId: true, name: true, coverImageUrl: true },
            },
          },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        },
      },
    });
  }

  /**
   * 顾客视角取交付批次内容（含每份快照 · 2026-10-21）。
   *
   * 只有多份整批交付的订单才有批次；老订单返回 null，
   * 调用方回落到 `findForCustomer` 的单份响应 —— **老接口形状一个字都不变**。
   *
   * `version` 与老接口同义：不传取最新一批，传了取指定批次（当前只会有第 1 批）。
   */
  async findBatchForCustomer(input: {
    orderId: string;
    version?: number | null;
  }) {
    return this.prisma.customRecipeDeliveryBatch.findFirst({
      where: {
        orderId: input.orderId,
        ...(input.version ? { version: input.version } : {}),
      },
      orderBy: { version: 'desc' },
      select: {
        id: true,
        version: true,
        deliveredAt: true,
        confirmedAt: true,
        items: {
          select: {
            id: true,
            items: true,
            contentSnapshot: true,
            recipe: {
              select: { recipeId: true, name: true, coverImageUrl: true },
            },
          },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        },
      },
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

  /**
   * 从交付记录解析「交付那一刻的版本」（2026-10-24 · 定制交付页重构）。
   *
   * 顾客从交付页点「自己做」或「订购成品」时，必须看到**交付给他的那一版**，
   * 而不是设计器里后来改出的最新版（后台改配方不会自动挂到已交付的单上）。
   *
   * 规则：
   *   · 订单必须属于当前顾客，否则返回 null（不泄露"有没有交付"）；
   *   · 多份批次先查明细，老单份交付再查 `custom_recipe_delivery`；
   *   · 查不到就返回 null —— 调用方返回 404，**绝不回退最新版**。
   */
  async resolveDeliveredRecipeVersion(input: {
    orderNo: string;
    recipeBusinessId: string;
    customerId: string;
  }): Promise<{ version: number; source: 'BATCH' | 'SINGLE' } | null> {
    const orderNo = String(input.orderNo ?? '').trim();
    const recipeBusinessId = String(input.recipeBusinessId ?? '').trim();
    const customerId = String(input.customerId ?? '').trim();
    if (!orderNo || !recipeBusinessId || !customerId) return null;

    const order = await this.prisma.customRecipeOrder.findUnique({
      where: { orderId: orderNo },
      select: { id: true, customerId: true },
    });
    if (!order || order.customerId !== customerId) return null;

    const batchItem = await this.prisma.customRecipeDeliveryItem.findFirst({
      where: {
        batch: { orderId: order.id },
        recipe: { recipeId: recipeBusinessId },
      },
      orderBy: { createdAt: 'desc' },
      select: { recipeVersion: true },
    });
    if (batchItem) {
      return { version: batchItem.recipeVersion, source: 'BATCH' };
    }

    const single = await this.prisma.customRecipeDelivery.findFirst({
      where: {
        orderId: order.id,
        recipe: { recipeId: recipeBusinessId },
      },
      orderBy: { version: 'desc' },
      select: { recipeVersion: true },
    });
    if (single && typeof single.recipeVersion === 'number') {
      return { version: single.recipeVersion, source: 'SINGLE' };
    }

    return null;
  }

  // ==================== 内部 ====================

  /**
   * 批量交付的状态守卫：只允许首次交付。
   *
   * 先挡住「已经交付过」——`assertTransition` 允许 `DELIVERED → DELIVERED`
   * （老的重新交付要用），而多份批次的重新交付还没实现；
   * 再让状态机判定这次流转是否合法，最后把领域层的英文错误翻成人话。
   */
  private assertBatchDeliverable(status: CustomRecipeStatus): void {
    if (
      status === CustomRecipeStatus.DELIVERED ||
      status === CustomRecipeStatus.COMPLETED
    ) {
      throw new BadRequestException('该订单已经交付过，暂不支持重新交付');
    }

    try {
      assertTransition(status, CustomRecipeStatus.DELIVERED);
    } catch (error) {
      throw new BadRequestException(
        status === CustomRecipeStatus.PENDING_PAYMENT
          ? '该订单还没确认收款，不能交付'
          : status === CustomRecipeStatus.CANCELLED
            ? '该订单已取消，不能交付'
            : error instanceof Error
              ? error.message
              : '该订单当前状态不能批量交付',
      );
    }
  }

  /**
   * 按份重新交付的状态守卫：只允许**已经交付过**的订单。
   *
   * DELIVERED / COMPLETED 都放过：售后改稿后重交正是从这两处出发
   * （`COMPLETED → DELIVERED` 是状态机里专门为售后回退保留的一条）。
   *
   * 其余状态先让状态机判定 —— 但注意 `PAID / IN_PROGRESS → DELIVERED`
   * 在状态机里是**合法的首次交付**，这个方法却必须拒绝：没有已交付批次
   * 就谈不上"按选中份重交"。所以状态机放行之后还要显式补一刀。
   */
  private assertBatchRedeliverable(status: CustomRecipeStatus): void {
    if (
      status === CustomRecipeStatus.DELIVERED ||
      status === CustomRecipeStatus.COMPLETED
    ) {
      return;
    }

    try {
      assertTransition(status, CustomRecipeStatus.DELIVERED);
    } catch (error) {
      throw new BadRequestException(
        status === CustomRecipeStatus.PENDING_PAYMENT
          ? '该订单还没确认收款，不能交付'
          : status === CustomRecipeStatus.CANCELLED
            ? '该订单已取消，不能交付'
            : error instanceof Error
              ? error.message
              : '该订单当前状态不能重新交付',
      );
    }

    throw new BadRequestException(
      '该订单还没有交付过，没有可以按份重新交付的食谱',
    );
  }

  /**
   * 解析「要重交哪几份」。
   *
   * 与售后提交时的 `parseDeliveryItemIds` 不同：售后允许"没传 = 整单"，
   * 这里**必须明确选**至少一份 —— 不选就不知道要刷新哪份快照。
   * 重复 id 也直接拒绝（售后那边是去重），否则同一份会被生成两次快照，
   * 落库时撞 `@@unique([batchId, recipeId])`。
   */
  private resolveRedeliverItemIds(raw: unknown): string[] {
    if (!Array.isArray(raw) || raw.length === 0) {
      throw new BadRequestException(
        '请选择要重新交付的食谱（deliveryItemIds 不能为空）',
      );
    }
    if (raw.length > MAX_REDELIVER_ITEM_COUNT) {
      throw new BadRequestException(
        `一次最多重新交付 ${MAX_REDELIVER_ITEM_COUNT} 份食谱`,
      );
    }

    const ids = raw.map((value) =>
      typeof value === 'string' ? value.trim() : '',
    );
    if (ids.some((id) => id.length === 0)) {
      throw new BadRequestException(
        'deliveryItemIds 必须是非空字符串数组，请重新选择要调整的食谱',
      );
    }
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException(
        '同一份食谱不能重复选择，请检查后再提交',
      );
    }

    return ids;
  }

  /**
   * 确认收到的状态守卫（老单份交付 / 多份批次**共用同一套口径**）。
   *
   * 抽出来是多份切片的顺手收益：批次路径若不先过这一步，
   * 就会出现「老订单按状态机拦、多份订单什么状态都能确认」的分叉。
   */
  private assertOrderConfirmable(status: CustomRecipeStatus): void {
    if (status === CustomRecipeStatus.CANCELLED) {
      throw new BadRequestException('订单已取消，不需要确认收到');
    }

    try {
      assertTransition(status, CustomRecipeStatus.COMPLETED);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : '当前状态不能确认收到',
      );
    }
  }

  /**
   * 确认收到 = 订单转「已完成」并清掉自动完成闹钟。
   *
   * 老单份与多份批次共用这一段，避免两处各写一遍状态写入
   * （GD-01 源码守卫按 `customRecipeOrder.update` 计数，重复写会直接超基线）。
   */
  private async markOrderCompleted(
    tx: Prisma.TransactionClient,
    orderId: string,
    now: Date,
  ): Promise<void> {
    const timestampField = timestampFieldFor(CustomRecipeStatus.COMPLETED);
    await tx.customRecipeOrder.update({
      where: { id: orderId },
      data: {
        status: CustomRecipeStatus.COMPLETED,
        ...(timestampField ? { [timestampField]: now } : {}),
        /** 完成后清掉闹钟，免得定时任务一直扫到这张单 */
        autoCompleteAt: null,
      },
    });
  }

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
        /** 多份订单的应交付份数；老订单在库里默认 1（2026-10-21） */
        recipeQuantity: true,
      },
    });
    if (!order) {
      throw new NotFoundException(`定制订单不存在: ${orderIdOrId}`);
    }
    return order;
  }

  /**
   * 取狗狗档案（快照要用）· 2026-10-18
   *
   * 交付那一刻把档案抄进快照 —— 顾客事后改了体重/生日，
   * "当时是照着什么做的"还能查回来。
   *
   * 取不到不报错：狗删了不该让交付失败，封面少一行字而已。
   */
  private async resolveDogForSnapshot(dogId: string) {
    try {
      const dog = await this.prisma.dog.findUnique({
        where: { id: dogId },
        select: {
          name: true,
          birthday: true,
          currentWeightKg: true,
          customBreedName: true,
          breedId: true,
        },
      });
      if (!dog) return null;
      // Dog 与 DogBreed 没有 Prisma 关联（只有 breedId），所以单独查一次
      const breed = dog.breedId
        ? await this.prisma.dogBreed.findUnique({
            where: { id: dog.breedId },
            select: { name: true },
          })
        : null;
      return {
        name: dog.name ?? null,
        // 自己填的品种优先（"中华田园犬"这类词表里可能没有）
        breedName: dog.customBreedName ?? breed?.name ?? null,
        birthday: dog.birthday ?? null,
        currentWeightKg:
          dog.currentWeightKg === null ? null : Number(dog.currentWeightKg),
      };
    } catch (error) {
      console.warn('[CustomRecipeDelivery] 读取狗狗档案失败，封面将不含狗信息：', error);
      return null;
    }
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
          include: {
            ingredient: true,
            supplementAlternatives: {
              include: { alternativeIngredient: true },
              orderBy: { sortOrder: 'asc' },
            },
          },
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
     * 复用会让两单共用一份产出，交付记录也就分不清属于哪一单。
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
      /** 一句话卖点（交付第 1 页封面下方那句）· 2026-10-18 */
      sellingPoint: string | null;
      /** 旧版单段制作步骤（DIY 卡片兼容） */
      productionSteps: string | null;
      /** 结构化制作步骤（顾客交付页优先） */
      productionStepsJson: unknown;
      /** 核心营养 8 项（蛋白质/脂肪/…/钙磷比）· 2026-10-18 */
      nutritionDetailedData: unknown;
      items: Array<{
        ratioPercent: number | null;
        exampleWeight: number | null;
        preparationMethod: string | null;
        /** 补剂营养素目标（钙/锌/…）· 2026-10-18 */
        supplementTargets: unknown;
        /** 补剂可替换产品（2026-10-23） */
        supplementAlternatives?: Array<{
          alternativeIngredient: {
            id: string;
            name: string;
            brand: string | null;
            productModel: string | null;
            unitDisplayLabel: string | null;
            properties: unknown;
          } | null;
        }> | null;
        /**
         * `resolveRecipe` 用的是 `include: { ingredient: true }` ——
         * 运行时**一直都有 `id`**，只是此前类型里没写（2026-10-18 补）。
         */
        ingredient: { id: string; name: string; type: string } | null;
      }>;
    };
    /** 狗狗档案：封面要叠品种/年龄/体重 · 2026-10-18 */
    dog: {
      name: string | null;
      breedName: string | null;
      birthday: Date | null;
      currentWeightKg: number | null;
    } | null;
    now: Date;
    cycleDays: number | null;
  }): Promise<DeliveryContentSnapshot> {
    const energyDensity = Number(input.recipe.energyDensityKcalPerKg);

    /**
     * 制备方法在 RecipeItem 里存的是字典 id；交付快照给顾客看的是名称。
     * 不解析的话，采购页「制备方法」列会直接显示 UUID。
     */
    const preparationIds = [
      ...new Set(
        input.recipe.items
          .map((item) => item.preparationMethod)
          .filter((value): value is string => Boolean(value)),
      ),
    ];
    const preparationNameMap = new Map<string, string>();
    if (preparationIds.length > 0) {
      const methods = await this.prisma.preparationMethod.findMany({
        where: { id: { in: preparationIds } },
        select: { id: true, name: true },
      });
      for (const method of methods) {
        preparationNameMap.set(method.id, method.name);
      }
    }

    const items: SnapshotRecipeItem[] = input.recipe.items.map((item) => ({
      name: item.ingredient?.name ?? '未知食材',
      // 2026-10-18：补剂/食材 id 进快照，第 2 页的购买入口要用它建下单行
      ingredientId: item.ingredient?.id ?? null,
      preparation: item.preparationMethod
        ? preparationNameMap.get(item.preparationMethod) ??
          item.preparationMethod
        : null,
      ratioPercent:
        item.ratioPercent === null ? null : Number(item.ratioPercent),
      weightG:
        item.exampleWeight === null ? null : Number(item.exampleWeight),
      // 枚举原样透传，不在这一层压缩成布尔 —— 压成布尔会丢掉 PACKAGING
      ingredientType: item.ingredient?.type ?? null,
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
    /**
     * 这批的总净重（克）—— 补剂总量要用它换算。
     *
     * 注意：这里**只算一次**，不用等 `buildShoppingList` 的结果，
     * 因为补剂总量与"每种食材多少克"无关，只跟总量有关。
     * 取不到就是 0，`sumSupplementTotalG` 会把 0 当成"不知道"。
     */
    const shoppingTotalNetG =
      feeding.dailyIntakeG !== null && feeding.cycleDays !== null
        ? feeding.dailyIntakeG * feeding.cycleDays
        : 0;

    const supplements: SnapshotSupplement[] = items
      .filter((item) => item.isSupplement)
      .map((item, index) => {
        /**
         * 补剂的营养素目标从**原始 item** 取（快照里的 items 已经丢了关联）。
         * 用 index 对齐：两边都按 `input.recipe.items` 的同序过滤而来。
         */
        const source = input.recipe.items.filter(
          (raw) => raw.ingredient?.type === 'SUPPLEMENT',
        )[index];
        const perKgG =
          item.ratioPercent === null || item.ratioPercent === undefined
            ? null
            : item.ratioPercent * 10;
        return {
          name: item.name,
          ingredientId: item.ingredientId ?? source?.ingredient?.id ?? null,
          /**
           * 这一批要备多少（2026-10-18 补上）。
           *
           * `perKgG` 是"每 kg 食材加多少克"，乘上这批的总净重就是总量 ——
           * **后端算，前端不乘**（硬边界：所有计算在后端）。
           * 总净重取不到时给 null，不给 0（0 会被读成"不用加"）。
           */
          totalG: sumSupplementTotalG(perKgG, shoppingTotalNetG),
          perKgG,
          brand: null,
          timing: item.preparation,
          targets: toSnapshotSupplementTargets(source?.supplementTargets),
          alternatives: (source?.supplementAlternatives ?? [])
            .map((alternative) => alternative.alternativeIngredient)
            .filter((ingredient): ingredient is NonNullable<typeof ingredient> =>
              Boolean(ingredient?.id),
            )
            .map((ingredient) => {
              const properties =
                ingredient.properties &&
                typeof ingredient.properties === 'object'
                  ? (ingredient.properties as Record<string, unknown>)
                  : {};
              const rawLink = properties.purchase_link as
                | { url?: unknown; platform?: unknown }
                | undefined;
              const purchaseUrl =
                rawLink && typeof rawLink.url === 'string'
                  ? rawLink.url.trim()
                  : '';
              return {
                ingredientId: ingredient.id,
                name: ingredient.name,
                brand: ingredient.brand,
                productModel: ingredient.productModel,
                imageUrl:
                  typeof properties.image_url === 'string'
                    ? properties.image_url
                    : null,
                purchaseLink: purchaseUrl
                  ? {
                      url: purchaseUrl,
                      platform:
                        typeof rawLink?.platform === 'string'
                          ? rawLink.platform
                          : null,
                    }
                  : null,
                displayUnit: ingredient.unitDisplayLabel,
              };
            }),
        };
      });

    const structuredSteps = readProductionSteps(input.recipe.productionStepsJson);
    const steps =
      structuredSteps.length > 0
        ? structuredSteps.map((step) => formatProductionStepsText([step]))
        : input.recipe.productionSteps
          ? input.recipe.productionSteps
              .split(/\r?\n/)
              .map((line) => line.trim())
              .filter(Boolean)
          : [];

    return buildDeliverySnapshot({
      recipe: {
        recipeId: input.recipe.recipeId,
        name: input.recipe.name,
        // 2026-10-18：封面下方那句话 + 封面要叠的狗信息
        sellingPoint: input.recipe.sellingPoint ?? null,
        coverImageUrl: input.recipe.coverImageUrl,
        internalId: input.recipe.id,
        items,
      },
      dog: toSnapshotDog(input.dog),
      feeding,
      nutrition: {
        standard: input.recipe.nutritionStandard,
        energyDensityKcalPerKg: Number.isFinite(energyDensity)
          ? energyDensity
          : null,
        // 2026-10-18：核心营养 8 项（交付第 1 页的 4×2 网格）
        macros: toSnapshotMacros(input.recipe.nutritionDetailedData),
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
      steps,
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

  /**
   * 交付后多久自动变「已完成」（天）。
   *
   * **2026-10-18 改为读「售后窗口」**，不再读 `autoCompleteDays`。
   *
   * 为什么：`autoCompleteDays` 是旧机制"顾客不点确认收到就自动完成"的参数，
   * 已被 V12 取消。现在「已完成」的含义是**售后窗口关闭**
   * （需求 2.5.5："交付后满 7 天，系统自动变"），
   * 所以天数必须跟售后窗口**同一个来源** —— 否则改了一个另一个不改，两边对不上。
   *
   * 取不到时回落到 7（与 schema 默认值一致），**不回落 3**。
   */
  private async getAutoCompleteDays(): Promise<number> {
    try {
      const config = await this.configService.getConfig();
      const value = Number(config.aftersaleWindowDays);
      return Number.isInteger(value) && value > 0 ? value : 7;
    } catch {
      return 7;
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

/**
 * 一次重新交付最多刷新几份。
 *
 * 与后台「批量交付」的业务硬上限**同一个数**（`MAX_BATCH_RECIPE_QUANTITY = 5`）。
 * 服务层也要有一份：控制器可以被绕过（内部调用 / 将来的定时任务），
 * 上限不能只写在 HTTP 层。
 */
const MAX_REDELIVER_ITEM_COUNT = 5;

/**
 * 复制旧批次的 JSON 字段到新批次。
 *
 * 库里 `contentSnapshot` / `items` 都是非空 Json 列，但历史数据里可能存过
 * JSON `null`。直接透传 `null` 会被 Prisma 当成"没给值"而报错，
 * 所以显式换成 `Prisma.JsonNull`（写 JSON null，不是 SQL NULL）。
 */
function toInputJson(
  value: Prisma.JsonValue,
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value === null
    ? Prisma.JsonNull
    : (value as Prisma.InputJsonValue);
}

function positiveOrNull(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : null;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

// ==================== 快照补传字段的转换（2026-10-18）====================

/**
 * 核心营养 8 项 —— 从 `Recipe.nutritionDetailedData` 里挑出**交付第 1 页要显示的**那些。
 *
 * 为什么只挑 8 项：完整的营养评估有几百项、几十 KB，
 * 那是"报告页"按需再查的东西，不该塞进每一条交付记录。
 *
 * ⚠️ 缺失就给 null，不给 0 —— `0%` 和"没算"是两回事。
 */
function toSnapshotMacros(
  detailed: unknown,
): Record<string, number | null> | null {
  if (!detailed || typeof detailed !== 'object') return null;
  const source = detailed as Record<string, unknown>;
  const pick = (key: string): number | null => {
    const value = source[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  };
  const macros = {
    proteinPercent: pick('proteinPercent'),
    fatPercent: pick('fatPercent'),
    ashPercent: pick('ashPercent'),
    moisturePercent: pick('moisturePercent'),
    crudeFiberPercent: pick('crudeFiberPercent'),
    carbohydratePercent: pick('carbohydratePercent'),
    energyDensityKcalPerKg: pick('energyDensityKcalPerKg'),
    calciumPhosphorusRatio: pick('calciumPhosphorusRatio'),
  };
  // 全空等于没算 —— 不要给前端一个"8 个 null"的块
  const hasAny = Object.values(macros).some((value) => value !== null);
  return hasAny ? macros : null;
}

/**
 * 补剂的营养素目标。
 *
 * 库里 `RecipeItem.supplementTargets` 是 JSON 数组，
 * 元素形如 `{ fieldPath, label, targetValuePerKg, unit }`。
 * 这里**只留渲染要的三个字段** —— `fieldPath` 是内部路由用的，顾客不该看到。
 */
function toSnapshotSupplementTargets(
  raw: unknown,
): Array<{ label: string; targetValuePerKg: number | null; unit: string | null }> {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item) => ({
      label: typeof item.label === 'string' ? item.label : '',
      targetValuePerKg:
        typeof item.targetValuePerKg === 'number' &&
        Number.isFinite(item.targetValuePerKg)
          ? item.targetValuePerKg
          : null,
      unit: typeof item.unit === 'string' ? item.unit : null,
    }))
    .filter((item) => item.label.length > 0);
}

/**
 * 狗狗档案 → 快照。
 *
 * 年龄存**月数**而不是"3 岁"：文案是渲染层的事，后端只存事实。
 * 生日缺失时给 null，不猜。
 */
function toSnapshotDog(
  dog:
    | {
        name: string | null;
        breedName: string | null;
        birthday: Date | null;
        currentWeightKg: number | null;
      }
    | null
    | undefined,
): {
  name: string | null;
  breedName: string | null;
  ageMonths: number | null;
  weightKg: number | null;
} | null {
  if (!dog) return null;
  let ageMonths: number | null = null;
  if (dog.birthday instanceof Date && Number.isFinite(dog.birthday.getTime())) {
    const now = new Date();
    ageMonths = Math.max(
      0,
      (now.getFullYear() - dog.birthday.getFullYear()) * 12 +
        (now.getMonth() - dog.birthday.getMonth()),
    );
  }
  return {
    name: dog.name ?? null,
    breedName: dog.breedName ?? null,
    ageMonths,
    weightKg:
      typeof dog.currentWeightKg === 'number' &&
      Number.isFinite(dog.currentWeightKg)
        ? dog.currentWeightKg
        : null,
  };
}

/**
 * 补剂这一批要备多少克。
 *
 * `perKgG`（每 kg 食材加多少克）× 总净重（kg）。
 * 任一缺失就给 null —— **不给 0**：0 会被读成"这次不用加"，
 * 而 null 会被渲染成「—」，顾客知道那是"没算出来"。
 */
function sumSupplementTotalG(
  perKgG: number | null,
  totalNetG: number,
): number | null {
  if (perKgG === null || !Number.isFinite(perKgG)) return null;
  if (!Number.isFinite(totalNetG) || totalNetG <= 0) return null;
  const total = (perKgG * totalNetG) / 1000;
  return Math.round(total * 10) / 10;
}