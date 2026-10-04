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
 * ✅ 顾客侧已开放（2026-10-02 起）：知识库 189 条经合作兽医全数审核通过，
 *    生产环境开了 `HEALTH_ANALYSIS=customer`。
 *    本服务只允许引用知识条目，且顾客侧只认审核登记表里的条目 ——
 *    没审过的条目给不出、也不会给顾客看。
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
