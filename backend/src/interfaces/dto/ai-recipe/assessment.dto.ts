import { IsArray, IsObject, IsOptional, IsString } from 'class-validator';

export class CreateNutritionAssessmentDto {
  @IsString()
  dogId!: string;

  @IsOptional()
  @IsString()
  prompt?: string;

  @IsOptional()
  @IsObject()
  confirmedInputs?: Record<string, unknown>;
}

export class AddAssessmentEvidenceDto {
  @IsString()
  sourceType!: string;

  @IsString()
  title!: string;

  @IsOptional()
  @IsObject()
  extractedData?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  confirmedData?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  attachmentUrls?: string[];
}
