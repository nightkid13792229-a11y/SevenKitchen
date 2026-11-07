import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Logger,
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
  decideRequestedLine,
  type RequestedLineDecision,
} from '../../application/ingredient-creation/ingredient-line';
import {
  IngredientDraftAgentService,
  type IngredientAgentRunResult,
  type IngredientAgentStreamEvent,
} from '../../application/ingredient-creation/ingredient-draft-agent.service';
import type { CheckRunView } from '../../application/ingredient-creation/ingredient-check-run.service';
import {
  IngredientCreationAuthorizeService,
  type AuthorizeResult,
} from '../../application/ingredient-creation/ingredient-creation-authorize.service';
import { IngredientCreationCandidateService } from '../../application/ingredient-creation/ingredient-creation-candidate.service';
import {
  ProcurementSkuDraftService,
  type ProcurementSkuDraft,
} from '../../application/purchasing/procurement-sku-draft.service';
import { ProcurementSkuDraftNoticeException } from '../../application/purchasing/procurement-sku-draft.errors';
import {
  SupplementLinkPreviewService,
  type SupplementCandidate,
  type SupplementLinkPreview,
} from '../../application/ingredient-creation/supplement-link-preview.service';
import {
  SupplementIngredientService,
  type CreateSupplementIngredientResult,
  type PendingSupplementArchiveView,
  type SupplementEvidenceView,
} from '../../application/ingredient-creation/supplement-ingredient.service';
import {
  CreateSupplementIngredientDto,
  PreviewSupplementLinkDto,
  SearchSupplementCandidatesDto,
  toCreateSupplementInput,
} from '../dto/ingredient-creation/create-supplement-ingredient.dto';
import {
  IngredientCreationCheckService,
  type IngredientDraftChecksView,
} from '../../application/ingredient-creation/ingredient-creation-check.service';
import { IngredientCreationDraftService } from '../../application/ingredient-creation/ingredient-creation-draft.service';
import { IngredientSearchPlanService } from '../../application/ingredient-creation/ingredient-search-plan.service';
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
  AuthorizeIngredientCreationDto,
  ConfirmSearchPlanDto,
  ClassifyIntakeDto,
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
  private readonly logger = new Logger(IngredientCreationController.name);

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
    private readonly searchPlanService: IngredientSearchPlanService,
    private readonly supplementIngredientService: SupplementIngredientService,
    private readonly supplementLinkPreviewService: SupplementLinkPreviewService,
    private readonly procurementSkuDraftService: ProcurementSkuDraftService,
  ) {}

  /**
   * 起草请求该走哪条线。
   *
   * 必须在**写出响应头之前**判定：流式接口一旦 flush，服务里再抛错就只能变成
   * 一条 SSE error 事件，页面拿不到 400。判定本身在 `ingredient-line` 里。
   */
  private decideLine(dto: RunIngredientAgentDto): RequestedLineDecision {
    const decision = decideRequestedLine({
      draftId: dto.draftId,
      line: dto.line,
    });

    if (decision.action === 'REJECT') {
      throw new BadRequestException(decision.message);
    }

    if (decision.action === 'CREATE' && decision.compatDefault) {
      // 过渡期：老页面还没带线路。下个版本收紧为必填，这里只留一条痕迹。
      this.logger.warn(
        '[ingredient-agent] 请求未带线路，按食材处理（过渡兼容）',
      );
    }

    return decision;
  }

  /** 组起草入参：有草稿就以草稿为准（不带 line），新建才带。 */
  private buildRunInput(
    dto: RunIngredientAgentDto,
    userId: string,
    decision: RequestedLineDecision,
    onEvent?: (event: IngredientAgentStreamEvent) => void,
  ) {
    return {
      ...(dto.draftId ? { draftId: dto.draftId } : {}),
      text: dto.text,
      userId,
      ...(decision.action === 'CREATE' ? { line: decision.line } : {}),
      ...(onEvent ? { onEvent } : {}),
    };
  }

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

  @Post('supplements/preview-link')
  @ApiOperation({ summary: '按商品链接读出补剂档案初稿（读不出就让人手填）' })
  async previewSupplementLink(
    @Body() dto: PreviewSupplementLinkDto,
  ): Promise<ApiResponseDto<SupplementLinkPreview>> {
    const preview = await this.supplementLinkPreviewService.preview(dto.url);
    return new ApiResponseDto(0, 'Success', preview);
  }

  @Post('supplements/search-candidates')
  @ApiOperation({ summary: '按关键词去电商搜一圈，捞出候选（链接 + 名字 + 标价）' })
  async searchSupplementCandidates(
    @Body() dto: SearchSupplementCandidatesDto,
  ): Promise<ApiResponseDto<SupplementCandidate[]>> {
    const candidates = await this.supplementLinkPreviewService.searchCandidates(
      dto.keyword,
    );
    return new ApiResponseDto(0, 'Success', candidates);
  }

  @Get('supplements/pending')
  @ApiOperation({ summary: '待验证的补剂档案：关掉页面后还能找回来确认' })
  async listPendingSupplements(): Promise<
    ApiResponseDto<PendingSupplementArchiveView[]>
  > {
    const rows = await this.supplementIngredientService.listPending();
    return new ApiResponseDto(0, 'Success', rows);
  }

  @Get('supplements/:ingredientId/evidence')
  @ApiOperation({ summary: '回查当时那张标签：原文、原图、每份几粒' })
  async getSupplementEvidence(
    @Param('ingredientId') ingredientId: string,
  ): Promise<ApiResponseDto<SupplementEvidenceView | null>> {
    const view = await this.supplementIngredientService.getEvidence(ingredientId);
    return new ApiResponseDto(0, 'Success', view);
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
    const decision = this.decideLine(dto);
    const result = await this.agentService.run(
      this.buildRunInput(dto, user.userId, decision),
    );

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
    // 先判定再开流：补剂线没开放时必须能返回真正的 400。
    const decision = this.decideLine(dto);

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
      await this.agentService.run(
        this.buildRunInput(dto, user.userId, decision, send),
      );
    } catch {
      // 服务在抛错前已经发过 error 事件；这里只负责收尾，避免重复推一条。
    } finally {
      if (!res.writableEnded) {
        res.end();
      }
    }
  }

  @Post('drafts/:id/search-plan/confirm')
  @ApiOperation({
    summary:
      '确认（可修改）AI 提交的检索方案；确认之后 AI 才能写原料卡与营养',
  })
  async confirmSearchPlan(
    @Param('id') id: string,
    @Body() dto: ConfirmSearchPlanDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<unknown>> {
    // 只把「可改的字段」交给服务；确认人固定取当前登录人，前端不能替别人签名。
    const plan = await this.searchPlanService.confirm(
      id,
      {
        keywords: dto.keywords,
        libraries: dto.libraries,
        selectedRecordIds: dto.selectedRecordIds,
      },
      { userId: user.userId },
    );

    return new ApiResponseDto(0, 'Success', plan);
  }

  @Delete('drafts/:id/search-plan')
  @ApiOperation({
    summary: '跳过当前待确认的检索方案；不写正式库，写工具仍需新方案确认',
  })
  async dismissSearchPlan(
    @Param('id') id: string,
  ): Promise<ApiResponseDto<null>> {
    await this.searchPlanService.dismiss(id);
    return new ApiResponseDto(0, 'Success', null);
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

  @Post('supplements')
  @ApiOperation({
    summary: '补剂建档：一条标准原料 + 一份待验证营养档案 + 主映射 + 标签证据',
  })
  async createSupplement(
    @Body() dto: CreateSupplementIngredientDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<CreateSupplementIngredientResult>> {
    const result = await this.supplementIngredientService.create(
      toCreateSupplementInput(dto, user.userId),
    );

    return new ApiResponseDto(0, 'Success', result);
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

  @Post('drafts/:id/checks/auto')
  @ApiOperation({
    summary: 'Agent 写完后自动跑两页核验；报告标记为 AGENT，仍不授权',
  })
  async runAutoChecks(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<
    ApiResponseDto<{ ingredient: CheckRunView; nutrition: CheckRunView }>
  > {
    const result = await this.checkService.runAllDomains(
      id,
      'AGENT',
      user.userId,
    );
    return new ApiResponseDto(0, 'Success', result);
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

  /**
   * 收尾「采购商品」的截图识别（2026-11-08）。
   *
   * 为什么挂在**草稿**上而不是原料上：AI 建档是原料与采购商品一次提交，
   * 识别时原料还没建出来，没有 ingredientId；能定「净含量怎么归一」的
   * 只有草稿里的 `payload.ingredient.baseUnit`。
   *
   * 识别本身复用员工端那套服务（同一份提示词、同一份渠道字典、同一份每日配额）：
   * 两个入口各接一套必然漂移，一边认得出、一边认不出。
   */
  @Post('drafts/:id/procurement-sku-draft')
  @ApiOperation({
    summary: '从商品详情页截图识别采购商品（只出草稿，不落库）',
  })
  async draftProcurementSku(
    @Param('id') id: string,
    @Body() body: { imageUrl?: string },
    @CurrentUser() user: RequestUser,
  ): Promise<
    ApiResponseDto<{ draft: ProcurementSkuDraft | null; degraded: boolean }>
  > {
    const imageUrl =
      typeof body?.imageUrl === 'string' ? body.imageUrl.trim() : '';
    if (!imageUrl) {
      throw new BadRequestException('缺少截图地址');
    }

    const draft = await this.draftService.get(id);
    if (draft.type !== 'FOOD') {
      throw new BadRequestException('只有食材可以新增采购商品');
    }

    const ingredient = (
      draft.payload as { ingredient?: { baseUnit?: unknown } }
    ).ingredient;
    const baseUnit =
      typeof ingredient?.baseUnit === 'string' ? ingredient.baseUnit : '';
    if (!baseUnit) {
      throw new BadRequestException(
        '草稿里还没有原料卡（基准单位未知），先让 AI 把原料写出来再识别',
      );
    }

    try {
      const result =
        await this.procurementSkuDraftService.draftFromScreenshotForBaseUnit({
          imageUrl,
          baseUnit,
          userId: user.userId,
        });
      return new ApiResponseDto(0, 'Success', {
        draft: result,
        degraded: false,
      });
    } catch (error) {
      // 「这张图不是商品详情页」「配额用完了」是给人看的说明，必须原样抛出去；
      // 其余（模型超时、网络）降级成手填，绝不卡住建档收尾（同员工端口径）。
      if (error instanceof ProcurementSkuDraftNoticeException) {
        throw error;
      }
      this.logger.warn(
        `采购商品识别失败，降级为手填：${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return new ApiResponseDto(0, 'Success', { draft: null, degraded: true });
    }
  }

  @Post('drafts/:id/authorize')
  @ApiOperation({
    summary:
      '四条件授权闸门（核验新鲜 / 规则版本 / 无拦死项 / 例外已登记）；全过才提交，否则 400 并列出全部原因',
  })
  async authorize(
    @Param('id') id: string,
    @Body() dto: AuthorizeIngredientCreationDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<AuthorizeResult>> {
    const result = await this.authorizeService.authorize({
      draftId: id,
      userId: user.userId,
      primaryProfileIndex: dto.primaryProfileIndex,
      procurementSku: dto.procurementSku,
    });

    return new ApiResponseDto(0, 'Success', result);
  }

  @Post('drafts/:id/commit')
  @ApiOperation({
    summary: '同 authorize：四条件闸门通过才一次性提交原料、档案与映射',
  })
  async commit(
    @Param('id') id: string,
    // 只收主档案下标：旧调用方仍可带全量 body（ingredient / profiles 会被
    // whitelist 剥掉），但那些字段不参与校验、更不参与写入——写入的只能是
    // 草稿里被核验过的那一份。
    @Body() dto: AuthorizeIngredientCreationDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<AuthorizeResult>> {
    // 刻意不保留绕过闸门的直写入口：直接调 API 也必须先过四条件，
    // 否则提交前的核验只是页面上的建议，挡不住任何绕过前端的调用。
    const result = await this.authorizeService.authorize({
      draftId: id,
      userId: user.userId,
      primaryProfileIndex: dto.primaryProfileIndex,
      procurementSku: dto.procurementSku,
    });

    return new ApiResponseDto(0, 'Success', result);
  }
}
