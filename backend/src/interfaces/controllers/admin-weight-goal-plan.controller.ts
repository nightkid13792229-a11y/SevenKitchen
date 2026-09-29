import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { WeightGoalPlanService } from '../../application/weight-goal-plan/weight-goal-plan.service';
import { AuthGuard } from '../auth';
import { AdminGuard } from '../guards/role.guard';
import { ApiResponseDto } from '../dto/common/response.dto';
import {
  WeightGoalDirection,
  WeightGoalPlanStatus,
} from '../../domain/dog/enums';

/**
 * 体重管理计划 · 管理后台（阶段 B3）
 *
 * 客服与营养师在这里看：谁的狗在减重、进行到哪一步、系统为什么调过热量。
 * 「为什么这个月热量降了」必须查得到依据 —— 否则客服没法回答顾客。
 *
 * 只读：不提供后台改计划的能力。计划是顾客自己的方案，
 * 调整要么由顾客操作，要么由系统按实测速率自动做。
 */
@ApiTags('AdminWeightGoalPlan')
@Controller('api/v1/admin/weight-goal-plan')
@UseGuards(AuthGuard, AdminGuard)
@ApiSecurity('X-Customer-Id')
export class AdminWeightGoalPlanController {
  constructor(private readonly planService: WeightGoalPlanService) {}

  @Get()
  @ApiOperation({ summary: '计划列表（可按状态 / 方向筛选，支持关键词搜索）' })
  @ApiQuery({ name: 'status', required: false, enum: WeightGoalPlanStatus })
  @ApiQuery({ name: 'direction', required: false, enum: WeightGoalDirection })
  @ApiQuery({ name: 'keyword', required: false, type: String, description: '狗名 / 品种 / 主人昵称 / 手机号' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  async list(
    @Query('status') status?: string,
    @Query('direction') direction?: string,
    @Query('keyword') keyword?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const result = await this.planService.listForAdmin({
      status: this.normalizeEnum(status, WeightGoalPlanStatus),
      direction: this.normalizeEnum(direction, WeightGoalDirection),
      keyword,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });

    return ApiResponseDto.success(result);
  }

  @Get(':planId')
  @ApiOperation({ summary: '计划详情 + 完整调整历史' })
  @ApiParam({ name: 'planId', description: 'WeightGoalPlan ID' })
  async detail(@Param('planId') planId: string) {
    const detail = await this.planService.getDetailForAdmin(planId);
    if (!detail) {
      throw new NotFoundException('计划不存在');
    }
    return ApiResponseDto.success(detail);
  }

  /**
   * 把查询参数收敛到合法枚举值。
   *
   * 不合法就当作「不筛选」而不是报错 —— 后台列表的筛选条件来自下拉框，
   * 传个旧值不该把整个列表打成 500。
   */
  private normalizeEnum<T extends Record<string, string>>(
    value: string | undefined,
    enumObj: T,
  ): string | undefined {
    if (!value) return undefined;
    const allowed = Object.values(enumObj) as string[];
    return allowed.includes(value) ? value : undefined;
  }
}
