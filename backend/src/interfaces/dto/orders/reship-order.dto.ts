import { IsString, IsOptional, IsInt, Min } from 'class-validator';

/**
 * 「一键补发」请求体（客服主动补发，不要求订单先进入售后流程）。
 *
 * 典型场景：顾客在微信上说"试吃装到货时已经化了"，
 * 客服不必让顾客先去小程序点申请售后，直接在后台点补发即可。
 */
export class ReshipOrderDto {
  /** 补发原因，会记在补发单备注里，便于事后追溯 */
  @IsString()
  @IsOptional()
  reason?: string;

  /**
   * 补发套数。不传时按原单套数全额补发；
   * 例如原单买了 2 套、只有 1 套出问题，就传 1。
   */
  @IsInt({ message: '补发套数必须是整数' })
  @Min(1, { message: '补发套数至少为 1' })
  @IsOptional()
  sets?: number;
}
