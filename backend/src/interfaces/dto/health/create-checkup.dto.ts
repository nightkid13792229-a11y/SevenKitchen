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
