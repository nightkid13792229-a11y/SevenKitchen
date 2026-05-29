import { ApiProperty } from '@nestjs/swagger';

/**
 * Order statistics response DTO
 * Phase 9: Simplified statistics aligned with e-commerce standards
 */
export class AdminOrderStatsDto {
  @ApiProperty({ description: 'Total number of orders', example: 150 })
  total!: number;

  @ApiProperty({
    description: 'Orders created today in Asia/Shanghai',
    example: 8,
  })
  todayNew!: number;

  @ApiProperty({
    description: 'Total amount of paid order statuses before refund adjustments',
    example: 12888.5,
  })
  paidRevenue!: number;

  @ApiProperty({ description: 'Orders pending payment', example: 10 })
  pendingPayment!: number;

  @ApiProperty({
    description: 'Paid orders waiting for production',
    example: 20,
  })
  paid!: number;

  @ApiProperty({
    description: 'Orders in production (cooking and packaging)',
    example: 15,
  })
  inProduction!: number;

  @ApiProperty({ description: 'Orders in purchasing', example: 6 })
  purchasing!: number;

  @ApiProperty({
    description: 'Orders freezing and waiting for shipment',
    example: 4,
  })
  freezing!: number;

  @ApiProperty({ description: 'Shipped orders', example: 30 })
  shipped!: number;

  @ApiProperty({ description: 'Completed orders', example: 65 })
  completed!: number;

  @ApiProperty({ description: 'Cancelled orders', example: 5 })
  cancelled!: number;

  @ApiProperty({ description: 'Orders in aftersale', example: 3 })
  aftersale!: number;
}
