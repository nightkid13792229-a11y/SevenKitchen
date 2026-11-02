/**
 * 后台「员工新增的采购商品」清单的查询参数（2026-11-01）。
 *
 * 注意：**没有** `createdSource` —— 服务端写死只看员工新增的那些，
 * 免得前端传个空就把全部历史 SKU 都算成"员工新增"。
 */

import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class ProcurementSkuListQueryDto {
  @IsOptional()
  @IsString()
  ingredientId?: string;

  @IsOptional()
  @IsString()
  createdById?: string;

  /** YYYY-MM-DD */
  @IsOptional()
  @IsString()
  @Length(10, 10)
  createdFrom?: string;

  /** YYYY-MM-DD */
  @IsOptional()
  @IsString()
  @Length(10, 10)
  createdTo?: string;

  @IsOptional()
  @IsString()
  @Length(0, 100)
  keyword?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;
}
