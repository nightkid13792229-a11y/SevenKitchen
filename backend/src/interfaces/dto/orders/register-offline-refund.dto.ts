import {
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** 线下退款方式（与 `order_offline_refund.method` 一致） */
export const OFFLINE_REFUND_METHOD_VALUES = [
  'WECHAT',
  'ALIPAY',
  'CASH',
  'OTHER',
] as const;

/**
 * 登记订单线下退款（设计文档 §4.2 / §6.6，Task 9）。
 *
 * 只适用于「已付款 + 线下收款」的鲜食订单；线上支付的退款走微信原路退回。
 * 一次登记一笔，同一订单累计（未作废）金额不能超过该单实收。
 */
export class RegisterOfflineRefundDto {
  @ApiProperty({
    description: '本次退款金额（元，最多两位小数）',
    example: 100.5,
  })
  @IsNumber({ maxDecimalPlaces: 2 }, { message: '退款金额最多两位小数' })
  @Min(0.01, { message: '退款金额必须大于 0' })
  amount!: number;

  @ApiProperty({
    description: '退款成功日 YYYY-MM-DD（财务按这一天归月）',
    example: '2026-11-05',
  })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: '退款日必须是 YYYY-MM-DD' })
  refundedAt!: string;

  @ApiProperty({
    description: '退款方式',
    enum: OFFLINE_REFUND_METHOD_VALUES,
    example: 'WECHAT',
  })
  @IsIn(OFFLINE_REFUND_METHOD_VALUES, {
    message: '退款方式必须是 WECHAT / ALIPAY / CASH / OTHER',
  })
  method!: (typeof OFFLINE_REFUND_METHOD_VALUES)[number];

  @ApiPropertyOptional({
    description: '备注',
    example: '顾客要求退部分餐费',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;

  @ApiPropertyOptional({
    description: '退款凭证（COS key），可选',
    type: [String],
    example: ['finance/proof/2026-11-05-wx.png'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  proofKeys?: string[];
}
