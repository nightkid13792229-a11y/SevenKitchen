import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { OrderCenterService } from '../../application/order-center/order-center.service';
import { OrderCenterQueryDto } from '../dto/supplement-prepack.dto';
import { ApiResponseDto } from '../dto/common/response.dto';
import { AuthGuard } from '../auth';
import { StaffGuard } from '../guards/role.guard';

@ApiTags('Admin Order Center')
@Controller('api/v1/admin/order-center')
@UseGuards(AuthGuard, StaffGuard)
export class OrderCenterController {
  constructor(private readonly orderCenterService: OrderCenterService) {}

  @Get()
  @ApiSecurity('X-Admin-Token')
  @ApiOperation({
    summary: '三类订单统一读模型（只读）；员工端金额由后端脱敏',
  })
  async list(
    @Query() query: OrderCenterQueryDto,
    @Req() request: { user?: { role?: string } },
  ) {
    return ApiResponseDto.success(
      await this.orderCenterService.list(query, {
        role: request.user?.role,
      }),
    );
  }

  /**
   * 员工端「这一单下单当时那版食谱」（只读，2026-10-30）。
   *
   * ⚠️ 路由顺序：必须排在 `@Get()` 之后也没关系，
   * 但**不能**再加任何 `:id` 形式的单段路由，
   * 否则 items/:itemId/snapshot 会被它抢走。
   */
  @Get('items/:itemId/snapshot')
  @ApiSecurity('X-Admin-Token')
  @ApiOperation({ summary: '鲜食订单项的下单快照（只读，员工端）' })
  @ApiParam({ name: 'itemId', description: 'Order item id' })
  async getItemSnapshot(@Param('itemId') itemId: string) {
    const data = await this.orderCenterService.getItemSnapshot(itemId);
    if (!data) return ApiResponseDto.error(404, '订单项不存在');
    return ApiResponseDto.success(data);
  }
}
