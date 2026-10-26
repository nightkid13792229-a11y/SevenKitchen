import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Res,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  IngredientCreationAuditService,
  type IngredientCreationAuditView,
} from '../../application/ingredient-creation/ingredient-creation-audit.service';
import {
  IngredientDraftAgentService,
  type IngredientAgentRunResult,
  type IngredientAgentStreamEvent,
} from '../../application/ingredient-creation/ingredient-draft-agent.service';
import type { CheckRunView } from '../../application/ingredient-creation/ingredient-check-run.service';
import {
  IngredientCreationAuthorizeService,
  type AuthorizeInput,
  type AuthorizeResult,
} from '../../application/ingredient-creation/ingredient-creation-authorize.service';
import { IngredientCreationCandidateService } from '../../application/ingredient-creation/ingredient-creation-candidate.service';
import {
  IngredientCreationCheckService,
  type IngredientDraftChecksView,
} from '../../application/ingredient-creation/ingredient-creation-check.service';
import { IngredientCreationDraftService } from '../../application/ingredient-creation/ingredient-creation-draft.service';
import {
  IngredientCreationIntakeService,
  type IntakeClassification,
} from '../../application/ingredient-creation/ingredient-creation-intake.service';
import { IngredientCreationMergeService } from '../../application/ingredient-creation/ingredient-creation-merge.service';
import {
  IngredientCreationOnlineService,
  type OnlineSearchResult,
} from '../../application/ingredient-creation/ingredient-creation-online.service';
import type {
  CandidateSearchResult,
  CreationStep,
  FinalCheckResult,
  IngredientCreationDraft,
  IngredientCreationDraftPayload,
  IngredientCreationDraftSummary,
  MergePlan,
} from '../../application/ingredient-creation/ingredient-creation.types';
import { AuthGuard, CurrentUser } from '../auth';
import type { RequestUser } from '../auth';
import { ApiResponseDto } from '../dto/common/response.dto';
import {
  ClassifyIntakeDto,
  CommitIngredientCreationDto,
  CreateDraftDto,
  CreateMergePlanDto,
  FindCandidatesDto,
  ResolveMergeConflictDto,
  RunDraftCheckDto,
  RunIngredientAgentDto,
  SearchOnlineCandidatesDto,
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
 * 终检与按域核验走终检服务，提交前的四条件闸门走授权服务。控制器不碰 Prisma、
 * 不重算任何营养规则，也不保留任何绕过闸门的提交通路。
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
    private readonly onlineService: IngredientCreationOnlineService,
    private readonly mergeService: IngredientCreationMergeService,
    private readonly checkService: IngredientCreationCheckService,
    private readonly authorizeService: IngredientCreationAuthorizeService,
    private readonly auditService: IngredientCreationAuditService,
    private readonly intakeService: IngredientCreationIntakeService,
    private readonly agentService: IngredientDraftAgentService,
  ) {}

  @Post('intake/classify')
  @ApiOperation({
    summary:
      '判断输入的是食材还是补剂（可带对话上下文纠正；AI 未启用或不可用 → 503）',
  })
  async classifyIntake(
    @Body() dto: ClassifyIntakeDto,
  ): Promise<ApiResponseDto<IntakeClassification>> {
    const result = await this.intakeService.classify(dto.text, {
      history: dto.history,
      current: dto.current ?? null,
    });
    return new ApiResponseDto(0, 'Success', result);
  }

  @Post('agent/run')
  @ApiOperation({
    summary:
      'AI 起草循环：受控调用工具（查库 / 写字段 / 跑校验），最多 200 次工具调用 / 10 分钟',
  })
  async runAgent(
    @Body() dto: RunIngredientAgentDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<IngredientAgentRunResult>> {
    const result = await this.agentService.run({
      draftId: dto.draftId,
      text: dto.text,
      userId: user.userId,
    });

    return new ApiResponseDto(0, 'Success', result);
  }

  @Post('agent/stream')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'AI 起草循环（SSE）：每次工具开始 / 结束立刻推一条事件，最后推 reply + done',
  })
  async streamAgent(
    @Body() dto: RunIngredientAgentDto,
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
  ): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    // Nginx 等反代默认会缓冲响应；显式关掉，事件才能边跑边到浏览器。
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    let closed = false;
    res.on('close', () => {
      closed = true;
    });

    const send = (event: IngredientAgentStreamEvent) => {
      if (closed || res.writableEnded) {
        return;
      }
      res.write(`data: ${JSON.stringify(event)}\n\n`);
      // Express 的 flush（挂载了 compression 等中间件时才有）：有就立刻推出去。
      (res as Response & { flush?: () => void }).flush?.();
    };

    try {
      await this.agentService.run({
        draftId: dto.draftId,
        text: dto.text,
        userId: user.userId,
        onEvent: send,
      });
    } catch {
      // 服务在抛错前已经发过 error 事件；这里只负责收尾，避免重复推一条。
    } finally {
      if (!res.writableEnded) {
        res.end();
      }
    }
  }

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

  @Get('drafts')
  @ApiOperation({
    summary: '列出当前登录人未完成草稿（按最近编辑倒序，最多 20 条）',
  })
  async listDrafts(
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<IngredientCreationDraftSummary[]>> {
    const drafts = await this.draftService.listUnfinished(user.userId);
    return new ApiResponseDto(0, 'Success', drafts);
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

  @Post('drafts/:id/candidates/online')
  @ApiOperation({
    summary: '本地零候选时到白名单来源兜底检索（结果落库，下次直接走本地库）',
  })
  async findOnlineCandidates(
    @Param('id') id: string,
    @Body() dto: SearchOnlineCandidatesDto,
  ): Promise<ApiResponseDto<OnlineSearchResult>> {
    // 与本地候选一致：先确认草稿存在，再联网；不让不存在的草稿消耗抓取。
    await this.draftService.get(id);

    const result = await this.onlineService.searchOnline({
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

  @Post('drafts/:id/checks')
  @ApiOperation({
    summary:
      '按域核验（原料 / 营养），落一条带草稿内容哈希的报告；触发人固定为当前登录人',
  })
  async runDomainCheck(
    @Param('id') id: string,
    @Body() dto: RunDraftCheckDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<CheckRunView>> {
    // 触发方式与操作人由服务端定死：前端不能自称 AGENT，也不能替别人签名。
    const run = await this.checkService.runDomain(
      id,
      dto.domain,
      'USER',
      user.userId,
    );

    return new ApiResponseDto(0, 'Success', run);
  }

  @Get('drafts/:id/checks')
  @ApiOperation({
    summary: '两域各自的最新核验报告，并用当前草稿内容判断是否过期',
  })
  async getLatestChecks(
    @Param('id') id: string,
  ): Promise<ApiResponseDto<IngredientDraftChecksView>> {
    const view = await this.checkService.latestChecks(id);
    return new ApiResponseDto(0, 'Success', view);
  }

  @Post('drafts/:id/authorize')
  @ApiOperation({
    summary:
      '四条件授权闸门（核验新鲜 / 规则版本 / 无拦死项 / 例外已登记）；全过才提交，否则 400 并列出全部原因',
  })
  async authorize(
    @Param('id') id: string,
    @Body() dto: CommitIngredientCreationDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<AuthorizeResult>> {
    const result = await this.authorizeService.authorize(
      this.toAuthorizeInput(id, dto, user),
    );

    return new ApiResponseDto(0, 'Success', result);
  }

  @Post('drafts/:id/commit')
  @ApiOperation({
    summary: '同 authorize：四条件闸门通过才一次性提交原料、档案与映射',
  })
  async commit(
    @Param('id') id: string,
    @Body() dto: CommitIngredientCreationDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<AuthorizeResult>> {
    // 刻意不保留绕过闸门的直写入口：直接调 API 也必须先过四条件，
    // 否则提交前的核验只是页面上的建议，挡不住任何绕过前端的调用。
    const result = await this.authorizeService.authorize(
      this.toAuthorizeInput(id, dto, user),
    );

    return new ApiResponseDto(0, 'Success', result);
  }

  /**
   * authorize / commit 共用同一份入参。
   *
   * 整份原料卡与档案透传：字段契约已在 DTO 里校验/白名单，服务层按「有值才写」
   * 落库；这里不再逐字段挑选，否则每加一个字段都要记得改两处。
   */
  private toAuthorizeInput(
    draftId: string,
    dto: CommitIngredientCreationDto,
    user: RequestUser,
  ): AuthorizeInput {
    return {
      draftId,
      userId: user.userId,
      ingredient: dto.ingredient,
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
    };
  }
}
