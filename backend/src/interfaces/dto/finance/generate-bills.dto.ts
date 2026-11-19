/** 补生成固定费用账单（设计文档 §5.4「补生成本月」） */
export class GenerateBillsDto {
  /** 目标月份 YYYY-MM；缺省 = 本月 */
  month?: string;
}
