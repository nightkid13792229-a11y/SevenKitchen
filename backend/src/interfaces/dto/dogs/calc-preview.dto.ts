/**
 * Calc Preview DTO
 * Input for POST /dogs/calc-preview (dry-run calculation)
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsUUID,
  IsDateString,
  IsEnum,
  IsBoolean,
  IsNumber,
  IsInt,
  Min,
  Max,
  IsOptional,
  ValidateIf,
} from 'class-validator';
import {
  DogGender,
  ActivityLevel,
  LifeStageOverride,
  DogSizeCategory,
  TreatInputMode,
  TreatLevel,
} from '../../../domain';

export class CalcPreviewDto {
  @ApiProperty({ description: 'Breed ID', example: 'uuid' })
  @IsUUID()
  breedId!: string;

  @ApiProperty({ description: 'Birthday', example: '2020-01-01T00:00:00Z' })
  @IsDateString()
  birthday!: string;

  @ApiProperty({ enum: DogGender })
  @IsEnum(DogGender)
  gender!: DogGender;

  @ApiProperty({ description: 'Is neutered' })
  @IsBoolean()
  isNeutered!: boolean;

  @ApiProperty({ description: 'Current weight in kg' })
  @IsNumber()
  @Min(0.1)
  currentWeightKg!: number;

  @ApiProperty({ description: 'BCS score (1-9)', minimum: 1, maximum: 9 })
  @IsInt()
  @Min(1)
  @Max(9)
  bcsScore!: number;

  @ApiProperty({ enum: ActivityLevel })
  @IsEnum(ActivityLevel)
  activityLevel!: ActivityLevel;

  @ApiProperty({ enum: LifeStageOverride })
  @IsEnum(LifeStageOverride)
  lifeStageOverride!: LifeStageOverride;

  @ApiPropertyOptional({ enum: DogSizeCategory, nullable: true })
  @IsOptional()
  @IsEnum(DogSizeCategory)
  sizeClassOverride?: DogSizeCategory | null;

  @ApiPropertyOptional({ description: 'Meals per day', default: 2 })
  @IsOptional()
  @IsInt()
  @Min(1)
  mealsPerDay?: number;

  @ApiPropertyOptional({
    enum: TreatInputMode,
    default: TreatInputMode.ESTIMATE_LEVEL,
  })
  @IsOptional()
  @IsEnum(TreatInputMode)
  treatInputMode?: TreatInputMode;

  @ApiPropertyOptional({ enum: TreatLevel, default: TreatLevel.LOW })
  @IsOptional()
  @IsEnum(TreatLevel)
  treatLevel?: TreatLevel;

  @ApiPropertyOptional({
    description: 'Manual treat kcal (required if treatInputMode is EXACT_KCAL)',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf(
    (o: CalcPreviewDto) => o.treatInputMode === TreatInputMode.EXACT_KCAL,
  )
  @IsNumber()
  @Min(0)
  manualTreatKcal?: number | null;
}

