/**
 * Custom Recipe Service
 * Business logic for custom recipe orders
 */

import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
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
  CustomRecipeStatus,
  TargetGoal,
  CustomAttachmentType,
} from '@prisma/client';
import {
  addWorkDays,
  isPublicHoliday,
  getPublicHolidaysForYear,
} from '../../utils/date-helpers';

@Injectable()
export class CustomRecipeService implements ICustomRecipeRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cosService: TencentCosService,
    private readonly configService: CustomRecipeConfigService,
  ) {}

  /**
   * Generate a unique order ID in format CRYYYYMMDDXXXX
   */
  private generateOrderId(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const random = Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, '0');
    return `CR${year}${month}${day}${random}`;
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
   * Create a new custom recipe order
   */
  async createOrder(data: CreateCustomRecipeOrderDTO): Promise<any> {
    // 定制费与可抵扣金额都从后台配置读取，并在下单这一刻**快照进订单**。
    // 之后后台调价只影响新提交的单，已提交的顾客额度不会被改。
    const config = await this.configService.getConfig();

    return await this.prisma.$transaction(async (tx) => {
      // 1. Check availability
      const available = await this.checkAvailability(data.scheduledDate);
      if (!available) {
        throw new ConflictException('该日期已约满，请选择其他日期');
      }

      // 2. Calculate estimated delivery date
      const estimatedDeliveryDate = await this.calculateDeliveryDate(
        data.scheduledDate,
        config.deliveryWorkDays,
      );

      // 3. Create order
      const order = await tx.customRecipeOrder.create({
        data: {
          orderId: this.generateOrderId(),
          customerId: data.customerId,
          dogId: data.dogId,
          targetGoal: data.targetGoal,
          allergies: data.allergies || [],
          medicalConditions: data.medicalConditions || [],
          additionalNotes: data.additionalNotes,
          preferredIngredients: data.preferredIngredients || [],
          dislikedIngredients: data.dislikedIngredients || [],
          attachments: data.attachmentUrls || [],
          scheduledDate: data.scheduledDate,
          estimatedDeliveryDate,
          amount: config.feeAmount,
          creditAmount: config.creditAmount,
          status: CustomRecipeStatus.PENDING_PAYMENT,
        },
      });

      // 4. Book the slot
      await this.bookSlotTx(tx, data.scheduledDate);

      // 5. Sync to health profile if requested
      if (data.syncToHealthProfile) {
        await this.syncToHealthProfileTx(
          tx,
          data.dogId,
          data.allergies || [],
          data.medicalConditions || [],
        );
        await tx.customRecipeOrder.update({
          where: { id: order.id },
          data: { healthInfoSyncedAt: new Date() },
        });
      }

      return order;
    });
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
          select: {
            id: true,
            name: true,
            coverImageUrl: true,
          },
        },
        attachmentsRecords: true,
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
            select: {
              id: true,
              name: true,
              coverImageUrl: true,
            },
          },
          attachmentsRecords: true,
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
  async updateOrderStatus(
    orderIdOrId: string,
    status: CustomRecipeStatus,
  ): Promise<void> {
    const ref = await this.resolveOrderRef(orderIdOrId);

    await this.prisma.customRecipeOrder.update({
      where: { id: ref.id },
      data: { status },
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
    });

    return { order, alreadyPaid: result.count === 0 };
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

    await this.prisma.$transaction(async (tx) => {
      await tx.customRecipeOrder.update({
        where: { id: order.id },
        data: {
          status: CustomRecipeStatus.CANCELLED,
          cancelledAt: new Date(),
          cancellationReason: options.reason,
        },
      });

      // 名额下限保护：并发回调/重复关单不能让 booked_count 变成负数
      await tx.customRecipeSchedule.updateMany({
        where: { date: order.scheduledDate, bookedCount: { gt: 0 } },
        data: { bookedCount: { decrement: 1 } },
      });
    });

    return { cancelled: true };
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

    const order = await this.prisma.customRecipeOrder.findFirst({
      where: {
        customerId: params.customerId,
        recipeId: params.recipeId,
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

    const [pendingPayment, inProgress, delivered, orders] = await Promise.all([
      this.prisma.customRecipeOrder.count({
        where: { ...where, status: CustomRecipeStatus.PENDING_PAYMENT },
      }),
      this.prisma.customRecipeOrder.count({
        where: { ...where, status: CustomRecipeStatus.IN_PROGRESS },
      }),
      this.prisma.customRecipeOrder.count({
        where: { ...where, status: CustomRecipeStatus.DELIVERED },
      }),
      this.prisma.customRecipeOrder.findMany({
        where: { ...where, status: CustomRecipeStatus.DELIVERED },
        select: { amount: true },
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
    };
  }

  /**
   * 每日接单上限来自后台配置（原为写死的 4）
   */
  private async resolveDailyCapacity(): Promise<number> {
    const config = await this.configService.getConfig();
    return config.dailyCapacity;
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
  async createSchedule(date: Date, capacity: number): Promise<any> {
    return await this.prisma.customRecipeSchedule.create({
      data: {
        date,
        capacity,
        bookedCount: 0,
        isAvailable: true,
        isPublicHoliday: false,
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
    const schedule = await this.prisma.customRecipeSchedule.findUnique({
      where: { date },
    });

    if (!schedule) {
      // 首次访问该日期：先落一条默认排期，再按"是否公众假期"决定能否预约
      const capacity = await this.resolveDailyCapacity();
      const holiday = await isPublicHoliday(date);
      await this.createSchedule(date, capacity);
      return !holiday;
    }

    return schedule.isAvailable && schedule.bookedCount < schedule.capacity;
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

  private async bookSlotTx(tx: any, date: Date): Promise<void> {
    await tx.customRecipeSchedule.update({
      where: { date },
      data: {
        bookedCount: { increment: 1 },
      },
    });
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
  ): Promise<void> {
    await this.syncToHealthProfileTx(
      this.prisma,
      dogId,
      allergies,
      medicalConditions,
    );
  }

  private async syncToHealthProfileTx(
    tx: any,
    dogId: string,
    allergies: string[],
    medicalConditions: string[],
  ): Promise<void> {
    // Sync allergies
    for (const allergen of allergies) {
      const existing = await tx.allergyRecord.findFirst({
        where: { dogId, allergen },
      });

      if (!existing) {
        await tx.allergyRecord.create({
          data: {
            dogId,
            allergen,
            allergenType: 'FOOD',
            discoveryDate: new Date(),
            severity: 'MODERATE',
            confirmedBy: 'OWNER',
          },
        });
      }
    }

    // Sync medical conditions
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
            status: 'CHRONIC',
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
  async getDogHealthSummary(dogId: string) {
    const [allergies, medicalRecords, checkups, weightRecords] =
      await Promise.all([
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
      ]);

    return {
      allergies: allergies.map((a) => a.allergen),
      medicalConditions: medicalRecords.map((m) => m.diagnosis),
      recentCheckups: checkups,
      weightTrend: weightRecords,
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
