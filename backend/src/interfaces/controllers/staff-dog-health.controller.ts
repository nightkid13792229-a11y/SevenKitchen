import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBody,
  ApiSecurity,
} from '@nestjs/swagger';
import { StaffDogHealthService } from '../../application/health/staff-dog-health.service';
import { ApiResponseDto } from '../dto/common/response.dto';
import { AuthGuard } from '../auth';
import { StaffGuard } from '../guards/role.guard';

/**
 * 营养师端 · 健康档案（2026-10-01，第八期）。
 *
 * 老板第 22–25 条：
 *   22. 营养师独立页面看某只狗的完整健康分析
 *   23. 顾客上传的报告原件后台要能看到
 *   24. 营养师/管理员能修改健康标签用来纠错
 *   25. 顾客改了健康信息，要告知正在为这只狗设计食谱的营养师
 *
 * 鉴权用 StaffGuard（STAFF + ADMIN）：营养师是 STAFF，不是 ADMIN。
 */
@ApiTags('Staff Dog Health')
@Controller('api/v1/admin/dogs')
@UseGuards(AuthGuard, StaffGuard)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class StaffDogHealthController {
  constructor(private readonly staffHealthService: StaffDogHealthService) {}

  /** ⚠️ 路由顺序：health-updates 必须排在 :dogId 之前，否则会被当成 dogId */
  @Get('health-updates')
  @ApiOperation({
    summary: 'Dogs whose health records changed recently (with active orders)',
  })
  @ApiSecurity('bearer')
  @ApiQuery({ name: 'days', required: false, description: '回看天数，默认 7' })
  @ApiResponse({ status: 200, description: 'Updates retrieved successfully' })
  async listHealthUpdates(@Query('days') days?: string) {
    const data = await this.staffHealthService.listHealthUpdates({
      days: days ? Number(days) : undefined,
    });
    return ApiResponseDto.success(data);
  }

  @Get(':dogId/health-overview')
  @ApiOperation({ summary: 'Full health overview of a dog for staff' })
  @ApiSecurity('bearer')
  @ApiParam({ name: 'dogId', description: 'Dog ID' })
  @ApiResponse({ status: 200, description: 'Overview retrieved successfully' })
  async getHealthOverview(@Param('dogId') dogId: string) {
    const data = await this.staffHealthService.getHealthOverview(dogId);
    return ApiResponseDto.success(data);
  }

  @Put(':dogId/health-tags')
  @ApiOperation({ summary: 'Correct the health tags of a dog (staff only)' })
  @ApiSecurity('bearer')
  @ApiParam({ name: 'dogId', description: 'Dog ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        added: { type: 'array', items: { type: 'string' } },
        removed: { type: 'array', items: { type: 'string' } },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Tags updated successfully' })
  async setHealthTags(
    @Param('dogId') dogId: string,
    @Body() body: { added?: string[]; removed?: string[] },
  ) {
    const data = await this.staffHealthService.setHealthTagOverrides(dogId, body || {});
    return ApiResponseDto.success(data);
  }
}
