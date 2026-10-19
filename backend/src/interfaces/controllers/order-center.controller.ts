import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
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
}
