import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { WeightGoalPlanService } from '../../application/weight-goal-plan/weight-goal-plan.service';
import { AuthGuard, CurrentUser } from '../auth';
import type { RequestUser } from '../auth';
import { ApiResponseDto } from '../dto/common/response.dto';
// 被 @Body() 装饰的参数类型必须用 import type —— 开了 isolatedModules +
// emitDecoratorMetadata 时，值导入会被要求提供运行时元数据，而这些是纯接口。
import type {
  CreateWeightGoalPlanDto,
  UpdateWeightGoalIntensityDto,
  UpdateWeightGoalTargetDto,
} from '../dto/weight-goal-plan/weight-goal-plan.dto';
import { WEIGHT_GAIN_SCREENING_QUESTIONS } from '../../domain/dog/weight-goal-plan';

/**
 * 体重管理计划（阶段 B）
 *
 * 路径挂在狗狗下：一只狗同时只有一个未结束的计划，所以不需要计划 id 作为路径参数。
 * 顾客身份一律取自 `@CurrentUser()`，**绝不从 body/query 取 customerId**
 * —— 全局 ValidationPipe 没开 whitelist，从请求里取归属会被伪造。
 */
@ApiTags('WeightGoalPlan')
@Controller('api/v1/dogs/:dogId/weight-goal-plan')
@UseGuards(AuthGuard)
@ApiSecurity('X-Customer-Id')
export class WeightGoalPlanController {
  constructor(private readonly planService: WeightGoalPlanService) {}

  @Get('suggestion')
  @ApiOperation({ summary: '系统建议方案（不落库，供「新建计划」第 1 步展示）' })
  @ApiParam({ name: 'dogId', description: 'Dog ID' })
  async getSuggestion(
    @Param('dogId') dogId: string,
    @CurrentUser() user: RequestUser,
  ) {
    const suggestion = await this.planService.getSuggestion(user.customerId, dogId);

    return ApiResponseDto.success({
      suggestion,
      // 增重方向要先把这 5 个问题答完；问题清单由后端下发，前端不写死
      screeningQuestions: WEIGHT_GAIN_SCREENING_QUESTIONS.map((q) => ({
        key: q.key,
        title: q.title,
      })),
    });
  }

  @Get()
  @ApiOperation({ summary: '查当前计划与进度' })
  @ApiParam({ name: 'dogId', description: 'Dog ID' })
  async getCurrent(
    @Param('dogId') dogId: string,
    @CurrentUser() user: RequestUser,
  ) {
    const plan = await this.planService.getCurrentPlan(user.customerId, dogId);
    return ApiResponseDto.success(plan);
  }

  @Get('adjustments')
  @ApiOperation({ summary: '计划的调整历史（每次自动/手动调整一条）' })
  @ApiParam({ name: 'dogId', description: 'Dog ID' })
  async getAdjustments(
    @Param('dogId') dogId: string,
    @CurrentUser() user: RequestUser,
  ) {
    const adjustments = await this.planService.getAdjustments(user.customerId, dogId);
    return ApiResponseDto.success(adjustments);
  }

  @Post()
  @ApiOperation({ summary: '新建计划' })
  @ApiParam({ name: 'dogId', description: 'Dog ID' })
  @ApiBody({ type: Object })
  @ApiResponse({ status: 201, description: '计划已建立' })
  async create(
    @Param('dogId') dogId: string,
    @Body() dto: CreateWeightGoalPlanDto,
    @CurrentUser() user: RequestUser,
  ) {
    const plan = await this.planService.createPlan(user.customerId, dogId, dto);
    return ApiResponseDto.success(plan);
  }

  @Put('target')
  @ApiOperation({ summary: '改目标体重（完全自由可调，偏离过大只提示不拦）' })
  @ApiParam({ name: 'dogId', description: 'Dog ID' })
  async updateTarget(
    @Param('dogId') dogId: string,
    @Body() dto: UpdateWeightGoalTargetDto,
    @CurrentUser() user: RequestUser,
  ) {
    const plan = await this.planService.updateTargetWeight(
      user.customerId,
      dogId,
      dto,
    );
    return ApiResponseDto.success(plan);
  }

  @Put('intensity')
  @ApiOperation({ summary: '改力度（只能往更温和方向调）' })
  @ApiParam({ name: 'dogId', description: 'Dog ID' })
  async updateIntensity(
    @Param('dogId') dogId: string,
    @Body() dto: UpdateWeightGoalIntensityDto,
    @CurrentUser() user: RequestUser,
  ) {
    const plan = await this.planService.updateIntensity(
      user.customerId,
      dogId,
      dto,
    );
    return ApiResponseDto.success(plan);
  }

  @Put('resume')
  @ApiOperation({ summary: '从暂停恢复（孕哺结束、或补称了体重）' })
  @ApiParam({ name: 'dogId', description: 'Dog ID' })
  async resume(
    @Param('dogId') dogId: string,
    @CurrentUser() user: RequestUser,
  ) {
    const plan = await this.planService.resumePlan(user.customerId, dogId);
    return ApiResponseDto.success(plan);
  }

  @Delete()
  @ApiOperation({ summary: '结束计划（能量立即恢复默认维持量）' })
  @ApiParam({ name: 'dogId', description: 'Dog ID' })
  async end(
    @Param('dogId') dogId: string,
    @CurrentUser() user: RequestUser,
  ) {
    await this.planService.finishPlan(user.customerId, dogId, 'END');
    return ApiResponseDto.success({ ended: true });
  }

  @Delete('cancel')
  @ApiOperation({ summary: '取消计划（中途放弃，可重新新建）' })
  @ApiParam({ name: 'dogId', description: 'Dog ID' })
  async cancel(
    @Param('dogId') dogId: string,
    @CurrentUser() user: RequestUser,
  ) {
    await this.planService.finishPlan(user.customerId, dogId, 'CANCEL');
    return ApiResponseDto.success({ cancelled: true });
  }
}
