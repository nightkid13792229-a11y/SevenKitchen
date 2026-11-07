import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsNotEmpty, IsObject, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import {
  interpretSupplementMessage,
  type SupplementChatDraft,
  type SupplementChatReply
} from '../../domain/ingredient/supplement-chat';
import { ApiResponseDto } from '../dto/common/response.dto';
import { AuthGuard } from '../auth/auth.guard';
import { AdminGuard } from '../guards/role.guard';

export class SupplementChatTurnDto {
  @ApiProperty({ description: '用户这一句', example: '给狗狗加个锌' })
  @IsString()
  @IsNotEmpty()
  message!: string;

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
  @Post('respond')
  @ApiOperation({ summary: '把一句话翻译成回复 + 要执行的动作' })
  async respond(
    @Body() dto: SupplementChatTurnDto
  ): Promise<ApiResponseDto<SupplementChatReply>> {
    const reply = interpretSupplementMessage({
      message: dto.message,
      draft: dto.draft ?? { name: '', servingUnitsPerDose: null, candidateNames: [] }
    });
    return new ApiResponseDto(0, 'Success', reply);
  }
}
