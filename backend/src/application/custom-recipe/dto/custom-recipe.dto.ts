/**
 * Custom Recipe DTOs
 * Data Transfer Objects for custom recipe API
 */

import {
  IsString,
  IsArray,
  IsOptional,
  IsDateString,
  IsBoolean,
  IsEnum,
  IsInt,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  TargetGoal,
  CustomAttachmentType,
  AllergyAnswerStatus,
} from '@prisma/client';
import { MAX_MULTI_RECIPE_QUANTITY } from '../custom-recipe-config.service';

/**
 * 本单上传的过敏检测报告草稿（2026-10-19）。
 *
 * 为什么放在订单而不是直接写狗狗档案：
 * 定制页在上传报告时还没付款，不能因为一张最终可能被放弃的单
 * 就改狗狗的医疗档案。付款成功后由后端统一转成正式报告。
 */
export class AllergyReportDraftResultDTO {
  @ApiProperty({ description: '过敏原' })
  @IsString()
  @MaxLength(40)
  allergen!: string;

  @ApiPropertyOptional({ description: '报告结论等级' })
  @IsOptional()
  @IsString()
  level?: string;

  @ApiPropertyOptional({ description: '报告备注' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  notes?: string;
}

export class AllergyReportDraftDTO {
  @ApiPropertyOptional({ description: '报告原件 URL（照片/文档）' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachments?: string[];

  @ApiPropertyOptional({ description: 'COS 文件 key，取消/超时清理用' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachmentKeys?: string[];

  @ApiPropertyOptional({ description: '检测日期 YYYY-MM-DD' })
  @IsOptional()
  @IsString()
  testDate?: string;

  @ApiPropertyOptional({ description: '检测方式' })
  @IsOptional()
  @IsString()
  testMethod?: string;

  @ApiPropertyOptional({ description: '报告 OCR 原文' })
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  ocrText?: string;

  @ApiPropertyOptional({ description: '报告摘要' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  summary?: string;

  @ApiPropertyOptional({ description: '报告结论', type: [AllergyReportDraftResultDTO] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AllergyReportDraftResultDTO)
  results?: AllergyReportDraftResultDTO[];
}

export class SubmitCustomRecipeOrderDTO {
  @ApiProperty({ description: 'Dog ID' })
  @IsString()
  dogId!: string;

  @ApiProperty({ description: 'Target goal', enum: TargetGoal })
  @IsEnum(TargetGoal)
  targetGoal!: TargetGoal;

  @ApiPropertyOptional({ description: 'Allergies' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allergies?: string[];

  /**
   * 过敏原自由文本（2026-10-19）。
   *
   * 顾客在定制页只填一段文本；报告 AI 识别的结果也回填到这里。
   * 订单快照原样保存，设计器显示原文，营养师 AI 辅助 + 人工核对。
   */
  @ApiPropertyOptional({ description: '过敏原自由文本（顾客填写/报告识别回填）' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  allergyText?: string;

  @ApiPropertyOptional({
    description: '本单上传的检测报告草稿（付款后才写狗狗档案）',
    type: [AllergyReportDraftDTO],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AllergyReportDraftDTO)
  allergyReportDrafts?: AllergyReportDraftDTO[];

  @ApiPropertyOptional({ description: 'Medical conditions' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  medicalConditions?: string[];

  @ApiPropertyOptional({ description: 'Additional notes' })
  @IsString()
  @IsOptional()
  additionalNotes?: string;

  // ===== 2026-10-18 新增：需求 2.3.4「第二段：补充（只问档案里没有的）」=====

  @ApiPropertyOptional({
    description: '目前在喂什么（选项 code，来自 custom_recipe_current_food）',
  })
  @IsOptional()
  @IsString()
  currentFoodMain?: string;

  @ApiPropertyOptional({
    description: '顾客对有没有过敏的明确回答；后端会校验必填',
    enum: AllergyAnswerStatus,
  })
  @IsOptional()
  @IsEnum(AllergyAnswerStatus)
  allergyStatus?: AllergyAnswerStatus;

  @ApiPropertyOptional({
    description: '客户端提交幂等键；同一顾客重复提交同一键返回同一张订单',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  clientRequestId?: string;

  @ApiPropertyOptional({ description: '选「其他」时手填的当前食物' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  currentFoodOther?: string;

  @ApiPropertyOptional({
    description: '为什么想换（选项 code 数组，来自 custom_recipe_change_reason）',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  changeReasons?: string[];

  @ApiPropertyOptional({ description: '选「其他」时手填的原因' })
  @IsOptional()
  @IsString()
  changeReasonOther?: string;

  @ApiPropertyOptional({
    description: '最近肠胃情况（选项 code 数组，来自 custom_recipe_stomach）',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  stomachConditions?: string[];

  @ApiPropertyOptional({ description: '选「其他」时手填的肠胃情况' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  stomachOther?: string;

  @ApiPropertyOptional({ description: 'Preferred ingredients' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  preferredIngredients?: string[];

  @ApiPropertyOptional({ description: 'Disliked ingredients' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dislikedIngredients?: string[];

  @ApiPropertyOptional({ description: 'Attachment URLs' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachmentUrls?: string[];

  /** 备注附件的 COS key，与 attachmentUrls 一一对应；落库时优先存 key */
  @ApiPropertyOptional({ description: 'Attachment COS keys' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachmentKeys?: string[];

  /**
   * 预约（开工）日期。
   *
   * 2026-10-04 起**由系统自动排期**（老板口径 1）：顾客不再选日期，
   * 服务端从今天起找最近的可接单工作日，当天满/遇公众假期就顺延。
   * 老版本小程序仍会带这个字段，因此保留为可选，但值不再采信。
   */
  @ApiPropertyOptional({ description: '预约日期（已废弃：由系统自动排期）' })
  @IsOptional()
  @IsDateString()
  scheduledDate?: string;

  @ApiProperty({ description: 'Sync to health profile' })
  @IsBoolean()
  syncToHealthProfile!: boolean;

  /**
   * 顾客是否勾选了「需要健康管理」。
   *
   * 2026-09-28 新增：此前小程序把这个勾选折进 targetGoal（改写成 HEALTH_SUPPORT），
   * 于是「减重 + 需要健康管理」会把减重目标**丢掉**。老板口径是
   * 「减重/维持/增重以顾客选的为准」，所以必须分开传。
   */
  @ApiPropertyOptional({ description: 'Needs health management' })
  @IsOptional()
  @IsBoolean()
  needsHealthManagement?: boolean;

  // ===== 2026-10-20 多份购买 · 第一阶段 =====

  /**
   * 本单份数（1–5），不传按 1 份处理。
   *
   * 金额、折扣一律由后端重新报价，DTO 里**不接收任何金额字段** ——
   * 前端传来的价格不能作为支付依据。
   */
  @ApiPropertyOptional({
    description: `份数（1–${MAX_MULTI_RECIPE_QUANTITY}，默认 1）`,
    minimum: 1,
    maximum: MAX_MULTI_RECIPE_QUANTITY,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_MULTI_RECIPE_QUANTITY)
  recipeQuantity?: number;

  /**
   * 顾客希望轮换的主蛋白 code；留空表示交给营养师搭配。
   *
   * 只做「数量 = 份数、不重复、不为空」的选择器校验；
   * 是否与过敏冲突由营养师人工把关（设计文档第 10 节）。
   */
  @ApiPropertyOptional({
    description: '希望轮换的主蛋白 code 数组（可留空）',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requestedProteinCodes?: string[];
}

export class UpdateOrderStatusDTO {
  @ApiProperty({ description: 'New status' })
  @IsString()
  status!: string;
}

export class CreateRecipeDTO {
  @ApiProperty({ description: 'Recipe name' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ description: 'Description' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: 'Cover image URL' })
  @IsString()
  @IsOptional()
  coverImageUrl?: string;

  @ApiPropertyOptional({ description: 'Nutrition target' })
  nutritionTarget?: any;

  @ApiPropertyOptional({ description: 'Recipe items' })
  items?: any[];

  @ApiPropertyOptional({ description: 'Production steps' })
  @IsString()
  @IsOptional()
  productionSteps?: string;

  @ApiPropertyOptional({ description: 'Detail images' })
  @IsArray()
  @IsOptional()
  detailImages?: string[];

  @ApiPropertyOptional({ description: 'Video URL' })
  @IsString()
  @IsOptional()
  videoUrl?: string;

  /**
   * 营养标准。
   *
   * 2026-09-28 修复：后台表单里一直有这个下拉框（FEDIAF_2021 / AAFCO_2019 /
   * GB_T_31216），但它既没进这个 DTO、也没进前端提交的载荷 —— 选了等于没选，
   * 后端永远写死。这里补上，默认取当前在用的 FEDIAF_2025。
   */
  @ApiPropertyOptional({ description: 'Nutrition standard' })
  @IsString()
  @IsOptional()
  nutritionStandard?: string;

}

export class UpdateScheduleDTO {
  @ApiProperty({ description: 'Date from (YYYY-MM-DD)' })
  @IsDateString()
  dateFrom!: string;

  @ApiProperty({ description: 'Date to (YYYY-MM-DD)' })
  @IsDateString()
  dateTo!: string;

  @ApiProperty({ description: 'Capacity per day' })
  capacity!: number;

  @ApiPropertyOptional({ description: 'Skip public holidays' })
  @IsBoolean()
  @IsOptional()
  skipPublicHolidays?: boolean;

  @ApiPropertyOptional({ description: 'Include weekends' })
  @IsBoolean()
  @IsOptional()
  includeWeekends?: boolean;
}

export class ScheduleInfo {
  date!: string;
  isAvailable!: boolean;
  isPublicHoliday!: boolean;
  remainingCapacity!: number;
  bookedCount!: number;
}

export class CustomRecipeOrderResponseDTO {
  orderId!: string;
  dogId!: string;
  dogName!: string;
  targetGoal!: TargetGoal;
  scheduledDate!: string;
  estimatedDeliveryDate?: string;
  status!: string;
  amount!: number;
  recipeId?: string;
  createdAt!: string;
}

export class CustomRecipeOrderDetailResponseDTO extends CustomRecipeOrderResponseDTO {
  customer!: {
    id: string;
    nickname: string;
    phone?: string;
    wechatOpenid?: string;
  };
  dog!: {
    id: string;
    name: string;
    breedName: string;
    age: number;
    currentWeightKg: number;
    bcsScore: number;
    activityLevel: string;
  };
  allergies!: string[];
  /** 过敏原自由文本（2026-10-19）：订单快照，老订单为 null */
  allergyText?: string | null;
  /** 本单上传的检测报告草稿（付款后转正式报告） */
  allergyReportDrafts?: AllergyReportDraftDTO[];
  medicalConditions!: string[];
  preferredIngredients!: string[];
  dislikedIngredients!: string[];
  additionalNotes?: string;
  attachments!: Array<{
    id: string;
    fileName: string;
    fileUrl: string;
    fileSize: number;
    fileType: CustomAttachmentType;
    uploadedAt: string;
  }>;
  paymentConfirmedAt?: string;
  inProgressAt?: string;
  deliveredAt?: string;
}
