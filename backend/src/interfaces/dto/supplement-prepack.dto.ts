/**
 * 预分装补剂 v2 DTO 骨架（2026-10-20）
 *
 * 只定义接口形状与校验；业务逻辑在 service。
 * 字段/模块新增必须先登记 docs/plans/2026-10-19-supplement-field-module-dictionary.md。
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsISO8601,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PackSupplementOrderDto } from './supplement-shop.dto';

export class UpdateSupplementAddressDto {
  @ApiProperty({ description: '新的收货地址 ID' })
  @IsUUID()
  addressId!: string;

  @ApiPropertyOptional({ description: '是否同时设为默认地址' })
  @IsOptional()
  @IsBoolean()
  setAsDefault?: boolean;
}

export class ScheduleSupplementOrderDto {
  @ApiProperty({ description: '分装日（YYYY-MM-DD，上海日历日）' })
  @IsISO8601()
  packingDate!: string;

  @ApiPropertyOptional({ description: '改期原因（管理员必填建议）' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiPropertyOptional({ description: '当天已满时是否允许超排' })
  @IsOptional()
  @IsBoolean()
  allowOverbook?: boolean;
}

export class ForcePackSupplementOrderDto extends PackSupplementOrderDto {
  @ApiProperty({ description: '强制分装原因' })
  @IsString()
  @MaxLength(500)
  reason!: string;
}

export class CreateSupplementAftersaleDto {
  @ApiProperty({ enum: ['REFUND', 'RESHIP', 'OTHER'] })
  @IsIn(['REFUND', 'RESHIP', 'OTHER'])
  requestType!: 'REFUND' | 'RESHIP' | 'OTHER';

  @ApiProperty({ description: '售后原因' })
  @IsString()
  @MaxLength(500)
  reason!: string;

  @ApiPropertyOptional({ type: [String], description: '凭证图片（选填）' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photos?: string[];

  @ApiPropertyOptional({ description: '申请退款金额（仅 REFUND；不填=全额）' })
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  amount?: number;
}

export class ResolveAftersaleDto {
  @ApiProperty({ enum: ['REFUND', 'RESHIP', 'REGISTER_ONLY', 'REJECT'] })
  @IsIn(['REFUND', 'RESHIP', 'REGISTER_ONLY', 'REJECT'])
  resolutionType!: 'REFUND' | 'RESHIP' | 'REGISTER_ONLY' | 'REJECT';

  @ApiPropertyOptional({ description: '退款金额（REFUND 时）' })
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  refundAmount?: number;

  @ApiPropertyOptional({ description: '处理说明' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @ApiPropertyOptional({ description: '驳回原因（REJECT 时）' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  rejectReason?: string;
}

export class OrderCenterQueryDto {
  @ApiPropertyOptional({ enum: ['FOOD', 'CUSTOM_RECIPE', 'SUPPLEMENT'] })
  @IsOptional()
  @IsIn(['FOOD', 'CUSTOM_RECIPE', 'SUPPLEMENT'])
  type?: 'FOOD' | 'CUSTOM_RECIPE' | 'SUPPLEMENT';

  @ApiPropertyOptional({
    enum: ['PENDING', 'PENDING_PAYMENT', 'IN_PROGRESS', 'TO_SHIP', 'SHIPPED', 'COMPLETED', 'CANCELLED'],
    description: '统一状态组；售后用 aftersale 单独筛选',
  })
  @IsOptional()
  @IsIn(['PENDING', 'PENDING_PAYMENT', 'IN_PROGRESS', 'TO_SHIP', 'SHIPPED', 'COMPLETED', 'CANCELLED'])
  status?:
    | 'PENDING'
    | 'PENDING_PAYMENT'
    | 'IN_PROGRESS'
    | 'TO_SHIP'
    | 'SHIPPED'
    | 'COMPLETED'
    | 'CANCELLED';

  @ApiPropertyOptional({ description: '日期范围开始（YYYY-MM-DD）' })
  @IsOptional()
  @IsISO8601()
  dateFrom?: string;

  @ApiPropertyOptional({ description: '日期范围结束（YYYY-MM-DD）' })
  @IsOptional()
  @IsISO8601()
  dateTo?: string;

  @ApiPropertyOptional({ enum: ['created', 'packing'], default: 'created' })
  @IsOptional()
  @IsIn(['created', 'packing'])
  dateField?: 'created' | 'packing';

  @ApiPropertyOptional({ description: '订单号 / 顾客姓名 / 手机号' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  keyword?: string;

  @ApiPropertyOptional({ description: '只看有未完结售后' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  aftersale?: boolean;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class ListSupplementAftersalesQueryDto {
  @ApiPropertyOptional({
    enum: ['PENDING', 'PROCESSING', 'RESOLVED', 'REJECTED', 'CANCELLED'],
  })
  @IsOptional()
  @IsIn(['PENDING', 'PROCESSING', 'RESOLVED', 'REJECTED', 'CANCELLED'])
  status?: string;

  @ApiPropertyOptional({ description: '售后单号 / 订单号' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  keyword?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class SupplementRefundListQueryDto {
  @ApiPropertyOptional({ enum: ['PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'ABNORMAL', 'CLOSED'] })
  @IsOptional()
  @IsIn(['PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'ABNORMAL', 'CLOSED'])
  status?: string;

  @ApiPropertyOptional({ description: '订单号 / 顾客' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  keyword?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class SupplementDashboardQueryDto {
  @ApiPropertyOptional({ description: '看板日期（YYYY-MM-DD，默认今天）' })
  @IsOptional()
  @IsISO8601()
  date?: string;
}
