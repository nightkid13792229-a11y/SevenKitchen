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
import { RecipeAgentRunService } from '../../application/recipe-designer/agent/recipe-agent-run.service';
import { AuthGuard, CurrentUser, type RequestUser } from '../auth';
import { StaffGuard } from '../guards/role.guard';

type AgentMessageBody = { message?: string };

/**
 * 食谱设计 Agent 的内部员工入口。
 *
 * 只做参数校验和身份透传：会话状态、运行锁、审批判断都在
 * `RecipeAgentRunService` / 工具箱里。P0b-3 不开放审批决定端点。
 */
@ApiTags('Recipe Designer Agent')
@ApiBearerAuth()
@Controller('api/v1/recipe-designer')
@UseGuards(AuthGuard)
export class RecipeAgentController {
  constructor(private readonly runService: RecipeAgentRunService) {}

  @Post('drafts/:draftId/agent/runs')
  @UseGuards(StaffGuard)
  @ApiOperation({ summary: 'Start a recipe design agent run for a draft' })
  async start(
    @Param('draftId') draftId: string,
    @Body() body: AgentMessageBody,
    @CurrentUser() user: RequestUser,
  ): Promise<{ sessionId: string }> {
    return this.runService.start({
      draftId,
      actor: toActor(user),
      message: requireMessage(body),
    });
  }

  @Get('drafts/:draftId/agent/session')
  @UseGuards(StaffGuard)
  @ApiOperation({ summary: 'Get the latest agent session and messages' })
  async getSession(@Param('draftId') draftId: string) {
    return this.runService.getSessionView(draftId);
  }

  @Post('agent/runs/:sessionId/stop')
  @UseGuards(StaffGuard)
  @ApiOperation({ summary: 'Stop a recipe design agent run' })
  async stop(@Param('sessionId') sessionId: string): Promise<void> {
    await this.runService.stop(sessionId);
  }

  @Post('agent/runs/:sessionId/answer')
  @UseGuards(StaffGuard)
  @ApiOperation({ summary: 'Answer a waiting recipe design agent run' })
  async answer(
    @Param('sessionId') sessionId: string,
    @Body() body: AgentMessageBody,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    await this.runService.resume({
      sessionId,
      actor: toActor(user),
      message: requireMessage(body),
    });
  }
}

function toActor(user: RequestUser) {
  return {
    userId: user.userId,
    role: user.role,
    customerId: user.customerId,
  };
}

function requireMessage(body: AgentMessageBody | undefined): string {
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  if (!message) {
    throw new BadRequestException('消息不能为空');
  }
  return message;
}
