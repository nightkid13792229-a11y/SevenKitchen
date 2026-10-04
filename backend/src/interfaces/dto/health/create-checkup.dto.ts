import {
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreateCheckupDto {
  @IsOptional()
  @IsUUID()
  dogId?: string; // Optional since it comes from URL parameter :dogId

  @IsString()
  checkupType!: string;

  @IsDateString()
  checkupDate!: string;

  @IsOptional()
  @IsString()
  findings?: string;

  /// 化验数据原文（2026-10-02 新增）：化验单上的逐项数值，
  /// 与"医生写的结论"分开存，家长/营养师各看各的。
  @IsOptional()
  @IsString()
  labValues?: string;

  @IsOptional()
  @IsString()
  recommendations?: string;

  /// 备注（2026-10-01 第五期新增）。
  /// 此前只有病史表有 notes，合并成「病例」表单后"就诊能写备注、体检不能"，
  /// 说不通。数据库已同步加列。
  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  veterinarian?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachments?: string[];
}
