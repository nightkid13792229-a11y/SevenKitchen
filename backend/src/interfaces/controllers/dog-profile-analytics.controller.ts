import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DogProfileAnalyticsService } from '../../application/analytics/dog-profile-analytics.service';
import { AuthGuard, CurrentUser } from '../auth';
import type { RequestUser } from '../auth';
import { TrackDogProfileEventDto } from '../dto/analytics/track-dog-profile-event.dto';
import { ApiResponseDto } from '../dto/common/response.dto';

@ApiTags('DogProfileAnalytics')
@Controller('api/v1/analytics/dog-profile')
export class DogProfileAnalyticsController {
  constructor(
    private readonly analyticsService: DogProfileAnalyticsService,
  ) {}

  @Post('events')
  @UseGuards(AuthGuard)
  async trackEvent(
    @Body() dto: TrackDogProfileEventDto,
    @CurrentUser() user: RequestUser,
  ) {
    await this.analyticsService.track({
      customerId: user.customerId,
      ...dto,
    });

    return ApiResponseDto.success({ ok: true });
  }
}
