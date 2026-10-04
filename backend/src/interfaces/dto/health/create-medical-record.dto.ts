import {
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

/**
 * 病史状态。
 *
 * ⚠️ 必须与 Prisma 的 MedicalStatus 枚举保持一致。
 * 2026-10-01 修复：PENDING_CONFIRMATION 早在 2026-09-28 就加进了数据库
 * （顾客自述的疾病不再被系统臆断为慢性），但本枚举一直没同步，
 * 导致家长新增一条病史、不动状态下拉就直接保存时被这里拒掉（400）。
 */
export enum MedicalStatus {
  PENDING_CONFIRMATION = 'PENDING_CONFIRMATION',
  TREATING = 'TREATING',
  RECOVERED = 'RECOVERED',
  CHRONIC = 'CHRONIC',
}

export class CreateMedicalRecordDto {
  @IsOptional()
  @IsUUID()
  dogId?: string; // Optional since it comes from URL parameter :dogId

  @IsDateString()
  visitDate!: string;

  @IsString()
  chiefComplaint!: string;

  @IsString()
  diagnosis!: string;

  /// 化验数据原文（2026-10-02 新增）：这次就诊做的化验，数值单独一栏
  @IsOptional()
  @IsString()
  labValues?: string;

  /// 医嘱（2026-10-02 起语义收窄：医生交代回家要做的；表单标签就叫「医嘱」）
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
