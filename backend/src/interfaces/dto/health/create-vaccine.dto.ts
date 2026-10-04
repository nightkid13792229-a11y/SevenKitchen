import {
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export enum VaccineStatus {
  COMPLETED = 'COMPLETED',
  SCHEDULED = 'SCHEDULED',
  OVERDUE = 'OVERDUE',
}

export class CreateVaccineDto {
  @IsOptional()
  @IsUUID()
  dogId?: string; // Optional since it comes from URL parameter :dogId

  @IsString()
  vaccineName!: string;

  @IsDateString()
  vaccinationDate!: string;

  @IsOptional()
  @IsDateString()
  nextDueDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsEnum(VaccineStatus)
  status?: VaccineStatus;

  /// 报告原件（2026-10-01 新增）：拍疫苗本识别时把顾客拍的原图一并存下来。
  /// 与体检/病历/过敏记录同一个字段名、同一种存法（COS 图片 URL 数组）。
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachments?: string[];
}
