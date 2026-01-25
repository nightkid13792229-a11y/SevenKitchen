import { IsArray, IsDateString, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator'

export enum AllergenType {
  FOOD = 'FOOD',
  ENVIRONMENTAL = 'ENVIRONMENTAL',
  MEDICATION = 'MEDICATION'
}

export enum Severity {
  MILD = 'MILD',
  MODERATE = 'MODERATE',
  SEVERE = 'SEVERE'
}

export enum ConfirmedBy {
  VET = 'VET',
  OWNER = 'OWNER'
}

export class CreateAllergyDto {
  @IsOptional()
  @IsUUID()
  dogId?: string  // Optional since it comes from URL parameter :dogId

  @IsString()
  allergen!: string

  @IsEnum(AllergenType)
  allergenType!: AllergenType

  @IsDateString()
  discoveryDate!: string

  @IsString()
  symptoms!: string

  @IsOptional()
  @IsEnum(Severity)
  severity?: Severity

  @IsOptional()
  @IsEnum(ConfirmedBy)
  confirmedBy?: ConfirmedBy

  @IsOptional()
  @IsString()
  treatment?: string

  @IsOptional()
  @IsString()
  notes?: string

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachments?: string[]
}
