import { IsNotEmpty, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

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
