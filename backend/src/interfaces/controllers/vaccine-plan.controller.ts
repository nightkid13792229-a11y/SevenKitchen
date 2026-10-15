import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Put,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
  ApiSecurity,
  ApiHeader,
} from '@nestjs/swagger';
import { VaccinePlanService } from '../../application/health/vaccine-plan.service';
import { ApiResponseDto } from '../dto/common/response.dto';
import { AuthGuard, CurrentUser } from '../auth';
import type { RequestUser } from '../auth';

/**
 * 疫苗计划（2026-10-15 重做）。
 *
 * 主接口一次给全：`next`（下一针）+ `plan`（完整安排，后端已排好序）+
 * `ignored`（已忽略的 N 项，**真实值**）+ `rhythm`（之后那一句话）+
 * `pendingReview` + `conflicts`。前端只渲染，不做任何计算。
 *
 * ⚠️ 本次删掉的两样：
 *   · `audience` 查询参数 —— 营养师与顾客拿的是同一份（后端里本来就是 `void audience`）
 *   · `GET :dogId/vaccine-plan/schedule` —— 那是"给营养师看整套程序表"的旧口，
 *     可选疫苗已经不进计划（需求第四节），整套程序表不再有对外的意义
 */
@ApiTags('Vaccine Plan')
@Controller('api/v1/dogs')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class VaccinePlanController {
  constructor(private readonly vaccinePlanService: VaccinePlanService) {}

  @Get(':dogId/vaccine-plan')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Get the vaccine plan of a dog (next + full plan)' })
  @ApiSecurity('X-Customer-Id')
  @ApiHeader({
    name: 'X-Customer-Id',
    description: 'Customer ID for authentication',
    required: true,
  })
  @ApiParam({ name: 'dogId', description: 'Dog ID' })
  @ApiResponse({ status: 200, description: 'Plan retrieved successfully' })
  async getPlan(
    @Param('dogId') dogId: string,
    @CurrentUser() user: RequestUser,
  ) {
    const data = await this.vaccinePlanService.getPlan(user.customerId, dogId);
    return ApiResponseDto.success(data);
  }

  @Get(':dogId/vaccine-plan/decisions')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'List the owner decisions of a dog' })
  @ApiSecurity('X-Customer-Id')
  @ApiHeader({
    name: 'X-Customer-Id',
    description: 'Customer ID for authentication',
    required: true,
  })
  @ApiParam({ name: 'dogId', description: 'Dog ID' })
  async listDecisions(
    @Param('dogId') dogId: string,
    @CurrentUser() user: RequestUser,
  ) {
    const data = await this.vaccinePlanService.listDecisions(
      user.customerId,
      dogId,
    );
    return ApiResponseDto.success(data);
  }

  @Put(':dogId/vaccine-plan/decisions/:stepKey')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Record the owner decision for one schedule step' })
  @ApiSecurity('X-Customer-Id')
  @ApiHeader({
    name: 'X-Customer-Id',
    description: 'Customer ID for authentication',
    required: true,
  })
  @ApiParam({ name: 'dogId', description: 'Dog ID' })
  @ApiParam({
    name: 'stepKey',
    description: 'Schedule step key, e.g. core-puppy-1',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        decision: {
          type: 'string',
          enum: ['ACCEPT', 'DEFER', 'SKIP'],
          description: '按建议 / 推迟 / 不做',
        },
        reason: {
          type: 'string',
          enum: ['NOT_NOW', 'STOPPED'],
          description: '忽略的原因：这次先不打 / 不再接种了（可空）',
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Decision saved successfully' })
  async setDecision(
    @Param('dogId') dogId: string,
    @Param('stepKey') stepKey: string,
    @Body() body: { decision?: string; reason?: string },
    @CurrentUser() user: RequestUser,
  ) {
    const data = await this.vaccinePlanService.setDecision(
      user.customerId,
      dogId,
      stepKey,
      String(body?.decision || ''),
      body?.reason ?? null,
    );
    return ApiResponseDto.success(data);
  }

  @Delete(':dogId/vaccine-plan/decisions/:stepKey')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Clear the owner decision for one schedule step' })
  @ApiSecurity('X-Customer-Id')
  @ApiHeader({
    name: 'X-Customer-Id',
    description: 'Customer ID for authentication',
    required: true,
  })
  @ApiParam({ name: 'dogId', description: 'Dog ID' })
  @ApiParam({ name: 'stepKey', description: 'Schedule step key' })
  @ApiResponse({ status: 200, description: 'Decision cleared successfully' })
  async clearDecision(
    @Param('dogId') dogId: string,
    @Param('stepKey') stepKey: string,
    @CurrentUser() user: RequestUser,
  ) {
    const data = await this.vaccinePlanService.clearDecision(
      user.customerId,
      dogId,
      stepKey,
    );
    return ApiResponseDto.success(data);
  }
}
