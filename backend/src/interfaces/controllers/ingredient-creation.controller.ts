import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  IngredientCreationAuditService,
  type IngredientCreationAuditView,
} from '../../application/ingredient-creation/ingredient-creation-audit.service';
import { IngredientCreationCandidateService } from '../../application/ingredient-creation/ingredient-creation-candidate.service';
import { IngredientCreationCheckService } from '../../application/ingredient-creation/ingredient-creation-check.service';
import {
  IngredientCreationCommitService,
  type CommitIngredientCreationResult,
} from '../../application/ingredient-creation/ingredient-creation-commit.service';
import { IngredientCreationDraftService } from '../../application/ingredient-creation/ingredient-creation-draft.service';
import { IngredientCreationMergeService } from '../../application/ingredient-creation/ingredient-creation-merge.service';
import type {
  CandidateSearchResult,
  CreationStep,
  FinalCheckResult,
  IngredientCreationDraft,
  IngredientCreationDraftPayload,
  MergePlan,
} from '../../application/ingredient-creation/ingredient-creation.types';
import { AuthGuard, CurrentUser } from '../auth';
import type { RequestUser } from '../auth';
import { ApiResponseDto } from '../dto/common/response.dto';
import {
  CommitIngredientCreationDto,
  CreateDraftDto,
  CreateMergePlanDto,
  FindCandidatesDto,
  ResolveMergeConflictDto,
  UpdateDraftDto,
  type UpdateDraftPayloadDto,
} from '../dto/ingredient-creation';
import { AdminGuard } from '../guards/role.guard';

/** 服务层兜底之外的显式防线：payload 回传整份快照时也不得覆盖 AI 提案历史。 */
function stripProposalHistory(
  payload: UpdateDraftPayloadDto,
): Partial<IngredientCreationDraftPayload> {
  const { proposalHistory: _ignored, ...rest } =
    payload as UpdateDraftPayloadDto & {
      proposalHistory?: unknown;
    };
  return rest as unknown as Partial<IngredientCreationDraftPayload>;
}

/**
 * AI 辅助新建标准原料的后台接口。
 *
 * 只做参数校验、编排与转发：草稿读写走草稿服务，缝合 / 人工裁决走缝合服务，
 * 终检与提交前置检查走终检服务。控制器不碰 Prisma、不重算任何营养规则。
 */
@ApiTags('Admin Ingredient Creation')
@ApiBearerAuth()
@Controller('api/v1/admin/ingredient-creation')
@UseGuards(AuthGuard, AdminGuard)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class IngredientCreationController {
  constructor(
    private readonly draftService: IngredientCreationDraftService,
    private readonly candidateService: IngredientCreationCandidateService,
    private readonly mergeService: IngredientCreationMergeService,
    private readonly checkService: IngredientCreationCheckService,
    private readonly commitService: IngredientCreationCommitService,
    private readonly auditService: IngredientCreationAuditService,
  ) {}

  @Get('audits/:ingredientId')
  @ApiOperation({
    summary: '按原料读创建记录（AI 提案、人工改动、提交人；没有 → 404）',
  })
  async getAudit(
    @Param('ingredientId') ingredientId: string,
  ): Promise<ApiResponseDto<IngredientCreationAuditView>> {
    const audit = await this.auditService.getByIngredientId(ingredientId);
    return new ApiResponseDto(0, 'Success', audit);
  }

  @Post('drafts')
  @ApiOperation({ summary: '创建 AI 新建原料草稿（INTAKE 站）' })
  async createDraft(
    @Body() dto: CreateDraftDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<{ draftId: string; step: CreationStep }>> {
    const draft = await this.draftService.create({
      name: dto.name,
      type: 'FOOD',
      createdBy: user.userId,
    });

    return new ApiResponseDto(0, 'Success', {
      draftId: draft.id,
      step: draft.step,
    });
  }

  @Get('drafts/:id')
  @ApiOperation({ summary: '读取草稿（找不到 → 404）' })
  async getDraft(
    @Param('id') id: string,
  ): Promise<ApiResponseDto<IngredientCreationDraft>> {
    const draft = await this.draftService.get(id);
    return new ApiResponseDto(0, 'Success', draft);
  }

  @Patch('drafts/:id')
  @ApiOperation({ summary: '推进站点并浅合并本站 payload' })
  async updateDraft(
    @Param('id') id: string,
    @Body() dto: UpdateDraftDto,
  ): Promise<ApiResponseDto<IngredientCreationDraft>> {
    const draft = await this.draftService.patch(
      id,
      dto.step,
      stripProposalHistory(dto.payload),
    );

    return new ApiResponseDto(0, 'Success', draft);
  }

  @Post('drafts/:id/candidates')
  @ApiOperation({ summary: '按名字与生熟状态检索本地候选' })
  async findCandidates(
    @Param('id') id: string,
    @Body() dto: FindCandidatesDto,
  ): Promise<ApiResponseDto<CandidateSearchResult>> {
    // 候选服务本身不读草稿；先确认草稿存在，避免给不存在的草稿返回结果。
    await this.draftService.get(id);

    const result = await this.candidateService.findCandidates({
      name: dto.name,
      nameEn: dto.nameEn,
      state: dto.state,
    });

    return new ApiResponseDto(0, 'Success', result);
  }

  @Post('drafts/:id/merge')
  @ApiOperation({ summary: '生成缝合方案，先存提案快照再写入草稿' })
  async createMergePlan(
    @Param('id') id: string,
    @Body() dto: CreateMergePlanDto,
  ): Promise<ApiResponseDto<MergePlan>> {
    const plan = await this.mergeService.createMergePlan(id, dto);
    return new ApiResponseDto(0, 'Success', plan);
  }

  @Post('drafts/:id/merge/resolve')
  @ApiOperation({ summary: '人工裁决一个冲突字段' })
  async resolveMergeConflict(
    @Param('id') id: string,
    @Body() dto: ResolveMergeConflictDto,
  ): Promise<ApiResponseDto<MergePlan>> {
    const plan = await this.mergeService.resolveConflict(id, dto);
    return new ApiResponseDto(0, 'Success', plan);
  }

  @Post('drafts/:id/check')
  @ApiOperation({ summary: '跑服务端终检，返回拦死 / 可例外 / 提醒三档' })
  async runCheck(
    @Param('id') id: string,
  ): Promise<ApiResponseDto<FinalCheckResult>> {
    const result = await this.checkService.runCheck(id);
    return new ApiResponseDto(0, 'Success', result);
  }

  @Post('drafts/:id/commit')
  @ApiOperation({ summary: '终检无拦死项后一次性提交原料、档案与映射' })
  async commit(
    @Param('id') id: string,
    @Body() dto: CommitIngredientCreationDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<CommitIngredientCreationResult>> {
    // 提交接口不盲信前端：先跑服务端终检，有拦死项直接 400。
    await this.checkService.assertCommitAllowed(id);

    const result = await this.commitService.commit({
      draftId: id,
      userId: user.userId,
      ingredient: {
        name: dto.ingredient.name,
        type: dto.ingredient.type,
        baseUnit: dto.ingredient.baseUnit,
        unitDisplayLabel: dto.ingredient.unitDisplayLabel,
        cfctClass: dto.ingredient.cfctClass ?? null,
        edibleYieldRate: dto.ingredient.edibleYieldRate ?? null,
      },
      profiles: dto.profiles.map((profile) => ({
        preparationState: profile.preparationState,
        sourceRecordId: profile.sourceRecordId,
        entries: profile.entries.map((entry) => ({
          fieldPath: entry.fieldPath,
          finalValue: entry.finalValue,
          unit: entry.unit,
          status: entry.status,
          sourceRecordId: entry.sourceRecordId,
          sourceValue: entry.sourceValue,
          sourceUnit: entry.sourceUnit ?? null,
          formula: entry.formula ?? null,
          confirmedBy: entry.confirmedBy ?? null,
          confirmedAt: entry.confirmedAt ?? null,
        })),
        notes: profile.notes ?? null,
      })),
      primaryProfileIndex: dto.primaryProfileIndex,
    });

    return new ApiResponseDto(0, 'Success', result);
  }
}
