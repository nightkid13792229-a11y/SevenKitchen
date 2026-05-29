import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
} from 'class-validator';

export class CreateIngredientCreationJobDto {
  @IsString()
  requestText!: string;
}

export class IngredientCreationMessageDto {
  @IsString()
  content!: string;
}

export class UpdateIngredientCreationDraftDto {
  @IsOptional()
  @IsString()
  suggestedName?: string;

  @IsOptional()
  @IsString()
  unitDisplayLabel?: string | null;

  @IsOptional()
  @IsIn(['DAILY_PURCHASE', 'STOCK_REPLENISHMENT', 'HYBRID'])
  procurementStrategy?: 'DAILY_PURCHASE' | 'STOCK_REPLENISHMENT' | 'HYBRID';

  @IsOptional()
  @IsBoolean()
  diyEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  procurementEnabled?: boolean;

  @IsOptional()
  @IsString()
  notes?: string | null;
}

export class UpdateIngredientCreationDraftProfileDto {
  @IsOptional()
  @IsIn(['PRIMARY', 'SECONDARY'])
  role?: 'PRIMARY' | 'SECONDARY';

  @IsOptional()
  @IsString()
  suggestedDisplayNameZh?: string | null;

  @IsOptional()
  @IsString()
  preparationState?: string | null;

  @IsOptional()
  @IsString()
  preparationStateLabel?: string | null;

  @IsOptional()
  @IsString()
  ediblePortionLabel?: string | null;

  @IsOptional()
  @IsString()
  processingLabel?: string | null;

  @IsOptional()
  @IsString()
  agentRationale?: string | null;

  @ValidateIf((_, value) => value !== undefined)
  @Transform(({ value, obj }) =>
    value === '' || obj?.sortOrder === '' ? Number.NaN : value,
  )
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
