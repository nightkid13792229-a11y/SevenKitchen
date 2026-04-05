import { IsBoolean, IsIn, IsObject, IsOptional, IsString } from 'class-validator';

export class TrackDogProfileEventDto {
  @IsString()
  eventName!: string;

  @IsIn(['create', 'edit'])
  mode!: 'create' | 'edit';

  @IsOptional()
  @IsString()
  dogId?: string;

  @IsOptional()
  @IsString()
  entrySource?: string;

  @IsOptional()
  @IsString()
  stepName?: string;

  @IsOptional()
  @IsString()
  moduleName?: string;

  @IsOptional()
  @IsBoolean()
  hasDraft?: boolean;

  @IsOptional()
  @IsString()
  calcStatus?: string;

  @IsOptional()
  @IsString()
  submitStatus?: string;

  @IsOptional()
  @IsObject()
  properties?: Record<string, any>;
}
