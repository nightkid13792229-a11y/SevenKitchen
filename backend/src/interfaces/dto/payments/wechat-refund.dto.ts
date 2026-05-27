import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateWechatRefundDto {
  @ApiProperty({ description: 'Refund amount in CNY', example: 12.5 })
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @ApiProperty({ description: 'Refund reason', example: '售后退款' })
  @IsString()
  reason!: string;

  @ApiProperty({
    description: 'Optional admin note',
    example: '客户申请退款，财务已审核',
    required: false,
  })
  @IsString()
  @IsOptional()
  adminNote?: string;
}
