import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Length,
  Matches,
} from 'class-validator';
import { FinanceExpenseCategory as FinanceExpenseCategoryEnum } from '@prisma/client';
import { FINANCE_INCOME_CATEGORY_LABELS } from '../../../application/finance/finance-categories';
import type {
  FinanceExpenseCategory,
  FinanceIncomeCategory,
} from '../../../application/finance/finance-categories';

/**
 * 「记一笔」手工收支（设计文档 §5.3 / §6.2）。
 *
 * 金额只收正数、最多两位小数；方向由 `direction` 决定。
 * 支出填 `category`（`FinanceExpenseCategory` 枚举内），
 * 收入填 `incomeCategory`（`FINANCE_INCOME_CATEGORY_LABELS` 的 key）。
 * 服务层还会再校验一次，这里的装饰器只负责把明显非法的请求挡在控制器外。
 */
export class CreateManualEntryDto {
  @ApiProperty({
    description: '方向：收入 / 支出',
    enum: ['INCOME', 'EXPENSE'],
    example: 'EXPENSE',
  })
  @IsIn(['INCOME', 'EXPENSE'], { message: '方向必须是 INCOME 或 EXPENSE' })
  direction!: 'INCOME' | 'EXPENSE';

  @ApiProperty({
    description: '金额（元，正数，最多两位小数）',
    example: 399,
  })
  @IsNumber({ maxDecimalPlaces: 2 }, { message: '金额最多两位小数' })
  @IsPositive({ message: '金额必须大于 0' })
  amount!: number;

  @ApiProperty({
    description: '发生日（YYYY-MM-DD，上海时区；不早于起账日、不晚于今天）',
    example: '2026-11-05',
  })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: '发生日必须是 YYYY-MM-DD' })
  occurredAt!: string;

  @ApiPropertyOptional({
    description: '支出类别（支出必填；收入不传）',
    enum: Object.values(FinanceExpenseCategoryEnum),
    example: 'EQUIPMENT',
  })
  @IsOptional()
  @IsIn(Object.values(FinanceExpenseCategoryEnum), {
    message: '支出类别不合法',
  })
  category?: FinanceExpenseCategory;

  @ApiPropertyOptional({
    description: '收入类别（收入必填；支出不传）',
    enum: Object.keys(FINANCE_INCOME_CATEGORY_LABELS),
    example: 'OTHER_INCOME',
  })
  @IsOptional()
  @IsIn(Object.keys(FINANCE_INCOME_CATEGORY_LABELS), {
    message: '收入类别不合法',
  })
  incomeCategory?: FinanceIncomeCategory;

  @ApiPropertyOptional({
    description: '付款方：公司 / 个人',
    enum: ['COMPANY', 'PERSONAL'],
    default: 'PERSONAL',
  })
  @IsOptional()
  @IsIn(['COMPANY', 'PERSONAL'], {
    message: '付款方必须是 COMPANY 或 PERSONAL',
  })
  payerType?: 'COMPANY' | 'PERSONAL';

  @ApiPropertyOptional({ description: '个人付款时是谁（用户 id）' })
  @IsOptional()
  @IsString()
  @Length(1, 36)
  payerUserId?: string;

  @ApiProperty({
    description: '一句话说明（必填）',
    example: '封口机',
  })
  @IsString()
  @Length(1, 200)
  title!: string;

  @ApiPropertyOptional({ description: '备注', example: '淘宝下单' })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional({
    description: '凭证照片的 COS key 数组',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  proofKeys?: string[];
}

/** 改一笔：所有字段可选，服务层按「合并后的结果」重新校验 */
export class UpdateManualEntryDto extends PartialType(CreateManualEntryDto) {}

/** 作废一笔：必须写原因（保留在记录里，可追溯） */
export class VoidManualEntryDto {
  @ApiProperty({ description: '作废原因', example: '录错了金额' })
  @IsString()
  @Length(1, 200)
  reason!: string;
}
