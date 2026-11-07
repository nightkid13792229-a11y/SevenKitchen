import {
  Body,
  Controller,
  InternalServerErrorException,
  Logger,
  Post,
  ServiceUnavailableException,
  UseGuards
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsArray, IsIn, IsNotEmpty, IsObject, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { SupplementAgentService } from '../../application/ingredient-creation/supplement-agent.service';
import { ApiResponseDto } from '../dto/common/response.dto';
import { AuthGuard } from '../auth/auth.guard';
import { AdminGuard } from '../guards/role.guard';

export class SupplementChatHistoryDto {
  @ApiProperty({ enum: ['user', 'assistant'] })
  @IsIn(['user', 'assistant'])
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
  /** 当前草稿（模型可读可写；这里只是原样递过去） */
  draft!: Record<string, unknown>;
}

/**
 * 补剂对话。
 *
 * 单独一支控制器：不进 ingredient-creation 那个（它已经十几个依赖），
 * 模型自己决定调哪些工具，这里只负责把结果交回页面，
 * 以后换模型驱动也只换那一处。
 */
@ApiTags('Admin Supplement Chat')
@ApiBearerAuth()
@Controller('api/v1/admin/ingredient-supplement-chat')
@UseGuards(AuthGuard, AdminGuard)
export class SupplementChatController {
  private readonly logger = new Logger(SupplementChatController.name);

  constructor(private readonly agent: SupplementAgentService) {}

  @Post('respond')
  @ApiOperation({ summary: '补剂 Agent：模型自己调工具（查资料/搜商品/写草稿），最后给结论' })
  async respond(
    @Body() dto: SupplementChatTurnDto
  ): Promise<
    ApiResponseDto<{
      reply: string;
      draft: Record<string, unknown>;
      applied: string[];
      partial?: boolean;
      question: { question: string; options: string[] } | null;
    }>
  > {
    try {
      const result = await this.agent.run({
        message: dto.message,
        history: dto.history ?? [],
        draft: dto.draft ?? {}
      });

      this.logger.log(
        `[supplement-agent] tools=${result.toolCalls.map((call) => `${call.name}:${call.ok ? 'ok' : 'fail'}`).join(',') || 'none'} ` +
          `applied=${result.applied.join(',') || 'none'} question=${result.question ? 'yes' : 'no'} ` +
          `msgLen=${dto.message.length}`
      );

      return new ApiResponseDto(0, 'Success', {
        reply: result.reply,
        draft: result.draft,
        applied: result.applied,
        partial: result.partial ?? false,
        question: result.question
      });
    } catch (error) {
      // 模型不可用时**没有规则版兜底**：这条路本来就是模型，退不回去。
      // 所以如实报错，别让页面以为"答了但没做事"。
      const message = error instanceof Error ? error.message : String(error);
      const notConfigured = /没启用|未启用|没有可用的|no config|Failed to get.*config/i.test(message);
      this.logger.error(
        `[supplement-agent] reason=${notConfigured ? 'NO_CONFIG' : 'RUN_FAILED'} ${message}`
      );
      if (notConfigured) {
        throw new ServiceUnavailableException(
          '后台的「原料入库」AI 配置没启用，补剂对话暂时用不了'
        );
      }
      // 别把代码错误也说成"模型不可用"——那会让人查错方向
      throw new InternalServerErrorException('这一步没跑完，稍后再试；已填的不会丢');
    }
  }
}
