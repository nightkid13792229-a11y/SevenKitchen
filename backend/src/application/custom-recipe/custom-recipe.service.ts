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
  private readonly WORK_DAYS = 3;
  private readonly DEFAULT_CAPACITY = 4;
  private readonly ORDER_AMOUNT = 299;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cosService: TencentCosService,
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
   * Calculate estimated delivery date (3 work days from scheduled date)
   */
  private calculateDeliveryDate(scheduledDate: Date): Date {
    return addWorkDays(scheduledDate, this.WORK_DAYS);
  }

  /**
   * Create a new custom recipe order
   */
  async createOrder(data: CreateCustomRecipeOrderDTO): Promise<any> {
    return await this.prisma.$transaction(async (tx) => {
      // 1. Check availability
      const available = await this.checkAvailability(data.scheduledDate);
      if (!available) {
        throw new ConflictException('该日期已约满，请选择其他日期');
      }

      // 2. Calculate estimated delivery date
      const estimatedDeliveryDate = this.calculateDeliveryDate(
        data.scheduledDate,
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
          amount: this.ORDER_AMOUNT,
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
   */
  async getOrderByOrderId(orderId: string): Promise<any | null> {
    return await this.prisma.customRecipeOrder.findUnique({
      where: { orderId },
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
   */
  async updateOrder(
    id: string,
    data: UpdateCustomRecipeOrderDTO,
  ): Promise<any> {
    return await this.prisma.customRecipeOrder.update({
      where: { id },
      data,
    });
  }

  /**
   * Update order status
   */
  async updateOrderStatus(
    id: string,
    status: CustomRecipeStatus,
  ): Promise<void> {
    await this.prisma.customRecipeOrder.update({
      where: { id },
      data: { status },
    });
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
   * Get schedule for a specific date
   */
  async getSchedule(date: Date): Promise<any | null> {
    const schedule = await this.prisma.customRecipeSchedule.findUnique({
      where: { date },
    });

    if (!schedule) {
      // Create default schedule
      return await this.createSchedule(date, this.DEFAULT_CAPACITY);
    }

    return schedule;
  }

  /**
   * Get schedule range
   */
  async getScheduleRange(dateFrom: Date, dateTo: Date): Promise<any[]> {
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
          capacity: this.DEFAULT_CAPACITY,
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
        capacity: data.capacity || this.DEFAULT_CAPACITY,
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
      // Create default schedule and return true if not a public holiday
      const holiday = await isPublicHoliday(date);
      if (holiday) {
        await this.createSchedule(date, this.DEFAULT_CAPACITY);
        return false;
      }
      await this.createSchedule(date, this.DEFAULT_CAPACITY);
      return true;
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
