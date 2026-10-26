import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import type {
  CandidateRow,
  CreationStep,
  ExceptionRecord,
  FinalCheckResult,
  IngredientDraft,
  MergePlan,
  NutritionEvidenceEntry,
} from '../../../application/ingredient-creation/ingredient-creation.types';
import {
  INGREDIENT_CARD_FIELD_KEYS,
  type IngredientCardFieldKey,
} from '../../../domain/ingredient-creation/ingredient-card-fields';
import type { PreparationState } from '../../../domain/ingredient-creation/preparation-state';
import type { CoverageCategory } from '../../../domain/ingredient-creation/state-coverage';
import {
  BASE_UNITS,
  COVERAGE_CATEGORIES,
  CREATION_STEPS,
  INGREDIENT_TYPES,
  PREPARATION_STATES,
} from './ingredient-creation.constants';
import { NutritionEvidenceEntryDto } from './nutrition-evidence-entry.dto';

/**
 * 起手口径卡的可 patch 片段。
 *
 * `category` 是受控词表：这里用 `@IsIn` 挡住非法值，绝不能让
 * `NOT_A_CATEGORY` 之类的东西落进 payload —— 下游按类别算生熟清单与默认主档案，
 * 认不出类别时会静默退化成「其它」，主档案也跟着错。
 */
export class UpdateDraftIntakeDto {
  @ApiPropertyOptional({ description: '中文规范名' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional({ description: '英文名', nullable: true })
  @IsOptional()
  @IsString()
  nameEn?: string | null;

  @ApiPropertyOptional({ description: '别名', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  aliases?: string[];

  @ApiPropertyOptional({ description: '易混词', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  confusables?: string[];

  @ApiPropertyOptional({
    description: '原料类别',
    enum: COVERAGE_CATEGORIES,
  })
  @IsOptional()
  @IsIn(COVERAGE_CATEGORIES)
  category?: CoverageCategory;

  @ApiPropertyOptional({
    description: '必需的生熟档案',
    enum: PREPARATION_STATES,
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @IsIn(PREPARATION_STATES, { each: true })
  requiredStates?: PreparationState[];

  @ApiPropertyOptional({
    description: '建议补充的生熟档案',
    enum: PREPARATION_STATES,
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @IsIn(PREPARATION_STATES, { each: true })
  suggestedStates?: PreparationState[];

  @ApiPropertyOptional({ description: '备注', nullable: true })
  @IsOptional()
  @IsString()
  notes?: string | null;
}

/** ③ 一份已建好的营养档案（终检的覆盖判断与提交共用同一形状）。 */
export class UpdateDraftProfileDto {
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

/**
 * 草稿里「标准原料预填值」的校验口径。
 *
 * 为什么不再只拿 `IngredientDraft` 当类型：interface 在运行时不存在，
 * whitelist 一个键也看不见 —— 前端多传的脏键会原样落进 payload，长度、范围、
 * 枚举也没人挡。这里按字段契约把 30 项显式声明出来。
 *
 * 约定：
 * - 4 个必填项（名称 / 类型 / 基准单位 / 展示名）是建原料的最小信息；
 * - 其余全部可选：向导是分步填的，没填是 `undefined`，人清空过的是 `null`；
 *   `@IsOptional()` 对两者都跳过校验，正好就是「允许显式 null」；
 * - `0` 是合法值（0 元采购价、0 损耗），校验用 `@Min(0)` 而不是「非空」；
 * - 可食部存**比例** `edibleYieldRate`（0–1）；公共名 `edibleYieldPercent`
 *   （0–100）只用于页面展示与 `manualFields`，不是草稿字段（多传会被 whitelist 剥掉）。
 */
export class UpdateDraftIngredientDto implements IngredientDraft {
  // BASIC
  @ApiProperty({ description: '中文规范名', example: '冷冻三文鱼' })
  @IsString()
  @Length(1, 100)
  name!: string;

  @ApiPropertyOptional({ description: '英文名', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nameEn?: string | null;

  @ApiProperty({ description: '原料类型', enum: INGREDIENT_TYPES })
  @IsIn(INGREDIENT_TYPES)
  type!: IngredientDraft['type'];

  @ApiPropertyOptional({
    description: '原料类别',
    enum: COVERAGE_CATEGORIES,
    nullable: true,
  })
  @IsOptional()
  @IsIn(COVERAGE_CATEGORIES)
  category?: CoverageCategory | null;

  @ApiPropertyOptional({ description: '备注', nullable: true })
  @IsOptional()
  @IsString()
  notes?: string | null;

  // MEASURE
  @ApiProperty({ description: '基准单位', enum: BASE_UNITS })
  @IsIn(BASE_UNITS)
  baseUnit!: IngredientDraft['baseUnit'];

  @ApiProperty({ description: '展示名（如 克 / 毫升 / 片）' })
  @IsString()
  @Length(1, 50)
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
   * 可食部**比例**（0–1），不是百分数。
   *
   * 页面上的 75% 由前端换算成 0.75 再传；这里再挡一道 0–1，
   * 多除/少除一次 100 都能在接口层被拒，而不是悄悄写进库里。
   */
  @ApiPropertyOptional({
    description:
      '可食部比例（0–1）；百分数公共名 edibleYieldPercent 只用于页面',
    nullable: true,
    minimum: 0,
    maximum: 1,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  edibleYieldRate?: number | null;

  @ApiPropertyOptional({ description: '主要营养价值', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  mainNutrientsDesc?: string | null;

  // PURCHASE
  @ApiPropertyOptional({ description: '采购策略', nullable: true })
  @IsOptional()
  @IsString()
  procurementStrategy?: string | null;

  @ApiPropertyOptional({ description: '采购单位', nullable: true })
  @IsOptional()
  @IsString()
  purchaseUnit?: string | null;

  @ApiPropertyOptional({
    description: '采购单位换算成基准单位的倍数',
    nullable: true,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
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
  @MaxLength(200)
  brand?: string | null;

  @ApiPropertyOptional({ description: '规格', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  productModel?: string | null;

  @ApiPropertyOptional({ description: '采购渠道', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  purchaseChannel?: string | null;

  // STOCK（原料建完、有了库存记录才有；本阶段只读展示，仍允许回传保存）
  @ApiPropertyOptional({ description: '安全库存', nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  safetyStock?: number | null;

  @ApiPropertyOptional({ description: '补货点', nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  reorderPoint?: number | null;

  @ApiPropertyOptional({ description: '目标库存', nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  targetStock?: number | null;

  // USAGE
  @ApiPropertyOptional({ description: '是否用于 DIY', nullable: true })
  @IsOptional()
  @IsBoolean()
  diyEnabled?: boolean | null;

  @ApiPropertyOptional({ description: '添加时机', nullable: true })
  @IsOptional()
  @IsString()
  addTiming?: string | null;

  @ApiPropertyOptional({ description: '生产损耗率（0–1）', nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  productionLossRate?: number | null;

  @ApiPropertyOptional({ description: '标签分类', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

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

  // 人工改动标记：只收契约内的公共字段名（可食部用公共名 edibleYieldPercent）
  @ApiPropertyOptional({
    description: '人工审核时改过的字段（公共字段名）',
    enum: INGREDIENT_CARD_FIELD_KEYS,
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @IsIn(INGREDIENT_CARD_FIELD_KEYS, { each: true })
  manualFields?: IngredientCardFieldKey[];
}

/**
 * 草稿 payload 的可写入键。
 *
 * **故意不声明 `proposalHistory`**：`whitelist` 会在管道里把它剥掉；
 * 控制器与服务层再各剥一次，防止绕过管道直接调用时把 AI 提案历史整体覆盖。
 */
export class UpdateDraftPayloadDto {
  @ApiPropertyOptional({ type: () => UpdateDraftIntakeDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateDraftIntakeDto)
  intake?: UpdateDraftIntakeDto;

  @ApiPropertyOptional({ description: '候选列表' })
  @IsOptional()
  @IsArray()
  candidates?: CandidateRow[];

  @ApiPropertyOptional({ description: '缝合方案' })
  @IsOptional()
  @IsObject()
  mergePlan?: MergePlan;

  @ApiPropertyOptional({ description: '证据账本' })
  @IsOptional()
  @IsArray()
  evidence?: NutritionEvidenceEntry[];

  /** 已建好的营养档案：终检据此判断哪些生熟状态已经有档案。 */
  @ApiPropertyOptional({
    description: '已建好的营养档案',
    type: () => [UpdateDraftProfileDto],
  })
  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => UpdateDraftProfileDto)
  profiles?: UpdateDraftProfileDto[];

  @ApiPropertyOptional({ description: '终检结果' })
  @IsOptional()
  @IsObject()
  checks?: FinalCheckResult;

  @ApiPropertyOptional({
    description: '标准原料预填值',
    type: () => UpdateDraftIngredientDto,
  })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => UpdateDraftIngredientDto)
  ingredient?: UpdateDraftIngredientDto;

  @ApiPropertyOptional({ description: '人工例外' })
  @IsOptional()
  @IsObject()
  verify?: { exceptions: ExceptionRecord[] };
}

/** `PATCH drafts/:id`：推进站点，并浅合并本站 payload。 */
export class UpdateDraftDto {
  @ApiProperty({ description: '当前站点', enum: CREATION_STEPS })
  @IsIn(CREATION_STEPS)
  step!: CreationStep;

  @ApiProperty({ type: () => UpdateDraftPayloadDto })
  @IsObject()
  @ValidateNested()
  @Type(() => UpdateDraftPayloadDto)
  payload!: UpdateDraftPayloadDto;
}
