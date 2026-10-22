import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';
import type { NutritionEvidenceEntry } from '../../../application/ingredient-creation/ingredient-creation.types';

/** 证据行的状态词表；与 `NutritionEvidenceEntry['status']` 绑定。 */
export const EVIDENCE_STATUSES = [
  'DIRECT',
  'CONVERTED',
  'FILLED',
  'MANUAL',
] as const satisfies readonly NutritionEvidenceEntry['status'][];

/**
 * 证据账本的一行（HTTP 入参）。
 *
 * 关键约束：`finalValue` / `sourceValue` 只接受**有限数字或 null**，不做
 * `parseFloat` 之类的隐式转换。字符串「20.4」在这里就是 400，绝不能静默跳过
 * 后落一条营养数据全 null 的档案。
 *
 * `null` = 这个字段没有值（缺失），与 0 是两件事，所以 null 必须放行。
 */
export class NutritionEvidenceEntryDto {
  @ApiProperty({ description: '字段路径', example: 'macros.crudeProtein' })
  @IsString()
  @IsNotEmpty()
  fieldPath!: string;

  @ApiProperty({ description: '最终值；缺失用 null', nullable: true })
  @ValidateIf((_object, value) => value !== null)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  finalValue!: number | null;

  @ApiProperty({ description: '目录单位', example: 'g' })
  @IsString()
  @IsNotEmpty()
  unit!: string;

  @ApiProperty({ description: '这一行怎么来的', enum: EVIDENCE_STATUSES })
  @IsIn(EVIDENCE_STATUSES)
  status!: NutritionEvidenceEntry['status'];

  @ApiProperty({ description: '来源记录 id；没有则 null', nullable: true })
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  sourceRecordId!: string | null;

  @ApiProperty({ description: '来源原文值；没有则 null', nullable: true })
  @ValidateIf((_object, value) => value !== null)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  sourceValue!: number | null;

  @ApiPropertyOptional({ description: '来源原文单位', nullable: true })
  @IsOptional()
  @IsString()
  sourceUnit?: string | null;

  @ApiPropertyOptional({ description: '换算公式', nullable: true })
  @IsOptional()
  @IsString()
  formula?: string | null;

  @ApiPropertyOptional({ description: '确认人', nullable: true })
  @IsOptional()
  @IsString()
  confirmedBy?: string | null;

  @ApiPropertyOptional({ description: '确认时间', nullable: true })
  @IsOptional()
  @IsString()
  confirmedAt?: string | null;
}
