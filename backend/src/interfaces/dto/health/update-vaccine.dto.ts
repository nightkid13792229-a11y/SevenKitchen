import {
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { VaccineStatus } from './create-vaccine.dto';

export class UpdateVaccineDto {
  @IsOptional()
  @IsUUID()
  dogId?: string;

  @IsOptional()
  @IsString()
  vaccineName?: string;

  @IsOptional()
  @IsDateString()
  vaccinationDate?: string;

  @IsOptional()
  @IsDateString()
  nextDueDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsEnum(VaccineStatus)
  status?: VaccineStatus;

  /// 报告原件（2026-10-01 新增）：顾客可以补传/删掉疫苗本的照片
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachments?: string[];
}
