import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SupplementDraftAiService } from '../../application/ingredient-creation/supplement-draft-ai.service';
import { SupplementDraftReviewService } from '../../application/ingredient-creation/supplement-draft-review.service';
import { SupplementDraftService } from '../../application/ingredient-creation/supplement-draft.service';
import { SupplementFinalizeService } from '../../application/ingredient-creation/supplement-finalize.service';
import { SupplementVerificationService } from '../../application/ingredient-creation/supplement-verification.service';
import { AuthGuard, CurrentUser } from '../auth';
import type { RequestUser } from '../auth';
import { ApiResponseDto } from '../dto/common/response.dto';
import {
  AiFillSupplementDraftDto,
  CreateSupplementDraftDto,
  FinalizeSupplementDraftDto,
  UpdateSupplementDraftDto,
} from '../dto/ingredient-creation/supplement-draft.dto';
import { AdminGuard } from '../guards/role.guard';

/**
 * 补剂草稿式建档 · 后台接口（spec §11）。
 *
 * 编排层只做两件事：把当前用户传给服务、把结果包成统一响应。
 * 草稿私有性由 `SupplementDraftService` 的 `createdBy` 过滤保证；
 * 最终写入 / 校验 / 核验全部在服务层，控制器不碰 Prisma、不重算营养。
 *
 * 2026-11-24 起不再有开关：旧的两段式页面已删除，草稿式是补剂建档的唯一路径。
 */
@ApiTags('Admin Supplement Draft')
@ApiBearerAuth()
@Controller('api/v1/admin/ingredient-creation/supplement-drafts')
@UseGuards(AuthGuard, AdminGuard)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class SupplementDraftController {
  constructor(
    private readonly draftService: SupplementDraftService,
    private readonly aiService: SupplementDraftAiService,
    private readonly reviewService: SupplementDraftReviewService,
    private readonly finalizeService: SupplementFinalizeService,
    private readonly verificationService: SupplementVerificationService,
  ) {}

  // ---------- 草稿 CRUD ----------

  @Get()
  @ApiOperation({ summary: '我的补剂草稿列表（DRAFT，最近编辑在前）' })
  async list(@CurrentUser() user: RequestUser) {
    return ApiResponseDto.success(await this.draftService.list(user.userId));
  }

  @Post()
  @ApiOperation({ summary: '新建补剂草稿' })
  async create(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateSupplementDraftDto,
  ) {
    return ApiResponseDto.success(
      await this.draftService.create(user.userId, dto),
    );
  }

  // ---------- 草稿态动作（具体子路径集中在前，避免以后加通配路由时被吞） ----------

  @Get(':id/verification')
  @ApiOperation({ summary: '读取写入后的核验报告（未写入返回 null）' })
  async getVerification(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ) {
    return ApiResponseDto.success(
      await this.verificationService.getVerification(user.userId, id),
    );
  }

  @Post(':id/ai-fill')
  @ApiOperation({ summary: 'AI 起草/重填（只写草稿，不写正式库）' })
  async aiFill(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: AiFillSupplementDraftDto,
  ) {
    return ApiResponseDto.success(await this.aiService.fill(user, id, dto));
  }

  @Post(':id/validate')
  @ApiOperation({ summary: '最终校验预览（阻断项 / 提醒项）' })
  async validate(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return ApiResponseDto.success(
      await this.reviewService.validate(user.userId, id),
    );
  }

  @Post(':id/finalize')
  @ApiOperation({ summary: '一次性写入正式数据并做写入后核验' })
  async finalize(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: FinalizeSupplementDraftDto,
  ) {
    return ApiResponseDto.success(
      await this.finalizeService.finalize(
        { id: user.userId, name: user.userId },
        id,
        dto,
      ),
    );
  }

  @Post(':id/reverify')
  @ApiOperation({ summary: '只重跑功能核验（不写数据）' })
  async reverify(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return ApiResponseDto.success(
      await this.verificationService.reverify(user.userId, id),
    );
  }

  @Post(':id/recommend-groups')
  @ApiOperation({ summary: '草稿态等价组推荐（无 ingredientId）' })
  async recommendGroups(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ) {
    return ApiResponseDto.success(
      await this.reviewService.recommendGroups(user.userId, id),
    );
  }

  // ---------- 单张草稿 ----------

  @Get(':id')
  @ApiOperation({ summary: '读草稿（只能读自己的）' })
  async get(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return ApiResponseDto.success(await this.draftService.get(id, user.userId));
  }

  @Patch(':id')
  @ApiOperation({ summary: '自动保存（name / payload / manualFields）' })
  async update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateSupplementDraftDto,
  ) {
    return ApiResponseDto.success(
      await this.draftService.update(id, user.userId, dto),
    );
  }

  @Delete(':id')
  @ApiOperation({ summary: '放弃草稿（软删除）' })
  async discard(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return ApiResponseDto.success(
      await this.draftService.discard(id, user.userId),
    );
  }
}
