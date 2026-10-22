import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import type { IngredientDraft } from '../../../application/ingredient-creation/ingredient-creation.types';
import type { PreparationState } from '../../../domain/ingredient-creation/preparation-state';
import {
  BASE_UNITS,
  INGREDIENT_TYPES,
  PREPARATION_STATES,
} from './ingredient-creation.constants';
import { NutritionEvidenceEntryDto } from './nutrition-evidence-entry.dto';

/** ⑤ 标准原料预填值。 */
export class CommitIngredientDto {
  @ApiProperty({ description: '原料名称', example: '鸡肝' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ description: '原料类型', enum: INGREDIENT_TYPES })
  @IsIn(INGREDIENT_TYPES)
  type!: IngredientDraft['type'];

  @ApiProperty({ description: '基准单位', enum: BASE_UNITS })
  @IsIn(BASE_UNITS)
  baseUnit!: IngredientDraft['baseUnit'];

  @ApiProperty({ description: '单位展示名', example: '克' })
  @IsString()
  @IsNotEmpty()
  unitDisplayLabel!: string;

  @ApiPropertyOptional({ description: 'CFCT 分类', nullable: true })
  @IsOptional()
  @IsString()
  cfctClass?: string | null;

  @ApiPropertyOptional({ description: '可食部比例', nullable: true })
  @IsOptional()
  @IsNumber()
  edibleYieldRate?: number | null;
}

/** ③ 一份营养档案（生 / 熟各最多一份）。 */
export class CommitProfileDto {
  @ApiProperty({ description: '生还是熟', enum: PREPARATION_STATES })
  @IsIn(PREPARATION_STATES)
  preparationState!: PreparationState;

  @ApiProperty({ description: '该档案的来源记录 id' })
  @IsString()
  @IsNotEmpty()
  sourceRecordId!: string;

  @ApiProperty({
    description: '证据账本',
    type: () => [NutritionEvidenceEntryDto],
  })
  @IsArray()
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => NutritionEvidenceEntryDto)
  entries!: NutritionEvidenceEntryDto[];

  @ApiPropertyOptional({ description: '备注', nullable: true })
  @IsOptional()
  @IsString()
  notes?: string | null;
}

/** `POST drafts/:id/commit`：一次性提交原料、档案与主档案下标。 */
export class CommitIngredientCreationDto {
  @ApiProperty({ type: () => CommitIngredientDto })
  @IsObject()
  @ValidateNested()
  @Type(() => CommitIngredientDto)
  ingredient!: CommitIngredientDto;

  @ApiProperty({
    description: '营养档案列表；同一 preparationState 最多一份',
    type: () => [CommitProfileDto],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => CommitProfileDto)
  // 生一份、熟一份，各最多一份：重复状态会让配方选择器出现两条同名档案。
  @ArrayUnique((profile: CommitProfileDto) => profile.preparationState)
  profiles!: CommitProfileDto[];

  @ApiProperty({ description: '主档案在 profiles 里的下标', example: 0 })
  @IsInt()
  @Min(0)
  primaryProfileIndex!: number;
}
