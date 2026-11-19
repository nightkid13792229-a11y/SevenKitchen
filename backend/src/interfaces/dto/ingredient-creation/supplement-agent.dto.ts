import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/**
 * 补剂的形态档位。
 *
 * **只到档位，不到具体盐名**：知识库里 `bisglycinate` / `proteinate` 各 0 段，
 * 让模型点名具体盐等于让它编。档位与 `docs/superpowers/specs/2026-11-20-*.md` §4.5 一致。
 */
export const SUPPLEMENT_FORM_LEVELS = [
  'ORGANIC_CHELATE',
  'INORGANIC_SALT',
  'OXIDE',
  'OTHER',
] as const;

export type SupplementFormLevel = (typeof SUPPLEMENT_FORM_LEVELS)[number];

export class CompareOffersDto {
  @ApiProperty({ description: '规范营养字段，如 minerals.copper', example: 'minerals.copper' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  nutrientKey!: string;

  @ApiProperty({ enum: SUPPLEMENT_FORM_LEVELS, description: '这次选定的形态档位' })
  @IsIn(SUPPLEMENT_FORM_LEVELS as unknown as string[])
  formLevel!: SupplementFormLevel;

  @ApiPropertyOptional({ description: '搜索词；不传则按营养素 + 档位组词', example: 'copper chelate' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  keyword?: string;

  @ApiPropertyOptional({ description: '比几瓶，默认 8，最多 12', default: 8 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  limit?: number;
}


export class FormAdviceDto {
  @ApiProperty({ description: '规范营养字段，如 minerals.copper', example: 'minerals.copper' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  nutrientKey!: string;

  @ApiPropertyOptional({ description: '展示名，如「铜」；不传则服务端按字段推' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  nutrientLabel?: string;

  @ApiPropertyOptional({ description: '一句补充背景（例如「狗肝铜偏高」）' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  question?: string;
}
