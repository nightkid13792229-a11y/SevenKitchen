/**
 * Create Dog Profile DTO
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
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
  MinLength,
} from 'class-validator';
import {
  DogGender,
  ActivityLevel,
  LifeStageOverride,
  DogSizeCategory,
  TreatInputMode,
  TreatLevel,
} from '../../../domain';

export class CreateDogDto {
  @ApiProperty({ description: 'Dog name', example: '旺财' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({ description: 'Breed ID', example: 'uuid' })
  @IsUUID()
  breedId!: string;

  @ApiPropertyOptional({
    description: 'Custom breed name (for mixed breed dogs)',
    example: '田园犬',
    nullable: true
  })
  @IsOptional()
  @IsString()
  customBreedName?: string | null;

  @ApiProperty({ description: 'Birthday', example: '2020-01-01T00:00:00Z' })
  @IsDateString()
  birthday!: string;

  @ApiProperty({ enum: DogGender, example: DogGender.MALE })
  @IsEnum(DogGender)
  gender!: DogGender;

  @ApiProperty({ description: 'Is neutered', example: false })
  @IsBoolean()
  isNeutered!: boolean;

  @ApiProperty({ description: 'Current weight in kg', example: 10.5 })
  @IsNumber()
  @Min(0.1)
  currentWeightKg!: number;

  @ApiProperty({
    description: 'BCS score (1-9)',
    example: 5,
    minimum: 1,
    maximum: 9,
  })
  @IsInt()
  @Min(1)
  @Max(9)
  bcsScore!: number;

  @ApiProperty({ enum: ActivityLevel, example: ActivityLevel.NORMAL })
  @IsEnum(ActivityLevel)
  activityLevel!: ActivityLevel;

  @ApiProperty({ enum: LifeStageOverride, example: LifeStageOverride.NONE })
  @IsEnum(LifeStageOverride)
  lifeStageOverride!: LifeStageOverride;

  @ApiPropertyOptional({ enum: DogSizeCategory, nullable: true })
  @IsOptional()
  @IsEnum(DogSizeCategory)
  sizeClassOverride?: DogSizeCategory | null;

  @ApiPropertyOptional({ description: 'Meals per day', example: 2, default: 2 })
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
    (o: CreateDogDto) => o.treatInputMode === TreatInputMode.EXACT_KCAL,
  )
  @IsNumber()
  @Min(0)
  manualTreatKcal?: number | null;

  @ApiPropertyOptional({ description: 'Medical history', nullable: true })
  @IsOptional()
  @IsString()
  medicalHistory?: string | null;

  @ApiPropertyOptional({
    description: 'Medical records (structured health data)',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        chiefComplaint: { type: 'string', description: '症状或疾病' },
        visitDate: { type: 'string', description: '发病日期 (ISO 8601)', nullable: true },
        diagnosis: { type: 'string', description: '医生诊断结果', nullable: true },
        notes: { type: 'string', description: '详细描述', nullable: true },
        attachments: {
          type: 'array',
          items: { type: 'string' },
          description: '检查报告文件URL数组',
          nullable: true,
        },
      },
    },
    nullable: true,
  })
  @IsOptional()
  medicalRecords?: Array<{
    chiefComplaint: string;
    visitDate?: string | null;
    diagnosis?: string | null;
    notes?: string | null;
    attachments?: string[] | null;
  }> | null;

  @ApiPropertyOptional({ description: '过敏食物', nullable: true })
  @IsOptional()
  @IsString()
  allergyFoods?: string | null;

  @ApiPropertyOptional({ description: '挑食食物', nullable: true })
  @IsOptional()
  @IsString()
  pickyFoods?: string | null;
}


