import { IsDateString, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator'

export class CreateWeightRecordDto {
  @IsOptional()
  @IsUUID()
  dogId?: string  // Optional since it comes from URL parameter :dogId

  @IsDateString()
  recordDate!: string

  @IsNumber()
  @Min(0)
  weightKg!: number

  @IsOptional()
  @IsString()
  note?: string

  @IsOptional()
  syncedToProfile?: boolean
}
