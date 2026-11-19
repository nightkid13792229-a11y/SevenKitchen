import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';

/**
 * 财务首页/月报的期间参数。
 *
 * - `month`：`YYYY-MM`，给了就查整月；
 * - 否则 `from` / `to`：`YYYY-MM-DD`（上海时区，闭区间），都缺省 = 本月至今。
 */
export class FinanceRangeQueryDto {
  @ApiPropertyOptional({
    description: '开始日期（YYYY-MM-DD，上海时区；早于起账日会被抬到起账日）',
    example: '2026-11-01',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: '开始日期必须是 YYYY-MM-DD' })
  from?: string;

  @ApiPropertyOptional({
    description: '结束日期（YYYY-MM-DD，上海时区，含当天）',
    example: '2026-11-19',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: '结束日期必须是 YYYY-MM-DD' })
  to?: string;

  @ApiPropertyOptional({
    description: '月份（YYYY-MM）；给了月份就忽略 from/to',
    example: '2026-11',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: '月份必须是 YYYY-MM' })
  month?: string;
}
