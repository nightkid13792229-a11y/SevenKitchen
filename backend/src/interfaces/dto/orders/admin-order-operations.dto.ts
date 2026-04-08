import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Ship order request DTO
 */
export class ShipOrderDto {
  @ApiProperty({
    description:
      'Shipping carrier code (SF, YTO, STO, ZTO, YD, EMS, JD, POSTB)',
    example: 'SF',
  })
  @IsNotEmpty()
  @IsString()
  carrierCode!: string;

  @ApiProperty({
    description: 'Tracking number',
    example: 'SF1234567890',
  })
  @IsNotEmpty()
  @IsString()
  @MinLength(5, { message: 'Tracking number must be at least 5 characters' })
  trackingNumber!: string;
}

/**
 * Update admin remark request DTO
 */
export class UpdateOrderAdminRemarkDto {
  @ApiPropertyOptional({
    description: 'Internal admin remark for production notes',
    example: '客户要求本批次拆分打包，并优先安排上午制作',
    nullable: true,
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  adminRemark?: string | null;
}
