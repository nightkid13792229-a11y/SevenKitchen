/**
 * Update Address DTO
 */

import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { AddressRegionDto } from './address-region.dto';
import { Type } from 'class-transformer';

export class UpdateAddressDto {
  @ApiPropertyOptional({ description: 'Recipient name', example: '张三' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  recipientName?: string;

  @ApiPropertyOptional({ description: 'Phone number', example: '13800138000' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  phone?: string;

  @ApiPropertyOptional({
    description: 'Region (province, city, district)',
    type: AddressRegionDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => AddressRegionDto)
  region?: AddressRegionDto;

  @ApiPropertyOptional({
    description: 'Detail address',
    example: '科技园南区123号',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  detail?: string;
}
