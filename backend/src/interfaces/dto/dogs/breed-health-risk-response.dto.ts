import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  BreedHealthAttentionPriority,
  BreedHealthRiskSourceType,
} from '../../../domain/dog/breed-health-risk.entity';

export class BreedHealthRiskBreedDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;
}

export class BreedHealthRiskSourceDto {
  @ApiProperty({ enum: BreedHealthRiskSourceType })
  sourceType!: BreedHealthRiskSourceType;

  @ApiProperty()
  sourceName!: string;

  @ApiPropertyOptional({ nullable: true })
  publisher?: string | null;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  url!: string;

  @ApiProperty({ example: '2026-05-17' })
  accessedAt!: string;

  @ApiPropertyOptional({ nullable: true })
  note?: string | null;
}

export class BreedHealthRiskItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  conditionId!: string;

  @ApiProperty()
  conditionName!: string;

  @ApiProperty()
  category!: string;

  @ApiProperty({ enum: BreedHealthAttentionPriority })
  attentionPriority!: BreedHealthAttentionPriority;

  @ApiProperty()
  attentionLabel!: string;

  @ApiProperty()
  oneLineSummary!: string;

  @ApiPropertyOptional({ nullable: true })
  breedSpecificReason?: string | null;

  @ApiProperty({ type: [String] })
  commonSigns!: string[];

  @ApiPropertyOptional({ nullable: true })
  screeningAdvice?: string | null;

  @ApiPropertyOptional({ nullable: true })
  careAdvice?: string | null;

  @ApiProperty()
  sourceCount!: number;

  @ApiProperty({ type: [BreedHealthRiskSourceDto] })
  sources!: BreedHealthRiskSourceDto[];
}

export class BreedHealthRiskResponseDto {
  @ApiProperty({ type: BreedHealthRiskBreedDto })
  breed!: BreedHealthRiskBreedDto;

  @ApiProperty({ type: [BreedHealthRiskItemDto] })
  risks!: BreedHealthRiskItemDto[];
}
