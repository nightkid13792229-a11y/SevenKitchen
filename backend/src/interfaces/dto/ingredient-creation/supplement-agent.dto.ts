import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CompareOffersDto {
  @ApiProperty({ description: '规范营养字段，如 minerals.copper', example: 'minerals.copper' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  nutrientKey!: string;

  @ApiPropertyOptional({
    description:
      '这次选定的形态候选键（如 bisglycinate）。没有形态可问时可以不带——此时不做同档分组',
    example: 'bisglycinate',
  })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  formLevel?: string;

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


export class ReadLabelImagesDto {
  @ApiProperty({ description: '正面图地址（已上传到我们的图床）' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  frontImageUrl!: string;

  @ApiProperty({ description: '标签（成分表那一面）图地址' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  labelImageUrl!: string;
}
