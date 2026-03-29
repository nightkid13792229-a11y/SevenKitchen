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

export class IngredientItemDto {
  @ApiProperty({ example: ['uuid-of-chicken', 'uuid-of-chicken-v2'], type: [String] })
  ids!: string[];

  @ApiProperty({ example: '鸡肉' })
  name!: string;
}

export class IngredientGroupDto {
  @ApiProperty({ example: '禽肉类及制品' })
  category!: string;

  @ApiProperty({ type: [IngredientItemDto] })
  ingredients!: IngredientItemDto[];
}

export class FilterOptionsDto {
  @ApiProperty({
    type: [FilterOptionDto],
    description: 'Available life stages',
  })
  lifeStages!: FilterOptionDto[];

  @ApiProperty({
    type: [FilterOptionDto],
    description: 'Available health tags',
  })
  healthTags!: FilterOptionDto[];

  @ApiProperty({
    type: [FilterOptionDto],
    description: 'Available ingredient tags',
  })
  ingredientTags!: FilterOptionDto[];

  @ApiProperty({
    type: [IngredientGroupDto],
    description: 'Ingredients grouped by CFCT classification',
  })
  ingredientGroups!: IngredientGroupDto[];

  @ApiProperty({ example: 24, description: 'Total recipes count' })
  total!: number;
}
