import {
  IsArray,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { AllergyCertainty } from '@prisma/client';

/**
 * 新增过敏原记录（2026-10-04 第一期收紧）
 *
 * 改造前这里只有 `@IsString()`，于是：
 *   · 空串能存进去；
 *   · 长度没有上限，整段话都能写进来；
 *   · 首尾空白原样入库（"鸡肉" 与 "鸡肉 " 变成两条）。
 * 本地库里已经出现了 adasdasdasdasd 这类记录，就是这套宽松校验的结果。
 */

/** 过敏原名称上限，与词表 name 列宽（VARCHAR(40)）保持一致 */
export const ALLERGEN_MAX_LENGTH = 40;

const trim = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

export class CreateAllergyDto {
  @IsOptional()
  @IsUUID()
  dogId?: string; // Optional since it comes from URL parameter :dogId

  @IsString()
  @trim()
  @MaxLength(ALLERGEN_MAX_LENGTH, {
    message: `过敏原名称最多 ${ALLERGEN_MAX_LENGTH} 个字`,
  })
  allergen!: string;

  @IsOptional()
  @IsString()
  notes?: string;

  /**
   * 可信度。缺省 SUSPECTED（可疑）—— 见 schema 里 AllergyCertainty 的注释：
   * 宁可当"可疑"对待（会被食谱避开），也不能当"没这回事"。
   */
  @IsOptional()
  @IsEnum(AllergyCertainty)
  certainty?: AllergyCertainty;

  /** 来源：REPORT 报告 / OWNER 主人观察 / STAFF 员工录入 / ORDER 定制单 / PLAN 排查计划 */
  @IsOptional()
  @IsIn(['REPORT', 'OWNER', 'STAFF', 'ORDER', 'PLAN'])
  source?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachments?: string[];
}
