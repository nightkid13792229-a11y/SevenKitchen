import { IsDateString, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator'
import { AllergenType, Severity, ConfirmedBy } from './create-allergy.dto'

export class UpdateAllergyDto {
  @IsOptional()
  @IsUUID()
  dogId?: string

  @IsOptional()
  @IsString()
  allergen?: string

  @IsOptional()
  @IsEnum(AllergenType)
  allergenType?: AllergenType

  @IsOptional()
  @IsDateString()
  discoveryDate?: string

  @IsOptional()
  @IsString()
  symptoms?: string

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
}
