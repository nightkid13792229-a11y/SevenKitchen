import {
  Controller,
  Get,
  Param,
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
  ApiSecurity,
  ApiHeader,
} from '@nestjs/swagger';
import { HealthAnalysisService } from '../../application/health/health-analysis.service';
import { ApiResponseDto } from '../dto/common/response.dto';
import { AuthGuard, CurrentUser } from '../auth';
import type { RequestUser } from '../auth';

/**
 * AI 健康分析与建议（2026-10-01，第七期）。
 *
 * 老板第 19–21 条：七项产出；不做诊断只做初步分析；
 * 顾客与营养师都能看，顾客侧要有免责声明。
 *
 * ⚠️ 顾客侧默认关闭（`HEALTH_ANALYSIS=customer` 才开）：
 *    知识库里的免疫/化验/就医时机条目尚未经兽医审核，
 *    而本服务只允许引用知识条目 —— 没有已审核条目就没法给顾客看有依据的结论。
 *
 * ⚠️ 免责声明**不在这里返回**，由前端写死：
 *    AI 不该有机会改写"这不构成诊断"这句话。
 */
@ApiTags('Health Analysis')
@Controller('api/v1/dogs')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class HealthAnalysisController {
  constructor(private readonly analysisService: HealthAnalysisService) {}

  @Get(':dogId/health-analysis')
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: 'Generate the AI health analysis of a dog (gated by HEALTH_ANALYSIS)',
  })
  @ApiSecurity('X-Customer-Id')
  @ApiHeader({
    name: 'X-Customer-Id',
    description: 'Customer ID for authentication',
    required: true,
  })
  @ApiParam({ name: 'dogId', description: 'Dog ID' })
  @ApiQuery({
    name: 'audience',
    required: false,
    enum: ['customer', 'staff'],
    description: 'staff 用于营养师/管理端，不受顾客侧开关限制',
  })
  @ApiResponse({ status: 200, description: 'Analysis generated successfully' })
  async analyze(
    @Param('dogId') dogId: string,
    @Query('audience') audience: string | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    const data = await this.analysisService.analyze(
      user.customerId,
      dogId,
      audience === 'staff' ? 'nutritionist' : 'customer',
    );
    return ApiResponseDto.success(data);
  }
}
