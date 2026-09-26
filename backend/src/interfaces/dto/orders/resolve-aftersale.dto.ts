import {
  IsEnum,
  IsString,
  IsOptional,
  IsDateString,
  IsInt,
  Min,
} from 'class-validator';

/**
 * DTO for resolving an aftersale request
 * Phase 9.1: Admin/staff resolves aftersale
 */
export class ResolveAftersaleDto {
  @IsEnum(['refunded', 'remade', 'reshipped', 'resolved'], {
    message:
      'Resolution type must be one of: refunded, remade, reshipped, resolved',
  })
  resolutionType!: 'refunded' | 'remade' | 'reshipped' | 'resolved';

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

  /**
   * 「免费补发」时的补发套数。不传时按原单套数全额补发。
   * 只补一部分（例如买 2 套坏了 1 套）时传具体套数。
   */
  @IsInt({ message: '补发套数必须是整数' })
  @Min(1, { message: '补发套数至少为 1' })
  @IsOptional()
  reshipSets?: number;
}
