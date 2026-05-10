import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  NutritionCandidateStatus,
  NutritionMatchConfidence,
} from '@prisma/client';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ListNutritionCandidatesQueryDto {
  @ApiPropertyOptional({
    description: '候选状态',
    enum: NutritionCandidateStatus,
  })
  @IsOptional()
  @IsEnum(NutritionCandidateStatus)
  status?: NutritionCandidateStatus;

  @ApiPropertyOptional({
    description: '匹配置信度',
    enum: NutritionMatchConfidence,
  })
  @IsOptional()
  @IsEnum(NutritionMatchConfidence)
  confidence?: NutritionMatchConfidence;
}

export class GenerateFoodCandidatesDto {
  @ApiProperty({ description: '采购原料ID' })
  @IsString()
  @IsNotEmpty()
  ingredientId!: string;
}
