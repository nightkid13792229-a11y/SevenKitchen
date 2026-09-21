import { Body, Controller, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ProductFunnelAnalyticsService } from '../../application/analytics/product-funnel-analytics.service';
import { JwtAuthService } from '../auth';
import { TrackFunnelEventDto } from '../dto/analytics/track-funnel-event.dto';
import { ApiResponseDto } from '../dto/common/response.dto';

interface MinimalRequest {
  headers?: Record<string, string | string[] | undefined>;
}

@ApiTags('ProductFunnelAnalytics')
@Controller('api/v1/analytics/funnel')
export class ProductFunnelAnalyticsController {
  constructor(
    private readonly funnelService: ProductFunnelAnalyticsService,
    private readonly jwtAuthService: JwtAuthService,
  ) {}

  @Post('events')
  @ApiOperation({
    summary: '记录成品鲜食链路漏斗事件（允许匿名，写入失败不影响主流程）',
  })
  async trackEvent(
    @Body() dto: TrackFunnelEventDto,
    @Req() request: MinimalRequest,
  ) {
    // 刻意不使用 AuthGuard：登录前的浏览与点击也必须能采集，
    // 否则漏斗的前半段永远是空的。
    await this.funnelService.track({
      customerId: this.tryResolveCustomerId(request),
      ...dto,
    });

    return ApiResponseDto.success({ ok: true });
  }

  /** 有 token 就归属到该用户，没有或已失效则记为匿名——都不阻断上报 */
  private tryResolveCustomerId(request: MinimalRequest): string | null {
    const authHeader = request?.headers?.authorization;
    if (!authHeader || typeof authHeader !== 'string') return null;

    const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!bearerMatch?.[1]) return null;

    try {
      const payload = this.jwtAuthService.validateToken(bearerMatch[1]);
      return payload.customerId || payload.userId || null;
    } catch {
      return null;
    }
  }
}
