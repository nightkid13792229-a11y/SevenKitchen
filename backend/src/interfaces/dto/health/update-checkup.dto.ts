import {
  IsDateString,
  IsOptional,
  IsString,
  IsArray,
  IsUrl,
  IsIn,
} from 'class-validator';
import { CHECKUP_TYPES } from './create-checkup.dto';

export class UpdateCheckupDto {
  @IsOptional()
  @IsString()
  @IsIn(CHECKUP_TYPES)
  checkupType?: string;

  @IsOptional()
  @IsDateString()
  checkupDate?: string;

  @IsOptional()
  @IsString()
  findings?: string;

  @IsOptional()
  @IsString()
  recommendations?: string;

  @IsOptional()
  @IsString()
  veterinarian?: string;

  @IsOptional()
  @IsArray()
  @IsUrl({}, { each: true })
  attachments?: string[];
}
