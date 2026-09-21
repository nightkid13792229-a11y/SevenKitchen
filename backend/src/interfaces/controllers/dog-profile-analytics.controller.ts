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
    // 逐字段显式取用，而不是 { customerId, ...dto }。
    // 后者在全局 ValidationPipe 关闭 whitelist 的前提下，客户端只要在 body 里
    // 塞一个 customerId 就能覆盖服务端解析出的归属，污染转化分析。
    await this.analyticsService.track({
      customerId: user.customerId,
      eventName: dto.eventName,
      mode: dto.mode,
      dogId: dto.dogId ?? null,
      entrySource: dto.entrySource ?? null,
      stepName: dto.stepName ?? null,
      moduleName: dto.moduleName ?? null,
      hasDraft: dto.hasDraft ?? null,
      calcStatus: dto.calcStatus ?? null,
      submitStatus: dto.submitStatus ?? null,
      properties: dto.properties ?? null,
    });

    return ApiResponseDto.success({ ok: true });
  }
}
