import { IsArray, IsDateString, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator'
import { MedicalStatus } from './create-medical-record.dto'

export class UpdateMedicalRecordDto {
  @IsOptional()
  @IsUUID()
  dogId?: string

  @IsOptional()
  @IsDateString()
  visitDate?: string

  @IsOptional()
  @IsString()
  chiefComplaint?: string

  @IsOptional()
  @IsString()
  diagnosis?: string

  @IsOptional()
  @IsString()
  treatment?: string

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  medications?: string[]

  @IsOptional()
  @IsEnum(MedicalStatus)
  status?: MedicalStatus

  @IsOptional()
  @IsDateString()
  followUpDate?: string

  @IsOptional()
  @IsString()
  veterinarian?: string

  @IsOptional()
  @IsString()
  notes?: string
}
