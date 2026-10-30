import {
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

/** 抗体检测记录 · 修改（字段语义同 Create；`undefined` = 别动它） */
export class UpdateAntibodyTestDto {
  @IsOptional()
  @IsUUID()
  dogId?: string;

  @IsOptional()
  @IsDateString()
  testedAt?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targets?: string[];

  @IsOptional()
  @IsIn(['PASS', 'FAIL', 'UNKNOWN'])
  result?: 'PASS' | 'FAIL' | 'UNKNOWN';

  @IsOptional()
  @IsString()
  value?: string;

  @IsOptional()
  @IsString()
  unit?: string;

  /** ⚠️ 已废弃（2026-10-30 · #1）：复查日由系统按 1 年算；传了会被忽略。 */
  @IsOptional()
  @IsDateString()
  nextReviewAt?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachments?: string[];
}
