import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { SupplementDashboardService } from '../../application/supplement-shop/supplement-dashboard.service';
import { ApiResponseDto } from '../dto/common/response.dto';
import { AuthGuard } from '../auth';
import { StaffGuard } from '../guards/role.guard';

@ApiTags('Admin Supplement Dashboard')
@Controller('api/v1/admin/supplement-shop/dashboard')
@UseGuards(AuthGuard, StaffGuard)
export class SupplementDashboardController {
  constructor(private readonly dashboardService: SupplementDashboardService) {}

  @Get()
  @ApiSecurity('X-Admin-Token')
  @ApiOperation({ summary: '补剂看板：今日/待排/待发/售后/本月退款' })
  async get(
    @Req() request: { user?: { role?: string } },
  ) {
    return ApiResponseDto.success(
      await this.dashboardService.getDashboard({
        role: request.user?.role,
      }),
    );
  }
}
