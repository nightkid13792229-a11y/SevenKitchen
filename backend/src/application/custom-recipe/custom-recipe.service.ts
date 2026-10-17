/**
 * Custom Recipe Service
 * Business logic for custom recipe orders
 */

import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma.service';
import { TencentCosService } from '../../infrastructure/services/tencent-cos.service';
import {
  CustomRecipeOrderQuery,
  ICustomRecipeRepository,
  CreateCustomRecipeOrderDTO,
  UpdateCustomRecipeOrderDTO,
} from '../../domain/custom-recipe/custom-recipe.repository';
import { CustomRecipeConfigService } from './custom-recipe-config.service';
import {
  assertTransition,
  suggestSubStage,
  timestampFieldFor,
} from '../../domain/custom-recipe/custom-recipe.state';
import {
  defaultWeekdayRules,
  resolveDay,
  type ResolvedDay,
  type WeekdayRule,
} from '../../domain/custom-recipe/custom-recipe.calendar';
import {
  CustomRecipeAftersaleStatus,
  CustomRecipeStatus,
  TargetGoal,
  CustomAttachmentType,
} from '@prisma/client';
import {
  addWorkDays,
  isPublicHoliday,
  getPublicHolidaysForYear,
  parseYYYYMMDD,
} from '../../utils/date-helpers';
import { TimezoneUtil } from '../../utils/timezone.util';
import { WechatService } from '../../infrastructure/wechat/wechat.service';

@Injectable()
export class CustomRecipeService implements ICustomRecipeRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cosService: TencentCosService,
    private readonly configService: CustomRecipeConfigService,
    /**
     * 微信订阅消息（2026-09-28）。
     *
     * 顾客**自己付款**时也要通知他 —— 此前只有客服在后台点「确认收款」才发，
     * 顾客付完钱什么都没收到。声明为可选，避免影响既有测试的构造签名。
     */
    @Optional()
    private readonly wechatService?: WechatService,
  ) {}

  /**
   * 自动排期的防呆上限的**兜底值**（2026-10-04）。
   *
   * 连续这么多天都排不上就明确报错，而不是无声地一直往后找。
   * 正常 1~2 天内必然有空位。
   *
   * 2026-10-16（批次 1.4）：真正取值改从后台配置读（`resolveScheduleLookaheadDays`）——
   * 这个常量只作为配置读不到时的兜底。下同。
   */
  private static readonly FALLBACK_SCHEDULE_LOOKAHEAD_DAYS = 45;

  /** 并发抢名额的重试次数的**兜底值**：抢输一次就换下一天，最多换这么多天 */
  private static readonly FALLBACK_SLOT_BOOKING_ATTEMPTS = 5;

  /**
   * 生成订单号：`<前缀>YYYYMMDDXXXX`。
   *
   * 前缀原先写死 'CR'，2026-10-16（批次 1.4）改为从后台配置读。
   */
  private async generateOrderId(): Promise<string> {
    const prefix = await this.resolveOrderNoPrefix();
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const random = Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, '0');
    return `${prefix}${year}${month}${day}${random}`;
  }

  /**
   * 生成一个库中不存在的订单号。
   *
   * 日期 + 4 位随机数，当天最多 1 万个组合；而 orderId 是 unique 列，
   * 原先**没有任何重试** —— 撞号时顾客看到的是数据库唯一约束错误（500）。
   * 这里先查再返回，最多试 10 次。
   */
  private async generateUniqueOrderId(): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const candidate = await this.generateOrderId();
      const existing = await this.prisma.customRecipeOrder.findUnique({
        where: { orderId: candidate },
        select: { id: true },
      });

      if (!existing) {
        return candidate;
      }
    }

    throw new ConflictException('订单号生成失败，请稍后重试');
  }

  /**
   * Calculate estimated delivery date (配置的工作日数，遇公众假期顺延)
   */
  private async calculateDeliveryDate(
    scheduledDate: Date,
    workDays: number,
  ): Promise<Date> {
    return await addWorkDays(scheduledDate, workDays);
  }

  /**
   * 校验这只狗确实属于当前顾客。
   *
   * 2026-09-28 修复的安全问题：提交定制单原先**完全不校验归属** ——
   * 任何登录顾客只要知道别人的 dogId，就能拿别人的狗下定制单；
   * 而提交时又会把顾客填的过敏/疾病写回那只狗的档案（syncToHealthProfile），
   * 等于任何人都能往别人家狗的医疗档案里写过敏和疾病。
   *
   * 两个 id 都比对：登录签发的 token 里 customerId 与 userId 取值相同，
   * 这里仍留出容错，避免以后两者分家时把正常顾客挡在门外。
   */
  private async assertDogOwnership(
    customerId: string,
    dogId: string,
  ): Promise<void> {
    const dog = await this.prisma.dog.findFirst({
      where: { id: dogId },
      select: { id: true, ownerId: true },
    });

    if (!dog || dog.ownerId !== customerId) {
      throw new BadRequestException('狗狗不存在或无权访问');
    }
  }

  /**
   * 校验这张定制单确实属于当前顾客。
   *
   * 2026-10-04 修复越权：附件上传接口此前只校验"订单号非空"，
   * 任何登录顾客都能把文件挂到别人的定制单上；订单号不存在时还会打成 500。
   * 现在统一走这里 —— 顺带把"订单不存在"变成业务错误（resolveOrderRef 负责）。
   */
  async assertOrderOwnership(
    customerId: string,
    orderIdOrId: string,
  ): Promise<void> {
    const ref = await this.resolveOrderRef(orderIdOrId);

    const order = await this.prisma.customRecipeOrder.findUnique({
      where: { id: ref.id },
      select: { customerId: true },
    });

    if (!order || order.customerId !== customerId) {
      throw new BadRequestException('定制订单不存在或无权操作');
    }
  }

  /**
   * Create a new custom recipe order
   */
  /**
   * 提交定制单。
   *
   * 2026-10-04 两处结构性调整（老板拍板口径 1 + 修复超卖）：
   *
   * ① **日期改由系统排**：顾客传来的 scheduledDate 一律忽略（老版本小程序
   *    仍会带这个字段，留着兼容但不采信）。原来前端把它写死成"今天"，
   *    后端一旦回"该日期已约满，请选择其他日期"，顾客根本无处可选 —— 直接流失。
   *    现在从今天起找最近的空位，满了/遇假期就顺延。
   *
   * ② **抢名额改 CAS**：原来先在事务外读余量、再无条件 booked_count + 1，
   *    两个并发请求会同时看到空位、同时 +1，每日上限形同虚设。
   */
  async createOrder(data: CreateCustomRecipeOrderDTO): Promise<any> {
    // 定制费与可抵扣金额都从后台配置读取，并在下单这一刻**快照进订单**。
    // 之后后台调价只影响新提交的单，已提交的顾客额度不会被改。
    const config = await this.configService.getConfig();

    // 先确认这只狗是他的，再谈别的
    await this.assertDogOwnership(data.customerId, data.dogId);

    const capacity = config.dailyCapacity;
    /** 抢输的日子记下来跳过，避免反复撞同一天 */
    const takenDays = new Set<string>();
    /** 最多换几天重试（原写死 5，2026-10-16 起从配置读） */
    const maxAttempts = await this.resolveSlotRetryTimes();

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const scheduledDate = await this.findNextAvailableDate(
        capacity,
        takenDays,
      );

      // 连续这么多天都排不上：明确报错，不让顾客对着转圈猜
      if (!scheduledDate) break;

      const created = await this.prisma.$transaction(async (tx) => {
        const booked = await this.tryBookSlotTx(tx, scheduledDate, capacity);

        // 并发下名额被别人抢走了：本次不写任何订单，交给外层换一天重试
        if (!booked) return null;

        const estimatedDeliveryDate = await this.calculateDeliveryDate(
          scheduledDate,
          config.deliveryWorkDays,
        );

        const order = await tx.customRecipeOrder.create({
          data: {
            orderId: await this.generateUniqueOrderId(),
            customerId: data.customerId,
            dogId: data.dogId,
            targetGoal: data.targetGoal,
            needsHealthManagement: data.needsHealthManagement === true,
            allergies: data.allergies || [],
            medicalConditions: data.medicalConditions || [],
            additionalNotes: data.additionalNotes,
            preferredIngredients: data.preferredIngredients || [],
            dislikedIngredients: data.dislikedIngredients || [],
            attachments: data.attachmentUrls || [],
            scheduledDate,
            estimatedDeliveryDate,
            amount: config.feeAmount,
            creditAmount: config.creditAmount,
            status: CustomRecipeStatus.PENDING_PAYMENT,
          },
        });

        // Sync to health profile if requested
        if (data.syncToHealthProfile) {
          await this.syncToHealthProfileTx(
            tx,
            data.dogId,
            data.allergies || [],
            data.medicalConditions || [],
            // 2026-10-02 老板定：饮食偏好只在定制食谱时填 ——
            // 那这里就必须**回写档案**，否则健康管理里的偏好会一直空着/陈旧，
            // AI 健康分析与营养师侧读到的口味就是断源的。
            {
              preferredIngredients: data.preferredIngredients || [],
              dislikedIngredients: data.dislikedIngredients || [],
            },
          );
          await tx.customRecipeOrder.update({
            where: { id: order.id },
            data: { healthInfoSyncedAt: new Date() },
          });
        }

        return order;
      });

      if (created) return created;

      takenDays.add(TimezoneUtil.toShanghaiDateString(scheduledDate));
    }

    throw new ConflictException('近期定制名额已满，请稍后再试或联系客服');
  }

  /**
   * 支付时限（分钟），0 = 不自动关单。
   *
   * 2026-10-04：小程序要告诉顾客"请在 X 分钟内完成支付"，
   * 但此前这个值只存在于后台配置里，顾客完全不知道，
   * 订单被自动关掉时只会以为系统坏了。
   */
  async getPaymentTimeoutMinutes(): Promise<number> {
    const config = await this.configService.getConfig();
    return Number.isFinite(config.paymentTimeoutMinutes)
      ? config.paymentTimeoutMinutes
      : 0;
  }

  /**
   * Get order by ID
   */
  async getOrderById(id: string): Promise<any | null> {
    return await this.prisma.customRecipeOrder.findUnique({
      where: { id },
    });
  }

  /**
   * Get order by orderId
   *
   * 必须带上 dog / recipe / attachmentsRecords：
   * 顾客端订单详情与后台详情都要读这些关联，之前没 include，
   * 调用方访问 order.dog.name 会直接抛 TypeError（500）。
   */
  async getOrderByOrderId(orderId: string): Promise<any | null> {
    return await this.prisma.customRecipeOrder.findUnique({
      where: { orderId },
      include: {
        dog: {
          select: {
            id: true,
            name: true,
            birthday: true,
            currentWeightKg: true,
            bcsScore: true,
            activityLevel: true,
            /**
             * 过敏（2026-10-04 第四期补）。
             *
             * 改造前这里只取了 6 个字段，订单页**看不到狗档案里的过敏**，
             * 只有顾客下单当时手填的那一份 —— 顾客后来在健康档案里
             * 更新过过敏，定制单页仍显示旧文本。
             *
             * 两个来源都带上，与设计器侧栏、健康页口径一致。
             */
            allergyFoods: true,
            allergyRecords: {
              select: { allergen: true, certainty: true, source: true },
              orderBy: { createdAt: 'asc' },
            },
            /**
             * 疾病史（2026-10-04 补）。
             *
             * 与过敏同理：订单上那份 `medicalConditions` 是顾客**下单当时**填的，
             * 顾客之后在健康档案里改了，后台订单页仍显示旧文本 ——
             * 员工可能按过期信息设计食谱。字段本来就在狗档案上，只是没取出来。
             */
            medicalHistory: true,
          },
        },
        customer: {
          select: {
            id: true,
            nickname: true,
            phone: true,
            wechatOpenid: true,
          },
        },
        recipe: {
          // recipeId（业务编号）必须带出来：小程序拿它打开食谱详情页，
          // 而详情页是按业务编号查的。id（主键）只用于后台关联。
          select: {
            id: true,
            recipeId: true,
            name: true,
            coverImageUrl: true,
          },
        },
        attachmentsRecords: true,
        /**
         * 交付记录（2026-10-16 批次 2.4）。
         *
         * 只取当前有效的那一版（`replacedByDeliveryId = null`），
         * 且只取页面要用到的字段 —— 完整快照有几十 KB，
         * 订单详情不该背着它（要看内容走交付详情接口）。
         */
        deliveries: {
          where: { replacedByDeliveryId: null },
          orderBy: { version: 'desc' },
          take: 1,
          select: {
            id: true,
            version: true,
            deliveredAt: true,
            confirmedAt: true,
            items: true,
            notifyStatus: true,
          },
        },
      },
    });
  }

  /**
   * Get orders with filters
   */
  async getOrders(
    query: CustomRecipeOrderQuery,
  ): Promise<{ orders: any[]; total: number }> {
    const where: any = {};

    if (query.customerId) {
      where.customerId = query.customerId;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.dateFrom || query.dateTo) {
      where.scheduledDate = {};
      if (query.dateFrom) {
        where.scheduledDate.gte = query.dateFrom;
      }
      if (query.dateTo) {
        where.scheduledDate.lte = query.dateTo;
      }
    }

    if (query.search) {
      where.OR = [
        { orderId: { contains: query.search, mode: 'insensitive' } },
        {
          customer: {
            nickname: { contains: query.search, mode: 'insensitive' },
          },
        },
        { dog: { name: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const page = query.page || 1;
    const pageSize = query.pageSize || 20;
    const skip = (page - 1) * pageSize;

    const [orders, total] = await Promise.all([
      this.prisma.customRecipeOrder.findMany({
        where,
        include: {
          customer: {
            select: {
              id: true,
              nickname: true,
              phone: true,
              wechatOpenid: true,
            },
          },
          dog: {
            select: {
              id: true,
              name: true,
              birthday: true,
              currentWeightKg: true,
              bcsScore: true,
              activityLevel: true,
            },
          },
          recipe: {
            // recipeId（业务编号）必须带出来：小程序拿它打开食谱详情页，
            // 而详情页是按业务编号查的。id（主键）只用于后台关联。
            select: {
              id: true,
              recipeId: true,
              name: true,
              coverImageUrl: true,
            },
          },
          attachmentsRecords: true,
          /**
           * 交付与售后（2026-10-16 批次 5.4）。
           *
           * 加它们是为了让**列表也能下发渲染契约** ——
           * 此前列表页用写死的 `status === 'DELIVERED'` 决定按钮，
           * 结果订单一变成「已完成」，列表上就再也看不到「查看定制食谱」：
           * 顾客确认收货后反而找不到自己的食谱了。
           *
           * `deliveries` 只取当前有效的那版（被替换掉的不算），
           * 因为"有没有交付""有没有待确认的交付"问的都是当前这版。
           */
          deliveries: {
            where: { replacedByDeliveryId: null },
            select: { confirmedAt: true },
          },
          aftersales: {
            where: { status: { in: ['PENDING', 'PROCESSING'] } },
            select: { id: true },
            take: 1,
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.customRecipeOrder.count({ where }),
    ]);

    return { orders, total };
  }

  /**
   * Update order
   *
   * 调用方（后台控制器）传的是**对外订单号 CR...**，不是 uuid 主键。
   * 之前直接 where:{id} 会命中不到记录（P2025），后台"确认收款/改状态/交付"
   * 三个动作全部 500。这里统一先解析成真实主键。
   */
  async updateOrder(
    orderIdOrId: string,
    data: UpdateCustomRecipeOrderDTO,
  ): Promise<any> {
    const ref = await this.resolveOrderRef(orderIdOrId);

    return await this.prisma.customRecipeOrder.update({
      where: { id: ref.id },
      data,
    });
  }

  /**
   * Update order status
   */
  /**
   * 允许的状态流转。后台「改状态」此前是一个裸写：任何状态都能改成任何状态。
   *
   * 2026-09-28 修复，三件事：
   *   1. 加了流转合法性校验（例如已交付不能退回待付款）；
   *   2. 改成「已取消」时**释放当天名额**并记录取消时间/原因 ——
   *      原先不释放，而每天只有 5 个名额，僵尸单会直接吃掉接单能力；
   *   3. 「制作中」补记 inProgressAt（这一列此前从来没被写过）。
   */
  /**
   * 合法流转表**已搬到领域层**（2026-10-16 批次 1.2）：
   * `domain/custom-recipe/custom-recipe.state.ts`。
   *
   * 搬走的原因：此前它是这里的私有常量，而**有三条路径绕过它**直接写库
   * （交付、建食谱交付、人工确认收款），于是"有校验"是假的 ——
   * 能改状态的地方有四处，被校验的只有一处。
   *
   * 现在所有改状态的地方统一走 `assertTransition`。
   */

  async updateOrderStatus(
    orderIdOrId: string,
    status: CustomRecipeStatus,
    options?: { reason?: string },
  ): Promise<void> {
    const ref = await this.resolveOrderRef(orderIdOrId);

    const order = await this.prisma.customRecipeOrder.findUnique({
      where: { id: ref.id },
      select: { id: true, status: true, scheduledDate: true },
    });

    if (!order) {
      throw new NotFoundException(`定制订单不存在: ${orderIdOrId}`);
    }

    if (order.status === status) {
      return;
    }

    /**
     * 流转校验走**领域层唯一真源**（批次 1.2）。
     * 把领域层抛的 Error 翻译成 Web 层的 400 —— 领域层不认识 Nest。
     */
    try {
      assertTransition(order.status, status);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : '订单状态不能这样变更',
      );
    }

    /**
     * 时间戳由状态机统一决定写哪个字段（批次 1.2）。
     * 此前这三个 if 散在这里，而 `inProgressAt` 曾有一段时间**从来没被写过**
     * （2026-09-28 才补上）—— 集中到 `timestampFieldFor` 就不会再漏。
     */
    const timestampField = timestampFieldFor(status);
    const subStage = suggestSubStage(status);

    await this.prisma.$transaction(async (tx) => {
      /**
       * ⚠️ 这里用了**计算属性名**（`[timestampField]`），而它会让 TypeScript 的
       * "多余属性检查"失效 —— 写一个 schema 里根本不存在的列，`tsc` **不报错**，
       * 只在运行时炸。
       *
       * 2026-10-16 实测踩到：顺手在这里写了 `autoCompleteAt: null`，
       * 而那个列属于批次 1.6（交付单）还没建，类型检查一声不吭地放过了。
       * ⇒ 往这个 data 里加字段时，**必须回 schema.prisma 确认列真的存在**。
       */
      await tx.customRecipeOrder.update({
        where: { id: order.id },
        data: {
          status,
          ...(status === CustomRecipeStatus.CANCELLED
            ? {}
            : subStage
              ? { subStage }
              : {}),
          ...(timestampField ? { [timestampField]: new Date() } : {}),
          /**
           * 完成后清掉"自动完成闹钟"（批次 1.2 加的列）——
           * 留着的话定时任务会一直扫到这张已完成的单。
           */
          ...(status === CustomRecipeStatus.COMPLETED
            ? { autoCompleteAt: null }
            : {}),
          ...(status === CustomRecipeStatus.CANCELLED
            ? {
                cancelledAt: new Date(),
                cancellationReason: options?.reason || '后台手动取消',
              }
            : {}),
        },
      });

      // 取消要把名额还回去，否则这一天就白占了（每日上限只有 5 单）
      if (status === CustomRecipeStatus.CANCELLED) {
        await tx.customRecipeSchedule.updateMany({
          where: { date: order.scheduledDate, bookedCount: { gt: 0 } },
          data: { bookedCount: { decrement: 1 } },
        });
      }
    });
  }

  /**
   * 把「对外订单号」或「uuid」统一解析成真实主键。
   * 两个都查是为了兼容既有调用方，避免再次踩到"传了友好单号却按主键查"的坑。
   */
  private async resolveOrderRef(
    orderIdOrId: string,
  ): Promise<{ id: string; orderId: string }> {
    const record = await this.prisma.customRecipeOrder.findFirst({
      where: { OR: [{ orderId: orderIdOrId }, { id: orderIdOrId }] },
      select: { id: true, orderId: true },
    });

    if (!record) {
      throw new NotFoundException(`定制订单不存在: ${orderIdOrId}`);
    }

    return record;
  }

  // ==================== 交付 ====================

  /**
   * 列出可以交付给这张定制单的食谱（后台「选择已设计好的食谱」用）。
   *
   * 2026-10-04：只列**这位顾客、这只狗**的私密定制食谱。设计器发布时会自动
   * 挂上订单号，所以最常见的候选就是"刚在设计器里做完的那一道"。
   */
  async listDeliverableRecipes(orderIdOrId: string): Promise<
    Array<{
      recipeId: string;
      name: string;
      version: number;
      updatedAt: Date;
      linkedToThisOrder: boolean;
    }>
  > {
    const ref = await this.resolveOrderRef(orderIdOrId);

    const order = await this.prisma.customRecipeOrder.findUnique({
      where: { id: ref.id },
      select: { id: true, customerId: true, dogId: true, recipeId: true },
    });

    if (!order) {
      throw new NotFoundException(`定制订单不存在: ${orderIdOrId}`);
    }

    const recipes = await this.prisma.recipe.findMany({
      where: {
        isCustomRecipe: true,
        customerOwnerId: order.customerId,
        customerDogId: order.dogId,
      },
      select: {
        id: true,
        recipeId: true,
        name: true,
        version: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    });

    return recipes.map((recipe) => ({
      recipeId: recipe.recipeId,
      name: recipe.name,
      version: recipe.version,
      updatedAt: recipe.updatedAt,
      linkedToThisOrder: recipe.id === order.recipeId,
    }));
  }

  /**
   * ⚠️ 这里原来有一个 `deliverExistingRecipe`（2026-10-16 批次 5.7 删除）。
   *
   * 它只改订单（写 recipeId + 改状态），**不留交付记录、不留内容快照**，
   * 而且**绕过状态机**。批次 2.1 起，交付一律走
   * `CustomRecipeDeliveryService.deliver()` —— 那一条会生成快照、
   * 建版本记录、走状态机、算喂食量、设自动完成闹钟。
   *
   * ## 为什么现在才删
   *
   * 它**已经没有任何生产代码在调**（只有测试还在调），
   * 而它的允许清单停在 `[已付款, 制作中, 已交付]` —— **少了「已完成」**，
   * 报错文案还是"该订单已取消，不能交付"（对一张已完成的单是句错话）。
   *
   * 死代码本身不危险，**但一条过期的规则留在那里就是个陷阱**：
   * 哪天有人想"复用一下"，就会把售后改稿后重新交付的流程挡死，
   * 而且得到的是一句驴唇不对马嘴的错误提示。
   *
   * 它原来的 8 条测试（归属校验、一食谱一单、待付款/已取消不能交付）
   * 在交付服务的测试里都有等价覆盖，所以一并删除不会丢保护。
   */

  // ==================== 支付相关 ====================

  /**
   * 微信支付回调/主动查单确认收款（幂等）。
   *
   * 幂等很重要：微信回调可能重试多次，主动查单也可能与回调同时到达。
   * 这里用条件更新（只有仍处于 PENDING_PAYMENT 才改），
   * 避免把订单从 IN_PROGRESS / DELIVERED 打回 PAID。
   */
  async confirmPaymentFromWechat(
    orderIdOrId: string,
    transactionId?: string,
  ): Promise<any> {
    const ref = await this.resolveOrderRef(orderIdOrId);

    const result = await this.prisma.customRecipeOrder.updateMany({
      where: { id: ref.id, status: CustomRecipeStatus.PENDING_PAYMENT },
      data: {
        status: CustomRecipeStatus.PAID,
        paymentConfirmedAt: new Date(),
        paymentTransactionId: transactionId || null,
      },
    });

    const order = await this.prisma.customRecipeOrder.findUnique({
      where: { id: ref.id },
      include: {
        customer: { select: { wechatOpenid: true } },
      },
    });

    const alreadyPaid = result.count === 0;

    /**
     * 顾客实际付款成功（微信回调走到这里）时也发一条通知。
     * 只在"这次真的把状态推进了"时发，避免回调重试重复打扰。
     */
    if (!alreadyPaid && order?.customer?.wechatOpenid && this.wechatService) {
      await this.wechatService
        .sendCustomRecipeOrderNotification(
          order.customer.wechatOpenid,
          order.orderId,
          'PAID',
        )
        .catch((error: any) => {
          // 通知失败不能影响支付结果落库
          console.error(
            '[CustomRecipe] 支付成功通知发送失败:',
            error?.message ?? error,
          );
        });
    }

    return { order, alreadyPaid };
  }

  /**
   * 关闭未付款的定制订单，并**释放当天占用的排期名额**。
   *
   * 不释放名额的后果：每有一张超时僵尸单，那一天的接单能力就永久少 1 个，
   * 几天之后"明明没人下单却提示约满"。
   */
  async cancelOrder(
    orderIdOrId: string,
    options: { reason: string; actorId?: string | null },
  ): Promise<{ cancelled: boolean }> {
    const ref = await this.resolveOrderRef(orderIdOrId);

    const order = await this.prisma.customRecipeOrder.findUnique({
      where: { id: ref.id },
      select: { id: true, status: true, scheduledDate: true },
    });

    if (!order) {
      throw new NotFoundException(`定制订单不存在: ${orderIdOrId}`);
    }

    if (order.status !== CustomRecipeStatus.PENDING_PAYMENT) {
      // 已付款/已交付的单不允许被自动关单悄悄改掉
      return { cancelled: false };
    }

    const result = await this.prisma.$transaction(async (tx) => {
      /**
       * 条件更新，而不是按 id 无条件改写（2026-10-04 修复"钱收了单被关"）。
       *
       * 原写法：函数开头读到"待付款"就认定可以关，事务里直接按 id 改写状态。
       * 若微信支付回调恰好在这几毫秒内把订单推成 PAID，就会被这里覆盖回 CANCELLED ——
       * 顾客钱付了、单没了、还不会退款。现在只有"此刻仍是待付款"才关得掉，
       * 抢不过回调就放弃关单（返回 cancelled: false）。
       */
      const updated = await tx.customRecipeOrder.updateMany({
        where: { id: order.id, status: CustomRecipeStatus.PENDING_PAYMENT },
        data: {
          status: CustomRecipeStatus.CANCELLED,
          cancelledAt: new Date(),
          cancellationReason: options.reason,
        },
      });

      // 没抢到 = 订单已被支付回调或别的流程改走，绝不能顺手把名额还掉
      if (updated.count === 0) {
        return { cancelled: false };
      }

      // 名额下限保护：重复关单不能让 booked_count 变成负数
      await tx.customRecipeSchedule.updateMany({
        where: { date: order.scheduledDate, bookedCount: { gt: 0 } },
        data: { bookedCount: { decrement: 1 } },
      });

      return { cancelled: true };
    });

    return result;
  }

  /**
   * 顾客自助取消（老板拍板的决策 12 + Q2）。
   *
   * 口径：
   *   · 只要**还没开始制作**就能取消 —— 即"待付款"和"已付款"两个状态；
   *   · 已付款的全额原路退回微信，不需要客服先确认；
   *   · 已开始制作/已交付的不能自助取消（要走客服）；
   *   · 取消一律释放当天接单名额。
   *
   * 退款由调用方（控制器）注入，避免这里直接依赖支付服务形成环。
   */
  async cancelOrderByCustomer(
    orderIdOrId: string,
    customerId: string,
    refund: (orderId: string, reason: string) => Promise<{ status: string }>,
    reason = '顾客取消定制订单',
  ): Promise<{ cancelled: boolean; refundStatus: string | null }> {
    const ref = await this.resolveOrderRef(orderIdOrId);

    const order = await this.prisma.customRecipeOrder.findUnique({
      where: { id: ref.id },
      select: {
        id: true,
        orderId: true,
        customerId: true,
        status: true,
        scheduledDate: true,
      },
    });

    if (!order) {
      throw new NotFoundException(`定制订单不存在: ${orderIdOrId}`);
    }

    if (order.customerId !== customerId) {
      throw new BadRequestException('无权操作此订单');
    }

    const cancellable: CustomRecipeStatus[] = [
      CustomRecipeStatus.PENDING_PAYMENT,
      CustomRecipeStatus.PAID,
    ];

    if (!cancellable.includes(order.status)) {
      throw new BadRequestException(
        order.status === CustomRecipeStatus.IN_PROGRESS
          ? '订单已开始制作，无法自助取消，请联系客服'
          : '该订单当前状态无法取消',
      );
    }

    let refundStatus: string | null = null;

    /**
     * ① 先**认领**这次取消（CAS），拿到的一方才有权动名额与退款。
     *
     * 2026-10-04 修复两件事：原写法在事务里按 id 无条件改写状态，于是
     *   · "顾客连点两次取消"或"顾客取消 + 定时关单同时到"会把名额**重复释放**，
     *     每日上限被悄悄放大；
     *   · 若订单在被读成 PAID 之后、改写之前被后台推进到"制作中"，
     *     这一刀会把制作中的订单覆盖成已取消。
     * 现在只有抢到状态迁移的那一方继续往下走。
     */
    const claimed = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.customRecipeOrder.updateMany({
        where: { id: order.id, status: order.status },
        data: {
          status: CustomRecipeStatus.CANCELLED,
          cancelledAt: new Date(),
          cancellationReason: reason,
        },
      });

      if (updated.count === 0) return false;

      // 释放当天名额（每日上限只有 5 单）
      await tx.customRecipeSchedule.updateMany({
        where: { date: order.scheduledDate, bookedCount: { gt: 0 } },
        data: { bookedCount: { decrement: 1 } },
      });

      return true;
    });

    if (!claimed) {
      // 抢输说明它已被别处取消（定时关单/重复点击）：名额与退款都不能再动一次
      const latest = await this.prisma.customRecipeOrder.findUnique({
        where: { id: order.id },
        select: { status: true },
      });

      return {
        cancelled: latest?.status === CustomRecipeStatus.CANCELLED,
        refundStatus: null,
      };
    }

    /**
     * ② 已付款的再退款。退款失败就**把取消回滚**，
     * 避免"取消了钱没退"这种最糟的结果。
     *
     * 回滚是安全的：CANCELLED 是终态，我们刚认领成功，期间不会有别的流程改动它。
     */
    if (order.status === CustomRecipeStatus.PAID) {
      try {
        const result = await refund(order.orderId, reason);
        refundStatus = result?.status ?? null;
      } catch (error) {
        await this.prisma.$transaction(async (tx) => {
          await tx.customRecipeOrder.updateMany({
            where: { id: order.id, status: CustomRecipeStatus.CANCELLED },
            data: {
              status: CustomRecipeStatus.PAID,
              cancelledAt: null,
              cancellationReason: null,
            },
          });

          // 名额也还回去：取消时释放了，回滚就得重新占上
          await tx.customRecipeSchedule.updateMany({
            where: { date: order.scheduledDate },
            data: { bookedCount: { increment: 1 } },
          });
        });

        throw error;
      }
    }

    return { cancelled: true, refundStatus };
  }

  /**
   * 找出超过支付时限仍未付款的定制订单（供定时任务关单）
   */
  async findExpiredUnpaidOrders(
    timeoutMinutes: number,
  ): Promise<Array<{ id: string; orderId: string; createdAt: Date }>> {
    if (!Number.isFinite(timeoutMinutes) || timeoutMinutes <= 0) {
      return [];
    }

    const deadline = new Date(Date.now() - timeoutMinutes * 60 * 1000);

    return await this.prisma.customRecipeOrder.findMany({
      where: {
        status: CustomRecipeStatus.PENDING_PAYMENT,
        createdAt: { lt: deadline },
      },
      select: { id: true, orderId: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  // ==================== 抵扣额度台账 ====================

  /**
   * 额度可用状态：**付款之后**才产生抵扣能力。
   * 待付款的定制单还没给钱，不能拿去抵成品货款。
   */
  private static readonly CREDIT_USABLE_STATUSES: CustomRecipeStatus[] = [
    CustomRecipeStatus.PAID,
    CustomRecipeStatus.IN_PROGRESS,
    CustomRecipeStatus.DELIVERED,
  ];

  /** 金额按分对齐，避免浮点误差把额度算成 0.30000000000000004 */
  private roundMoney(value: number): number {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  }

  /**
   * 查这位顾客在**这道定制食谱**上还有多少可用额度。
   *
   * 额度绑定它产出的那道食谱，避免拿一张定制单去抵别的现成食谱。
   * `CustomRecipeOrder.recipeId` 是唯一的，所以一道食谱最多对应一张定制单。
   *
   * ⚠️ 两边的「食谱 ID」不是同一个东西，必须归一化，否则永远匹配不上：
   *   - 下单链路传进来的是**业务食谱号**（`Recipe.recipeId`，形如 13f28dfe-…），
   *     因为 `recipeRepository.findById` 是按 `recipeId` 查的
   *   - 定制单上存的是**食谱主键**（`Recipe.id`），因为它有指向 recipe 表的外键
   * 这里先把业务食谱号解析成主键，两个都带上做匹配，兼容直接传主键的调用方。
   *
   * 返回 null 表示没有可用额度（没定制过 / 未付款 / 已用完）。
   */
  async findUsableCredit(params: {
    customerId: string;
    recipeId: string;
  }): Promise<{
    customRecipeOrderId: string;
    orderId: string;
    remaining: number;
  } | null> {
    if (!params.customerId || !params.recipeId) return null;

    const recipeRecord = await this.prisma.recipe.findMany({
      where: { recipeId: params.recipeId },
      select: { id: true },
    });

    /**
     * 候选主键必须覆盖**这道食谱的所有版本**。
     *
     * 2026-09-28 修复：定制订单存的是**交付那一刻**那一版的主键。
     * 原先这里只取"当前最新版"的主键，于是食谱一旦升到第 2 版
     * （营养师改一个字就会升版），订单里存的 v1 主键就再也匹配不上，
     * 顾客那 ¥150 抵扣**静默失效**，客服和顾客都不会知道。
     * 业务编号本身也一并作为候选，兼容早期没有主键的历史数据。
     */
    const candidateRecipeIds = Array.from(
      new Set(
        [...recipeRecord.map((row) => row.id), params.recipeId].filter(
          (value): value is string => Boolean(value),
        ),
      ),
    );

    const order = await this.prisma.customRecipeOrder.findFirst({
      where: {
        customerId: params.customerId,
        recipeId: { in: candidateRecipeIds },
        status: { in: CustomRecipeService.CREDIT_USABLE_STATUSES },
      },
      select: {
        id: true,
        orderId: true,
        creditAmount: true,
        creditUsed: true,
      },
    });

    if (!order) return null;

    const remaining = this.roundMoney(
      Number(order.creditAmount) - Number(order.creditUsed),
    );
    if (remaining <= 0) return null;

    return {
      customRecipeOrderId: order.id,
      orderId: order.orderId,
      remaining,
    };
  }

  /**
   * 扣减额度（下单成品时调用）。
   *
   * 并发安全：用「读到的 credit_used 原值」做条件更新（CAS）。
   * 两个请求同时读到同一个旧值时，只有一个能改成功，另一个重读重试；
   * 这样永远不会把额度扣超。
   */
  async consumeCredit(input: {
    orderIdOrId: string;
    amount: number;
  }): Promise<{ consumed: number; remaining: number }> {
    const requested = this.roundMoney(input.amount);
    if (!Number.isFinite(requested) || requested <= 0) {
      return { consumed: 0, remaining: 0 };
    }

    const ref = await this.resolveOrderRef(input.orderIdOrId);

    for (let attempt = 0; attempt < 3; attempt++) {
      const record = await this.prisma.customRecipeOrder.findUnique({
        where: { id: ref.id },
        select: { creditAmount: true, creditUsed: true, status: true },
      });

      if (!record) {
        throw new NotFoundException(`定制订单不存在: ${input.orderIdOrId}`);
      }

      if (
        !CustomRecipeService.CREDIT_USABLE_STATUSES.includes(
          record.status as CustomRecipeStatus,
        )
      ) {
        throw new BadRequestException('该定制订单当前状态不可用于抵扣');
      }

      const total = Number(record.creditAmount);
      const used = Number(record.creditUsed);
      const remaining = this.roundMoney(total - used);

      if (remaining <= 0) {
        return { consumed: 0, remaining: 0 };
      }

      const consumed = this.roundMoney(Math.min(requested, remaining));

      const updated = await this.prisma.customRecipeOrder.updateMany({
        where: { id: ref.id, creditUsed: used },
        data: { creditUsed: this.roundMoney(used + consumed) },
      });

      if (updated.count === 1) {
        return { consumed, remaining: this.roundMoney(remaining - consumed) };
      }
      // 额度被并发改过：重读再试
    }

    throw new ConflictException('抵扣额度正在被其它订单使用，请重试');
  }

  /**
   * 归还额度（后台人工处理退款时使用）。
   *
   * 不传 amount 表示"把已用的全部还回去"。
   * 同样用 CAS 更新，并钳制在 [0, creditAmount] 区间内，不会把额度还超。
   */
  async restoreCredit(input: {
    orderIdOrId: string;
    amount?: number;
  }): Promise<{ restored: number; remaining: number }> {
    const ref = await this.resolveOrderRef(input.orderIdOrId);

    for (let attempt = 0; attempt < 3; attempt++) {
      const record = await this.prisma.customRecipeOrder.findUnique({
        where: { id: ref.id },
        select: { creditAmount: true, creditUsed: true },
      });

      if (!record) {
        throw new NotFoundException(`定制订单不存在: ${input.orderIdOrId}`);
      }

      const total = Number(record.creditAmount);
      const used = Number(record.creditUsed);

      if (used <= 0) {
        return { restored: 0, remaining: this.roundMoney(total) };
      }

      const restore =
        input.amount === undefined
          ? this.roundMoney(used)
          : this.roundMoney(Math.min(Math.max(input.amount, 0), used));

      if (restore <= 0) {
        return { restored: 0, remaining: this.roundMoney(total - used) };
      }

      const nextUsed = this.roundMoney(used - restore);

      const updated = await this.prisma.customRecipeOrder.updateMany({
        where: { id: ref.id, creditUsed: used },
        data: { creditUsed: nextUsed },
      });

      if (updated.count === 1) {
        return { restored: restore, remaining: this.roundMoney(total - nextUsed) };
      }
    }

    throw new ConflictException('抵扣额度正在被使用，请稍后重试');
  }

  /** 读取某张定制单的额度总览（后台展示与「恢复额度」回显用） */
  async getCreditSummary(orderIdOrId: string): Promise<{
    orderId: string;
    creditAmount: number;
    creditUsed: number;
    creditRemaining: number;
  }> {
    const ref = await this.resolveOrderRef(orderIdOrId);

    const record = await this.prisma.customRecipeOrder.findUnique({
      where: { id: ref.id },
      select: { orderId: true, creditAmount: true, creditUsed: true },
    });

    if (!record) {
      throw new NotFoundException(`定制订单不存在: ${orderIdOrId}`);
    }

    const total = Number(record.creditAmount);
    const used = Number(record.creditUsed);

    return {
      orderId: record.orderId,
      creditAmount: this.roundMoney(total),
      creditUsed: this.roundMoney(used),
      creditRemaining: this.roundMoney(Math.max(0, total - used)),
    };
  }

  /**
   * Get statistics
   */
  async getStatistics(filters?: any): Promise<any> {
    const where: any = {};
    if (filters?.dateFrom) {
      where.createdAt = { ...where.createdAt, gte: filters.dateFrom };
    }
    if (filters?.dateTo) {
      where.createdAt = { ...where.createdAt, lte: filters.dateTo };
    }

    const [pendingPayment, inProgress, delivered, orders, pendingAftersale] =
      await Promise.all([
      this.prisma.customRecipeOrder.count({
        where: { ...where, status: CustomRecipeStatus.PENDING_PAYMENT },
      }),
      this.prisma.customRecipeOrder.count({
        where: { ...where, status: CustomRecipeStatus.IN_PROGRESS },
      }),
      this.prisma.customRecipeOrder.count({
        where: { ...where, status: CustomRecipeStatus.DELIVERED },
      }),
      /**
       * 收入口径：**已经收到的钱**。
       *
       * 2026-09-28 修复：原先只统计"已交付"，于是已付款/制作中的单不计收入，
       * 后台金额系统性偏低。定制费是下单即付的，收款发生在前两个状态。
       */
      this.prisma.customRecipeOrder.findMany({
        where: {
          ...where,
          status: {
            in: [
              CustomRecipeStatus.PAID,
              CustomRecipeStatus.IN_PROGRESS,
              CustomRecipeStatus.DELIVERED,
            ],
          },
        },
        select: { amount: true },
      }),
      /**
       * 待售后（2026-10-18 加）。
       *
       * 老板定的两档待办之一。口径：**未处理完的售后单**数量 ——
       * 排除 RESOLVED（已完成）与 WITHDRAWN（顾客撤回）。
       *
       * 注意**不受日期范围过滤**：一单半个月前提交、现在还没处理，
       * 它今天仍然是待办。按创建日期筛掉它等于把漏掉的事藏起来。
       */
      this.prisma.customRecipeAftersale.count({
        where: {
          status: {
            in: [
              CustomRecipeAftersaleStatus.PENDING,
              CustomRecipeAftersaleStatus.ACCEPTED,
              CustomRecipeAftersaleStatus.PROCESSING,
            ],
          },
        },
      }),
    ]);

    const totalRevenue = orders.reduce(
      (sum, order) => sum + Number(order.amount),
      0,
    );

    return {
      pendingPayment,
      inProgress,
      delivered,
      totalRevenue,
      /** 两档待办（2026-10-18）：待交付 = inProgress，待售后 = pendingAftersale */
      pendingAftersale,
    };
  }

  /**
   * 按星期的排期规则（批次 4.2）。
   *
   * 一次取全部七条，调用方在内存里查 —— 否则算一个月的日历时
   * 要查 30 次库。
   *
   * 取不到（表还没配）时返回**空表**，由领域层退回"按全局配置全周开放"。
   * 这里**不替老板决定"周日休息"** —— 默认值是一种主张，
   * 他哪天想周日接单却发现约不上、又不知道为什么，那才是麻烦。
   */
  private async resolveWeekdayRules(): Promise<Map<number, WeekdayRule>> {
    try {
      const rows = await this.prisma.customRecipeWeekdayRule.findMany();
      const map = new Map<number, WeekdayRule>();
      for (const row of rows) {
        map.set(row.weekday, {
          weekday: row.weekday,
          isOpen: row.isOpen,
          capacity: row.capacity,
          deliveryCapacity: row.deliveryCapacity,
          note: row.note,
        });
      }
      return map;
    } catch {
      return new Map();
    }
  }

  /**
   * 算某一天的真实状态（批次 4.2）。
   *
   * 三层优先级：具体某天 > 按星期规则 > 全局配置。
   * 判定本身在领域层（`resolveDay`），这里只负责取数。
   */
  async resolveDayStatus(
    date: Date,
    options?: {
      weekdayRules?: Map<number, WeekdayRule>;
      defaultCapacity?: number;
      defaultDeliveryCapacity?: number;
    },
  ): Promise<ResolvedDay> {
    const [config, rules] = await Promise.all([
      this.configService.getConfig(),
      options?.weekdayRules
        ? Promise.resolve(options.weekdayRules)
        : this.resolveWeekdayRules(),
    ]);

    const override = await this.prisma.customRecipeSchedule.findUnique({
      where: { date },
    });

    return resolveDay({
      date,
      override: override
        ? {
            isAvailable: override.isAvailable,
            capacity: override.capacity,
            bookedCount: override.bookedCount,
            deliveryCapacity: override.deliveryCapacity,
            deliveryCount: override.deliveryCount,
            isPublicHoliday: override.isPublicHoliday,
          }
        : null,
      weekdayRule: rules.get(date.getDay()) ?? null,
      defaultCapacity:
        options?.defaultCapacity ?? (Number(config.dailyCapacity) || 4),
      defaultDeliveryCapacity:
        options?.defaultDeliveryCapacity ??
        (Number(config.dailyDeliveryCapacity) || 4),
    });
  }

  /**
   * 取按星期的排期规则（后台用）。
   *
   * 库里没配时**返回默认值并标 `isDefault`** —— 不落库，
   * 免得仅仅因为后台打开了一次页面，就替老板"决定"了七天规则。
   */
  async getWeekdayRules(): Promise<
    Array<WeekdayRule & { isDefault: boolean }>
  > {
    const [config, rules] = await Promise.all([
      this.configService.getConfig(),
      this.resolveWeekdayRules(),
    ]);

    const defaultCapacity = Number(config.dailyCapacity) || 4;
    const defaultDeliveryCapacity = Number(config.dailyDeliveryCapacity) || 4;

    if (rules.size === 0) {
      return defaultWeekdayRules(defaultCapacity, defaultDeliveryCapacity).map(
        (rule) => ({ ...rule, isDefault: true }),
      );
    }

    return Array.from({ length: 7 }, (_, weekday) => {
      const rule = rules.get(weekday);
      return rule
        ? { ...rule, isDefault: false }
        : {
            weekday,
            isOpen: true,
            capacity: defaultCapacity,
            deliveryCapacity: defaultDeliveryCapacity,
            note: null,
            isDefault: true,
          };
    });
  }

  /** 保存按星期的排期规则（整体覆盖七条） */
  async saveWeekdayRules(
    items: Array<{
      weekday: number;
      isOpen: boolean;
      capacity?: number | null;
      deliveryCapacity?: number | null;
      note?: string | null;
    }>,
  ): Promise<{ saved: number }> {
    const valid = (items ?? []).filter(
      (item) =>
        Number.isInteger(item.weekday) &&
        item.weekday >= 0 &&
        item.weekday <= 6,
    );

    if (valid.length === 0) {
      throw new BadRequestException('至少要有一条规则');
    }

    for (const item of valid) {
      if (
        item.capacity !== null &&
        item.capacity !== undefined &&
        (!Number.isInteger(item.capacity) ||
          item.capacity < 1 ||
          item.capacity > 200)
      ) {
        throw new BadRequestException(
          `周${item.weekday}的接单上限必须是 1~200 的整数`,
        );
      }
      if (
        item.deliveryCapacity !== null &&
        item.deliveryCapacity !== undefined &&
        (!Number.isInteger(item.deliveryCapacity) ||
          item.deliveryCapacity < 1 ||
          item.deliveryCapacity > 200)
      ) {
        throw new BadRequestException(
          `周${item.weekday}的交付上限必须是 1~200 的整数`,
        );
      }
    }

    /**
     * 逐条 upsert，**不删没传的**。
     *
     * 后台页总是传满七条，但万一将来有别的调用方只传改过的那几条，
     * 删掉其余的会把没动的规则弄丢 —— upsert 更安全。
     */
    await this.prisma.$transaction(
      valid.map((item) =>
        this.prisma.customRecipeWeekdayRule.upsert({
          where: { weekday: item.weekday },
          update: {
            isOpen: item.isOpen,
            capacity: item.capacity ?? null,
            deliveryCapacity: item.deliveryCapacity ?? null,
            note: item.note ?? null,
          },
          create: {
            weekday: item.weekday,
            isOpen: item.isOpen,
            capacity: item.capacity ?? null,
            deliveryCapacity: item.deliveryCapacity ?? null,
            note: item.note ?? null,
          },
        }),
      ),
    );

    return { saved: valid.length };
  }

  /**
   * 每日接单上限来自后台配置（原为写死的 4）
   */
  private async resolveDailyCapacity(): Promise<number> {
    const config = await this.configService.getConfig();
    return config.dailyCapacity;
  }

  /**
   * 从配置里读一个正整数，读不到就用兜底值。
   *
   * ⚠️ **为什么不能只判 catch**（2026-10-16 踩到的，坏了 5 条排期测试）：
   * 只 try/catch 的话，"配置取到了、但**字段是 undefined**"（配置表还没升级、
   * 或调用方只传了部分字段）会把 undefined 当成 0 天往下走 ——
   * 排期循环一次都不执行，顾客直接看到「近期名额已满」这种莫名其妙的错。
   */
  private async resolvePositiveIntFromConfig(
    read: (
      config: Awaited<ReturnType<CustomRecipeConfigService['getConfig']>>,
    ) => unknown,
    fallback: number,
  ): Promise<number> {
    try {
      const config = await this.configService.getConfig();
      const value = Number(read(config));
      return Number.isInteger(value) && value > 0 ? value : fallback;
    } catch {
      /**
       * 配置读不到也不能拦住下单：排期是下单链路的一环，
       * 退回兜底值继续跑，总比让顾客下不了单好。
       */
      return fallback;
    }
  }

  /**
   * 排期往前找多少天（原为写死的 45）· 批次 1.4
   */
  private resolveScheduleLookaheadDays(): Promise<number> {
    return this.resolvePositiveIntFromConfig(
      (config) => config.scheduleLookaheadDays,
      CustomRecipeService.FALLBACK_SCHEDULE_LOOKAHEAD_DAYS,
    );
  }

  /** 占位冲突时最多换几天重试（原为写死的 5）· 批次 1.4 */
  private resolveSlotRetryTimes(): Promise<number> {
    return this.resolvePositiveIntFromConfig(
      (config) => config.slotRetryTimes,
      CustomRecipeService.FALLBACK_SLOT_BOOKING_ATTEMPTS,
    );
  }

  /**
   * 附件限额（批次 1.4）。
   *
   * 原先**在两个控制器里各写一遍 `10 * 1024 * 1024`**，
   * 而且小程序那边的"最多 9 张"又是第三处。现在统一从这里读。
   */
  async getAttachmentLimits(): Promise<{
    maxSizeBytes: number;
    maxSizeMb: number;
    maxCount: number;
  }> {
    const maxSizeMb = await this.resolvePositiveIntFromConfig(
      (config) => config.attachmentMaxSizeMb,
      10,
    );
    const maxCount = await this.resolvePositiveIntFromConfig(
      (config) => config.attachmentMaxCount,
      9,
    );
    return {
      maxSizeMb,
      maxSizeBytes: maxSizeMb * 1024 * 1024,
      maxCount,
    };
  }

  /** 业务编号前缀（原为写死的 'CR'）· 批次 1.4 */
  private async resolveOrderNoPrefix(): Promise<string> {
    try {
      const config = await this.configService.getConfig();
      const prefix = String(config.orderNoPrefix ?? '').trim();
      return prefix || 'CR';
    } catch {
      return 'CR';
    }
  }

  // ==================== 渲染契约要用的配置（批次 1.5）====================

  /**
   * 售后窗口天数（批次 1.5 加）。
   *
   * 顾客侧的「有问题」按钮能不能点，由后端按交付时间 + 这个天数算出来 ——
   * 此前是小程序自己判 `7 天`（写死），而后端配置是 30 天，
   * **两边口径本来就不一致**。现在以配置为准。
   */
  async getAftersaleWindowDays(): Promise<number | null> {
    const value = await this.resolvePositiveIntFromConfig(
      (config) => config.aftersaleWindowDays,
      30,
    );
    return value;
  }

  /** 是否要求顾客确认收货（批次 1.5 加）—— 决定小程序显不显示「确认收到」 */
  async getRequireCustomerConfirm(): Promise<boolean> {
    try {
      const config = await this.configService.getConfig();
      return config.requireCustomerConfirm !== false;
    } catch {
      return true;
    }
  }

  /**
   * Get schedule for a specific date
   */
  async getSchedule(date: Date): Promise<any | null> {
    const schedule = await this.prisma.customRecipeSchedule.findUnique({
      where: { date },
    });

    if (!schedule) {
      // Create default schedule
      return await this.createSchedule(
        date,
        await this.resolveDailyCapacity(),
      );
    }

    return schedule;
  }

  /**
   * Get schedule range
   */
  async getScheduleRange(dateFrom: Date, dateTo: Date): Promise<any[]> {
    const defaultCapacity = await this.resolveDailyCapacity();
    const schedules = await this.prisma.customRecipeSchedule.findMany({
      where: {
        date: {
          gte: dateFrom,
          lte: dateTo,
        },
      },
      orderBy: { date: 'asc' },
    });

    // Fill in missing dates with default schedules
    const result = [];
    const currentDate = new Date(dateFrom);
    const endDate = new Date(dateTo);

    while (currentDate <= endDate) {
      const existing = schedules.find(
        (s) => s.date.getTime() === currentDate.getTime(),
      );
      if (existing) {
        result.push(existing);
      } else {
        result.push({
          date: new Date(currentDate),
          capacity: defaultCapacity,
          bookedCount: 0,
          isAvailable: true,
          isPublicHoliday: false,
        });
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return result;
  }

  /**
   * Create schedule
   */
  async createSchedule(
    date: Date,
    capacity: number,
    isPublicHoliday = false,
  ): Promise<any> {
    return await this.prisma.customRecipeSchedule.create({
      data: {
        date,
        capacity,
        bookedCount: 0,
        isAvailable: true,
        isPublicHoliday,
      },
    });
  }

  /**
   * Update schedule
   */
  async updateSchedule(date: Date, data: Partial<any>): Promise<void> {
    await this.prisma.customRecipeSchedule.upsert({
      where: { date },
      update: data,
      create: {
        date,
        capacity: data.capacity || (await this.resolveDailyCapacity()),
        bookedCount: 0,
        isAvailable: data.isAvailable ?? true,
        isPublicHoliday: data.isPublicHoliday ?? false,
      },
    });
  }

  /**
   * Check availability
   */
  async checkAvailability(date: Date): Promise<boolean> {
    /**
     * 2026-09-28 修复（节假日可以被绕过）：
     *
     * 原实现是"先落一条默认排期行（isPublicHoliday 一律写 false），再按假期判断返回"。
     * 于是节假日虽然会被拒，但那行"这不是假期"已经写进库了；
     * 顾客**再点一次**时走的是"行已存在"分支，而那个分支只看
     * isAvailable / bookedCount，完全不看 isPublicHoliday —— 节假日就能约上了。
     *
     * 现在：先把假期判断做完，落库时写真实的 isPublicHoliday；
     * 已存在的行也必须尊重它。另外补上"不能约过去的日期"。
     */
    const capacity = await this.resolveDailyCapacity();
    const holiday = await isPublicHoliday(date);

    if (this.isPastDate(date)) {
      return false;
    }

    const schedule = await this.prisma.customRecipeSchedule.findUnique({
      where: { date },
    });

    if (!schedule) {
      // 首次访问该日期：落一条**带真实假期标记**的默认排期
      await this.createSchedule(date, capacity, holiday);
      return !holiday;
    }

    /**
     * 2026-10-16（批次 4.2）：改走 `resolveDayStatus` —— 三层优先级
     * （具体某天 > 按星期规则 > 全局配置）与**接单/交付两套容量**
     * 都收在领域层，这里只问"开不开"。
     *
     * 上面已经处理过"没有这一天的记录"的分支（会落一条默认行），
     * 所以走到这里 schedule 一定存在；但 `resolveDayStatus` 会重新读一次，
     * 多一次查询换"判定只有一处"，这个交换是划算的 ——
     * 日历的错一旦出现就是"某一天悄悄约不上"，排查成本远高于一次查询。
     */
    const day = await this.resolveDayStatus(date);
    return day.isOpen;
  }

  /**
   * 取一段时间的排期，带上**按星期规则算出来的**可约状态。
   *
   * 供后台日历页与小程序排期页共用 —— 两边都不再自己判断
   * "这天为什么不能约"，原因由后端给。
   */
  async resolveCalendarRange(
    dateFrom: Date,
    dateTo: Date,
  ): Promise<ResolvedDay[]> {
    const [config, rules] = await Promise.all([
      this.configService.getConfig(),
      this.resolveWeekdayRules(),
    ]);

    const defaultCapacity = Number(config.dailyCapacity) || 4;
    const defaultDeliveryCapacity = Number(config.dailyDeliveryCapacity) || 4;

    const overrides = await this.prisma.customRecipeSchedule.findMany({
      where: { date: { gte: dateFrom, lte: dateTo } },
    });
    const byDate = new Map(
      overrides.map((row) => [row.date.getTime(), row]),
    );

    const days: ResolvedDay[] = [];
    const cursor = new Date(dateFrom);
    while (cursor <= dateTo) {
      const row = byDate.get(cursor.getTime());
      days.push(
        resolveDay({
          date: new Date(cursor),
          override: row
            ? {
                isAvailable: row.isAvailable,
                capacity: row.capacity,
                bookedCount: row.bookedCount,
                deliveryCapacity: row.deliveryCapacity,
                deliveryCount: row.deliveryCount,
                isPublicHoliday: row.isPublicHoliday,
              }
            : null,
          weekdayRule: rules.get(cursor.getDay()) ?? null,
          defaultCapacity,
          defaultDeliveryCapacity,
        }),
      );
      cursor.setDate(cursor.getDate() + 1);
    }

    return days;
  }

  /**
   * 排期是按"天"的，早于今天的都不该能约。
   *
   * 用**上海日期**比较，不用服务器本地时区：scheduledDate 是按 UTC 零点存的
   * DATE，用本地 setHours 去截断，一旦服务器时区变了就会整体偏一天。
   */
  private isPastDate(date: Date): boolean {
    const target = TimezoneUtil.toShanghaiDateString(new Date(date));
    const today = TimezoneUtil.toShanghaiDateString(new Date());

    return target < today;
  }

  /**
   * Book a slot
   */
  async bookSlot(date: Date): Promise<void> {
    await this.prisma.customRecipeSchedule.update({
      where: { date },
      data: {
        bookedCount: { increment: 1 },
      },
    });
  }

  /**
   * 自动排期的起点：上海时区的"今天"，且按 DATE 列的存储口径（UTC 零点）。
   *
   * 必须走 TimezoneUtil + parseYYYYMMDD：直接用 new Date() 会带上当前时刻，
   * 服务器时区一变就会整体偏一天（历史上就踩过 0-8 点下单写成昨天）。
   */
  private getScheduleStartDate(): Date {
    return parseYYYYMMDD(TimezoneUtil.toShanghaiDateString(new Date()));
  }

  /** 日期游标 +1 天（按 UTC 毫秒推进，避开夏令时/时区把日期挪走） */
  private addOneDay(date: Date): Date {
    return new Date(date.getTime() + 24 * 60 * 60 * 1000);
  }

  /**
   * 找出下一个能接单的日子（2026-10-04 拍板的口径 1）。
   *
   * 老板决定：**日期由系统排，顾客不选**。从今天起往后找第一个
   * "不是公众假期、且没被约满"的日子，满了就顺延到下一天。
   *
   * excludeDays 用于跳过"刚在并发里抢输"的日子，避免反复撞同一天。
   * 这里只做"读"筛选，真正的占位由 tryBookSlotTx 的 CAS 决定胜负。
   */
  private async findNextAvailableDate(
    capacity: number,
    excludeDays: Set<string> = new Set(),
  ): Promise<Date | null> {
    const todayKey = TimezoneUtil.toShanghaiDateString(new Date());
    let cursor = this.getScheduleStartDate();
    /** 往前找多少天（原写死 45，2026-10-16 起从配置读） */
    const lookaheadDays = await this.resolveScheduleLookaheadDays();

    for (let i = 0; i < lookaheadDays; i += 1) {
      const key = TimezoneUtil.toShanghaiDateString(cursor);

      if (key >= todayKey && !excludeDays.has(key)) {
        const holiday = await isPublicHoliday(cursor);

        if (!holiday) {
          const schedule = await this.prisma.customRecipeSchedule.findUnique({
            where: { date: cursor },
          });

          // 还没有排期行 = 这天没人碰过，按"空着"算
          const bookable = schedule
            ? schedule.isAvailable && !schedule.isPublicHoliday
            : true;
          const hasRoom = schedule
            ? schedule.bookedCount < (schedule.capacity ?? capacity)
            : true;

          if (bookable && hasRoom) {
            return cursor;
          }
        }
      }

      cursor = this.addOneDay(cursor);
    }

    return null;
  }

  /**
   * 事务内**条件式**抢一个排期名额（CAS）。
   *
   * 抢得到返回 true，抢不到返回 false（调用方换一天重试）。
   * 关键在最后那步 updateMany 带着"读到的 bookedCount 原值"做条件 ——
   * 两个并发请求里只有一个能把原值改成原值 +1，另一个 count 为 0 自然落败。
   */
  private async tryBookSlotTx(
    tx: any,
    date: Date,
    capacity: number,
  ): Promise<boolean> {
    const existing = await tx.customRecipeSchedule.findUnique({
      where: { date },
    });

    if (!existing) {
      // 首次访问该日期：落一条**带真实假期标记**的排期行。
      // skipDuplicates 兜住"两个请求同时首次访问"的唯一约束冲突。
      await tx.customRecipeSchedule.createMany({
        data: [
          {
            date,
            capacity,
            bookedCount: 0,
            isAvailable: true,
            isPublicHoliday: await isPublicHoliday(date),
          },
        ],
        skipDuplicates: true,
      });
    }

    const schedule = await tx.customRecipeSchedule.findUnique({
      where: { date },
    });

    if (!schedule || !schedule.isAvailable || schedule.isPublicHoliday) {
      return false;
    }

    if (schedule.bookedCount >= (schedule.capacity ?? capacity)) {
      return false;
    }

    const updated = await tx.customRecipeSchedule.updateMany({
      where: {
        date,
        bookedCount: schedule.bookedCount,
        isAvailable: true,
        isPublicHoliday: false,
      },
      data: { bookedCount: { increment: 1 } },
    });

    return updated.count === 1;
  }

  /**
   * Release a slot
   */
  async releaseSlot(date: Date): Promise<void> {
    await this.prisma.customRecipeSchedule.update({
      where: { date },
      data: {
        bookedCount: { decrement: 1 },
      },
    });
  }

  /**
   * Add attachment
   */
  async addAttachment(orderId: string, data: any): Promise<any> {
    return await this.prisma.customRecipeAttachment.create({
      data: {
        orderId,
        ...data,
      },
    });
  }

  /**
   * Get attachments
   */
  async getAttachments(orderId: string): Promise<any[]> {
    return await this.prisma.customRecipeAttachment.findMany({
      where: { orderId },
      orderBy: { uploadedAt: 'desc' },
    });
  }

  /**
   * Delete attachment
   */
  async deleteAttachment(id: string): Promise<void> {
    await this.prisma.customRecipeAttachment.delete({
      where: { id },
    });
  }

  /**
   * Sync to health profile
   */
  async syncToHealthProfile(
    dogId: string,
    allergies: string[],
    medicalConditions: string[],
    dietPreferences: {
      preferredIngredients?: string[];
      dislikedIngredients?: string[];
    } = {},
  ): Promise<void> {
    await this.syncToHealthProfileTx(
      this.prisma,
      dogId,
      allergies,
      medicalConditions,
      dietPreferences,
    );
  }

  private async syncToHealthProfileTx(
    tx: any,
    dogId: string,
    allergies: string[],
    medicalConditions: string[],
    dietPreferences: {
      preferredIngredients?: string[];
      dislikedIngredients?: string[];
    } = {},
  ): Promise<void> {
    /**
     * 同步过敏史 → 结构化过敏记录。
     *
     * ⚠️ 这里曾经写坏了：`AllergyRecord` 只有 `allergen` / `notes` 两个业务字段
     * （没有严重程度、过敏类型、发现日期、确认方），而代码却写入了那 4 个
     * 不存在的列 —— Prisma 直接抛 `Unknown argument`，**整个下单事务回滚**。
     *
     * 而小程序端的 `syncToHealthProfile` 恒为 true，等于：
     * **顾客只要填了一个过敏原，就永远提交不了定制单**（已实测复现 500）。
     *
     * 现在只写真实存在的字段，并把来源记进 notes 留痕；
     * 同时不再替顾客臆断"中度过敏 / 食物型 / 主人确认"这类医学判断 ——
     * 数据模型里本来也没有地方承载它们。
     */
    for (const allergen of allergies) {
      const existing = await tx.allergyRecord.findFirst({
        where: { dogId, allergen },
      });

      if (!existing) {
        await tx.allergyRecord.create({
          data: {
            dogId,
            allergen,
            notes: '顾客提交定制需求时填写',
          },
        });
      }
    }

    /**
     * 同步疾病史 → 结构化疾病记录。
     *
     * 2026-09-28 修复（老板拍板的决策 5）：这里原先写死 `status: 'CHRONIC'`，
     * 也就是**系统替顾客/兽医断言"这是慢性病"**。生产上已经真实发生过
     * （一条"肠胃敏感"被标成慢性）。而"肠胃敏感是不是慢性病"只有兽医能判断。
     *
     * 现在一律标为 PENDING_CONFIRMATION（待确认），
     * 来源写进 chiefComplaint 留痕，由顾客/客服在「健康管理」页确认成实际情况。
     */
    for (const condition of medicalConditions) {
      const existing = await tx.medicalRecord.findFirst({
        where: { dogId, diagnosis: condition },
      });

      if (!existing) {
        await tx.medicalRecord.create({
          data: {
            dogId,
            visitDate: new Date(),
            chiefComplaint: '定制食谱时提供',
            diagnosis: condition,
            status: 'PENDING_CONFIRMATION',
          },
        });
      }
    }

    /**
     * 同步饮食偏好 → 档案（2026-10-02 补）。
     *
     * 背景：老板定了"饮食偏好只在定制食谱时填写"，健康管理页的编辑入口已下线。
     * 但下单时只把偏好存进了订单、**没有回写档案** ——
     * 于是 AI 健康分析里的"饮食偏好"、营养师侧的标签派生读到的一直是空值，等于断源。
     * 这里补两条路：
     *   · dog.preferredFoods / pickyFoods（自由文本，分析与分享在读）
     *   · dog_diet_preference（结构化「爱吃/不吃」+ 变更历史，营养师端在读）
     *
     * 写法是**并入**而不是覆盖：顾客以前填过的、这次没提到的都留着。
     */
    await this.mergeDietPreferencesTx(
      tx,
      dogId,
      dietPreferences.preferredIngredients || [],
      dietPreferences.dislikedIngredients || [],
    );
  }

  /** 把这次的饮食偏好并进档案（自由文本 + 结构化表），不覆盖旧内容 */
  private async mergeDietPreferencesTx(
    tx: any,
    dogId: string,
    preferred: string[],
    disliked: string[],
  ): Promise<void> {
    const clean = (list: string[]) =>
      Array.from(
        new Set(
          (list || []).map((item) => String(item || '').trim()).filter(Boolean),
        ),
      );

    const liked = clean(preferred);
    const notLiked = clean(disliked);

    if (liked.length === 0 && notLiked.length === 0) {
      return;
    }

    const dog = await tx.dog.findUnique({
      where: { id: dogId },
      select: { preferredFoods: true, pickyFoods: true },
    });

    const mergeText = (existing: string | null, additions: string[]) => {
      const parts = String(existing || '')
        .split(/[、,，\n]/)
        .map((item) => item.trim())
        .filter(Boolean);

      for (const item of additions) {
        if (!parts.includes(item)) {
          parts.push(item);
        }
      }

      return parts.join('、');
    };

    if (dog) {
      await tx.dog.update({
        where: { id: dogId },
        data: {
          ...(liked.length > 0
            ? { preferredFoods: mergeText(dog.preferredFoods, liked) }
            : {}),
          ...(notLiked.length > 0
            ? { pickyFoods: mergeText(dog.pickyFoods, notLiked) }
            : {}),
        },
      });
    }

    // 结构化偏好：爱吃 = LIKED、不爱吃 = DISLIKED；已存在的不重复加、也不记变更
    for (const [kind, items] of [
      ['LIKED', liked],
      ['DISLIKED', notLiked],
    ] as const) {
      for (const foodName of items) {
        const existing = await tx.dogDietPreference.findUnique({
          where: { dogId_kind_foodName: { dogId, kind, foodName } },
        });

        if (existing) {
          continue;
        }

        await tx.dogDietPreference.create({
          data: { dogId, kind, foodName, source: 'CUSTOM_RECIPE' },
        });
        await tx.dogDietPreferenceChange.create({
          data: {
            dogId,
            kind,
            foodName,
            action: 'ADDED',
            changedBy: 'CUSTOM_RECIPE',
          },
        });
      }
    }
  }

  /**
   * Upload attachment
   */
  async uploadAttachment(file: Express.Multer.File, orderId: string) {
    const result = await this.cosService.uploadImage(
      file,
      file.originalname,
      'custom-recipe-attachments',
    );

    const attachment = await this.addAttachment(orderId, {
      fileName: file.originalname,
      fileUrl: result.url,
      fileSize: file.size,
      fileType: this.getFileType(file.originalname),
    });

    return attachment;
  }

  private getFileType(filename: string): CustomAttachmentType {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') {
      return CustomAttachmentType.MEDICAL_REPORT;
    }
    if (['jpg', 'jpeg', 'png', 'gif'].includes(ext || '')) {
      return CustomAttachmentType.IMAGE;
    }
    return CustomAttachmentType.OTHER;
  }

  /**
   * Get dog health summary
   */
  /**
   * 档案已有信息汇总 —— 供定制页"带出档案已有信息"用（老板拍板的决策 3）。
   *
   * 2026-09-28 补齐：除过敏/疾病/体检/体重趋势外，再加上
   *   · vaccines      疫苗记录（"健康管理"板块 2026-09-27 才有的新数据）
   *   · preferredFoods / pickyFoods  口味偏好（饮食偏好要带出上次填的）
   *   · bcsScore / currentWeightKg   体况与体重（用于"体况只给建议"的文案）
   */
  async getDogHealthSummary(dogId: string) {
    const [
      allergies,
      medicalRecords,
      checkups,
      weightRecords,
      vaccines,
      dog,
    ] = await Promise.all([
        this.prisma.allergyRecord.findMany({
          where: { dogId },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.medicalRecord.findMany({
          where: { dogId },
          orderBy: { visitDate: 'desc' },
          take: 5,
        }),
        this.prisma.checkupRecord.findMany({
          where: { dogId },
          orderBy: { checkupDate: 'desc' },
          take: 3,
        }),
        this.prisma.weightRecord.findMany({
          where: { dogId },
          orderBy: { recordDate: 'desc' },
          take: 5,
        }),
        this.prisma.vaccineRecord.findMany({
          where: { dogId },
          orderBy: { vaccinationDate: 'desc' },
          take: 10,
        }),
        this.prisma.dog.findUnique({
          where: { id: dogId },
          select: {
            currentWeightKg: true,
            bcsScore: true,
            activityLevel: true,
            preferredFoods: true,
            pickyFoods: true,
            allergyFoods: true,
          },
        }),
      ]);

    return {
      allergies: allergies.map((a) => a.allergen),
      medicalConditions: medicalRecords.map((m) => m.diagnosis),
      recentCheckups: checkups,
      weightTrend: weightRecords,
      vaccines: vaccines.map((v) => ({
        id: v.id,
        vaccineName: v.vaccineName,
        vaccinationDate: v.vaccinationDate,
      })),
      currentWeightKg: dog?.currentWeightKg ?? null,
      bcsScore: dog?.bcsScore ?? null,
      activityLevel: dog?.activityLevel ?? null,
      preferredFoods: dog?.preferredFoods ?? null,
      pickyFoods: dog?.pickyFoods ?? null,
      allergyFoods: dog?.allergyFoods ?? null,
    };
  }

  /**
   * Analyze dog preferences from order history
   */
  async analyzeDogPreferences(dogId: string) {
    const orders = await this.prisma.order.findMany({
      where: {
        dogId,
        status: { in: ['COMPLETED', 'SHIPPED'] },
      },
      include: {
        items: {
          include: {
            order: true,
          },
        },
      },
      take: 10,
      orderBy: { createdAt: 'desc' },
    });

    const preferredIngredients = new Set<string>();
    const dislikedIngredients = new Set<string>();

    // Analyze recipe snapshots from orders
    // This is a simplified version - in production, you'd analyze actual ingredients

    return {
      preferredIngredients: Array.from(preferredIngredients),
      dislikedIngredients: Array.from(dislikedIngredients),
    };
  }
}
