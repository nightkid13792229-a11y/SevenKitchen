/**
 * Dog Response DTOs
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  DogGender,
  ActivityLevel,
  LifeStageOverride,
  DogSizeCategory,
  TreatInputMode,
  TreatLevel,
} from '../../../domain';
import { CalcPreviewResult } from '../../../application/dog/dog.service';

export class DogProfileDto {
  @ApiProperty({ example: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'uuid' })
  ownerId!: string;

  @ApiProperty({ example: '旺财' })
  name!: string;

  @ApiProperty({ example: 'uuid' })
  breedId!: string;

  @ApiPropertyOptional({
    description: 'Breed name (from breed table or custom breed name)',
    example: '金毛寻回犬',
    nullable: true
  })
  breedName?: string | null;

  @ApiPropertyOptional({
    description: 'Custom breed name (for mixed breed dogs)',
    example: '田园犬',
    nullable: true
  })
  customBreedName?: string | null;

  @ApiProperty({ example: '2020-01-01T00:00:00Z' })
  birthday!: string;

  @ApiProperty({ enum: DogGender })
  gender!: DogGender;

  @ApiProperty()
  isNeutered!: boolean;

  @ApiProperty({ example: 10.5 })
  currentWeightKg!: number;

  @ApiProperty({ example: 5 })
  bcsScore!: number;

  @ApiProperty({ enum: ActivityLevel })
  activityLevel!: ActivityLevel;

  @ApiProperty({ enum: LifeStageOverride })
  lifeStageOverride!: LifeStageOverride;

  @ApiPropertyOptional({ enum: DogSizeCategory, nullable: true })
  sizeClassOverride?: DogSizeCategory | null;

  @ApiProperty({ example: 2 })
  mealsPerDay!: number;

  @ApiProperty({ enum: TreatInputMode })
  treatInputMode!: TreatInputMode;

  @ApiProperty({ enum: TreatLevel })
  treatLevel!: TreatLevel;

  @ApiPropertyOptional({ nullable: true })
  manualTreatKcal?: number | null;

  @ApiPropertyOptional({ nullable: true })
  medicalHistory?: string | null;

  @ApiPropertyOptional({ description: '过敏食物', nullable: true })
  allergyFoods?: string | null;

  @ApiPropertyOptional({ description: '挑食食物', nullable: true })
  pickyFoods?: string | null;

  @ApiProperty({ example: 500 })
  cachedTargetFoodKcal!: number;
}

export class DogCalcResultDto implements CalcPreviewResult {
  @ApiProperty({ description: 'RER (Resting Energy Requirement)', example: 350 })
  rer!: number;

  @ApiProperty({
    description: 'Total DER (Daily Energy Requirement)',
    example: 500,
  })
  totalDer!: number;

  @ApiProperty({ description: 'Final food kcal requirement', example: 450 })
  finalFoodKcal!: number;

  @ApiProperty({ description: 'Treat deduction kcal', example: 50 })
  treatDeduction!: number;

  @ApiProperty({
    description: 'Whether treat deduction was capped at 10%',
    example: false,
  })
  isTreatCapped!: boolean;

  @ApiPropertyOptional({
    description: 'Daily intake in grams (if recipe energy density provided)',
    example: 375,
  })
  dailyIntakeG?: number;

  @ApiPropertyOptional({
    description: 'Detailed calculation breakdown (includes intermediate values)',
    type: 'object',
    additionalProperties: true,
    example: {
      weightKg: 10.5,
      ageMonths: 36,
      sizeClass: 'MEDIUM',
      lifeStage: 'ADULT',
      stageFactor: 1.6,
      activityMultiplier: 1.0,
      neuterMultiplier: 1.0,
      bcsMultiplier: 1.0,
      treatMode: 'ESTIMATE_LEVEL',
      treatLevel: 'LOW',
      treatPercentage: 3,
    },
  })
  calcDetails?: Record<string, any>;
}

export class DogDetailResponseDto {
  @ApiProperty({ type: DogProfileDto })
  profile!: DogProfileDto;

  @ApiProperty({ type: DogCalcResultDto, required: false, nullable: true })
  calcResult?: DogCalcResultDto | null;
}


