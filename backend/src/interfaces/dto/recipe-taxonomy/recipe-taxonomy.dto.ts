/**
 * 食谱需求分类 · 接口入参
 *
 * 只做形状校验；业务规则（叶子 / 停用 / 同分类唯一）在服务层，
 * 因为那些规则要在批量与单道两条路径上共用。
 */

import {
  ArrayNotEmpty,
  IsArray,
  IsBooleanString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ListTaxonomySeriesQueryDto {
  @IsOptional()
  @IsString()
  nodeId?: string;

  @IsOptional()
  @IsBooleanString()
  unclassified?: string;

  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsIn(['CATALOG', 'ORDER'])
  designMode?: 'CATALOG' | 'ORDER';

  @IsOptional()
  @IsIn(['DRAFT', 'PUBLIC', 'PRIVATE_CUSTOM'])
  businessStatus?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number;
}

export class ReplaceSeriesLinksDto {
  @IsArray()
  @IsString({ each: true })
  nodeIds!: string[];
}

export class BatchClassifyDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  seriesIds!: string[];

  @IsArray()
  @IsString({ each: true })
  nodeIds!: string[];
}

export class CreateTaxonomyNodeDto {
  @IsString()
  kindId!: string;

  @IsOptional()
  @IsString()
  parentId?: string | null;

  @IsString()
  @MaxLength(50)
  name!: string;

  @IsString()
  @MaxLength(200)
  definition!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sort?: number;
}

export class UpdateTaxonomyNodeDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  definition?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sort?: number;

  @IsOptional()
  @IsIn(['ACTIVE', 'DISABLED'])
  status?: 'ACTIVE' | 'DISABLED';
}
