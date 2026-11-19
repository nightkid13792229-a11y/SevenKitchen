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
import {
  MANUAL_INCOME_CATEGORIES,
  MANUAL_INCOME_ONLY_MESSAGE,
} from '../../../application/finance/finance-categories';
import type { FinanceIncomeCategory } from '../../../application/finance/finance-categories';
import { FINANCE_ACCOUNT_CODES } from '../../../application/finance/finance-accounts';

/**
 * 「记一笔」手工收支（设计文档 §5.3 / §6.2）。
 *
 * 金额只收正数、最多两位小数；方向由 `direction` 决定。
 * 支出填 `categoryId`（类别字典里的启用类别），收入填 `incomeCategory`，
 * 但手工收入只允许 `OTHER_INCOME` —— 线上/线下/补剂/定制食谱的收入由系统
 * 自动记录，手工标上去会和订单、手续费口径对不上。
 * `payerAccount` 是「钱从哪个账户进出」，缺省「我的微信」。
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
    description: '支出类别 id（类别字典；支出必填、必须启用；收入不传）',
    example: '3f1c2b4a-0000-0000-0000-000000000000',
  })
  @IsOptional()
  @IsString()
  @Length(1, 36)
  categoryId?: string;

  @ApiPropertyOptional({
    description: '出账/入账账户；缺省 PERSONAL_WECHAT（我的微信）',
    enum: [...FINANCE_ACCOUNT_CODES],
    default: 'PERSONAL_WECHAT',
  })
  @IsOptional()
  @IsIn([...FINANCE_ACCOUNT_CODES], { message: '账户不合法' })
  payerAccount?: string;

  @ApiPropertyOptional({
    description:
      '收入类别（收入必填；手工只允许 OTHER_INCOME，其余由系统自动记录）',
    enum: [...MANUAL_INCOME_CATEGORIES],
    example: 'OTHER_INCOME',
  })
  @IsOptional()
  @IsIn([...MANUAL_INCOME_CATEGORIES], {
    message: MANUAL_INCOME_ONLY_MESSAGE,
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
