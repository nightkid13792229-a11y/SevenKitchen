import {
  Body,
  Controller,
  Delete,
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
  ApiHeader,
} from '@nestjs/swagger';
import { VaccinePlanService } from '../../application/health/vaccine-plan.service';
import { ApiResponseDto } from '../dto/common/response.dto';
import { AuthGuard, CurrentUser } from '../auth';
import type { RequestUser } from '../auth';

/**
 * 疫苗计划（2026-10-01，第四期）。
 *
 * 老板第 15–18 条：按免疫程序提醒还缺哪些、什么时候打；首选 WSAVA 指南、
 * 结合国内法规；**引导顾客自己决策**；顾客计划与我们不一致时提醒；
 * 提醒只在小程序内（不碰订阅消息）。
 *
 * ⚠️ 顾客侧默认关闭（`VACCINE_PLAN=customer` 才开）：
 *    免疫程序表尚未经兽医审核，老板定了"未经专业审核的兽医内容不得对顾客开放"。
 */
@ApiTags('Vaccine Plan')
@Controller('api/v1/dogs')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class VaccinePlanController {
  constructor(private readonly vaccinePlanService: VaccinePlanService) {}

  @Get(':dogId/vaccine-plan')
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: 'Get the vaccine plan of a dog (customer view, gated by VACCINE_PLAN)',
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
  @ApiResponse({ status: 200, description: 'Plan retrieved successfully' })
  async getPlan(
    @Param('dogId') dogId: string,
    @Query('audience') audience: string | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    const data = await this.vaccinePlanService.getPlan(
      user.customerId,
      dogId,
      audience === 'staff' ? 'staff' : 'customer',
    );
    return ApiResponseDto.success(data);
  }

  @Get(':dogId/vaccine-plan/schedule')
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: 'Get the full immunization schedule of a dog (for staff review)',
  })
  @ApiSecurity('X-Customer-Id')
  @ApiHeader({
    name: 'X-Customer-Id',
    description: 'Customer ID for authentication',
    required: true,
  })
  @ApiParam({ name: 'dogId', description: 'Dog ID' })
  @ApiResponse({ status: 200, description: 'Schedule retrieved successfully' })
  async getSchedule(
    @Param('dogId') dogId: string,
    @CurrentUser() user: RequestUser,
  ) {
    const data = await this.vaccinePlanService.getSchedule(user.customerId, dogId);
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
  @ApiParam({ name: 'stepKey', description: 'Schedule step key, e.g. core-puppy-1' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        decision: {
          type: 'string',
          enum: ['ACCEPT', 'DEFER', 'SKIP'],
          description: '按建议 / 推迟 / 不做',
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Decision saved successfully' })
  async setDecision(
    @Param('dogId') dogId: string,
    @Param('stepKey') stepKey: string,
    @Body() body: { decision?: string },
    @CurrentUser() user: RequestUser,
  ) {
    const data = await this.vaccinePlanService.setDecision(
      user.customerId,
      dogId,
      stepKey,
      String(body?.decision || ''),
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
