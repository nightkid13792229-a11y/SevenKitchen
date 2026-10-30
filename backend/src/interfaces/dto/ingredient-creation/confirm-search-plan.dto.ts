import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { SEARCH_PLAN_LIBRARIES } from '../../../domain/ingredient-creation/search-plan';

/** 人可以在确认时改的一个搜索词。 */
export class SearchPlanKeywordDto {
  @ApiPropertyOptional({ description: '搜索词', example: '蛋清' })
  @IsString()
  @MaxLength(40)
  term!: string;

  @ApiPropertyOptional({ description: '语种标记', example: 'zh' })
  @IsString()
  @MaxLength(10)
  language!: string;
}

/**
 * `POST drafts/:id/search-plan/confirm`：人确认（可修改）AI 提交的检索方案。
 *
 * 只允许改「查什么」，不允许改状态与审计字段——那些由服务端按当前登录人写。
 */
export class ConfirmSearchPlanDto {
  @ApiPropertyOptional({
    description: '改后的搜索词；不传表示沿用 AI 提交的',
    type: [SearchPlanKeywordDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SearchPlanKeywordDto)
  keywords?: SearchPlanKeywordDto[];

  @ApiPropertyOptional({
    description: '改后的目标库；不传表示沿用 AI 提交的',
    enum: SEARCH_PLAN_LIBRARIES,
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @IsIn([...SEARCH_PLAN_LIBRARIES], { each: true })
  libraries?: string[];

  @ApiPropertyOptional({ description: '改后的来源记录 id' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  chosenRecordId?: string;

  @ApiPropertyOptional({ description: '改后的来源记录名' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  chosenRecordName?: string;
}
