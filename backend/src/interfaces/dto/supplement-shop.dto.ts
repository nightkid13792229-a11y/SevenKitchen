/**
 * 补剂商城 DTO
 * DIY 制作单 → 一键购买补剂 → 后台分装 → 独立发货
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsISO8601,
  IsIn,
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

/** 报价/下单时的补剂行：客户端只提供 id 与用量，价格由服务端现算 */
export class SupplementQuoteLineDto {
  @ApiProperty({ description: '补剂原料 ID' })
  @IsUUID()
  ingredientId!: string;

  @ApiProperty({ description: '制作单上的用量（按补剂展示单位）', example: 22.7 })
  @IsNumber()
  @Min(0.0001)
  amount!: number;
}

export class SupplementQuoteRequestDto {
  @ApiProperty({ type: [SupplementQuoteLineDto], description: '补剂清单' })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => SupplementQuoteLineDto)
  lines!: SupplementQuoteLineDto[];

  /**
   * ⚠️ 下面两个字段必须声明在 DTO 上。
   * 控制器用了 `whitelist: true`，未声明的属性会被**静默丢掉** ——
   * 那样加量看起来"生效了"，实际份数永远是 1，而且没有任何报错，极难排查。
   */

  @ApiPropertyOptional({
    description:
      '加量份数（1 = 不加量）。每份 = 每个补剂多做一袋同样规格的小袋',
    default: 1,
    minimum: 1,
    maximum: 12,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  // 12 只是防呆上界；真正的上限来自后台配置，由服务端按制作单天数算出
  @Max(12)
  portionMultiplier?: number;

  @ApiPropertyOptional({
    description: '制作单覆盖的天数。加量要靠它算总天数与每天成本',
    minimum: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  cycleDays?: number;
}

export class CreateSupplementOrderDto extends SupplementQuoteRequestDto {
  @ApiProperty({ description: '收货地址 ID' })
  @IsUUID()
  addressId!: string;

  @ApiPropertyOptional({ description: '来源食谱 ID' })
  @IsOptional()
  @IsUUID()
  recipeId?: string;

  @ApiPropertyOptional({ description: '来源食谱名称' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  recipeName?: string;

  @ApiPropertyOptional({ description: '狗狗 ID' })
  @IsOptional()
  @IsUUID()
  dogId?: string;

  @ApiPropertyOptional({ description: '狗狗名称' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  dogName?: string;

  @ApiPropertyOptional({ description: '来源 DIY 制作单 ID' })
  @IsOptional()
  @IsUUID()
  diySheetId?: string;

  // cycleDays 已上移到 SupplementQuoteRequestDto（报价阶段就需要它算总天数）

  @ApiPropertyOptional({ description: '备注' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;
}

export class ListSupplementOrdersQueryDto {
  @ApiPropertyOptional({ description: '订单状态筛选' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: '关键词：订单号 / 收件人 / 手机号（仅后台）' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  keyword?: string;

  @ApiPropertyOptional({ description: '页码，从 1 开始', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: '每页条数', default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

// ---------------- 后台：分装 / 发货 / 收款 / 售后 ----------------

/** 单个袋子的分装结果 */
export class SupplementPackItemDto {
  @ApiProperty({ description: '订单行 ID' })
  @IsUUID()
  itemId!: string;

  @ApiPropertyOptional({ description: '批号（可选，便于追溯）' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  batchNo?: string;

  @ApiProperty({
    description: '原瓶到期日（ISO 日期）。标签效期 = min(原瓶到期日, 分装日 + 效期系数)',
    example: '2027-06-30',
  })
  @IsISO8601()
  sourceExpiryDate!: string;
}

export class PackSupplementOrderDto {
  @ApiProperty({
    type: [SupplementPackItemDto],
    description: '必须覆盖订单里全部袋子',
  })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => SupplementPackItemDto)
  items!: SupplementPackItemDto[];
}

export class ShipSupplementOrderDto {
  @ApiProperty({ description: '快递单号' })
  @IsString()
  @MaxLength(64)
  trackingNumber!: string;

  @ApiPropertyOptional({ description: '快递公司编码，如 SF / YTO / ZTO' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  carrierCode?: string;
}

export class ConfirmSupplementPaymentDto {
  @ApiPropertyOptional({ description: '外部交易号（线下转账可填写流水号，可留空）' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  transactionId?: string;
}

export class CancelSupplementOrderDto {
  @ApiPropertyOptional({ description: '取消原因' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}

export class RefundSupplementOrderDto {
  @ApiPropertyOptional({
    description: '退款金额（元）。不填则全额退款',
    example: 31.6,
  })
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  amount?: number;

  @ApiProperty({ description: '退款原因', example: '破损' })
  @IsString()
  @MaxLength(200)
  reason!: string;
}

export class ReshipSupplementOrderDto {
  @ApiProperty({ description: '补发原因', example: '发错货' })
  @IsString()
  @MaxLength(200)
  reason!: string;
}

export class SupplementAftersaleDto {
  @ApiProperty({ description: '售后类型', enum: ['REFUND', 'RESHIP'] })
  @IsIn(['REFUND', 'RESHIP'])
  type!: 'REFUND' | 'RESHIP';

  @ApiProperty({ description: '售后原因（缺货 / 发错 / 破损 / 量不对 / 用户取消…）' })
  @IsString()
  @MaxLength(200)
  reason!: string;
}
