import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
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
import type { PreparationState } from '../../../domain/ingredient-creation/preparation-state';
import type { CoverageCategory } from '../../../domain/ingredient-creation/state-coverage';
import {
  COVERAGE_CATEGORIES,
  CREATION_STEPS,
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

  @ApiPropertyOptional({ description: '标准原料预填值' })
  @IsOptional()
  @IsObject()
  ingredient?: IngredientDraft;

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
