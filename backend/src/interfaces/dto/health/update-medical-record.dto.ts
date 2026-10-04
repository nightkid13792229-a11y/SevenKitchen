import {
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { MedicalStatus } from './create-medical-record.dto';

export class UpdateMedicalRecordDto {
  @IsOptional()
  @IsUUID()
  dogId?: string;

  @IsOptional()
  @IsDateString()
  visitDate?: string;

  @IsOptional()
  @IsString()
  chiefComplaint?: string;

  @IsOptional()
  @IsString()
  diagnosis?: string;

  /// 化验数据原文（2026-10-02 新增）
  @IsOptional()
  @IsString()
  labValues?: string;

  /// 医嘱 / 回家注意（2026-10-02 起语义收窄）
  @IsOptional()
  @IsString()
  treatment?: string;

  /// 这次做的检查（2026-10-02 新增）
  @IsOptional()
  @IsString()
  exams?: string;

  /// 体征：体温、体重、BCS 等（2026-10-02 新增）
  @IsOptional()
  @IsString()
  vitals?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  medications?: string[];

  @IsOptional()
  @IsEnum(MedicalStatus)
  status?: MedicalStatus;

  @IsOptional()
  @IsDateString()
  followUpDate?: string;

  @IsOptional()
  @IsString()
  veterinarian?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachments?: string[];
}
