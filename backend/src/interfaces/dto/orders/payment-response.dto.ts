/**
 * Payment Response DTO
 * Phase 8.17: Payment Transaction Tracking
 */

import { ApiPropertyOptional } from '@nestjs/swagger';

export class PaymentDto {
  @ApiPropertyOptional({
    description: 'Payment method',
    example: 'WECHAT',
    nullable: true,
  })
  paymentMethod?: string | null;

  @ApiPropertyOptional({
    description: 'Transaction ID',
    example: 'MOCK_1734638400000_abc123',
    nullable: true,
  })
  transactionId?: string | null;

  @ApiPropertyOptional({
    description: 'Payment timestamp',
    example: '2025-01-20T10:30:00.000Z',
    nullable: true,
  })
  paidAt?: string | null;

  @ApiPropertyOptional({
    description: 'Payment status',
    example: 'SUCCESS',
    enum: ['PENDING', 'SUCCESS', 'FAILED'],
    nullable: true,
  })
  paymentStatus?: 'PENDING' | 'SUCCESS' | 'FAILED' | null;
}
