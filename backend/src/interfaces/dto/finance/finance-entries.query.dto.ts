import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Min, Max } from 'class-validator';
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
    description: '按类别筛选（收入类别或支出分类的 code）',
    example: 'EQUIPMENT',
  })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({
    description: [
      '按付款方筛选：COMPANY = 公司账户，PERSONAL = 个人垫付（「我垫的」）',
      '口径：线上收款（公司微信商户号）= COMPANY，线下收款（含 OFFLINE 老标记）= PERSONAL；',
      '退款行沿用原单付款方（线上原路退回 = COMPANY，线下退款登记 = PERSONAL）；',
      '快递费行固定 COMPANY（公司付给快递）；手续费合计行没有付款方，不参与该筛选。',
    ].join(''),
    enum: ['COMPANY', 'PERSONAL'],
  })
  @IsOptional()
  @IsIn(['COMPANY', 'PERSONAL'], {
    message: '付款方必须是 COMPANY 或 PERSONAL',
  })
  payerType?: 'COMPANY' | 'PERSONAL';

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
