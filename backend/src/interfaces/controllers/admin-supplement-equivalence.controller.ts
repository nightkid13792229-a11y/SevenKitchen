import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  SupplementEquivalenceService,
  type EquivalenceGroupStatus,
  type UpsertEquivalenceGroupInput,
} from '../../application/supplement-shop/supplement-equivalence.service';
import { ApiResponseDto } from '../dto/common/response.dto';
import { AuthGuard, CurrentUser } from '../auth';
import type { RequestUser } from '../auth';
import { AdminGuard, StaffGuard } from '../guards/role.guard';

/**
 * 补剂等价组 · 后台
 *
 * 读写由 staff 完成；审核（通过/驳回/停用）与删除只有管理员能操作，
 * 对应老板“我自己签字”的口径（2026-10-26）。
 */
@ApiTags('Admin Supplement Equivalence')
@UseGuards(AuthGuard, StaffGuard)
@Controller('api/v1/admin/supplement-equivalence')
export class AdminSupplementEquivalenceController {
  constructor(
    private readonly equivalenceService: SupplementEquivalenceService,
  ) {}

  private operator(user: RequestUser) {
    return { id: user.userId, name: user.userId };
  }

  @Get('groups')
  @ApiOperation({ summary: '等价组列表' })
  async list(@Query() query: Record<string, string>) {
    return ApiResponseDto.success(
      await this.equivalenceService.list({
        status: query.status,
        nutrientKey: query.nutrientKey,
        keyword: query.keyword,
        page: query.page ? Number(query.page) : undefined,
        pageSize: query.pageSize ? Number(query.pageSize) : undefined,
      }),
    );
  }

  @Post('groups')
  @ApiOperation({ summary: '新建等价组' })
  async create(
    @Body() body: UpsertEquivalenceGroupInput,
    @CurrentUser() user: RequestUser,
  ) {
    return ApiResponseDto.success(
      await this.equivalenceService.create(body, this.operator(user)),
    );
  }

  @Get('groups/:id')
  @ApiOperation({ summary: '等价组详情（成员、浓度校验、审计）' })
  async detail(@Param('id') id: string) {
    return ApiResponseDto.success(
      await this.equivalenceService.getById(id),
    );
  }

  @Patch('groups/:id')
  @ApiOperation({ summary: '修改等价组基本信息/依据' })
  async update(
    @Param('id') id: string,
    @Body() body: Partial<UpsertEquivalenceGroupInput>,
    @CurrentUser() user: RequestUser,
  ) {
    return ApiResponseDto.success(
      await this.equivalenceService.update(id, body, this.operator(user)),
    );
  }

  @Post('groups/:id/submit')
  @ApiOperation({ summary: '提交审核（staff）' })
  async submit(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return ApiResponseDto.success(
      await this.equivalenceService.changeStatus(
        id,
        'PENDING_REVIEW',
        this.operator(user),
      ),
    );
  }

  @Post('groups/:id/review')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: '审核通过/驳回/停用（仅管理员）' })
  async review(
    @Param('id') id: string,
    @Body() body: { status: EquivalenceGroupStatus; reviewNote?: string },
    @CurrentUser() user: RequestUser,
  ) {
    return ApiResponseDto.success(
      await this.equivalenceService.changeStatus(
        id,
        body.status,
        this.operator(user),
        body.reviewNote,
      ),
    );
  }

  @Post('groups/:id/members')
  @ApiOperation({ summary: '把原料加入等价组' })
  async addMembers(
    @Param('id') id: string,
    @Body() body: { ingredientIds: string[] },
    @CurrentUser() user: RequestUser,
  ) {
    return ApiResponseDto.success(
      await this.equivalenceService.addMembers(
        id,
        body.ingredientIds,
        this.operator(user),
      ),
    );
  }

  @Delete('groups/:id/members/:ingredientId')
  @ApiOperation({ summary: '把原料移出等价组' })
  async removeMember(
    @Param('id') id: string,
    @Param('ingredientId') ingredientId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return ApiResponseDto.success(
      await this.equivalenceService.removeMember(
        id,
        ingredientId,
        this.operator(user),
      ),
    );
  }

  @Delete('groups/:id')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: '删除空组（仅管理员）' })
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    await this.equivalenceService.removeGroup(id, this.operator(user));
    return ApiResponseDto.success({ deleted: true });
  }

  @Get('ungrouped')
  @ApiOperation({ summary: '未归组的补剂原料' })
  async ungrouped(@Query('keyword') keyword?: string) {
    return ApiResponseDto.success(
      await this.equivalenceService.listUngrouped({ keyword }),
    );
  }

  @Post('assign')
  @ApiOperation({ summary: '批量归组' })
  async assign(
    @Body() body: { ingredientIds: string[]; groupId: string },
    @CurrentUser() user: RequestUser,
  ) {
    return ApiResponseDto.success(
      await this.equivalenceService.assign(
        body.ingredientIds,
        body.groupId,
        this.operator(user),
      ),
    );
  }

  @Get('summary')
  @ApiOperation({ summary: '等价组统计' })
  async summary() {
    return ApiResponseDto.success(await this.equivalenceService.summary());
  }
}
