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

function requireMessage(body: AgentMessageBody | undefined): string {
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  if (!message) {
    throw new BadRequestException('消息不能为空');
  }
  return message;
}
