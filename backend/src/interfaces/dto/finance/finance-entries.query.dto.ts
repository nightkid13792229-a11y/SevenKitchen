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
