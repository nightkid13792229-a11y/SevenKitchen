/**
 * Update Dog Profile DTO
 */

import { ApiPropertyOptional } from '@nestjs/swagger';
import { MAX_DOG_WEIGHT_KG } from '../../../domain/dog/constants';
import {
  IsString,
  IsDateString,
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
    nullable: true,
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

  // ===== 繁殖期信息（2026-09-29 新增，阶段 A）=====
  // 顾客把狗切到「怀孕」或「哺乳」时填写的日期与窝仔数；
  // 算法据此按 FEDIAF 表 VII-8b 分段计算能量（此前只能给全程定值）。

  @ApiPropertyOptional({ description: '配种日（怀孕期用）' })
  @IsOptional()
  @IsDateString()
  matingDate?: string;

  @ApiPropertyOptional({ description: '预产期（怀孕期用；与配种日同时存在时以本字段为准）' })
  @IsOptional()
  @IsDateString()
  expectedDueDate?: string;

  @ApiPropertyOptional({ description: '分娩日（哺乳期用）' })
  @IsOptional()
  @IsDateString()
  deliveryDate?: string;

  @ApiPropertyOptional({ description: '窝仔数（哺乳期用，1-12）', minimum: 1, maximum: 12 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  litterSize?: number;

  @ApiPropertyOptional({
    description: 'Current weight in kg',
    minimum: 0.1,
    maximum: MAX_DOG_WEIGHT_KG,
  })
  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(MAX_DOG_WEIGHT_KG)
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

  /**
   * 「这一项是顾客亲自选的」标记（2026-09-27 新增）。
   *
   * 与新增档案同样的语义：只传 true 才记确认时间；
   * 不传或传 false 都**不会清掉**已有的确认时间（改个名字不该让确认状态失效）。
   */
  @ApiPropertyOptional({ description: '顾客是否亲自选择了体况评分' })
  @IsOptional()
  @IsBoolean()
  bcsScoreConfirmed?: boolean;

  @ApiPropertyOptional({ description: '顾客是否亲自选择了活动量' })
  @IsOptional()
  @IsBoolean()
  activityLevelConfirmed?: boolean;

  @ApiPropertyOptional({ description: '顾客是否亲自确认了每日餐数' })
  @IsOptional()
  @IsBoolean()
  mealsPerDayConfirmed?: boolean;

  @ApiPropertyOptional({ description: '喜欢的食材' })
  @IsOptional()
  @IsString()
  preferredFoods?: string | null;

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

  @ApiPropertyOptional({
    description: 'Medical records (structured health data)',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        chiefComplaint: { type: 'string', description: '症状或疾病' },
        visitDate: {
          type: 'string',
          description: '发病日期 (ISO 8601)',
          nullable: true,
        },
        diagnosis: {
          type: 'string',
          description: '医生诊断结果',
          nullable: true,
        },
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

  @ApiPropertyOptional({
    description: 'Checkup records (体检记录)',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        checkupDate: { type: 'string', description: '体检日期 (ISO 8601)' },
        checkupType: { type: 'string', description: '体检类型' },
        notes: { type: 'string', description: '体检说明', nullable: true },
        attachments: {
          type: 'array',
          items: { type: 'string' },
          description: '体检报告文件URL数组',
          nullable: true,
        },
      },
    },
    nullable: true,
  })
  @IsOptional()
  checkupRecords?: Array<{
    checkupDate: string;
    checkupType: string;
    notes?: string | null;
    attachments?: string[] | null;
  }> | null;

  @ApiPropertyOptional({
    description: 'Allergy records (过敏记录)',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        allergen: { type: 'string', description: '过敏原名称' },
        notes: { type: 'string', description: '备注', nullable: true },
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
  allergyRecords?: Array<{
    allergen: string;
    notes?: string | null;
    attachments?: string[] | null;
  }> | null;
}
