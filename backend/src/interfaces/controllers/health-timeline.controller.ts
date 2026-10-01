import {
  Controller,
  Get,
  Param,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiSecurity,
  ApiHeader,
} from '@nestjs/swagger';
import { HealthTimelineService } from '../../application/health/health-timeline.service';
import { ApiResponseDto } from '../dto/common/response.dto';
import { AuthGuard, CurrentUser } from '../auth';
import type { RequestUser } from '../auth';

/**
 * 健康时间线 / 就诊前摘要（2026-10-01，第二期）。
 *
 * 单独一个控制器而不是塞进 health-records：这两个接口是**只读聚合**，
 * 与逐条记录的增删改查不是一回事，混在一起会让那个控制器越来越长。
 */
@ApiTags('Health Timeline')
@Controller('api/v1/dogs')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class HealthTimelineController {
  constructor(private readonly timelineService: HealthTimelineService) {}

  @Get(':dogId/health/timeline')
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: 'Get the health timeline of a dog (all record types merged by date)',
  })
  @ApiSecurity('X-Customer-Id')
  @ApiHeader({
    name: 'X-Customer-Id',
    description: 'Customer ID for authentication',
    required: true,
  })
  @ApiParam({ name: 'dogId', description: 'Dog ID' })
  @ApiResponse({ status: 200, description: 'Timeline retrieved successfully' })
  async getTimeline(
    @Param('dogId') dogId: string,
    @CurrentUser() user: RequestUser,
  ) {
    const data = await this.timelineService.getTimeline(user.customerId, dogId);
    return ApiResponseDto.success(data);
  }

  @Get(':dogId/health/visit-summary')
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: 'Get the pre-visit summary of a dog (what the vet needs first)',
  })
  @ApiSecurity('X-Customer-Id')
  @ApiHeader({
    name: 'X-Customer-Id',
    description: 'Customer ID for authentication',
    required: true,
  })
  @ApiParam({ name: 'dogId', description: 'Dog ID' })
  @ApiResponse({ status: 200, description: 'Summary retrieved successfully' })
  async getVisitSummary(
    @Param('dogId') dogId: string,
    @CurrentUser() user: RequestUser,
  ) {
    const data = await this.timelineService.getVisitSummary(
      user.customerId,
      dogId,
    );
    return ApiResponseDto.success(data);
  }
}
