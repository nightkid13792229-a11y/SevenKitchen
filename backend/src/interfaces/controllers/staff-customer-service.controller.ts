import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../infrastructure/prisma.service';
import { OrderService } from '../../application/order/order.service';
import { AddressService } from '../../application/address/address.service';
import { parseProductionDateInput } from '../../application/order/production-date';
import { ApiResponseDto } from '../dto/common/response.dto';
import { AuthGuard, CurrentUser, type RequestUser } from '../auth';
import { AdminGuard, StaffGuard } from '../guards/role.guard';

const LOCKED_ADDRESS_STATUSES = new Set(['SHIPPED', 'COMPLETED', 'CANCELLED']);
const LOCKED_AMOUNT_STATUSES = new Set(['SHIPPED', 'COMPLETED', 'CANCELLED']);

function toNumber(value: any): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (typeof value?.toNumber === 'function') return value.toNumber();
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function normalizeAddress(address: any) {
  if (!address) return null;
  return {
    id: address.id ?? null,
    recipientName: address.recipientName ?? '',
    phone: address.phone ?? '',
    region: address.region ?? null,
    regionText: [address.region?.province, address.region?.city, address.region?.district]
      .filter(Boolean)
      .join(' '),
    detailAddress: address.detail ?? address.detailAddress ?? '',
  };
}

function normalizeAddressOption(address: any) {
  const region = address.region ?? null;
  return {
    id: address.id,
    userId: address.userId,
    recipientName: address.recipientName ?? '',
    phone: address.phone ?? '',
    region,
    regionText: [region?.province, region?.city, region?.district]
      .filter(Boolean)
      .join(' '),
    detail: address.detail ?? '',
    isDefault: Boolean(address.isDefault),
  };
}

function normalizeRecipeOption(recipe: any) {
  const isPrivateCustom = recipe.status === 'PRIVATE_CUSTOM';
  return {
    id: recipe.recipeId,
    internalId: recipe.id,
    version: recipe.version,
    name: recipe.name,
    status: recipe.status,
    sourceLabel: isPrivateCustom ? '专属成品' : '公开成品',
    coverImageUrl: recipe.coverImageUrl?.replace('http://', 'https://') ?? null,
    applicableLifeStages: recipe.applicableLifeStages ?? [],
    targetHealthTags: recipe.targetHealthTags ?? [],
    energyDensityKcalPerKg: toNumber(recipe.energyDensityKcalPerKg),
    customerOwnerId: recipe.customerOwnerId ?? null,
    customerDogId: recipe.customerDogId ?? null,
    isCustomRecipe: Boolean(recipe.isCustomRecipe),
    seriesLifeStage: recipe.seriesLifeStage ?? null,
  };
}

@ApiTags('Staff Customer Service')
@Controller('api/v1/staff/customer-service')
@UseGuards(AuthGuard, StaffGuard)
export class StaffCustomerServiceController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orderService: OrderService,
    private readonly addressService: AddressService,
  ) {}

  @Get('customers/search')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Search customers and dogs for staff workflows' })
  async searchCustomers(@Query() query: { keyword?: string }) {
    const keyword = String(query.keyword || '').trim();
    if (!keyword) {
      return ApiResponseDto.success([]);
    }

    const customers = await this.prisma.user.findMany({
      where: {
        role: 'CUSTOMER',
        OR: [
          { phone: { contains: keyword } },
          { nickname: { contains: keyword, mode: 'insensitive' } },
          {
            dogs: {
              some: { name: { contains: keyword, mode: 'insensitive' } },
            },
          },
          { orders: { some: { id: { contains: keyword } } } },
          // 无账号顾客（isGuest）的 phone 恒为 null，手机号只存在这里。
          // 电话打来下单的顾客，就靠这两个字段被搜到。
          { guestContactPhone: { contains: keyword } },
          {
            guestContactName: {
              contains: keyword,
              mode: 'insensitive',
            },
          },
        ],
      },
      select: {
        id: true,
        nickname: true,
        phone: true,
        avatarUrl: true,
        isGuest: true,
        guestContactName: true,
        guestContactPhone: true,
        dogs: {
          select: {
            id: true,
            name: true,
            breedId: true,
            customBreedName: true,
            currentWeightKg: true,
            mealsPerDay: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    });

    const breedIds = Array.from(
      new Set(
        customers
          .flatMap((customer) => customer.dogs.map((dog) => dog.breedId))
          .filter(Boolean),
      ),
    );
    const breeds = breedIds.length
      ? await this.prisma.dogBreed.findMany({
          where: { id: { in: breedIds } },
          select: { id: true, name: true },
        })
      : [];
    const breedMap = new Map(breeds.map((breed) => [breed.id, breed.name]));

    return ApiResponseDto.success(
      customers.map((customer) => ({
        id: customer.id,
        nickname: customer.nickname,
        phone: customer.phone,
        avatarUrl: customer.avatarUrl,
        isGuest: Boolean(customer.isGuest),
        guestContactName: customer.guestContactName ?? null,
        guestContactPhone: customer.guestContactPhone ?? null,
        dogs: customer.dogs.map((dog) => ({
          id: dog.id,
          name: dog.name,
          breedName: dog.customBreedName || breedMap.get(dog.breedId) || null,
          currentWeightKg: dog.currentWeightKg,
          mealsPerDay: dog.mealsPerDay,
        })),
      })),
    );
  }

  @Get('customers/:customerId/addresses')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List customer addresses for staff assisted orders' })
  async listCustomerAddresses(@Param('customerId') customerId: string) {
    const customer = await this.prisma.user.findUnique({
      where: { id: customerId },
      select: { id: true, role: true },
    });
    if (!customer || customer.role !== 'CUSTOMER') {
      return ApiResponseDto.error(404, 'Customer not found');
    }

    const addresses = await this.prisma.address.findMany({
      where: { userId: customerId },
      orderBy: [{ isDefault: 'desc' }, { recipientName: 'asc' }],
    });

    return ApiResponseDto.success(addresses.map(normalizeAddressOption));
  }

  @Post('orders/assisted')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create staff-assisted offline-payment order' })
  async createAssistedOrder(
    @Body() body: any,
    @CurrentUser() user: RequestUser,
  ) {
    try {
      const customerId = String(body.customerId || '').trim();
      const amountAdjustReason = String(body.amountAdjustReason || '').trim();
      const rawActualAmount = body.actualAmount;
      const actualAmount =
        rawActualAmount === undefined ||
        rawActualAmount === null ||
        rawActualAmount === ''
          ? undefined
          : Number(rawActualAmount);
      if (
        actualAmount !== undefined &&
        (!Number.isFinite(actualAmount) || actualAmount < 0)
      ) {
        return ApiResponseDto.error(400, '请填写正确的收款金额');
      }
      const dogId = String(body.dogId || '').trim();
      const addressId = body.addressId ? String(body.addressId).trim() : undefined;
      const items = Array.isArray(body.items) ? body.items : [];

      if (!customerId || !dogId || items.length === 0) {
        return ApiResponseDto.error(400, 'customerId, dogId and items are required');
      }

      const dog = await this.prisma.dog.findUnique({
        where: { id: dogId },
        select: { id: true, ownerId: true },
      });
      if (!dog) {
        return ApiResponseDto.error(404, 'Dog not found');
      }
      if (dog.ownerId !== customerId) {
        return ApiResponseDto.error(400, 'Dog does not belong to this customer');
      }

      if (addressId) {
        const address = await this.prisma.address.findUnique({
          where: { id: addressId },
          select: { id: true, userId: true },
        });
        if (!address) {
          return ApiResponseDto.error(404, 'Address not found');
        }
        if (address.userId !== customerId) {
          return ApiResponseDto.error(400, 'Address does not belong to this customer');
        }
      }

      /**
       * 实收与系统报价不一致时，必须写一句原因。
       *
       * 这里先用 STAFF_PREVIEW 算一遍系统报价（不落价格快照），
       * 才建单 —— 否则金额校验只能放在下单之后，一旦拦下就留下
       * 一张建了一半的草稿单。
       */
      if (actualAmount !== undefined) {
        const preview = await this.orderService.previewPricing({
          customerId,
          dogId,
          type: body.type || 'FRESH_FOOD',
          pricingPurpose: 'STAFF_PREVIEW',
          addressId,
          items,
        } as any);
        const systemAmount = toNumber(preview.amountTotal);
        if (
          Math.abs(systemAmount - actualAmount) > 0.005 &&
          !amountAdjustReason
        ) {
          return ApiResponseDto.error(
            400,
            '实收金额与系统报价不一致，请填写差额原因',
          );
        }
      }

      const actor = user.role === 'ADMIN' ? 'admin' : 'staff';
      const createdOrder = await this.orderService.createOrderDraft({
        customerId,
        dogId,
        type: body.type || 'FRESH_FOOD',
        targetProductionDate: parseProductionDateInput(
          body.targetProductionDate,
        ),
        // 内部代客下单不受顾客「早上 6 点后最早次日」限制，可以约今天
        actorRole: actor,
        items,
        addressId,
      });

      await this.orderService.confirmOrder(createdOrder.id, actor, user.userId);

      if (actualAmount !== undefined) {
        await this.orderService.updateOrderAmount(createdOrder.id, actualAmount);
      }

      const auditLine = [
        `[代客下单] ${new Date().toISOString()}`,
        `操作人:${user.userId}`,
        `客户:${customerId}`,
        `狗狗:${dogId}`,
        actualAmount !== undefined
          ? `实际收款:${actualAmount.toFixed(2)}`
          : `实际收款:${toNumber(createdOrder.amountTotal).toFixed(2)}`,
        amountAdjustReason ? `差额原因:${amountAdjustReason}` : '',
        body.remark ? `备注:${String(body.remark).trim()}` : '',
      ]
        .filter(Boolean)
        .join(' ');
      // 审计进日志表；客服写的「备注」是人话，继续留在 admin_remark 里给生产看。
      await this.prisma.orderOperationLog.create({
        data: {
          orderId: createdOrder.id,
          action: 'ASSISTED_ORDER',
          operatorId: user.userId,
          reason: body.remark ? String(body.remark).trim() : null,
          rawText: auditLine,
        },
      });
      if (body.remark && String(body.remark).trim()) {
        await this.orderService.updateAdminRemark(
          createdOrder.id,
          [createdOrder.adminRemark, String(body.remark).trim()]
            .filter(Boolean)
            .join('\n'),
        );
      }

      const transactionId = `OFFLINE_${Date.now()}_${user.userId.slice(0, 8)}`;
      const paidOrder = await this.orderService.processPayment(
        createdOrder.id,
        'OFFLINE',
        actor,
        user.userId,
        transactionId,
      );

      return ApiResponseDto.success(paidOrder);
    } catch (error) {
      if (error instanceof NotFoundException) {
        return ApiResponseDto.error(404, error.message);
      }
      if (error instanceof BadRequestException) {
        return ApiResponseDto.error(400, error.message);
      }
      throw error;
    }
  }

  @Get('dogs/:dogId/finished-food-recipe-options')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List finished-food recipe options for staff assisted orders' })
  async listDogFinishedFoodRecipeOptions(
    @Param('dogId') dogId: string,
    @Query() query: { customerId?: string },
  ) {
    const customerId = String(query.customerId || '').trim();
    const dog = await this.prisma.dog.findUnique({
      where: { id: dogId },
      select: { id: true, ownerId: true },
    });
    if (!dog) {
      return ApiResponseDto.error(404, 'Dog not found');
    }
    if (customerId && dog.ownerId !== customerId) {
      return ApiResponseDto.error(400, 'Dog does not belong to this customer');
    }

    const ownerId = customerId || dog.ownerId;
    const recipes = await this.prisma.recipe.findMany({
      where: {
        OR: [
          {
            status: 'PUBLIC',
            OR: [
              { seriesId: null },
              {
                series: {
                  is: {
                    businessStatus: 'PUBLIC',
                    status: 'ACTIVE',
                    deletedAt: null,
                  },
                },
              },
            ],
          },
          {
            status: 'PRIVATE_CUSTOM',
            customerOwnerId: ownerId,
            OR: [{ customerDogId: null }, { customerDogId: dogId }],
          },
        ],
      },
      select: {
        id: true,
        recipeId: true,
        version: true,
        name: true,
        status: true,
        coverImageUrl: true,
        applicableLifeStages: true,
        targetHealthTags: true,
        energyDensityKcalPerKg: true,
        customerOwnerId: true,
        customerDogId: true,
        isCustomRecipe: true,
        seriesLifeStage: true,
      },
      orderBy: [{ recipeId: 'asc' }, { version: 'desc' }],
    });

    const seenRecipeIds = new Set<string>();
    const latestOptions = recipes
      .filter((recipe) => {
        if (seenRecipeIds.has(recipe.recipeId)) return false;
        seenRecipeIds.add(recipe.recipeId);
        return true;
      })
      .map(normalizeRecipeOption);

    return ApiResponseDto.success(latestOptions);
  }

  @Get('dogs/:dogId/finished-food-history')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get staff-visible finished-food order history for a dog' })
  async listDogFinishedFoodHistory(@Param('dogId') dogId: string) {
    const history = await this.orderService.listDogFinishedFoodHistory(dogId);
    return ApiResponseDto.success(history);
  }

  @Get('orders/:orderId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get customer-service staff order workspace' })
  async getOrderWorkspace(
    @Param('orderId') orderId: string,
    @CurrentUser() user: RequestUser,
  ) {
    try {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        include: {
          customer: {
            select: {
              id: true,
              nickname: true,
              phone: true,
              avatarUrl: true,
              role: true,
              wechatOpenid: true,
              wechatUnionid: true,
              wechatIdentities: {
                select: {
                  appId: true,
                  openid: true,
                  unionid: true,
                  lastLoginAt: true,
                },
                orderBy: { lastLoginAt: 'desc' },
              },
            },
          },
          address: true,
          items: true,
          statusHistory: {
            orderBy: { timestamp: 'desc' },
            take: 20,
          },
          refundRecords: {
            include: {
              operator: {
                select: {
                  id: true,
                  nickname: true,
                  phone: true,
                  role: true,
                },
              },
            },
            orderBy: { createdAt: 'desc' },
            take: 20,
          },
          settlementAdjustments: {
            orderBy: { createdAt: 'desc' },
            take: 20,
          },
        },
      });

      if (!order) {
        return ApiResponseDto.error(404, 'Order not found');
      }

      const conversations = await this.prisma.customerServiceConversation.findMany({
        where: { orderId },
        orderBy: { updatedAt: 'desc' },
        take: 10,
        select: {
          id: true,
          sourceType: true,
          sourceTitle: true,
          sourcePath: true,
          status: true,
          assignedStaffId: true,
          metadata: true,
          lastMessageAt: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      const latestRefund = order.refundRecords[0] ?? null;
      const isAdmin = user.role === 'ADMIN';
      const paid = order.paymentStatus === 'SUCCESS' || Boolean(order.paidAt);
      const alreadyRefunded = order.refundRecords.some((record) => record.success);
      const isUnpaid = !paid && ['INIT', 'PENDING_PAYMENT'].includes(order.status);
      const canEditAddress = !LOCKED_ADDRESS_STATUSES.has(order.status);
      const hasRefundRequest =
        order.status === 'AFTERSALE' && order.aftersaleType === 'REFUND';

      return ApiResponseDto.success({
        staff: {
          userId: user.userId,
          role: user.role,
        },
        customer: {
          id: order.customer.id,
          nickname: order.customer.nickname,
          phone: order.customer.phone,
          avatarUrl: order.customer.avatarUrl,
          role: order.customer.role,
          wechatOpenid: order.customer.wechatOpenid,
          wechatUnionid: order.customer.wechatUnionid,
          wechatIdentities: order.customer.wechatIdentities.map((identity) => ({
            ...identity,
            lastLoginAt: toIso(identity.lastLoginAt),
          })),
        },
        order: {
          id: order.id,
          customerId: order.customerId,
          dogId: order.dogId,
          addressId: order.addressId,
          status: order.status,
          type: order.type,
          totalAmount: toNumber(order.totalAmount ?? order.amountTotal),
          amountProduct: toNumber(order.amountProduct),
          amountShipping: toNumber(order.amountShipping),
          amountTotal: toNumber(order.amountTotal),
          paymentMethod: order.paymentMethod,
          paymentStatus: order.paymentStatus,
          transactionId: order.transactionId,
          paidAt: toIso(order.paidAt),
          createdAt: toIso(order.createdAt),
          targetProductionDate: toIso(order.targetProductionDate),
          shippedAt: toIso(order.shippedAt),
          completedAt: toIso(order.completedAt),
          cancelledAt: toIso(order.cancelledAt),
          cancellationReason: order.cancellationReason,
          cancelledBy: order.cancelledBy,
          trackingNumber: order.trackingNumber,
          carrierCode: order.carrierCode,
          adminRemark: order.adminRemark,
          aftersaleType: order.aftersaleType,
          aftersaleReason: order.aftersaleReason,
          aftersaleSince: toIso(order.aftersaleSince),
          aftersalePhotos: order.aftersalePhotos ?? [],
          address:
            normalizeAddress(order.shippingAddressSnapshot) ??
            normalizeAddress(order.address),
          items: order.items.map((item) => ({
            id: item.id,
            orderId: item.orderId,
            recipeSnapshot: item.recipeSnapshot,
            quantityG: item.quantityG,
            packageCount: item.packageCount,
            packageSpecG: item.packageSpecG,
            packagePlan: item.packagePlan,
            cookingMethod: item.cookingMethod,
            customRequirements: item.customRequirements,
            dailyIntakeG: item.dailyIntakeG,
            dogId: item.dogId,
            vacuumBagSpec: item.vacuumBagSpec,
          })),
        },
        actionFlags: {
          canEditRemark: true,
          canEditAddress,
          canAdjustPrice: isUnpaid,
          hasRefundRequest,
          canRejectAftersale: order.status === 'AFTERSALE',
          canApproveRefund:
            isAdmin &&
            paid &&
            order.paymentMethod === 'WECHAT_PAY' &&
            !alreadyRefunded,
          canRetryRefund:
            isAdmin &&
            paid &&
            order.paymentMethod === 'WECHAT_PAY' &&
            !alreadyRefunded &&
            Boolean(
              latestRefund &&
                ['FAILED', 'ABNORMAL', 'CLOSED', 'REFUND_ABNORMAL'].includes(
                  latestRefund.status,
                ),
            ),
          refundAdminOnly: true,
        },
        refundRecords: order.refundRecords.map((record) => ({
          id: record.id,
          orderId: record.orderId,
          outTradeNo: record.outTradeNo,
          outRefundNo: record.outRefundNo,
          refundId: record.refundId,
          amount: toNumber(record.amount),
          totalAmount: toNumber(record.totalAmount),
          reason: record.reason,
          source: record.source,
          status: record.status,
          statusText: record.statusText,
          success: record.success,
          operatorId: record.operatorId,
          operatorName: record.operatorNameSnapshot ?? record.operator?.nickname ?? null,
          operatorPhone: record.operator?.phone ?? null,
          operatorRole: record.operator?.role ?? null,
          errorMessage: record.errorMessage,
          requestedAt: toIso(record.requestedAt),
          notifiedAt: toIso(record.notifiedAt),
          successTime: toIso(record.successTime),
          createdAt: toIso(record.createdAt),
          updatedAt: toIso(record.updatedAt),
        })),
        settlementAdjustments: order.settlementAdjustments.map((adjustment) => ({
          id: adjustment.id,
          sourceType: adjustment.sourceType,
          adjustmentType: adjustment.adjustmentType,
          amount: toNumber(adjustment.amount),
          reason: adjustment.reason,
          status: adjustment.status,
          requiresCustomerPayment: adjustment.requiresCustomerPayment,
          visibleToCustomer: adjustment.visibleToCustomer,
          createdBy: adjustment.createdBy,
          createdById: adjustment.createdById,
          settledAt: toIso(adjustment.settledAt),
          createdAt: toIso(adjustment.createdAt),
          updatedAt: toIso(adjustment.updatedAt),
        })),
        statusHistory: order.statusHistory.map((history) => ({
          id: history.id,
          fromStatus: history.fromStatus,
          toStatus: history.toStatus,
          actor: history.actor,
          actorId: history.actorId,
          metadata: history.metadata,
          timestamp: toIso(history.timestamp),
        })),
        conversations: conversations.map((conversation) => ({
          ...conversation,
          lastMessageAt: toIso(conversation.lastMessageAt),
          createdAt: toIso(conversation.createdAt),
          updatedAt: toIso(conversation.updatedAt),
        })),
      });
    } catch (error) {
      throw error;
    }
  }

  @Put('orders/:orderId/remark')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update order customer-service remark' })
  async updateOrderRemark(
    @Param('orderId') orderId: string,
    @Body() body: { adminRemark?: string | null },
  ) {
    try {
      const order = await this.orderService.updateAdminRemark(
        orderId,
        body.adminRemark ?? null,
      );
      return ApiResponseDto.success({ id: order.id, adminRemark: order.adminRemark });
    } catch (error) {
      if (error instanceof NotFoundException) {
        return ApiResponseDto.error(404, error.message);
      }
      if (error instanceof BadRequestException) {
        return ApiResponseDto.error(400, error.message);
      }
      throw error;
    }
  }

  @Put('orders/:orderId/amount')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Adjust unpaid order amount from customer service workspace' })
  async updateUnpaidOrderAmount(
    @Param('orderId') orderId: string,
    @Body() body: { amount?: number; reason?: string },
    @CurrentUser() user: RequestUser,
  ) {
    try {
      const amount = Number(body.amount);
      if (!Number.isFinite(amount) || amount < 0) {
        return ApiResponseDto.error(400, 'Invalid amount');
      }

      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          status: true,
          paymentStatus: true,
          paidAt: true,
          amountTotal: true,
          paymentMethod: true,
          adminRemark: true,
        },
      });

      if (!order) {
        return ApiResponseDto.error(404, 'Order not found');
      }

      if (LOCKED_AMOUNT_STATUSES.has(order.status)) {
        return ApiResponseDto.error(400, 'Shipped, completed, or cancelled orders cannot be adjusted');
      }

      const paid = order.paymentStatus === 'SUCCESS' || Boolean(order.paidAt);
      const offlinePayment = order.paymentMethod === 'OFFLINE' || order.paymentMethod === 'OFFLINE_WECHAT';
      if (paid && !offlinePayment) {
        return ApiResponseDto.error(400, 'Paid online orders cannot be adjusted here');
      }
      if (!paid && !['INIT', 'PENDING_PAYMENT'].includes(order.status)) {
        return ApiResponseDto.error(400, 'Only unpaid orders can be adjusted');
      }

      const oldAmount = toNumber(order.amountTotal);
      await this.orderService.updateOrderAmount(orderId, amount);
      const reason = String(body.reason || '客服改价').trim();
      // 审计只写日志表，不再污染 admin_remark：备注只留人写的话。
      // 生产单打印不显示改价信息（2026-11-07）。
      await this.prisma.orderOperationLog.create({
        data: {
          orderId,
          action: 'PRICE_ADJUST',
          operatorId: user.userId,
          reason,
          beforeAmount: oldAmount,
          afterAmount: amount,
          rawText: [
            `[客服改价] ${new Date().toISOString()}`,
            `操作人:${user.userId}`,
            `金额:${oldAmount.toFixed(2)} -> ${amount.toFixed(2)}`,
            `原因:${reason}`,
          ].join(' '),
        },
      });

      return ApiResponseDto.success({
        id: orderId,
        oldAmount,
        amount,
        reason,
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        return ApiResponseDto.error(404, error.message);
      }
      if (error instanceof BadRequestException) {
        return ApiResponseDto.error(400, error.message);
      }
      throw error;
    }
  }

  // ===== 代客下单（成品鲜食）· 2026-11-08 =====

  /**
   * 代客下单可选的食谱：橱窗已上架 + **全部**定制食谱（含别人家狗狗的）。
   *
   * 与旧接口 `finished-food-recipe-options` 的区别只有一个：旧接口把定制食谱
   * 限死在"这位顾客的"，而老板要求员工能复用任何一条已经交付过的定制配方。
   * 旧接口保留原样，避免发版窗口里打断线上旧页面。
   */
  @Get('dogs/:dogId/assisted-recipe-options')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Admin assisted-order recipe options' })
  async listAssistedRecipeOptions(
    @Param('dogId') dogId: string,
    @Query()
    query: {
      customerId?: string;
      keyword?: string;
      page?: string;
      pageSize?: string;
    },
  ) {
    const dog = await this.prisma.dog.findUnique({
      where: { id: dogId },
      select: {
        id: true,
        ownerId: true,
        name: true,
        birthday: true,
        allergyFoods: true,
        lifeStageOverride: true,
      },
    });
    if (!dog) {
      return ApiResponseDto.error(404, 'Dog not found');
    }

    const customerId = String(query.customerId || '').trim() || dog.ownerId;
    const keyword = String(query.keyword || '').trim().toLowerCase();
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(query.pageSize) || 20));

    // 1) 取候选：橱窗（只在系列已发布时算上架）+ 全部私密定制
    let recipes = await this.prisma.recipe.findMany({
      where: {
        OR: [
          { status: 'PRIVATE_CUSTOM' },
          {
            status: 'PUBLIC',
            OR: [
              { seriesId: null },
              {
                series: {
                  is: {
                    businessStatus: 'PUBLIC',
                    status: 'ACTIVE',
                    deletedAt: null,
                  },
                },
              },
            ],
          },
        ],
      },
      select: {
        id: true,
        recipeId: true,
        version: true,
        name: true,
        status: true,
        coverImageUrl: true,
        applicableLifeStages: true,
        customerOwnerId: true,
        customerDogId: true,
        seriesId: true,
      },
      orderBy: [{ recipeId: 'asc' }, { version: 'desc' }],
      take: 500,
    });

    // 2) 同一 recipeId 只留最高版本
    const seen = new Set<string>();
    recipes = recipes.filter((recipe) => {
      if (seen.has(recipe.recipeId)) return false;
      seen.add(recipe.recipeId);
      return true;
    });

    // 3) 剔除顾客自己 DIY 设计的系列（下单链路会拦，摆出来只会让人点了报错）
    //    以及已删除 / 已停用的系列
    const seriesIds = Array.from(
      new Set(recipes.map((r) => r.seriesId).filter(Boolean)),
    ) as string[];
    if (seriesIds.length > 0) {
      const seriesRows = await this.prisma.recipeSeries.findMany({
        where: { id: { in: seriesIds } },
        select: {
          id: true,
          createdBy: true,
          status: true,
          deletedAt: true,
          businessStatus: true,
        },
      });
      const creatorIds = Array.from(
        new Set(seriesRows.map((row) => row.createdBy).filter(Boolean)),
      ) as string[];
      const creators =
        creatorIds.length > 0
          ? await this.prisma.user.findMany({
              where: { id: { in: creatorIds } },
              select: { id: true, role: true },
            })
          : [];
      const creatorRole = new Map(creators.map((row) => [row.id, row.role]));
      const seriesMap = new Map(seriesRows.map((row) => [row.id, row]));

      recipes = recipes.filter((recipe) => {
        if (!recipe.seriesId) return true;
        const series = seriesMap.get(recipe.seriesId);
        if (!series) return true;
        if (series.deletedAt) return false;
        if (series.status && series.status !== 'ACTIVE') return false;
        return creatorRole.get(series.createdBy ?? '') !== 'CUSTOMER';
      });
    }

    // 4) 归属信息（谁的定制、哪只狗）
    const ownerIds = Array.from(
      new Set(recipes.map((r) => r.customerOwnerId).filter(Boolean)),
    ) as string[];
    const ownedDogIds = Array.from(
      new Set(recipes.map((r) => r.customerDogId).filter(Boolean)),
    ) as string[];

    const [owners, ownedDogs] = await Promise.all([
      ownerIds.length > 0
        ? this.prisma.user.findMany({
            where: { id: { in: ownerIds } },
            select: {
              id: true,
              nickname: true,
              phone: true,
              guestContactName: true,
              guestContactPhone: true,
            },
          })
        : Promise.resolve([]),
      ownedDogIds.length > 0
        ? this.prisma.dog.findMany({
            where: { id: { in: ownedDogIds } },
            select: { id: true, name: true, breedId: true },
          })
        : Promise.resolve([]),
    ]);

    const breedIds = Array.from(
      new Set(ownedDogs.map((d) => d.breedId).filter(Boolean)),
    ) as string[];
    const breeds =
      breedIds.length > 0
        ? await this.prisma.dogBreed.findMany({
            where: { id: { in: breedIds } },
            select: { id: true, name: true },
          })
        : [];

    const ownerMap = new Map(owners.map((row) => [row.id, row]));
    const dogMap = new Map(ownedDogs.map((row) => [row.id, row]));
    const breedMap = new Map(breeds.map((row) => [row.id, row.name]));

    // 5) 适配提示：过敏原（名称包含匹配，宁多勿漏）+ 生命阶段
    const allergens = await this.loadDogAllergenKeywords(dog);
    const recipeIds = recipes.map((recipe) => recipe.recipeId);
    const ingredientRows =
      recipeIds.length > 0
        ? await this.prisma.recipeItem.findMany({
            where: { recipeId: { in: recipeIds } },
            select: {
              recipeId: true,
              ingredient: { select: { name: true } },
            },
          })
        : [];
    const ingredientNamesByRecipe = new Map<string, string[]>();
    for (const row of ingredientRows) {
      const list = ingredientNamesByRecipe.get(row.recipeId) ?? [];
      list.push(String(row.ingredient?.name || '').toLowerCase());
      ingredientNamesByRecipe.set(row.recipeId, list);
    }

    const dogLifeStage = this.resolveLifeStageKeyword(dog);

    const items = recipes.map((recipe) => {
      const owner = recipe.customerOwnerId
        ? ownerMap.get(recipe.customerOwnerId)
        : undefined;
      const ownedDog = recipe.customerDogId
        ? dogMap.get(recipe.customerDogId)
        : undefined;

      const isCustom = recipe.status === 'PRIVATE_CUSTOM';
      const kind = !isCustom
        ? 'WINDOW'
        : recipe.customerOwnerId && recipe.customerOwnerId === customerId
          ? 'OWN_CUSTOM'
          : 'OTHER_CUSTOM';

      const reasons: string[] = [];
      const ingredientNames = ingredientNamesByRecipe.get(recipe.recipeId) ?? [];
      for (const allergen of allergens) {
        const hit = ingredientNames.find(
          (name) => name.includes(allergen) || allergen.includes(name),
        );
        if (hit) {
          reasons.push(
            `${dog.name} 的档案里记了「${allergen}」过敏，这条配方用到 ${hit}`,
          );
          break;
        }
      }

      const stages = this.normalizeLifeStages(recipe.applicableLifeStages);
      if (
        stages.length > 0 &&
        dogLifeStage &&
        !stages.some((stage) => stage.includes(dogLifeStage))
      ) {
        reasons.push(
          `这条配方的适用阶段是 ${stages.join('/')}，${dog.name} 目前按 ${dogLifeStage} 算`,
        );
      }

      return {
        id: recipe.recipeId,
        internalId: recipe.id,
        version: recipe.version,
        name: recipe.name,
        status: recipe.status,
        sourceLabel: isCustom ? '专属成品' : '公开成品',
        coverImageUrl:
          recipe.coverImageUrl?.replace('http://', 'https://') ?? null,
        ownership: {
          kind,
          customerId: recipe.customerOwnerId ?? null,
          customerName: this.resolveCustomerName(owner),
          dogId: recipe.customerDogId ?? null,
          dogName: ownedDog?.name ?? null,
          breedName: ownedDog ? breedMap.get(ownedDog.breedId) ?? null : null,
        },
        fit: {
          level: reasons.length > 0 ? 'WARN' : 'OK',
          reasons,
        },
      };
    });

    const filtered = keyword
      ? items.filter((item) =>
          [
            item.name,
            item.ownership.customerName,
            item.ownership.dogName,
          ].some((value) =>
            String(value || '')
              .toLowerCase()
              .includes(keyword),
          ),
        )
      : items;

    const start = (page - 1) * pageSize;
    return ApiResponseDto.success({
      items: filtered.slice(start, start + pageSize),
      total: filtered.length,
    });
  }

  /**
   * 代客下单的饭量预览：按狗狗体重 + 食谱能量密度算每天吃多少克。
   */
  @Get('dogs/:dogId/portion-preview')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Admin assisted-order portion preview' })
  async previewPortion(
    @Param('dogId') dogId: string,
    @Query() query: { recipeId?: string; days?: string },
  ) {
    const recipeId = String(query.recipeId || '').trim();
    if (!recipeId) {
      return ApiResponseDto.error(400, 'recipeId is required');
    }
    const days = Number(query.days) > 0 ? Number(query.days) : 7;

    try {
      const data = await this.orderService.previewPortionForDog(
        dogId,
        recipeId,
        days,
      );
      return ApiResponseDto.success(data);
    } catch (error) {
      if (error instanceof NotFoundException) {
        return ApiResponseDto.error(404, error.message);
      }
      if (error instanceof BadRequestException) {
        return ApiResponseDto.error(400, error.message);
      }
      throw error;
    }
  }

  /**
   * 员工报价预览：用**顾客**的身份算，但不落价格快照。
   */
  @Post('orders/pricing-preview')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Admin assisted-order pricing preview' })
  async previewAssistedPricing(@Body() body: any) {
    try {
      const customerId = String(body?.customerId || '').trim();
      const dogId = String(body?.dogId || '').trim();
      const items = Array.isArray(body?.items) ? body.items : [];
      const addressId = body?.addressId ? String(body.addressId).trim() : undefined;

      if (!customerId || !dogId || items.length === 0) {
        return ApiResponseDto.error(400, 'customerId, dogId and items are required');
      }

      const dog = await this.prisma.dog.findUnique({
        where: { id: dogId },
        select: { id: true, ownerId: true },
      });
      if (!dog) {
        return ApiResponseDto.error(404, 'Dog not found');
      }
      if (dog.ownerId !== customerId) {
        return ApiResponseDto.error(400, 'Dog does not belong to this customer');
      }

      const preview = await this.orderService.previewPricing({
        customerId,
        dogId,
        type: body?.type || 'FRESH_FOOD',
        pricingPurpose: 'STAFF_PREVIEW',
        addressId,
        items,
      } as any);

      return ApiResponseDto.success({
        amountProduct: preview.amountProduct,
        amountShipping: preview.amountShipping,
        amountTotal: preview.amountTotal,
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        return ApiResponseDto.error(404, error.message);
      }
      if (error instanceof BadRequestException) {
        return ApiResponseDto.error(400, error.message);
      }
      throw error;
    }
  }

  /**
   * 给指定顾客建一条收货地址（无账号顾客没有小程序，只能由管理员代录）。
   */
  @Post('customers/:customerId/addresses')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create an address for a customer (admin)' })
  async createCustomerAddress(
    @Param('customerId') customerId: string,
    @Body() body: any,
  ) {
    const recipientName = String(body?.recipientName || '').trim();
    const phone = String(body?.phone || '').trim();
    const detail = String(body?.detail || '').trim();
    const region = body?.region || {};

    if (!recipientName || !phone || !detail) {
      return ApiResponseDto.error(400, '收货人、电话、详细地址都不能为空');
    }
    if (!region.province || !region.city) {
      return ApiResponseDto.error(400, '请选择省市区');
    }

    const customer = await this.prisma.user.findUnique({
      where: { id: customerId },
      select: { id: true },
    });
    if (!customer) {
      return ApiResponseDto.error(404, 'Customer not found');
    }

    const address = await this.addressService.createAddress({
      userId: customerId,
      recipientName,
      phone,
      region: {
        province: String(region.province),
        city: String(region.city),
        district: String(region.district || ''),
      },
      detail,
      isDefault: Boolean(body?.isDefault),
    } as any);

    return ApiResponseDto.success({
      id: (address as any).id,
      userId: customerId,
      recipientName,
      phone,
      region: (address as any).region,
      detail,
      isDefault: Boolean((address as any).isDefault),
    });
  }

  /** 狗狗档案里的过敏原关键词（自由文本 + 过敏记录），统一小写去重 */
  private async loadDogAllergenKeywords(dog: {
    id: string;
    allergyFoods?: string | null;
  }): Promise<string[]> {
    const records = await this.prisma.allergyRecord.findMany({
      where: { dogId: dog.id },
      select: { allergen: true },
    });
    const raw = [
      ...String(dog.allergyFoods || '').split(/[,，、;；/\\s]+/),
      ...records.map((row) => row.allergen),
    ];
    const keywords = raw
      .map((value) => String(value || '').trim().toLowerCase())
      .filter((value) => value.length >= 1);
    return Array.from(new Set(keywords));
  }

  /** 粗判狗狗所处生命阶段（只用于"这条配方适用阶段对不对"的提示） */
  private resolveLifeStageKeyword(dog: {
    birthday?: Date | string | null;
    lifeStageOverride?: string | null;
  }): string | null {
    const override = String(dog.lifeStageOverride || '').toUpperCase();
    if (override && override !== 'AUTO') {
      return override;
    }
    if (!dog.birthday) return null;
    const birthday = new Date(dog.birthday);
    if (Number.isNaN(birthday.getTime())) return null;
    const ageMonths =
      (Date.now() - birthday.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
    if (ageMonths < 12) return 'PUPPY';
    if (ageMonths >= 84) return 'SENIOR';
    return 'ADULT';
  }

  private normalizeLifeStages(value: any): string[] {
    if (!Array.isArray(value)) return [];
    return value
      .map((stage) => {
        if (typeof stage === 'string') return stage;
        if (stage && typeof stage === 'object') {
          return String(stage.code || stage.stage || stage.lifeStage || '');
        }
        return '';
      })
      .map((stage) => stage.toUpperCase())
      .filter(Boolean);
  }

  private resolveCustomerName(owner: any): string | null {
    if (!owner) return null;
    return (
      owner.nickname ||
      owner.guestContactName ||
      owner.phone ||
      owner.guestContactPhone ||
      null
    );
  }

}
