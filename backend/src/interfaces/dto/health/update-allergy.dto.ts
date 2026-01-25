import { IsArray, IsOptional, IsString, IsUUID } from 'class-validator'

export class UpdateAllergyDto {
  @IsOptional()
  @IsUUID()
  dogId?: string

  @IsOptional()
  @IsString()
  allergen?: string

  @IsOptional()
  @IsString()
  notes?: string

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachments?: string[]
}
