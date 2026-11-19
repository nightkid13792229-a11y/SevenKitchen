import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Min, Max } from 'class-validator';
import { FINANCE_ACCOUNT_CODES } from '../../../application/finance/finance-accounts';
import type { FinanceAccount } from '../../../application/finance/finance-accounts';
import { FinanceRangeQueryDto } from './finance-range.query.dto';

/**
 * 收支明细的查询参数。
 *
 * 期间规则与首页汇总完全一致（`month` 优先；否则 `from`/`to`；都缺省 = 本月至今），
 * 这里直接继承，避免两处各写一份日期校验。
 */
export class FinanceEntriesQueryDto extends FinanceRangeQueryDto {
  @ApiPropertyOptional({
    description: '只看收入或只看支出；缺省 = 全部',
    enum: ['INCOME', 'EXPENSE'],
  })
  @IsOptional()
  @IsIn(['INCOME', 'EXPENSE'], { message: '方向必须是 INCOME 或 EXPENSE' })
  direction?: 'INCOME' | 'EXPENSE';

  @ApiPropertyOptional({
    description: '按支出类别字典 id 筛选（收入类别没有字典 id）',
    example: '6f1c2a4e-...',
  })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({
    description: [
      '按账户筛选（五个固定账户）：MERCHANT=微信商户号，PERSONAL_WECHAT=我的微信，',
      'PERSONAL_ALIPAY=我的支付宝，PERSONAL_BANK=我的银行卡，CASH=现金。',
      '口径：线上收款/手续费固定 MERCHANT；线下收款按订单登记的账户；',
      '线下退款按退款登记账户；补剂/定制食谱线下按渠道推「我的微信」。',
    ].join(''),
    enum: FINANCE_ACCOUNT_CODES,
    example: 'PERSONAL_ALIPAY',
  })
  @IsOptional()
  @IsIn([...FINANCE_ACCOUNT_CODES], { message: '账户不合法' })
  account?: FinanceAccount;

  @ApiPropertyOptional({ description: '页码，从 1 开始', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    description: '每页条数，默认 50，上限 200',
    default: 50,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;
}
