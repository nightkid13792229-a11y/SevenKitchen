import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RecipeAgentService } from '../../application/recipe-designer/agent/recipe-agent.service';
import { AuthGuard, CurrentUser, type RequestUser } from '../auth';
import { ApiResponseDto } from '../dto/common/response.dto';
import { StaffGuard } from '../guards/role.guard';

type AgentMessageBody = { message?: string };
type AgentDecisionBody = { decision?: string };
type AgentSelectionItemsBody = { itemNames?: string[] };
type AgentSupplementDecisionBody = { decision?: string };

/**
 * AI 食谱设计 Agent 的内部员工入口（2026-10-31 重建）。
 *
 * 只做参数校验与身份透传：会话、并发锁、运行循环都在 Service 里。
 */
@ApiTags('Recipe Designer Agent')
@ApiBearerAuth()
@Controller('api/v1/recipe-designer')
@UseGuards(AuthGuard)
export class RecipeAgentController {
  constructor(private readonly agentService: RecipeAgentService) {}

  @Post('drafts/:draftId/agent/runs')
  @UseGuards(StaffGuard)
  @ApiOperation({ summary: 'Start a recipe design agent run' })
  async start(
    @Param('draftId') draftId: string,
    @Body() body: AgentMessageBody,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<{ sessionId: string }>> {
    return ApiResponseDto.success(
      await this.agentService.start({
        draftId,
        actor: toActor(user),
        message: requireMessage(body),
      }),
    );
  }

  @Get('drafts/:draftId/agent/session')
  @UseGuards(StaffGuard)
  @ApiOperation({ summary: 'Get the latest agent session and messages' })
  async getSession(
    @Param('draftId') draftId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return ApiResponseDto.success(
      await this.agentService.getSession(draftId, toActor(user)),
    );
  }

  @Post('drafts/:draftId/agent/plan/decision')
  @UseGuards(StaffGuard)
  @ApiOperation({ summary: 'Approve or continue the nutrition plan stage' })
  async confirmPlan(
    @Param('draftId') draftId: string,
    @Body() body: AgentDecisionBody,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<{ phase: string }>> {
    return ApiResponseDto.success(
      await this.agentService.confirmPlan(
        draftId,
        toActor(user),
        requireDecision(body),
      ),
    );
  }

  @Post('drafts/:draftId/agent/selection/rematch')
  @UseGuards(StaffGuard)
  @ApiOperation({
    summary:
      'Re-match outside-library selection items after ingredients are added',
  })
  async rematchSelection(
    @Param('draftId') draftId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return ApiResponseDto.success(
      await this.agentService.rematchSelection(draftId, toActor(user)),
    );
  }

  @Post('drafts/:draftId/agent/selection/items')
  @UseGuards(StaffGuard)
  @ApiOperation({
    summary: 'Save the per-item checked list of the current selection',
  })
  async updateSelectionItems(
    @Param('draftId') draftId: string,
    @Body() body: AgentSelectionItemsBody,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<unknown>> {
    if (!Array.isArray(body?.itemNames)) {
      throw new BadRequestException('itemNames 必须是数组');
    }
    return ApiResponseDto.success(
      await this.agentService.updateSelectionItems(
        draftId,
        toActor(user),
        body.itemNames,
      ),
    );
  }

  @Post('drafts/:draftId/agent/selection/decision')
  @UseGuards(StaffGuard)
  @ApiOperation({
    summary: 'Approve or continue the ingredient selection stage',
  })
  async confirmSelection(
    @Param('draftId') draftId: string,
    @Body() body: AgentDecisionBody,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<{ phase: string }>> {
    return ApiResponseDto.success(
      await this.agentService.confirmSelection(
        draftId,
        toActor(user),
        requireDecision(body),
      ),
    );
  }

  @Post('drafts/:draftId/agent/supplement/decision')
  @UseGuards(StaffGuard)
  @ApiOperation({ summary: 'Accept or decline the pending supplement proposal' })
  async decideSupplement(
    @Param('draftId') draftId: string,
    @Body() body: AgentSupplementDecisionBody,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<{ accepted: number }>> {
    return ApiResponseDto.success(
      await this.agentService.decideSupplementProposal(
        draftId,
        toActor(user),
        requireSupplementDecision(body),
      ),
    );
  }

  @Post('agent/runs/:sessionId/revert')
  @UseGuards(StaffGuard)
  @ApiOperation({ summary: 'Revert the draft to the snapshot taken before this run' })
  async revert(
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<{ reverted: boolean; contentRevision: number }>> {
    return ApiResponseDto.success(
      await this.agentService.revertRun(sessionId, toActor(user)),
    );
  }

  @Post('agent/runs/:sessionId/stop')
  @UseGuards(StaffGuard)
  @ApiOperation({ summary: 'Stop a recipe design agent run' })
  async stop(
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<null>> {
    await this.agentService.stop(sessionId, toActor(user));
    return ApiResponseDto.success(null);
  }
}

function toActor(user: RequestUser) {
  return {
    userId: user.userId,
    role: user.role,
    customerId: user.customerId,
  };
}

function requireDecision(
  body: AgentDecisionBody | undefined,
): 'APPROVE' | 'CONTINUE' {
  const decision = body?.decision;
  if (decision !== 'APPROVE' && decision !== 'CONTINUE') {
    throw new BadRequestException('decision 只能是 APPROVE 或 CONTINUE');
  }
  return decision;
}

function requireSupplementDecision(
  body: AgentSupplementDecisionBody | undefined,
): 'ACCEPT' | 'DECLINE' {
  const decision = body?.decision;
  if (decision !== 'ACCEPT' && decision !== 'DECLINE') {
    throw new BadRequestException('decision 只能是 ACCEPT 或 DECLINE');
  }
  return decision;
}

function requireMessage(body: AgentMessageBody | undefined): string {
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  if (!message) {
    throw new BadRequestException('消息不能为空');
  }
  return message;
}
