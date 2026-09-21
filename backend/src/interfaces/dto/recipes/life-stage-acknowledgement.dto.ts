import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 顾客确认「已知晓生命阶段不匹配、仍要继续」时提交的记录。
 *
 * 这是**留痕**用的：将来若狗狗因吃错生命阶段的粮出问题，
 * 这张记录就是"我们已经明确告知过顾客"的凭据。
 */
export class LifeStageAcknowledgementDto {
  @ApiProperty({ description: 'Dog ID the acknowledgement is about' })
  @IsString()
  dogId!: string;

  @ApiProperty({
    description:
      'Backend verdict shown to the customer (MANUAL_MISMATCH / FALLBACK_ADULT / FALLBACK_FIRST)',
  })
  @IsString()
  @MaxLength(64)
  matchType!: string;

  @ApiPropertyOptional({ description: 'Dog life stage resolved by backend' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  dogLifeStage?: string;

  @ApiPropertyOptional({
    description: 'Recipe life stage shown at the moment of confirmation',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  recipeLifeStage?: string;

  @ApiProperty({
    description: 'Where the customer confirmed: order / diy / diy_sheet',
    enum: ['order', 'diy', 'diy_sheet'],
  })
  @IsIn(['order', 'diy', 'diy_sheet'])
  source!: 'order' | 'diy' | 'diy_sheet';
}
