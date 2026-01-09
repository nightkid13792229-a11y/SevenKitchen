/**
 * Address Region DTO
 * Represents province, city, district structure
 */

import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class AddressRegionDto {
  @ApiProperty({ description: 'Province', example: '广东省' })
  @IsString()
  @IsNotEmpty()
  province!: string;

  @ApiProperty({ description: 'City', example: '深圳市' })
  @IsString()
  @IsNotEmpty()
  city!: string;

  @ApiProperty({ description: 'District', example: '南山区' })
  @IsString()
  @IsNotEmpty()
  district!: string;
}

