import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class BatchReplaceItemOverrideDto {
  @IsString()
  recipeItemId!: string;

  /** 食材类：每份食谱克数（优先于 ratioPercent） */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  exampleWeight?: number;

  /** 食材类：比例百分比 */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  ratioPercent?: number;

  /** 补剂类：营养目标值 */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  nutrientTargetValue?: number;
}

export class BatchReplaceRequestDto {
  @IsString()
  toIngredientId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  recipeIds!: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BatchReplaceItemOverrideDto)
  itemOverrides?: BatchReplaceItemOverrideDto[];
}
