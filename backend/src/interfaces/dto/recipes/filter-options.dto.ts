/**
 * Filter Options Response DTO
 */

import { ApiProperty } from '@nestjs/swagger';

export class FilterOptionDto {
  @ApiProperty({ example: 'PUPPY' })
  value!: string;

  @ApiProperty({ example: '幼犬' })
  label!: string;

  @ApiProperty({ example: 12 })
  count!: number;
}

export class FilterOptionsDto {
  @ApiProperty({ type: [FilterOptionDto], description: 'Available life stages' })
  lifeStages!: FilterOptionDto[];

  @ApiProperty({ type: [FilterOptionDto], description: 'Available health tags' })
  healthTags!: FilterOptionDto[];

  @ApiProperty({ type: [FilterOptionDto], description: 'Available ingredient tags' })
  ingredientTags!: FilterOptionDto[];

  @ApiProperty({ example: 24, description: 'Total recipes count' })
  total!: number;
}
