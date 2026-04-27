import {
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
} from 'class-validator';

export class UpdateCheckupDto {
  @IsOptional()
  @IsString()
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
  @IsString({ each: true })
  attachments?: string[];
}
