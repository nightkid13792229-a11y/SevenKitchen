import { ApiProperty } from '@nestjs/swagger';

/**
 * Order statistics response DTO
 * Phase 9: Simplified statistics aligned with e-commerce standards
 */
export class AdminOrderStatsDto {
  @ApiProperty({ description: 'Total number of orders', example: 150 })
  total!: number;

  @ApiProperty({ description: 'Orders pending payment', example: 10 })
  pendingPayment!: number;

  @ApiProperty({
    description: 'Paid orders waiting for production',
    example: 20,
  })
  paid!: number;

  @ApiProperty({
    description:
      'Orders in production (includes scheduling, cooking, packaging)',
    example: 15,
  })
  inProduction!: number;

  @ApiProperty({ description: 'Shipped orders', example: 30 })
  shipped!: number;

  @ApiProperty({ description: 'Completed orders', example: 65 })
  completed!: number;

  @ApiProperty({ description: 'Cancelled orders', example: 5 })
  cancelled!: number;
}
