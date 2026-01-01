/**
 * Recipe Metadata DTOs
 * DTOs for recipe metadata (enums/options)
 */

import { ApiProperty } from '@nestjs/swagger';

/**
 * Enum Option DTO
 */
export class EnumOptionDto {
  @ApiProperty({
    description: 'Enum value (code)',
    example: 'PUPPY',
  })
  value!: string;

  @ApiProperty({
    description: 'Display label (Chinese)',
    example: '幼犬',
  })
  label!: string;
}

/**
 * Life Stages Response DTO
 */
export class LifeStagesResponseDto {
  @ApiProperty({
    description: 'Array of life stage options',
    type: [EnumOptionDto],
  })
  data!: EnumOptionDto[];
}

/**
 * Health Tags Response DTO
 */
export class HealthTagsResponseDto {
  @ApiProperty({
    description: 'Array of health tag options',
    type: [EnumOptionDto],
  })
  data!: EnumOptionDto[];
}
