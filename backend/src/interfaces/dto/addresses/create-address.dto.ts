/**
 * Create Address DTO
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsBoolean,
  IsOptional,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { AddressRegionDto } from './address-region.dto';
import { Type } from 'class-transformer';

export class CreateAddressDto {
  @ApiProperty({ description: 'Recipient name', example: '张三' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  recipientName!: string;

  @ApiProperty({ description: 'Phone number', example: '13800138000' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  phone!: string;

  @ApiProperty({
    description: 'Region (province, city, district)',
    type: AddressRegionDto,
  })
  @ValidateNested()
  @Type(() => AddressRegionDto)
  region!: AddressRegionDto;

  @ApiProperty({ description: 'Detail address', example: '科技园南区123号' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  detail!: string;

  @ApiPropertyOptional({
    description: 'Set as default address',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

