import { Injectable } from '@nestjs/common';
import { DEFAULT_WECHAT_FEE_RATE } from './finance-fee';

/**
 * 财务配置读取（目前只有手续费率一项）。
 *
 * ## 为什么现在是常量
 *
 * 计划 Task 5 要求费率来自配置键 `finance.wechatFeeRate`，缺省 `0.006`。
 * 实现前核对了 `prisma/schema.prisma` 的 `GlobalConfig`（`global_config` 表）：
 * **它没有任何财务字段，也没有可复用的键值配置表** —— 现有字段是
 * `laborHourlyRate`、`minOrderWeightG`、`targetMargin`、……、
 * `healthExtractionDailyLimit` 这一批；Task 2 的迁移同样没加费率列
 * （设计文档 §11 把「费率存哪里」留给了实现者）。
 *
 * 因此本期不臆造字段、也不擅自改库：`getFeeRate()` 返回
 * `DEFAULT_WECHAT_FEE_RATE`（6‰），把读取位置收敛在这一个方法里。
 * 将来补上 `global_config.finance_wechat_fee_rate`（或独立配置表）时，
 * 只改这里，汇总服务等调用方不用动。
 */
@Injectable()
export class FinanceConfigService {
  getFeeRate(): Promise<number> {
    return Promise.resolve(DEFAULT_WECHAT_FEE_RATE);
  }
}
