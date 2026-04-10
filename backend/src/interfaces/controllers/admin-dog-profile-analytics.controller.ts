import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DogProfileAnalyticsService } from '../../application/analytics/dog-profile-analytics.service';
import { AuthGuard } from '../auth';
import { AdminGuard } from '../guards/role.guard';
import { ApiResponseDto } from '../dto/common/response.dto';

@ApiTags('AdminDogProfileAnalytics')
@Controller('api/v1/admin/analytics/dog-profile')
@UseGuards(AuthGuard, AdminGuard)
export class AdminDogProfileAnalyticsController {
  constructor(
    private readonly analyticsService: DogProfileAnalyticsService,
  ) {}

  @Get()
  async getSummary(@Query('from') from: string, @Query('to') to: string) {
    const summary = await this.analyticsService.getSummary({ from, to });
    return ApiResponseDto.success(summary);
  }
}
