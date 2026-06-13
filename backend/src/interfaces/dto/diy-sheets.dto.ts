/**
 * DIY Sheet DTOs
 * DIY制作单相关数据传输对象
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsUUID,
  IsString,
  IsNumber,
  IsInt,
  Min,
  IsArray,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * 采购清单项DTO
 */
export class PurchaseListItemDto {
  @ApiProperty({ description: '原料名称' })
  name!: string;

  @ApiProperty({ description: '类型', enum: ['FOOD', 'SUPPLEMENT'] })
  type!: string;

  @ApiProperty({ description: '理论用量(克)' })
  theoreticalAmount!: number;

  @ApiProperty({ description: '实际用量(克)' })
  actualAmount!: number;

  @ApiProperty({ description: '损耗率' })
  lossRate!: number;

  @ApiProperty({ description: '显示单位' })
  displayUnit!: string;

  @ApiPropertyOptional({ description: '制备方法' })
  preparationMethod?: string;

  @ApiProperty({ description: '格式化显示 - 理论用量' })
  theoreticalAmountStr!: string;

  @ApiProperty({ description: '格式化显示 - 实际用量' })
  actualAmountStr!: string;

  @ApiProperty({ description: '损耗率显示' })
  lossRateStr!: string;
}

export class DIYSheetPackagePlanItemDto {
  @ApiProperty({ description: '每袋克数', example: 80 })
  @IsInt()
  @Min(1)
  packageSpecG!: number;

  @ApiProperty({ description: '该规格袋数', example: 10 })
  @IsInt()
  @Min(1)
  packageCount!: number;
}

/**
 * 创建DIY制作单DTO
 */
export class CreateDIYSheetDto {
  @ApiProperty({ description: '食谱ID', example: 'uuid' })
  @IsUUID()
  recipeId!: string;

  @ApiProperty({ description: '食谱名称', example: '鸡肉蔬菜配方' })
  @IsString()
  recipeName!: string;

  @ApiProperty({ description: '狗狗ID', example: 'uuid' })
  @IsUUID()
  dogId!: string;

  @ApiProperty({ description: '制作周期(天)', example: 7 })
  @IsInt()
  @Min(1)
  cycleDays!: number;

  @ApiProperty({ description: '每餐克数', example: 100 })
  @IsNumber()
  @Min(1)
  perMealG!: number;

  @ApiProperty({ description: '每日摄入克数', example: 300 })
  @IsNumber()
  @Min(1)
  dailyIntakeG!: number;

  @ApiPropertyOptional({
    description: '分装明细，支持多规格分装',
    type: [DIYSheetPackagePlanItemDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DIYSheetPackagePlanItemDto)
  packagePlan?: DIYSheetPackagePlanItemDto[];

  @ApiProperty({
    description: '采购清单',
    type: [PurchaseListItemDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseListItemDto)
  purchaseList!: PurchaseListItemDto[];

  @ApiPropertyOptional({ description: '制作流程' })
  @IsOptional()
  @IsString()
  productionSteps?: string;
}

/**
 * DIY制作单响应DTO
 */
export class DIYSheetResponseDto {
  @ApiProperty({ description: '制作单ID' })
  id!: string;

  @ApiProperty({ description: '食谱ID' })
  recipeId!: string;

  @ApiProperty({ description: '食谱名称' })
  recipeName!: string;

  @ApiProperty({ description: '狗狗ID' })
  dogId!: string;

  @ApiProperty({ description: '狗狗名称' })
  dogName!: string;

  @ApiProperty({ description: '制作周期(天)' })
  cycleDays!: number;

  @ApiProperty({ description: '每餐克数' })
  perMealG!: number;

  @ApiProperty({ description: '每日摄入克数' })
  dailyIntakeG!: number;

  @ApiPropertyOptional({
    description: '分装明细，支持多规格分装',
    type: [DIYSheetPackagePlanItemDto],
  })
  packagePlan?: DIYSheetPackagePlanItemDto[] | null;

  @ApiProperty({ description: '采购清单', type: [PurchaseListItemDto] })
  purchaseList!: PurchaseListItemDto[];

  @ApiPropertyOptional({ description: '制作流程' })
  productionSteps?: string;

  @ApiProperty({ description: '创建时间' })
  createdAt!: string;

  @ApiProperty({ description: '更新时间' })
  updatedAt!: string;
}
