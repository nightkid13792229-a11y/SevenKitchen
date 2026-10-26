import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import type { IngredientDraft } from '../../../application/ingredient-creation/ingredient-creation.types';
import { IngredientProcurementStrategy } from '../../../domain/ingredient/enums';
import type { SupplementAddTiming } from '../../../domain/ingredient/supplement-add-timing';
import type { PreparationState } from '../../../domain/ingredient-creation/preparation-state';
import {
  BASE_UNITS,
  COVERAGE_CATEGORIES,
  INGREDIENT_TYPES,
  PREPARATION_STATES,
} from './ingredient-creation.constants';
import { NutritionEvidenceEntryDto } from './nutrition-evidence-entry.dto';

/** 与 Prisma 的 `IngredientProcurementStrategy` 枚举保持一致。 */
const PROCUREMENT_STRATEGIES = Object.values(IngredientProcurementStrategy);

/** 与 `SupplementProperties.add_timing` 的受控词表一致。 */
const ADD_TIMINGS = [
  'BEFORE_MIXING',
  'BEFORE_MEAL',
] as const satisfies readonly SupplementAddTiming[];

/**
 * ⑤ 标准原料预填值。
 *
 * 与草稿的 `UpdateDraftIngredientDto` 共用同一份字段契约：26 个 `CREATABLE`
 * 字段全部收下；库存三项与标签（`AFTER_CREATE`）本阶段不提交、不写入。
 * 4 个 `AFTER_CREATE` 字段故意不声明，`whitelist` 会剥掉，服务层也不读。
 */
export class CommitIngredientDto implements IngredientDraft {
  // BASIC
  @ApiProperty({ description: '原料名称', example: '鸡肝' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ description: '英文名', nullable: true })
  @IsOptional()
  @IsString()
  nameEn?: string | null;

  @ApiProperty({ description: '原料类型', enum: INGREDIENT_TYPES })
  @IsIn(INGREDIENT_TYPES)
  type!: IngredientDraft['type'];

  @ApiPropertyOptional({
    description: '原料类别（判断必需生熟档案）',
    enum: COVERAGE_CATEGORIES,
    nullable: true,
  })
  @IsOptional()
  @IsIn(COVERAGE_CATEGORIES)
  category?: IngredientDraft['category'];

  @ApiPropertyOptional({ description: '备注', nullable: true })
  @IsOptional()
  @IsString()
  notes?: string | null;

  // MEASURE
  @ApiProperty({ description: '基准单位', enum: BASE_UNITS })
  @IsIn(BASE_UNITS)
  baseUnit!: IngredientDraft['baseUnit'];

  @ApiProperty({ description: '单位展示名（最多 50 字）', example: '克' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  unitDisplayLabel!: string;

  @ApiPropertyOptional({ description: '单块重量（g）', nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  weightG?: number | null;

  @ApiPropertyOptional({ description: '最大容量（g）', nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxCapacityG?: number | null;

  // NUTRITION
  @ApiPropertyOptional({ description: 'CFCT 分类', nullable: true })
  @IsOptional()
  @IsString()
  cfctClass?: string | null;

  /**
   * 可食部**比例**（0–1），不是百分数：前端把 75% 换算成 0.75 再传，
   * 服务端原样落 `properties.edible_yield_rate`，绝不再除一次 100。
   */
  @ApiPropertyOptional({ description: '可食部比例（0–1）', nullable: true })
  @IsOptional()
  @IsNumber()
  edibleYieldRate?: number | null;

  @ApiPropertyOptional({ description: '主要营养价值', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  mainNutrientsDesc?: string | null;

  // PURCHASE
  @ApiPropertyOptional({
    description: '采购策略',
    enum: PROCUREMENT_STRATEGIES,
    nullable: true,
  })
  @IsOptional()
  @IsIn(PROCUREMENT_STRATEGIES)
  procurementStrategy?: string | null;

  @ApiPropertyOptional({
    description: '采购单位（最多 50 字）',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  purchaseUnit?: string | null;

  @ApiPropertyOptional({
    description: '采购单位换算成基准单位的倍数（必须大于 0）',
    nullable: true,
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  purchaseToBaseRatio?: number | null;

  @ApiPropertyOptional({
    description: '当前采购价（元 / 采购单位）',
    nullable: true,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  currentPricePerPurchaseUnit?: number | null;

  @ApiPropertyOptional({ description: '品牌', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  brand?: string | null;

  @ApiPropertyOptional({ description: '规格', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  productModel?: string | null;

  @ApiPropertyOptional({ description: '采购渠道', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  purchaseChannel?: string | null;

  // USAGE
  @ApiPropertyOptional({ description: '是否用于 DIY', nullable: true })
  @IsOptional()
  @IsBoolean()
  diyEnabled?: boolean | null;

  @ApiPropertyOptional({
    description: '添加时机',
    enum: ADD_TIMINGS,
    nullable: true,
  })
  @IsOptional()
  @IsIn(ADD_TIMINGS)
  addTiming?: string | null;

  @ApiPropertyOptional({
    description: '生产损耗倍数（1–2，1.05 表示 5%）',
    nullable: true,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(2)
  productionLossRate?: number | null;

  // STORAGE
  @ApiPropertyOptional({ description: '保质期（月）', nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  shelfLifeMonths?: number | null;

  @ApiPropertyOptional({ description: '储存条件', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  storageCondition?: string | null;

  @ApiPropertyOptional({ description: '开封后效期（天）', nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  openedShelfLifeDays?: number | null;

  @ApiPropertyOptional({ description: '内容物是否油性', nullable: true })
  @IsOptional()
  @IsBoolean()
  isOilBased?: boolean | null;
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
