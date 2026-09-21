import { IsEnum, IsString, IsOptional, IsDateString } from 'class-validator';

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

  /**
   * 「安排重做」时的制作日期（YYYY-MM-DD）。
   * 重做单要进采购清单，必须带制作日期；未传时后端兜底为次日。
   */
  @IsDateString()
  @IsOptional()
  targetProductionDate?: string;
}
