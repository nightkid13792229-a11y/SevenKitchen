import { Body, Controller, Logger, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsObject, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import {
  interpretSupplementMessage,
  type SupplementChatDraft,
  type SupplementChatReply
} from '../../domain/ingredient/supplement-chat';
import { SupplementChatAgentService } from '../../application/ingredient-creation/supplement-chat-agent.service';
import { ApiResponseDto } from '../dto/common/response.dto';
import { AuthGuard } from '../auth/auth.guard';
import { AdminGuard } from '../guards/role.guard';

export class SupplementChatHistoryDto {
  @ApiProperty({ enum: ['user', 'assistant'] })
  @IsString()
  role!: 'user' | 'assistant';

  @ApiProperty()
  @IsString()
  @MaxLength(2000)
  text!: string;
}

export class SupplementChatTurnDto {
  @ApiProperty({ description: '用户这一句', example: '给狗狗加个锌' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  message!: string;

  @ApiProperty({ description: '前几轮对话，用来理解「第二个」这类指代', required: false, type: [SupplementChatHistoryDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SupplementChatHistoryDto)
  history?: SupplementChatHistoryDto[];

  @ApiProperty({
    description: '右边现在填了什么（用来判断能不能执行「第一个」这种话）',
    example: { name: '', servingUnitsPerDose: null, candidateNames: [] }
  })
  @IsObject()
  draft!: SupplementChatDraft;
}

/**
 * 补剂对话。
 *
 * 单独一支控制器：不进 ingredient-creation 那个（它已经十几个依赖），
 * 而且这一层现在只是把话翻译成动作，判断逻辑都在 `supplement-chat` 里，
 * 以后换模型驱动也只换那一处。
 */
@ApiTags('Admin Supplement Chat')
@ApiBearerAuth()
@Controller('api/v1/admin/ingredient-supplement-chat')
@UseGuards(AuthGuard, AdminGuard)
export class SupplementChatController {
  private readonly logger = new Logger(SupplementChatController.name);

  constructor(private readonly agent: SupplementChatAgentService) {}

  @Post('respond')
  @ApiOperation({ summary: '把一句话翻译成回复 + 要执行的动作' })
  async respond(
    @Body() dto: SupplementChatTurnDto
  ): Promise<ApiResponseDto<SupplementChatReply & { source: 'MODEL' | 'RULES' }>> {
    const draft = dto.draft ?? { name: '', servingUnitsPerDose: null, candidateNames: [] };

    try {
      const reply = await this.agent.respond({
        message: dto.message,
        history: dto.history ?? [],
        draft
      });
      return new ApiResponseDto(0, 'Success', { ...reply, source: 'MODEL' });
    } catch (error) {
      // 模型不可用不能把整条线弄死：退回规则解析，并如实告诉页面这次不是模型答的
      this.logger.warn(
        `[supplement-chat] 模型不可用，回退规则：${error instanceof Error ? error.message : String(error)}`
      );
      const reply = interpretSupplementMessage({ message: dto.message, draft });
      return new ApiResponseDto(0, 'Success', { ...reply, source: 'RULES' });
    }
  }
}
