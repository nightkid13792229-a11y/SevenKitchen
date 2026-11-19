import { Injectable } from '@nestjs/common';
import { DEFAULT_WECHAT_FEE_RATE } from './finance-fee';

/**
 * 微信支付手续费率（收入侧口径）。
 *
 * v1 固定常量 `0.006`（微信支付标准费率）：微信调整费率时改这里并发版。
 * 本期不做配置项 —— `GlobalConfig` 没有财务字段，不为一个数字加列做迁移
 * （设计文档 §4.3 / §10.5）；v2 再做成可配置。
 */
@Injectable()
export class FinanceFeeRateService {
  getFeeRate(): Promise<number> {
    return Promise.resolve(DEFAULT_WECHAT_FEE_RATE);
  }
}
