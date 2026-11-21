import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * 补剂草稿接口的入参。
 *
 * 约定（spec §11）：草稿的 `payload` 是整份形状稳定的 JSON，由服务端
 * `normalizeSupplementDraftPayload` 再兜一层；`status` / `aiSnapshot` /
 * `finalized*` 都是服务端状态，**故意不声明** —— 控制器上的
 * `ValidationPipe({ whitelist: true })` 会把它们直接剥掉，不靠调用方自觉。
 */

/** `POST /supplement-drafts`：新建一张空草稿（名称可后补）。 */
export class CreateSupplementDraftDto {
  @ApiPropertyOptional({ description: '草稿名称（可空，AI 起草后会补）' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;
}

/** `PATCH /supplement-drafts/:id`：自动保存 name / payload / manualFields。 */
export class UpdateSupplementDraftDto {
  @ApiPropertyOptional({ description: '草稿名称' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiProperty({ description: '整份草稿载荷（服务端会按标准形状归一）' })
  @IsObject()
  payload!: object;

  @ApiPropertyOptional({
    description: '人工改过的字段路径（点路径，AI 重跑时不覆盖）',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  manualFields?: string[];

  @ApiPropertyOptional({
    description: '乐观锁：上次读到的草稿 updatedAt（ISO 字符串）',
  })
  @IsOptional()
  @IsString()
  expectedUpdatedAt?: string;
}

/** `POST /supplement-drafts/:id/ai-fill`：AI 起草/重填。两张图都必填。 */
export class AiFillSupplementDraftDto {
  @ApiProperty({ description: '商品正面图地址' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  frontImageUrl!: string;

  @ApiProperty({ description: '标签图地址' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  labelImageUrl!: string;

  @ApiPropertyOptional({
    description: '商品链接（可选，用来补价格/品牌/规格）',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  productUrl?: string;

  @ApiPropertyOptional({ description: '选品依据（原样留档，可空）' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  selectionNote?: string;
}

/** `POST /supplement-drafts/:id/finalize`：最终写入（可带乐观锁）。 */
export class FinalizeSupplementDraftDto {
  @ApiPropertyOptional({
    description: '乐观锁：上次读到的草稿 updatedAt（ISO 字符串）',
  })
  @IsOptional()
  @IsString()
  expectedUpdatedAt?: string;
}
