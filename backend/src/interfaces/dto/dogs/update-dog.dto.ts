/**
 * Update Dog Profile DTO
 */

import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsEnum,
  IsNumber,
  IsInt,
  IsBoolean,
  IsDate,
  Min,
  Max,
  IsOptional,
  ValidateIf,
  MinLength,
  IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  ActivityLevel,
  LifeStageOverride,
  DogSizeCategory,
  TreatInputMode,
  TreatLevel,
} from '../../../domain';
import { DogGender } from '../../../domain/dog/enums';

export class UpdateDogDto {
  @ApiPropertyOptional({ description: 'Dog name' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional({ description: 'Breed ID' })
  @IsOptional()
  @IsUUID()
  breedId?: string;

  @ApiPropertyOptional({
    description: 'Custom breed name (for mixed breed dogs)',
    example: '田园犬',
    nullable: true
  })
  @IsOptional()
  @IsString()
  customBreedName?: string | null;

  @ApiPropertyOptional({ description: 'Birthday' })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  birthday?: Date;

  @ApiPropertyOptional({ enum: DogGender })
  @IsOptional()
  @IsEnum(DogGender)
  gender?: DogGender;

  @ApiPropertyOptional({ description: 'Is neutered' })
  @IsOptional()
  @IsBoolean()
  isNeutered?: boolean;

  @ApiPropertyOptional({ description: 'Current weight in kg' })
  @IsOptional()
  @IsNumber()
  @Min(0.1)
  currentWeightKg?: number;

  @ApiPropertyOptional({
    description: 'BCS score (1-9)',
    minimum: 1,
    maximum: 9,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(9)
  bcsScore?: number;

  @ApiPropertyOptional({ enum: ActivityLevel })
  @IsOptional()
  @IsEnum(ActivityLevel)
  activityLevel?: ActivityLevel;

  @ApiPropertyOptional({ enum: LifeStageOverride })
  @IsOptional()
  @IsEnum(LifeStageOverride)
  lifeStageOverride?: LifeStageOverride;

  @ApiPropertyOptional({ enum: DogSizeCategory, nullable: true })
  @IsOptional()
  @IsEnum(DogSizeCategory)
  sizeClassOverride?: DogSizeCategory | null;

  @ApiPropertyOptional({ description: 'Meals per day' })
  @IsOptional()
  @IsInt()
  @Min(1)
  mealsPerDay?: number;

  @ApiPropertyOptional({ enum: TreatInputMode })
  @IsOptional()
  @IsEnum(TreatInputMode)
  treatInputMode?: TreatInputMode;

  @ApiPropertyOptional({ enum: TreatLevel })
  @IsOptional()
  @IsEnum(TreatLevel)
  treatLevel?: TreatLevel;

  @ApiPropertyOptional({
    description: 'Manual treat kcal (required if treatInputMode is EXACT_KCAL)',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf(
    (o: UpdateDogDto) => o.treatInputMode === TreatInputMode.EXACT_KCAL,
  )
  @IsNumber()
  @Min(0)
  manualTreatKcal?: number | null;

  @ApiPropertyOptional({ description: 'Medical history', nullable: true })
  @IsOptional()
  @IsString()
  medicalHistory?: string | null;

  @ApiPropertyOptional({ description: '过敏食物', nullable: true })
  @IsOptional()
  @IsString()
  allergyFoods?: string | null;

  @ApiPropertyOptional({ description: '挑食食物', nullable: true })
  @IsOptional()
  @IsString()
  pickyFoods?: string | null;
}


