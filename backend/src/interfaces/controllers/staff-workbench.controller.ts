import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import {
  AftersaleType,
  InventoryStocktakeStatus,
  OrderStatus,
  PackagingUnitStatus,
  PurchaseListStatus,
  ReimbursementStatus,
  type Prisma,
} from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma.service';
import { AuthGuard } from '../auth/auth.guard';
import { UserId, UserRole } from '../auth/user.decorator';
import { ApiResponseDto } from '../dto/common/response.dto';
import { StaffGuard } from '../guards/role.guard';

interface StaffWorkbenchSummary {
  todayOrders: number;
  pendingTasks: number;
  shippingCount: number;
  badges: {
    purchasing: number;
    production: number;
    orders: number;
    refunds: number;
    reimbursement: number;
    inventory: number;
  };
}

@ApiTags('Staff Workbench')
@Controller('api/v1/staff/workbench')
@UseGuards(AuthGuard, StaffGuard)
@ApiSecurity('bearer')
export class StaffWorkbenchController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('summary')
  @ApiOperation({ summary: '获取员工/管理员工作台待处理数量' })
  async getSummary(
    @UserId() userId: string,
    @UserRole() role: string,
  ): Promise<ApiResponseDto<StaffWorkbenchSummary>> {
    const { start, end } = getShanghaiTodayRange();
    const reimbursementWhere: Prisma.ReimbursementWhereInput =
      role === 'ADMIN'
        ? { status: ReimbursementStatus.PENDING_REVIEW }
        : {
            submittedById: userId,
            status: {
              in: [
                ReimbursementStatus.PENDING_REVIEW,
                ReimbursementStatus.REQUIRES_RESUBMIT,
              ],
            },
          };

    const [
      todayOrders,
      purchasePending,
      productionPending,
      orderPending,
      shippingCount,
      refundPending,
      reimbursementPending,
      inventoryPending,
    ] = await Promise.all([
      this.prisma.order.count({
        where: {
          createdAt: {
            gte: start,
            lt: end,
          },
        },
      }),
      this.prisma.purchaseList.count({
        where: { status: PurchaseListStatus.PENDING },
      }),
      this.prisma.packagingUnit.count({
        where: {
          status: {
            in: [PackagingUnitStatus.PENDING, PackagingUnitStatus.IN_PROGRESS],
          },
        },
      }),
      this.prisma.order.count({
        where: {
          status: OrderStatus.FREEZING,
        },
      }),
      this.prisma.order.count({
        where: { status: OrderStatus.FREEZING },
      }),
      this.prisma.order.count({
        where: {
          status: OrderStatus.AFTERSALE,
          aftersaleType: AftersaleType.REFUND,
        },
      }),
      this.prisma.reimbursement.count({ where: reimbursementWhere }),
      this.prisma.inventoryStocktake.count({
        where: { status: InventoryStocktakeStatus.DRAFT },
      }),
    ]);

    const badges = {
      purchasing: purchasePending,
      production: productionPending,
      orders: orderPending,
      refunds: role === 'ADMIN' ? refundPending : 0,
      reimbursement: reimbursementPending,
      inventory: inventoryPending,
    };

    return ApiResponseDto.success({
      todayOrders,
      pendingTasks: Object.values(badges).reduce(
        (sum, count) => sum + count,
        0,
      ),
      shippingCount,
      badges,
    });
  }
}

function getShanghaiTodayRange(): { start: Date; end: Date } {
  const now = new Date();
  const shanghaiNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const startUtcMs =
    Date.UTC(
      shanghaiNow.getUTCFullYear(),
      shanghaiNow.getUTCMonth(),
      shanghaiNow.getUTCDate(),
    ) -
    8 * 60 * 60 * 1000;

  return {
    start: new Date(startUtcMs),
    end: new Date(startUtcMs + 24 * 60 * 60 * 1000),
  };
}
