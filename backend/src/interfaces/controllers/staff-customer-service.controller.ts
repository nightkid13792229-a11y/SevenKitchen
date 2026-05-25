import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../infrastructure/prisma.service';
import { OrderService } from '../../application/order/order.service';
import { ApiResponseDto } from '../dto/common/response.dto';
import { AuthGuard, CurrentUser, type RequestUser } from '../auth';
import { StaffGuard } from '../guards/role.guard';

const LOCKED_ADDRESS_STATUSES = new Set(['SHIPPED', 'COMPLETED', 'CANCELLED']);

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

@ApiTags('Staff Customer Service')
@Controller('api/v1/staff/customer-service')
@UseGuards(AuthGuard, StaffGuard)
export class StaffCustomerServiceController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orderService: OrderService,
  ) {}

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
            hasRefundRequest &&
            paid &&
            !alreadyRefunded,
          canRetryRefund:
            isAdmin &&
            hasRefundRequest &&
            paid &&
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
          adminRemark: true,
        },
      });

      if (!order) {
        return ApiResponseDto.error(404, 'Order not found');
      }

      const paid = order.paymentStatus === 'SUCCESS' || Boolean(order.paidAt);
      if (paid || !['INIT', 'PENDING_PAYMENT'].includes(order.status)) {
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
