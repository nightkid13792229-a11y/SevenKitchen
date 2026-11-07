/**
 * 制作单备注处理（2026-11-07）
 *
 * 背景：客服改价 / 代客下单曾经把一整行审计文本追加进 order.admin_remark，
 * 生产单打印时这段日志会被当成备注，既占版面又看不懂。
 * 现在审计已经拆到 order_operation_log；这里再兜一层：
 * 万一还有历史数据没迁移干净，打印前按标签整行剔除。
 *
 * 只认已知的系统标签，不做「所有方括号都删」——
 * 管理员手写的「[注意] 少放油」是正常备注，不能被误删。
 */

const SYSTEM_AUDIT_TAGS = ['[客服改价]', '[代客下单]'];

export function stripOperationLogLines(text?: string | null): string {
  if (!text) return '';

  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter(
      (line) => !SYSTEM_AUDIT_TAGS.some((tag) => line.startsWith(tag)),
    )
    .join('\n')
    .trim();
}

export function splitOrderRemarks(
  adminRemark?: string | null,
  customerNote?: string | null,
): { adminRemark: string; customerNote: string } {
  return {
    adminRemark: stripOperationLogLines(adminRemark),
    // 顾客备注是顾客自己写的，原样保留（过敏信息一个字都不能丢）
    customerNote: String(customerNote || '').trim(),
  };
}
