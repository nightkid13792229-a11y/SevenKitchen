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
