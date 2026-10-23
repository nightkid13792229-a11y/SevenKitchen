import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/** `POST agent/run`：给一句话，让 AI 在草稿上受控地调工具。 */
export class RunIngredientAgentDto {
  @ApiPropertyOptional({
    description: '在这份草稿上起草；不传则先新建一份草稿',
    example: '3f0c6a5e-1b2c-4d5e-8f90-1234567890ab',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  draftId?: string;

  @ApiProperty({
    description: '用户原话，例如「帮我加鸡肝」',
    example: '帮我加鸡肝',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  text!: string;
}
