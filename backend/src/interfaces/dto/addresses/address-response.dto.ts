/**
 * Address Response DTOs
 */

import { ApiProperty } from '@nestjs/swagger';
import { AddressRegionDto } from './address-region.dto';

export class AddressDto {
  @ApiProperty({ description: 'Address ID', example: 'uuid' })
  id!: string;

  @ApiProperty({ description: 'User ID', example: 'uuid' })
  userId!: string;

  @ApiProperty({ description: 'Recipient name', example: '张三' })
  recipientName!: string;

  @ApiProperty({ description: 'Phone number', example: '13800138000' })
  phone!: string;

  @ApiProperty({
    description: 'Region (province, city, district)',
    type: AddressRegionDto,
  })
  region!: AddressRegionDto;

  @ApiProperty({ description: 'Detail address', example: '科技园南区123号' })
  detail!: string;

  @ApiProperty({ description: 'Is default address', example: false })
  isDefault!: boolean;
}

