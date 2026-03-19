import {
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export enum MedicalStatus {
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

  @IsOptional()
  @IsString()
  treatment?: string;

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
