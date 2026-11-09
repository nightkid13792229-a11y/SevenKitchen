import { BadRequestException } from '@nestjs/common';

export interface PurchaseGateList {
  id: string;
  status: string;
}

/**
 * 排产门禁：当天的订单需求采购单必须存在且全部完成。
 * 自动排单与手工建批次共用这一处判断，避免两条路宽严不一。
 */
export function assertPurchaseListsCompleted(
  lists: PurchaseGateList[],
  dateLabel: string,
): void {
  if (lists.length === 0) {
    throw new BadRequestException(`请先生成 ${dateLabel} 的采购清单`);
  }

  const pending = lists.filter((list) => list.status !== 'COMPLETED');
  if (pending.length > 0) {
    throw new BadRequestException(
      `请先完成 ${dateLabel} 的采购任务后再排产（还有 ${pending.length} 张未完成）`,
    );
  }
}
