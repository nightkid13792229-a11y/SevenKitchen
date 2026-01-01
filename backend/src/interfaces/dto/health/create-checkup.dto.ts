import { IsArray, IsDateString, IsOptional, IsString, IsUUID, IsIn } from 'class-validator'

export const CHECKUP_TYPES = [
  'ROUTINE',
  'PRE_PURCHASE',
  'SENIOR_WELLNESS',
  'PRE_ANESTHESIA',
  'EMERGENCY',
  'FOLLOW_UP'
] as const

export type CheckupType = typeof CHECKUP_TYPES[number]

export class CreateCheckupDto {
  @IsOptional()
  @IsUUID()
  dogId?: string  // Optional since it comes from URL parameter :dogId

  @IsString()
  @IsIn(CHECKUP_TYPES)
  checkupType!: string

  @IsDateString()
  checkupDate!: string

  @IsOptional()
  @IsString()
  findings?: string

  @IsOptional()
  @IsString()
  recommendations?: string

  @IsOptional()
  @IsString()
  veterinarian?: string

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachments?: string[]
}
