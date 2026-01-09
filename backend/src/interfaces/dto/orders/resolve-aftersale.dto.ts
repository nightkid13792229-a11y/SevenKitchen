import { IsEnum, IsString, IsOptional } from 'class-validator';

/**
 * DTO for resolving an aftersale request
 * Phase 9.1: Admin/staff resolves aftersale
 */
export class ResolveAftersaleDto {
  @IsEnum(['refunded', 'remade', 'resolved'], {
    message: 'Resolution type must be one of: refunded, remade, resolved',
  })
  resolutionType!: 'refunded' | 'remade' | 'resolved';

  @IsString()
  @IsOptional()
  adminNote?: string;
}
