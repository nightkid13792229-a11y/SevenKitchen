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
import { ALLERGEN_MAX_LENGTH } from './create-allergy.dto';

/**
 * 修改过敏原记录（2026-10-04 第一期收紧）
 *
 * 两处修正：
 *   1. 校验与新增一致（去空白、限长）；
 *   2. `notes` 的"没传就清空"缺陷在 service 层修掉 ——
 *      改造前 `notes: dto.notes ?? null`，导致只改过敏原名称
 *      会把原来的说明悄悄抹掉。
 */
const trim = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

export class UpdateAllergyDto {
  @IsOptional()
  @IsUUID()
  dogId?: string;

  @IsOptional()
  @IsString()
  @trim()
  @MaxLength(ALLERGEN_MAX_LENGTH, {
    message: `过敏原名称最多 ${ALLERGEN_MAX_LENGTH} 个字`,
  })
  allergen?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsEnum(AllergyCertainty)
  certainty?: AllergyCertainty;

  @IsOptional()
  @IsIn(['REPORT', 'OWNER', 'STAFF', 'ORDER', 'PLAN'])
  source?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachments?: string[];
}
