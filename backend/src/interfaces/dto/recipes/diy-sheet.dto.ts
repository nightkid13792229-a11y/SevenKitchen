/**
 * DIY Sheet DTOs
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';

export class GenerateDiySheetDto {
  @ApiPropertyOptional({
    description: 'Dog ID for personalized daily intake calculation',
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  })
  @IsOptional()
  @IsUUID()
  dogId?: string;

  @ApiPropertyOptional({
    description: 'Share token for non-public recipes',
    example: 'abc123sharetoken',
  })
  @IsOptional()
  shareToken?: string;

  /**
   * 定制订单号（2026-10-24 · 交付页重构）。
   *
   * 带上时只按**交付记录里冻结的那一版**生成制作单；
   * 不带时取最新版（橱窗 DIY 的老行为不变）。
   */
  @ApiPropertyOptional({
    description: 'Custom recipe order number (pins the delivered version)',
    example: 'CR202610230224',
  })
  @IsOptional()
  @IsString()
  orderId?: string;
}

export class DiySheetStepDto {
  @ApiProperty({ example: 1 })
  stepNumber!: number;

  @ApiProperty({ example: 'Prepare ingredients' })
  description!: string;
}

export class DiySheetResponseDto {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa7' })
  recipeId!: string;

  @ApiProperty({ example: 'Test Fresh Food Recipe' })
  recipeName!: string;

  @ApiProperty({ type: [DiySheetStepDto] })
  steps!: DiySheetStepDto[];

  @ApiPropertyOptional({
    description: 'Recommended daily intake in grams (if dogId provided)',
    example: 200,
  })
  recommendedDailyIntakeG?: number;
}
