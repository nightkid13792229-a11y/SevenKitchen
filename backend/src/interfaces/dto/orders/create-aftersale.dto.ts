import { IsEnum, IsString, IsNotEmpty, IsArray, IsOptional } from 'class-validator';
import { AftersaleType } from '../../../domain/order';

/**
 * DTO for creating an aftersale request
 * Phase 9.1: Customer applies for aftersale
 */
export class CreateAftersaleDto {
  @IsEnum(AftersaleType, {
    message: 'Type must be one of: REFUND, REMAKE, COMPLAINT',
  })
  type!: AftersaleType;

  @IsString()
  @IsNotEmpty({ message: 'Reason is required' })
  reason!: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  photos?: string[];
}
