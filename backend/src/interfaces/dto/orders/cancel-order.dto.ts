/**
 * Cancel Order DTO
 * Phase 8.16: Order Cancellation Workflow
 */

import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class CancelOrderDto {
  @ApiProperty({
    description: 'Cancellation reason',
    example: 'Customer requested cancellation',
  })
  @IsString()
  @IsNotEmpty()
  reason!: string;
}
