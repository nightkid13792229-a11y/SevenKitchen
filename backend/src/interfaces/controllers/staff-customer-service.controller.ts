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
import { ApiResponseDto } from '../dto/common/response.dto';
import { AuthGuard, CurrentUser, type RequestUser } from '../auth';
import { StaffGuard } from '../guards/role.guard';

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
        ],
      },
      select: {
        id: true,
        nickname: true,
        phone: true,
        avatarUrl: true,
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
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create staff-assisted offline-payment order' })
  async createAssistedOrder(
    @Body() body: any,
    @CurrentUser() user: RequestUser,
  ) {
    try {
      const customerId = String(body.customerId || '').trim();
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

      const actor = user.role === 'ADMIN' ? 'admin' : 'staff';
      const createdOrder = await this.orderService.createOrderDraft({
        customerId,
        dogId,
        type: body.type || 'FRESH_FOOD',
        ingredientSourcePlan: body.ingredientSourcePlan,
        targetProductionDate: body.targetProductionDate
          ? new Date(body.targetProductionDate)
          : null,
        items,
        addressId,
      });

      await this.orderService.confirmOrder(createdOrder.id, actor, user.userId);

      const actualAmount = Number(body.actualAmount);
      if (Number.isFinite(actualAmount) && actualAmount >= 0) {
        await this.orderService.updateOrderAmount(createdOrder.id, actualAmount);
      }

      const auditLine = [
        `[代客下单] ${new Date().toISOString()}`,
        `操作人:${user.userId}`,
        `客户:${customerId}`,
        `狗狗:${dogId}`,
        Number.isFinite(actualAmount) && actualAmount >= 0
          ? `实际收款:${actualAmount.toFixed(2)}`
          : `实际收款:${toNumber(createdOrder.amountTotal).toFixed(2)}`,
        body.remark ? `备注:${String(body.remark).trim()}` : '',
      ]
        .filter(Boolean)
        .join(' ');
      await this.orderService.updateAdminRemark(
        createdOrder.id,
        [createdOrder.adminRemark, auditLine].filter(Boolean).join('\n'),
      );

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
            ingredientSourcePlan: item.ingredientSourcePlan,
            preparationMethod: item.preparationMethod,
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
      const auditLine = [
        `[客服改价] ${new Date().toISOString()}`,
        `操作人:${user.userId}`,
        `金额:${oldAmount.toFixed(2)} -> ${amount.toFixed(2)}`,
        `原因:${reason}`,
      ].join(' ');
      await this.orderService.updateAdminRemark(
        orderId,
        [order.adminRemark, auditLine].filter(Boolean).join('\n'),
      );

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
}
